import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { num, parseCsvRecords } from './csv.ts'
import type { RawRow } from './types.ts'

/**
 * nflverse season-aggregated player stats (regular season), one CSV per
 * season, complete back to 1999. Offense + defense in one file, one row per
 * player per season. Team codes are already normalized to modern franchises
 * (STL -> LA, SD -> LAC, OAK -> LV).
 */
export const NFLVERSE_FIRST_SEASON = 1999

const BASE = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player'

export function seasonUrl(season: number): string {
  return `${BASE}/stats_player_reg_${season}.csv`
}

/**
 * Download a season CSV, caching on disk so re-runs don't touch the network.
 * Returns null for seasons nflverse doesn't have yet (HTTP 404) — the
 * pipeline probes forward from 1999 until seasons stop existing.
 */
export async function fetchSeasonCsv(
  season: number,
  cacheDir: string,
  offline = false,
): Promise<string | null> {
  const cachePath = join(cacheDir, `stats_player_reg_${season}.csv`)
  try {
    await access(cachePath)
    return await readFile(cachePath, 'utf8')
  } catch {
    // not cached
  }
  if (offline) return null

  const res = await fetch(seasonUrl(season))
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`nflverse ${season}: HTTP ${res.status}`)
  const text = await res.text()
  await mkdir(cacheDir, { recursive: true })
  await writeFile(cachePath, text)
  return text
}

/** Narrow a raw nflverse CSV record to the fields the pipeline uses. */
export function toRawRow(rec: Record<string, string>): RawRow {
  return {
    playerId: rec.player_id ?? '',
    name: rec.player_display_name || rec.player_name || '',
    position: rec.position ?? '',
    positionGroup: rec.position_group ?? '',
    team: rec.recent_team ?? '',
    season: num(rec.season),
    games: num(rec.games),
    completions: num(rec.completions),
    attempts: num(rec.attempts),
    passingYards: num(rec.passing_yards),
    passingTds: num(rec.passing_tds),
    passingInterceptions: num(rec.passing_interceptions),
    carries: num(rec.carries),
    rushingYards: num(rec.rushing_yards),
    rushingTds: num(rec.rushing_tds),
    receptions: num(rec.receptions),
    targets: num(rec.targets),
    receivingYards: num(rec.receiving_yards),
    receivingTds: num(rec.receiving_tds),
    targetShare: num(rec.target_share),
    fantasyPoints: num(rec.fantasy_points),
    defSacks: num(rec.def_sacks),
    defQbHits: num(rec.def_qb_hits),
    defTacklesForLoss: num(rec.def_tackles_for_loss),
    defFumblesForced: num(rec.def_fumbles_forced),
    defInterceptions: num(rec.def_interceptions),
    defPassDefended: num(rec.def_pass_defended),
    defTacklesSolo: num(rec.def_tackles_solo),
  }
}

export function parseSeasonCsv(text: string): RawRow[] {
  return parseCsvRecords(text)
    .map(toRawRow)
    .filter((r) => r.playerId !== '' && r.name !== '')
}
