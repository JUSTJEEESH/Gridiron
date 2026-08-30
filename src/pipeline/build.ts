import { createHash } from 'node:crypto'
import type { PlayerSeason, PlayersFile, Position, RawRow } from '../shared/types.ts'
import { POSITIONS, SCHEMA_VERSION } from '../shared/types.ts'
import { cohortScores, isEligible, toPosition, toStatLine } from './score.ts'
import { cohortMedians, deriveTags } from './tags.ts'
import type { CuratedRow } from './curated.ts'

/**
 * Score one cohort (same position, same season — or same decade for curated
 * rows) and emit PlayerSeason records. Percentiles and tag medians are both
 * computed within the cohort, which is what makes the scoring era-normalized.
 */
export function scoreCohort(
  pos: Position,
  rows: RawRow[],
  src: 'nflverse' | 'curated',
): PlayerSeason[] {
  const scores = cohortScores(pos, rows)
  const medians = cohortMedians(pos, rows)
  return rows.map((r, i) => ({
    id: r.playerId,
    name: r.name,
    pos,
    team: r.team,
    season: r.season,
    games: r.games,
    score: scores[i],
    tags: deriveTags(pos, r, medians, scores[i]),
    src,
    stats: toStatLine(pos, r),
  }))
}

/**
 * nflverse target data is missing for 2003-2008 (upstream pbp gap), but a
 * handful of stray rows in those seasons still carry target values. Deriving
 * alpha from fragments would tag the wrong players, so when fewer than half
 * of a season's WRs have target data, the whole season's target fields are
 * treated as absent.
 */
export function sanitizeTargetGap(rows: RawRow[]): RawRow[] {
  const wrs = rows.filter((r) => r.positionGroup === 'WR')
  if (wrs.length === 0) return rows
  const covered = wrs.filter((r) => r.targets > 0).length
  if (covered / wrs.length >= 0.5) return rows
  return rows.map((r) => ({ ...r, targets: 0, targetShare: 0 }))
}

/** Bucket nflverse rows into (position, season) cohorts and score them. */
export function buildNflverseSeasons(rowsBySeason: Map<number, RawRow[]>): PlayerSeason[] {
  const out: PlayerSeason[] = []
  for (const seasonRows of rowsBySeason.values()) {
    const rows = sanitizeTargetGap(seasonRows)
    for (const pos of POSITIONS) {
      const cohort = rows.filter((r) => {
        const p = toPosition(r)
        return p === pos && isEligible(pos, r)
      })
      if (cohort.length === 0) continue
      out.push(...scoreCohort(pos, cohort, 'nflverse'))
    }
  }
  return out
}

/** Bucket curated rows into (position, decade) cohorts and score them. */
export function buildCurated(rows: CuratedRow[]): PlayerSeason[] {
  const out: PlayerSeason[] = []
  const decades = [...new Set(rows.map((r) => r.decade))].sort()
  for (const decade of decades) {
    for (const pos of POSITIONS) {
      const cohort = rows.filter((r) => r.decade === decade && r.position === pos)
      if (cohort.length === 0) continue
      out.push(...scoreCohort(pos, cohort, 'curated'))
    }
  }
  return out
}

/** Stable content hash so dataVersion changes iff the data changes. */
export function dataVersion(players: PlayerSeason[]): string {
  const hash = createHash('sha256')
  hash.update(JSON.stringify(players))
  return hash.digest('hex').slice(0, 12)
}

export function assemble(players: PlayerSeason[]): PlayersFile {
  const sorted = [...players].sort(
    (a, b) =>
      a.season - b.season ||
      POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) ||
      b.score - a.score ||
      a.id.localeCompare(b.id),
  )
  const seasons = sorted.map((p) => p.season)
  return {
    schemaVersion: SCHEMA_VERSION,
    dataVersion: dataVersion(sorted),
    generatedAt: new Date().toISOString(),
    seasons: { min: Math.min(...seasons), max: Math.max(...seasons) },
    counts: {
      total: sorted.length,
      nflverse: sorted.filter((p) => p.src === 'nflverse').length,
      curated: sorted.filter((p) => p.src === 'curated').length,
    },
    players: sorted,
  }
}

/**
 * Sanity validation before the file is written. Throws with every problem
 * found, not just the first.
 */
export function validate(file: PlayersFile): void {
  const problems: string[] = []
  const seen = new Set<string>()

  for (const p of file.players) {
    const key = `${p.id}:${p.season}`
    if (seen.has(key)) problems.push(`duplicate player-season ${key}`)
    seen.add(key)
    if (!p.id || !p.name) problems.push(`missing id/name: ${JSON.stringify(p)}`)
    if (!POSITIONS.includes(p.pos)) problems.push(`${key}: bad pos ${p.pos}`)
    if (!(p.score >= 0 && p.score <= 100)) problems.push(`${key}: score ${p.score} out of range`)
    if (!Number.isInteger(p.season)) problems.push(`${key}: bad season`)
  }

  // Every nflverse season must have a usable cohort at every position —
  // a thin cohort means the source data or the position mapping regressed.
  const bySeasonPos = new Map<string, number>()
  for (const p of file.players) {
    if (p.src !== 'nflverse') continue
    const k = `${p.season}:${p.pos}`
    bySeasonPos.set(k, (bySeasonPos.get(k) ?? 0) + 1)
  }
  const nflverseSeasons = [...new Set(file.players.filter((p) => p.src === 'nflverse').map((p) => p.season))]
  for (const season of nflverseSeasons) {
    for (const pos of POSITIONS) {
      const n = bySeasonPos.get(`${season}:${pos}`) ?? 0
      if (n < 20) problems.push(`${season} ${pos}: cohort of ${n} (< 20) — mapping or source regressed`)
    }
  }

  if (problems.length > 0) {
    throw new Error(`players.json failed validation:\n  ${problems.slice(0, 40).join('\n  ')}`)
  }
}
