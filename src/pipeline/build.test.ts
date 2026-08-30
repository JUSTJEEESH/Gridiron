import { describe, expect, it } from 'vitest'
import { assemble, buildNflverseSeasons, dataVersion, sanitizeTargetGap, scoreCohort, validate } from './build.ts'
import { makeRaw } from './fixtures.ts'
import type { RawRow } from '../shared/types.ts'

describe('scoreCohort', () => {
  it('produces complete PlayerSeason records with scores and tags in sync', () => {
    const cohort = [
      makeRaw({ playerId: 'wr-a', name: 'A', team: 'AAA', season: 2010, positionGroup: 'WR', targets: 120, receptions: 80, receivingYards: 1300, targetShare: 0.28, fantasyPoints: 200 }),
      makeRaw({ playerId: 'wr-b', name: 'B', team: 'BBB', season: 2010, positionGroup: 'WR', targets: 90, receptions: 70, receivingYards: 700, targetShare: 0.2, fantasyPoints: 120 }),
      makeRaw({ playerId: 'wr-c', name: 'C', team: 'CCC', season: 2010, positionGroup: 'WR', targets: 60, receptions: 40, receivingYards: 500, targetShare: 0.15, fantasyPoints: 80 }),
    ]
    const out = scoreCohort('WR', cohort, 'nflverse')
    expect(out.map((p) => p.score)).toEqual([100, 50, 0])
    // ypr: 16.25, 10, 12.5 -> median 12.5; only A is above it
    expect(out[0].tags).toEqual(expect.arrayContaining(['vertical', 'alpha', 'elite']))
    expect(out[1].tags).toEqual([])
    expect(out[2].tags).toEqual([])
    expect(out[0].stats.ypr).toBeCloseTo(16.25)
    expect(out[0].src).toBe('nflverse')
  })
})

describe('buildNflverseSeasons', () => {
  it('scores each (position, season) cohort independently — era normalization', () => {
    const qb = (id: string, season: number, fp: number): RawRow =>
      makeRaw({ playerId: id, name: id, season, positionGroup: 'QB', position: 'QB', attempts: 500, passingYards: 3500, fantasyPoints: fp })

    const rows = new Map<number, RawRow[]>([
      [2000, [qb('q1', 2000, 100), qb('q2', 2000, 200)]],
      // Same absolute production is worth a different percentile in a
      // different season's cohort.
      [2001, [qb('q3', 2001, 200), qb('q4', 2001, 400)]],
    ])
    const out = buildNflverseSeasons(rows)
    const byId = Object.fromEntries(out.map((p) => [p.id, p]))
    expect(byId.q2.score).toBe(100) // 200 fp tops 2000
    expect(byId.q3.score).toBe(0) // 200 fp bottoms 2001
  })

  it('drops ineligible rows and unmapped positions', () => {
    const rows = new Map<number, RawRow[]>([
      [
        2000,
        [
          makeRaw({ playerId: 'qb-ok', positionGroup: 'QB', attempts: 300, fantasyPoints: 150 }),
          makeRaw({ playerId: 'qb-thin', positionGroup: 'QB', attempts: 12 }),
          makeRaw({ playerId: 'te', positionGroup: 'TE', targets: 100 }),
        ],
      ],
    ])
    expect(buildNflverseSeasons(rows).map((p) => p.id)).toEqual(['qb-ok'])
  })
})

describe('sanitizeTargetGap', () => {
  const wr = (id: string, targets: number, targetShare = 0): RawRow =>
    makeRaw({ playerId: id, positionGroup: 'WR', targets, targetShare, receptions: 50 })

  it('clears stray target fragments when most of a season lacks target data', () => {
    const rows = [wr('a', 120, 0.3), wr('b', 0), wr('c', 0), wr('d', 0)]
    const out = sanitizeTargetGap(rows)
    expect(out.every((r) => r.targets === 0 && r.targetShare === 0)).toBe(true)
    expect(rows[0].targets).toBe(120) // input not mutated
  })

  it('keeps target data when coverage is healthy', () => {
    const rows = [wr('a', 120, 0.3), wr('b', 90, 0.2), wr('c', 0)]
    expect(sanitizeTargetGap(rows)).toEqual(rows)
  })
})

describe('assemble + validate', () => {
  const players = () =>
    scoreCohort(
      'RB',
      [
        makeRaw({ playerId: 'r1', name: 'R1', season: 1985, carries: 320, rushingYards: 1500, fantasyPoints: 200 }),
        makeRaw({ playerId: 'r2', name: 'R2', season: 1985, carries: 250, rushingYards: 1100, fantasyPoints: 150 }),
      ],
      'curated',
    )

  it('assembles a versioned file with counts and season range', () => {
    const file = assemble(players())
    expect(file.schemaVersion).toBe(1)
    expect(file.dataVersion).toMatch(/^[0-9a-f]{12}$/)
    expect(file.seasons).toEqual({ min: 1985, max: 1985 })
    expect(file.counts).toEqual({ total: 2, nflverse: 0, curated: 2 })
    expect(() => validate(file)).not.toThrow()
  })

  it('dataVersion is stable for identical data and changes when data changes', () => {
    const a = players()
    const b = players()
    expect(dataVersion(a)).toBe(dataVersion(b))
    b[0].score = 99
    expect(dataVersion(a)).not.toBe(dataVersion(b))
  })

  it('validate rejects duplicates and out-of-range scores', () => {
    const dup = [...players(), ...players()]
    expect(() => validate(assemble(dup))).toThrow(/duplicate/)

    const bad = players()
    bad[0].score = 101
    expect(() => validate(assemble(bad))).toThrow(/out of range/)
  })

  it('validate rejects a thin nflverse cohort', () => {
    const thin = players().map((p) => ({ ...p, src: 'nflverse' as const }))
    expect(() => validate(assemble(thin))).toThrow(/cohort/)
  })
})
