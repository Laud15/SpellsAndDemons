<!-- src/routes/(protected)/home/+page.svelte -->
<script lang="ts">
  import { logout } from '$lib/firebase/auth';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';
	import FriendSystem from '$lib/components/social/FriendSystem.svelte';
  
  let username = $derived(authStore.appUser?.username);
  
  async function handleLogout() {
    await logout();
    goto('/login');
  }
</script>

<h1>Home</h1>
<p> welcome {username}!</p>
<button onclick={handleLogout}>Logout</button>

<FriendSystem />
