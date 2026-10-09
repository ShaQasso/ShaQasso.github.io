# MBIOTA v3 — "The Bubble" (design draft 0.2: real-time)

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
- **Player verb: rotate.** Each ring rotates independently continuously, with momentum and a speed cap.
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

## 4. Real-time waves (replaces turns)
There are no turns. The colony lives continuously (fixed-timestep sim, ~20 Hz, seeded RNG); you rotate rings by hand.

**Rings.** Each ring rotates independently. Rotation has momentum and a speed cap, and inner rings are heavier/slower,
so you can swing the rim quickly but re-shuffling the core is a commitment.
**Slow-mo.** Hold Space for slow motion on a refilling "focus" meter (also the accessibility option; a full pause exists in easy mode).

**Waves, not scripted threats.** A *wave director* streams particles at the rim. A wave = (direction arc, composition, intensity, duration).
Waves overlap, drift in direction, and mutate composition mid-wave (e.g. ◆ phages swing to ● after 10 s), so you read the stream and adapt.
- **Phage particles** fly inward from the arc. A particle that reaches a cell with its shape infects it; other shapes
  pass harmlessly *to that cell* and continue. An infected cell lyses after ~2 s and releases a burst that infects
  adjacent same-shape cells (cascade). Rotating an infected cell away doesn't save it, but a block of same-shape cells
  facing the stream **is a phage sponge**: every particle spent on them is one that doesn't reach the cells you care about.
  Phages that land on an already infected cell are wasted. That is the sacrifice mechanic; it comes from rotation, with no button.
- **Inflammation (ambient).** A host-mood level that rises with pro-inflammatory coats and with some waves.
  It raises everyone's flip rate and slowly damages pro-inflammatory (red) cells. Calming (blue) cells push it down.
- **Antibiotic sweeps** — a bright line sweeps across an arc; kills everything it crosses except armored coats. Big, telegraphed (3 s), rare.
- **Flow/bile** — nudges a ring's rotation for a few seconds; you fight it or use it.
- **Calm gaps** every few waves (8 s): no particles, growth speeds up, meal choice (§5).
Acts: ~6 acts of ~90 s, ~9 min per run, with a final act that stacks all three waves.

**Stress.** The host wall and screen reflect gut health (§9).

## 5. Carb / meals
- At each calm gap pick 1 of 2 **meals**; the effect lasts ~25 s.
- A meal changes (a) **flip bias** (flip direction toward a coat for species that can use it) and (b) **growth** (up or down) for specific species.
  - Fibre: *B. hungry* flips toward its fibre coat and grows faster; others grow slightly slower.
  - Simple sugar: everything grows faster but inflammation climbs.
  - Mucin: calming coats favoured, growth slow.
  - Fasting: growth and flips low, phage speed down.
- Meals bias which flip happens; they never choose a cell's coat.

## 6. Continuous rules
- **Flip:** each cell flips at a hazard rate λ = species base × (1 + inflammation) × meal. A flip is drawn from the
  species' other coats (biased by the meal). Flips flash in "reporter" view, so you watch the colony reshuffle in real time.
- **Growth:** each cell has a divide cooldown; when ready, it fills an adjacent hole. A full rim adds a ring.
- **Mixed-up vs. uniform:** because cascades follow same-shape adjacency, you want *interleaved* coats on the rim and
  *clumped sacrificial* blocks facing the wave. Rotation + random flips constantly work against whatever you set up.

## 7. Win / lose
- **Host health bar** (0–100): +calm immune sum, + diversity, − inflammation.
- **Diversity** = Shannon over (species × coat), shown as a gem meter ("D‑index").
- **Lose** when: colony < 6 cells, **or** a monoculture (one species ≥ 80% for 10 s = dysbiosis),
  **or** host health 0.
- **Win a run**: survive ~6 acts (~9 min) and beat a final boss wave (e.g. "Antibiotics + phage storm combo").
- **Score**: waves × diversity at end × calm bonus (shareable result card).

## 8. Roguelite layer (after the loop is fun)
- Between waves: pick 1 of 3 **FMT donors** (add 3 cells of a new species/coat), or a **mutation**
  (e.g. "lock one coat", "double flip rate of species X", "phage-proof for 1 wave").
- Unlocks: new species, new carbs, harder hosts (IBD host: high baseline inflammation).
- Daily seed run.

## 9. Visual and UX notes
- **Blue/red** = calming/inflammatory cells. The **gut wall is the stress gauge**: healthy = soft blue glow, thick mucus, swaying villi, slow breathing;
  bad = swollen red tissue, thin mucus, debris, vignette, a heartbeat that speeds up, lights flicker. It should make you uneasy before you read the bar.
- Dark background, cells as soft glowing blobs with a coloured outline per **coat** and a small glyph
  (◆ ● ▲ ■) per **shape** (colour-blind safe).
- Threats come in as particles from rim; telegraph = faint arrows with the shape glyph.
- Flip = bright flash + gentle pulse (real-time reporter feel).
- Tooltip on any cell: species, coat, immune value, flip %, what threatens it.
- First-run tutorial is 60 s: one phage hits a pure ◆ colony, it collapses; you learn diversity by playing.

## 10. Tech (see previous plan)
Vite + TypeScript (engine built; renderer next). Pure engine (fixed-timestep, seeded RNG, JSON state) + **Canvas 2D** renderer (PixiJS if we need more effects; ~200 cells is easy) + tiny UI layer. Inputs: drag/scroll/keys for ring rotation; touch drag on mobile.
All numbers in `data/*.json`. A headless **simulator** plays thousands of runs to find overpowered species/strategies.

## 11. MVP scope (the first thing we build)
- Board: 3 rings (1+6+12 hexes), independent rotation with momentum, slow-mo.
- 3 species × 3 coats, 2 phage types, ambient inflammation, 1 meal, a wave director with 3 acts + 1 boss act.
- Reporter view, wave warning, gut-wall stress visuals, win/lose screen. No roguelite layer yet.

## 12. Open questions
Decided: independent rings; sacrifice comes from rotation; blue = calming, red = inflammatory; gut wall shows stress;
real-time with slow-mo; **cells are rods**; rotation is drag on touch / scroll+keys on desktop; **short runs first (~3.5 min: 4 acts)**;
the player is **"the colony"** (science-first tone).

## 13. Rules changed in balance pass 1
- **Phage containment.** An infected cell only releases into its *immediate neighbours* (at most 2, same shape only), with a chance that shrinks each
  generation (60% -> 25% -> 0). A cascade can't run across the colony any more, so a sponge costs a few cells, not a ring.
- **Immune balance is the real fight.** Losing = host health reaching 0 (long-run inflammation, low diversity) or the colony collapsing (< 4 commensals).
  The monoculture instant-loss rule is gone.
- **Dysbiosis makes inflammation worse** instead of ending the run: if one species is above 50% of the commensals, the inflammation target
  rises (up to +0.2 at 100%). It is a pressure, not a cliff.
- **Infections (from act 2).** Invader waves arrive like phages but implant a *pathogen* in an empty slot:
  - A dense colony blocks them (colonisation resistance); holes left by phages and antibiotics are the way in.
  - Pathogens have no phage receptor, are immune to inflammation damage, grow *faster* when inflammation is high, take up space,
    push inflammation up, and don't count toward diversity.
  - The only way to remove them is an **antibiotic sweep**. The sweep also kills your own non-armored cells in the arc, so you rotate the pathogens
    into the arc and your sensitive cells out (armored cells survive).

## 14. Engine status (headless, no graphics yet)
`src/engine` is a pure fixed-timestep (20 Hz) sim with a seeded RNG and JSON-serialisable state; `src/sim` has scripted bots;
`npm test` (14 tests) and `npm run sim -- 200` run everything.

Balance pass 1 (200 seeds per bot, rateScale 1.7, growthScale 1.3):

| bot | win % | main way it loses |
|---|---|---|
| idle (never rotates) | 23 | immune balance (117/200), collapse (37) |
| spin (random rotation) | 1 | immune balance (120), collapse (79) |
| dodge (keep matching shapes out of the arc; line pathogens up for antibiotics) | 58 | immune balance (65), collapse (19) |
| sponge (sacrifice common cell types on the rim; dodge the rest) | 47 | immune balance (69), collapse (38) |

Open balance questions: (1) Sponge is still below dodge with the current bot, so either the sponge payoff is too small or the bot is too naive
(real players will tell us). (2) Pathogens only reach ~7 per run, so infections are present but not yet a strong second front; the
later-act invaders may need more weight. (3) Inflammation ends near 1.0 in runs that are lost, so the health bar is the real clock and
moves quickly once it tips. A recovery mechanic (calming meals, a "rest" gap) may be needed. (4) Colony size sits around 30 cells.

## 15. Decisions after balance pass 1
- Sponge vs. dodge gap: leave for now (judge with real players).
- Pathogens/invaders: leave as is, will be expanded later.
- Colony size 20–30 cells is fine.
- **Recovery (open):** we need a way to tip inflammation back down. Options considered:
  A. *Host-wall hot spots*: the wall has 12 sectors with their own local inflammation; calming cells under a sector cool it, red cells/pathogens heat it.
     Rotation becomes the recovery lever. Pairs with the gut-wall stress visuals. Moderate engine change.
  B. *Resolution pulse*: panic button (cooldown, costs cells). Simple, less elegant.
  C. *Passive recovery*: calm gaps heal health a little; calming species grow faster under high inflammation ("resolution response"); mucin meal stronger.
  Recommended: A + C.

## 16. Gut-wall hot spots and passive recovery (implemented)
- **The wall is 12 sectors**, each with its own inflammation (0..1). A cell heats or cools the sector it faces: rim cells count fully, deeper rings less
  (1 / 0.6 / 0.35 / 0.2). Calming (+) cools, red (-) heats, pathogens add extra heat, phage lysis and flying particles add local pulses.
  Heat leaks a little into neighbouring sectors.
- **Rotation is the recovery lever.** Rotating a ring moves its cells under different sectors, so you can park calming cells under a burning patch
  and tuck red cells away. Letting one patch stay mildly inflamed while you protect the rest is a real choice.
- **Local effects.** Each cell feels its own sector: flip rate, red-cell damage, calming-cell growth, and pathogen growth all depend on local inflammation.
- **Overall inflammation is a convex (power-mean, p=3) aggregate**, so an even field is cheaper than one blazing sector. Mild, tolerable inflammation is cheap;
  a sector that runs near 1.0 is expensive.
- **Passive recovery, kept small:** calm gaps heal 0.5 health/s (about +4 per gap), and calming cells grow up to 50% faster where it is inflamed.
- **Evidence the lever works** (no waves, 40 seeds, 90 s): idle bot mean inflammation 0.49 / hottest sector 0.75; cooling bot 0.44 / 0.64.

Balance pass 2 (150 seeds, rateScale 2.5):

| bot | win % |
|---|---|
| idle | 24 |
| spin | 0 |
| dodge | 51 |
| sponge | 36 |
| cool (dodge + cooling, with hysteresis so it doesn't keep stirring the colony) | 54 |

Note for the renderer: constantly rotating rings is bad play (spin 0%), because stirring exposes every cell to the wave. The UI shouldn't make
wild rotation the default; rings should feel heavy and deliberate.

## 17. Backlog / later stages
- **Radial row flips (later stages):** besides rotating rings around, let the player cycle a *spoke* (a column of cells from core to rim): the rim cell
  moves to the core and everything shifts out one step, or the reverse. It lets you pull a protected cell to the front, or hide a damaged one,
  without disturbing the rings. Needs: spoke selection UI (click/drag along the radius), a cooldown or focus cost so it doesn't trivialise rotation,
  and neighbour/sector updates in the engine (cells change ring, so depth weights and adjacency change).

## 18. Renderer status (playable build)
`npm run dev` (or `npm run build` -> `dist/`, 32 KB of JS, no CDN dependencies) runs the game on Canvas 2D.
- Rod cells coloured by immune value (blue / grey / red) with a white receptor glyph; armored cells have a bright outline; infected cells pulse purple with a lysis timer; pathogens are dark green with spikes.
- Gut wall: 12 sectors that swell, redden and lose mucus as local inflammation rises; villi sway when healthy; debris, a heartbeat vignette and screen shake as things get bad.
- Wave telegraphs: dotted arc with countdown, then a solid arc showing the *current* dominant receptor so you can watch it morph; antibiotic wedge with countdown across the colony.
- Controls: drag a ring (it keeps moving to where you dragged it), scroll to step a ring one slot, Up/Down + Left/Right (or WASD) for keys, Space for slow-mo (limited meter), 1/2 or click for meals.
- Hover any cell for species, coat, immune value and local inflammation. Title, end screen with stats, copy-result button.
Not done yet: sound, a guided tutorial, daily seed, radial spoke flips (see section 17), mobile layout polish.

## 19. Playtest round 1 changes
Feedback: phages came as a stream and flowed through the first ring; they should be leveled, one-by-one early, and match the colour of what they hunt; fewer wall sections; calmer villi; remove infections for now.
- **Phages stop at the first cell they meet.** A matching receptor infects it; a mismatched phage is deflected and spent (spark effect). Only holes let a phage through, so the rim is the shield and inner rings are a reserve.
- **Leveled waves.** Rate = 0.14 x 2^act x jitter x rateScale. Act 1 is a lone phage every few seconds; act 4 is roughly 8x denser.
- **Receptor colours.** Each receptor has one colour (amber diamond, violet circle, cyan triangle, pink square). The capsule ring on a cell, its glyph, the phage hunting it, and the wave arc all use it. Infected cells pulse in the colour of the phage that got them.
- **Wall has 6 sectors** (was 12) and the villi sway about a third as much.
- **Infections (pathogen invaders) are off** (`director.invaders = 0`); code, art and tests are still there. Antibiotic sweeps stay as a plain hazard for now.
- **Inflammation flares (new, from act 2).** A telegraphed hot patch on the wall (3 s warning, dotted arc, countdown) that heats its sectors for 10 s. Rotating calming cells under it is the answer. This is what makes immune balance the main way to lose now that phage damage is gentler.
- Health drain from inflammation is stronger (inflWeight 16) so a neglected flare matters.

Bots (60 seeds, rateScale 3.0): idle 45%, random spin 18%, dodge 48%, cooling bot 52%; the main loss is "immune balance lost". The skill gap among simple bots is small; real players should do better than the bots, which is the thing to check.

## 20. Playtest round 2 changes (pace and batches)
Feedback: cells flip too fast, phages no longer cascade, rings are added too fast, new cells should come from their neighbours in batches.
- **Flips slowed ~15x**: base rates 0.0008-0.012 per second, inflammation effect 1.5x (was 2x). A calm colony flips about 4 times a minute.
- **Batches.** A new cell takes after the cells around its slot (parent counts double), so colonies grow in clonal patches. The starting colony is also built from 4 patches. Patches are what make cascades lethal.
- **Cascades back**: burst chance per generation 95% / 65% / 35% / 0, still immediate neighbours of the same receptor only (max 2). In the sim each direct hit now lyses about 2.7 cells (it was about 2.0 with random neighbours).
- **Rings:** the bubble needs the rim 95% full for 30 s and cannot add its 4th ring before 90 s (it happens around 125-130 s in sims). Growth speed is back to 1.0.
- Balance sim (120 seeds, rateScale 0.85 for the shipped build, 1.0 measured): idle 16%, random spin 18%, dodge 38%, cooling 30%. The remaining weak spot is that my bots don't use patches deliberately (e.g. offering a spare patch as a phage sponge); a human can.
