# Pre-1999 curated players

`pre1999.csv` is the hand-curated legends file (spec section 5): roughly
250–300 pre-1999 players from Pro Football Reference, **season-peak stats
only, one row per player**. It ships header-only until the curation pass,
which the spec allows to land during slice 3. The loader, validation, and
merge path are already live and tested — adding rows here and re-running
`npm run data:build` is all it takes.

## Rules

- Real stats from Pro Football Reference only. Never estimate or invent.
- One row per player: their peak season at the position.
- `pos` is one of `QB | RB | WR | EDGE | DB` — the curator resolves the slot.
- `season` must be 1998 or earlier (1999+ comes from nflverse automatically).
- `team` uses the modern nflverse franchise code (e.g. `LA` for the Rams,
  `LV` for the Raiders, `LAC` for the Chargers), so franchise chemistry works
  across eras.
- Leave cells blank when the stat doesn't apply or wasn't recorded
  (blank parses as 0):
  - `target_share` mostly doesn't exist pre-1999 → the `alpha` tag won't
    derive for those rows; leave blank unless a real figure exists.
  - Sacks are official only from 1982; earlier pass rushers need
    researched/unofficial totals or should be curated from 1982+.

## Columns

`name, pos, team, season, games` then position-relevant stats:

| Position | Fill in |
|---|---|
| QB | `pass_att, pass_yds, pass_td, pass_int` (+ rushing if relevant) |
| RB | `carries, rush_yds, rush_td` (+ receiving if relevant) |
| WR | `targets, receptions, rec_yds, rec_td, target_share` |
| EDGE | `sacks, qb_hits, tfl, forced_fumbles` |
| DB | `interceptions, pass_defended, tackles_solo, forced_fumbles` |

## Scoring caveat (open decision for slice 3)

Curated rows are percentile-scored within **(position, decade)** cohorts of
this file only — there is no full-league pre-1999 dataset to rank against.
Because the file contains only legends, those percentiles are
legends-relative: the median curated player lands at ~50 even though they'd
be a 95+ against a full league. Slice 3 tuning must either rescale curated
scores (e.g. map onto [70, 100]) or accept the compression. Flagged in the
slice 1 report.
