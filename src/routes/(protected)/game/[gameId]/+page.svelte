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

    import Sprite from '$lib/components/game/sprite.svelte';

    import '$lib/styles/game.css';
    import '$lib/styles/sprite.css';

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
    let deadEnemies = $state<GameEnemy[]>([]);

    //utils derived
    let myPlayer = $derived(game?.players.find(p => p.uid === myUid) ?? null);
    let isMyTurn = $derived(game?.phase === 'player_turn' && game?.turnOrder[game?.currentActorIndex] === myUid);
    let isDropChooser = $derived(game?.phase === 'drop_phase' && game?.players[game?.dropChooserIndex]?.uid === myUid);
    let isLevelUp = $derived(game?.phase === 'level_up' && game?.pendingLevelUps.includes(myUid));

    //animation
    const ANIM_DELAY = 600;  //ms between one animation and another one
    let playerAnims = $state<Record<string, 'idle' | 'attack' | 'hit' | 'death'>>({});
    let enemyAnims = $state<Record<string, 'idle' | 'attack' | 'hit' | 'death'>>({});

    let prevGame = $state<Game | null>(null);
    let gameOverCountdown = $state(5);
    let gameOverInterval: ReturnType<typeof setInterval> | null = null;
    
    //queue for serialize animation
    let animQueue = Promise.resolve();

    function enqueueAnim(fn: () => Promise<void>) {
        animQueue = animQueue.then(fn).catch(() => {});
    }

    //background picture, change based on wins
    let background = $derived(() =>{
        const wins = game?.winsCount ?? 0;
        if (wins <  3) { return '/backgrounds/castle.png';}
        if (wins <  6) { return '/backgrounds/lab.png';}
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
                const snapshot = prevGame;
                //generate combat log's message
                if (snapshot && updatedGame) {
                    enqueueAnim(() => generateLogs(snapshot, updatedGame));
                } else {
                    updatedGame.players.forEach(p => {
                        playerAnims[p.uid] = 'idle';
                    });
                    updatedGame.enemies.forEach(e =>{
                        enemyAnims[e.instanceId] = 'idle';
                    });
                    playerAnims = {...playerAnims};
                    enemyAnims = {...enemyAnims};
                }

                prevGame = updatedGame;
                gameStore.setGame(updatedGame);

                if (updatedGame.phase === 'game_over'  && !gameOverInterval) {
                    await tick();
                    gameOverCountdown = 5;
                    gameOverInterval = setInterval(() => {
                        gameOverCountdown--;
                        if (gameOverCountdown <= 0) {
                            clearInterval(gameOverInterval!);
                            gameOverInterval = null;
                            goto('/home');
                        }
                    }, 1000);
                }
            });

            return () => {
                unsubscribe();
                gameStore.setGame(null);
                gameStore.clearLog();
                prevGame = null;
                if (gameOverInterval) {
                    clearInterval(gameOverInterval);
                    gameOverInterval = null;
                }   
        };
    });

    //update animation when game state change
    $effect(() => {
        if (!game) {return;}
        //intialize with idle animation for all the actors
        game.players.forEach(p => {
            if (!playerAnims[p.uid]) { playerAnims[p.uid] = 'idle'; }
            if (p.stats.hp <= 0 && playerAnims[p.uid] !== 'death') {
                playerAnims[p.uid] = 'death';
            }
        });

        game.enemies.forEach(e => {
            //only if it does not yet exist
            if (!(e.instanceId in enemyAnims)) {
                enemyAnims[e.instanceId] = 'idle';
            }
        });
    });

    //when a player attack call this function
    function triggerAttackAnim(actorId: string, isEnemy: boolean) {
        if (isEnemy) {
            enemyAnims[actorId] = 'attack';
            enemyAnims = {...enemyAnims};
        } else {
            playerAnims[actorId] = 'attack';
            playerAnims = {...playerAnims};
        }
    }

    // chiama questo quando qualcuno viene colpito
    function triggerHitAnim(targetId: string, isEnemy: boolean) {
        if (isEnemy) {
            enemyAnims[targetId] = 'hit';
            enemyAnims = {...enemyAnims};
        } else {
            playerAnims[targetId] = 'hit';
            playerAnims = {...playerAnims};
        }
    }

   async function generateLogs(prev: Game, next: Game) {
        
        //log for damage dealt to enemies
        for(const nextEnemy of next.enemies) {
            const prevEnemy = prev.enemies.find(
                e => e.instanceId === nextEnemy.instanceId
            )
            if(prevEnemy && nextEnemy.hp < prevEnemy.hp) {
                const dmg = prevEnemy.hp - nextEnemy.hp;
                gameStore.addLog(`⚔️  ${nextEnemy.name} take ${dmg} damage`, 'damage-enemy');
                triggerHitAnim(nextEnemy.instanceId, true);
                await new Promise(r => setTimeout(r, ANIM_DELAY));
            }
        }

        //log for dead enemies
        for(const prevEnemy of prev.enemies){
            const stillAlive = next.enemies.find(
                e => e.instanceId === prevEnemy.instanceId
            );
            if (!stillAlive) {
                
                deadEnemies = [...deadEnemies, prevEnemy];
                enemyAnims[prevEnemy.instanceId] = 'death';
                enemyAnims = {...enemyAnims};

                gameStore.addLog(`💀 ${prevEnemy.name} defeated`, 'death');
                await new Promise(r => setTimeout(r, ANIM_DELAY * 1.5));//death is longer

                deadEnemies = deadEnemies.filter(
                    e => e.instanceId !== prevEnemy.instanceId
                );
            }
        }

        
        for (const nextPlayer of next.players) {
            const prevPlayer = prev.players.find(p => p.uid === nextPlayer.uid);
            if (!prevPlayer) continue;
            //player take damage
            if (nextPlayer.stats.hp < prevPlayer.stats.hp) {
                const dmg = prevPlayer.stats.hp - nextPlayer.stats.hp;

                //find the enemy that have spent energy
                const attackingEnemy = (() =>{
                    //use prev's currentActorIndex (is the enemy that has just performed)
                    const prevActorId = prev.turnOrder[prev.currentActorIndex];
                    const actorEnemy = prev.enemies.find(e => e.instanceId === prevActorId);
                    if (actorEnemy) { return actorEnemy; }
                    
                    //search who has spent energy
                    const byEnergy = prev.enemies.find(prevE => {
                        const nextE = next.enemies.find(e => e.instanceId === prevE.instanceId);
                        if (nextE) { return nextE.energy < prevE.energy;}
                        return (prevE.energy > 0)
                    });
                    if (byEnergy) { return byEnergy; }

                    //first alive enemy
                    return prev.enemies.find(e =>
                        next.enemies.some(ne => ne.instanceId === e.instanceId && ne.hp > 0)
                    );
                })();

                if (attackingEnemy) {
                    //show enemy attack
                    enemyAnims[attackingEnemy.instanceId] = 'attack';
                    enemyAnims = {...enemyAnims};
                    await new Promise(r => setTimeout(r, ANIM_DELAY));
                }

                gameStore.addLog(`🩸 ${nextPlayer.username} take ${dmg} damage`, 'damage-player');
                triggerHitAnim(nextPlayer.uid, false);
                await new Promise(r => setTimeout(r, ANIM_DELAY));
            }
            //player get healed
            if (nextPlayer.stats.hp > prevPlayer.stats.hp) {
               const heal = nextPlayer.stats.hp - prevPlayer.stats.hp;
               gameStore.addLog(`💚 ${nextPlayer.username} recovery ${heal} HP`, 'heal');
            }
            //player died
            if (nextPlayer.stats.hp <= 0 && prevPlayer.stats.hp > 0) {
                await new Promise(r => setTimeout(r, ANIM_DELAY));
                playerAnims[nextPlayer.uid] = 'death';
                playerAnims = {...playerAnims};
                await new Promise(r => setTimeout(r, ANIM_DELAY * 1.5));
            }
        }

        //log for applied status to enemies
        for (const nextEnemy of next.enemies) {
            const prevEnemy = prev.enemies.find(e => e.instanceId === nextEnemy.instanceId);
            if (!prevEnemy) continue;

            for (const status of nextEnemy.activeStatuses ?? []) {
                const hadStatus = prevEnemy.activeStatuses.find(s => s.id === status.id);
                if (!hadStatus) {
                    gameStore.addLog(`⬇️ ${nextEnemy.name} is affected by ${status.id}`, 'status-enemy');
                }
                triggerHitAnim(nextEnemy.instanceId, true);
                await new Promise(r => setTimeout(r, ANIM_DELAY));
            }
        }

        // log for player's status
        for (const nextPlayer of next.players) {
            const prevPlayer = prev.players.find(p => p.uid === nextPlayer.uid);
            if (!prevPlayer) continue;

            for (const status of nextPlayer.activeStatuses ?? []) {
                const hadStatus = prevPlayer.activeStatuses.find(s => s.id === status.id);
                if (!hadStatus) {
                    gameStore.addLog(`🌀 ${nextPlayer.username} is affected by ${status.id}`, 'status-player');
                }
                triggerHitAnim(nextPlayer.uid, false);
                await new Promise(r => setTimeout(r, ANIM_DELAY));
            }
        }

        //log phase
        if(prev.phase !== next.phase) {
            if (next.phase === 'drop_phase') {
                deadEnemies = [];
                gameStore.addLog('📜 Drop phase', 'phase');
            }
            if (next.phase === 'level_up') {
                gameStore.addLog('💡 Level up!', 'phase');
            }
        }
    }

    async function handleAttack() {

        if (!selectedScrollId || !game) { return; }
        const scroll = myPlayer?.moves.find(m => m.scrollId === selectedScrollId);
        if (!scroll) { return; }
        loading = true;
        triggerAttackAnim(myUid, false);
        await new Promise(r => setTimeout(r, ANIM_DELAY));

        //Multi-target moves do not require target
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
        await new Promise(r => setTimeout(r, ANIM_DELAY))
    }

    async function handleDefend() {
        loading = true;

        playerAnims[myUid] = 'hit';
        playerAnims = {...playerAnims};
        try {
            await performAction(gameId, { type: 'defend' });
        } finally {
            loading = false;
        }
        await new Promise(r => setTimeout(r, ANIM_DELAY))
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
                        aria-label={player.username}
                        disabled={player.stats.hp <= 0}
                    >
                        <Sprite
                            spriteName = {player.sprite}
                            animation={playerAnims[player.uid] ?? 'idle'}
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

                        <!--active status -->
                        {#if player.activeStatuses.length > 0}
                            <div class="enemy-statuses">
                                {#each player.activeStatuses ?? [] as status}
                                    <span class="status-badge enemy-status">{status.id}</span>
                                {/each}
                            </div>
                        {/if}

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
                        aria-label={enemy.name}
                    >
                        <Sprite
                            spriteName={enemy.sprite}
                            animation={enemyAnims[enemy.instanceId] ?? 'idle'}
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

                {#each deadEnemies as enemy}
                    <div class="sprite-container dead">
                        <Sprite
                            spriteName={enemy.sprite}
                            animation="death"
                        />
                        <span class="enemy-name">{enemy.name}</span>
                     </div>
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
                                Waiting for {game.players.find(p => p.uid === game.turnOrder[game.currentActorIndex])?.username ?? 'enemy'}'s turn...
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
                    <h3>Level Up! Choose one stats</h3>
                    <button onclick={() => handleLevelUp('will')} disabled={loading}>Will (+ HP)</button>
                    <button onclick={() => handleLevelUp('knowledge')}  disabled={loading}>Knowledge (+ Energy)</button>
                    <button onclick={() => handleLevelUp('intuition')}  disabled={loading}>Intuition (+ Priority)</button>
                    <button onclick={() => handleLevelUp('cunning')}  disabled={loading}>Cunning (+ Energy regen)</button>
                </div>
            {/if}

            <!--STATS AND STATUS-->
            {#if myPlayer}
                <div class="stats-panel">
                    <h3>Your stats</h3>
                    <p>Will: {myPlayer.stats.will}</p>
                    <p>Knowledge: {myPlayer.stats.knowledge}</p>
                    <p>Intuition: {myPlayer.stats.intuition}</p>
                    <p>Cunning: {myPlayer.stats.cunning} | Energy Reg. : {5 + (myPlayer.stats.cunning * 2)}</p>
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
                <p class="log-{entry.type}">{entry.message}</p>
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

    <!-- GAME OVER -->
    {#if game.phase === 'game_over'}
        <div class="gameover-overlay">
            <div class="gameover-content">
                <h1>Game Over</h1>
                <p>Victories: {game.winsCount}</p>
                <p>Points earned: {Math.floor(game.winsCount * 10 / (game.players?.length || 1))}</p>
                <p class="redirect-msg">Returning to home in {gameOverCountdown}...</p>
            </div>
        </div>
    {/if}
{:else}
    <p>Loading game...</p>
{/if}
