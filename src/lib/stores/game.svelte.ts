import type { Game } from '$lib/types';

export type LogType = 'damage-player' | 'damage-enemy' | 'heal' | 'death' | 'status-player' | 'status-enemy' | 'phase' | 'default';

export interface LogEntry {
  message: string;
  type: LogType;
}

let currentGame = $state<Game | null>(null);
let combatLog = $state<LogEntry[]>([]);


export const gameStore = {
    get currentGame() { return currentGame; },
    get combatLog() { return combatLog; },
    setGame(game: Game | null) { currentGame = game; },
    addLog(message: string, type: LogType = 'default') {
        combatLog = [{message, type}, ...combatLog].slice(0, 50);
    },
    clearLog() { combatLog = []; }
}