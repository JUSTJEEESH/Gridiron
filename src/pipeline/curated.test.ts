import { describe, expect, it } from 'vitest'
import { curatedId, parseCuratedCsv, standardFantasyPoints, CURATED_COLUMNS } from './curated.ts'
import { buildCurated } from './build.ts'

const HEADER = CURATED_COLUMNS.join(',')

// Synthetic fixture rows — placeholder numbers for testing the loader, not
// real player stats.
function csvWith(...rows: string[]): string {
  return [HEADER, ...rows].join('\n')
}

function row(over: Record<string, string>): string {
  const defaults: Record<string, string> = Object.fromEntries(CURATED_COLUMNS.map((c) => [c, '']))
  return CURATED_COLUMNS.map((c) => over[c] ?? defaults[c]).join(',')
}

describe('parseCuratedCsv', () => {
  it('parses a QB row into the shared RawRow shape', () => {
    const rows = parseCuratedCsv(
      csvWith(row({ name: 'Test QB', pos: 'QB', team: 'MIA', season: '1984', games: '16', pass_att: '500', pass_yds: '4000', pass_td: '30', pass_int: '15' })),
    )
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.playerId).toBe('pre-test-qb-1984')
    expect(r.position).toBe('QB')
    expect(r.season).toBe(1984)
    expect(r.decade).toBe(1980)
    expect(r.attempts).toBe(500)
    expect(r.passingYards).toBe(4000)
    // 4000/25 + 30*4 - 15*2 = 160 + 120 - 30
    expect(r.fantasyPoints).toBeCloseTo(250)
  })

  it('accepts a header-only file (the slice 1 stub state)', () => {
    expect(parseCuratedCsv(HEADER + '\n')).toEqual([])
  })

  it('rejects a bad position', () => {
    expect(() => parseCuratedCsv(csvWith(row({ name: 'X', pos: 'TE', season: '1990' })))).toThrow(/pos/)
  })

  it('rejects seasons covered by nflverse (1999+)', () => {
    expect(() => parseCuratedCsv(csvWith(row({ name: 'X', pos: 'QB', season: '1999' })))).toThrow(/season/)
  })

  it('rejects a missing name and duplicate player-seasons', () => {
    expect(() => parseCuratedCsv(csvWith(row({ pos: 'QB', season: '1990' })))).toThrow(/name/)
    const dup = row({ name: 'Same Guy', pos: 'RB', season: '1975', carries: '300' })
    expect(() => parseCuratedCsv(csvWith(dup, dup))).toThrow(/duplicate/)
  })
})

describe('curatedId', () => {
  it('slugs names deterministically', () => {
    expect(curatedId("D'Artagnan O'Neal Jr.", 1968)).toBe('pre-d-artagnan-o-neal-jr-1968')
  })
})

describe('standardFantasyPoints', () => {
  it('applies the standard scoring formula', () => {
    expect(
      standardFantasyPoints({ pass_yds: '25', pass_td: '1', pass_int: '1', rush_yds: '10', rush_td: '1', rec_yds: '20', rec_td: '0' }),
    ).toBeCloseTo(1 + 4 - 2 + 1 + 6 + 2)
  })
})

describe('buildCurated', () => {
  it('scores within (position, decade) cohorts and derives tags from curated stats', () => {
    const rows = parseCuratedCsv(
      csvWith(
        // 1980s QBs: ypa 8.0 vs 6.0 -> higher one is gunslinger; attempts 500 vs 400 -> high_volume
        row({ name: 'Qb Big', pos: 'QB', team: 'MIA', season: '1984', games: '16', pass_att: '500', pass_yds: '4000', pass_td: '40', pass_int: '10' }),
        row({ name: 'Qb Small', pos: 'QB', team: 'CHI', season: '1985', games: '16', pass_att: '400', pass_yds: '2400', pass_td: '15', pass_int: '15' }),
        // 1970s RB in a different decade cohort, over the workhorse line
        row({ name: 'Rb Iron', pos: 'RB', team: 'CHI', season: '1977', games: '14', carries: '339', rush_yds: '1852', rush_td: '14' }),
      ),
    )
    const players = buildCurated(rows)
    expect(players).toHaveLength(3)

    const big = players.find((p) => p.name === 'Qb Big')!
    const small = players.find((p) => p.name === 'Qb Small')!
    const rb = players.find((p) => p.name === 'Rb Iron')!

    // Two-QB 1980s cohort: better line -> 100, worse -> 0
    expect(big.score).toBe(100)
    expect(small.score).toBe(0)
    expect(big.tags).toContain('gunslinger')
    expect(big.tags).toContain('high_volume')
    expect(big.tags).toContain('elite')
    expect(small.tags).not.toContain('gunslinger')

    // Lone RB in the 1970s cohort: neutral 50, workhorse from carries
    expect(rb.score).toBe(50)
    expect(rb.tags).toContain('workhorse')
    expect(rb.src).toBe('curated')
    expect(rb.stats.carries).toBe(339)
  })
})
