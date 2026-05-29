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
}