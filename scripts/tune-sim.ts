/**
 * Slice 3 tuning harness — spec section 6:
 *
 *   "Run 100,000 random rosters and adjust the 15 divisor and the opponent
 *    distribution until 17-0 lands between 1% and 2%, with the mode of the
 *    distribution at 10-7 or 11-6."
 *
 * Rosters come from the real draft flow (real players.json, seeded spins,
 * uniform-random option choice), so the tuned distribution matches what
 * players will actually see. Weights, the weakest-link share, and the +2.5
 * bonus are locked; only the divisor and opponent knobs move.
 *
 *   npm run sim:tune              # grid-search on 20k, confirm winner on 100k
 *   npm run sim:tune -- --params 9,74,7   # evaluate one combo on 100k
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PlayersFile } from '../src/shared/types.ts'
import { buildIndex } from '../src/game/data.ts'
import { isComplete, newDraft, pickPlayer } from '../src/game/draft.ts'
import { chemistry } from '../src/game/chemistry.ts'
import { newRng, nextInt } from '../src/game/rng.ts'
import { simulateWeeks, teamRating, SPEC_SIM_PARAMS, type SimParams } from '../src/game/sim.ts'

const ROOT = join(import.meta.dirname, '..')

interface Roster {
  t: number
}

/** Draft `n` rosters through the real state machine with seeded random choices. */
function sampleRosters(index: ReturnType<typeof buildIndex>, n: number): Roster[] {
  const rosters: Roster[] = []
  let choiceRng = newRng('tune-choices')
  for (let i = 0; i < n; i++) {
    let state = newDraft(index, `tune-roster-${i}`)
    while (!isComplete(state)) {
      const d = nextInt(choiceRng, state.spin!.options.length)
      choiceRng = d.state
      state = pickPlayer(index, state, state.spin!.options[d.value].id)
    }
    rosters.push({ t: teamRating(state.picks, chemistry(state.picks), SPEC_SIM_PARAMS) })
  }
  return rosters
}

interface Evaluation {
  histogram: number[]
  pct17: number
  mode: number
  meanWins: number
}

function evaluate(rosters: Roster[], params: SimParams, seedTag: string): Evaluation {
  const histogram = new Array<number>(params.weeks + 1).fill(0)
  let totalWins = 0
  for (let i = 0; i < rosters.length; i++) {
    const { wins } = simulateWeeks(rosters[i].t, `${seedTag}-${i}`, params)
    histogram[wins]++
    totalWins += wins
  }
  const pct17 = (100 * histogram[params.weeks]) / rosters.length
  const mode = histogram.indexOf(Math.max(...histogram))
  return { histogram, pct17, mode, meanWins: totalWins / rosters.length }
}

function onTarget(e: Evaluation): boolean {
  return e.pct17 >= 1 && e.pct17 <= 2 && (e.mode === 10 || e.mode === 11)
}

function show(e: Evaluation, n: number): string {
  const bars = e.histogram
    .map((c, w) => `  ${String(w).padStart(2)}W ${String(c).padStart(6)} ${'#'.repeat(Math.round((300 * c) / n))}`)
    .join('\n')
  return `${bars}\n  17-0: ${e.pct17.toFixed(2)}%  mode: ${e.mode}  mean: ${e.meanWins.toFixed(2)}`
}

async function main() {
  const file = JSON.parse(await readFile(join(ROOT, 'public', 'data', 'players.json'), 'utf8')) as PlayersFile
  const index = buildIndex(file)

  console.log('Sampling rosters through the draft flow…')
  const t0 = Date.now()
  const search = sampleRosters(index, 20_000)
  console.log(`  20k search rosters in ${Date.now() - t0}ms`)
  const ts = search.map((r) => r.t).sort((a, b) => a - b)
  console.log(
    `  T: p5=${ts[Math.floor(ts.length * 0.05)].toFixed(1)} p50=${ts[Math.floor(ts.length * 0.5)].toFixed(1)} p95=${ts[Math.floor(ts.length * 0.95)].toFixed(1)} max=${ts[ts.length - 1].toFixed(1)}`,
  )

  const single = process.argv.indexOf('--params')
  let best: { params: SimParams; e: Evaluation } | null = null
  let confirmList: { params: SimParams; e: Evaluation }[] = []

  if (single !== -1) {
    const [divisor, oppMean, oppSd] = process.argv[single + 1].split(',').map(Number)
    const params: SimParams = { ...SPEC_SIM_PARAMS, divisor, oppMean, oppSd, oppMin: oppMean - 18, oppMax: oppMean + 17 }
    best = { params, e: evaluate(search, params, 'search') }
  } else {
    // Real drafted rosters center near T=60 (percentiles, weakest link, thin
    // pools), far below the spec's opponent mean of 78 — no combo near the
    // written values can hit the target. The opponent distribution slides as
    // a block instead: clip bounds translate with the mean, keeping the
    // spec's shape (mean-18, mean+17).
    const candidates: { params: SimParams; e: Evaluation }[] = []
    for (const divisor of [8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      for (const oppMean of [52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78]) {
        for (const oppSd of [6, 7, 8]) {
          const params: SimParams = {
            ...SPEC_SIM_PARAMS,
            divisor,
            oppMean,
            oppSd,
            oppMin: oppMean - 18,
            oppMax: oppMean + 17,
          }
          const e = evaluate(search, params, 'search')
          if (onTarget(e)) candidates.push({ params, e })
        }
      }
    }
    console.log(`\n${candidates.length} combos on target at 20k:`)
    for (const c of candidates) {
      console.log(
        `  divisor=${c.params.divisor} oppMean=${c.params.oppMean} oppSd=${c.params.oppSd}  17-0=${c.e.pct17.toFixed(2)}% mode=${c.e.mode} mean=${c.e.meanWins.toFixed(2)}`,
      )
    }
    if (candidates.length === 0) throw new Error('no combo hit the target — widen the grid')
    // Prefer the smallest deviation from the spec's divisor and sd (the
    // mean has to move; the divisor and shape should move least).
    const dev = (p: SimParams) => Math.abs(p.divisor - 15) + Math.abs(p.oppSd - 7)
    candidates.sort((a, b) => dev(a.params) - dev(b.params) || Math.abs(a.e.pct17 - 1.5) - Math.abs(b.e.pct17 - 1.5))
    best = candidates[0]
    confirmList = candidates.slice(0, 8)
  }

  const t1 = Date.now()
  const confirm = sampleRosters(index, 100_000)
  console.log(`\n100k confirm rosters in ${Date.now() - t1}ms`)

  // The win distribution is flat-topped, so a 20k mode can drift at 100k:
  // confirm candidates in preference order and keep the first that holds.
  const toConfirm = single !== -1 ? [best] : confirmList
  let winner: { params: SimParams; e: Evaluation } | null = null
  for (const c of toConfirm) {
    const e = evaluate(confirm, c.params, 'confirm')
    const hit = onTarget(e)
    console.log(
      `  divisor=${c.params.divisor} oppMean=${c.params.oppMean} oppSd=${c.params.oppSd}  17-0=${e.pct17.toFixed(2)}% mode=${e.mode} mean=${e.meanWins.toFixed(2)}  ${hit ? 'HIT' : 'missed'}`,
    )
    if (hit && !winner) winner = { params: c.params, e }
  }
  if (!winner) throw new Error('no candidate held the target at 100k — widen the grid')
  console.log(`\nWinner: divisor=${winner.params.divisor} oppMean=${winner.params.oppMean} oppSd=${winner.params.oppSd} (oppMin=${winner.params.oppMin}, oppMax=${winner.params.oppMax})\n`)
  console.log(show(winner.e, confirm.length))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
