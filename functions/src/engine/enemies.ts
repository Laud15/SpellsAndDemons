import {getFirestore} from "firebase-admin/firestore";
import {GameEnemy} from "../types";

const ALL_ENEMY_IDS = ["ooze", "infernalOoze"];

// generate from 1 to 3 random enemies (duplicates allowed)
export function generateEnemyIds(): string[] {
  const count = Math.floor(Math.random() * 3) + 1; // 1-3

  return Array.from(
    {length: count},
    () => ALL_ENEMY_IDS[Math.floor(Math.random() * ALL_ENEMY_IDS.length)]
  );
}
// retrieve the scrolls's data from db and choose an available one
export async function chooseEnemyMove(
  enemy: GameEnemy
): Promise<string | null> {
  const db = getFirestore();

  // read the data of all enemy's moves
  const scrollSnaps = await Promise.all(
    enemy.moves.map((id) => db.collection("scrolls").doc(id).get())
  );

  const available = enemy.moves.filter((moveId, i) => {
    const scroll = scrollSnaps[i].data();
    return enemy.energy >= scroll?.energyCost;
  });

  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

