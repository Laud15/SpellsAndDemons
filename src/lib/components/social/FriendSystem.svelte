<script lang="ts">
  import {
    findUserByUsername,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
  } from '$lib/firebase/social';
  import { collection, query, where, onSnapshot } from 'firebase/firestore';
  import { db } from '$lib/firebase/clientSDK';
  import type { FriendRequest } from '$lib/types';
  import { authStore } from '$lib/stores/auth.svelte';
  import type { Friend } from '$lib/types/index'
  import '$lib/styles/friendSystem.css';

  let searchUsername = $state('');
  let searchResult = $state<any>(null);
  let searchError = $state('');
  let searchLoading = $state(false);

  let incomingRequests = $state<FriendRequest[]>([]);
  let requestMessage = $state('');
  let requestHandleLoading = $state(false);

  let sendingRequestLoading = $state(false);

  let friends = $state<Friend[]>([]);
  
  //load the friends's usernames
  $effect(() =>{
    const currentUser = authStore.appUser;// $effect track this dependency
    if(!currentUser || currentUser.friends.length === 0) { 
      friends = [];
      return; 
    };

    const q = query(
      collection(db, 'users'),
      where('uid', 'in', currentUser.friends)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      friends = snap.docs.map(d => ({
            uid: d.data().uid,
            username: d.data().username,
            status: d.data().status ?? 'offline'
        }));
    }, (err) => {
      console.error("Error in friends snapshot:", err);
    });

    //automatic cleanup when currentUser change or the component is destroyed
    return () => {
      unsubscribe();
    };
  })

  //load incoming request in the mount's moment
  $effect(() => {
    const currentUser = authStore.appUser; // $effect track this dependency
    if (!currentUser) { return; }       
    const q = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', currentUser.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snap) => {

      incomingRequests = snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest));
      
    }, (error) => {
      console.error('error snapshot:', error);
    });

    //automatic cleanup when currentUser change or the component is destroyed
    return () => {
      unsubscribe();
    }; 
  });

  async function handleSearch() {
    searchError = '';
    searchResult = null;
    searchLoading = true;
    try {
      const user = await findUserByUsername(searchUsername);
      if (!user) { searchError = 'User not found'; }
      else searchResult = user;
    } catch {
      searchError = 'Error during the search';
    } finally {
      searchLoading = false;
    }
  }

  async function handleSendRequest() {
    sendingRequestLoading = true;
    if (!searchResult) { return; }
    if (searchResult.uid === authStore.appUser!.uid){
      requestMessage = 'Cannot send a request to yourself';
      return;
    }
    try {

      await sendFriendRequest(searchResult.uid);
      requestMessage = 'Request send!';
      searchResult = null;
      searchUsername = '';

    } catch (e: any) {
      switch (e.code) {
        case 'social/request-already-sent':
          requestMessage = 'Request already sent';
          break;
        case 'already-friends':
          requestMessage = 'You two are already friends';
          break;
        default:
          requestMessage = 'Sending error';
      }
    }finally{
      sendingRequestLoading = false;
    }
  }

  async function handleAccept(request: FriendRequest) {
    requestHandleLoading = true;
    try{
      await acceptFriendRequest(request);
    } finally {
      requestHandleLoading = false;
    }
  }

  async function handleReject(request: FriendRequest) {
    requestHandleLoading = true;
    try{
      await rejectFriendRequest(request.id);
    } finally {
      requestHandleLoading = false;
    }
  }
</script>

<div class="social-wrapper">
  <section class="social-section">
    <h3>Add Friend</h3>
    <div class="search-box">
      <input type="text" placeholder="Username..." bind:value={searchUsername} />
      <button onclick={handleSearch} disabled={searchLoading}>
        {searchLoading ? '...' : 'Search'}
      </button>
    </div>

    {#if searchError}
      <p class="error-text">{searchError}</p>
    {/if}

    {#if searchResult}
      <div class="search-result">
        <span>Found: <strong>{searchResult.username}</strong></span>
        <button class="btn-action" onclick={handleSendRequest} disabled={sendingRequestLoading}>
          {sendingRequestLoading ? 'Sending...' : 'Add'}
        </button>
      </div>
    {/if}

    {#if requestMessage}
      <p class="info-text">{requestMessage}</p>
    {/if}
  </section>

  <section class="social-section">
    <h3>Incoming Requests ({incomingRequests.length})</h3>
    {#if incomingRequests.length === 0}
      <p class="empty-text">No pending requests</p>
    {:else}
      <div class="list-container">
        {#each incomingRequests as request}
          <div class="request-row">
            <span class="name">{request.fromUsername}</span>
            <div class="row-actions">
              <button class="btn-accept" onclick={() => handleAccept(request)} disabled={requestHandleLoading}>✓</button>
              <button class="btn-reject" onclick={() => handleReject(request)} disabled={requestHandleLoading}>✕</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="social-section">
    <h3>Friends List ({friends.length})</h3>
    {#if friends.length === 0}
      <p class="empty-text">No friends yet</p>
    {:else}
      <div class="list-container">
        {#each friends as friend}
          <div class="friend-row">
            <span class="status-dot status-{friend.status ?? 'offline'}"></span>
            <span>{friend.username}</span>
            <span class="status-label status-label-{friend.status ?? 'offline'}">
              {friend.status === 'free' ? 'Online' : friend.status === 'busy' ? 'Busy' : 'Offline'}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>