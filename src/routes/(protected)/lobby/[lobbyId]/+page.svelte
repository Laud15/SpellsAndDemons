
<script lang="ts">
    import {
    joinLobby,
    subscribeLobby,
    leaveLobby,
    inviteToLobby,
    startGame
    } from '$lib/firebase/lobby';

    import { page } from '$app/stores'
    import { goto } from '$app/navigation';
    import { authStore } from '$lib/stores/auth.svelte';
    import { lobbyStore } from '$lib/stores/lobby.svelte';
    import { doc, getDoc } from 'firebase/firestore';

    import { collection, query, where, onSnapshot } from 'firebase/firestore';
    import { auth, db } from '$lib/firebase/clientSDK';
    import type { Friend } from '$lib/types';

    let lobbyId = $derived($page.params.lobbyId as string);
    let lobby = $derived(lobbyStore.currentLobby);
    let isHost = $derived(lobby?.hostId === authStore.appUser?.uid);
    let error = $state('');
    

    let inviteLoading = $state(false);
    let startLoading = $state(false);
    let leaveLoading = $state(false);

    let friendsData = $state<Friend[]>([]);
    let availableFriendsToInvite = $derived(friendsData.filter(friend => !lobby?.players.some(p => p.uid === friend.uid)));

    $effect(() => {
        const currentUser = authStore.appUser;
        if (!currentUser) { return; }
        let unsubscribe: (() => void) | null = null;

        async function  init() {
            
            const lobbyRef = doc(db, 'lobbies', lobbyId);
            const snap = await getDoc(lobbyRef);
            if (!snap.exists()) { goto('/home'); return;}

            const data = snap.data();
            const isAlreadyIn = data.playerIds.includes(currentUser!.uid);
            const isInvited = data.invitedIds.includes(currentUser!.uid);

            //this is needed because an invited user can enter by click on invite's notification
            if(!isAlreadyIn && isInvited){
                await joinLobby(lobbyId);
            }else if(!isAlreadyIn && !isInvited){
                goto('home');
                return;
            }
        
            unsubscribe = subscribeLobby(lobbyId, (updatedLobby) => {
                lobbyStore.setLobby(updatedLobby);
                if (updatedLobby.status === 'in_game') { goto(`/game/${lobbyId}`); }
                if (updatedLobby.status === 'closed') { goto('/home'); }
            });
        }

        init();

        return () => {
            if (unsubscribe) { unsubscribe(); }
            lobbyStore.setLobby(null);
        };
    });

    //retrieve the friend that can be invited in lobby
    $effect(() =>{
        const currentUser = authStore.appUser;
        if (!currentUser || currentUser.friends.length === 0) {
            friendsData = [];
            return;
        }

        const q = query(
            collection(db, 'users'),
            where('uid', 'in', currentUser.friends)
        );

        const unsubscribe = onSnapshot(q, (snap) =>{
            friendsData = snap.docs.map(d => ({ uid: d.data().uid, username: d.data().username}));
        });

        return () => {
            unsubscribe();
        }
    });


    async function handleLeave() {
        try{
            leaveLoading = true;
            await leaveLobby(lobbyId);
            goto('/home');
        }catch(e){
            console.error("Error ocured during leaving lobby" + e);
        }finally{
            leaveLoading = false;
        }
    }

    async function  handleStart() {
        try{
            startLoading = true;
            await startGame(lobbyId);
        }catch (e){
            console.error("Error occured during the start of the game " + e);
        }finally{
            startLoading = false;
        }
    }

    async function handleInvite(friendUid:string) {
        try {
            inviteLoading = true;
            await inviteToLobby(lobbyId, friendUid);
        } catch {
            error = 'Error during invite';
        }finally{
            inviteLoading = false;
        }
    }

</script>

<h1>Lobby</h1>

{#if lobby}
  <section>
    <h2>Players ({lobby.players.length}/4)</h2>
    {#each lobby.players as player}
      <div>
        <span>{player.username}</span>
        {#if player.uid === lobby.hostId}
          <span>host</span>
        {/if}
      </div>
    {/each}
  </section>

{#if authStore.appUser?.uid == lobby.hostId} <!-- only the host can invite other player -->
    {#if availableFriendsToInvite.length > 0}
        <section>
        <h2>Invite friends</h2>
            {#each availableFriendsToInvite as friend }
                <div>
                    <span>{friend.username}</span>
                    <button onclick={() => handleInvite(friend.uid)} disabled={inviteLoading}>
                        {inviteLoading ? 'Inviting...' : 'Invite'}
                    </button>
                </div>
            {/each}
        </section>
    {/if}
{/if}

{#if error}
    <p class="error">{error}</p>
{/if}

<button onclick={handleLeave} disabled={leaveLoading}>
    {leaveLoading ? 'Leaving...' : 'Quit'}
</button>

{#if isHost}
    <button onclick={handleStart} disabled={startLoading}>
        {startLoading ? 'Starting...' : 'Start'}
    </button>
{/if}
{:else}
  <p>Loading lobby...</p>
{/if}
