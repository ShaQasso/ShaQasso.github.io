# MBIOTA v6 — "Remission" (design proposal, not built)

Plan + act. A roguelike run in which you **groom** between waves (turn-based, calm, cards) and **survive** the waves (real time, few controls).
Setting: an **IBD patient** (Crohn's or ulcerative colitis). The blob is their *Bacteroides* community; the wall is the inflamed gut; flares are the disease.
The outcome you play for is **gut maintenance**: keep the wall calm and the community healthy for a year of disease.

v3 (rings), v4 (real-time blob) and v5 (turn-based blob) stay in the repo for comparison. v6 reuses their engines (pixel blob, cascades, immune cells, antibiotics, microcolony switches, parries/bites preview).

## Structure of a run: 12 cycles ("months")
Each cycle = **Grooming** (turn-based, optional timer) then **Wave** (real time, about 45 s) then a short **Check-up** (how the wall and the blob did).
Chronic IBD: every cycle the baseline inflammation drifts up a little, and flares get likelier and stronger, so you have to keep maintaining it.
Win: finish 12 cycles. Lose: **flare-out** (inflammation overload). Population collapse stays possible but rare (it takes several bad cycles).
Score: remission quality (average wall calm, diversity, parries).

## Grooming phase (planning, turn-based, cards)
Pick 1 of 3 cards, twice, from three families. Cards last for the next wave or a few cycles (stated on the card).
- **Food** (carb sources; growth or phase buffs): *Fibre* (violet grows x1.6, switches lean violet, a little butyrate cooling), *Mucin glycans* (amber grows, thicker mucus coats), *Resistant starch* (cyan grows, cascades damped), *Simple sugar* (everything grows x2 but a flare risk, IBD patients dislike it), *Phase shift* (your next 3 colour switches go to a colour you pick).
- **Motility** (buffs that let you turn): *Peristalsis* (turning is faster this wave), *Ring turn* (3 charges to turn the outer band of the blob independently of the core), *Anchor* (turning is slower but bites are 30% smaller).
- **Drugs** (IBD treatments, each with a cost): *Mesalamine* (steady mild cooling for 3 cycles), *Corticosteroid* (strong cooling now, rebound next cycle), *Anti-TNF* (flares 40% weaker for 3 cycles, but capacity -10%), *Immunomodulator* (40% fewer immune cells, growth -15%).
- Later: relics that persist all run, bigger decks, bosses (a bad flare week, a gut infection), unlocks between runs.

## Wave phase (real time, few things at once)
**Rule of thumb: one control, many jobs.** You only **turn the blob** (heavy, as in v4). Optionally use **one held card** with a hotkey (emergency drug, ring turn). Everything else is automatic and readable.
- **Phages**: random colours from all sides, in a stream that builds across the wave (the v4 wave feel). They hit the first pixel and bite through same-colour neighbours.
- **Antibiotic**: a telegraphed arc, as before.
- **Immune cells** fired from flared sectors, as in v5. Violet evades them.
- **Cooling is passive and directional**: every wall sector is cooled by the anti-inflammatory pixels *facing it*, weighted by proximity to the lumen (surface pixels count most; violet most, amber some, cyan little), with **diminishing returns** (a typical value is 30 to 60%, and 100% needs a deliberate arrangement). So turning to point violet at the flare is also turning away from a phage. That is the tension, with just one control.
- **Mucus coat on big patches**: a single-colour patch that is *really* big (at least about 10% of the blob, and at least 120 pixels) grows a visible mucus shell that soaks up hits (a count of phage hits or about 8 s, longer with amber), then goes on cooldown. Small patches never coat. This replaces "uniform outer layer": big patches become both your shield and your liability (a bite into a big patch is large).

## Making "doing nothing" hurt
Waves are real time, so a blob that does not turn takes every hit. The wall is never cooled where it flares unless you face it. And chronic drift raises the baseline every cycle, so skipping grooming or taking no drugs loses ground. Bots will be used to check that idle play loses clearly.

## Visuals
- **Villi like a gut**: many more, fine finger-shaped villi with rounded tips, gently swaying; inflamed sectors lose villi (blunted, red, swollen) as in real IBD; a mucus layer between villi and lumen, thinner when inflamed.
- Cards as a hand at the bottom during grooming; the wave HUD stays minimal.

## Engine plan
1. Real-time wave engine from v4 plus v5's immune cells and parry preview removed; passive directional cooling; patch mucus coats.
2. Grooming and run loop (cards, cycles, chronic drift), with a card effect system.
3. Bots for balance: idle, rotate-only, planner (cards and rotation), checking that idle loses, collapse is rare, and card choices matter.
4. Renderer: new villi, card UI, check-up screen.

## Open decisions
1. One control (rotation) plus an optional held card, or also a separate aimed effort?
2. Passive cooling by facing (proposed), or keep the aimed effort from v5?
3. Bring back independently turnable rings as a card ("Ring turn")?
4. Run size: 12 cycles of about 1.5 minutes (about 18 minutes), or shorter?
