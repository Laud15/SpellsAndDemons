import type { Lobby } from "$lib/types";

let currentLobby = $state<Lobby | null>(null);

export const lobbyStore = {
    get currentLobby() { return currentLobby; },
    setLobby(lobby: Lobby | null) { currentLobby = lobby; }
}

