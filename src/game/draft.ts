import type { PlayerSeason, Position } from '../shared/types.ts'
import { draftOptions, type PlayerIndex } from './data.ts'
import { newRng, nextPick, type RngState } from './rng.ts'

/**
 * The draft loop (slice 2): spin franchise + era -> pick one player,
 * six times, in fixed slot order. One team re-roll and one era re-roll per
 * run. Pure state machine — every transition takes (index, state) and
 * returns a new state, and a run is deterministic from (seed, choices).
 * The PlayerIndex is passed explicitly and never stored, so DraftState
 * stays serializable.
 */

export interface SlotDef {
  pos: Position
  label: string
}

export const SLOTS: readonly SlotDef[] = [
  { pos: 'QB', label: 'QB' },
  { pos: 'RB', label: 'RB' },
  { pos: 'WR', label: 'WR1' },
  { pos: 'WR', label: 'WR2' },
  { pos: 'EDGE', label: 'EDGE' },
  { pos: 'DB', label: 'DB' },
]

export interface Spin {
  franchise: string
  era: string
  options: PlayerSeason[]
}

export interface DraftState {
  seed: string
  rng: RngState
  /** index into SLOTS; === SLOTS.length when the draft is complete */
  slot: number
  picks: PlayerSeason[]
  spin: Spin | null
  teamRerollUsed: boolean
  eraRerollUsed: boolean
}

export function isComplete(state: DraftState): boolean {
  return state.slot >= SLOTS.length
}

function pickedIds(picks: PlayerSeason[]): Set<string> {
  return new Set(picks.map((p) => p.id))
}

/**
 * Draw (franchise, era) pairs until the current slot's pool is non-empty.
 * Thin combos exist (e.g. a franchise with no 1990s-era QB in the data), so
 * empty spins re-draw silently; the attempt cap only guards against a
 * broken dataset.
 */
function drawSpin(
  index: PlayerIndex,
  rng: RngState,
  pos: Position,
  exclude: Set<string>,
): { spin: Spin; rng: RngState } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const f = nextPick(rng, index.franchises)
    const e = nextPick(f.state, index.eras)
    rng = e.state
    const options = draftOptions(index, f.value, e.value.id, pos, exclude)
    if (options.length > 0) return { spin: { franchise: f.value, era: e.value.id, options }, rng }
  }
  throw new Error(`no non-empty pool found for ${pos} (dataset too thin?)`)
}

/** Start a run: seeds the RNG and spins for slot 0. */
export function newDraft(index: PlayerIndex, seed: string): DraftState {
  const { spin, rng } = drawSpin(index, newRng(seed), SLOTS[0].pos, new Set())
  return {
    seed,
    rng,
    slot: 0,
    picks: [],
    spin,
    teamRerollUsed: false,
    eraRerollUsed: false,
  }
}

/** Pick one of the current spin's options and advance (spins the next slot). */
export function pickPlayer(index: PlayerIndex, state: DraftState, playerId: string): DraftState {
  if (isComplete(state) || state.spin === null) throw new Error('pickPlayer: draft is complete')
  const player = state.spin.options.find((p) => p.id === playerId)
  if (!player) throw new Error(`pickPlayer: ${playerId} is not in the current options`)

  const picks = [...state.picks, player]
  const slot = state.slot + 1
  if (slot >= SLOTS.length) {
    return { ...state, slot, picks, spin: null }
  }
  const { spin, rng } = drawSpin(index, state.rng, SLOTS[slot].pos, pickedIds(picks))
  return { ...state, rng, slot, picks, spin }
}

/** Re-roll the franchise, keeping the era. Once per run. */
export function rerollTeam(index: PlayerIndex, state: DraftState): DraftState {
  if (isComplete(state) || state.spin === null) throw new Error('rerollTeam: draft is complete')
  if (state.teamRerollUsed) throw new Error('rerollTeam: already used this run')
  const { spin } = state
  const pos = SLOTS[state.slot].pos
  const exclude = pickedIds(state.picks)

  // Draw among other franchises with a non-empty pool for this era+slot.
  const candidates = index.franchises.filter(
    (f) => f !== spin.franchise && draftOptions(index, f, spin.era, pos, exclude).length > 0,
  )
  if (candidates.length === 0) return { ...state, teamRerollUsed: true } // nowhere to go; burn the re-roll
  const d = nextPick(state.rng, candidates)
  const options = draftOptions(index, d.value, spin.era, pos, exclude)
  return {
    ...state,
    rng: d.state,
    teamRerollUsed: true,
    spin: { franchise: d.value, era: spin.era, options },
  }
}

/** Re-roll the era, keeping the franchise. Once per run. */
export function rerollEra(index: PlayerIndex, state: DraftState): DraftState {
  if (isComplete(state) || state.spin === null) throw new Error('rerollEra: draft is complete')
  if (state.eraRerollUsed) throw new Error('rerollEra: already used this run')
  const { spin } = state
  const pos = SLOTS[state.slot].pos
  const exclude = pickedIds(state.picks)

  const candidates = index.eras.filter(
    (e) => e.id !== spin.era && draftOptions(index, spin.franchise, e.id, pos, exclude).length > 0,
  )
  if (candidates.length === 0) return { ...state, eraRerollUsed: true }
  const d = nextPick(state.rng, candidates)
  const options = draftOptions(index, spin.franchise, d.value.id, pos, exclude)
  return {
    ...state,
    rng: d.state,
    eraRerollUsed: true,
    spin: { franchise: spin.franchise, era: d.value.id, options },
  }
}
