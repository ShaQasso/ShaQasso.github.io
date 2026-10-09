# MBIOTA v4 — "The Blob" (design draft 0.1)

> You are a living blob of blocks. The world chips at it from every side. You can't pick a block's colour:
> you can only rotate the whole blob to decide which side takes the hit, sacrifice what is exposed,
> and let the survivors regrow into the gaps. Staying mixed keeps you alive. Going uniform buys you a moment of protection.

Replaces the ring model of v3 (kept in `game-v3/` for comparison).

## 1. The board
- A roughly circular **blob of blocks** on a grid (about 60 at the start, capacity about 90). Blocks touch on four sides.
- **Rotate the whole blob** (drag around, or Left/Right) with weight and momentum. Threats come from fixed world directions, so rotation decides which part of the blob faces them.
- Blocks divide into empty neighbouring spots. A new block takes the colour of the blocks around its spot (the parent counts double), so colonies grow in **clonal patches**.
- **Capacity.** Growth slows as the population nears the cap (logistic) and a block count above the cap starves. You can't win by just growing.

## 2. Three colours = three capsule types (each colour also *is* the phage receptor)
| Colour | Capsule | Strong at | Costs |
|---|---|---|---|
| Amber | mucus capsule | makes the mucus shield last longer | average growth |
| Cyan | phage-resistant capsule | damps cascades through itself (much less likely to be infected by a neighbour) | grows slower |
| Violet | immune-evasion capsule | survives inflammation longer, boosts the cooling effect | grows slower |
Flips are rare and random: a block may switch to another colour. That randomness is the seed of bet hedging.

## 3. Threats
- **Phage volleys** (the Space Invaders shots). Phages fly in from a world direction and hit the **first block** on their path.
  A matching colour infects it; a mismatch deflects and is spent. Early waves are a shot every couple of seconds, one colour;
  later waves bring **two-colour phages**.
- **Cascades.** An infected block bursts after about a second and infects neighbouring blocks of the *targeted* colour, with chances that fade each generation. Big same-colour patches are devastated; a block of another colour is a firewall, and a lone survivor can regrow everything.
- **Antibiotics.** A telegraphed arc that kills most blocks in the outer layers, whatever their colour.
- **Inflammation flares.** A hot patch on the gut wall (world sectors) that makes the immune system kill exposed blocks there over time. Evasion-capsule blocks last longer.

## 4. Space: secrete (one button, one cooldown, two effects)
- **Mucus shield.** For a short time all phages are stopped, and antibiotic/immune damage is halved. Duration comes from the capsules exposed on the outside: more mucus blocks and a **more uniform outer layer** mean a longer shield.
- **Cooling.** Lowers inflammation on the whole wall by an amount that grows with the immune-evasion blocks you carry.
- Shared cooldown (about 16 s). Going uniform to buy a long shield is a bet: one matching phage will then cascade through all of it.
- Slow-mo moves to Shift.

## 5. Loss, win, structure
- **Lose:** fewer than 8 blocks, or host health 0 (health falls while overall inflammation stays high).
- **Win:** survive 4 acts (about 3.5 minutes) with calm gaps of 8 s between them (the host heals a little).
- Acts ramp: act 1 is single-colour phages, act 2 adds antibiotics and flares, act 3 adds two-colour phages, act 4 stacks everything.

## 6. Engine and tests
Headless TypeScript (fixed 20 Hz, seeded RNG, JSON state), bots in `src/sim`, balance sim via `npm run sim`.
Key property to prove: **bet hedging pays**. A uniform colony loses far more to a matching phage than a mixed one, and a uniform outer layer gives a longer shield.

## 7. Later
Renderer (blocks merging into a blob, rotation flow), sound, meals/diets as growth bias, infections, row flips.

## 8. Engine prototype status (headless, no graphics yet)
`npm test` (22 tests) and `npm run sim -- 60` run everything. Numbers are in `src/data/balance.json`.

What the tests prove:
- A hit on a uniform amber blob destroys over 4x more than on a mixed blob (about 35 of 69 blocks vs a handful); cyan (phage-resistant) damps that by more than half.
- A block of another colour is a firewall: the cascade does not cross it, and a handful of survivors regrow the blob in their own colour.
- Phages hit the first block on their path; rotating the blob changes which side takes the hit; holes let phages through.
- Antibiotics kill by position, not colour; mucus halves them and stops phages completely.
- Immune-evasion (violet) blocks lose about half as many blocks to a hot wall as amber ones.
- Space: cooldown, shield length grows with mucus blocks and a uniform outer layer (more than 2x), cooling grows with evasion blocks.

Bots (60 seeds): never rotating 38%, random spin 3%, dodging 80%, dodge + well-timed Space 77%, dodge + Space on every cooldown 68%.
Reading: rotation skill matters a lot, Space timing matters (mashing is worse than timing), but the bots don't yet *use* colour steering or a deliberately
uniform outer layer, so the mucus + bet-hedging tension is only proven in unit tests, not exercised by play. A human (or a smarter bot) will show whether it is fun.

Known rough edges: diversity drifts to about 0.7 because chip-and-regrow favours big patches; flips are rare (about 4 a minute); no meals/diets yet; no renderer.

## 9. Renderer status (playable build)
`npm run dev`, or `npm run pack` for a single-file page (`play/mbiota.html`).
- Blocks in a rotating lattice with a soft membrane glow so they read as one body; capsule decoration shows what each colour is for (amber: glossy slime, cyan: armour plating, violet: ghostly dashed edge).
- Phages are drawn in the colour(s) they hunt (two-colour phages are split), fly in from the telegraphed arc and stop at the first block. Infection shows a countdown ring, bursts throw colour particles, mucus-blocked and deflected shots spark.
- Space button shows a live preview of what you'd get right now (shield seconds, cooling %, composition of the outer layer), a cooldown bar, and a gold shield around the blob while it lasts.
- Hover a block: its colour's role, the size of the same-colour patch it belongs to (and a warning when a hit would spread far), and that patch is outlined.
- Controls: drag (or scroll, A/D) to turn the heavy blob, Space to secrete, hold Shift for slow-mo, Enter to start.
- Gut wall, flares, antibiotics wedge and stress effects carry over from v3.

## 10. Playtest round 1 changes (pixel blob, random phages, visible immune cells)
Feedback: not enough colour shifts (ended up all purple), the immune mechanism unclear and inflammation inconsequential, phages should be random colours from all sides, antibiotics stay, and the blob should be dense pixels so chips feel like real bites.
- **A dense pixel blob.** Grid radius 28, about 700 pixels at the start, capacity 1000. Pixels regrow from their neighbours (a new pixel takes after the pixels around its spot), so patches are big and clonal.
- **Real bites.** A phage hits the first pixel it meets; if the colour matches, the infection spreads pixel to pixel through same-colour neighbours (0.32 s per generation, fading odds up to 10 generations), so you watch a crater open. On a uniform amber blob one hit takes about 60 pixels; on a mixed blob almost nothing; cyan damps it.
- **Random phages from every side.** No directional volleys any more: phages arrive at random angles in random colours, more each act, none during calm gaps; two-colour phages from act 3.
- **More colour shifts.** Pixels switch colour as small microcolonies (radius 1 to 3), about one every couple of seconds, favouring whichever colour you are short of, so you cannot stay stuck with a single colour for long.
- **Inflammation now does something you can see.** The wall's red sectors fire **white immune cells** at the blob (rate grows with how red the sector is, none when calm). An immune cell bites the first pixel it meets plus a small chew of its neighbours. **Violet evades about 75% of them**, mucus blocks them completely, and Space cools the wall so fewer are fired. The legend, tooltip, banner and intro all explain this.
- Antibiotics are unchanged (telegraphed arc through the outer layers, colour-blind).
- Space is weaker and slower (cooldown 30 s).

Bots (30 seeds): never rotating about 20%, random spinning about 7%, dodging about 50-70% depending on pressure, dodging plus well-timed Space about 90%, Space mashed on every cooldown about 85%. Space looks very strong in the bots' hands; that is the thing to watch in human play.

## 11. Proposal: puzzle pace (draft, not built)
Why: playtest said "not fun": nothing to decide, hits feel random or unfair, no satisfying moment. With random phages from all sides, the best play was always an even mix and rotation became a twitchy reflex. The fix is to give the player information and a real choice each beat.

### The loop: one beat at a time
1. **Announce.** The next wave is shown *before* it hits: each incoming phage is drawn at its landing angle, in its colour(s), with a line to the blob. Immune cells (if the wall is red) and an antibiotic arc are announced the same way.
2. **Plan.** Rotate the blob freely (fast and precise, no heavy momentum: the cost is time, not reflexes). A **live preview** follows your rotation: each phage's line ends where it would land. Green spark = deflected (wrong colour), red crater outline = a bite, sized by the patch it would open. You are solving "which rotation takes the fewest or smallest bites, or sacrifices the right patch".
3. **Release.** Press Enter (or the button) when happy. Early acts are untimed; later acts add a planning timer that shrinks (about 12 s down to 6 s), which is where the tension comes from.
4. **Resolve.** Everything lands at once, craters bloom pixel by pixel, cascades play out (deterministic given a seed, so the preview is honest about the first hit and shows a size range for the bite).
5. **Regrow and shift.** A few seconds where the blob regrows into the holes and a couple of microcolonies switch colour (so every beat the colour map is different and the puzzle changes). Then the next beat.

### The payoff
- **Perfect parry:** every phage in a beat deflected, a big flash and a streak counter.
- **Space meter, earned:** deflected phages and perfect parries *charge* the secrete meter (no flat cooldown). Space spends the meter: the shield length and cooling scale with the charge and with what is on the outside (amber, uniform layer, violet), so playing well gives you your strong tool.
- Sacrifice is a visible, intentional choice: when a bite is unavoidable you pick which patch takes it, and the survivors regrow into the gap and shift the colour mix.

### What stays
Pixel blob, colours as capsule types (amber mucus, cyan phage resistance, violet immune evasion), cascades through same-colour neighbours, capacity, antibiotics, immune cells from the red wall (announced like the others, violet evades), mutations as microcolonies.

### What changes in the engine
A beat director (list of announced phages, immune cells, antibiotic per beat, with escalation), a preview function that ray-marches each announced particle against a candidate rotation, a phase machine (announce, plan, resolve, regrow), a charge-based secrete meter, direct rotation instead of momentum. Bots become planners (try every rotation, pick the best), which also tells us whether the puzzle has real depth: it should need several different rotations to be right, and a perfect parry should be possible but not every time.

### Open choices (defaults in brackets)
1. Planning timer from act 2 on [yes, shrinking], or always untimed.
2. Space charged by parries [yes], or keep a cooldown as well.
3. Keep immune cells and flares as announced attackers [yes].
