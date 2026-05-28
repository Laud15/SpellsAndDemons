
<script lang="ts">
    import {
    subscribeLobby,
    leaveLobby,
    inviteToLobby
    } from '$lib/firebase/lobby';


    import { page } from '$app/stores'
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { authStore } from '$lib/stores/auth.svelte';
    import { lobbyStore } from '$lib/stores/lobby.svelte';
    import type { Lobby } from '$lib/types';

    import { collection, query, where, onSnapshot } from 'firebase/firestore';
    import { db } from '$lib/firebase/clientSDK';
    import type { Friend } from '$lib/types';

    let lobbyId = $derived($page.params.lobbyId);
    let lobby = $derived(lobbyStore.currentLobby);
    let isHost = $derived(lobby?.hostId === authStore.appUser?.uid);
    let error = $state('');

    let friendsData = $state<Friend[]>([]);

    onMount(() => {
        const unsubscribe = subscribeLobby(lobbyId!, (updatedLobby) =>{
            lobbyStore.setLobby(updatedLobby);

            //if the game is started go to the game page
            if (updatedLobby.status === 'in_game') {
                goto(`/game/${lobbyId}`)
            }
        });

        return () => {
            unsubscribe();
            lobbyStore.setLobby(null);
        };
    });

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
            const inLobbyUids = lobby?.players.map(p => p.uid) ?? [];
            friendsData = snap.docs.map(d => ({ uid: d.data().uid, username: d.data().username})).filter(f => !inLobbyUids.includes(f.uid))
        });

        return () => {
            unsubscribe();
        }

    })


    async function handleLeave() {
        await leaveLobby(lobbyId!);
        goto('/home');
    }

    async function handleInvite(friendUid:string) {
        try {
            await inviteToLobby(lobbyId!, friendUid);
        } catch {
            error = 'Error during invite';
        }
    }

    let friendsNotInLobby = $derived(
        (authStore.appUser?.friends ?? []).filter(
            uid => !lobby?.players.some(p => p.uid === uid)
        )
    );

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

  {#if friendsNotInLobby.length > 0}
    <section>
      <h2>Invite friends</h2>
        {#each friendsData as friend }
            <div>
                <span>{friend.username}</span>
                <button onclick={() => handleInvite(friend.uid)}>
                Invite
                </button>
            </div>
        {/each}
    </section>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <button onclick={handleLeave}>Quit</button>

  {#if isHost}
    <button onclick={() => goto(`/game/${lobbyId}`)}>
      Start
    </button>
  {/if}
{:else}
  <p>Loading lobby...</p>
{/if}
