import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore';
import { db, functions } from "./clientSDK";
import { authStore } from '$lib/stores/auth.svelte';
import { httpsCallable } from 'firebase/functions';
import type { Lobby, LobbyPlayer } from '$lib/types';

//create a new lobby
export async function createLobby(): Promise<string>{
    const currentUser = authStore.appUser;
    if(!currentUser){ throw new Error("not authenticated");}

    const player: LobbyPlayer = {
        uid: currentUser.uid,
        username: currentUser.username,
    }

    const ref = await addDoc(collection(db, 'lobbies'), {
        hostId: currentUser.uid,
        playerIds: [currentUser.uid], //for security rules
        players: [player],
        invitedIds: [],
        status: 'waiting',
        createdAt: serverTimestamp()
    });

    return ref.id
}

//enter in a lobby with an invite
export async function joinLobby(lobbyId:string): Promise<void> {
    const currentUser = authStore.appUser;
    if(!currentUser){ throw new Error("not authenticated");}

    const lobbyRef = doc(db, 'lobbies', lobbyId);
    const snap = await getDoc(lobbyRef);

    if (!snap.exists()) { throw { code: 'lobby/not-found' }; }
    if (snap.data().status === 'in_game') { throw { code: 'lobby/already-started' }; }
    if (snap.data().status === 'closed') { throw { code: 'lobby/is-closed' }; }
    if (snap.data().players.length >= 4) { throw { code: 'lobby/full' }; }

    const player: LobbyPlayer = {
        uid: currentUser.uid,
        username: currentUser.username
    };

    await updateDoc(lobbyRef, {
        playerIds: arrayUnion(currentUser.uid),
        players: arrayUnion(player),
    });
}

//quit from the lobby
export async function leaveLobby(lobbyId:string): Promise<void> {

    const currentUser = authStore.appUser;
    if (!currentUser) { throw new Error('Not authenticated');}

    const lobbyRef = doc(db, 'lobbies', lobbyId);
    const snap = await getDoc(lobbyRef);
    if (!snap.exists()) { return; }

    const data = snap.data();

    const player: LobbyPlayer = {
        uid: currentUser.uid,
        username: currentUser.username
    };

    //if the host is leaving, give the host status to another player
    if(data.hostId === currentUser.uid) {
        const remaining = data.playerIds.filter((uid: string) => uid !== currentUser.uid);

        //if there are no other player mark the lobby as closed
        if(remaining.length === 0) {
            await updateDoc(lobbyRef, {status: 'closed'});
        } else {
            //give the host at the first player in remaining
            await updateDoc(lobbyRef, {
                hostId: remaining[0],
                playerIds: arrayRemove(currentUser.uid),
                players: arrayRemove(player),
            });
        }
    } else {
        await updateDoc(lobbyRef, {
            playerIds: arrayRemove(currentUser.uid),
            players: arrayRemove(player)
        });
    }
}

export async function inviteToLobby(lobbyId:string, toUid: string): Promise<void> {
    const currentUser = authStore.appUser;
    if (!currentUser) { throw new Error('Not authenticated'); }
    
    const notify = httpsCallable(functions, 'sendLobbyInviteNotification');
    await notify({
        toUid,
        fromUsername: currentUser.username,
        lobbyId
    });
}

export async function startGame(lobbyId: string): Promise<void> {
    const fn = httpsCallable(functions, 'startGame');
    await fn({ lobbyId });
}

//listen for lobby's changes
//return the function to shutdown the observer (onSnapshot)
//when on snapshot detect a change in the lobbyId document it calls the callback function with the lobby object as argumetn
export function subscribeLobby(lobbyId: string, callback: (lobby: Lobby) => void): () => void {
    const lobbyRef = doc(db, 'lobbies', lobbyId);
    return onSnapshot(lobbyRef, (snap) =>{
        if(snap.exists()){
            callback({ id: snap.id, ...snap.data() } as Lobby)
        }
    })
}