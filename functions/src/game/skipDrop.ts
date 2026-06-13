// functions/src/game/skipDrop.ts
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import type {GamePlayer, GameEnemy, EnemyData, StatusInstance} from "../types";
import {generateEnemyIds} from "../engine/enemies";
import {scaleEnemy, computeTurnOrder, delay} from "../engine/combat";
import {processEnemyTurns} from "./performAction";
const db = getFirestore();

export const skipDrop = onCall(
  {region: "europe-west1", maxInstances: 3},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Not authenticated");

    const {gameId} = request.data;
    if (!gameId) throw new HttpsError("invalid-argument", "Missing gameId");

    const gameRef = db.collection("games").doc(gameId);
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists) throw new HttpsError("not-found", "Game not found");

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const game = gameSnap.data()!;

    if (game.phase !== "drop_phase") {
      throw new HttpsError("failed-precondition", "Not drop phase");
    }

    const currentChooser = game.players[game.dropChooserIndex];
    if (currentChooser.uid !== uid) {
      throw new HttpsError("permission-denied", "Not your turn to choose");
    }

    const nextChooserIndex = game.dropChooserIndex + 1;
    const isLastChooser = nextChooserIndex >= game.players.length;

    if (isLastChooser) {
      // all have choose/skip -> generate new enemies
      let actingEnemyIds: string[] = [];
      const enemyIds = generateEnemyIds();
      const enemySnaps = await Promise.all(
        enemyIds.map((id) => db.collection("enemies").doc(id).get())
      );
      let enemies: GameEnemy[] = enemySnaps.map((snap, index) => {
        const baseEnemy = scaleEnemy(snap.data() as EnemyData, game.winsCount);
        return {
          ...baseEnemy,
          instanceId: `${snap.id}_${Date.now()}_${index}`,
          hp: baseEnemy.maxHp ?? baseEnemy.hp,
          energy: baseEnemy.maxEnergy ?? baseEnemy.energy ?? 0,
          activeStatuses: [] as StatusInstance[],
        };
      });

      const alivePlayers = game.players.filter(
        (p: GamePlayer) => p.stats.hp > 0
      );
      const turnOrder = computeTurnOrder(alivePlayers, enemies);


      let players: GamePlayer[] = game.players;

      const rawPendingLevelUps = game.pendingLevelUps || [];
      const alivePendingLevelUps = rawPendingLevelUps.filter(
        (pendingUid: string) =>
          players.some((p: GamePlayer) =>
            p.uid === pendingUid && p.stats.hp > 0)
      );

      // check how many players are alive that have to do a level up
      let phase = alivePendingLevelUps.length > 0 ? "level_up": "player_turn";

      let currentActorIndex = 0;

      if (phase === "player_turn") {
        await delay(500); // Allow UI to update before enemy turns
        let result = await processEnemyTurns(turnOrder, 0, players, enemies);
        players = result.players;
        enemies = result.enemies;
        currentActorIndex = result.nextIndex;
        actingEnemyIds = result.actingEnemyIds;


        // GAME OVER CHECK
        const allPlayersDead = players.every((p) => p.stats.hp <= 0);
        if (allPlayersDead) {
          phase = "game_over";
        } else {
          // If all initial enemies have acted,
          // reset the index finger at the beginning
          if (currentActorIndex >= turnOrder.length) {
            currentActorIndex = 0;


            // If the 0-index actor is an enemy, calculate his turn
            const firstActorId = turnOrder[0];
            const isFirstActorEnemy = enemies.some(
              (e) => e.instanceId === firstActorId && e.hp > 0
            );

            if (isFirstActorEnemy) {
              result = await processEnemyTurns(turnOrder, 0, players, enemies);
              players = result.players;
              enemies = result.enemies;
              currentActorIndex = result.nextIndex;
              actingEnemyIds = result.actingEnemyIds;
            }
          }

          // If nextIndex goes past the end, it finds the first player alive
          if (currentActorIndex >= turnOrder.length) {
            currentActorIndex = turnOrder.findIndex(
              (id) => players.some((p) => p.uid === id && p.stats.hp > 0)
            );
            if (currentActorIndex === -1) currentActorIndex = 0;
          }

          // Verify that the actor at currentActorIndex is  a live player
          const actorAtIndex = turnOrder[currentActorIndex];
          const isActorAlivePlayer = players.some(
            (p) => p.uid === actorAtIndex && p.stats.hp > 0
          );

          if (!isActorAlivePlayer) {
            currentActorIndex = turnOrder.findIndex(
              (id) => players.some((p) => p.uid === id && p.stats.hp > 0)
            );
            if (currentActorIndex === -1) currentActorIndex = 0;
          }
        }
      }

      enemies = enemies.filter((e) => e.hp > 0);

      await gameRef.update({
        players,
        enemies,
        turnOrder,
        currentActorIndex,
        phase,
        drop: null,
        dropChooserIndex: 0,
        pendingLevelUps: alivePendingLevelUps,
        lastAttackingEnemies: actingEnemyIds,
      });
      delay(1000);
    } else {
      await gameRef.update({
        dropChooserIndex: nextChooserIndex,
      });
    }

    return {success: true};
  }
);
