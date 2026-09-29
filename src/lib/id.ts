let counter = 0;

/** Short, collision-resistant id. Not cryptographic, just unique per session. */
export function makeId(prefix = 'c'): string {
  counter = (counter + 1) % 100000;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${random}`;
}
