<script lang="ts">

	import { authStore } from "$lib/stores/auth.svelte";
    import type { AppUser } from "$lib/types"
	import { onSnapshot, orderBy, query, collection } from "firebase/firestore";
    import { db } from "$lib/firebase/clientSDK";

    import '$lib/styles/ranking.css'

    let rankingList = $state<AppUser[]>([]);
    

    $effect(() =>{
        const currentUser = authStore.appUser;
        if(!currentUser) { return; }

        const q = query(collection(db, 'users'), orderBy('score'))

        const unsubscribe = onSnapshot(q, (snap) =>{
            rankingList = snap.docs.map(d => ({...d.data()} as AppUser))
            rankingList.sort((a, b) => b.score - a.score)
        });

        return () =>{
            unsubscribe();
        }
    });


</script>

<div class="ranking-container">
  <h1>Global Ranking</h1>
  
  {#if rankingList.length > 0}
    <div class="leaderboard">
        {#each rankingList as player, i}
            <div class="player-row" 
                 class:podium-1={i === 0} 
                 class:podium-2={i === 1} 
                 class:podium-3={i === 2}>
                <span class="rank">#{i+1}</span>
                <span class="username">{player.username}</span>
                <span class="score">{player.score} <small>pts</small></span>
            </div>
        {/each}
    </div>
  {:else}
    <p class="loading">Loading scores...</p>
  {/if}

  <a href="/home" class="back-btn">← Go back</a>
</div>

