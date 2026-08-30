import { describe, expect, it } from 'vitest'
import { hashSeed, newRng, nextFloat, nextInt, nextPick, u32At } from './rng.ts'

describe('seeded rng', () => {
  it('same seed produces the identical stream', () => {
    let a = newRng('gridiron-2026')
    let b = newRng('gridiron-2026')
    for (let i = 0; i < 100; i++) {
      const da = nextFloat(a)
      const db = nextFloat(b)
      expect(da.value).toBe(db.value)
      a = da.state
      b = db.state
    }
  })

  it('draw i is a pure function of (seed, cursor) — replayable from state', () => {
    const h = hashSeed('replay')
    expect(u32At(h, 41)).toBe(u32At(h, 41))
    const resumed = nextFloat({ seed: 'replay', cursor: 41 })
    expect(resumed.value).toBe(u32At(h, 41) / 0x1_0000_0000)
    expect(resumed.state.cursor).toBe(42)
  })

  it('different seeds diverge', () => {
    const a = nextFloat(newRng('seed-a')).value
    const b = nextFloat(newRng('seed-b')).value
    expect(a).not.toBe(b)
  })

  it('floats are in [0, 1) and roughly uniform', () => {
    let rng = newRng('uniformity')
    const buckets = new Array(10).fill(0)
    const n = 10_000
    for (let i = 0; i < n; i++) {
      const d = nextFloat(rng)
      expect(d.value).toBeGreaterThanOrEqual(0)
      expect(d.value).toBeLessThan(1)
      buckets[Math.floor(d.value * 10)]++
      rng = d.state
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 - 300)
      expect(count).toBeLessThan(n / 10 + 300)
    }
  })

  it('nextInt stays in range and covers the range', () => {
    let rng = newRng('ints')
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const d = nextInt(rng, 7)
      expect(d.value).toBeGreaterThanOrEqual(0)
      expect(d.value).toBeLessThan(7)
      seen.add(d.value)
      rng = d.state
    }
    expect(seen.size).toBe(7)
    expect(() => nextInt(rng, 0)).toThrow()
  })

  it('nextPick draws members and rejects empty arrays', () => {
    const items = ['a', 'b', 'c']
    const d = nextPick(newRng('picks'), items)
    expect(items).toContain(d.value)
    expect(() => nextPick(newRng('picks'), [])).toThrow()
  })
})
