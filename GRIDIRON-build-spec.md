# GRIDIRON: Build Spec v1

Replaces the 80-section PRD. Every decision below is locked. If something is not in this document, it is not in v1.

**Ship date: on or before NFL Week 1.** Anything that threatens that date gets cut, not rescheduled.

---

## 1. Locked decisions

| Decision | Choice |
|---|---|
| Platform | Mobile web. Vite + React + TypeScript, static, deployed to Vercel |
| App | None. Not in v1, not in v2. Revisit only if a month of traffic justifies it |
| Picks | 6 (QB, RB, WR, WR, EDGE, DB). No TE, no coach, no flex |
| Run length | Under 90 seconds, spin to verdict |
| Backend | None in v1. Everything client-side except the daily seed and leaderboard, which are a single Supabase table |
| Auth | None. Nickname on the leaderboard, stored in localStorage |
| Monetization | Ads only. No IAP, no subscription |

Six picks instead of seven is a revenue decision as much as a design one. Shorter runs mean more runs per session, and runs per session is the number that pays.

---

## 2. Profit architecture

This is the part the original PRD had backwards. A one-time $4.99 unlock on a free-clone genre converts at roughly half a percent. The money in this category is ad impressions multiplied by replay count, plus whatever search traffic survives after the trend dies.

**Four levers, in order of importance:**

**1. Replays per session.** Every design choice should push this number up. The verdict screen must make the player want to immediately re-draft. One tap to replay, no confirmation, no interstitial before the new game. Target 6+ runs per session.

**2. Ad setup done before launch, not after.** AdSense approval takes several days and a site with content on it. Apply the day the domain resolves, not the day you go viral. Two placements only:
- Sticky bottom banner, present throughout
- One in-feed unit on the results screen, which is the natural pause point

Never place an ad mid-draft. Interrupting the loop costs more in lost replays than the impression is worth. US sports traffic carries strong CPMs, so this is worth setting up properly rather than dropping in a default unit.

**3. Programmatic SEO, which is the actual durable asset.** The competitors all rank for "17-0 game" and you will not beat them on that term this year. You can own the long tail, and you get it almost free from the dataset you are already building. Auto-generate a static page per franchise and per era:

- "Best all-time Cowboys roster to go 17-0"
- "Can a 1980s roster go 17-0?"
- "Best all-time quarterbacks by era"

That is roughly 200 pages generated from data, each with a play button. They keep earning after the trend fades, which nothing else here does. Build the generator in slice 6.

**4. Email capture at exactly one moment.** When someone hits 16-1 or better, offer to email them the share card. That list is yours and it survives the game.

**Honest expectation:** if this performs like a mid-tier entrant in a crowded genre, it earns hundreds. If it breaks out, low five figures over its life. The SEO pages are the part that could still be earning next football season.

---

## 3. The wedge

Chemistry is taken. Blind mode is taken. Daily challenges, era locks, and coaches are all taken. The one thing nobody has built is **the verdict as the product.**

Every competitor outputs a record. GRIDIRON outputs a record plus a short, specific, quotable scouting report explaining exactly why the roster failed. Written with an attitude, like a beat writer with a grudge.

> **12-5. CONTENDER.**
>
> You paid for two alpha receivers and then handed them a game manager. Somebody was going to be unhappy, and it turned out to be you. The pass rush was real. The secondary behind it was decorative.

That paragraph is the screenshot. It is the whole share card. It is also the hardest thing in this genre to copy, because it takes writing taste rather than engineering.

**Implementation:** a rules-to-phrases system, not an LLM call. Each chemistry rule that fires contributes one sentence fragment from a hand-written pool of 4-6 variants. Assemble two or three of them, ordered by magnitude. Deterministic, instant, free, and it never says anything stupid. Budget real time on writing these lines. They are the product.

---

## 4. Game design

**Loop:** spin franchise + era → pick one player → repeat 6x → reveal → replay.

**Re-rolls:** one team re-roll, one era re-roll per run. Matches genre convention and reduces rage-quits.

**Chemistry is visible, the formula is hidden.** When a pick lands, a badge animates: `+3 SAME LOCKER ROOM` or `-4 TARGET COMPETITION`. Direction and reason shown, math never shown. The original PRD wanted a pure black box. Do not do that. Frustration only drives replays when the player can form a theory. 82-0's own reviews are full of people annoyed that the sim seems to ignore roster balance. Legible but unsolvable is the target.

**The reveal.** Do not animate 17 individual weeks. Animate a win counter climbing with rising audio pitch, pausing hard at the first loss. Total elapsed time 4 seconds. If the run reaches 16-0, add a full 1.5 second dead stop before week 17.

**Result tiers:** 17-0 PERFECT / 16-1 HEARTBREAK / 14-15 wins ELITE / 12-13 CONTENDER / 10-11 PLAYOFF TEAM / 8-9 AVERAGE / 6-7 ROUGH YEAR / under 6 DISASTER.

**Share card:** 1080x1350, generated client-side to canvas. Six names, the record, the tier, the verdict paragraph, the URL. Typography only, no photos, no logos. This is where your design work is the moat. Every competitor's share card looks like a spreadsheet.

---

## 5. Data

The whole project lives or dies here, so it is scoped deliberately small.

**1999 to present:** pull from nflverse, which has complete play-by-play back to 1999, updated nightly, free and open. Aggregate to season level. Fully automated.

**Pre-1999:** nflverse does not go back that far, and this is the one genuine risk in the build. Do not try to solve it comprehensively. **You only need the legends.** Nobody is drafting the 1983 Oilers' third receiver. Hand-curate roughly 250 to 300 pre-1999 players from Pro Football Reference, season-peak stats only, one row each. That is a day of work, bounded and verifiable, and it covers every name a fan would actually reach for.

**No hand-authored ratings. No hand-authored chemistry tags.** Everything derives from the stats:

- Score each player-season as a percentile against all players at that position in that season. This is the era normalization from the original PRD, done for free rather than by hand.
- Derive tags from the same numbers: yards per reception above the era median makes a vertical receiver; target share above 25% makes an alpha; carries above 300 makes a workhorse; yards per attempt above the era median makes a gunslinger.

This kills six weeks of data entry, scales to thousands of players, and gives you a defensible answer when somebody argues with a result.

**Output:** one `players.json`, versioned, bundled with the build. Regenerating it is a script, not a release.

---

## 6. Simulation engine

Deterministic from a seed. Same seed, same result, always.

```
player_score(p)   = percentile of p's season stats vs position cohort, 0-100

weights           = { QB: .30, RB: .12, WR1: .16, WR2: .12, EDGE: .17, DB: .13 }

base              = Σ weights[slot] * player_score(pick[slot])

weakest_link      = 0.85 * base + 0.15 * min(player_score of all picks)

team_rating (T)   = clamp(weakest_link + chemistry, 0, 100)

opponent (O)      = seeded draw, normal(mean 78, sd 7), clipped to [60, 95], per week

win_prob          = 1 / (1 + exp(-(T - O + 2.5) / 15))

result            = seeded uniform < win_prob, 17 times
```

The weakest-link term is what makes balance beat star power, and it is honest football. The QB weight at 30% is roughly three times the running back, which is also honest football and will start arguments, which is the point.

**Chemistry rules.** Each fires independently, total clamped to ±8:

| Rule | Value |
|---|---|
| Two or more picks from the same franchise | +3 |
| All picks within a 15-year window | +2 |
| Vertical QB paired with a vertical WR | +3 |
| Both WRs were alphas (target share > 25%) | -4 |
| Workhorse RB paired with a high-volume passing QB | -3 |
| Elite EDGE paired with a ball-hawk DB | +2 |

The -4 target competition rule is the star power trap from the original PRD, made legible. Drafting Rice and Moss together should hurt, and the player should be able to see why.

**Tuning target:** run 100,000 random rosters and adjust the 15 divisor and the opponent distribution until 17-0 lands between 1% and 2%, with the mode of the distribution at 10-7 or 11-6. This is a two-hour script, not a milestone.

---

## 7. Build slices

Each slice ships and runs before the next one starts.

1. **Data pipeline.** nflverse pull, percentile scoring, tag derivation, `players.json`. Pre-1999 curation runs in parallel and can land during slice 3.
2. **Core loop.** Spin, six picks, roster state, seeded RNG. Ugly is fine.
3. **Sim and tuning.** Engine, the 100k harness, tune to target.
4. **Verdict engine.** Rules to phrases. Write the sentence pools by hand. Do not rush this one.
5. **Design pass and share card.** Where you spend your actual advantage.
6. **SEO pages.** Generate from the dataset, static.
7. **Daily challenge and leaderboard.** One Supabase table, seed of the day, one attempt.

Slices 1 through 5 are the launch. Six and seven can land in the following week.

---

## 8. Legal guardrails

- Player names and factual statistics only. No photographs, no logos, no NFL shield, no uniforms.
- Team names referenced as text where necessary, never as marks.
- Footer disclaimer: not affiliated with or endorsed by the NFL or any team.
- No "official" language anywhere in copy or metadata.

Your risk profile here is lower than an App Store submission would have been, which is another point in favor of web.

---

## 9. Kickoff prompt for Claude Code

> Read this spec fully before writing code. Build slice 1 only, then stop and report.
>
> Create a Vite + React + TypeScript project. Slice 1 is the data pipeline: a Node script that pulls nflverse season-aggregated player stats from 1999 to present, computes per-position per-season percentile scores, derives the tag set defined in section 5, and emits a versioned `players.json`. Include a stub loader for a hand-curated pre-1999 CSV using the same schema, so both sources merge into one output.
>
> Do not invent statistics. Do not build UI. Do not build the simulation. Do not add dependencies beyond what the pipeline needs.
>
> Write tests covering percentile correctness and tag derivation. When the script runs clean and the output validates, report what shipped and what slice 2 needs from it.

---

## 10. The cut list

Not in v1, and not to be smuggled back in: coaches, franchise mode, era mode, decade battle, GOAT battle, friend vs friend, PvP, achievements, notifications, accounts, college football, multi-sport abstraction, blind mode, the admin tool, and the native app.

If a feature makes the game more complicated but not more fun, it does not get built. That rule was already in the original PRD. This version just actually follows it.
