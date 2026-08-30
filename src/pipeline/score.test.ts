import { describe, expect, it } from 'vitest'
import { cohortScores, isEligible, toPosition } from './score.ts'
import { makeRaw } from './fixtures.ts'

describe('toPosition', () => {
  it('maps offensive position groups directly', () => {
    expect(toPosition(makeRaw({ positionGroup: 'QB', position: 'QB' }))).toBe('QB')
    expect(toPosition(makeRaw({ positionGroup: 'RB', position: 'RB' }))).toBe('RB')
    expect(toPosition(makeRaw({ positionGroup: 'RB', position: 'FB' }))).toBe('RB')
    expect(toPosition(makeRaw({ positionGroup: 'WR', position: 'WR' }))).toBe('WR')
  })

  it('maps every DB label across eras via position_group', () => {
    for (const position of ['CB', 'FS', 'SS', 'S', 'SAF', 'DB']) {
      expect(toPosition(makeRaw({ positionGroup: 'DB', position }))).toBe('DB')
    }
  })

  it('maps DE and OLB to EDGE', () => {
    expect(toPosition(makeRaw({ positionGroup: 'DL', position: 'DE' }))).toBe('EDGE')
    expect(toPosition(makeRaw({ positionGroup: 'LB', position: 'OLB' }))).toBe('EDGE')
  })

  it('maps generic LB labels to EDGE only with 8+ sacks (early-era 3-4 rushers)', () => {
    expect(toPosition(makeRaw({ positionGroup: 'LB', position: 'LB', defSacks: 8 }))).toBe('EDGE')
    expect(toPosition(makeRaw({ positionGroup: 'LB', position: 'LB', defSacks: 7.5 }))).toBeNull()
    expect(toPosition(makeRaw({ positionGroup: 'LB', position: 'MLB', defSacks: 3 }))).toBeNull()
  })

  it('excludes interior linemen, TEs, OL, and specialists', () => {
    expect(toPosition(makeRaw({ positionGroup: 'DL', position: 'DT' }))).toBeNull()
    expect(toPosition(makeRaw({ positionGroup: 'DL', position: 'NT' }))).toBeNull()
    expect(toPosition(makeRaw({ positionGroup: 'TE', position: 'TE' }))).toBeNull()
    expect(toPosition(makeRaw({ positionGroup: 'OL', position: 'T' }))).toBeNull()
    expect(toPosition(makeRaw({ positionGroup: 'SPEC', position: 'K' }))).toBeNull()
  })
})

describe('isEligible', () => {
  it('QB needs 100+ attempts', () => {
    expect(isEligible('QB', makeRaw({ attempts: 100 }))).toBe(true)
    expect(isEligible('QB', makeRaw({ attempts: 99 }))).toBe(false)
  })
  it('RB needs 50+ carries', () => {
    expect(isEligible('RB', makeRaw({ carries: 50 }))).toBe(true)
    expect(isEligible('RB', makeRaw({ carries: 49 }))).toBe(false)
  })
  it('WR needs 30+ targets, or 20+ receptions when target data is absent', () => {
    expect(isEligible('WR', makeRaw({ targets: 30 }))).toBe(true)
    expect(isEligible('WR', makeRaw({ targets: 29, receptions: 19 }))).toBe(false)
    // 2003-2008 nflverse files carry no target data
    expect(isEligible('WR', makeRaw({ targets: 0, receptions: 20 }))).toBe(true)
    expect(isEligible('WR', makeRaw({ targets: 0, receptions: 19 }))).toBe(false)
  })
  it('EDGE needs 6+ games and 2+ sacks', () => {
    expect(isEligible('EDGE', makeRaw({ games: 6, defSacks: 2 }))).toBe(true)
    expect(isEligible('EDGE', makeRaw({ games: 5, defSacks: 10 }))).toBe(false)
    expect(isEligible('EDGE', makeRaw({ games: 16, defSacks: 1.5 }))).toBe(false)
  })
  it('DB needs 6+ games and 4+ INTs+PDs', () => {
    expect(isEligible('DB', makeRaw({ games: 6, defInterceptions: 1, defPassDefended: 3 }))).toBe(true)
    expect(isEligible('DB', makeRaw({ games: 6, defInterceptions: 1, defPassDefended: 2 }))).toBe(false)
    expect(isEligible('DB', makeRaw({ games: 4, defInterceptions: 5, defPassDefended: 5 }))).toBe(false)
  })
})

describe('cohortScores', () => {
  it('ranks offense by fantasy points', () => {
    const cohort = [
      makeRaw({ playerId: 'a', fantasyPoints: 100 }),
      makeRaw({ playerId: 'b', fantasyPoints: 300 }),
      makeRaw({ playerId: 'c', fantasyPoints: 200 }),
    ]
    expect(cohortScores('QB', cohort)).toEqual([0, 100, 50])
  })

  it('ranks EDGE by the defensive composite, dominant line wins', () => {
    const cohort = [
      makeRaw({ playerId: 'a', defSacks: 16, defQbHits: 30, defTacklesForLoss: 18, defFumblesForced: 5 }),
      makeRaw({ playerId: 'b', defSacks: 4, defQbHits: 10, defTacklesForLoss: 6, defFumblesForced: 1 }),
      makeRaw({ playerId: 'c', defSacks: 9, defQbHits: 18, defTacklesForLoss: 10, defFumblesForced: 2 }),
    ]
    expect(cohortScores('EDGE', cohort)).toEqual([100, 0, 50])
  })

  it('ranks DB by the defensive composite, dominant line wins', () => {
    const cohort = [
      makeRaw({ playerId: 'a', defInterceptions: 1, defPassDefended: 6, defTacklesSolo: 30, defFumblesForced: 0 }),
      makeRaw({ playerId: 'b', defInterceptions: 8, defPassDefended: 20, defTacklesSolo: 70, defFumblesForced: 3 }),
      makeRaw({ playerId: 'c', defInterceptions: 4, defPassDefended: 12, defTacklesSolo: 50, defFumblesForced: 1 }),
    ]
    expect(cohortScores('DB', cohort)).toEqual([0, 100, 50])
  })
})
