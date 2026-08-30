import type { PlayerSeason, PlayersFile, Position } from '../shared/types.ts'
import { SCHEMA_VERSION } from '../shared/types.ts'

/**
 * Player data access for the game: load players.json and index it for the
 * spin -> pool lookups the draft loop makes.
 *
 * An "era" is a decade bucket derived from the seasons actually present
 * ("1990s", "2000s", ...). Pre-1999 curated data will add older eras with
 * no code change here.
 */

export interface EraDef {
  id: string // e.g. "2000s"
  min: number // 2000
  max: number // 2009
}

export function eraOf(season: number): string {
  return `${Math.floor(season / 10) * 10}s`
}

export interface PlayerIndex {
  dataVersion: string
  franchises: string[]
  eras: EraDef[]
  /** key `${franchise}|${era}|${pos}` -> player-seasons sorted by score desc */
  pools: Map<string, PlayerSeason[]>
}

export function poolKey(franchise: string, era: string, pos: Position): string {
  return `${franchise}|${era}|${pos}`
}

export function buildIndex(file: Pick<PlayersFile, 'dataVersion' | 'players'>): PlayerIndex {
  const franchises = [...new Set(file.players.map((p) => p.team))].filter(Boolean).sort()

  const decades = [...new Set(file.players.map((p) => Math.floor(p.season / 10) * 10))].sort()
  const eras: EraDef[] = decades.map((d) => ({ id: `${d}s`, min: d, max: d + 9 }))

  const pools = new Map<string, PlayerSeason[]>()
  for (const p of file.players) {
    const key = poolKey(p.team, eraOf(p.season), p.pos)
    const pool = pools.get(key)
    if (pool) pool.push(p)
    else pools.set(key, [p])
  }
  for (const pool of pools.values()) pool.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  return { dataVersion: file.dataVersion, franchises, eras, pools }
}

/**
 * Draft options for one spin: the franchise+era+position pool, deduped to
 * one row per player (their best season there), minus already-picked
 * players, top `limit` by score. Deterministic for a given dataset.
 */
export function draftOptions(
  index: PlayerIndex,
  franchise: string,
  era: string,
  pos: Position,
  excludeIds: ReadonlySet<string>,
  limit = 8,
): PlayerSeason[] {
  const pool = index.pools.get(poolKey(franchise, era, pos)) ?? []
  const seen = new Set<string>()
  const out: PlayerSeason[] = []
  for (const p of pool) {
    // pool is score-desc, so first occurrence is the player's best season
    if (excludeIds.has(p.id) || seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
    if (out.length >= limit) break
  }
  return out
}

export async function loadPlayers(url = '/data/players.json'): Promise<PlayersFile> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`players.json: HTTP ${res.status}`)
  const file = (await res.json()) as PlayersFile
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`players.json schemaVersion ${file.schemaVersion}, expected ${SCHEMA_VERSION}`)
  }
  return file
}
