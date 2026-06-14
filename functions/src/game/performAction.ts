/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {
  applyDamage,
  regenEnergy,
  tickStatuses,
  computeTurnOrder,
  scaleStatusValue,
  shouldLevelUp,
  delay,
  regenHp,
} from "../engine/combat";
import {chooseEnemyMove} from "../engine/enemies";
import {generateDrops} from "../engine/drops";
import type {GamePlayer, GameEnemy, ScrollData, StatusInstance} from "../types";

const db = getFirestore();

function firstAliveChooser(players: GamePlayer[]): number {
  const idx = players.findIndex((p) => p.stats.hp > 0);
  return idx === -1 ? 0 : idx;
}

async function executeEnemyAction(
  enemy: GameEnemy,
  players: GamePlayer[],
  enemies: GameEnemy[],
): Promise <{players: GamePlayer[]; enemies: GameEnemy[]}> {
  const moveId = await chooseEnemyMove(enemy);

  // if no one move is chosen, regen energy and do nothing
  if (!moveId) {
    enemies = enemies.map((e) =>
      e.instanceId === enemy.instanceId ? {
        ...e,
        energy: Math.min(e.energy + e.regenEnergy, e.maxEnergy),
      } : e
    );
    return {players, enemies};
  }

  await delay(500); // delays action

  const scrollSnap = await db.collection("scrolls").doc(moveId).get();
  const scroll = scrollSnap.data() as ScrollData;

  const alivePlayers = players.filter((p) => p.stats.hp>0);

  if (alivePlayers.length === 0) {
    return {players, enemies};
  }

  // enemy spend energy to attack
  enemies = enemies.map((e) =>
    e.instanceId === enemy.instanceId ?
      {...e, energy: e.energy - scroll.energyCost}: e
  );


  if (scroll.type === "damage") {
    if (scroll.target === "single") {
      const target = alivePlayers[
        Math.floor(Math.random() * alivePlayers.length)
      ];
      const damage = applyDamage(enemy.baseDamage, target.activeStatuses);
      players = players.map((p) =>
        p.uid === target.uid ?
          {...p,
            stats: {
              ...p.stats,
              hp: Math.max(0, p.stats.hp - damage),
            }} : p
      );
    } else {
    // MULTI TARGET
      players = players.map((p) => {
        if (p.stats.hp === 0) return p;
        const damage = applyDamage(enemy.baseDamage, p.activeStatuses);
        return {
          ...p,
          stats: {...p.stats, hp: Math.max(0, p.stats.hp - damage)},
        };
      });
    }
    return {players, enemies};
  }

  if (scroll.type === "debuff" && scroll.statusEffect) {
    const statusSnap = await db.collection("statuses")
      .doc(scroll.statusEffect).get();
    const statusData = statusSnap.data()!;
    const status: StatusInstance = {
      id: scroll.statusEffect,
      turnsLeft: statusData.duration,
      value: statusData.value,
    };
    if (scroll.target === "multi") {
      players = players.map((p) => ({
        ...p,
        activeStatuses: [
          ...p.activeStatuses.filter((s) => s.id !== scroll.statusEffect),
          status,
        ],
      }));
    } else { // single target
      const target = alivePlayers[
        Math.floor(Math.random() * alivePlayers.length)
      ];
      players = players.map((p) =>
        p.uid === target.uid ? {
          ...p,
          activeStatuses: [
            ...p.activeStatuses.filter((s) => s.id !== scroll.statusEffect),
            status,
          ],
        }: p
      );
    }
    return {players, enemies};
  }

  return {players, enemies};
}

export async function processEnemyTurns(
  turnOrder: string[],
  startIndex: number,
  players: GamePlayer[],
  enemies: GameEnemy[],
): Promise<{
  players: GamePlayer[];
  enemies: GameEnemy[];
  nextIndex: number;
  actingEnemyIds: string[];
}> {
  let index = startIndex;
  const actingEnemyIds: string[] = [];

  while (index < turnOrder.length) {
    // all players dead
    const alivePlayers = players.filter((p) => p.stats.hp > 0);
    if (alivePlayers.length === 0) {
      break;
    }

    const actorId = turnOrder[index];
    const enemy = enemies.find((e) => e.instanceId === actorId);

    if (!enemy) { // is an alive player
      const isAlive = players.some((p) =>
        p.uid === actorId && p.stats.hp > 0
      );
      if (isAlive) break;
      // dead player -> skip
      index++;
      continue;
    }

    if (enemy.hp <= 0) {
      index++;
      continue;
    }

    // is an enemy -> execute and continue
    actingEnemyIds.push(actorId);
    const result = await executeEnemyAction(enemy, players, enemies);
    players = result.players;
    enemies = result.enemies;
    index++;
  }

  return {players, enemies, nextIndex: index, actingEnemyIds};
}

export const performAction = onCall(
  {region: "europe-west1"},
  async (request) => {
    // ---Validation---
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Not authenticated");
    }
    const {gameId, action} = request.data;
    // action:{ type: 'attack' | 'defend', scrollId?: string, targetId?: string}

    if (!gameId || !action) {
      throw new HttpsError("invalid-argument", "Missing data");
    }

    // retrieve the current game from the db
    const gameRef = db.collection("games").doc(gameId);
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists) {
      throw new HttpsError("permission-denied", "Game not found");
    }

    const game = gameSnap.data()!;

    if (game.phase !== "player_turn") {
      throw new HttpsError("failed-precondition", "Not player turn phase");
    }
    // Found who is gonna performe the turn
    const currentActorID = game.turnOrder[game.currentActorIndex];
    if (currentActorID !== uid) {
      throw new HttpsError("permission-denied", "Not your turn");
    }

    // retrieve all actor of the game (players an enemies)
    let players: GamePlayer[] = game.players.map((p: GamePlayer) => ({
      ...p,
      hasAttacked: false, // resetta sempre all'inizio di ogni azione
    }));
    let enemies: GameEnemy[] = game.enemies;

    // if the one who is gonna performe the turn is player found him
    const playerIndex = players.findIndex((p) =>(p.uid === uid));
    const player = players[playerIndex];

    if (!player || player.stats.hp <= 0) {
      throw new HttpsError("failed-precondition", "You are dead");
    }
    // ---end validation---

    // ACTION: DEFEND
    if (action.type === "defend") {
      players = players.map((p) => {
        if (p.uid === uid) {
          return {
            ...p,
            activeStatuses: [
              // apply stone skin lv 1 effect
              ...p.activeStatuses.filter((s) => s.id !== "stone_skin"),
              {id: "stone_skin", turnsLeft: 2, value: 0.5},
            ],
            hasActed: true,
          };
        }
        return p;
      });
    }

    // ACTION: ATTACK
    if (action.type === "attack") {
      if (!action.scrollId) {
        throw new HttpsError("invalid-argument", "Missing scrollId");
      }

      // retrieve the selected move
      const moveInstance = player.moves.find(
        (m) => (m.scrollId === action.scrollId )
      );
      if (!moveInstance) {
        throw new HttpsError("failed-precondition", "Move not available");
      }

      // read the move data
      const scrollRef = db.collection("scrolls").doc(action.scrollId);
      const scrollSnap = await scrollRef.get();
      const scroll = scrollSnap.data() as ScrollData;

      // check if the energy is sufficient
      const energyCost = scroll.energyCost * moveInstance.level;
      if (player.stats.energy < energyCost) {
        throw new HttpsError("failed-precondition", "Not enough energy");
      }

      // scale the damage with the move level
      const scaledDamage = scroll.damage * moveInstance.level;
      const scaledHeal = scroll.heal * moveInstance.level;

      // DAMAGE TYPE
      if (scroll.type === "damage") {
        if (scroll.target === "single") {
          const targetEnemy = enemies.find(
            (enemy) => enemy.instanceId === action.targetId
          );
          if (!targetEnemy) {
            throw new HttpsError("invalid-argument", "Invalid target");
          }
          const damage = applyDamage(scaledDamage, targetEnemy.activeStatuses);
          enemies = enemies.map((enemy) =>
            enemy.instanceId === action.targetId ?
              {...enemy, hp: Math.max(0, enemy.hp - damage)} : enemy
          );
        } else {
        // MULTI TARGET
          enemies = enemies.map((enemy) => {
            const damage = applyDamage(scaledDamage, enemy.activeStatuses);
            return {...enemy, hp: Math.max(0, enemy.hp - damage)};
          });
        }
      }

      // HEAL TYPE
      if (scroll.type === "heal") {
        if (scroll.target === "single") {
          const targetPlayer = players.find(
            (player) => player.uid === action.targetId && player.stats.hp > 0
          );
          if (!targetPlayer) {
            throw new HttpsError("invalid-argument", "Invalid target");
          }
          players = players.map((p) =>
            p.uid === action.targetId ? {
              ...p,
              stats: {
                ...p.stats,
                hp: Math.min(p.stats.maxHp, p.stats.hp + scaledHeal),
              },
            } : p
          );
        } else {
        // MULTI TARGET
          const alivePlayers = players.filter((p) => p.stats.hp > 0);
          players = alivePlayers.map((p) => {
            return {...p,
              stats: {
                ...p.stats,
                hp: Math.min(p.stats.maxHp, p.stats.hp + scaledHeal),
              },
            };
          });
        }
      }

      // BUFF TYPE
      if (scroll.type === "buff") {
        if (!scroll.statusEffect) {
          throw new HttpsError("invalid-argument", "Invalid target");
        }

        const statusRef = db.collection("statuses").doc(scroll.statusEffect);
        const statusSnap = await statusRef.get();

        if (!statusSnap.exists) {
          throw new HttpsError("invalid-argument", "Missing data");
        }

        const statusData = statusSnap.data();

        const scaledValue = scaleStatusValue(
          statusData?.value,
          moveInstance.level,
          statusData?.effect
        );

        const status: StatusInstance = {
          id: scroll.statusEffect,
          turnsLeft: statusData?.duration,
          value: scaledValue,
        };

        if (scroll.target == "single") {
          const targetPlayer = players.find(
            (p) => p.uid === action.targetId && p.stats.hp > 0
          );

          if (!targetPlayer) {
            throw new HttpsError("invalid-argument", "Invalid target");
          }
          players = players.map((p) =>
            p.uid === action.targetId ?
              {
                ...p,
                activeStatuses: [
                  // if already affected by the status refresh else put in list
                  ...p.activeStatuses.filter(
                    (s) => s.id !== scroll.statusEffect
                  ),
                  status,
                ],
              }: p
          );
        } else {
        // MULTI TARGET
          players = players.map((p) => {
            return {
              ...p,
              activeStatuses: [
                ...p.activeStatuses.filter(
                  (s) => s.id !== scroll.statusEffect
                ),
                status,
              ],
            };
          });
        }
      }

      if (scroll.type === "debuff") {
        if (!scroll.statusEffect) {
          throw new HttpsError("invalid-argument", "Invalid target");
        }
        const statusRef = db.collection("statuses").doc(scroll.statusEffect);
        const statusSnap = await statusRef.get();

        if (!statusSnap.exists) {
          throw new HttpsError("invalid-argument", "Missing data");
        }

        const statusData = statusSnap.data();

        const scaledValue = scaleStatusValue(
          statusData?.value,
          moveInstance.level,
          statusData?.effect
        );

        const status: StatusInstance = {
          id: scroll.statusEffect,
          turnsLeft: statusData?.duration,
          value: scaledValue,
        };

        if (scroll.target === "single") {
          const targetEnemy = enemies.find(
            (e) => e.instanceId === action.targetId
          );
          if (!targetEnemy || !scroll.statusEffect) {
            throw new HttpsError("invalid-argument", "Invalid target");
          }
          enemies = enemies.map((e) =>
            e.instanceId === action.targetId ? {
              ...e,
              activeStatuses: [
                ...e.activeStatuses.filter(
                  (s) => s.id !== scroll.statusEffect
                ),
                status,
              ],
            }: e
          );
        } else {
          // MULTI TARGET
          enemies = enemies.map((e) => ({
            ...e,
            activeStatuses: [
              ...e.activeStatuses.filter((s) => s.id !== scroll.statusEffect),
              status,
            ],
          }));
        }
      }

      // update player's energy and cooldown
      players = players.map((p) => {
        if (p.uid === uid) {
          return {
            ...p,
            stats: {
              ...p.stats,
              energy: p.stats.energy - energyCost,
            },
            hasActed: true,
            hasAttacked: true,
          };
        }
        return {...p, hasAttacked: false};
      });

      delay(1000);
    }

    // remove dead enemy
    enemies = enemies.filter((e) => e.hp > 0);

    // check for player still alive
    let alivePlayers = players.filter((p) => p.stats.hp > 0);

    // check game over (all player dead)
    if (alivePlayers.length === 0) {
      const pointsEach = Math.floor((game.winsCount * 10)/ game.players.length);
      await Promise.all(
        game.players.map((p: GamePlayer) =>
          db.collection("users").doc(p.uid).update({
            score: FieldValue.increment(pointsEach),
          })
        )
      );
      await gameRef.update({
        players,
        enemies,
        phase: "game_over",
        lastAttackingEnemies: [],
      });
      return {success: true};
    }

    // CHECK WIN AFTER PLAYER'S ACTION
    if (enemies.length === 0 ) {
      const newWinsCount = game.winsCount + 1;
      const drops = generateDrops();
      const pendingLevelUps = players.filter(
        (p) => shouldLevelUp(game.winsCount, newWinsCount)
      ).map((p) => p.uid);

      await gameRef.update({
        players,
        enemies,
        phase: "drop_phase",
        winsCount: newWinsCount,
        drop: drops,
        dropChooserIndex: firstAliveChooser(players),
        pendingLevelUps,
        lastAttackingEnemies: [],
      });
      return {success: true};
    }

    // GO TO NEXT ACTOR

    let nextIndex = game.currentActorIndex + 1;
    let actingEnemyIds: string[] = [];


    // SKIP DEAD ACTORS
    while (nextIndex < game.turnOrder.length) {
      const nextId = game.turnOrder[nextIndex];
      const isAlivePlayer = players.some(
        (p) => p.uid === nextId && p.stats.hp > 0
      );
      const isAliveEnemy = enemies.some(
        (e) =>e.instanceId === nextId && e.hp > 0
      );
      if (isAlivePlayer || isAliveEnemy) break;
      nextIndex++;
    }


    // If thera are multiple consecutive enemy
    if (nextIndex < game.turnOrder.length) {
      const result = await processEnemyTurns(
        game.turnOrder,
        nextIndex,
        players,
        enemies);
      players = result.players;
      enemies = result.enemies;
      nextIndex = result.nextIndex;
      actingEnemyIds = result.actingEnemyIds;
      await delay(1500);

      enemies = enemies.filter((e) => e.hp > 0);
      alivePlayers = players.filter((p) => p.stats.hp > 0);

      if (alivePlayers.length === 0) {
        const pointsEach = Math.floor(
          (game.winsCount * 10) / game.players.length
        );
        await Promise.all(game.players.map((p: GamePlayer) =>
          db.collection("users").doc(p.uid).update(
            {
              score: FieldValue.increment(pointsEach),
            }
          )
        ));
        await gameRef.update({
          players,
          enemies,
          phase: "game_over",
          lastActorId: uid,
          lastAttackingEnemies: actingEnemyIds,
        });
        return {success: true};
      }

      if (enemies.length === 0) {
        const newWinsCount = game.winsCount + 1;
        const drops = generateDrops();
        const pendingLevelUps = alivePlayers.filter(
          (p) => shouldLevelUp(game.winsCount, newWinsCount)
        ).map((p) => p.uid);
        await gameRef.update(
          {
            players,
            enemies,
            phase: "drop_phase",
            winsCount: newWinsCount,
            drop: drops,
            dropChooserIndex: firstAliveChooser(players),
            pendingLevelUps,
            lastActorId: uid,
            lastAttackingEnemies: actingEnemyIds ?? [],
          }
        );
        return {success: true};
      }
    }

    // END OF THE ROUND
    if (nextIndex >= game.turnOrder.length) {
      // tick of status and cooldown and regen energy for all players
      players = players.map((p) => {
        const ticked = tickStatuses(p);
        return {
          ...ticked,
          stats: {
            ...ticked.stats,
            energy: regenEnergy(ticked),
            hp: regenHp(ticked),
          },
        };
      });

      // tick cooldown and status for enemy
      enemies = enemies.map((e) => ({
        ...e,
        // regen enemies's energy and status tick
        energy: Math.min(e.maxEnergy, e.energy + e.regenEnergy),
        activeStatuses: e.activeStatuses
          .map((s) => ({...s, turnsLeft: s.turnsLeft - 1}))
          .filter((s) => s.turnsLeft > 0),
      }));

      // compute the new turn order
      alivePlayers = players.filter((p) => p.stats.hp > 0);
      const newTurnOrder = computeTurnOrder(alivePlayers, enemies);

      // the first actor can be an enemy
      const result = await processEnemyTurns(
        newTurnOrder, 0, players, enemies
      );
      players = result.players;
      enemies = result.enemies;
      nextIndex = result.nextIndex;
      actingEnemyIds = [...actingEnemyIds, ...result.actingEnemyIds];
      await delay(1500);

      if (nextIndex >= newTurnOrder.length) {
        const firstPlayerIdx = newTurnOrder.findIndex(
          (id) => players.some((p) => p.uid === id && p.stats.hp > 0)
        );
        nextIndex = firstPlayerIdx !== -1 ? firstPlayerIdx : 0;
      }

      // remove dead enemies and dead players after enemies turn
      enemies = enemies.filter((e) => e.hp > 0);
      alivePlayers = players.filter((p) => p.stats.hp > 0);

      if (alivePlayers.length === 0) {
        const pointsEach = Math.floor(
          game.winsCount * 10 / game.players.length
        );
        await Promise.all(
          game.players.map((p: GamePlayer) =>
            db.collection("users").doc(p.uid).update({
              score: FieldValue.increment(pointsEach),
            })
          )
        );
        await gameRef.update({
          players,
          enemies,
          phase: "game_over",
          lastActorId: uid,
          lastAttackingEnemies: actingEnemyIds,
        });
        return {success: true};
      }


      // check if all enemies are dead after their turn
      if (enemies.length === 0) {
        const newWinsCount = game.winsCount + 1;
        const drops = generateDrops();

        const pendingLevelUps = alivePlayers
          .filter((p) => shouldLevelUp(game.winsCount, newWinsCount))
          .map((p) => p.uid);

        await gameRef.update({
          players,
          enemies,
          phase: "drop_phase",
          winsCount: newWinsCount,
          drop: drops,
          dropChooserIndex: firstAliveChooser(players),
          pendingLevelUps,
          turn: FieldValue.increment(1),
          lastActorId: uid,
          lastAttackingEnemies: actingEnemyIds ?? [],
        });
        return {success: true};
      }

      await gameRef.update({
        players,
        enemies,
        turnOrder: newTurnOrder,
        currentActorIndex: nextIndex,
        phase: "player_turn",
        turn: FieldValue.increment(1),
        lastActorId: uid,
        lastAttackingEnemies: actingEnemyIds ?? [],
      });
    } else {
      await gameRef.update({
        players,
        enemies,
        currentActorIndex: nextIndex,
        phase: "player_turn",
        lastActorId: uid,
        lastAttackingEnemies: actingEnemyIds, // ← ora valorizzato correttamente
      });
    }

    return {success: true};
  }
);
