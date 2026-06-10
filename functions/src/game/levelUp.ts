import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
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
    // stat: 'will' | 'knowledge' | 'intuition' | 'cunning'
    // stat rappresent the choosen stat to upgrade
    const {gameId, stat} = request.data;

    if (!gameId || !stat) {
      throw new HttpsError("invalid-argument", "Missing data");
    }

    const validStats = ["will", "knowledge", "intuition", "cunning"];
    if (!validStats.includes(stat)) {
      throw new HttpsError("invalid-argument", "Invalid stat");
    }

    const gameRef = db.collection("games").doc(gameId);
    const gameSnap = await gameRef.get();

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

    // eslint-disable-next-line prefer-const
    let players: GamePlayer[] = game.players;
    const playerIndex = players.findIndex((p) => p.uid === uid);
    const player = players[playerIndex];

    // increase the choosen stat of 1
    const newStats = {
      ...player.stats,
      [stat]: player.stats[stat as keyof typeof player.stats] + 1,
      level: player.stats.level + 1,
    };

    // compute new maxHp e new maxEnergy
    const computed = computeStats(
      newStats.will,
      newStats.knowledge,
      newStats.intuition,
      newStats.cunning
    );
    newStats.maxHp = computed.maxHp;
    newStats.maxEnergy = computed.maxEnergy;

    players[playerIndex] = {...player, stats: newStats};

    // remove the player from pendingLevelUps
    const pendingLevelUps = game.pendingLevelUps.filter(
      (id: string) => id !== uid
    );

    let phase = pendingLevelUps.length === 0 ? "player_turn" : "level_up";

    let currentActorIndex = game.currentActorIndex || 0;
    let enemies = game.enemies;

    // when level up phase end the combat start again
    if (phase === "player_turn") {
      // Process enemy turns from the beginning (index 0)
      const result = await processEnemyTurns(
        game.turnOrder,
        0,
        players,
        enemies);
      players = result.players;
      enemies = result.enemies;
      currentActorIndex = result.nextIndex;
      await delay(1500);

      const allPlayersDead = players.every((p) => p.stats.hp <= 0);

      if (allPlayersDead) {
        phase = "game_over";
      } else {
      // If the turns have reached the end of the order
      // reset to the first player alive
        if (currentActorIndex >= game.turnOrder.length) {
          currentActorIndex = game.turnOrder.findIndex(
            (id: string) => players.some(
              (p: GamePlayer) => p.uid === id && p.stats.hp > 0)
          );
          if (currentActorIndex === -1) {
            currentActorIndex = 0;
          }
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
    }

    if (phase === "level_up") {
      await gameRef.update({
        players,
        pendingLevelUps,
        phase,
      });
    } else {
      await gameRef.update({
        players,
        enemies,
        currentActorIndex,
        pendingLevelUps,
        phase,
      });
    }
    return {success: true};
  }
);
