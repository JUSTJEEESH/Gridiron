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

/**
 * Slice 2 UI: the bare core loop. Spin -> pick x6 -> roster -> replay.
 * Deliberately unstyled ("ugly is fine"); the reveal here is a placeholder
 * until the sim lands in slice 3. Replay is one tap, no confirmation.
 */

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

function initialSeed(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('seed')
  return fromUrl && fromUrl.length > 0 ? fromUrl : randomSeed()
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
                ? `${pick.name} — ${pick.team} ${pick.season} (${pick.score})${
                    pick.tags.length ? ` [${pick.tags.join(', ')}]` : ''
                  }`
                : i === draft.slot
                  ? '← picking now'
                  : '—'}
            </li>
          )
        })}
      </ol>

      {isComplete(draft) ? (
        <section>
          <h2>Draft complete</h2>
          <p>Season simulation arrives in slice 3.</p>
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
