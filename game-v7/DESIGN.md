# Mbiota v7

A five-minute browser game: you are the gut bacteria of someone with Crohn's disease, and you keep the gut in remission for six months.

## Rules
- **Six months.** Each month is one card, then a 30-second wave, then a short summary.
- **Capsule types.** Three colours are three capsule types. Blue stands for an anti-inflammatory capsule such as *B. fragilis* PSA: it calms the wall it faces (shown as blue pulses travelling to the wall) and immune cells mostly spare it. Yellow resists immune cells. Green slows flares: the larger the green share of the colony, the less heat a flare adds.
- **The central trade-off.** A big patch of one colour grows a coat that blocks hits, but a bite into it takes far more. A panel shows the biggest patch of each type against the coat threshold at all times.
- **Cards are gardening between waves.** Only things from outside the body: food (Fibre grows blue, Mucin yellow, Starch green), an Antibiotic that clears cells where you drop it, Mesalamine that cools one wall section for the coming wave, and a Steroid that cools the whole wall but raises the baseline for good. Each card is dragged to where it works. Nothing is held and nothing has a timer beyond the coming wave.
- **In a wave you turn the colony.** Phages arrive in volleys of 3 to 5 of one kind, spread over an arc. They wait at the rim for about two seconds and show their path. A phage infects only the colour of its head.
- **Flares** start in month 2: an arc of the wall heats up and sends immune cells that scrape a strip. Antibiotics do not arrive as waves.
- **Bites hurt and heal slowly.** A bite spreads further through same-colour neighbours, and every burst cell heats the section of wall it faces, so phage damage feeds inflammation. Crater edges regrow about three times faster than the colony grows outward, so a bad wave still shows next month.
- **Flares aim at weak spots.** Most flares land on the section of wall that blue covers least.
- **Calm months stack.** A month that survives a flare with inflammation under 66% heals the gut for good (the baseline drops) and extends a calm streak; a rough month resets the streak. Each Mesalamine on a wall section keeps that section a little cooler for the rest of the run. A calm month counts more toward the score the longer the streak.
- **Keep going.** Month 6 is remission; you can continue. Difficulty rises half as fast per month after that, and the best score is kept in the browser.
- **New each month:** flares (2), two-colour phages (3), faster phages (4), stronger flares (5), a second flare (6).
- **Losing:** inflammation above the limit for 2.5 seconds. **Remission score** (live on screen): calm months + colony size + colour mix.

## Look
Flat geometry on black and cream with red, orange, yellow, green and blue. Outer pixels trail and then catch up when the colony turns, bites leave a fading outline, and new pixels start pale.

## Balance
24 seeds per bot (remission by month 6): idle 8%, a bot that only dodges phages 79%, a bot that also turns blue toward flares 92%. Past remission the good bot lasts about one to seven more months. The bots choose cards crudely. A human playtest has not been done.

## Code
`src/engine` is the headless rules (seeded, fixed timestep), `src/render/draw.ts` the canvas, `src/ui/hud.ts` the card hand, patch panel and summary, `tests/` the engine tests, `npm run pack` builds the single file `play/mbiota.html`.
