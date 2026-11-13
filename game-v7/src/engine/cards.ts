export type Family = 'food' | 'motility' | 'drug';
export interface CardDef {
  id: string; name: string; family: Family; text: string; weight: number;
  held?: { charges: number };            // goes in the held slot (one at a time), used with Space during a wave
  mods?: Record<string, number>; cycles?: number; // passive effects for the next few waves
  target?: 'blob' | 'wall';              // you choose where the effect happens
  colour?: number;                       // food: the colour it feeds
}

/** Colours: 0 yellow (mucus capsule), 1 green (phage-resistant capsule), 2 blue (immune-evasion capsule, treats flares). */
export const CARDS: CardDef[] = [
  // food (carb sources): drag onto the colony where it feeds
  { id: 'fibre', name: 'Fibre', family: 'food', weight: 1, target: 'blob', colour: 2, text: 'Blue grows where you drop it for 2 waves. Blue calms flares.' },
  { id: 'mucin', name: 'Mucin', family: 'food', weight: 1, target: 'blob', colour: 0, text: 'Yellow grows where you drop it for 2 waves. Yellow builds a coat.' },
  { id: 'starch', name: 'Starch', family: 'food', weight: 1, target: 'blob', colour: 1, text: 'Green grows where you drop it for 2 waves. Green resists phages.' },
  // motility
  { id: 'peristalsis', name: 'Peristalsis', family: 'motility', weight: 0.9, cycles: 2, mods: { rotAccel: 1.7, rotMax: 1.4 }, text: 'The colony turns faster for 2 waves.' },
  { id: 'ringturn', name: 'Ring turn', family: 'motility', weight: 0.9, held: { charges: 3 }, text: 'Held, 3 uses. Space turns the outer ring against the core.' },
  // IBD drugs
  { id: 'mesalamine', name: 'Mesalamine', family: 'drug', weight: 1, target: 'wall', text: 'Drop on the wall: that section is cooled for 3 waves.' },
  { id: 'antitnf', name: 'Anti-TNF', family: 'drug', weight: 0.9, cycles: 3, mods: { flareMul: 0.6, capMul: 0.9 }, text: 'Flares are 40% weaker for 3 waves. The colony grows to 90%.' },
  { id: 'steroid', name: 'Steroid', family: 'drug', weight: 0.9, held: { charges: 1 }, text: 'Held, 1 use. Space cools the whole wall. It rebounds next wave.' },
  { id: 'mucolytic', name: 'Mucus burst', family: 'drug', weight: 0.8, held: { charges: 1 }, text: 'Held, 1 use. Space coats the whole surface for 8 seconds.' },
];
export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, CardDef>;
CARD.steroid_rebound = { id: 'steroid_rebound', name: 'Steroid rebound', family: 'drug', weight: 0, cycles: 1, mods: { baseAdd: 0.1 }, text: 'The gut rebounds after the steroid.' };
