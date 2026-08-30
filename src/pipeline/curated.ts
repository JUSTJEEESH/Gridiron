import { readFile } from 'node:fs/promises'
import { num, parseCsvRecords } from './csv.ts'
import { POSITIONS, type Position, type RawRow } from './types.ts'
import { NFLVERSE_FIRST_SEASON } from './nflverse.ts'

/**
 * Loader for the hand-curated pre-1999 CSV (data/curated/pre1999.csv).
 *
 * STUB in slice 1: the loader, schema validation, and merge path are real
 * and tested; the CSV ships header-only until the curation pass (spec says
 * it can land during slice 3). Rows use the same conceptual schema as the
 * nflverse mapping so both sources flow through identical scoring and tag
 * derivation.
 *
 * Scoring caveat, flagged for the curation task: pre-1999 rows can only be
 * ranked against other curated rows, so cohorts are (position, decade)
 * rather than (position, season), and because the file contains only
 * legends, percentiles are relative to legends — a 60 here is not a 60 in
 * the 1999+ pool. Slice 3 tuning must decide whether to rescale (e.g. map
 * the curated range onto [70, 100]) or curate cohort-context rows.
 */

export interface CuratedRow extends RawRow {
  /** Decade bucket used as the scoring cohort, e.g. 1980. */
  decade: number
}

export const CURATED_COLUMNS = [
  'name',
  'pos',
  'team',
  'season',
  'games',
  'pass_att',
  'pass_yds',
  'pass_td',
  'pass_int',
  'carries',
  'rush_yds',
  'rush_td',
  'targets',
  'receptions',
  'rec_yds',
  'rec_td',
  'target_share',
  'sacks',
  'qb_hits',
  'tfl',
  'forced_fumbles',
  'interceptions',
  'pass_defended',
  'tackles_solo',
] as const

export function curatedId(name: string, season: number): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `pre-${slug}-${season}`
}

/** Standard (non-PPR) fantasy scoring over the curated offensive columns. */
export function standardFantasyPoints(rec: Record<string, string>): number {
  return (
    num(rec.pass_yds) / 25 +
    num(rec.pass_td) * 4 -
    num(rec.pass_int) * 2 +
    num(rec.rush_yds) / 10 +
    num(rec.rush_td) * 6 +
    num(rec.rec_yds) / 10 +
    num(rec.rec_td) * 6
  )
}

export function parseCuratedCsv(text: string): CuratedRow[] {
  const recs = parseCsvRecords(text)
  const rows: CuratedRow[] = []
  const seen = new Set<string>()

  for (const [i, rec] of recs.entries()) {
    const line = i + 2 // 1-based, after header
    const name = (rec.name ?? '').trim()
    const pos = (rec.pos ?? '').trim() as Position
    const season = num(rec.season)

    if (!name) throw new Error(`pre1999.csv line ${line}: missing name`)
    if (!POSITIONS.includes(pos))
      throw new Error(`pre1999.csv line ${line}: pos must be one of ${POSITIONS.join('|')}, got "${rec.pos}"`)
    if (!Number.isInteger(season) || season < 1920 || season >= NFLVERSE_FIRST_SEASON)
      throw new Error(`pre1999.csv line ${line}: season must be an integer in [1920, ${NFLVERSE_FIRST_SEASON - 1}], got "${rec.season}"`)

    const id = curatedId(name, season)
    if (seen.has(id)) throw new Error(`pre1999.csv line ${line}: duplicate player-season ${id}`)
    seen.add(id)

    rows.push({
      playerId: id,
      name,
      // position/positionGroup already resolved by the curator.
      position: pos,
      positionGroup: pos,
      team: (rec.team ?? '').trim(),
      season,
      games: num(rec.games),
      completions: 0,
      attempts: num(rec.pass_att),
      passingYards: num(rec.pass_yds),
      passingTds: num(rec.pass_td),
      passingInterceptions: num(rec.pass_int),
      carries: num(rec.carries),
      rushingYards: num(rec.rush_yds),
      rushingTds: num(rec.rush_td),
      receptions: num(rec.receptions),
      targets: num(rec.targets),
      receivingYards: num(rec.rec_yds),
      receivingTds: num(rec.rec_td),
      targetShare: num(rec.target_share),
      // League-standard scoring computed from the curated stats, so curated
      // offense ranks through the same path as nflverse offense (which ships
      // this pre-computed as fantasy_points).
      fantasyPoints: standardFantasyPoints(rec),
      defSacks: num(rec.sacks),
      defQbHits: num(rec.qb_hits),
      defTacklesForLoss: num(rec.tfl),
      defFumblesForced: num(rec.forced_fumbles),
      defInterceptions: num(rec.interceptions),
      defPassDefended: num(rec.pass_defended),
      defTacklesSolo: num(rec.tackles_solo),
      decade: Math.floor(season / 10) * 10,
    })
  }
  return rows
}

export async function loadCuratedCsv(path: string): Promise<CuratedRow[]> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return [] // file optional until curation lands
  }
  return parseCuratedCsv(text)
}
