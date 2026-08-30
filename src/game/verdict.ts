import type { PlayerSeason } from '../shared/types.ts'
import type { SeasonResult } from './sim.ts'
import { hashSeed, u32At } from './rng.ts'

/**
 * The verdict engine — spec section 3. A rules-to-phrases system, not an
 * LLM call: every fired chemistry rule and a small set of stat-derived
 * roster observations each carry a hand-written pool of variants, written
 * like a beat writer with a grudge. Two or three fragments are assembled,
 * ordered by magnitude, variant choice seeded — deterministic, instant,
 * free, and it never says anything stupid.
 *
 * The paragraph explains the season: sub-14-win rosters get the failure
 * explained (negative facts first); 14+ get grudging credit with the one
 * flaw appended if there is one.
 */

export interface VerdictFact {
  id: string
  sign: 'pos' | 'neg'
  magnitude: number
  ctx: Record<string, string>
}

type Pools = Record<string, string[]>

/**
 * The sentence pools. These lines are the product — edit with taste, keep
 * 4-6 variants each, one to two sentences per variant, placeholders in
 * {braces} filled from the fact's ctx.
 */
export const VERDICT_POOLS: Pools = {
  // ----- special records -----
  perfect: [
    'Seventeen for seventeen. Frame it — the league will spend a decade insisting it was luck.',
    'Nobody goes 17-0. You went 17-0.',
    'A perfect season. Even the grudge stands to clap.',
    'Seventeen Sundays, zero apologies. That is the whole review.',
  ],
  heartbreak: [
    'One loss. It will bother you longer than a losing season would, and it should.',
    'Sixteen and one reads like a typo, and the one is all anyone will remember.',
    'Perfection blinked exactly once. You will see that blink forever.',
    'The parade was routed. Somebody lost the map for one afternoon.',
  ],

  // ----- chemistry rules that fired -----
  target_competition: [
    'You paid for two alpha receivers and then bought one football. {wr1} and {wr2} spent the season glaring at each other instead of the scoreboard.',
    'Two number-one receivers, one ball. {wr1} got his. {wr2} got his. Nobody got both.',
    '{wr1} and {wr2} are both used to being the offense. One of them found out otherwise, loudly, by October.',
    'Somebody had to be the decoy, and neither {wr1} nor {wr2} took the news well.',
    'An offense with two alphas is a locker room with two podiums. The targets ran out before the egos did.',
  ],
  one_football: [
    '{rb} needed twenty-five carries a game and {qb} needed forty throws. There are not that many snaps.',
    'A workhorse back and a volume passer is two offenses sharing one huddle. Neither got fed.',
    '{rb} stood next to {qb} all season waiting for handoffs that never came.',
    'You drafted a ground-and-pound identity and an air-raid identity and ended up with neither.',
    'Someone promised {rb} the ball and someone promised {qb} the ball. Both were lying.',
  ],
  locker_room: [
    'The {team} contingent brought their old shorthand, and it played like it.',
    'Half this roster already shared a sideline. Chemistry you cannot fake, and you did not have to.',
    'Old teammates, old timing. The {team} pipeline paid off.',
    'Some pairs just know where the other one will be. Yours did.',
    'Familiarity showed up in the small things — protections, hot routes, eye contact.',
  ],
  tight_era: [
    'Everybody spoke the same football. One era, one language.',
    'No time machine required — this group could actually have played together, and it looked like it.',
    'Same rules, same speed, same game. The cohesion was real.',
    'A roster from one era plays like a team instead of a museum exhibit.',
  ],
  vertical_game: [
    '{qb} kept throwing it deep and {wr} kept being there. Cheap points, all season.',
    'The deep ball was the identity: {qb} to {wr}, over the top, again.',
    'Safeties backed up all year and it still was not far enough.',
    '{qb} has the arm and {wr} has the gear. Defenses had an answer for neither.',
  ],
  takeaway_machine: [
    '{edge} hurried the throw and {db} arrived where it wobbled. Pressure into picks — the oldest math in football.',
    'Every hit from {edge} became a gift for {db}.',
    'The front forced the mistakes and the back end collected them.',
    'Panic throws have to land somewhere. {db} made sure they landed with him.',
  ],

  // ----- stat-derived roster observations -----
  qb_manager: [
    'You paid for elite receivers and then handed them a game manager. Somebody was going to be unhappy, and it turned out to be you.',
    '{wr1} ran open all year. {qb} noticed roughly half the time.',
    'That receiving corps deserved a gunslinger and got a caretaker. Checkdowns do not win shootouts.',
    'The receivers did their job. The man throwing to them did a different, smaller job.',
    'All that speed outside, and {qb} threw like he was billing by the yard.',
  ],
  defense_front_gap: [
    'The pass rush was real. The secondary behind it was decorative.',
    '{edge} lived in the backfield. Quarterbacks simply threw over his head, at {db}, who watched.',
    'Three seconds of terror up front, then a completion anyway. {db} saw to that.',
    'You built a front porch and left the back door open.',
    '{edge} kept buying the coverage time. The coverage kept spending it badly.',
  ],
  defense_back_gap: [
    '{db} covered like a blanket. He had to, because {edge} never made a quarterback hurry.',
    'The coverage held for four seconds a snap. The rush needed six.',
    'Great secondary, no pressure: quarterbacks treated the pocket like a lounge.',
    '{db} kept erasing receivers and the rush kept giving quarterbacks time to find new ones.',
    'You cannot cover forever. Against this pass rush, forever was the ask.',
  ],
  weak_link: [
    'Every coordinator found {weak} by Week 3 and never looked away.',
    'Five real players and {weak}. Opponents attacked the discount.',
    'A roster is six names and you wrote one of them in pencil. {weak} was the smudge.',
    'The film does not lie: {weak} was the hole the whole league drove through.',
    '{weak} at {weakSlot} was a cost-saving measure. It cost plenty.',
  ],
  balance: [
    'No stars wasted, no holes hiding. Six real players, one team.',
    'Nothing for an opponent to attack. Balance is boring right up until it is sixty minutes of it.',
    'Every slot held. That is rarer than a superstar and it wins more games.',
    'The weakest man on this roster would start most places. That is roster-building.',
  ],
  star_qb: [
    '{qb} papered over every crack. That is what the weight at the position buys.',
    'With {qb} playing like that, the other five only had to be adequate.',
    '{qb} was the margin. Week after week, the margin.',
    'You spent big at quarterback and quarterback paid it back with interest.',
  ],

  // ----- fallbacks so a verdict always has at least two fragments -----
  fallback_great: [
    'Not much to grudge about here. It was a real team.',
    'The film ran clean. Take the bow.',
    'Complaints filed: none that held up on review.',
    'Sound everywhere it had to be. That is the quiet kind of great.',
  ],
  fallback_mid: [
    'Good enough to matter, never scary enough to be remembered.',
    'Solid, sound, forgettable. January football finds the flaw eventually.',
    'A team built to be respectable, and respectable is exactly what it went.',
    'Nothing broken, nothing special. The standings filed it accordingly.',
  ],
  fallback_bad: [
    'There is no one thing to fix, which is the bad news.',
    'The pieces never argued because they never met.',
    'Bad rosters lose loudly. This one lost quietly, every single week.',
    'The plan was six names on a card. It stayed a card.',
  ],
}

/** Slot order matches the draft: QB, RB, WR1, WR2, EDGE, DB. */
const SLOT_LABELS = ['QB', 'RB', 'WR1', 'WR2', 'EDGE', 'DB'] as const

/**
 * Extract the facts a verdict can be built from. Chemistry facts come from
 * the season's fired rules; observation facts derive from scores and tags.
 */
export function collectFacts(picks: readonly PlayerSeason[], season: SeasonResult): VerdictFact[] {
  const [qb, rb, wr1, wr2, edge, db] = picks
  const names = {
    qb: qb.name, rb: rb.name, wr1: wr1.name, wr2: wr2.name, edge: edge.name, db: db.name,
  }
  const facts: VerdictFact[] = []

  if (season.wins === 17) facts.push({ id: 'perfect', sign: 'pos', magnitude: 10, ctx: {} })
  if (season.wins === 16) facts.push({ id: 'heartbreak', sign: 'pos', magnitude: 10, ctx: {} })

  for (const rule of season.chemistry.fired) {
    const ctx: Record<string, string> = { ...names }
    if (rule.id === 'locker_room') {
      const counts = new Map<string, number>()
      for (const p of picks) counts.set(p.team, (counts.get(p.team) ?? 0) + 1)
      ctx.team = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    }
    if (rule.id === 'vertical_game') {
      // Credit the better vertical receiver — and don't brag about the deep
      // ball at all if the only vertical WR is a scrub (the badge still
      // showed; the verdict praising a 30-score "deep threat" reads stupid,
      // especially next to a weak-link fragment naming the same player).
      const verticals = [wr1, wr2]
        .filter((w) => w.tags.includes('vertical'))
        .sort((a, b) => b.score - a.score)
      if (verticals.length === 0 || verticals[0].score < 55) continue
      ctx.wr = verticals[0].name
    }
    facts.push({ id: rule.id, sign: rule.value > 0 ? 'pos' : 'neg', magnitude: Math.abs(rule.value), ctx })
  }

  // Stat-derived observations.
  const wrStar = Math.max(wr1.score, wr2.score) >= 85 || (wr1.tags.includes('alpha') && wr2.tags.includes('alpha'))
  if (wrStar && qb.score <= 55) {
    facts.push({ id: 'qb_manager', sign: 'neg', magnitude: 4.5, ctx: names })
  }
  if (edge.score - db.score >= 30) {
    facts.push({ id: 'defense_front_gap', sign: 'neg', magnitude: 3.5, ctx: names })
  }
  if (db.score - edge.score >= 30) {
    facts.push({ id: 'defense_back_gap', sign: 'neg', magnitude: 3.5, ctx: names })
  }

  const minScore = Math.min(...picks.map((p) => p.score))
  if (minScore <= 40) {
    const weakIdx = picks.findIndex((p) => p.score === minScore)
    facts.push({
      id: 'weak_link',
      sign: 'neg',
      magnitude: 3 + (40 - minScore) / 20, // 3.0 at 40, 5.0 at 0
      ctx: { ...names, weak: picks[weakIdx].name, weakSlot: SLOT_LABELS[weakIdx] },
    })
  }
  if (minScore >= 65) {
    facts.push({ id: 'balance', sign: 'pos', magnitude: 2.5, ctx: names })
  }
  if (qb.score >= 95) {
    facts.push({ id: 'star_qb', sign: 'pos', magnitude: 3, ctx: names })
  }

  return facts
}

function render(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = ctx[key]
    if (value === undefined) throw new Error(`verdict template placeholder {${key}} has no ctx value`)
    return value
  })
}

function pickVariant(pool: string[], seed: string, factId: string): string {
  return pool[u32At(hashSeed(`${seed}:verdict:${factId}`), 0) % pool.length]
}

/**
 * Assemble the verdict paragraph: 2-3 fragments ordered by magnitude.
 * 14+ wins lead with credit (one flaw appended if any); below that the
 * failure gets explained first. Deterministic from (facts, seed).
 */
export function verdict(picks: readonly PlayerSeason[], season: SeasonResult, seed: string): string {
  const facts = collectFacts(picks, season)
  const byMag = (a: VerdictFact, b: VerdictFact) => b.magnitude - a.magnitude || a.id.localeCompare(b.id)
  const pos = facts.filter((f) => f.sign === 'pos').sort(byMag)
  const neg = facts.filter((f) => f.sign === 'neg').sort(byMag)

  const ordered = season.wins >= 14 ? [...pos, ...neg.slice(0, 1)] : [...neg, ...pos]
  const fragments = ordered
    .slice(0, 3)
    .map((f) => render(pickVariant(VERDICT_POOLS[f.id], seed, f.id), f.ctx))

  // The spec wants two or three fragments; pad thin verdicts from the tier
  // fallback pool, never repeating a line.
  const fallback =
    season.wins >= 14 ? 'fallback_great' : season.wins >= 10 ? 'fallback_mid' : 'fallback_bad'
  const pool = VERDICT_POOLS[fallback]
  const base = u32At(hashSeed(`${seed}:verdict:${fallback}`), 0)
  for (let i = 0; fragments.length < 2; i++) {
    fragments.push(pool[(base + i) % pool.length])
  }

  return fragments.join(' ')
}
