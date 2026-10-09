import balance from '../data/balance.json';
import { MEALS, SPECIES, coatOf, diversity, localInflammation } from '../engine/sim';
import type { State } from '../engine/types';
import type { Hover } from '../render/draw';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const MEAL_TEXT: Record<string, string> = {
  fibre: 'B. hungry thrives and flips toward its fibre coat. Everyone else grows a little slower.',
  sugar: 'Everything grows faster, but inflammation climbs.',
  mucin: 'Flips lean toward calming coats. Growth is slow.',
  fasting: 'Growth and flipping slow down. Phages move slower too.',
};
const SHAPE_NAME: Record<string, string> = { d: 'diamond', c: 'circle', t: 'triangle', s: 'square', x: 'none' };
const SHAPE_CH: Record<string, string> = { d: '◆', c: '●', t: '▲', s: '■', x: '✚' };

const ACT_NOTES = [
  ['ACT 1', 'Phages hunt one receptor shape at a time'],
  ['ACT 2', 'Pathogens slip in through holes. Antibiotics can clear them, and your own cells too'],
  ['ACT 3', 'Waves overlap and the host runs hotter'],
  ['FINAL ACT', 'Everything at once. Hold on'],
];

export class Hud {
  private bannerT = 0;
  private lastAct = -1;
  private lastGap = false;
  private mealsKey = '';

  update(s: State, focus: number): void {
    const act = Math.min(balance.director.acts - 1, Math.floor(s.t / (balance.director.actLen + balance.director.gapLen)));
    const inGap = s.gaps.some((g) => s.t >= g.start && s.t < g.end);
    const m = Math.floor(s.t / 60), sec = Math.floor(s.t % 60).toString().padStart(2, '0');
    $('act').textContent = `${inGap ? 'CALM GAP' : `ACT ${act + 1}/${balance.director.acts}`} · ${m}:${sec}`;
    $('b-health').style.width = `${s.health}%`;
    $('b-health').style.background = s.health < 30 ? '#ef4444' : s.health < 55 ? '#f59e0b' : '#34d399';
    $('b-infl').style.width = `${Math.round(s.inflammation * 100)}%`;
    $('b-div').style.width = `${Math.round(diversity(s) * 100)}%`;
    $('b-focus').style.width = `${Math.round(focus * 100)}%`;
    $('meal-chip').textContent = s.meal ? `${MEALS[s.meal.id].name}: ${Math.ceil(s.meal.left)}s` : '';

    if (act !== this.lastAct && !inGap) { this.lastAct = act; this.banner(ACT_NOTES[act][0], ACT_NOTES[act][1], 3.2); }
    if (inGap && !this.lastGap) this.banner('CALM GAP', 'Pick a meal. The host heals a little', 3);
    this.lastGap = inGap;
    if (this.bannerT > 0) { this.bannerT -= 1 / 60; if (this.bannerT <= 0) $('banner').classList.remove('show'); }

    const key = s.offer ? s.offer.join(',') : '';
    if (key !== this.mealsKey) {
      this.mealsKey = key;
      const el = $('meals');
      el.innerHTML = '';
      s.offer?.forEach((id, i) => {
        const b = document.createElement('button');
        b.className = 'meal'; b.type = 'button';
        b.innerHTML = `<kbd>${i + 1}</kbd><b>${MEALS[id].name}</b><span>${MEAL_TEXT[id] ?? ''}</span>`;
        b.addEventListener('click', () => this.onMeal(i));
        el.appendChild(b);
      });
    }
  }

  onMeal: (i: number) => void = () => {};

  banner(title: string, sub: string, secs: number): void {
    const b = $('banner');
    b.innerHTML = `${title}<small>${sub}</small>`;
    b.classList.add('show');
    this.bannerT = secs;
  }

  reset(): void { this.lastAct = -1; this.lastGap = false; this.mealsKey = ''; $('meals').innerHTML = ''; $('banner').classList.remove('show'); }

  tooltip(s: State | null, h: Hover | null, x: number, y: number): void {
    const el = $('tip');
    if (!s || !h) { el.style.display = 'none'; return; }
    const c = s.rings[h.ring].cells[h.slot];
    if (!c) { el.style.display = 'none'; return; }
    const def = SPECIES[c.sp], coat = coatOf(c);
    const local = localInflammation(s, h.ring, h.slot);
    const imm = coat.immune > 0 ? `calming +${coat.immune}` : coat.immune < 0 ? `inflammatory ${coat.immune}` : 'neutral';
    el.innerHTML = def.pathogen
      ? `<b>Pathogen</b><br>Inflammatory, ignores phages. Only antibiotics remove it.<br>Local inflammation ${Math.round(local * 100)}%`
      : `<b>${def.name}</b><br>Coat ${SHAPE_CH[coat.shape]} ${SHAPE_NAME[coat.shape]} · ${imm}${coat.armored ? ' · armored' : ''}<br>`
        + `Flips about every ${Math.round(1 / Math.max(0.001, def.flip))}s<br>Local inflammation ${Math.round(local * 100)}%${c.inf > 0 ? '<br><b style="color:#d8b4fe">Infected</b>' : ''}`;
    el.style.display = 'block';
    el.style.left = `${Math.min(innerWidth - 230, x + 14)}px`;
    el.style.top = `${Math.min(innerHeight - 110, y + 14)}px`;
  }
}

export function showScreen(html: string): void {
  const el = $('screen');
  el.innerHTML = `<div class="card">${html}</div>`;
  el.classList.add('show');
}
export function hideScreen(): void { $('screen').classList.remove('show'); }
