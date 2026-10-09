export type Family = 'food' | 'motility' | 'drug';
export interface CardDef {
  id: string; name: string; family: Family; text: string; weight: number;
  held?: { charges: number };            // goes in the held slot (one at a time), used with Space during a wave
  mods?: Record<string, number>; cycles?: number; // passive effects for the next few waves
  target?: 'blob' | 'wall';              // you choose where the effect happens
  colour?: number;                       // food: the colour it feeds
}

/** Colours: 0 yellow (mucus capsule), 1 purple (phage-resistant capsule), 2 blue (immune-evasion capsule, treats flares). */
export const CARDS: CardDef[] = [
  // food (carb sources): pick one, then click the blob where it feeds
  { id: 'fibre', name: 'Fibre', family: 'food', weight: 1, target: 'blob', colour: 2, text: 'Feeds BLUE where you choose: that spot turns blue now and keeps growing blue for 2 waves.' },
  { id: 'mucin', name: 'Mucin glycans', family: 'food', weight: 1, target: 'blob', colour: 0, text: 'Feeds YELLOW where you choose: that spot turns yellow now and keeps growing yellow for 2 waves.' },
  { id: 'starch', name: 'Resistant starch', family: 'food', weight: 1, target: 'blob', colour: 1, text: 'Feeds PURPLE where you choose: that spot turns purple now and keeps growing purple for 2 waves.' },
  // motility
  { id: 'peristalsis', name: 'Peristalsis', family: 'motility', weight: 0.9, cycles: 2, mods: { rotAccel: 1.7, rotMax: 1.4 }, text: 'The blob turns faster for 2 waves.' },
  { id: 'ringturn', name: 'Ring turn', family: 'motility', weight: 0.9, held: { charges: 3 }, text: 'HELD (Space, 3 uses): turn the outer band of the blob 15 degrees against the core. Shift+Space turns it the other way.' },
  // IBD drugs
  { id: 'mesalamine', name: 'Mesalamine (5-ASA)', family: 'drug', weight: 1, target: 'wall', text: 'Pick a stretch of the gut wall: it is cooled strongly there for 3 waves.' },
  { id: 'antitnf', name: 'Anti-TNF biologic', family: 'drug', weight: 0.9, cycles: 3, mods: { flareMul: 0.6, capMul: 0.9 }, text: 'Flares are 40% weaker for 3 waves, but the blob can only grow to 90%.' },
  { id: 'steroid', name: 'Corticosteroid', family: 'drug', weight: 0.9, held: { charges: 1 }, text: 'HELD (Space, once): cool the whole wall hard right now. The gut rebounds a bit next wave.' },
  { id: 'mucolytic', name: 'Mucus secretagogue', family: 'drug', weight: 0.8, held: { charges: 1 }, text: 'HELD (Space, once): coat the whole surface in mucus for 8 s.' },
];
export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, CardDef>;
CARD.steroid_rebound = { id: 'steroid_rebound', name: 'Steroid rebound', family: 'drug', weight: 0, cycles: 1, mods: { baseAdd: 0.1 }, text: 'The gut rebounds after the steroid.' };
