# MBIOTA v5 — "Turns" (puzzle pace)

Built from your design: a turn-based puzzle on the pixel blob. v3 (rings) and v4 (real-time blob) stay in the repo for comparison.

## The turn
1. **Announce.** Each turn the world shows what it will do: N phages (each with a colour or two colours and a landing angle), maybe an antibiotic wedge, maybe immune cells (only while an immune section is on).
2. **Plan, with a shrinking timer.** The timer starts at 26 s and loses 0.9 s per turn down to a floor of 8 s; when it runs out the turn releases automatically. You do two things:
   - **Turn the blob** (drag, A/D, or scroll). A live, honest preview follows: a green tick where a phage would be deflected, a red circle sized to the bite it would open (a Monte-Carlo run of the real cascade rules), an expected-loss total, and "perfect parry" when every phage is deflected.
   - **Aim the anti-inflammatory effort** (click or drag outside the blob, or Q/E). It cools the wall in that direction by an amount computed from the pixels near the edge (the lumen): violet counts most, amber some, cyan little, and pixels deeper inside count less.
3. **Release (Enter)** or **Skip (S)**.
4. **Resolve**, then **regrow** (the blob divides into the holes and a few patches switch colour), then the next turn.

## Skips
A **perfect parry** (every phage deflected) earns a skip token (max 3). A skip cancels the whole announced turn (phages, immune cells, antibiotic). The effort is still spent and the blob still regrows.

## Inflammation
- The wall has 8 sectors. An **immune section** cycles quiet, pre-flare, flare, after-flare, quiet, each with a random number of turns and a different intensity (0.35, 1.0, 0.5, scaling up with the turn). While it is on, it heats an arc of the wall every turn and announces white immune cells from that arc. Violet evades most of them.
- Your effort takes heat off the wall where you aim it. Phage bursts add a little heat where the pixels burst.
- **Lose** when overall inflammation reaches the overload line (a cubic mean of the sectors, so one blazing sector counts), or when the blob collapses below 40 pixels. **Win** by surviving 30 turns.

## Mucus bloom
If the outer layer is mostly one colour (62% or more) the blob blooms a mucus layer for 1 to 3 turns (amber best) that blocks phages and immune cells and halves antibiotics, then a cooldown. A uniform surface is also the easiest prey afterwards.

## Complexity ramp
Phages per turn grow from 3 to 14, two-colour phages from turn 8, antibiotics from turn 7, the immune section from turn 6; the banner introduces each new element the first time it appears.

## Results so far (planner bot that searches every rotation and effort direction, 8 seeds)
| Player | Win rate |
|---|---|
| Planner | about 75% |
| Rotates well but ignores cooling | about 38% |
| Random rotation and aim | about 38% |
| Does nothing | about 25% |
Perfect parries are possible about 40% of the time even with perfect play; the main way to lose is inflammation overload, population collapse is rare. These are bot numbers; human play will tell.
