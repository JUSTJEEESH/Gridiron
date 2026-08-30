/**
 * Slice 1 entry point: build public/data/players.json.
 *
 *   npm run data:build            # pull nflverse (cached in .cache/), rebuild
 *   npm run data:build:offline    # rebuild from cache only, no network
 *
 * Pulls nflverse season-aggregated player stats from 1999 forward (probing
 * until seasons stop existing), merges the hand-curated pre-1999 CSV, scores
 * every player-season as a percentile within its (position, season) cohort,
 * derives tags, validates, and writes a versioned players.json.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchSeasonCsv, parseSeasonCsv, NFLVERSE_FIRST_SEASON } from '../src/pipeline/nflverse.ts'
import { loadCuratedCsv } from '../src/pipeline/curated.ts'
import { assemble, buildCurated, buildNflverseSeasons, validate } from '../src/pipeline/build.ts'
import { POSITIONS, type RawRow } from '../src/shared/types.ts'

const ROOT = join(import.meta.dirname, '..')
const CACHE_DIR = join(ROOT, '.cache', 'nflverse')
const CURATED_CSV = join(ROOT, 'data', 'curated', 'pre1999.csv')
const OUT_PATH = join(ROOT, 'public', 'data', 'players.json')

const offline = process.argv.includes('--offline')

async function main() {
  const rowsBySeason = new Map<number, RawRow[]>()
  const lastCandidate = new Date().getFullYear()

  for (let season = NFLVERSE_FIRST_SEASON; season <= lastCandidate; season++) {
    const csv = await fetchSeasonCsv(season, CACHE_DIR, offline)
    if (csv === null) {
      console.log(`  ${season}: not available${offline ? ' in cache' : ''}, stopping`)
      break
    }
    const rows = parseSeasonCsv(csv)
    rowsBySeason.set(season, rows)
    console.log(`  ${season}: ${rows.length} raw rows`)
  }
  if (rowsBySeason.size === 0) {
    throw new Error(offline ? 'cache is empty — run without --offline first' : 'no nflverse seasons downloaded')
  }

  const nflverse = buildNflverseSeasons(rowsBySeason)
  const curatedRows = await loadCuratedCsv(CURATED_CSV)
  const curated = buildCurated(curatedRows)
  console.log(`\nScored ${nflverse.length} nflverse player-seasons, ${curated.length} curated`)

  const file = assemble([...nflverse, ...curated])
  validate(file)

  await mkdir(join(ROOT, 'public', 'data'), { recursive: true })
  const json = JSON.stringify(file)
  await writeFile(OUT_PATH, json)

  console.log(`\nWrote public/data/players.json`)
  console.log(`  schemaVersion ${file.schemaVersion}, dataVersion ${file.dataVersion}`)
  console.log(`  seasons ${file.seasons.min}-${file.seasons.max}, ${file.counts.total} player-seasons (${file.counts.curated} curated)`)
  console.log(`  size ${(json.length / 1024 / 1024).toFixed(2)} MB raw`)

  // Per-position season averages, eyeball check that cohorts are sane.
  const latest = file.seasons.max
  for (const pos of POSITIONS) {
    const cohort = file.players.filter((p) => p.season === latest && p.pos === pos)
    const top = [...cohort].sort((a, b) => b.score - a.score)[0]
    console.log(`  ${latest} ${pos}: ${cohort.length} players, top = ${top?.name} (${top?.score})${top?.tags.length ? ' [' + top.tags.join(', ') + ']' : ''}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
