<script lang="ts">
  import {
    findUserByUsername,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    getIncomingRequests
  } from '$lib/firebase/social';
  import { collection, query, where, onSnapshot } from 'firebase/firestore';
  import { db } from '$lib/firebase/clientSDK';
  import type { FriendRequest } from '$lib/types';
  import { authStore } from '$lib/stores/auth.svelte';
  

  interface Friend {
    uid: string;
    username: string;
  }

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
      collection(db, 'usernames'),
      where('uid', 'in', currentUser.friends)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      friends = snap.docs.map(d => ({
        uid: d.data().uid,
        username: d.data().username || d.id
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

<!-- research user -->
<section>
  <h2>Add friend</h2>
  <input
    type="text"
    placeholder="Username"
    bind:value={searchUsername}
  />
  <button onclick={handleSearch} disabled={searchLoading}>
    {searchLoading ? 'Searching...' : 'Search'}
  </button>

  {#if searchError}
    <p class="error">{searchError}</p>
  {/if}

  {#if searchResult}
    <p>Find: <strong>{searchResult.username}</strong></p>
    <button onclick={handleSendRequest} disabled={sendingRequestLoading}>
     {sendingRequestLoading ? 'Sending...' : 'Send'}
    </button>
  {/if}

  {#if requestMessage}
    <p>{requestMessage}</p>
  {/if}
</section>

<!-- incoming request -->
<section>
  <h2>Incoming requests</h2>
  {#if incomingRequests.length === 0}
    <p>Ther are not incoming requests</p>
  {:else}
    {#each incomingRequests as request}
      <div>
        <span>{request.fromUsername}</span>
        <button onclick={() => handleAccept(request)} disabled={requestHandleLoading}>
          {requestHandleLoading ? 'Accepting...' : 'Accept'}
        </button>
        <button onclick={() => handleReject(request)} disabled={requestHandleLoading}>
          {requestHandleLoading ? 'Refusing...' : 'Refuse'}
        </button>
      </div>
    {/each}
  {/if}
</section>

<!-- view the friends -->

<section>
  <h2>Friends list</h2>
  {#if friends.length === 0}
    <p>No friends yet</p>
  {:else}
    {#each friends as friend}
      <div>
        <span>{friend.username}</span>
      </div>
    {/each}
  {/if}
</section>