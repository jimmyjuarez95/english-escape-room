// Fisher-Yates shuffle, then take the first `count` — used by each game
// mode's onStart to pick a short, varied session out of a much larger
// content bank (see gameModes/*/session.ts). Returns fewer than `count`
// items if the bank itself is smaller, rather than throwing.
export function pickRandomSubset<T>(items: T[], count: number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
