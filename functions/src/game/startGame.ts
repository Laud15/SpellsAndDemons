/* eslint-disable max-len */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {initializeApp} from "firebase-admin/app";
import {computeStats, computeTurnOrder, scaleEnemy, delay} from "../engine/combat";
import {generateEnemyIds} from "../engine/enemies";
import type {GamePlayer, GameEnemy, EnemyData} from "../types";
import {processEnemyTurns} from "./performAction";

initializeApp();
const db = getFirestore();

const PLAYER_SPRITES = [
  "fire_mage",
  "shadow_mage",
  "water_mage",
  "forest_mage",
];
// without magic dart beacause it is always given
const ALL_SCROLL_IDS = [
  "fireball",
  "lightning_bolt",
  "heal",
  "mass_heal",
  "skin_of_stone",
  "haste",
  "slowness",
  "curse",
];

// Fisher–Yates shuffle (more random than Math.random)
function shuffle(array: string[]): string[] {
  const result = [...array];
  let temp: string;
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export const startGame = onCall(
  {region: "europe-west1"},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Not authenticated");
    }

    const {lobbyId} = request.data;
    if (!lobbyId) {
      throw new HttpsError("invalid-argument", "Missing lobbyId");
    }

    // read the lobby
    const lobbySnap = await db.collection("lobbies").doc(lobbyId).get();
    if (!lobbySnap.exists) {
      throw new HttpsError("not-found", "Lobby not found");
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lobby = lobbySnap.data()!;
    if (lobby.hostId !== uid) {
      throw new HttpsError("permission-denied", "Only host can start the game");
    }

    // read the users
    // promise.all is Used when multiple asyncrone operations occur
    const userSnaps = await Promise.all(
      lobby.playerIds.map((id: string) =>
        db.collection("users").doc(id).get()
      )
    );

    // Randomly assign sprites
    const shuffledSprites = shuffle(PLAYER_SPRITES);

    // Build players with base stats
    let players: GamePlayer[] = userSnaps.map((snap, i) => {
      if (!snap.exists) {
        throw new HttpsError(
          "failed-precondition",
          `The document of the user ${lobby.playerIds[i]} don't exists.`
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = snap.data()!;
      const will = 1;
      const knowledge = 1;
      const intuition = 1;
      const cunning = 1;
      const stats = computeStats(will, knowledge, intuition, cunning);
      return {
        uid: user.uid,
        username: user.username,
        sprite: shuffledSprites[i],
        stats: {
          hp: stats.maxHp,
          maxHp: stats.maxHp,
          energy: stats.maxEnergy,
          maxEnergy: stats.maxEnergy,
          will,
          knowledge,
          intuition,
          cunning,
          level: 1,
        },
        moves: [],
        activeStatuses: [],
        hasActed: false,
      };
    });

    for (const player of players) {
      const shuffled = shuffle(ALL_SCROLL_IDS);
      player.moves = shuffled.slice(0, 2).map((scrollId) => ({
        scrollId,
        level: 1,
      }));
      player.moves.push({
        scrollId: "magic_dart",
        level: 1,
      });
    }

    // generate the enemies
    const enemyIds = generateEnemyIds();
    const enemySnaps = await Promise.all(
      enemyIds.map((id) => db.collection("enemies").doc(id).get())
    );

    // make them start with no scaling
    let enemies: GameEnemy[] = enemySnaps.map((snap) =>
      scaleEnemy(snap.data() as EnemyData, 0)
    );

    // compute turn order
    const turnOrder = computeTurnOrder(players, enemies);

    const gameRef = db.collection("games").doc(lobbyId);
    // save the starting state
    await gameRef.set({
      lobbyId,
      playerIds: lobby.playerIds,
      phase: "player_turn",
      turn: 1,
      winsCount: 0,
      players,
      enemies,
      turnOrder,
      currentActorIndex: 0,
      drop: null,
      dropChooserIndex: 0,
      pendingLevelUps: [],
    });

    // update the lobby status
    await db.collection("lobbies").doc(lobbyId).update({
      status: "in_game",
    });

    await delay(2000);

    // the first actor can be an enemy
    const enemyTurnResult = await processEnemyTurns(turnOrder, 0, players, enemies);

    players = enemyTurnResult.players;
    enemies = enemyTurnResult.enemies.filter((e) => e.hp > 0);

    const allPlayersDead = players.every((p) => p.stats.hp <= 0);
    let phase = "player_turn";
    let startingActorIndex = 0;

    if (allPlayersDead) {
      phase = "game_over";
    } else {
      startingActorIndex = enemyTurnResult.nextIndex >= turnOrder.length ?
        turnOrder.findIndex((id) => players.some((p) => p.uid === id && p.stats.hp > 0)):
        enemyTurnResult.nextIndex;
      if (startingActorIndex === -1) startingActorIndex = 0;
    }

    // update the game document
    await gameRef.update({
      players,
      enemies,
      currentActorIndex: startingActorIndex !== -1 ? startingActorIndex : 0,
      phase,
    });

    return {success: true, gameId: lobbyId};
  }
);

