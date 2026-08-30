import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIM_PARAMS,
  nextOpponent,
  simulateSeason,
  simSeedFor,
  SPEC_SIM_PARAMS,
  teamRating,
  tierFor,
  winProb,
} from './sim.ts'
import { chemistry } from './chemistry.ts'
import { makePlayer } from './gameFixtures.ts'
import { newRng, nextFloat } from './rng.ts'
import type { PlayerSeason } from '../shared/types.ts'

function rosterWithScores(scores: number[]): PlayerSeason[] {
  const pos = ['QB', 'RB', 'WR', 'WR', 'EDGE', 'DB'] as const
  // Distinct teams and spread seasons: no chemistry rule fires.
  return scores.map((score, i) =>
    makePlayer({ id: `p${i}`, pos: pos[i], team: `T${i}`, season: 1999 + i * 5, score }),
  )
}

describe('teamRating', () => {
  it('matches the section 6 formula, hand-computed', () => {
    const picks = rosterWithScores([80, 70, 60, 50, 90, 100])
    const chem = chemistry(picks)
    expect(chem.total).toBe(0)
    // base = .30*80+.12*70+.16*60+.12*50+.17*90+.13*100 = 76.3
    // weakest = .85*76.3 + .15*50 = 72.355
    expect(teamRating(picks, chem, SPEC_SIM_PARAMS)).toBeCloseTo(72.355, 10)
  })

  it('adds chemistry and clamps to [0, 100]', () => {
    const picks = rosterWithScores([100, 100, 100, 100, 100, 100])
    expect(teamRating(picks, { fired: [], total: 8 }, SPEC_SIM_PARAMS)).toBe(100)
    const zeros = rosterWithScores([0, 0, 0, 0, 0, 0])
    expect(teamRating(zeros, { fired: [], total: -8 }, SPEC_SIM_PARAMS)).toBe(0)
  })

  it('weakest link drags a stars-and-scrubs roster below its weighted base', () => {
    const balanced = rosterWithScores([80, 80, 80, 80, 80, 80])
    // base = .30*100+.12*100+.16*100+.12*20+.17*80+.13*80 = 84.4
    const topHeavy = rosterWithScores([100, 100, 100, 20, 80, 80])
    const chem = { fired: [], total: 0 }
    expect(teamRating(balanced, chem, SPEC_SIM_PARAMS)).toBeCloseTo(80, 10)
    expect(teamRating(topHeavy, chem, SPEC_SIM_PARAMS)).toBeCloseTo(0.85 * 84.4 + 0.15 * 20, 10)
    expect(teamRating(topHeavy, chem, SPEC_SIM_PARAMS)).toBeLessThan(84.4 - 7)
  })

  it('rejects rosters that are not exactly six picks', () => {
    expect(() => teamRating(rosterWithScores([50, 50]), { fired: [], total: 0 })).toThrow()
  })
})

describe('winProb', () => {
  it('is 0.5 when the bonus exactly offsets the deficit', () => {
    expect(winProb(75.5, 78, SPEC_SIM_PARAMS)).toBeCloseTo(0.5, 10)
  })
  it('matches a hand-computed value', () => {
    // (93 - 78 + 2.5) / 15 = 1.1667 -> 1/(1+e^-1.1667)
    expect(winProb(93, 78, SPEC_SIM_PARAMS)).toBeCloseTo(1 / (1 + Math.exp(-17.5 / 15)), 10)
  })
  it('is monotonic in T', () => {
    expect(winProb(90, 78)).toBeGreaterThan(winProb(70, 78))
  })
})

describe('nextOpponent', () => {
  it('stays within [oppMin, oppMax] and centers near oppMean', () => {
    let rng = newRng('opponents')
    let sum = 0
    const n = 20_000
    for (let i = 0; i < n; i++) {
      const d = nextOpponent(rng, SPEC_SIM_PARAMS)
      expect(d.value).toBeGreaterThanOrEqual(SPEC_SIM_PARAMS.oppMin)
      expect(d.value).toBeLessThanOrEqual(SPEC_SIM_PARAMS.oppMax)
      sum += d.value
      rng = d.state
    }
    expect(sum / n).toBeGreaterThan(SPEC_SIM_PARAMS.oppMean - 0.5)
    expect(sum / n).toBeLessThan(SPEC_SIM_PARAMS.oppMean + 0.5)
  })

  it('consumes exactly two draws', () => {
    const rng = newRng('cursor')
    expect(nextOpponent(rng).state.cursor).toBe(2)
    expect(nextFloat(nextFloat(rng).state).state.cursor).toBe(2)
  })
})

describe('simulateSeason', () => {
  const picks = rosterWithScores([85, 70, 80, 65, 75, 72])

  it('same (picks, seed) -> identical result, always', () => {
    const a = simulateSeason(picks, 'season-seed')
    const b = simulateSeason(picks, 'season-seed')
    expect(a).toEqual(b)
    expect(a.wins + a.losses).toBe(17)
    expect(a.weeks).toHaveLength(17)
    expect(a.wins).toBe(a.weeks.filter((w) => w.win).length)
  })

  it('different seeds produce different seasons', () => {
    const results = new Set(
      Array.from({ length: 10 }, (_, i) =>
        simulateSeason(picks, `s${i}`).weeks.map((w) => (w.win ? 'W' : 'L')).join(''),
      ),
    )
    expect(results.size).toBeGreaterThan(1)
  })

  it('a dominant roster beats a weak one over many seasons', () => {
    const strong = rosterWithScores([99, 95, 97, 92, 96, 94])
    const weak = rosterWithScores([15, 10, 12, 8, 14, 11])
    let strongWins = 0
    let weakWins = 0
    for (let i = 0; i < 200; i++) {
      strongWins += simulateSeason(strong, `cmp-${i}`).wins
      weakWins += simulateSeason(weak, `cmp-${i}`).wins
    }
    expect(strongWins / 200).toBeGreaterThan(12)
    expect(weakWins / 200).toBeLessThan(5)
  })

  it('simSeedFor ties the sim to run seed and exact roster (id and season)', () => {
    const other = picks.map((p, i) => (i === 5 ? { ...p, id: 'different' } : p))
    const otherSeason = picks.map((p, i) => (i === 0 ? { ...p, season: 1988 } : p))
    expect(simSeedFor('run', picks)).not.toBe(simSeedFor('run', other))
    expect(simSeedFor('run', picks)).not.toBe(simSeedFor('run', otherSeason))
    expect(simSeedFor('run', picks)).toBe(simSeedFor('run', [...picks]))
    expect(simSeedFor('run2', picks)).not.toBe(simSeedFor('run', picks))
  })

  it('uses DEFAULT_SIM_PARAMS weeks', () => {
    expect(DEFAULT_SIM_PARAMS.weeks).toBe(17)
  })

  it('pins the tuned parameters (change only via scripts/tune-sim.ts)', () => {
    expect(DEFAULT_SIM_PARAMS).toEqual({
      ...SPEC_SIM_PARAMS,
      divisor: 14,
      oppMean: 58,
      oppSd: 7,
      oppMin: 40,
      oppMax: 75,
    })
    // The locked knobs stay at spec values.
    expect(DEFAULT_SIM_PARAMS.weights).toEqual(SPEC_SIM_PARAMS.weights)
    expect(DEFAULT_SIM_PARAMS.weakestLinkShare).toBe(0.15)
    expect(DEFAULT_SIM_PARAMS.bonus).toBe(2.5)
  })
})

describe('tierFor', () => {
  it('maps every record to the section 4 tier', () => {
    expect(tierFor(17)).toBe('PERFECT')
    expect(tierFor(16)).toBe('HEARTBREAK')
    expect(tierFor(15)).toBe('ELITE')
    expect(tierFor(14)).toBe('ELITE')
    expect(tierFor(13)).toBe('CONTENDER')
    expect(tierFor(12)).toBe('CONTENDER')
    expect(tierFor(11)).toBe('PLAYOFF TEAM')
    expect(tierFor(10)).toBe('PLAYOFF TEAM')
    expect(tierFor(9)).toBe('AVERAGE')
    expect(tierFor(8)).toBe('AVERAGE')
    expect(tierFor(7)).toBe('ROUGH YEAR')
    expect(tierFor(6)).toBe('ROUGH YEAR')
    expect(tierFor(5)).toBe('DISASTER')
    expect(tierFor(0)).toBe('DISASTER')
  })
})
