import type {GamePlayer, GameEnemy, EnemyData, StatusInstance} from "../types";

export function computeStats(
  will: number,
  knowledge: number,
  intuition: number,
  cunning: number) {
  return {
    maxHp: 50 + (will * 10),
    maxEnergy: 20 + (knowledge * 5),
    energyRegen: 5 + (cunning * 2),
    intuition,
  };
}

// compute level from wincount
export function computeLevel(winsCount: number): number {
  // 1-10:every 2 win, 11-20: every 4 win, 21-30 every 6 win...
  let level = 1;
  let wins = winsCount;
  let tier = 1;
  let winsPerLevel = 2;

  while (wins >= winsPerLevel) {
    wins -= winsPerLevel;
    level++;
    if (level % 10 === 1) {
      tier++;
      winsPerLevel = tier * 5;
    }
  }
  return level;
}

export function shouldLevelUp(oldWins: number, newWins: number): boolean {
  return computeLevel(newWins) > computeLevel(oldWins);
}

// Scale the enemy's stats with the number of wins
export function scaleEnemy(enemy: EnemyData, winsCount: number) : GameEnemy {
  const scaledHp = enemy.baseStats.hp + (enemy.scaling.hp * winsCount);
  const scaledDamage = enemy.baseDamage + (enemy.scaling.damage * winsCount);
  const scaledRegen = 3 + (enemy.scaling.regenEnergy * winsCount);
  return {
    instanceId: `${enemy.id}_${Date.now()}_${Math.random()}`,
    enemyId: enemy.id,
    name: enemy.name,
    sprite: enemy.sprite,
    hp: scaledHp,
    maxHp: scaledHp,
    energy: enemy.baseStats.energy,
    maxEnergy: enemy.baseStats.maxEnergy,
    regenEnergy: scaledRegen,
    intuition: enemy.baseStats.intuition,
    baseDamage: scaledDamage,
    moves: enemy.moves,
    activeStatuses: [],
  };
}

// calculate turn's order
export function computeTurnOrder(
  players: GamePlayer[],
  enemies: GameEnemy[]
): string[] {
  const actors = [
    ...players.filter((p) => p.stats.hp>0)
      .map((p) =>{
        return {id: p.uid, intuition: getEffectiveIntuition(p)};
      }),

    ...enemies.map((e) => (
      {
        id: e.instanceId,
        intuition: getEffectiveIntuition(e),
      })),
  ];

  return actors.sort((a, b) => b.intuition - a.intuition).map((a) => a.id);
}

// Apply damage to a target taking into account statuses
export function applyDamage(
  damage: number,
  targetStatuses: StatusInstance[]
): number {
  let finalDamage = damage;
  const stoneSkin = targetStatuses.find((s) => s.id === "stone_skin");
  const cursed = targetStatuses.find((s) => s.id === "cursed");

  if (stoneSkin) {
    finalDamage = Math.ceil(finalDamage * stoneSkin.value);
  }

  if (cursed) {
    finalDamage = Math.floor(finalDamage * cursed.value);
  }

  return Math.max(0, finalDamage);
}

export function regenEnergy(player: GamePlayer): number {
  const regen = 5 + (player.stats.cunning * 2);
  return Math.min(player.stats.maxEnergy, player.stats.energy + regen);
}

export function regenHp(player: GamePlayer): number {
  const regen = Math.floor(player.stats.level * 0.2);
  return Math.min(player.stats.maxHp, player.stats.hp + regen);
}

export function tickStatuses(player: GamePlayer): GamePlayer {
  return {
    ...player,
    activeStatuses: player.activeStatuses
      .map((s) => ({...s, turnsLeft: s.turnsLeft - 1}))
      .filter((s) => s.turnsLeft > 0),
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function scaleStatusValue(
  baseValue: number,
  moveLevel: number,
  effect: string
): number {
  if (effect === "damage_reduction" || effect === "intuition_reduction") {
    return Math.max(0.1, baseValue - (moveLevel - 1) * 0.1);
  }

  if (effect === "double_taken_damage" || effect === "intuition_boost") {
    return baseValue + (moveLevel - 1) * 0.2;
  }

  return baseValue;
}


export function getEffectiveIntuition(
  actor: GamePlayer | GameEnemy
): number {
  const haste = actor.activeStatuses.find((s) => s.id === "hasted");
  const slowed = actor.activeStatuses.find((s) => s.id === "slowed");
  let intuition = "stats" in actor ?
    actor.stats.intuition : // GamePlayer has stats.intuition
    actor.intuition; // GameEnemy has intuition

  if (haste) intuition = Math.floor(intuition * haste.value);
  if (slowed) intuition = Math.floor(intuition * slowed.value);

  return intuition;
}
