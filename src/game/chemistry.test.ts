import { describe, expect, it } from 'vitest'
import { chemistry, CHEMISTRY_CLAMP } from './chemistry.ts'
import { makePlayer } from './gameFixtures.ts'
import type { PlayerSeason, Tag } from '../shared/types.ts'

/** Roster in draft order: QB, RB, WR1, WR2, EDGE, DB. */
function roster(over: {
  qb?: Partial<PlayerSeason>
  rb?: Partial<PlayerSeason>
  wr1?: Partial<PlayerSeason>
  wr2?: Partial<PlayerSeason>
  edge?: Partial<PlayerSeason>
  db?: Partial<PlayerSeason>
} = {}): PlayerSeason[] {
  // Distinct teams and a wide season spread so no roster-level rule fires
  // unless a test asks for it.
  return [
    makePlayer({ id: 'qb', pos: 'QB', team: 'T1', season: 1999, ...over.qb }),
    makePlayer({ id: 'rb', pos: 'RB', team: 'T2', season: 2005, ...over.rb }),
    makePlayer({ id: 'wr1', pos: 'WR', team: 'T3', season: 2010, ...over.wr1 }),
    makePlayer({ id: 'wr2', pos: 'WR', team: 'T4', season: 2015, ...over.wr2 }),
    makePlayer({ id: 'edge', pos: 'EDGE', team: 'T5', season: 2020, ...over.edge }),
    makePlayer({ id: 'db', pos: 'DB', team: 'T6', season: 2025, ...over.db }),
  ]
}

const fired = (picks: (PlayerSeason | undefined)[]) => chemistry(picks).fired.map((r) => r.id)

describe('chemistry rules', () => {
  it('a neutral roster fires nothing', () => {
    expect(fired(roster())).toEqual([])
    expect(chemistry(roster()).total).toBe(0)
  })

  it('SAME LOCKER ROOM: two or more picks from one franchise (+3)', () => {
    const picks = roster({ rb: { team: 'T1' } })
    expect(fired(picks)).toContain('locker_room')
    expect(chemistry(picks).total).toBe(3)
  })

  it('TIGHT ERA: all picks within a 15-year window (+2), boundary exact', () => {
    const inWindow = roster({
      qb: { season: 2000 }, rb: { season: 2003 }, wr1: { season: 2007 },
      wr2: { season: 2010 }, edge: { season: 2012 }, db: { season: 2014 },
    })
    expect(fired(inWindow)).toContain('tight_era')
    const justOutside = roster({
      qb: { season: 2000 }, rb: { season: 2003 }, wr1: { season: 2007 },
      wr2: { season: 2010 }, edge: { season: 2012 }, db: { season: 2015 },
    })
    expect(fired(justOutside)).not.toContain('tight_era')
  })

  it('VERTICAL GAME: gunslinger QB + a vertical WR in either slot (+3)', () => {
    const gun: Tag[] = ['gunslinger']
    const vert: Tag[] = ['vertical']
    expect(fired(roster({ qb: { tags: gun }, wr2: { tags: vert } }))).toContain('vertical_game')
    expect(fired(roster({ qb: { tags: gun } }))).not.toContain('vertical_game')
    expect(fired(roster({ wr1: { tags: vert } }))).not.toContain('vertical_game')
  })

  it('TARGET COMPETITION: both WRs alphas (-4)', () => {
    const alpha: Tag[] = ['alpha']
    const both = roster({ wr1: { tags: alpha }, wr2: { tags: alpha } })
    expect(fired(both)).toContain('target_competition')
    expect(chemistry(both).total).toBe(-4)
    expect(fired(roster({ wr1: { tags: alpha } }))).not.toContain('target_competition')
  })

  it('NOT ENOUGH FOOTBALLS: workhorse RB + high-volume QB (-3)', () => {
    const picks = roster({ rb: { tags: ['workhorse'] }, qb: { tags: ['high_volume'] } })
    expect(fired(picks)).toContain('one_football')
    expect(fired(roster({ rb: { tags: ['workhorse'] } }))).not.toContain('one_football')
  })

  it('PRESSURE INTO PICKS: elite EDGE + ball-hawk DB (+2)', () => {
    const picks = roster({ edge: { tags: ['elite'] }, db: { tags: ['ball_hawk'] } })
    expect(fired(picks)).toContain('takeaway_machine')
    expect(fired(roster({ edge: { tags: ['elite'] } }))).not.toContain('takeaway_machine')
  })

  it('total clamps to +8 when every positive rule fires', () => {
    // locker room +3, tight era +2, vertical game +3, pressure +2 = +10 -> +8
    const picks = roster({
      qb: { team: 'X', season: 2010, tags: ['gunslinger'] },
      rb: { team: 'X', season: 2010 },
      wr1: { season: 2010, tags: ['vertical'] },
      wr2: { season: 2010 },
      edge: { season: 2010, tags: ['elite'] },
      db: { season: 2010, tags: ['ball_hawk'] },
    })
    const result = chemistry(picks)
    expect(result.fired.map((r) => r.id).sort()).toEqual(
      ['locker_room', 'takeaway_machine', 'tight_era', 'vertical_game'].sort(),
    )
    expect(result.fired.reduce((s, r) => s + r.value, 0)).toBe(10)
    expect(result.total).toBe(CHEMISTRY_CLAMP)
  })

  it('negative totals sum without hitting the clamp (-4 -3 = -7)', () => {
    const picks = roster({
      qb: { tags: ['high_volume'] },
      rb: { tags: ['workhorse'] },
      wr1: { tags: ['alpha'] },
      wr2: { tags: ['alpha'] },
    })
    expect(chemistry(picks).total).toBe(-7)
  })

  it('evaluates partial rosters without firing rules that need missing slots', () => {
    const [qb] = roster({ qb: { tags: ['gunslinger', 'high_volume'] } })
    expect(fired([qb, undefined, undefined, undefined, undefined, undefined])).toEqual([])
    expect(fired([undefined, undefined, undefined, undefined, undefined, undefined])).toEqual([])
    // two picks, same team: locker room can fire mid-draft (live badges)
    const partial = [
      makePlayer({ id: 'a', team: 'KC', season: 2020 }),
      makePlayer({ id: 'b', team: 'KC', season: 2021 }),
      undefined, undefined, undefined, undefined,
    ]
    expect(fired(partial)).toEqual(expect.arrayContaining(['locker_room', 'tight_era']))
  })
})
