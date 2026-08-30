import type { PlayerSeason } from '../shared/types.ts'
import { chemistry, type ChemistryResult } from './chemistry.ts'
import { newRng, nextFloat, type RngState } from './rng.ts'

/**
 * Season simulation — spec section 6, deterministic from a seed.
 *
 *   base         = Σ weights[slot] * score[slot]
 *   weakest_link = 0.85 * base + 0.15 * min(scores)
 *   T            = clamp(weakest_link + chemistry, 0, 100)
 *   O            = normal(oppMean, oppSd) clipped [oppMin, oppMax], per week
 *   win_prob     = 1 / (1 + exp(-(T - O + bonus) / divisor))
 *   result       = seeded uniform < win_prob, 17 times
 */

export interface SimParams {
  /** Per-slot weights in draft order: QB, RB, WR1, WR2, EDGE, DB. */
  weights: readonly [number, number, number, number, number, number]
  weakestLinkShare: number
  oppMean: number
  oppSd: number
  oppMin: number
  oppMax: number
  bonus: number
  divisor: number
  weeks: number
}

/** Section 6 as written. The tuning harness adjusts divisor + opponent knobs. */
export const SPEC_SIM_PARAMS: SimParams = {
  weights: [0.3, 0.12, 0.16, 0.12, 0.17, 0.13],
  weakestLinkShare: 0.15,
  oppMean: 78,
  oppSd: 7,
  oppMin: 60,
  oppMax: 95,
  bonus: 2.5,
  divisor: 15,
  weeks: 17,
}

/**
 * Tuned via scripts/tune-sim.ts (100k rosters drafted through the real
 * flow): the spec allows adjusting the divisor and the opponent
 * distribution until 17-0 lands in 1-2% of runs with the mode at 10-11
 * wins. Real rosters center near T=60, so the opponent distribution slides
 * down as a block (clip bounds keep the spec's mean-18/mean+17 shape); the
 * divisor moves one notch. Weights, weakest-link share, and the +2.5 bonus
 * are locked. Confirmed on 100k: 17-0 = 1.26%, mode = 11, mean = 9.65.
 */
export const DEFAULT_SIM_PARAMS: SimParams = {
  ...SPEC_SIM_PARAMS,
  divisor: 14,
  oppMean: 58,
  oppSd: 7,
  oppMin: 40,
  oppMax: 75,
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** T for a full six-pick roster, chemistry included. */
export function teamRating(
  picks: readonly PlayerSeason[],
  chem: ChemistryResult,
  params: SimParams = DEFAULT_SIM_PARAMS,
): number {
  if (picks.length !== params.weights.length) {
    throw new Error(`teamRating: expected ${params.weights.length} picks, got ${picks.length}`)
  }
  const scores = picks.map((p) => p.score)
  const base = scores.reduce((sum, s, i) => sum + params.weights[i] * s, 0)
  const weakestLink = (1 - params.weakestLinkShare) * base + params.weakestLinkShare * Math.min(...scores)
  return clamp(weakestLink + chem.total, 0, 100)
}

export function winProb(t: number, o: number, params: SimParams = DEFAULT_SIM_PARAMS): number {
  return 1 / (1 + Math.exp(-(t - o + params.bonus) / params.divisor))
}

/**
 * One clipped-normal opponent draw (Box-Muller over two uniforms).
 * Consumes exactly two draws from the stream.
 */
export function nextOpponent(
  rng: RngState,
  params: SimParams = DEFAULT_SIM_PARAMS,
): { value: number; state: RngState } {
  const u1 = nextFloat(rng)
  const u2 = nextFloat(u1.state)
  const z = Math.sqrt(-2 * Math.log(1 - u1.value)) * Math.cos(2 * Math.PI * u2.value)
  return { value: clamp(params.oppMean + params.oppSd * z, params.oppMin, params.oppMax), state: u2.state }
}

export interface WeekResult {
  opponent: number
  win: boolean
}

export interface SeasonResult {
  wins: number
  losses: number
  weeks: WeekResult[]
  teamRating: number
  chemistry: ChemistryResult
  tier: string
}

/** Result tiers — spec section 4. */
export function tierFor(wins: number): string {
  if (wins === 17) return 'PERFECT'
  if (wins === 16) return 'HEARTBREAK'
  if (wins >= 14) return 'ELITE'
  if (wins >= 12) return 'CONTENDER'
  if (wins >= 10) return 'PLAYOFF TEAM'
  if (wins >= 8) return 'AVERAGE'
  if (wins >= 6) return 'ROUGH YEAR'
  return 'DISASTER'
}

/** The 17-week loop for a given team rating. Used directly by the tuning harness. */
export function simulateWeeks(
  t: number,
  seed: string,
  params: SimParams = DEFAULT_SIM_PARAMS,
): { wins: number; weeks: WeekResult[] } {
  let rng = newRng(seed)
  const weeks: WeekResult[] = []
  let wins = 0
  for (let w = 0; w < params.weeks; w++) {
    const o = nextOpponent(rng, params)
    const u = nextFloat(o.state)
    rng = u.state
    const win = u.value < winProb(t, o.value, params)
    if (win) wins++
    weeks.push({ opponent: o.value, win })
  }
  return { wins, weeks }
}

/**
 * Simulate a season. Same (picks, seed, params) -> same result, always.
 * Callers derive the seed from the run seed + roster so identical runs
 * replay exactly (see simSeedFor).
 */
export function simulateSeason(
  picks: readonly PlayerSeason[],
  seed: string,
  params: SimParams = DEFAULT_SIM_PARAMS,
): SeasonResult {
  const chem = chemistry(picks)
  const t = teamRating(picks, chem, params)
  const { wins, weeks } = simulateWeeks(t, seed, params)
  return { wins, losses: params.weeks - wins, weeks, teamRating: t, chemistry: chem, tier: tierFor(wins) }
}

/** Sim stream for a run: distinct from the draft stream, tied to the roster. */
export function simSeedFor(runSeed: string, picks: readonly PlayerSeason[]): string {
  return `${runSeed}:sim:${picks.map((p) => `${p.id}.${p.season}`).join(',')}`
}
