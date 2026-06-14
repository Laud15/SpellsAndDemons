export type UserStatus = 'offline' | 'free' | 'busy';

export interface AppUser {
    uid: string;
    email: string;
    username: string;
    score: number;
    friends: string[]; //uid array
    pushSubscription?: PushSubscriptionJSON | null;
    status?: UserStatus; 
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromUsername: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

export interface LobbyPlayer {
  uid: string;
  username: string;
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

export interface Lobby{
  id: string;
  hostId: string; //id of the lobby host
  playerIds: string[]; //array of playerIds, this is usefull for security rules
  players: LobbyPlayer[]; //for the ui
  invitedIds: string[]; //id of who is invited and isn't in the lobby
  status: 'waiting' | 'in_game' | 'closed';
  createdAt: Date;
}

export interface Friend{
  uid: string;
  username: string;
  status?: 'offline' | 'free' | 'busy'; 
}

export interface MoveInstance{
  scrollId: string;
  level: number;
}

export interface StatusInstance{
  id: string;
  turnsLeft: number;
  value: number;
}

export interface GamePlayer{
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
  },
  moves: MoveInstance[];
  activeStatuses: StatusInstance[];
  hasActed: boolean;
  hasAttacked?: boolean;
}

export interface GameEnemy{
  instanceId: string; //Unique ID to distinguish enemies of the same type
  enemyId: string;
  name: string;
  sprite: string;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  regenEnergy: number
  intuition: number;
  baseDamage: number;
  moves: string[];
  activeStatuses: StatusInstance[];
}

export type GamePhase = | 'player_turn' | 'enemy_turn' | 'drop_phase' | 'level_up' | 'game_over';

export interface Game {
  id: string;
  lobbyId: string;
  playerIds: string[] //for the security rules
  phase: GamePhase;
  turn: number;
  winsCount: number;
  players: GamePlayer[];
  enemies: GameEnemy[];
  turnOrder: string[]; //array of uid/instanceId ordered by intuition
  currentActorIndex: number; //used to know of who is the turn
  drop: string[] | null; //dropped scrolls (an array of scrollId)
  dropChooserIndex: number; //index of the player that have to choose
  pendingLevelUps: string[] //array of players that are ready to level up
  lastActorId?: string;
  lastAttackingEnemies?: string[];
}
