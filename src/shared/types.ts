/** The five draftable slots in the game. */
export type Position = 'QB' | 'RB' | 'WR' | 'EDGE' | 'DB'

export const POSITIONS: readonly Position[] = ['QB', 'RB', 'WR', 'EDGE', 'DB']

/** Where a row came from. */
export type Source = 'nflverse' | 'curated'

/**
 * Tags are derived from stats only — never hand-authored.
 * Derivation rules live in tags.ts and are documented in README.md.
 */
export type Tag =
  | 'gunslinger' // QB: yards per attempt above the season-position median
  | 'high_volume' // QB: pass attempts above the season-position median
  | 'workhorse' // RB: more than 300 carries
  | 'vertical' // WR: yards per reception above the season-position median
  | 'alpha' // WR: target share above 25%
  | 'ball_hawk' // DB: interceptions above the season-position median
  | 'elite' // any: percentile score >= 90

/**
 * Position-relevant raw stats carried into the output so tags and scores
 * are auditable. Only the fields relevant to the player's position are set.
 */
export interface StatLine {
  // QB
  passAtt?: number
  passYds?: number
  passTd?: number
  passInt?: number
  ypa?: number
  // RB
  carries?: number
  rushYds?: number
  rushTd?: number
  // WR (rushing fields may also appear for RBs with receiving work)
  targets?: number
  receptions?: number
  recYds?: number
  recTd?: number
  targetShare?: number
  ypr?: number
  // EDGE
  sacks?: number
  qbHits?: number
  tfl?: number
  forcedFumbles?: number
  // DB
  interceptions?: number
  passDefended?: number
  tacklesSolo?: number
}

/** One player-season row in players.json. */
export interface PlayerSeason {
  /** nflverse GSIS id, or `pre-<slug>-<season>` for curated rows. */
  id: string
  name: string
  pos: Position
  /** Modern franchise code (nflverse already normalizes relocations, e.g. STL->LA). */
  team: string
  season: number
  games: number
  /** Percentile 0-100 vs same-position, same-season cohort. */
  score: number
  tags: Tag[]
  src: Source
  stats: StatLine
}

/** Top-level shape of players.json. */
export interface PlayersFile {
  schemaVersion: number
  /** Content hash of the players array — changes iff the data changes. */
  dataVersion: string
  generatedAt: string
  seasons: { min: number; max: number }
  counts: { total: number; nflverse: number; curated: number }
  players: PlayerSeason[]
}

export const SCHEMA_VERSION = 1

/** Intermediate: a raw nflverse row narrowed to the fields the pipeline uses. */
export interface RawRow {
  playerId: string
  name: string
  position: string
  positionGroup: string
  team: string
  season: number
  games: number
  completions: number
  attempts: number
  passingYards: number
  passingTds: number
  passingInterceptions: number
  carries: number
  rushingYards: number
  rushingTds: number
  receptions: number
  targets: number
  receivingYards: number
  receivingTds: number
  targetShare: number
  fantasyPoints: number
  defSacks: number
  defQbHits: number
  defTacklesForLoss: number
  defFumblesForced: number
  defInterceptions: number
  defPassDefended: number
  defTacklesSolo: number
}
