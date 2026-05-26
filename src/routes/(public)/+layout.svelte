<script lang="ts">
    import { goto } from '$app/navigation';
    import { authStore } from "$lib/stores/auth.svelte";
    
    let { children } = $props();
    
    $effect(() => {
        if(!authStore.authLoading && authStore.firebaseUser) {
            goto('/home');
        }
    });
</script>

{#if authStore.authLoading}
    <p>loading...</p>
{:else}
    {@render children()}
{/if}