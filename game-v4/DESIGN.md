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
