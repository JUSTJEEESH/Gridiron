import { describe, expect, it } from 'vitest'
import { buildIndex, draftOptions, eraOf, poolKey } from './data.ts'
import { makePlayer } from './gameFixtures.ts'

describe('eraOf', () => {
  it('buckets seasons into decades', () => {
    expect(eraOf(1999)).toBe('1990s')
    expect(eraOf(2000)).toBe('2000s')
    expect(eraOf(2009)).toBe('2000s')
    expect(eraOf(2025)).toBe('2020s')
  })
})

describe('buildIndex', () => {
  const index = buildIndex({
    dataVersion: 'abc',
    players: [
      makePlayer({ id: 'q1', team: 'KC', season: 2018, score: 95 }),
      makePlayer({ id: 'q2', team: 'KC', season: 2015, score: 60 }),
      makePlayer({ id: 'w1', team: 'IND', pos: 'WR', season: 1999, score: 99 }),
    ],
  })

  it('collects sorted franchises and the eras present in the data', () => {
    expect(index.franchises).toEqual(['IND', 'KC'])
    expect(index.eras).toEqual([
      { id: '1990s', min: 1990, max: 1999 },
      { id: '2010s', min: 2010, max: 2019 },
    ])
  })

  it('pools by franchise|era|pos, sorted by score desc', () => {
    const pool = index.pools.get(poolKey('KC', '2010s', 'QB'))!
    expect(pool.map((p) => p.id)).toEqual(['q1', 'q2'])
    expect(index.pools.get(poolKey('IND', '1990s', 'WR'))!.map((p) => p.id)).toEqual(['w1'])
  })
})

describe('draftOptions', () => {
  const index = buildIndex({
    dataVersion: 'abc',
    players: [
      // Same player, two seasons in the same franchise+era: dedupe to best.
      makePlayer({ id: 'moss', team: 'NE', season: 2007, score: 100, pos: 'WR' }),
      makePlayer({ id: 'moss', team: 'NE', season: 2009, score: 80, pos: 'WR' }),
      makePlayer({ id: 'welker', team: 'NE', season: 2007, score: 90, pos: 'WR' }),
      makePlayer({ id: 'other', team: 'NE', season: 2008, score: 70, pos: 'WR' }),
    ],
  })

  it('dedupes to each player’s best season, sorted by score', () => {
    const opts = draftOptions(index, 'NE', '2000s', 'WR', new Set())
    expect(opts.map((p) => `${p.id}:${p.season}`)).toEqual(['moss:2007', 'welker:2007', 'other:2008'])
  })

  it('excludes already-picked players (no drafting the same player twice)', () => {
    const opts = draftOptions(index, 'NE', '2000s', 'WR', new Set(['moss']))
    expect(opts.map((p) => p.id)).toEqual(['welker', 'other'])
  })

  it('respects the option limit and returns empty for unknown pools', () => {
    expect(draftOptions(index, 'NE', '2000s', 'WR', new Set(), 2)).toHaveLength(2)
    expect(draftOptions(index, 'NE', '1990s', 'WR', new Set())).toEqual([])
    expect(draftOptions(index, 'KC', '2000s', 'QB', new Set())).toEqual([])
  })
})
