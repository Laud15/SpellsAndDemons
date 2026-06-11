<script lang="ts">
  import { logout } from '$lib/firebase/auth';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';
	import { createLobby } from '$lib/firebase/lobby';
  import { collection, query, where, onSnapshot } from 'firebase/firestore';
  import { db } from '$lib/firebase/clientSDK';
  import { joinLobby } from '$lib/firebase/lobby';
  import type { Lobby } from '$lib/types';

  import FriendSystem from '$lib/components/social/FriendSystem.svelte';
  
  import '$lib/styles/home.css';

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

<div class="dashboard-container">
  <header class="main-header">
    <div>
      <h1>Home</h1>
      <p class="welcome">Welcome, <span class="user-highlight">{username}</span>!</p>
    </div>
    <button class="btn-secondary" onclick={handleLogout}>Logout</button>
  </header>

  <div class="dashboard-grid">
    <div class="main-actions">
      <button class="btn-primary" onclick={handleCreateLobby} disabled={loading}>
        {loading ? 'Creating...' : 'Create Lobby'}
      </button>
      
      <a href="/ranking" class="ranking-link">View Global Ranking</a>

      {#if pendingInvites.length > 0}
        <section class="invites-section">
          <h2>Pending Invites</h2>
          <div class="invites-list">
            {#each pendingInvites as invite}
              <div class="invite-card">
                <span>Invite from <strong>{invite.players[0].username}</strong></span>
                <button class="btn-small" onclick={() => handleJoin(invite.id)}>Join</button>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>

    <div class="social-side">
      <FriendSystem />
    </div>
  </div>
</div>