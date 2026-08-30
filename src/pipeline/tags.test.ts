import { describe, expect, it } from 'vitest'
import { cohortMedians, deriveTags } from './tags.ts'
import { makeRaw } from './fixtures.ts'

describe('QB tags', () => {
  // Cohort YPA: 6.0, 7.0, 8.0 -> median 7.0. Attempts: 400, 500, 600 -> median 500.
  const cohort = [
    makeRaw({ playerId: 'qb1', attempts: 400, passingYards: 2400 }),
    makeRaw({ playerId: 'qb2', attempts: 500, passingYards: 3500 }),
    makeRaw({ playerId: 'qb3', attempts: 600, passingYards: 4800 }),
  ]
  const medians = cohortMedians('QB', cohort)

  it('computes cohort medians for ypa and attempts', () => {
    expect(medians.ypa).toBeCloseTo(7.0)
    expect(medians.passAtt).toBe(500)
  })

  it('gunslinger requires ypa strictly above the median', () => {
    expect(deriveTags('QB', cohort[2], medians, 50)).toContain('gunslinger')
    expect(deriveTags('QB', cohort[1], medians, 50)).not.toContain('gunslinger') // exactly at median
    expect(deriveTags('QB', cohort[0], medians, 50)).not.toContain('gunslinger')
  })

  it('high_volume requires attempts strictly above the median', () => {
    expect(deriveTags('QB', cohort[2], medians, 50)).toContain('high_volume')
    expect(deriveTags('QB', cohort[1], medians, 50)).not.toContain('high_volume')
  })
})

describe('RB tags', () => {
  it('workhorse requires more than 300 carries', () => {
    const medians = {}
    expect(deriveTags('RB', makeRaw({ carries: 301 }), medians, 50)).toContain('workhorse')
    expect(deriveTags('RB', makeRaw({ carries: 300 }), medians, 50)).not.toContain('workhorse')
    expect(deriveTags('RB', makeRaw({ carries: 150 }), medians, 50)).not.toContain('workhorse')
  })
})

describe('WR tags', () => {
  // Cohort YPR: 10.0, 12.0, 16.0 -> median 12.0
  const cohort = [
    makeRaw({ playerId: 'wr1', receptions: 50, receivingYards: 500, targetShare: 0.18 }),
    makeRaw({ playerId: 'wr2', receptions: 50, receivingYards: 600, targetShare: 0.25 }),
    makeRaw({ playerId: 'wr3', receptions: 50, receivingYards: 800, targetShare: 0.31 }),
  ]
  const medians = cohortMedians('WR', cohort)

  it('vertical requires ypr strictly above the cohort median', () => {
    expect(medians.ypr).toBeCloseTo(12.0)
    expect(deriveTags('WR', cohort[2], medians, 50)).toContain('vertical')
    expect(deriveTags('WR', cohort[1], medians, 50)).not.toContain('vertical')
    expect(deriveTags('WR', cohort[0], medians, 50)).not.toContain('vertical')
  })

  it('alpha requires target share strictly above 25%', () => {
    expect(deriveTags('WR', cohort[2], medians, 50)).toContain('alpha')
    expect(deriveTags('WR', cohort[1], medians, 50)).not.toContain('alpha') // exactly 0.25
    expect(deriveTags('WR', cohort[0], medians, 50)).not.toContain('alpha')
  })

  it('a WR with zero receptions cannot be vertical', () => {
    const zero = makeRaw({ receptions: 0, receivingYards: 0 })
    expect(deriveTags('WR', zero, medians, 50)).not.toContain('vertical')
  })
})

describe('DB tags', () => {
  // INTs: 1, 3, 6 -> median 3
  const cohort = [
    makeRaw({ playerId: 'db1', defInterceptions: 1 }),
    makeRaw({ playerId: 'db2', defInterceptions: 3 }),
    makeRaw({ playerId: 'db3', defInterceptions: 6 }),
  ]
  const medians = cohortMedians('DB', cohort)

  it('ball_hawk requires interceptions strictly above the cohort median', () => {
    expect(medians.interceptions).toBe(3)
    expect(deriveTags('DB', cohort[2], medians, 50)).toContain('ball_hawk')
    expect(deriveTags('DB', cohort[1], medians, 50)).not.toContain('ball_hawk')
    expect(deriveTags('DB', cohort[0], medians, 50)).not.toContain('ball_hawk')
  })
})

describe('elite tag', () => {
  it('applies to any position at score >= 90, boundary inclusive', () => {
    expect(deriveTags('EDGE', makeRaw(), {}, 90)).toContain('elite')
    expect(deriveTags('EDGE', makeRaw(), {}, 89.9)).not.toContain('elite')
    expect(deriveTags('QB', makeRaw(), { ypa: 99, passAtt: 9999 }, 95)).toContain('elite')
    expect(deriveTags('DB', makeRaw(), { interceptions: 99 }, 100)).toContain('elite')
  })
})
