export interface EnemyData {
  id: string;
  name: string;
  sprite: string;
  baseStats: {
    hp: number;
    maxHp: number;
    energy: number;
    maxEnergy: number;
    intuition: number;
  };
  scaling: {
    hp: number;
    damage: number;
    regenEnergy: number;
  };
  moves: string[];
  baseDamage: number;
}

export interface ScrollData{
    id: string;
    name: string;
    type: "damage" | "heal" | "buff" | "debuff";
    target: "single" | "multi";
    energyCost: number;
    damage: number;
    heal: number;
    statusEffect: string | null;
}

export interface LobbyData{
    hostId: string;
    playerIds: string[];
    players: {uid: string; username: string}[];
    status: string;
}

export interface UserData{
    uid: string;
    usernaem: string;
    score: number;
    friends: string[];
}

export interface MoveInstance {
  scrollId: string;
  level: number;
}

export interface StatusInstance {
  id: string;
  turnsLeft: number;
  value: number;
}

export interface GamePlayer {
  uid: string;
  username: string;
  sprite: string;
  stats: {
    hp: number;
    maxHp: number;
    energy: number;
    maxEnergy: number;
    will: number;
    knowledge: number;
    intuition: number;
    cunning: number;
    level: number;
  };
  moves: MoveInstance[];
  activeStatuses: StatusInstance[];
  hasActed: boolean;
}

export interface GameEnemy {
  instanceId: string;
  enemyId: string;
  name: string;
  sprite: string;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  regenEnergy: number;
  intuition: number;
  baseDamage: number;
  moves: string[];
  activeStatuses: StatusInstance[];
}
