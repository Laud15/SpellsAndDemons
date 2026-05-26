import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  arrayUnion,
  writeBatch,
  getDoc
} from 'firebase/firestore';

import { db } from './clientSDK';
import { authStore } from '$lib/stores/auth.svelte';
import type { FriendRequest } from '$lib/types';
import { error } from '@sveltejs/kit';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { functions } from './clientSDK';


//search an user by username
export async function findUserByUsername(username: string) {

    const usernameRef = doc(db, 'usernames', username.toLowerCase());
    const snap = await getDoc(usernameRef);

    if(!snap.exists()) { return null; }
    
    const uid = snap.data().uid;
    const userSnap = await getDoc(doc(db, 'users', uid));

    if (!userSnap.exists()) { return null; }

    return { uid, ...userSnap.data() };
}

//send the request
export async function sendFriendRequest(toUid: string) {
    const currentUser = authStore.appUser;
    if (!currentUser) { throw new Error('Not authenticated'); }

    //check if already friends
    if(currentUser.friends.includes(toUid)) {
        throw { code: 'already-friends' };
    }

    //check if already doesn't exist a request
    const existing = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', currentUser.uid),
        where('toUid', '==', toUid),
        where('status', '==', 'pending')
    );
    const snap = await getDocs(existing)
    if(!snap.empty) { throw {code: 'request-already-sent'}; };

    //create the request
    await addDoc(collection(db, 'friendRequests'), {
    fromUid: currentUser.uid,
    fromUsername: currentUser.username,
    toUid,
    status: 'pending',
    createdAt: new Date()
    });
}

//accept a request, add both at the friends's list with a batch
export async function acceptFriendRequest(request: FriendRequest) {

  //create the connection to the cloudfunction acceptFriendRequest
  const fn = httpsCallable(functions, 'acceptFriendRequest');

  //call the function with arguments (payload)
  await fn({ requestId: request.id });
}

export async function rejectFriendRequest(requestId: string) {
  await updateDoc(doc(db, 'friendRequests', requestId), {
    status: 'rejected'
  });
}


//retrieve incoming requests
export async function getIncomingRequests(): Promise<FriendRequest[]> {
  const currentUser = authStore.appUser;
  if (!currentUser) return [];

  const q = query(
    collection(db, 'friendRequests'),
    where('toUid', '==', currentUser.uid),
    where('status', '==', 'pending')
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest));
}