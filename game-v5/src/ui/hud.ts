import balance from '../data/balance.json';
import { count, exposed } from '../engine/geometry';
import type { Preview } from '../engine/plan';
import { COLOURS } from '../engine/sim';
import type { State } from '../engine/types';
import { COLOUR_HEX, COLOUR_NAME, type Pick, type Renderer } from '../render/draw';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const B = balance;

export class Hud {
  private bannerT = 0;
  private seen = new Set<string>();
  private lastPerfects = 0;
  private lastTurn = 0;

  update(s: State, pv: Preview | null): void {
    const n = count(s);
    $('turn').textContent = `TURN ${s.turn} / ${B.turns.toWin}`;
    $('phase').textContent = s.phase === 'plan' ? 'plan your move' : s.phase === 'resolve' ? 'resolving' : 'regrowing';
    $('b-timer').style.width = s.phase === 'plan' ? `${(s.timer / s.timerMax) * 100}%` : '0%';
    $('b-timer').style.background = s.timer < 5 && s.phase === 'plan' ? '#ef4444' : '#38bdf8';
    $('b-infl').style.width = `${Math.min(100, (s.inflammation / B.overload) * 100 * 0.9)}%`;
    $('m-over').style.left = '90%';
    $('b-pop').style.width = `${Math.min(100, (n / B.capacity) * 100)}%`;
    $('m-min').style.left = `${(B.lose.minCells / B.capacity) * 100}%`;
    $('pop-label').textContent = `Blob ${n} / ${B.capacity}`;
    const planning = s.phase === 'plan' && s.status === 'run';
    $<HTMLButtonElement>('release').disabled = !planning;
    $<HTMLButtonElement>('skip').disabled = !planning || s.skips <= 0;
    $('skips').textContent = String(s.skips);

    if (planning && pv) {
      const bites = pv.phages.filter((p) => p.outcome === 'bite').length;
      const parts: string[] = [];
      if (pv.blocked) parts.push('<b style="color:#fde047">Mucus bloom: nothing can touch you this turn</b>');
      else if (pv.phages.length && pv.perfect) parts.push('<b style="color:#4ade80">Perfect parry: every phage deflected (+1 skip)</b>');
      else parts.push(`expected loss <b>~${Math.round(pv.expectedLoss)} px</b> (${bites} of ${pv.phages.length} phages bite${pv.abx ? `, antibiotic ~${pv.abx.killed}` : ''}${pv.immune.length ? `, ${pv.immune.length} immune cells` : ''})`);
      parts.push(`cooling <b style="color:#fde68a">${Math.round(Math.min(1, pv.exert.power) * 100)}%</b> toward the gold arc`);
      $('plan-info').innerHTML = parts.join(' · ');
    } else if (s.status === 'run') {
      $('plan-info').textContent = s.phase === 'resolve' ? 'Everything lands. Hold Space to fast-forward.' : 'The blob regrows and a few patches switch colour.';
    }

    // teaching banners, one per new element
    if (s.turn !== this.lastTurn) {
      this.lastTurn = s.turn;
      if (s.turn === 1) this.banner('TURN 1', 'Drag the blob so each phage meets a colour it can not infect. Click outside it to aim the cooling effort. Release when ready.', 7);
      if (s.section.kind !== 'quiet' && !this.seen.has('immune')) { this.seen.add('immune'); this.banner('IMMUNE SECTION', 'The red arc on the wall is inflamed. It will fire white immune cells and heat up the wall. Violet evades them. Aim your cooling at it.', 7); }
      else if (s.ann.abx && !this.seen.has('abx')) { this.seen.add('abx'); this.banner('ANTIBIOTIC', 'It kills the outer layers inside the yellow wedge, whatever the colour. Turn sensitive patches away, or skip.', 6); }
      else if (s.ann.phages.some((p) => (p.mask & (p.mask - 1)) !== 0) && !this.seen.has('two')) { this.seen.add('two'); this.banner('TWO-COLOUR PHAGES', 'A split phage infects either of its two colours.', 5); }
      else if (s.mucusTurns > 0 && !this.seen.has('mucus')) { this.seen.add('mucus'); this.banner('MUCUS BLOOM', `The outside is mostly one colour, so a mucus layer protects you for ${s.mucusTurns} turn${s.mucusTurns > 1 ? 's' : ''}. Careful: a uniform surface is easy prey afterwards.`, 7); }
    }
    if (s.perfects > this.lastPerfects) { this.lastPerfects = s.perfects; this.banner(`PERFECT PARRY${s.streak > 1 ? ` x${s.streak}` : ''}`, 'Every phage deflected: +1 skip', 2.2); }
    if (this.bannerT > 0) { this.bannerT -= 1 / 60; if (this.bannerT <= 0) $('banner').classList.remove('show'); }
  }

  banner(title: string, sub: string, secs: number): void { const b = $('banner'); b.innerHTML = `${title}<small>${sub}</small>`; b.classList.add('show'); this.bannerT = secs; }
  reset(): void { this.seen.clear(); this.lastPerfects = 0; this.lastTurn = 0; $('banner').classList.remove('show'); }

  tooltip(s: State | null, h: Pick | null, r: Renderer, x: number, y: number): void {
    const el = $('tip');
    const c = s && h ? s.cells[(h.j + B.R) * (2 * B.R + 1) + (h.i + B.R)] : null;
    if (!s || !h || !c) { el.style.display = 'none'; return; }
    const patch = r.patchOf(s, h.i, h.j).size, co = COLOURS[c.c];
    const role = ['mucus capsule: feeds the mucus bloom', 'phage-resistant capsule: damps cascades', 'immune-evasion capsule: dodges immune cells, best at cooling'][c.c];
    el.innerHTML = `<b style="color:${COLOUR_HEX[c.c]}">${COLOUR_NAME[c.c]}</b> · ${role}<br>Patch of <b>${patch}</b> same-colour pixels${patch >= 150 ? ' <b style="color:#fca5a5">(a hit takes a big bite)</b>' : ''}<br>${exposed(s, h.i, h.j) ? 'On the surface' : 'Inside the blob'} · resist ${Math.round(co.resist * 100)}% · evasion ${Math.round(co.evade * 100)}% · cooling ${Math.round(co.anti * 100)}%`;
    el.style.display = 'block'; el.style.left = `${Math.min(innerWidth - 250, x + 14)}px`; el.style.top = `${Math.min(innerHeight - 130, y + 14)}px`;
  }
}

export function showScreen(html: string): void { const el = $('screen'); el.innerHTML = `<div class="card">${html}</div>`; el.classList.add('show'); }
export function hideScreen(): void { $('screen').classList.remove('show'); }
