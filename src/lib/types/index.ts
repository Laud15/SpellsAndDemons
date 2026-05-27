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