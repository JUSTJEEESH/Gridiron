import type { PlayerSeason, Position } from '../shared/types.ts'
import { buildIndex, type PlayerIndex } from './data.ts'

/** Synthetic game-side fixtures — not real player data. */
export function makePlayer(over: Partial<PlayerSeason> & { id: string }): PlayerSeason {
  return {
    name: `Player ${over.id}`,
    pos: 'QB',
    team: 'AAA',
    season: 2005,
    games: 16,
    score: 50,
    tags: [],
    src: 'nflverse',
    stats: {},
    ...over,
  }
}

/**
 * A small but complete league: every franchise x decade x position pool has
 * `depth` players, so any spin is valid. Franchise BBB is missing its
 * 2000s-era QBs to exercise the empty-pool re-draw path.
 */
export function makeLeague(depth = 3): PlayerIndex {
  const franchises = ['AAA', 'BBB', 'CCC']
  const decades = [2000, 2010]
  const positions: Position[] = ['QB', 'RB', 'WR', 'EDGE', 'DB']
  const players: PlayerSeason[] = []
  for (const team of franchises) {
    for (const decade of decades) {
      for (const pos of positions) {
        if (team === 'BBB' && decade === 2000 && pos === 'QB') continue
        for (let i = 0; i < depth; i++) {
          players.push(
            makePlayer({
              id: `${team}-${decade}-${pos}-${i}`,
              pos,
              team,
              season: decade + i,
              score: 90 - i * 10,
            }),
          )
        }
      }
    }
  }
  return buildIndex({ dataVersion: 'test', players })
}
