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

## 13. Engine status (headless, no graphics yet)
`src/engine` is a pure fixed-timestep (20 Hz) sim with a seeded RNG and JSON-serialisable state; `src/sim` has scripted bots;
`npm test` and `npm run sim -- 100` run everything. First balance pass (100 seeds per bot):

| bot | win % | notes |
|---|---|---|
| idle (never rotates) | ~23 | passive survival is possible but fragile |
| spin (random rotation) | ~5 | careless rotation is worse than none |
| dodge (keep matching shapes out of the arc) | ~37 | a simple strategy already helps |
| sponge (feed matching cells to the rim) | ~15 | **naive sponging backfires**: a matching rim block lets the cascade spread to neighbours |

Findings to act on: (1) dysbiosis is the top loss reason, so the colony is small and one species takes over easily; we need
either gentler growth or a bigger starting colony. (2) Sponging needs support (a different-shape buffer between the sponge and the rest)
before it feels like the clever play it should be. (3) Skill gap is modest: wave pressure and cascade rules need another pass
once people can actually play it.
