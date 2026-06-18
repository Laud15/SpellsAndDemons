import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {computeStats, delay} from "../engine/combat";
import type {GameEnemy, GamePlayer} from "../types";
import {processEnemyTurns} from "./performAction";

const db = getFirestore();

export const levelUp = onCall(
  {region: "europe-west1"},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Not authenticated");
    }
    const {gameId, stat} = request.data;

    if (!gameId || !stat) {
      throw new HttpsError("invalid-argument", "Missing data");
    }

    const validStats = ["will", "knowledge", "intuition", "cunning"];
    if (!validStats.includes(stat)) {
      throw new HttpsError("invalid-argument", "Invalid stat");
    }

    const gameRef = db.collection("games").doc(gameId);

    // -----------------------------------------------------------------------
    // STEP 1 — apply this player's stat increase inside a transaction.
    // The transaction guarantees that two players levelling up at the same
    // time can't overwrite each other: each read-modify-write is atomic.
    // We return whether combat should start (this player was the last one).
    // -----------------------------------------------------------------------
    const shouldStartCombat = await db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      if (!gameSnap.exists) {
        throw new HttpsError("not-found", "Game not found");
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const game = gameSnap.data()!;

      if (game.phase !== "level_up") {
        throw new HttpsError("failed-precondition", "Not level up phase");
      }
      if (!game.pendingLevelUps.includes(uid)) {
        throw new HttpsError("permission-denied", "No level up pending");
      }

      const players: GamePlayer[] = game.players.map((p: GamePlayer) => ({
        ...p,
        hasAttacked: false,
      }));

      const playerIndex = players.findIndex((p) => p.uid === uid);
      const player = players[playerIndex];

      const newStats = {
        ...player.stats,
        [stat]: player.stats[stat as keyof typeof player.stats] + 1,
        level: player.stats.level + 1,
      };
      const computed = computeStats(
        newStats.will, newStats.knowledge,
        newStats.intuition, newStats.cunning
      );
      newStats.maxHp = computed.maxHp;
      newStats.maxEnergy = computed.maxEnergy;
      players[playerIndex] = {...player, stats: newStats};

      const pendingLevelUps = game.pendingLevelUps.filter(
        (id: string) => id !== uid
      );

      // Always write the stat increase. If others still need to level up we
      // keep phase "level_up"; if this was the last one we set a temporary
      // flag and start combat OUTSIDE the transaction (step 2).
      if (pendingLevelUps.length > 0) {
        transaction.update(gameRef, {
          players,
          pendingLevelUps,
          phase: "level_up",
          lastAttackingEnemies: [],
        });
        return false; // combat does not start yet
      } else {
        transaction.update(gameRef, {
          players,
          pendingLevelUps,
          // keep phase level_up for now; step 2 will switch to player_turn
        });
        return true; // this player was the last -> start combat
      }
    });

    // -----------------------------------------------------------------------
    // STEP 2 — if every player has levelled up, run the enemy turns and start
    // the next player phase. This is outside the transaction because
    // processEnemyTurns does Firestore reads and delays, which transactions
    // don't allow.
    // -----------------------------------------------------------------------
    if (!shouldStartCombat) {
      return {success: true};
    }

    const gameSnap = await gameRef.get();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const game = gameSnap.data()!;

    let players: GamePlayer[] = game.players;
    let enemies = game.enemies;
    let currentActorIndex = game.currentActorIndex || 0;
    let phase = "player_turn";

    const result = await processEnemyTurns(
      game.turnOrder, 0, players, enemies
    );
    players = result.players;
    enemies = result.enemies;
    currentActorIndex = result.nextIndex;
    const actingEnemyIds = result.actingEnemyIds;
    await delay(1500);

    const allPlayersDead = players.every((p) => p.stats.hp <= 0);
    if (allPlayersDead) {
      phase = "game_over";
      // assign points to every player, same formula as performAction
      const pointsEach = Math.floor(
        (game.winsCount * 10) / game.players.length
      );
      await Promise.all(
        game.players.map((p: GamePlayer) =>
          db.collection("users").doc(p.uid).update({
            score: FieldValue.increment(pointsEach),
          })
        )
      );
    } else {
      if (currentActorIndex >= game.turnOrder.length) {
        currentActorIndex = game.turnOrder.findIndex(
          (id: string) => players.some(
            (p: GamePlayer) => p.uid === id && p.stats.hp > 0)
        );
        if (currentActorIndex === -1) currentActorIndex = 0;
      }
      const actorAtIndex = game.turnOrder[currentActorIndex];
      const isActorAlivePlayer = players.some(
        (p) => p.uid === actorAtIndex && p.stats.hp > 0
      );
      if (!isActorAlivePlayer) {
        currentActorIndex = game.turnOrder.findIndex(
          (id: string) => players.some((p) => p.uid === id && p.stats.hp > 0)
        );
        if (currentActorIndex === -1) currentActorIndex = 0;
      }
    }

    enemies = enemies.filter((e: GameEnemy) => e.hp > 0);

    await gameRef.update({
      players,
      enemies,
      currentActorIndex,
      phase,
      lastAttackingEnemies: actingEnemyIds,
    });

    return {success: true};
  }
);
