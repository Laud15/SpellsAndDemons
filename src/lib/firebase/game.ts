import { httpsCallable } from "firebase/functions";
import { db, functions } from "./clientSDK";
import { doc, onSnapshot} from "firebase/firestore";
import type { Game } from "$lib/types";

export function subscribeGame(gameId: string, callback: (game: Game) => void): () => void {
  const gameRef= doc(db, 'games', gameId);
  return onSnapshot(gameRef, (snap) => {
    if(snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as Game);
    }
  });
}

export async function performAction(
  gameId: string,
  action: {
    type: 'attack' | 'defend';
    scrollId?: string;
    targetId?: string;
  }
): Promise<void> {
  const fn = httpsCallable(functions, 'performAction');
  await fn({ gameId, action});
}

export async function chooseDrop(gameId: string, scrollId: string, replaceScrollId?: string): Promise<void>{
  const fn = httpsCallable(functions, 'chooseDrop');
  await fn({ gameId, scrollId, replaceScrollId});
}

export async function skipDrop(gameId: string): Promise<void> {
  const fn = httpsCallable(functions, 'skipDrop');
  await fn({ gameId });
}

export async function levelUp(gameId: string, stat: 'will' | 'knowledge' | 'intuition' | 'cunning'): Promise<void> {
  const fn = httpsCallable(functions, 'levelUp');
  await fn({ gameId, stat });
}


