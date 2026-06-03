<script lang="ts">
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { authStore } from '$lib/stores/auth.svelte';
    import { gameStore } from '$lib/stores/game.svelte';
    import {
        subscribeGame,
        performAction,
        chooseDrop,
        skipDrop,
        levelUp
    } from '$lib/firebase/game';
    import type { Game, GamePlayer, GameEnemy, MoveInstance } from '$lib/types';
	import { onMount, tick } from 'svelte';
    import { collection, getDocs } from 'firebase/firestore';
    import { db } from '$lib/firebase/clientSDK';
    import type { ScrollData } from '$lib/types';

    let scrollsData = $state<Record<string, ScrollData>>({});

    let gameId = $derived($page.params.gameId as string);
    let game = $derived(gameStore.currentGame);
    let myUid = $derived(authStore.appUser?.uid ?? '');

    //local state of the UI
    let selectedScrollId = $state<string | null>(null);
    let selectedTargetId = $state<string | null>(null);
    let replaceScrollId = $state<string | null>(null);
    let loading = $state(false);
    let showReplaceModal = $state(false);
    let pendingDropScrollId = $state<string | null>(null);

    //utils derived
    let myPlayer = $derived(game?.players.find(p => p.uid === myUid) ?? null);
    let isMyTurn = $derived(game?.phase === 'player_turn' && game?.turnOrder[game?.currentActorIndex] === myUid);
    let isDropChooser = $derived(game?.phase === 'drop_phase' && game?.players[game?.dropChooserIndex]?.uid === myUid);
    let isLevelUp = $derived(game?.phase === 'level_up' && game?.pendingLevelUps.includes(myUid));

  //background picture, change based on wins
    let background = $derived(() =>{
        const wins = game?.winsCount ?? 0;
        if (wins <  10) { return '/backgrounds/castle.png';}
        if (wins <  20) { return '/backgrounds/lab.png';}
        return '/backgrounds/inferno.png'
    });

    let isMultiTarget = $derived(
        selectedScrollId ? scrollsData[selectedScrollId]?.target === 'multi' : false
    );

    onMount(async () => {
        const snap = await getDocs(collection(db, 'scrolls'));
        const data: Record<string, ScrollData> = {};
        snap.docs.forEach(d => { data[d.id] = d.data() as ScrollData; });
        scrollsData = data;
    });


    $effect(() =>{
        const gId = gameId;
        if (!gId) { return; }

        const unsubscribe = subscribeGame(gId, async (updatedGame) => {
                const prev = gameStore.currentGame;

                //generate combat log's message
                if (prev && updatedGame) {
                    generateLogs(prev, updatedGame);
                }

                gameStore.setGame(updatedGame);

                if (updatedGame.phase === 'game_over') {
                    await tick();
                    setTimeout(() => goto('/home'), 3000);
                }
            });

            return () => {
                unsubscribe();
                gameStore.setGame(null);
                gameStore.clearLog();
            }
    });


    function generateLogs(prev: Game, next: Game) {
        //log for damage dealt to enemies
        for(const nextEnemy of next.enemies) {
            const prevEnemy = prev.enemies.find(
                e => e.instanceId === nextEnemy.instanceId
            )
            if(prevEnemy && nextEnemy.hp < prevEnemy.hp) {
                const dmg = prevEnemy.hp - nextEnemy.hp;
                gameStore.addLog(`${nextEnemy.name} take ${dmg} damage`);
            }
        }

        //log for dead enemies
        for(const prevEnemy of prev.enemies){
            const stillAlive = next.enemies.find(
                e => e.instanceId === prevEnemy.instanceId
            );
            if (!stillAlive) {
                gameStore.addLog(`${prevEnemy.name} has been defeated`);
            }
        }

        //log for damage dealt to players
        for (const nextPlayer of next.players) {
            const prevPlayer = prev.players.find(p => p.uid === nextPlayer.uid);
            if (prevPlayer && nextPlayer.stats.hp < prevPlayer.stats.hp) {
                const dmg = prevPlayer.stats.hp - nextPlayer.stats.hp;
                gameStore.addLog(`${nextPlayer.username} take ${dmg} damage`);
            }
            if (prevPlayer && nextPlayer.stats.hp > prevPlayer.stats.hp) {
               const heal = nextPlayer.stats.hp - prevPlayer.stats.hp;
               gameStore.addLog(` ${nextPlayer.username} recovery ${heal} HP`);
            }
        }

        //log for applied status
        for (const nextEnemy of next.enemies) {
            const prevEnemy = prev.enemies.find(e => e.instanceId === nextEnemy.instanceId);
            if (!prevEnemy) continue;

            for (const status of nextEnemy.activeStatuses ?? []) {
                const hadStatus = prevEnemy.activeStatuses.find(s => s.id === status.id);
                if (!hadStatus) {
                    gameStore.addLog(`${nextEnemy.name} is affected by ${status.id}`);
                }
            }
        }

        // log for player's status
        for (const nextPlayer of next.players) {
            const prevPlayer = prev.players.find(p => p.uid === nextPlayer.uid);
            if (!prevPlayer) continue;

            for (const status of nextPlayer.activeStatuses ?? []) {
                const hadStatus = prevPlayer.activeStatuses.find(s => s.id === status.id);
                if (!hadStatus) {
                    gameStore.addLog(`${nextPlayer.username} is affected by ${status.id}`);
                }
            }
        }

        //log phase
        if(prev.phase !== next.phase) {
            if (next.phase === 'drop_phase') {
                gameStore.addLog('Drop phase');
            }
            if (next.phase === 'level_up') {
                gameStore.addLog('Level up!');
            }
            if (next.phase === 'game_over') {
                gameStore.addLog('GAME OVER!');
            }
        }
    }

    async function handleAttack() {

        if (!selectedScrollId || !game) { return; }
        const scroll = myPlayer?.moves.find(m => m.scrollId === selectedScrollId);
        if (!scroll) { return; }

        //Multi-target moves do not require target
        loading = true;
        try {
            await performAction(gameId, {
                type: 'attack',
                scrollId: selectedScrollId,
                targetId: selectedTargetId ?? undefined
            });
            selectedScrollId = null;
            selectedTargetId = null
        } finally { 
            loading = false
        }
    }

    async function handleDefend() {
        loading = true;
        try {
            await performAction(gameId, { type: 'defend' });
        } finally {
            loading = false;
        }
    }

    async function handleChooseDrop(scrollId: string) {
        if (!myPlayer || !game) { return; }

        const alreadyHasMove = myPlayer.moves.some(m => m.scrollId === scrollId);

        if (myPlayer.moves.length >= 3 && !alreadyHasMove) {
            pendingDropScrollId = scrollId;
            showReplaceModal = true;
            return;
        }
        loading = true;
        try {
            await chooseDrop(gameId, scrollId);
        } finally {
            loading = false;
        }
    }

    async function handleConfirmReplace() {
        if(!pendingDropScrollId || !replaceScrollId) { return; }
        loading = true;

        try {
            await chooseDrop(gameId, pendingDropScrollId, replaceScrollId);
            showReplaceModal = false;
            pendingDropScrollId = null;
            replaceScrollId = null;
        } finally {
            loading = false;
        } 
    }

    async function handleSkipDrop() {
        loading = true;
        try {
        await skipDrop(gameId);
        } finally {
        loading = false;
        }
    }



    async function handleLevelUp(stat: 'will' | 'knowledge' | 'intuition' | 'cunning') {
        loading = true;
        try {
            await levelUp(gameId, stat);
        } finally {
            loading =  false;
        }
    }
  
</script>

{#if game}
    <!-- MAIN CONTAINER-->
    <div 
        class="game-container"
        style="background-image: url({background()})"
    >

    <div class="score-display">
        <span>wins: {game.winsCount}</span>
        <span>points: {game.winsCount * 10}</span>
    </div>
        <!-- BATTLEFIELD -->
        <div class="battlefield">

            <!--PLAYER (on the left)-->

            <div class="players-side">
                {#each game.players as player}
                    <button
                        class="sprite-container"
                        class:selected={selectedTargetId === player.uid}
                        class:dead={player.stats.hp<=0}
                        class:active={game.turnOrder[game.currentActorIndex] === player.uid}
                        onclick={() => {
                            if (isMyTurn && selectedScrollId && !isMultiTarget) {
                                selectedTargetId = player.uid;
                            }
                        }}
                       
                    >
                        <img
                        src="/sprites/{player.sprite}_idle.png"
                        alt={player.username}
                        class="sprite"
                        />
                        <!-- life bar -->
                        <div class="player-hp-bar">
                            <div
                                class="player-hp-fill"
                                style="width: {(player.stats.hp /player.stats.maxHp) *100}%"
                            ></div>
                        </div>
                        <!-- energy bar-->
                        <div class="player-energy-bar">
                            <div
                                class="player-energy-fill"
                                style="width: {(player.stats.energy /player.stats.maxEnergy) *100}%"
                            ></div>
                        </div>

                        {#if player.stats.hp <= 0}
                            <span class="dead-label">DEAD</span>
                        {/if}

                        <span class="player-name">{player.username}</span>
                    </button>
                {/each}
            </div>

            <!--ENEMIES (on the right)-->
            <div class="enemies-side">
                {#each game.enemies as enemy}
                    <button
                        class="sprite-container enemy"
                        class:selected={selectedTargetId === enemy.instanceId}
                        class:active={game.turnOrder[game.currentActorIndex] === enemy.instanceId}
                        onclick={() => {
                            if (isMyTurn && selectedScrollId && !isMultiTarget) {
                                selectedTargetId = enemy.instanceId;
                            }
                        }}
                    >
                        <img
                            src = "/sprites/{enemy.sprite}_idle.png"
                            alt = {enemy.name}
                            class="sprite"
                        />

                        <!-- enemy life bar-->
                        <div class="enemy-hp-bar">
                            <div
                                class="enemy-hp-fill"
                                style="width: {(enemy.hp /enemy.maxHp) *100}%"
                            ></div>
                        </div>
                        <!-- enemy energy bar -->
                        <div class="enemy-energy-bar">
                            <div
                                class="enemy-energy-fill"
                                style="width: {(enemy.energy /enemy.maxEnergy) *100}%"
                            ></div>
                        </div>
                        <span class="enemy-name">{enemy.name}</span>    
                        <!-- enemy active status-->
                        {#if enemy.activeStatuses.length > 0}
                            <div class="enemy-statuses">
                                {#each enemy.activeStatuses ?? [] as status}
                                    <span class="status-badge enemy-status">{status.id}</span>
                                {/each}
                            </div>
                        {/if}
                    </button>
                {/each}
            </div>

        </div>

        <div class="turn-order">
            {#each game.turnOrder as actorId, i}
                {@const player = game.players.find(p => p.uid === actorId)}
                {@const enemy = game.enemies.find(e => e.instanceId === actorId)}
                <div
                    class="turn-token"
                    class:current={i === game.currentActorIndex}
                    class:is-enemy={!!enemy}
                >
                    {player?.username ?? enemy?.name ?? '?'}
                </div>
            {/each}
        </div>

        <!--PLAYER'S BOARD (bottom) -->
        <div class="hud">

            <!-- PLAYERS: names, hp and energy -->
            <div class="players-hu">
                {#each game.players as player}
                    <div class="player-card" class:my-turn={game.turnOrder[game.currentActorIndex] === player.uid}>
                        <span class="player-name">{player.username}</span>
                        <div class="bar-row">
                            <span class="bar-label">HP</span>
                            <div class="bar">
                                <div
                                    class="bar-fill hp"
                                    style="width: {Math.max(0, (player.stats.hp / player.stats.maxHp) * 100)}%"
                                ></div>
                            </div>
                            <span class="bar-value">{player.stats.hp}/{player.stats.maxHp}</span>
                        </div>
                        <div class="bar-row">
                            <span class="bar-label">EN</span>
                            <div class="bar">
                                <div 
                                    class="bar-fill energy"
                                    style="width: {(player.stats.energy / player.stats.maxEnergy) * 100}%"
                                ></div>
                            </div>
                            <span class="bar-value">{player.stats.energy}/{player.stats.maxEnergy}</span>
                        </div>
                    </div>
                {/each}
            </div>


            <!-- CENTRAL SECTION: move + stats + chat-->
            <div class="center-hud">

                 <!-- MOVES (only if is my turn)-->
                {#if myPlayer}
                    <div class="moves-panel">
                        <h3>Your moves</h3>

                        {#if !isMyTurn && game.phase === 'player_turn'}
                            <p class="turn-warning">
                                Waiting for {game.players.find(p => p.uid === game.turnOrder[game.currentActorIndex])?.username}'s turn...
                            </p>
                        {/if}
                        {#each myPlayer.moves as move}
                            {@const scroll = scrollsData[move.scrollId]}
                            <button
                                class="move-btn"
                                class:selected={selectedScrollId === move.scrollId}
                                disabled={!isMyTurn || !scroll || myPlayer.stats.energy < scroll.energyCost * move.level || loading}
                                onclick={() => {
                                    selectedScrollId = move.scrollId;
                                    selectedTargetId = null;
                                }}
                            >
                             <span class="move-name">{scroll?.name ?? move.scrollId}</span>
                                <span class="move-stats">
                                    Lv.{move.level} |
                                    {scroll?.damage ? `damage: ${scroll.damage * move.level}` : ''}
                                    {scroll?.heal ? `heal: ${scroll.heal * move.level}` : ''}
                                    {scroll?.statusEffect ? `status: ${scroll.statusEffect}` : ''}
                                    {scroll?.target ? `target type: ${scroll.target}` : ``}
                                    Energy cost {(scroll?.energyCost ?? 0) * move.level}
                                </span>
                        </button>
                        {/each}
                            {#if selectedScrollId && !isMultiTarget && !selectedTargetId}
                                <p class="hint">Select a target</p>
                            {/if}

                            <div class="action-buttons">
                                <button
                                    onclick={handleAttack}
                                    disabled={!isMyTurn || !selectedScrollId || loading || (!isMultiTarget && !selectedTargetId)}
                                >
                                    Cast
                                </button>
                                <button 
                                    onclick={handleDefend}
                                    disabled={!isMyTurn || loading}
                                >
                                    Parry
                                </button>
                            </div>
                </div>
                {/if}

            </div>

            <!--DROP PHASE-->
            {#if game.phase === 'drop_phase' && game.drop}
                <div class="drop-panel">
                    {#if isDropChooser}
                        <h3>Choose one scroll</h3>
                        {#each game.drop as scrollId }
                            <button
                                onclick={() => handleChooseDrop(scrollId)}
                                disabled={loading}
                            >
                                <img src="/icons/scroll.png" alt="scroll" class="scroll-icon" />
                                {scrollId}
                            </button>
                        {/each}
                        <button onclick={handleSkipDrop} disabled={loading}> Skip </button>
                    {:else}
                        <p> {game.players[game.dropChooserIndex]?.username}'s choosing</p>
                    {/if}
                </div>
            {/if}

            <!-- LEVEL UP -->
            {#if isLevelUp}
                <div class="levelup-panel">
                    <h3>Level Up! Scegli una statistica</h3>
                    <button onclick={() => handleLevelUp('will')}>Will (+ HP)</button>
                    <button onclick={() => handleLevelUp('knowledge')}>Knowledge (+ Energy)</button>
                    <button onclick={() => handleLevelUp('intuition')}>Intuition (+ Priority)</button>
                    <button onclick={() => handleLevelUp('cunning')}>Cunning (+ Energy regen)</button>
                </div>
            {/if}

            <!-- GAME OVER -->
            {#if game.phase === 'game_over'}
                <div class="gameover-panel">
                    <h2>Game Over</h2>
                    <p>:Levels Exceeded {game.winsCount}</p>
                    <p>Back to home...</p>
                </div>
            {/if}

            <!--STATS AND STATUS-->
            {#if myPlayer}
                <div class="stats-panel">
                    <h3>Your stats</h3>
                    <p>Will: {myPlayer.stats.will}</p>
                    <p>Knowledge: {myPlayer.stats.knowledge}</p>
                    <p>Intuition: {myPlayer.stats.intuition}</p>
                    <p>Cunning: {myPlayer.stats.cunning}</p>
                    <p>Level: {myPlayer.stats.level}</p>
                    {#if myPlayer.activeStatuses.length>0}
                        <h4>Active status</h4>
                        {#each myPlayer.activeStatuses as status}
                            <span class="status-badge">{status.id} ({status.turnsLeft})</span>
                        {/each}
                    {/if}
                </div>
            {/if}

            <!-- COMBAT LOG -->
            <div class="combat-log">
                {#each gameStore.combatLog as entry}
                <p>{entry}</p>
                {/each}
            </div>
        </div>

    </div>

    <!--MOVE SUBSTITUTION-->
    {#if showReplaceModal && myPlayer}
        <div class="modal-overlay">
            <div class="modal">
                <h3>Choose which move to replace</h3>
                {#each  myPlayer.moves as move (move.scrollId)}
                    <button class:selected={replaceScrollId === move.scrollId} onclick={() => replaceScrollId =  move.scrollId}>
                        {move.scrollId} (Lv.{move.level})
                    </button>
                {/each}

                <button onclick={handleConfirmReplace} disabled={!replaceScrollId || loading}>
                    Confirm
                </button>
                
                <button onclick={() => { showReplaceModal = false; pendingDropScrollId = null; }}>
                    Cancel
                </button>
            </div>
        </div>
    {/if}


    {#if game.phase === 'game_over'}
        <div class="gameover-overlay">
            <div class="gameover-content">
                <h1>Game Over</h1>
                <p>total win: {game.winsCount}</p>
                <p>points earned: {game.winsCount * 10 / game.players?.length || 1}</p>
                <p class="redirect-msg">Back to home...</p>
            </div>
    </div>
    {/if}
{:else}
    <p>Loading game...</p>
{/if}


<style>

  .gameover-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .gameover-content {
   text-align: center;
   color: white;
  }

  .gameover-content h1 {
   font-size: 3rem;
   color: #e74c3c;
   margin-bottom: 1rem;
  }

  .redirect-msg {
   color: #999;
   font-size: 0.9rem;
   margin-top: 1rem;
  }

 .game-container {
   width: 100vw;
   height: 100vh;
   display: flex;
   flex-direction: column;
   background-size: cover;
   background-position: center;
   overflow: hidden;
 }

  .battlefield {
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2rem;
  }

  .score-display {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: gold;
  padding: 4px 1rem;
  background: rgba(0,0,0,0.5);
  }

  .players-side, .enemies-side {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }

  .sprite-container {
    position: relative;
    transition: transform 0.2s;
    cursor: pointer;
  }

  .sprite-container.active {
    transform: scale(1.1);
    filter: drop-shadow(0 0 8px gold);
  }

  .sprite-container.selected {
    outline: 3px solid #2ecc71;
    border-radius: 4px;
  }

  .sprite-container.dead {
    opacity: 0.4;
    filter: grayscale(1);
  }

  .sprite-container.enemy {
    cursor: pointer;
  }

  .sprite-container.enemy.selected {
    outline: 3px solid red;
    border-radius: 4px;
  }

  .sprite {
    width: 96px;
    height: 96px;
    image-rendering: pixelated;
  }

  .hint {
  color: #f39c12;
  font-size: 0.8rem;
  margin: 0;
  }

  .player-hp-bar {
    width: 100%;
    height: 6px;
    background: #f7f6f6;
    border-radius: 3px;
    margin-top: 4px;
  }

  .player-hp-fill {
    height: 100%;
    background: #30e542;
    border-radius: 3px;
    transition: width 0.3s;
  }

  .player-energy-fill {
    height: 100%;
    background: #0ddbdb;
    border-radius: 3px;
    transition: width 0.3s;
  }

  .player-energy-bar {
    width: 100%;
    height: 6px;
    background: #949595;
    border-radius: 3px;
    margin-top: 4px;
  }

  .enemy-statuses {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: center;
}

.enemy-status {
  font-size: 0.6rem;
  background: rgba(231, 76, 60, 0.6);
  padding: 1px 4px;
  border-radius: 3px;
  color: white;
}


  .enemy-hp-bar {
    width: 100%;
    height: 6px;
    background: #333;
    border-radius: 3px;
    margin-top: 4px;
  }

  .enemy-hp-fill {
    height: 100%;
    background: #e74c3c;
    border-radius: 3px;
    transition: width 0.3s;
  }

  .enemy-energy-bar {
    width: 100%;
    height: 6px;
    background: #333;
    border-radius: 3px;
    margin-top: 4px;
  }

  .enemy-energy-fill {
    height: 100%;
    background: #eb0feb;
    border-radius: 3px;
    transition: width 0.3s;
  }

  

  .enemy-name {
    display: block;
    text-align: center;
    font-size: 0.75rem;
    color: white;
    text-shadow: 1px 1px 2px black;
  }

  /* HUD */
  .hud {
    display: flex;
    gap: 1rem;
    background: rgba(0, 0, 0, 0.85);
    border-top: 2px solid #4B365F;
    padding: 1rem;
    height: 280px;
    overflow: hidden;
  }

  .player-card {
    background: rgba(75, 54, 95, 0.4);
    border: 1px solid #4B365F;
    border-radius: 6px;
    padding: 0.5rem;
  }

  .player-card.my-turn {
    border-color: gold;
    box-shadow: 0 0 6px gold;
  }

  .player-name {
    margin-top: 8px;
    font-size: 0.8rem;
    color: #e0e0e0;
    font-weight: bold;
    display: block;
    margin-bottom: 4px;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 2px;
  }

  .bar-label {
    font-size: 0.65rem;
    color: #999;
    width: 20px;
  }

  .bar {
    flex: 1;
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }

  .bar-fill.hp { background: #2ecc71; }
  .bar-fill.energy { background: #3498db; }

  .bar-value {
    font-size: 0.6rem;
    color: #ccc;
    width: 40px;
    text-align: right;
  }

  /* CENTER */
  .center-hud {
    flex: 1;
    overflow-y: auto;
    color: #e0e0e0;
  }

  .moves-panel, .drop-panel, .levelup-panel,
  .waiting-panel, .gameover-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .move-btn {
    background: rgba(75, 54, 95, 0.6);
    border: 1px solid #4B365F;
    color: #e0e0e0;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
  }

  .move-btn.selected {
    border-color: gold;
    background: rgba(255, 215, 0, 0.2);
  }

  .move-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .scroll-icon {
    width: 24px;
    height: 24px;
    vertical-align: middle;
    image-rendering: pixelated;
  }

  /* STATS */
  .stats-panel {
    min-width: 150px;
    color: #ccc;
    font-size: 0.8rem;
  }

  .status-badge {
    display: inline-block;
    background: #4B365F;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 0.7rem;
    margin: 2px;
    color: #e0e0e0;
  }

  /* COMBAT LOG */
  .combat-log {
    min-width: 180px;
    max-height: 260px;
    overflow-y: auto;
    font-size: 0.75rem;
    color: #ccc;
    border-left: 1px solid #4B365F;
    padding-left: 0.5rem;
  }

  .combat-log p {
    margin: 2px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    padding-bottom: 2px;
  }

  /* MODAL */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: #1a1a2e;
    border: 2px solid #4B365F;
    border-radius: 8px;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 300px;
  }

  h3 { color: #e0e0e0; margin: 0 0 0.5rem; }
  h4 { color: #ccc; margin: 0.5rem 0 0.25rem; }

  button {
    background: rgba(75, 54, 95, 0.6);
    border: 1px solid #4B365F;
    color: #e0e0e0;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }

  button.sprite-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  button.sprite-container.enemy {
    cursor: pointer;
  }

  button:hover { background: rgba(75, 54, 95, 0.9); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  button.selected { border-color: gold; }


  .turn-order {
  display: flex;
  gap: 4px;
  padding: 4px 1rem;
  background: rgba(0,0,0,0.6);
  overflow-x: auto;
}

.turn-token {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  color: #ccc;
  background: rgba(255,255,255,0.1);
  white-space: nowrap;
}

.turn-token.current {
  background: gold;
  color: black;
  font-weight: bold;
}

.turn-token.is-enemy {
  color: #e74c3c;
  border: 1px solid #e74c3c;
}
</style>