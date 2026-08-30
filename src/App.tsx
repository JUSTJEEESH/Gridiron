import { useEffect, useMemo, useState } from 'react'
import type { PlayersFile } from './shared/types.ts'
import { buildIndex, loadPlayers } from './game/data.ts'
import {
  isComplete,
  newDraft,
  pickPlayer,
  rerollEra,
  rerollTeam,
  SLOTS,
  type DraftState,
} from './game/draft.ts'
import { chemistry } from './game/chemistry.ts'
import { simulateSeason, simSeedFor } from './game/sim.ts'

/**
 * Slices 2+3 UI: spin -> pick x6 (live chemistry badges) -> season sim ->
 * replay. Deliberately unstyled ("ugly is fine"); the verdict paragraph is
 * slice 4, the design pass and reveal animation are slice 5. Direction and
 * reason of chemistry are shown, the formula never is. Replay is one tap.
 */

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

function initialSeed(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('seed')
  return fromUrl && fromUrl.length > 0 ? fromUrl : randomSeed()
}

function fmt(v: number): string {
  return v > 0 ? `+${v}` : `${v}`
}

export default function App() {
  const [file, setFile] = useState<PlayersFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)

  const index = useMemo(() => (file ? buildIndex(file) : null), [file])

  useEffect(() => {
    loadPlayers().then(setFile, (e: unknown) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (index && !draft) setDraft(newDraft(index, initialSeed()))
  }, [index, draft])

  const partial = useMemo(() => {
    if (!draft) return null
    // Picks in slot order, undefined for unfilled slots (chemistry evaluates live).
    const slots = SLOTS.map((_, i) => draft.picks[i])
    return chemistry(slots)
  }, [draft])

  const season = useMemo(() => {
    if (!draft || !isComplete(draft)) return null
    return simulateSeason(draft.picks, simSeedFor(draft.seed, draft.picks))
  }, [draft])

  if (error) return <main>Failed to load player data: {error}</main>
  if (!file || !index || !draft) return <main>Loading player data…</main>

  const replay = () => setDraft(newDraft(index, randomSeed()))

  return (
    <main>
      <h1>GRIDIRON</h1>
      <p>
        seed <code>{draft.seed}</code> · data <code>{file.dataVersion}</code> ·{' '}
        {file.seasons.min}–{file.seasons.max}
      </p>

      <h2>Roster</h2>
      <ol>
        {SLOTS.map((slot, i) => {
          const pick = draft.picks[i]
          return (
            <li key={slot.label}>
              <strong>{slot.label}</strong>:{' '}
              {pick
                ? `${pick.name} — ${pick.team} ${pick.season}`
                : i === draft.slot
                  ? '← picking now'
                  : '—'}
            </li>
          )
        })}
      </ol>

      {partial && partial.fired.length > 0 && (
        <p>
          {partial.fired.map((r) => (
            <span key={r.id} style={{ marginRight: '1em' }}>
              <strong>
                {fmt(r.value)} {r.label}
              </strong>
            </span>
          ))}
        </p>
      )}

      {season ? (
        <section>
          <h2>
            {season.wins}-{season.losses}. {season.tier}.
          </h2>
          <p>{season.weeks.map((w) => (w.win ? 'W' : 'L')).join(' ')}</p>
          <p>
            <em>Scouting report coming in slice 4.</em>
          </p>
          <button onClick={replay}>RUN IT BACK</button>
        </section>
      ) : (
        <section>
          <h2>
            Pick your {SLOTS[draft.slot].label}: {draft.spin!.franchise}, {draft.spin!.era}
          </h2>
          <p>
            <button
              onClick={() => setDraft(rerollTeam(index, draft))}
              disabled={draft.teamRerollUsed}
            >
              re-roll team {draft.teamRerollUsed ? '(used)' : ''}
            </button>{' '}
            <button
              onClick={() => setDraft(rerollEra(index, draft))}
              disabled={draft.eraRerollUsed}
            >
              re-roll era {draft.eraRerollUsed ? '(used)' : ''}
            </button>
          </p>
          <ul>
            {draft.spin!.options.map((p) => (
              <li key={p.id}>
                <button onClick={() => setDraft(pickPlayer(index, draft, p.id))}>
                  {p.name} — {p.season} · score {p.score}
                  {p.tags.length ? ` · ${p.tags.join(', ')}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
