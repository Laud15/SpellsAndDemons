import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import type {EnemyData, GameEnemy, GamePlayer, StatusInstance} from "../types";
import {generateEnemyIds} from "../engine/enemies";
import {scaleEnemy, computeTurnOrder} from "../engine/combat";
import {processEnemyTurns} from "./performAction";

const db = getFirestore();

export const chooseDrop = onCall(
  {region: "europe-west1"},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Not authenticated");
    }
    // replaceScrollId: which move to remove
    const {gameId, scrollId, replaceScrollId} = request.data;

    if (!gameId || !scrollId) {
      throw new HttpsError("invalid-argument", "Missing data");
    }

    const gameRef = db.collection("games").doc(gameId);
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists) {
      throw new HttpsError("not-found", "Game not found");
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const game = gameSnap.data()!;

    if (game.phase !== "drop_phase") {
      throw new HttpsError("failed-precondition", "Not drop phase");
    }

    // Verify that it is this player's turn to choose
    const currentChooser = game.players[game.dropChooserIndex];
    if (currentChooser.uid !== uid) {
      throw new HttpsError("permission-denied", "Not your turn to choose");
    }

    // eslint-disable-next-line prefer-const
    let players: GamePlayer[] = game.players;
    const playerIndex = players.findIndex((p) => p.uid === uid);
    const player = players[playerIndex];

    const existingMove = player.moves.find((m) => m.scrollId === scrollId);

    if (existingMove) {
      // Livella la mossa in modo sicuro
      players[playerIndex] = {
        ...player,
        moves: player.moves.map((m) => {
          if (m.scrollId === scrollId) {
            const currentLevel = typeof m.level === "number" ? m.level : 1;
            return {...m, level: currentLevel + 1};
          }
          return m;
        }),
      };
    } else {
    // new move -> replace the selected move
      if (!replaceScrollId) {
        throw new HttpsError(
          "invalid-argument",
          "Must specify which move to replace"
        );
      }

      const newMoves = replaceScrollId ?
        player.moves.filter((m) => m.scrollId !== replaceScrollId) :
        player.moves;

      players[playerIndex] = {
        ...player,
        moves: [
          ...newMoves,
          {scrollId, level: 1},
        ],
      };
    }

    // go to the next player or end the drop phase
    let nextChooserIndex = game.dropChooserIndex + 1;

    // skip dead players
    while ((nextChooserIndex < players.length) &&
           (players[nextChooserIndex].stats.hp <= 0)) {
      nextChooserIndex++;
    }

    const isLastChooser = (nextChooserIndex >= game.players.length);


    if (isLastChooser) {
      // all player have choose -> generate new enemies
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

      const alivePlayers = players.filter((p) => p.stats.hp > 0);
      const turnOrder = computeTurnOrder(alivePlayers, enemies);

      // check if there are pending level ups
      const rawPendingLevelUps = game.pendingLevelUps || [];
      const alivePendingLevelUps = rawPendingLevelUps.filter(
        (pendingUid: string) =>
          players.some((p) => p.uid === pendingUid && p.stats.hp > 0)
      );

      let phase = alivePendingLevelUps.length > 0 ?
        "level_up" :
        "player_turn";

      let currentActorIndex = 0;

      if (phase === "player_turn") {
        let result = await processEnemyTurns(turnOrder, 0, players, enemies);
        players = result.players;
        enemies = result.enemies;
        currentActorIndex = result.nextIndex;

        // If all enemies have acted and the index finger goes over the tail,
        // reset at the beginning
        const allPlayersDead = players.every((p) => p.stats.hp <= 0);
        if (allPlayersDead) {
          phase = "game_over";
        } else {
          if (currentActorIndex >= turnOrder.length) {
            currentActorIndex = 0;

            // if the actor at index 0 is an enemy it have to compute his turn
            const firstActorId = turnOrder[0];
            const isFirstActorEnemy = enemies.some(
              (e) => e.instanceId === firstActorId && e.hp > 0
            );

            if (isFirstActorEnemy) {
              result = await processEnemyTurns(turnOrder, 0, players, enemies);
              players = result.players;
              enemies = result.enemies;
              currentActorIndex = result.nextIndex;
            }
          }

          // If nextIndex is past the end, find the first player alive
          if (currentActorIndex >= turnOrder.length) {
            currentActorIndex = turnOrder.findIndex(
              (id) => players.some((p) => p.uid === id && p.stats.hp > 0)
            );
            if (currentActorIndex === -1) currentActorIndex = 0;
          }

          // Verify that the actor at currentActorIndex is actually a live plyer
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
      // Remove any accidentally dead enemies
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
      });
    } else {
      await gameRef.update({
        players,
        dropChooserIndex: nextChooserIndex,
      });
    }

    return {success: true};
  }
);
