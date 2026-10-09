export type Family = 'food' | 'motility' | 'drug';
export interface CardDef {
  id: string; name: string; family: Family; text: string; weight: number;
  held?: { charges: number };            // goes in the held slot (one at a time), used with Space during a wave
  mods?: Record<string, number>; cycles?: number; // passive effects for the next few waves
  phase?: number;                        // food: send the next colour switches to this colour
}

/** Mod keys: multipliers (growthAll, growth0..2, flareMul, immuneMul, capMul, rotAccel, rotMax, biteDamp, coatMul, chronicMul) and adders (coolBonus, baseAdd, resistAdd). */
export const CARDS: CardDef[] = [
  // food (carb sources: growth or phase buffs)
  { id: 'fibre', name: 'Fibre', family: 'food', weight: 1, cycles: 2, mods: { growth2: 1.6, coolBonus: 0.04 }, text: 'Violet grows 1.6x for 2 waves, a little butyrate cooling.' },
  { id: 'mucin', name: 'Mucin glycans', family: 'food', weight: 1, cycles: 2, mods: { growth0: 1.6, coatMul: 1.5 }, text: 'Amber grows 1.6x and coats last 1.5x longer, for 2 waves.' },
  { id: 'starch', name: 'Resistant starch', family: 'food', weight: 1, cycles: 2, mods: { growth1: 1.5, resistAdd: 0.15 }, text: 'Cyan grows 1.5x and resists cascades even more, for 2 waves.' },
  { id: 'sugar', name: 'Simple sugar', family: 'food', weight: 0.8, cycles: 1, mods: { growthAll: 2, baseAdd: 0.08 }, text: 'Everything grows 2x this wave, but the gut runs hotter (IBD does not like sugar).' },
  { id: 'phase_a', name: 'Phase shift: amber', family: 'food', weight: 0.7, phase: 0, text: 'Your next 3 colour switches go to amber.' },
  { id: 'phase_c', name: 'Phase shift: cyan', family: 'food', weight: 0.7, phase: 1, text: 'Your next 3 colour switches go to cyan.' },
  { id: 'phase_v', name: 'Phase shift: violet', family: 'food', weight: 0.7, phase: 2, text: 'Your next 3 colour switches go to violet.' },
  // motility (shape the blob, turn it better)
  { id: 'peristalsis', name: 'Peristalsis', family: 'motility', weight: 0.9, cycles: 2, mods: { rotAccel: 1.7, rotMax: 1.4 }, text: 'The blob turns faster for 2 waves.' },
  { id: 'anchor', name: 'Anchor', family: 'motility', weight: 0.8, cycles: 2, mods: { rotAccel: 0.6, biteDamp: 0.75 }, text: 'Slower turning, but bites spread 25% less, for 2 waves.' },
  { id: 'ringturn', name: 'Ring turn', family: 'motility', weight: 0.9, held: { charges: 3 }, text: 'HELD (Space, 3 uses): turn the outer band of the blob 15 degrees against the core. Hold Shift to turn it the other way.' },
  // drugs (IBD treatments, each with a price)
  { id: 'mesalamine', name: 'Mesalamine (5-ASA)', family: 'drug', weight: 1, cycles: 3, mods: { coolBonus: 0.1 }, text: 'Steady extra cooling on every sector for 3 waves.' },
  { id: 'steroid', name: 'Corticosteroid', family: 'drug', weight: 0.9, held: { charges: 1 }, text: 'HELD (Space, once): cool the whole wall hard right now. The gut rebounds a bit next wave.' },
  { id: 'antitnf', name: 'Anti-TNF biologic', family: 'drug', weight: 0.9, cycles: 3, mods: { flareMul: 0.6, capMul: 0.9 }, text: 'Flares 40% weaker for 3 waves, but the blob can only grow to 90%.' },
  { id: 'immunomod', name: 'Immunomodulator', family: 'drug', weight: 0.9, cycles: 3, mods: { immuneMul: 0.6, growthAll: 0.85 }, text: '40% fewer immune cells for 3 waves, but everything grows 15% slower.' },
  { id: 'mucolytic', name: 'Mucus secretagogue', family: 'drug', weight: 0.8, held: { charges: 1 }, text: 'HELD (Space, once): coat the whole surface in mucus for 8 s.' },
];
export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, CardDef>;
CARD.steroid_rebound = { id: 'steroid_rebound', name: 'Steroid rebound', family: 'drug', weight: 0, cycles: 1, mods: { baseAdd: 0.1 }, text: 'The gut rebounds after the steroid.' };
