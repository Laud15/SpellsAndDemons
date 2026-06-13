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
    import type { Game, GameEnemy} from '$lib/types';
	import { onMount, tick } from 'svelte';
    import { collection, getDocs } from 'firebase/firestore';
    import { db } from '$lib/firebase/clientSDK';
    import type { ScrollData } from '$lib/types';

    import Sprite from '$lib/components/game/sprite.svelte';

    import '$lib/styles/game.css';
    import '$lib/styles/sprite.css';

    //scroll's data from the db
    let scrollsData = $state<Record<string, ScrollData>>({});

    //id of the game, is taken from the url
    let gameId = $derived($page.params.gameId as string);
    //the stato of the game, read from the db
    let game = $derived(gameStore.currentGame);

    //uid of the logged user
    let myUid = $derived(authStore.appUser?.uid ?? '');

    //LOCAL STATE OF THE UI
    let selectedScrollId = $state<string | null>(null);//id of the user's selected move
    let selectedTargetId = $state<string | null>(null);//id of the selected target for the move (only for single target moves)
    let replaceScrollId = $state<string | null>(null);//what move to replace if you don't know the new one
    let loading = $state(false);
    let showReplaceModal = $state(false);//show/hide the modal for which move replace
    let pendingDropScrollId = $state<string | null>(null);//when the user has chosen the new move but not yet the one to be replaced
    let deadEnemies = $state<GameEnemy[]>([]); //dead enemies that are still in death animation

    //utils derived
    let myPlayer = $derived(game?.players.find(p => p.uid === myUid) ?? null); //the player corresponding to the logged-in user 

    //isMyTurn is true only if: the phase is player_turn and the current actor in the turnOrder is the logged-in user
    let isMyTurn = $derived(game?.phase === 'player_turn' && game?.turnOrder[game?.currentActorIndex] === myUid);

    //isDropChooser is true only if: the phase is drop_phase and the dropChooserIndex point to logged user
    let isDropChooser = $derived(game?.phase === 'drop_phase' && game?.players[game?.dropChooserIndex]?.uid === myUid);

    //isLevelUp is true only if: the pase is level_up and uid of the user is in pendingLevelUps
    let isLevelUp = $derived(game?.phase === 'level_up' && game?.pendingLevelUps.includes(myUid));

    //animation
    const ANIM_DELAY = 600;  //ms between one animation and another one

    //records that map uid/instanceId -> correct animation
    //each actor has his own indipendent animation
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

    //load the scrolls from db in scrollsData
    onMount(async () => {
        const snap = await getDocs(collection(db, 'scrolls'));
        const data: Record<string, ScrollData> = {};
        snap.docs.forEach(d => { data[d.id] = d.data() as ScrollData; });
        scrollsData = data;
    });

    //MAIN EFFECT
    $effect(() =>{
        const gId = gameId;
        if (!gId) { return; }

        const unsubscribe = subscribeGame(gId, async (updatedGame) => {
                const snapshot = prevGame;//save prev before any update
                const attackingIds = (updatedGame.lastAttackingEnemies ?? []) as string[];
                for (const enemyId of attackingIds) {
                    if (!(enemyId in enemyAnims)) {
                    enemyAnims[enemyId] = 'idle';
                    }
                }
                enemyAnims = {...enemyAnims};
                //generate combat log's message
                if (snapshot && updatedGame) {
                    //if there is a previous state to compare -> generate log and animation
                    enqueueAnim(() => generateLogs(snapshot, updatedGame));
                } else {
                    //first update (prev doesn't exists), initialize all animation in idle 
                    updatedGame.players.forEach(p => {
                        playerAnims[p.uid] = 'idle';
                    });
                    updatedGame.enemies.forEach(e =>{
                        enemyAnims[e.instanceId] = 'idle';
                    });
                    playerAnims = {...playerAnims};
                    enemyAnims = {...enemyAnims};
                }

                prevGame = updatedGame; //update prev with the last update
                gameStore.setGame(updatedGame);//update the store -> update the UI

                // if is game over -> start the countdown to return to home page
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

            //cleanup when left the page
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
    //It is replayed every time the game changes. 
    //The condition in instead of !enemyAnims[id] is important — it checks if the key exists in the object, 
    //not if the value is truthy. 
    //This avoids overwriting an ongoing 'hit' or 'attack' animation with 'idle'
    $effect(() => {
        if (!game) {return;}
        //intialize with idle animation for all the actors
        game.players.forEach(p => {
            //Initialize only if it doesn't exist yet — don't overwrite animations in progress
            if (!playerAnims[p.uid]) { playerAnims[p.uid] = 'idle'; }
            //if the player is dead force the death's animation
            if (p.stats.hp <= 0 && playerAnims[p.uid] !== 'death') {
                playerAnims[p.uid] = 'death';
            }
        });

        game.enemies.forEach(e => {
            //only if it does not yet exist
            if (!(e.instanceId in enemyAnims)) {
                //Initialize only if it doesn't exist yet
                // do not touch existing enemyAnims so as not to interrupt animations in progress
                enemyAnims[e.instanceId] = 'idle';
            }
        });
    });

    // chiama questo quando qualcuno viene colpito
    function triggerHitAnim(targetId: string, isEnemy: boolean) {
        if (isEnemy) {
            //if already hit, go idle and only after hit
            if (enemyAnims[targetId] === 'hit') {
                enemyAnims[targetId] = 'idle';
                enemyAnims = {...enemyAnims};
                setTimeout(() => {
                    enemyAnims[targetId] = 'hit';
                    enemyAnims = {...enemyAnims};
                }, 32); 
            } else {
                enemyAnims[targetId] = 'hit';
                enemyAnims = {...enemyAnims};
            }
        } else {
            if (playerAnims[targetId] === 'hit') {
                playerAnims[targetId] = 'idle';
                playerAnims = {...playerAnims};
                setTimeout(() => {
                    playerAnims[targetId] = 'hit';
                    playerAnims = {...playerAnims};
                }, 32);
            } else {
                playerAnims[targetId] = 'hit';
                playerAnims = {...playerAnims};
            }
        } 
    }
    //generateLogs compares the status before (prev) and after (next) a Firestore update and decides which animations to show and which messages to add to the log.
    async function generateLogs(prev: Game, next: Game) {

        // 1. ATTACCO GIOCATORE
        for (const nextPlayer of next.players) {
            const prevPlayer = prev.players.find(p => p.uid === nextPlayer.uid);
            if (!prevPlayer) continue;
            if (nextPlayer.hasAttacked && !prevPlayer.hasAttacked && nextPlayer.uid !== myUid) {
            playerAnims[nextPlayer.uid] = 'attack';
            playerAnims = {...playerAnims};
            await new Promise(r => setTimeout(r, ANIM_DELAY));

            playerAnims[nextPlayer.uid] = 'idle';
            playerAnims = { ...playerAnims };
            }
        }

        // 2. ATTACCO NEMICI — prima dell'hit così si vede l'attacco
        for (const enemy of next.enemies) {
            if (!(enemy.instanceId in enemyAnims)) {
            enemyAnims[enemy.instanceId] = 'idle';
            enemyAnims = {...enemyAnims};
            }
        }

        const attackingEnemyIds = (next.lastAttackingEnemies ?? []) as string[];

        for (const enemyId of attackingEnemyIds) {
            const enemyStillAlive = next.enemies.some(e => e.instanceId === enemyId);
            if (!enemyStillAlive) continue;
            if (enemyAnims[enemyId] === 'death') continue;

            enemyAnims[enemyId] = 'attack';
            enemyAnims = { ...enemyAnims };

            await new Promise(r => setTimeout(r, ANIM_DELAY));

            enemyAnims[enemyId] = 'idle';
            enemyAnims = { ...enemyAnims };

        }

        // 3. DANNI AI NEMICI — dopo l'attacco
        for (const nextEnemy of next.enemies) {
            const prevEnemy = prev.enemies.find(e => e.instanceId === nextEnemy.instanceId);
            if (prevEnemy && nextEnemy.hp < prevEnemy.hp) {
            const dmg = prevEnemy.hp - nextEnemy.hp;
            gameStore.addLog(`⚔️ ${nextEnemy.name} takes ${dmg} damage`, 'damage-enemy');
            triggerHitAnim(nextEnemy.instanceId, true);
            await new Promise(r => setTimeout(r, ANIM_DELAY));
            }
        }

        // 4. NEMICI MORTI
        for (const prevEnemy of prev.enemies) {
            const stillAlive = next.enemies.find(e => e.instanceId === prevEnemy.instanceId);
            if (!stillAlive) {
            deadEnemies = [...deadEnemies, prevEnemy];
            enemyAnims[prevEnemy.instanceId] = 'death';
            enemyAnims = {...enemyAnims};
            gameStore.addLog(`💀 ${prevEnemy.name} defeated`, 'death');
            await new Promise(r => setTimeout(r, ANIM_DELAY * 1.5));
            deadEnemies = deadEnemies.filter(e => e.instanceId !== prevEnemy.instanceId);
            }
        }

        // 5. DANNI AI GIOCATORI
        for (const nextPlayer of next.players) {
            const prevPlayer = prev.players.find(p => p.uid === nextPlayer.uid);
            if (!prevPlayer) continue;

            if (nextPlayer.stats.hp < prevPlayer.stats.hp) {
            const dmg = prevPlayer.stats.hp - nextPlayer.stats.hp;
            gameStore.addLog(`🩸 ${nextPlayer.username} takes ${dmg} damage`, 'damage-player');
            triggerHitAnim(nextPlayer.uid, false);
            await new Promise(r => setTimeout(r, ANIM_DELAY));
            }

            if (nextPlayer.stats.hp > prevPlayer.stats.hp) {
            const heal = nextPlayer.stats.hp - prevPlayer.stats.hp;
            gameStore.addLog(`💚 ${nextPlayer.username} recovers ${heal} HP`, 'heal');
            }

            if (nextPlayer.stats.hp <= 0 && prevPlayer.stats.hp > 0) {
            await new Promise(r => setTimeout(r, ANIM_DELAY));
            playerAnims[nextPlayer.uid] = 'death';
            playerAnims = {...playerAnims};
            await new Promise(r => setTimeout(r, ANIM_DELAY * 1.5));
            }
        }

        // 6. STATUS NEMICI
        for (const nextEnemy of next.enemies) {
            const prevEnemy = prev.enemies.find(e => e.instanceId === nextEnemy.instanceId);
            if (!prevEnemy) continue;
            for (const status of nextEnemy.activeStatuses ?? []) {
            if (!prevEnemy.activeStatuses.find(s => s.id === status.id)) {
                gameStore.addLog(`⬇️ ${nextEnemy.name} is affected by ${status.id}`, 'status-enemy');
                triggerHitAnim(nextEnemy.instanceId, true);
                await new Promise(r => setTimeout(r, ANIM_DELAY));
            }
            }
        }

        // 7. STATUS GIOCATORI
        for (const nextPlayer of next.players) {
            const prevPlayer = prev.players.find(p => p.uid === nextPlayer.uid);
            if (!prevPlayer) continue;
            for (const status of nextPlayer.activeStatuses ?? []) {
            if (!prevPlayer.activeStatuses.find(s => s.id === status.id)) {
                gameStore.addLog(`🌀 ${nextPlayer.username} is affected by ${status.id}`, 'status-player');
                triggerHitAnim(nextPlayer.uid, false);
                await new Promise(r => setTimeout(r, ANIM_DELAY));
            }
            }
        }

        // 8. CAMBIO FASE
        if (prev.phase !== next.phase) {
            if (next.phase === 'drop_phase') {
            deadEnemies = [];
            gameStore.addLog('📜 Choose a scroll!', 'phase');
            }
            if (next.phase === 'level_up') {
            gameStore.addLog('💡 Level up!', 'phase');
            }
        }
        }
    async function handleAttack() {

        if (!selectedScrollId || !game) { return; } //id data is missing don't do anything

        const scroll = myPlayer?.moves.find(m => m.scrollId === selectedScrollId);

        if (!scroll) { return; }
        loading = true;

        playerAnims[myUid] = 'attack';
        playerAnims = {...playerAnims};
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
                        {#each game.drop as scrollId}
                            {@const scroll = scrollsData[scrollId]}
                                <button onclick={() => handleChooseDrop(scrollId)} disabled={loading}>
                                    <img src="/icons/scroll.png" alt="scroll" class="scroll-icon" />
                                    {scroll?.name ?? scrollId}  
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
                {#each myPlayer.moves as move (move.scrollId)}
                    {@const scroll = scrollsData[move.scrollId]}
                        <button
                            class:selected={replaceScrollId === move.scrollId}
                            onclick={() => replaceScrollId = move.scrollId}
                        >
                        {scroll?.name ?? move.scrollId} (Lv.{move.level})
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
