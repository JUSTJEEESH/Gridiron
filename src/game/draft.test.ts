import { describe, expect, it } from 'vitest'
import { isComplete, newDraft, pickPlayer, rerollEra, rerollTeam, SLOTS } from './draft.ts'
import { makeLeague } from './gameFixtures.ts'

const index = makeLeague()

/** Play a full run picking the first option each time. */
function playRun(seed: string) {
  let state = newDraft(index, seed)
  while (!isComplete(state)) {
    state = pickPlayer(index, state, state.spin!.options[0].id)
  }
  return state
}

describe('newDraft', () => {
  it('starts at slot 0 with a valid QB spin', () => {
    const state = newDraft(index, 'seed-1')
    expect(state.slot).toBe(0)
    expect(state.picks).toEqual([])
    expect(state.spin!.options.length).toBeGreaterThan(0)
    expect(state.spin!.options.every((p) => p.pos === 'QB')).toBe(true)
    expect(state.spin!.options.every((p) => p.team === state.spin!.franchise)).toBe(true)
  })

  it('is deterministic: same seed, same spin', () => {
    expect(newDraft(index, 'seed-2')).toEqual(newDraft(index, 'seed-2'))
  })

  it('different seeds give different runs', () => {
    const runs = new Set(
      ['a', 'b', 'c', 'd', 'e'].map((s) => JSON.stringify(playRun(s).picks.map((p) => p.id))),
    )
    expect(runs.size).toBeGreaterThan(1)
  })
})

describe('pickPlayer', () => {
  it('advances through all six slots in order and completes', () => {
    let state = newDraft(index, 'run-1')
    const seenPos: string[] = []
    while (!isComplete(state)) {
      seenPos.push(SLOTS[state.slot].pos)
      state = pickPlayer(index, state, state.spin!.options[0].id)
    }
    expect(seenPos).toEqual(['QB', 'RB', 'WR', 'WR', 'EDGE', 'DB'])
    expect(state.picks).toHaveLength(6)
    expect(state.spin).toBeNull()
    expect(() => pickPlayer(index, state, 'x')).toThrow(/complete/)
  })

  it('a full run is deterministic from (seed, choices)', () => {
    const a = playRun('determinism')
    const b = playRun('determinism')
    expect(a.picks.map((p) => `${p.id}:${p.season}`)).toEqual(b.picks.map((p) => `${p.id}:${p.season}`))
  })

  it('never offers an already-picked player (WR2 excludes WR1)', () => {
    // Run many seeds; whenever the two WR spins land on the same
    // franchise+era, WR1's pick must be absent from WR2's options.
    let checked = 0
    for (let i = 0; i < 60; i++) {
      let state = newDraft(index, `wr-${i}`)
      let wr1: string | null = null
      while (!isComplete(state)) {
        const label = SLOTS[state.slot].label
        if (label === 'WR2' && wr1 !== null) {
          expect(state.spin!.options.map((p) => p.id)).not.toContain(wr1)
          checked++
        }
        const id = state.spin!.options[0].id
        if (label === 'WR1') wr1 = id
        state = pickPlayer(index, state, id)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('rejects a pick that is not among the options', () => {
    const state = newDraft(index, 'reject')
    expect(() => pickPlayer(index, state, 'not-an-option')).toThrow(/not in the current options/)
  })

  it('spins never land on an empty pool (BBB has no 2000s QBs)', () => {
    for (let i = 0; i < 80; i++) {
      const state = newDraft(index, `gap-${i}`)
      expect(state.spin!.options.length).toBeGreaterThan(0)
      if (state.spin!.franchise === 'BBB') expect(state.spin!.era).not.toBe('2000s')
    }
  })
})

describe('re-rolls', () => {
  it('team re-roll changes the franchise, keeps the era, and works once', () => {
    const state = newDraft(index, 'team-reroll')
    const rolled = rerollTeam(index, state)
    expect(rolled.teamRerollUsed).toBe(true)
    expect(rolled.spin!.era).toBe(state.spin!.era)
    expect(rolled.spin!.franchise).not.toBe(state.spin!.franchise)
    expect(rolled.spin!.options.length).toBeGreaterThan(0)
    expect(() => rerollTeam(index, rolled)).toThrow(/already used/)
  })

  it('era re-roll changes the era, keeps the franchise, and works once', () => {
    const state = newDraft(index, 'era-reroll')
    const rolled = rerollEra(index, state)
    expect(rolled.eraRerollUsed).toBe(true)
    expect(rolled.spin!.franchise).toBe(state.spin!.franchise)
    expect(rolled.spin!.era).not.toBe(state.spin!.era)
    expect(rolled.spin!.options.length).toBeGreaterThan(0)
    expect(() => rerollEra(index, rolled)).toThrow(/already used/)
  })

  it('the two re-rolls are independent budgets', () => {
    let state = newDraft(index, 'both-rerolls')
    state = rerollTeam(index, state)
    state = rerollEra(index, state)
    expect(state.teamRerollUsed).toBe(true)
    expect(state.eraRerollUsed).toBe(true)
  })

  it('era re-roll never lands on an era where the franchise has no pool', () => {
    // BBB has no 2000s QBs: an era re-roll from BBB/2010s at QB slot has
    // nowhere to go and burns the re-roll without changing the spin.
    for (let i = 0; i < 200; i++) {
      const state = newDraft(index, `bbb-${i}`)
      if (state.spin!.franchise !== 'BBB' || SLOTS[state.slot].pos !== 'QB') continue
      const rolled = rerollEra(index, state)
      expect(rolled.eraRerollUsed).toBe(true)
      expect(rolled.spin!.era).toBe('2010s') // unchanged — only era with BBB QBs
      return
    }
    throw new Error('fixture never produced a BBB QB spin — widen the seed range')
  })
})
