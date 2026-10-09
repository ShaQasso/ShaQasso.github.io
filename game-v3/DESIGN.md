# MBIOTA v3 — "The Bubble" (design draft 0.1)

> You are a colony of *Bacteroides* at the centre of the gut. The world attacks from every side.
> You can't command your cells — they flip their coats at random. You can only decide **who faces what**,
> and let selection do the rest. Survive by staying diverse.

## 1. Core fantasy and the science we borrow ("inspired by")
| Real biology | Game rule |
|---|---|
| Invertible promoters randomly flip capsule loci (phase variation) | Every cell can randomly change coat each turn. Flipping is **never chosen**, only influenced. |
| Phages kill cells carrying their receptor; survivors carry other coats | Phage hits a coat *shape*; cells of other coats survive and the population shifts. |
| Inflammation selects/induces certain states | Inflammation raises flip rates and punishes pro-inflammatory coats. |
| Different capsules = different immune signals (calming vs. alarming) | Each coat has an immune value; the colony's sum is the host's mood. |
| Diet carbs make the bacteria adapt to use them | Carb = timed modifier: flips biased toward a coat, growth changed. |
| Healthy gut = diverse | Win/loss is tied to diversity, not just survival. |
| Real-time fluorescent reporters of flipping | "Reporter view": coats glow by state; every flip is a visible flash. |

## 2. The board
- A **circular colony** of hex cells in concentric **rings** (ring 0 = core, outer ring = exposed rim).
- The rim faces **12 compass slots** (like a clock). Threats arrive at slots, from all sides.
- Cells = (species, coat). Empty hex = hole (a dead cell). Colony grows by filling holes from neighbours
  and by adding a new outer ring when the rim is full ("the bubble expands").
- **Player verb: rotate.** Each ring rotates independently by ±1 step (costs an action).
  Inner rings are protected, so rotating them is how you *rotate a safe, diverse reserve outward*
  and decide who takes the next hit. Rim cells at a slot are "exposed".

## 3. Species (placeholder names; each has 3 coats)
Each species has a base growth rate, base flip rate, and 3 coats. A coat has:
- **Shape** (◆ ● ▲ ■) — which phage family can bind it.
- **Immune value** (−2 inflammatory … +2 calming).
- **Cost/benefit** (growth modifier, resistance to bile/antibiotic/etc).

| Species | Role | Vibe | Coats (shape · immune · perk) |
|---|---|---|---|
| *B. cool* | Calmer | high IL‑10, slow grower | ● +2 slow · ▲ +1 · ◆ 0 |
| *B. funny* | Wildcard | very high flip rate | ◆ 0 · ■ −1 fast · ● +1 |
| *B. spicy* | Alarm bell | inflammatory but tough | ■ −2 armored · ▲ −1 · ◆ 0 |
| *B. sneaky* | Phage dodger | cheap coat swaps | ▲ 0 stealth (−growth) · ● 0 · ◆ +1 |
| *B. hungry* | Carb specialist | grows on diet shifts | ■ 0 · ◆ +1 · ● 0 (carb-boosted) |
| *B. chonky* | Tank | slow, big shield, rare flips | ◆ +1 armored · ▲ 0 armored |

(Names are jokes on purpose; make up your own.)

## 4. Threats
Always **telegraphed one turn ahead** on the rim. The player sees the shape/slot and has one turn to react.
- **Phage** — attacks a slot with a shape. Kills exposed cells of that shape, then **spreads** to adjacent
  cells with the same shape (cascade). Big same-shape patches die fast; mixed neighbourhoods contain it.
  This is the reason diversity *inside* the bubble matters.
- **Inflammation flare** — raises global flip rate; each turn, damages cells in proportion to their
  pro-inflammatory value; rim cells with calming coats reduce the flare. Host mood is the sum of immune values.
- **Antibiotic wave** — kills a sector regardless of coat, except armored coats. Needs a sacrificial/tough front.
- **Bile / flow** — pushes the outer ring around one step (forces rotation; think "peristalsis").
- **Carb drop** (not a threat) — see §5.

## 5. Carb modifiers (time-limited, usually 3–4 turns)
Picked from 2 offered each wave, or triggered by events:
- **Fibre** → species A/B flip toward coat X, growth +; others flip normally.
- **Simple sugar** → fast growth but inflammatory pressure up.
- **Mucin** → favours calming coats, slow.
- **Fasting** → no growth, flip rate low, phages weaker.
Rules: carb *biases the direction* of random flips and changes growth; it does not choose for the player.

## 6. Turn loop
1. **Telegraph**: next turn's threats appear on the rim.
2. **Player (2 actions)**: rotate a ring ±1 · choose a carb (if available) · **Offer** (mark a sector as bait/expendable: it grows faster but takes damage first) · play a one-use "reserve" card.
3. **Resolve threats**.
4. **Flips**: each cell flips with probability p = base × (1 + inflammation) × carb; the new coat is drawn
   from the species' other coats (biased by carb). Show the reporter flash.
5. **Growth**: survivors divide into holes by growth rate; new ring if the rim is full.
6. **Host check** (§7).

## 7. Win / lose
- **Host health bar** (0–100): +calm immune sum, + diversity, − inflammation.
- **Diversity** = Shannon over (species × coat), shown as a gem meter ("D‑index").
- **Lose** when: colony < 6 cells, **or** a monoculture (one species ≥ 80% for 2 turns = dysbiosis),
  **or** host health 0.
- **Win a run**: survive ~12 waves and beat a final boss wave (e.g. "Antibiotics + phage storm combo").
- **Score**: waves × diversity at end × calm bonus (shareable result card).

## 8. Roguelite layer (after the loop is fun)
- Between waves: pick 1 of 3 **FMT donors** (add 3 cells of a new species/coat), or a **mutation**
  (e.g. "lock one coat", "double flip rate of species X", "phage-proof for 1 wave").
- Unlocks: new species, new carbs, harder hosts (IBD host: high baseline inflammation).
- Daily seed run.

## 9. Visual and UX notes
- Dark background, cells as soft glowing blobs with a coloured outline per **coat** and a small glyph
  (◆ ● ▲ ■) per **shape** (colour-blind safe).
- Threats come in as particles from rim; telegraph = faint arrows with the shape glyph.
- Flip = bright flash + gentle pulse (real-time reporter feel).
- Tooltip on any cell: species, coat, immune value, flip %, what threatens it.
- First-run tutorial is 60 s: one phage hits a pure ◆ colony, it collapses; you learn diversity by playing.

## 10. Tech (see previous plan)
Vite + TypeScript. Pure engine (seeded RNG, JSON state) + SVG/canvas renderer + tiny UI layer.
All numbers in `data/*.json`. A headless **simulator** plays thousands of runs to find overpowered species/strategies.

## 11. MVP scope (the first thing we build)
- Board: 3 rings (1+6+12 hexes), 12 rim slots, rotate rings.
- 3 species × 3 coats, 2 phages (◆ and ●), 1 inflammation flare, 1 carb (fibre), 8 waves, 1 boss.
- Reporter view, telegraph, flip animation, win/lose screen. No roguelite layer yet.

## 12. Open questions
1. Rotate: each ring separately (more control) or the whole colony + one inner ring (simpler)?
2. Strictly turn-based, or turns with a short real-time "flip phase" for flair?
3. How hard should the "offer / sacrifice" mechanic be — an explicit action, or emergent from rotation?
4. Should coat colours show immune value (blue calming / red alarming) or species identity? (Can't be both.)
5. Name for the player role: "the bubble"? "the consortium"?
