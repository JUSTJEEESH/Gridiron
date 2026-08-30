/**
 * Deterministic seeded RNG. Same seed, same stream, always — the sim
 * (slice 3) and the daily challenge (slice 7) depend on this property.
 *
 * Stateless design: draw i of stream `seed` is a pure function of
 * (seed, i), so game state can serialize as { seed, cursor } and replays
 * are exact. Quality is murmur3-finalizer grade, plenty for a game.
 */

/** FNV-1a 32-bit hash of a string seed. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** murmur3 fmix32 over (seed hash, cursor) -> uint32. */
export function u32At(seedHash: number, cursor: number): number {
  let h = (seedHash ^ Math.imul(cursor + 1, 0x9e3779b9)) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** A serializable RNG stream: the cursor is the only mutable state. */
export interface RngState {
  seed: string
  cursor: number
}

export function newRng(seed: string): RngState {
  return { seed, cursor: 0 }
}

/** Draw a float in [0, 1). Returns the value and the advanced state. */
export function nextFloat(state: RngState): { value: number; state: RngState } {
  const value = u32At(hashSeed(state.seed), state.cursor) / 0x1_0000_0000
  return { value, state: { seed: state.seed, cursor: state.cursor + 1 } }
}

/** Draw an integer in [0, n). */
export function nextInt(state: RngState, n: number): { value: number; state: RngState } {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`nextInt: n must be a positive integer, got ${n}`)
  const { value, state: next } = nextFloat(state)
  return { value: Math.floor(value * n), state: next }
}

/** Draw one element of a non-empty array. */
export function nextPick<T>(state: RngState, items: readonly T[]): { value: T; state: RngState } {
  if (items.length === 0) throw new Error('nextPick: empty array')
  const { value, state: next } = nextInt(state, items.length)
  return { value: items[value], state: next }
}
