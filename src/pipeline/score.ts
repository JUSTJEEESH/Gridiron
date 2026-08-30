import type { Position, RawRow, StatLine } from './types.ts'
import { percentiles, zscores } from './percentile.ts'

/**
 * Map an nflverse row to one of the game's five slots, or null if the player
 * isn't draftable.
 *
 * Early seasons use coarse labels (generic LB/DB/SAF), so we lean on
 * position_group where possible:
 * - QB / RB / WR: position_group verbatim (FB rides with RB and is filtered
 *   out by the volume floor below).
 * - DB: position_group DB (covers CB/FS/SS/S/SAF/DB across eras).
 * - EDGE: DE or OLB, plus generic/inside LB rows with 8+ sacks — pre-2002ish
 *   data labels many 3-4 edge rushers (Boulware, Gildon) as plain "LB", and
 *   8 sacks from a "linebacker" is edge usage by production.
 */
export function toPosition(row: RawRow): Position | null {
  switch (row.positionGroup) {
    case 'QB':
      return 'QB'
    case 'RB':
      return 'RB'
    case 'WR':
      return 'WR'
    case 'DB':
      return 'DB'
    case 'LB':
      if (row.position === 'OLB') return 'EDGE'
      if (row.defSacks >= 8) return 'EDGE'
      return null
    case 'DL':
      if (row.position === 'DE') return 'EDGE'
      return null
    default:
      return null
  }
}

/**
 * Cohort eligibility floors. Percentiles are only meaningful against players
 * who actually played the role, so bit players are excluded entirely (they
 * are also not draftable — nobody is picking a 12-attempt QB).
 */
export function isEligible(pos: Position, row: RawRow): boolean {
  switch (pos) {
    case 'QB':
      return row.attempts >= 100
    case 'RB':
      return row.carries >= 50
    case 'WR':
      // Targets are missing from nflverse for 2003-2008 (upstream pbp gap),
      // so a receptions floor stands in when target data is absent.
      return row.targets >= 30 || row.receptions >= 20
    case 'EDGE':
      return row.games >= 6 && row.defSacks >= 2
    case 'DB':
      return row.games >= 6 && row.defInterceptions + row.defPassDefended >= 4
  }
}

/**
 * The single number a player-season is ranked on within its cohort.
 *
 * - QB/RB/WR: nflverse-provided standard fantasy points. Not a stat we
 *   authored; it already aggregates yards/TDs/turnovers with league-standard
 *   weights and captures dual-threat value.
 * - EDGE: sum of cohort z-scores of sacks, QB hits, TFL, forced fumbles.
 * - DB: sum of cohort z-scores of INTs, passes defended, solo tackles,
 *   forced fumbles.
 *
 * Defensive composites are equal-weight because the spec forbids
 * hand-authored ratings; equal-weight z-scores are the least-opinionated
 * aggregation available. Since scores are percentiles, only the ranking the
 * composite induces matters, not its scale.
 */
export function rankingValues(pos: Position, rows: RawRow[]): number[] {
  switch (pos) {
    case 'QB':
    case 'RB':
    case 'WR':
      return rows.map((r) => r.fantasyPoints)
    case 'EDGE': {
      const parts = [
        zscores(rows.map((r) => r.defSacks)),
        zscores(rows.map((r) => r.defQbHits)),
        zscores(rows.map((r) => r.defTacklesForLoss)),
        zscores(rows.map((r) => r.defFumblesForced)),
      ]
      return rows.map((_, i) => parts.reduce((sum, p) => sum + p[i], 0))
    }
    case 'DB': {
      const parts = [
        zscores(rows.map((r) => r.defInterceptions)),
        zscores(rows.map((r) => r.defPassDefended)),
        zscores(rows.map((r) => r.defTacklesSolo)),
        zscores(rows.map((r) => r.defFumblesForced)),
      ]
      return rows.map((_, i) => parts.reduce((sum, p) => sum + p[i], 0))
    }
  }
}

/** Percentile scores for a (position, season) cohort, in input order. */
export function cohortScores(pos: Position, rows: RawRow[]): number[] {
  return percentiles(rankingValues(pos, rows)).map((p) => round1(p))
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Position-relevant stat line for the output, for auditability. */
export function toStatLine(pos: Position, r: RawRow): StatLine {
  switch (pos) {
    case 'QB':
      return {
        passAtt: r.attempts,
        passYds: r.passingYards,
        passTd: r.passingTds,
        passInt: r.passingInterceptions,
        ypa: r.attempts > 0 ? round3(r.passingYards / r.attempts) : 0,
        carries: r.carries || undefined,
        rushYds: r.rushingYards || undefined,
        rushTd: r.rushingTds || undefined,
      }
    case 'RB':
      return {
        carries: r.carries,
        rushYds: r.rushingYards,
        rushTd: r.rushingTds,
        targets: r.targets || undefined,
        receptions: r.receptions || undefined,
        recYds: r.receivingYards || undefined,
        recTd: r.receivingTds || undefined,
      }
    case 'WR':
      return {
        // targets/targetShare omitted where the source has none (2003-2008
        // nflverse gap, pre-1999 curated) rather than emitting fake zeros.
        targets: r.targets || undefined,
        receptions: r.receptions,
        recYds: r.receivingYards,
        recTd: r.receivingTds,
        targetShare: r.targetShare ? round3(r.targetShare) : undefined,
        ypr: r.receptions > 0 ? round3(r.receivingYards / r.receptions) : 0,
      }
    case 'EDGE':
      return {
        sacks: r.defSacks,
        qbHits: r.defQbHits,
        tfl: r.defTacklesForLoss,
        forcedFumbles: r.defFumblesForced,
      }
    case 'DB':
      return {
        interceptions: r.defInterceptions,
        passDefended: r.defPassDefended,
        tacklesSolo: r.defTacklesSolo,
        forcedFumbles: r.defFumblesForced,
      }
  }
}
