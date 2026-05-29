<script lang="ts">
  import { logout } from '$lib/firebase/auth';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';
	import FriendSystem from '$lib/components/social/FriendSystem.svelte';
  import { createLobby } from '$lib/firebase/lobby';
  import { collection, query, where, onSnapshot } from 'firebase/firestore';
  import { db } from '$lib/firebase/clientSDK';
  import { joinLobby } from '$lib/firebase/lobby';
  import type { Lobby } from '$lib/types';

  let username = $derived(authStore.appUser?.username);
  let loading = $state(false);
  let pendingInvites = $state<Lobby[]>([]);

  $effect(() =>{
    const currentUser = authStore.appUser;
    
    if(!currentUser){ return; }

    const q = query(
      collection(db, 'lobbies'),
      where('invitedIds', 'array-contains', currentUser.uid),
      where('status', '==', 'waiting')
    )

    const unsubscribe = onSnapshot(q, (snap) =>{
      pendingInvites = snap.docs.map(d => ({id: d.id, ...d.data() } as Lobby))
    });

    return () =>{
      unsubscribe();
    }

  });

  async function handleJoin(lobbyId:string) {

    await joinLobby(lobbyId);
     goto(`/lobby/${lobbyId}`);
    
  }

  async function handleLogout() {
    await logout(authStore.appUser?.uid!);
    goto('/login');
  }

  async function handleCreateLobby() {
    loading = true;
    try {
      const lobbyId = await createLobby();
      goto(`/lobby/${lobbyId}`);
    } catch (error) {
      console.error("An error is occured during lobby creation: " + error)
    } finally {
      loading = false;
    }
  }


</script>

<h1>Home</h1>
<p> welcome {username}!</p>
<button onclick={handleLogout}>Logout</button>

<div>
<a href="/ranking">Ranking</a>
</div>

{#if pendingInvites.length > 0}
  <section>
    <h2>Pending invites</h2>
    {#each pendingInvites as invite}
      <div> <!-- note that the invite is always from the host, even if a member that isn't host is the real sender of the invite--> 
        <span>Invite from {invite.players[0].username}</span>
        <button onclick={() => handleJoin(invite.id)}>Join</button>
      </div>
    {/each}
  </section>
{/if}

<button onclick={handleCreateLobby} disabled={loading}>
  {loading ? 'Creating...' : 'Create lobby'}
</button>

<FriendSystem />
