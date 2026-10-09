import balance from '../data/balance.json';
import { count, exposed, eachCell } from '../engine/geometry';
import { COLOURS, diversity, secreteReady, surfaceStats } from '../engine/sim';
import type { State } from '../engine/types';
import { COLOUR_HEX, COLOUR_NAME, COLOUR_TRAIT, type Pick, type Renderer } from '../render/draw';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const B = balance;

const ACT_NOTES = [
  ['ACT 1', 'Phages hunt one colour. Turn the blob so they meet the wrong one'],
  ['ACT 2', 'Antibiotics kill anything on the outside. Flares heat the wall. Phages may hunt two colours'],
  ['ACT 3', 'Bigger volleys. Big same-colour patches burst. Mix it up, or bet on the shield'],
  ['FINAL ACT', 'Everything at once'],
];

export class Hud {
  private bannerT = 0;
  private lastAct = -1;
  private lastGap = false;

  update(s: State, focus: number): void {
    const act = Math.min(B.director.acts - 1, Math.floor(s.t / (B.director.actLen + B.director.gapLen)));
    const inGap = s.gaps.some((g) => s.t >= g.start && s.t < g.end);
    const m = Math.floor(s.t / 60), sec = Math.floor(s.t % 60).toString().padStart(2, '0');
    $('act').textContent = `${inGap ? 'CALM GAP' : `ACT ${act + 1}/${B.director.acts}`} · ${m}:${sec}`;
    const n = count(s);
    $('b-health').style.width = `${s.health}%`;
    $('b-health').style.background = s.health < 30 ? '#ef4444' : s.health < 55 ? '#f59e0b' : '#34d399';
    $('b-infl').style.width = `${Math.round(s.inflammation * 100)}%`;
    $('b-pop').style.width = `${Math.min(100, (n / B.capacity) * 100)}%`;
    $('pop-label').textContent = `Blob ${n} / ${B.capacity}`;
    $('b-focus').style.width = `${Math.round(focus * 100)}%`;

    const btn = $<HTMLButtonElement>('secrete');
    const ready = secreteReady(s);
    btn.disabled = !ready; btn.classList.toggle('ready', ready);
    $('sec-label').textContent = ready ? 'SECRETE' : `RECOVERING ${Math.ceil(s.secreteCd)}s`;
    $('sec-cd').style.width = `${ready ? 0 : (s.secreteCd / B.secrete.cooldown) * 100}%`;
    const st = surfaceStats(s);
    const dur = B.secrete.baseMucus + B.secrete.mucusGain * st.mucusPower * (0.4 + 0.6 * st.uniformity);
    const cool = B.secrete.baseCool + B.secrete.coolGain * st.evadePower;
    const top = st.share.indexOf(Math.max(...st.share));
    $('sec-info').innerHTML = s.mucus > 0
      ? `<b>Shield up</b> ${s.mucus.toFixed(1)}s`
      : `shield <b>${dur.toFixed(1)}s</b> · cooling <b>-${Math.round(cool * 100)}%</b> · outside: <b style="color:${COLOUR_HEX[top]}">${Math.round(st.share[top] * 100)}% ${COLOUR_NAME[top].toLowerCase()}</b>`;

    if (act !== this.lastAct && !inGap) { this.lastAct = act; this.banner(ACT_NOTES[act][0], ACT_NOTES[act][1], 3.4); }
    if (inGap && !this.lastGap) this.banner('CALM GAP', 'The host heals a little. The blob regrows', 3);
    this.lastGap = inGap;
    if (this.bannerT > 0) { this.bannerT -= 1 / 60; if (this.bannerT <= 0) $('banner').classList.remove('show'); }
  }

  banner(title: string, sub: string, secs: number): void {
    const b = $('banner'); b.innerHTML = `${title}<small>${sub}</small>`; b.classList.add('show'); this.bannerT = secs;
  }

  reset(): void { this.lastAct = -1; this.lastGap = false; $('banner').classList.remove('show'); }

  tooltip(s: State | null, h: Pick | null, r: Renderer, x: number, y: number): void {
    const el = $('tip');
    const c = s && h ? s.cells[(h.j + B.R) * (2 * B.R + 1) + (h.i + B.R)] : null;
    if (!s || !h || !c) { el.style.display = 'none'; return; }
    const patch = r.patchOf(s, h.i, h.j).size;
    const co = COLOURS[c.c];
    el.innerHTML = `<b style="color:${COLOUR_HEX[c.c]}">${COLOUR_NAME[c.c]}</b> · ${COLOUR_TRAIT[c.c]}<br>`
      + `Patch of <b>${patch}</b> same-colour blocks${patch >= 12 ? ' <b style="color:#fca5a5">(a hit here would spread far)</b>' : ''}<br>`
      + `${exposed(s, h.i, h.j) ? 'On the surface' : 'Inside the blob'} · resist ${Math.round(co.resist * 100)}% · evasion ${Math.round(co.evade * 100)}%`
      + (c.inf > 0 ? '<br><b style="color:#e9d5ff">Infected</b>' : '');
    el.style.display = 'block';
    el.style.left = `${Math.min(innerWidth - 250, x + 14)}px`;
    el.style.top = `${Math.min(innerHeight - 120, y + 14)}px`;
  }
}

export function showScreen(html: string): void {
  const el = $('screen'); el.innerHTML = `<div class="card">${html}</div>`; el.classList.add('show');
}
export function hideScreen(): void { $('screen').classList.remove('show'); }
void eachCell; void diversity;
