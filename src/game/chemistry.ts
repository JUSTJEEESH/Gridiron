import type { PlayerSeason } from '../shared/types.ts'

/**
 * Chemistry rules — spec section 6. Each fires independently; the total is
 * clamped to ±8. Everything derives from tags and roster facts, nothing
 * hand-authored per player.
 *
 * Slot indexes follow draft order: 0 QB, 1 RB, 2 WR1, 3 WR2, 4 EDGE, 5 DB.
 * Rules evaluate on partial rosters too (badges show live during the
 * draft), firing only when the slots they need are filled.
 */

export interface ChemistryRule {
  id: string
  /** Badge text — direction and reason shown, math never shown beyond the delta. */
  label: string
  value: number
  fires: (picks: readonly (PlayerSeason | undefined)[]) => boolean
}

export const CHEMISTRY_CLAMP = 8

/** All picks fit in a 15-year window, i.e. 15 distinct seasons: max-min <= 14. */
const ERA_WINDOW = 14

const qb = (p: readonly (PlayerSeason | undefined)[]) => p[0]
const rb = (p: readonly (PlayerSeason | undefined)[]) => p[1]
const wrs = (p: readonly (PlayerSeason | undefined)[]) =>
  [p[2], p[3]].filter((x): x is PlayerSeason => x !== undefined)
const edge = (p: readonly (PlayerSeason | undefined)[]) => p[4]
const db = (p: readonly (PlayerSeason | undefined)[]) => p[5]
const present = (p: readonly (PlayerSeason | undefined)[]) =>
  p.filter((x): x is PlayerSeason => x !== undefined)

export const CHEMISTRY_RULES: readonly ChemistryRule[] = [
  {
    id: 'locker_room',
    label: 'SAME LOCKER ROOM',
    value: 3,
    fires: (p) => {
      const counts = new Map<string, number>()
      for (const pick of present(p)) counts.set(pick.team, (counts.get(pick.team) ?? 0) + 1)
      return [...counts.values()].some((n) => n >= 2)
    },
  },
  {
    id: 'tight_era',
    label: 'TIGHT ERA',
    value: 2,
    fires: (p) => {
      const seasons = present(p).map((x) => x.season)
      if (seasons.length < 2) return false
      return Math.max(...seasons) - Math.min(...seasons) <= ERA_WINDOW
    },
  },
  {
    id: 'vertical_game',
    label: 'VERTICAL GAME',
    value: 3,
    fires: (p) =>
      (qb(p)?.tags.includes('gunslinger') ?? false) &&
      wrs(p).some((w) => w.tags.includes('vertical')),
  },
  {
    id: 'target_competition',
    label: 'TARGET COMPETITION',
    value: -4,
    fires: (p) => {
      const w = wrs(p)
      return w.length === 2 && w.every((x) => x.tags.includes('alpha'))
    },
  },
  {
    id: 'one_football',
    label: 'NOT ENOUGH FOOTBALLS',
    value: -3,
    fires: (p) =>
      (rb(p)?.tags.includes('workhorse') ?? false) &&
      (qb(p)?.tags.includes('high_volume') ?? false),
  },
  {
    id: 'takeaway_machine',
    label: 'PRESSURE INTO PICKS',
    value: 2,
    fires: (p) =>
      (edge(p)?.tags.includes('elite') ?? false) &&
      (db(p)?.tags.includes('ball_hawk') ?? false),
  },
]

export interface ChemistryResult {
  fired: { id: string; label: string; value: number }[]
  /** Sum of fired rule values, clamped to ±CHEMISTRY_CLAMP. */
  total: number
}

export function chemistry(picks: readonly (PlayerSeason | undefined)[]): ChemistryResult {
  const fired = CHEMISTRY_RULES.filter((r) => r.fires(picks)).map(({ id, label, value }) => ({
    id,
    label,
    value,
  }))
  const raw = fired.reduce((sum, r) => sum + r.value, 0)
  const total = Math.max(-CHEMISTRY_CLAMP, Math.min(CHEMISTRY_CLAMP, raw))
  return { fired, total }
}
