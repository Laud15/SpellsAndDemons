export interface AppUser {
    uid: string;
    email: string;
    username: string;
    score: number;
    friends: string[]; //uid array
    pushSubscription?: PushSubscriptionJSON | null;
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

export interface Lobby{
  id: string;
  hostId: string;
  playerIds: string[];  
  players: LobbyPlayer[];
  invitedIds: string[];
  status: 'waiting' | 'in_game';
  createdAt: Date;
}

export interface Friend{
  uid: string;
  username: string;
}