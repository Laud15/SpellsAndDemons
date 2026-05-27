<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';
  
  $effect(() => {
    if (!authStore.authLoading) {
      if (authStore.firebaseUser) {
        goto('/home');
      } else {
        goto('/login');
      }
    }
  });
</script>