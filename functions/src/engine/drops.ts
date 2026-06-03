const ALL_SCROLL_IDS = [
  "magic_dart",
  "fireball",
  "lightning_bolt",
  "heal",
  "mass_heal",
  "skin_of_stone",
  "haste",
  "slowness",
  "curse",
];

// Fisher–Yates shuffle (more random than Math.random)
function shuffle(array: string[]): string[] {
  const result = [...array];
  let temp: string;
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export function generateDrops(): string[] {
  const shuffled = shuffle(ALL_SCROLL_IDS);
  return shuffled.slice(0, 3);// 3 scrolls, the second argument is excluded
}
