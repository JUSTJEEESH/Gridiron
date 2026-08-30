/**
 * Percentile scoring. A player-season's score is its percentile within its
 * (position, season) cohort, 0-100:
 *
 *   score = 100 * (meanRank - 1) / (n - 1)
 *
 * where meanRank is the average 1-based rank of the value (ties share the
 * mean of their ranks). Best value in the cohort -> 100, worst -> 0, ties
 * get identical scores. A cohort of one gets 50 (no information either way).
 */

/** Percentile of each value within the given cohort, in input order. */
export function percentiles(values: number[]): number[] {
  const n = values.length
  if (n === 0) return []
  if (n === 1) return [50]

  const order = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v)

  // Assign mean ranks to ties.
  const ranks = new Array<number>(n)
  let k = 0
  while (k < n) {
    let j = k
    while (j + 1 < n && order[j + 1].v === order[k].v) j++
    const meanRank = (k + j) / 2 + 1 // 1-based mean of ranks k..j
    for (let m = k; m <= j; m++) ranks[order[m].i] = meanRank
    k = j + 1
  }

  return ranks.map((r) => (100 * (r - 1)) / (n - 1))
}

/** Median of a list. Throws on empty input — callers guard cohort size. */
export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of empty list')
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Mean of a list; 0 for empty. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Population standard deviation; 0 for empty or constant lists. */
export function stddev(values: number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

/**
 * z-scores of values against their own distribution. If the distribution is
 * constant, all z-scores are 0.
 */
export function zscores(values: number[]): number[] {
  const m = mean(values)
  const sd = stddev(values)
  if (sd === 0) return values.map(() => 0)
  return values.map((v) => (v - m) / sd)
}
