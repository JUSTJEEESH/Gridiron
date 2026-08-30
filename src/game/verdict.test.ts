import { describe, expect, it } from 'vitest'
import { collectFacts, verdict, VERDICT_POOLS } from './verdict.ts'
import { simulateSeason } from './sim.ts'
import { makePlayer } from './gameFixtures.ts'
import type { PlayerSeason, Tag } from '../shared/types.ts'
import type { SeasonResult } from './sim.ts'

function roster(scores: number[], tags: Tag[][] = []): PlayerSeason[] {
  const pos = ['QB', 'RB', 'WR', 'WR', 'EDGE', 'DB'] as const
  const names = ['Quincy Backer', 'Rush Mann', 'Wide One', 'Wide Two', 'Ed Rusher', 'Deep Safety']
  return scores.map((score, i) =>
    makePlayer({
      id: `v${i}`, pos: pos[i], team: `T${i}`, season: 1999 + i * 5,
      name: names[i], score, tags: tags[i] ?? [],
    }),
  )
}

function seasonFor(picks: PlayerSeason[], seed = 'verdict-season'): SeasonResult {
  return simulateSeason(picks, seed)
}

/** A season result with a forced record, for tone tests. */
function withWins(picks: PlayerSeason[], wins: number): SeasonResult {
  const s = seasonFor(picks)
  return { ...s, wins, losses: 17 - wins }
}

describe('collectFacts', () => {
  it('emits a fact per fired chemistry rule with the right sign', () => {
    const picks = roster([70, 70, 70, 70, 70, 70], [[], [], ['alpha'], ['alpha'], [], []])
    const facts = collectFacts(picks, seasonFor(picks))
    const tc = facts.find((f) => f.id === 'target_competition')
    expect(tc).toBeDefined()
    expect(tc!.sign).toBe('neg')
    expect(tc!.magnitude).toBe(4)
  })

  it('qb_manager: star receivers with a caretaker QB', () => {
    const picks = roster([50, 70, 90, 70, 70, 70])
    expect(collectFacts(picks, seasonFor(picks)).map((f) => f.id)).toContain('qb_manager')
    const fine = roster([80, 70, 90, 70, 70, 70])
    expect(collectFacts(fine, seasonFor(fine)).map((f) => f.id)).not.toContain('qb_manager')
  })

  it('defense gaps in both directions at the 30-point threshold', () => {
    const front = roster([70, 70, 70, 70, 95, 65])
    expect(collectFacts(front, seasonFor(front)).map((f) => f.id)).toContain('defense_front_gap')
    const back = roster([70, 70, 70, 70, 55, 85])
    expect(collectFacts(back, seasonFor(back)).map((f) => f.id)).toContain('defense_back_gap')
    const close = roster([70, 70, 70, 70, 80, 60])
    const ids = collectFacts(close, seasonFor(close)).map((f) => f.id)
    expect(ids).not.toContain('defense_front_gap')
    expect(ids).not.toContain('defense_back_gap')
  })

  it('weak_link scales magnitude with how bad the hole is; balance needs 65 everywhere', () => {
    const holed = roster([70, 20, 70, 70, 70, 70])
    const weak = collectFacts(holed, seasonFor(holed)).find((f) => f.id === 'weak_link')!
    expect(weak.ctx.weak).toBe('Rush Mann')
    expect(weak.ctx.weakSlot).toBe('RB')
    expect(weak.magnitude).toBe(4)
    const balanced = roster([70, 70, 70, 70, 70, 70])
    expect(collectFacts(balanced, seasonFor(balanced)).map((f) => f.id)).toContain('balance')
  })

  it('vertical_game credits the better vertical WR and skips scrub deep threats', () => {
    const twoVerts = roster([70, 70, 60, 88, 70, 70], [['gunslinger'], [], ['vertical'], ['vertical'], [], []])
    const fact = collectFacts(twoVerts, seasonFor(twoVerts)).find((f) => f.id === 'vertical_game')!
    expect(fact.ctx.wr).toBe('Wide Two')

    // Only vertical WR scores 30: chemistry still fires (+3) but the verdict
    // won't praise the connection.
    const scrubVert = roster([70, 70, 30, 70, 70, 70], [['gunslinger'], [], ['vertical'], [], [], []])
    const season = seasonFor(scrubVert)
    expect(season.chemistry.fired.map((r) => r.id)).toContain('vertical_game')
    expect(collectFacts(scrubVert, season).map((f) => f.id)).not.toContain('vertical_game')
  })

  it('perfect and heartbreak facts key off the record', () => {
    const picks = roster([70, 70, 70, 70, 70, 70])
    expect(collectFacts(picks, withWins(picks, 17)).map((f) => f.id)).toContain('perfect')
    expect(collectFacts(picks, withWins(picks, 16)).map((f) => f.id)).toContain('heartbreak')
    expect(collectFacts(picks, withWins(picks, 15)).map((f) => f.id)).not.toContain('perfect')
  })
})

describe('verdict', () => {
  it('is deterministic for the same (picks, season, seed)', () => {
    const picks = roster([50, 70, 90, 70, 95, 40], [[], [], ['alpha'], ['alpha'], [], []])
    const season = seasonFor(picks)
    expect(verdict(picks, season, 'run-9')).toBe(verdict(picks, season, 'run-9'))
    // A different seed can select different variants of the same facts.
    const variants = new Set(Array.from({ length: 12 }, (_, i) => verdict(picks, season, `run-${i}`)))
    expect(variants.size).toBeGreaterThan(1)
  })

  it('leads with the failure below 14 wins and with credit at 14+', () => {
    const picks = roster([50, 70, 90, 70, 70, 70]) // qb_manager fires (mag 4.5)
    const losing = verdict(picks, withWins(picks, 8), 'tone')
    const qbPool = VERDICT_POOLS.qb_manager.map((t) => t.slice(0, 20))
    expect(qbPool.some((start) => losing.startsWith(start.replace('{wr1}', 'Wide One').replace('{qb}', 'Quincy Backer')))).toBe(true)

    const great = roster([96, 80, 80, 80, 80, 80]) // star_qb + balance
    const winning = verdict(great, withWins(great, 15), 'tone')
    const positiveStarts = [...VERDICT_POOLS.star_qb, ...VERDICT_POOLS.balance]
    expect(positiveStarts.some((t) => winning.startsWith(t.replace('{qb}', 'Quincy Backer').slice(0, 25)))).toBe(true)
  })

  it('a 17-0 season opens with the perfect line', () => {
    const picks = roster([90, 90, 90, 90, 90, 90])
    const text = verdict(picks, withWins(picks, 17), 'perf')
    expect(VERDICT_POOLS.perfect.some((t) => text.startsWith(t.slice(0, 15)))).toBe(true)
  })

  it('always produces 2-3 fragments, even for a blank roster', () => {
    // Mid scores, no tags, no chemistry: zero facts -> two distinct fallbacks.
    const bland = roster([55, 55, 55, 55, 55, 55])
    const season = withWins(bland, 11)
    const text = verdict(bland, season, 'bland')
    const fromPool = VERDICT_POOLS.fallback_mid.filter((t) => text.includes(t))
    expect(fromPool.length).toBe(2)
    expect(new Set(fromPool).size).toBe(2)
  })

  it('never leaks placeholders or says nothing, across many rosters and seeds', () => {
    for (let i = 0; i < 300; i++) {
      const scores = Array.from({ length: 6 }, (_, j) => (i * 37 + j * 53) % 101)
      const tagChoices: Tag[][] = [
        i % 3 === 0 ? ['gunslinger', 'high_volume'] : [],
        i % 4 === 0 ? ['workhorse'] : [],
        i % 2 === 0 ? ['alpha', 'vertical'] : [],
        i % 5 === 0 ? ['alpha'] : [],
        i % 3 === 1 ? ['elite'] : [],
        i % 4 === 2 ? ['ball_hawk'] : [],
      ]
      const picks = roster(scores, tagChoices)
      const text = verdict(picks, seasonFor(picks, `fuzz-${i}`), `fuzz-${i}`)
      expect(text).not.toMatch(/[{}]/)
      expect(text.length).toBeGreaterThan(40)
      expect(text.endsWith('.')).toBe(true)
    }
  })

  it('every pool has 4-6 variants and no variant references a missing placeholder key', () => {
    const knownKeys = new Set(['qb', 'rb', 'wr1', 'wr2', 'edge', 'db', 'wr', 'weak', 'weakSlot', 'team'])
    for (const [id, pool] of Object.entries(VERDICT_POOLS)) {
      expect(pool.length, id).toBeGreaterThanOrEqual(4)
      expect(pool.length, id).toBeLessThanOrEqual(6)
      for (const t of pool) {
        for (const m of t.matchAll(/\{(\w+)\}/g)) {
          expect(knownKeys.has(m[1]), `${id}: {${m[1]}}`).toBe(true)
        }
      }
    }
  })
})
