import type { RawRow } from '../shared/types.ts'

/** Synthetic test fixture — not real player data. */
export function makeRaw(overrides: Partial<RawRow> = {}): RawRow {
  return {
    playerId: 'test-0001',
    name: 'Test Player',
    position: 'WR',
    positionGroup: 'WR',
    team: 'TST',
    season: 2020,
    games: 16,
    completions: 0,
    attempts: 0,
    passingYards: 0,
    passingTds: 0,
    passingInterceptions: 0,
    carries: 0,
    rushingYards: 0,
    rushingTds: 0,
    receptions: 0,
    targets: 0,
    receivingYards: 0,
    receivingTds: 0,
    targetShare: 0,
    fantasyPoints: 0,
    defSacks: 0,
    defQbHits: 0,
    defTacklesForLoss: 0,
    defFumblesForced: 0,
    defInterceptions: 0,
    defPassDefended: 0,
    defTacklesSolo: 0,
    ...overrides,
  }
}
