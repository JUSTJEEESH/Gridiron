import type { Position, RawRow, Tag } from './types.ts'
import { median } from './percentile.ts'

/**
 * Tag derivation — spec section 5. Nothing hand-authored; every tag is a
 * rule over the same stats percentiles come from.
 *
 * Section 5 verbatim:
 * - vertical:   WR, yards per reception above the era (season-cohort) median
 * - alpha:      WR, target share above 25%
 * - workhorse:  RB, more than 300 carries
 * - gunslinger: QB, yards per attempt above the era median
 *
 * Section 6's chemistry rules reference three more player properties. They
 * are derived here with the same patterns so slice 3 can fire those rules
 * without touching the data again:
 * - high_volume: QB, pass attempts above the era median ("high-volume
 *   passing QB"). Median over qualified QBs.
 * - ball_hawk:   DB, interceptions above the era median ("ball-hawk DB").
 * - elite:       any position, percentile score >= 90 ("elite EDGE").
 *
 * "Vertical QB" in section 6 maps to gunslinger (above-median yards per
 * attempt IS the vertical passing profile); no separate tag.
 */

export const ALPHA_TARGET_SHARE = 0.25
export const WORKHORSE_CARRIES = 300
export const ELITE_SCORE = 90

/** Per-cohort medians the tag rules compare against. */
export interface CohortMedians {
  ypa?: number
  passAtt?: number
  ypr?: number
  interceptions?: number
}

export function cohortMedians(pos: Position, rows: RawRow[]): CohortMedians {
  switch (pos) {
    case 'QB':
      return {
        ypa: median(rows.map((r) => (r.attempts > 0 ? r.passingYards / r.attempts : 0))),
        passAtt: median(rows.map((r) => r.attempts)),
      }
    case 'WR':
      return {
        ypr: median(rows.map((r) => (r.receptions > 0 ? r.receivingYards / r.receptions : 0))),
      }
    case 'DB':
      return { interceptions: median(rows.map((r) => r.defInterceptions)) }
    default:
      return {}
  }
}

export function deriveTags(
  pos: Position,
  row: RawRow,
  medians: CohortMedians,
  score: number,
): Tag[] {
  const tags: Tag[] = []
  switch (pos) {
    case 'QB': {
      const ypa = row.attempts > 0 ? row.passingYards / row.attempts : 0
      if (medians.ypa !== undefined && ypa > medians.ypa) tags.push('gunslinger')
      if (medians.passAtt !== undefined && row.attempts > medians.passAtt) tags.push('high_volume')
      break
    }
    case 'RB':
      if (row.carries > WORKHORSE_CARRIES) tags.push('workhorse')
      break
    case 'WR': {
      const ypr = row.receptions > 0 ? row.receivingYards / row.receptions : 0
      if (medians.ypr !== undefined && ypr > medians.ypr) tags.push('vertical')
      if (row.targetShare > ALPHA_TARGET_SHARE) tags.push('alpha')
      break
    }
    case 'DB':
      if (medians.interceptions !== undefined && row.defInterceptions > medians.interceptions)
        tags.push('ball_hawk')
      break
    case 'EDGE':
      break
  }
  if (score >= ELITE_SCORE) tags.push('elite')
  return tags
}
