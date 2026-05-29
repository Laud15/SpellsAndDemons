<script lang="ts">

	import { authStore } from "$lib/stores/auth.svelte";
    import type { AppUser } from "$lib/types"
	import { onSnapshot, orderBy, query, collection } from "firebase/firestore";
    import { db } from "$lib/firebase/clientSDK";

    let rankingList = $state<AppUser[]>([]);
    

    $effect(() =>{
        const currentUser = authStore.appUser;
        if(!currentUser) { return; }

        const q = query(collection(db, 'users'), orderBy('score'))

        const unsubscribe = onSnapshot(q, (snap) =>{
            rankingList = snap.docs.map(d => ({...d.data()} as AppUser))
        });

        return () =>{
            unsubscribe();
        }
    });


</script>

<h1>Global Ranking</h1>
{#if rankingList.length > 0}
    {#each rankingList as player, i}
        <div>
            <span><strong>#{i+1}</strong> {player.username} : {player.score} score </span>
        </div>
    {/each}
{/if}

<a href="/home">Go back </a>





