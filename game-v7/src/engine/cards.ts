export type Family = 'food' | 'drug';
export interface CardDef {
  id: string; name: string; family: Family | 'motility'; text: string; weight: number;
  effect?: 'feed' | 'abx' | 'wallcool' | 'steroid';
  target?: 'blob' | 'wall';              // drag the card onto the colony or the wall
  colour?: number;                       // food: the colour it feeds
  held?: { charges: number }; mods?: Record<string, number>; cycles?: number; // legacy (not offered)
}

/**
 * Colours: 0 yellow (mucus capsule), 1 green (phage-resistant capsule), 2 blue (immune-evasion capsule, calms flares).
 * Cards are gardening between waves: only things that come from outside the body (food and drugs). Each one is played
 * once, by dragging it to where it should work. Nothing is held and nothing has a timer beyond the coming wave.
 */
export const CARDS: CardDef[] = [
  { id: 'fibre', name: 'Fibre', family: 'food', effect: 'feed', weight: 1, target: 'blob', colour: 2, text: 'Blue grows where you drop it. Blue calms flares.' },
  { id: 'mucin', name: 'Mucin', family: 'food', effect: 'feed', weight: 1, target: 'blob', colour: 0, text: 'Yellow grows where you drop it. Yellow builds a coat.' },
  { id: 'starch', name: 'Starch', family: 'food', effect: 'feed', weight: 1, target: 'blob', colour: 1, text: 'Green grows where you drop it. Green resists phages.' },
  { id: 'antibiotic', name: 'Antibiotic', family: 'drug', effect: 'abx', weight: 0.8, target: 'blob', text: 'Clears every cell where you drop it. Prune a patch that got too big.' },
  { id: 'mesalamine', name: 'Mesalamine', family: 'drug', effect: 'wallcool', weight: 1, target: 'wall', text: 'Drop on the wall: that section stays cooler this wave.' },
  { id: 'steroid_now', name: 'Steroid', family: 'drug', effect: 'steroid', weight: 0.8, text: 'Cools the whole wall now. The baseline creeps up for good.' },
];
// Kept so older saves and tests resolve; never offered.
const LEGACY: CardDef[] = [
  { id: 'peristalsis', name: 'Peristalsis', family: 'motility', weight: 0, cycles: 2, mods: { rotAccel: 1.7, rotMax: 1.4 }, text: '' },
  { id: 'ringturn', name: 'Ring turn', family: 'motility', weight: 0, held: { charges: 3 }, text: '' },
  { id: 'antitnf', name: 'Anti-TNF', family: 'drug', weight: 0, cycles: 3, mods: { flareMul: 0.6, capMul: 0.9 }, text: '' },
  { id: 'steroid', name: 'Steroid', family: 'drug', weight: 0, held: { charges: 1 }, text: '' },
  { id: 'mucolytic', name: 'Mucus burst', family: 'drug', weight: 0, held: { charges: 1 }, text: '' },
  { id: 'steroid_rebound', name: 'Steroid rebound', family: 'drug', weight: 0, cycles: 1, mods: { baseAdd: 0.1 }, text: '' },
];
export const CARD = Object.fromEntries([...CARDS, ...LEGACY].map((c) => [c.id, c])) as Record<string, CardDef>;
