# GRIDIRON

Mobile-web NFL roster-drafting game. Vite + React + TypeScript, static.
Spec: [GRIDIRON-build-spec.md](./GRIDIRON-build-spec.md).

**Status: slices 1 (data pipeline), 2 (core loop), 3 (sim + tuning), and
4 (verdict engine) shipped.** The design pass and share card (slice 5) are
next.

## Commands

```
npm run data:build           # pull nflverse (cached in .cache/), rebuild players.json
npm run data:build:offline   # rebuild from cache only, no network
npm test                     # vitest — percentile, tags, cohorts, loaders
npm run dev / build / preview
```

## The verdict engine (slice 4)

`src/game/verdict.ts` — rules to phrases, no LLM. Facts are extracted from
the season: every fired chemistry rule, plus stat-derived observations
(star receivers with a caretaker QB, a 30-point gap between the pass rush
and the secondary in either direction, a weak link at ≤40, balance at 65+
everywhere, a 95+ QB, and dedicated 17-0 / 16-1 lines). Each fact carries a
hand-written pool of 4-6 variants in `VERDICT_POOLS` — those lines are the
product; edit them there. Assembly picks 2-3 fragments by magnitude:
sub-14-win seasons lead with the failure, 14+ lead with credit plus the one
flaw; thin rosters pad from tier fallbacks. Variant choice is seeded, so a
run's verdict is deterministic and replays exactly.

Guardrails against saying something stupid: templates are placeholder-
checked by test (no `{}` can leak, fuzzed over 300 rosters), and the deep-
ball credit skips scrub "deep threats" so a fragment never praises the same
player the weak-link fragment indicts.

## The simulation (slice 3)

`src/game/sim.ts` implements section 6 verbatim: weighted base
(QB .30 / RB .12 / WR1 .16 / WR2 .12 / EDGE .17 / DB .13), weakest-link
blend (85/15), chemistry clamped to ±8, per-week clipped-normal opponents,
logistic win probability, 17 seeded Bernoulli draws. Same (roster, seed) →
same season, always.

`src/game/chemistry.ts` implements the six section 6 rules from tags and
roster facts (badge labels in parentheses): 2+ picks same franchise
(+3 SAME LOCKER ROOM), all picks within a 15-year window (+2 TIGHT ERA),
gunslinger QB + vertical WR (+3 VERTICAL GAME), both WRs alphas
(-4 TARGET COMPETITION), workhorse RB + high-volume QB
(-3 NOT ENOUGH FOOTBALLS), elite EDGE + ball-hawk DB
(+2 PRESSURE INTO PICKS). Rules evaluate on partial rosters, so badges show
live during the draft — direction and reason visible, formula hidden.

### Tuning (`npm run sim:tune`)

The harness drafts rosters through the real state machine with seeded
random choices, so the tuned distribution matches actual play. Finding:
real rosters center near **T = 60** (p5 39, p50 60, p95 82.5) — percentile
scores, the weakest link, and thin franchise-era pools all pull down — so
the spec's opponent mean of 78 is unreachable and the opponent distribution
slides down as a block (clip bounds keep the spec's −18/+17 shape). Weights,
weakest-link share, and the +2.5 bonus stay locked.

**Tuned params** (baked into `DEFAULT_SIM_PARAMS`, pinned by a test):
divisor **14** (spec 15), opponents **normal(58, 7) clipped [40, 75]**
(spec 78, 7, [60, 95]). Confirmed on 100k rosters: **17-0 = 1.26%,
mode = 11 wins, mean = 9.65** — inside the spec target (1-2% perfect,
mode 10-11). The 20k-vs-100k mode can drift on this flat-topped
distribution, so the harness confirms candidates on 100k and keeps the
first that holds.

## The core loop (slice 2)

Spin franchise + era → pick one player → repeat for the six fixed slots
(QB, RB, WR1, WR2, EDGE, DB) → placeholder reveal → one-tap replay. One
team re-roll (new franchise, same era) and one era re-roll (same franchise,
new era) per run.

- `src/game/rng.ts` — deterministic seeded RNG. Draw *i* of stream `seed`
  is a pure function of `(seed, i)`, so state serializes as
  `{ seed, cursor }` and replays are exact. The slice 3 sim uses this same
  module.
- `src/game/data.ts` — loads `players.json`, indexes pools by
  franchise × era × position. Eras are decade buckets derived from the
  seasons present (pre-1999 curation will add older eras automatically).
  A spin's options are the pool deduped to each player's best season, top 8
  by score, minus already-picked players.
- `src/game/draft.ts` — pure state machine: `newDraft`, `pickPlayer`,
  `rerollTeam`, `rerollEra`. Spins re-draw internally until the current
  slot's pool is non-empty; a run is deterministic from (seed, choices).
  `?seed=x` in the URL reproduces a run.
- `src/App.tsx` — deliberately unstyled UI over the state machine
  ("ugly is fine"); the design pass is slice 5.

## The data pipeline (slice 1)

`scripts/build-players.ts` builds `public/data/players.json`:

1. **Pull** nflverse season-aggregated regular-season player stats, one CSV
   per season, probing forward from 1999 until seasons stop existing
   (`stats_player` release of nflverse-data). Downloads cache in `.cache/`.
2. **Merge** the hand-curated pre-1999 legends CSV
   (`data/curated/pre1999.csv`, see its [README](./data/curated/README.md) —
   header-only stub until the curation pass).
3. **Score** every player-season as a percentile (0–100, mean-rank, ties
   share) within its **(position, season)** cohort — the spec's era
   normalization. Curated rows use (position, decade) cohorts.
4. **Derive tags** from stats only. **Validate** (schema, score range,
   duplicates, cohort sizes) and write a versioned JSON.

### Positions and cohort floors

| Slot | nflverse mapping | Cohort floor |
|---|---|---|
| QB | position_group QB | 100+ attempts |
| RB | position_group RB | 50+ carries |
| WR | position_group WR | 30+ targets (20+ receptions where targets are missing) |
| EDGE | DE, OLB, or any LB with 8+ sacks (early seasons label 3-4 edge rushers plain "LB") | 6+ games, 2+ sacks |
| DB | position_group DB (CB/FS/SS/S/SAF/DB across eras) | 6+ games, 4+ INTs+PDs |

### Ranking stat

- **QB/RB/WR:** nflverse's standard fantasy points (league-standard
  aggregation, ships in the source data; computed with the same formula for
  curated rows).
- **EDGE:** equal-weight cohort z-scores of sacks, QB hits, TFL, forced
  fumbles.
- **DB:** equal-weight cohort z-scores of INTs, passes defended, solo
  tackles, forced fumbles.

Only the ordering matters — scores are percentiles of these values.

### Tags (spec section 5; nothing hand-authored)

| Tag | Rule |
|---|---|
| `gunslinger` | QB: yards/attempt above the season-cohort median |
| `high_volume` | QB: attempts above the season-cohort median |
| `workhorse` | RB: more than 300 carries |
| `vertical` | WR: yards/reception above the season-cohort median |
| `alpha` | WR: target share above 25% |
| `ball_hawk` | DB: interceptions above the season-cohort median |
| `elite` | any: score ≥ 90 |

The last three follow section 5's derivation pattern to cover what section
6's chemistry rules reference ("high-volume passing QB", "ball-hawk DB",
"elite EDGE"). "Vertical QB" in the chemistry table is `gunslinger`.

### Known data caveats

- **Targets missing 2003–2008** upstream: WR eligibility falls back to
  receptions, target fields are omitted for those seasons, and `alpha`
  cannot derive there (stray fragments are scrubbed rather than tagged).
- **Pre-1999 percentiles are legends-relative** — see
  [data/curated/README.md](./data/curated/README.md). Rescaling is a slice 3
  tuning decision.

### players.json

```
{ schemaVersion, dataVersion, generatedAt, seasons: {min,max},
  counts: {total, nflverse, curated}, players: [
    { id, name, pos, team, season, games, score, tags, src, stats } ] }
```

`dataVersion` is a content hash — it changes iff the data changes. `team` is
the modern franchise code (nflverse pre-normalizes relocations). `stats`
carries the position-relevant raw numbers so every score and tag is
auditable. Currently 1999–2025, ~13.8k player-seasons, ~3 MB raw / ~0.4 MB
gzipped. Regenerating is a script, not a release; the file is committed.
