<script lang="ts">
  import { logout } from '$lib/firebase/auth';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';
	import { createLobby } from '$lib/firebase/lobby';
  import { collection, query, where, onSnapshot, updateDoc, doc  } from 'firebase/firestore';
  import { db } from '$lib/firebase/clientSDK';
  import { joinLobby } from '$lib/firebase/lobby';
  import type { Lobby } from '$lib/types';

  import FriendSystem from '$lib/components/social/FriendSystem.svelte';
  
  import '$lib/styles/home.css';

  let username = $derived(authStore.appUser?.username);
  let loading = $state(false);
  let pendingInvites = $state<Lobby[]>([]);
  let joinError = $state('');

  $effect(() =>{
    const currentUser = authStore.appUser;
    
    if(!currentUser){ return; }

    const q = query(
      collection(db, 'lobbies'),
      where('invitedIds', 'array-contains', currentUser.uid),
      where('status', '==', 'waiting')
    )

    const unsubscribe = onSnapshot(q, (snap) =>{
      pendingInvites = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Lobby))
      .filter(lobby => lobby.players.length > 0 && lobby.players.length < 4);
    });

    return () =>{
      unsubscribe();
    }

  });


  $effect(() => {
    const currentUser = authStore.appUser;
    if (!currentUser || currentUser.status !== 'busy') { return; }

    const q = query(
        collection(db, 'lobbies'),
        where('playerIds', 'array-contains', currentUser.uid),
        where('status', 'in', ['waiting', 'in_game'])
    );

    const unsubscribe = onSnapshot(q, (snap) => {
        if (snap.empty) {
            updateDoc(doc(db, 'users', currentUser.uid), { status: 'free' }).catch(() => {});
        }
    });

    return () => unsubscribe();
  });

  async function handleJoin(lobbyId:string) {

    joinError = '';
    try {
      await joinLobby(lobbyId);
      goto(`/lobby/${lobbyId}`);
    } catch (e: any) {
      joinError = mapJoinError(e.code);
    }

  }

  function mapJoinError(code: string): string {
    switch (code) {
      case 'lobby/full': return 'This lobby is full';
      case 'lobby/already-started': return 'The game has already started';
      case 'lobby/is-closed': return 'This lobby is closed';
      case 'lobby/not-found': return 'Lobby not found';
      default: return 'Could not join the lobby';
    }
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

          {#if joinError}
            <p class="error">{joinError}</p>
          {/if}

            <div class="invites-list">
              {#each pendingInvites as invite}
                {@const isFull = invite.players.length >= 4}
                <div class="invite-card">
                  <span>
                    Invite from <strong>{invite.players[0].username}</strong>
                    ({invite.players.length}/4)
                  </span>
                  <button
                    class="btn-small"
                    onclick={() => handleJoin(invite.id)}
                    disabled={isFull}
                  >
                    {isFull ? 'Full' : 'Join'}
                  </button>
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