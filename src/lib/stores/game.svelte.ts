import type { Game } from '$lib/types';

let currentGame = $state<Game | null>(null);
let combatLog = $state<string[]>([]);

export const gameStore = {
    get currentGame() { return currentGame; },
    get combatLog() { return combatLog; },
    setGame(game: Game | null) { currentGame = game; },
    addLog(message: string) {
        combatLog = [message, ...combatLog].slice(0, 50) //max 50 message
    },
    clearLog() { combatLog = []; }
}