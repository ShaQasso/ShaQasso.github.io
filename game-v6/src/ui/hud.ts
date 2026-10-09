import balance from '../data/balance.json';
import { CARD } from '../engine/cards';
import { count, exposed } from '../engine/geometry';
import { COLOURS, baseInflammation, coatThreshold } from '../engine/sim';
import type { State } from '../engine/types';
import { COLOUR_HEX, COLOUR_NAME, type Pick, type Renderer } from '../render/draw';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const B = balance;
const FAM: Record<string, string> = { food: 'Food (carb source)', motility: 'Motility', drug: 'IBD treatment' };
const ROLE = ['mucus capsule: its coats last longest', 'phage-resistant capsule: damps cascades', 'immune-evasion capsule: treats flares, dodges immune cells'];

export class Hud {
  onPick: (i: number) => void = () => {};
  onContinue: () => void = () => {};
  private bannerT = 0;
  private seen = new Set<string>();
  private screenKey = '';
  private lastCycle = 0;

  update(s: State): void {
    const n = count(s), wave = s.phase === 'wave';
    $('turn').textContent = `MONTH ${s.cycle} / ${B.cycles}`;
    $('phase').textContent = s.phase === 'groom' ? `grooming ${B.picks - s.picksLeft + 1} of ${B.picks}` : s.phase === 'wave' ? 'the wave' : 'check-up';
    $('b-timer').style.width = wave ? `${(1 - s.waveT / s.waveLen) * 100}%` : '0%';
    $('b-infl').style.width = `${Math.min(100, (s.inflammation / B.overload) * 90)}%`;
    $('b-infl').style.background = s.overloadT > 0 ? '#ef4444' : '';
    $('m-over').style.left = '90%';
    $('b-pop').style.width = `${Math.min(100, (n / B.capacity) * 100)}%`;
    $('m-min').style.left = `${(B.lose.minCells / B.capacity) * 100}%`;
    $('pop-label').textContent = `Blob ${n} / ${B.capacity}`;

    const held = $<HTMLButtonElement>('held');
    if (s.held) { const c = CARD[s.held.id]; $('held-name').textContent = `${c.name} ×${s.held.charges}`; held.disabled = !wave; held.classList.toggle('ready', wave); }
    else { $('held-name').textContent = 'no held card'; held.disabled = true; held.classList.remove('ready'); }
    const chips = s.mods.filter((m) => CARD[m.id]?.family).map((m) => `<span><b>${CARD[m.id].name}</b> ${m.left} wave${m.left > 1 ? 's' : ''}</span>`);
    for (const st of s.sites) chips.push(`<span style="border-color:${COLOUR_HEX[st.colour]}"><b>${COLOUR_NAME[st.colour]} feed</b> ${st.left} wave${st.left > 1 ? 's' : ''}</span>`);
    for (const w of s.wallSites) chips.push(`<span style="border-color:#facc15"><b>Wall treatment</b> ${w.left} wave${w.left > 1 ? 's' : ''}</span>`);
    if (s.drift > 0.005) chips.push(`<span>baseline <b>+${Math.round(s.drift * 100)}%</b></span>`);
    $('chips').innerHTML = chips.join('');

    // teaching banners
    if (wave && s.cycle !== this.lastCycle) {
      this.lastCycle = s.cycle;
      if (s.cycle === 1) this.banner('MONTH 1', 'Phages come from every side, each hunting one colour. Drag to turn the blob so they meet the wrong one. Big same-colour patches grow a gold mucus coat.', 8);
      else if (s.flares.length && !this.seen.has('flare')) { this.seen.add('flare'); this.banner('A FLARE IS COMING', 'The red arc on the wall will heat up and fire white immune cells. Violet pixels facing the hot spot cool it (gold halo). Turn violet toward it.', 8); }
      else if (s.abx.length && !this.seen.has('abx')) { this.seen.add('abx'); this.banner('ANTIBIOTIC COURSE', 'A yellow wedge kills the outer layers inside it, whatever the colour. Turn weak spots away, or coat them.', 7); }
    }
    if (s.stats.coats > 0 && !this.seen.has('coat')) { this.seen.add('coat'); this.banner('MUCUS COAT', 'A really big patch coated itself (gold outline). Hits chip the coat, and a chipped coat takes a while to regrow. Big patches shield you, but a bite into one is large.', 7); }
    if (this.bannerT > 0) { this.bannerT -= 1 / 60; if (this.bannerT <= 0) $('banner').classList.remove('show'); }

    this.screens(s);
  }

  banner(title: string, sub: string, secs: number): void { const b = $('banner'); b.innerHTML = `${title}<small>${sub}</small>`; b.classList.add('show'); this.bannerT = secs; }
  reset(): void { this.seen.clear(); this.lastCycle = 0; this.screenKey = ''; $('banner').classList.remove('show'); }

  private status(s: State): string {
    return `Blob <b>${count(s)}</b> px · inflammation <b>${Math.round(s.inflammation * 100)}%</b> (baseline ${Math.round(baseInflammation(s) * 100)}%) · held: <b>${s.held ? CARD[s.held.id].name : 'none'}</b>`;
  }

  /** Grooming (pick a card) and check-up (continue) overlays. */
  private screens(s: State): void {
    const key = s.status !== 'run' ? 'end' : s.phase === 'groom' && s.pending ? `p|${s.pending.id}` : s.phase === 'groom' ? `g|${s.cycle}|${s.picksLeft}|${s.offer.join(',')}` : s.phase === 'checkup' ? `c|${s.cycle}` : 'w';
    if (key === this.screenKey) return;
    this.screenKey = key;
    const el = $('screen');
    if (key === 'w' || key === 'end') { if (key === 'w') el.classList.remove('show'); return; }
    if (s.pending) {
      el.classList.remove('show');
      const card = CARD[s.pending.id];
      this.banner(`${card.name.toUpperCase()}: CHOOSE A SITE`, s.pending.target === 'blob' ? `Click on the blob where the food goes. A small spot turns ${COLOUR_NAME[card.colour ?? 0].toLowerCase()} now and the area keeps growing ${COLOUR_NAME[card.colour ?? 0].toLowerCase()} for ${B.site.waves} waves.` : `Click a stretch of the gut wall to treat. It is cooled strongly there for ${B.site.wallWaves} waves.`, 9999);
      return;
    }
    if (s.phase === 'groom') {
      $('banner').classList.remove('show'); this.bannerT = 0;
      const cards = s.offer.map((id, i) => { const c = CARD[id]; return `<button class="pick ${c.family}" data-i="${i}"><kbd>${i + 1}</kbd><div class="fam">${FAM[c.family]}${c.held ? ' · held' : ''}</div><b>${c.name}</b><span>${c.text}</span></button>`; }).join('');
      el.innerHTML = `<div class="card wide"><h1 style="font-size:20px;letter-spacing:.12em">MONTH ${s.cycle} · GROOMING</h1>
        <h2>Pick ${s.picksLeft === B.picks ? 'your first' : 'your second'} card (${B.picks - s.picksLeft + 1} of ${B.picks}). Food and motility cards last a few waves; a held card is used with Space during the wave.</h2>
        <div class="hand">${cards}</div><div class="status">${this.status(s)}</div></div>`;
      el.classList.add('show');
      el.querySelectorAll<HTMLButtonElement>('.pick').forEach((b) => b.addEventListener('click', () => this.onPick(Number(b.dataset.i))));
    } else if (s.phase === 'checkup') {
      const h = s.history[s.history.length - 1];
      el.innerHTML = `<div class="card"><h1 style="font-size:20px;letter-spacing:.12em">MONTH ${s.cycle} · CHECK-UP</h1>
        <h2>${h.peak < 0.5 ? 'A quiet month. The wall held.' : h.peak < 0.68 ? 'A rough month, but you kept it in check.' : 'A close call. The disease nearly won.'}</h2>
        <div class="stats"><div><span>Peak inflammation</span><br>${Math.round(h.peak * 100)}% (flare-out at ${Math.round(B.overload * 100)}%)</div><div><span>Pixels lost</span><br>${h.lost}</div>
        <div><span>Phage hits</span><br>${h.hits}</div><div><span>Immune cell bites</span><br>${h.immune}</div>
        <div><span>Antibiotic kills</span><br>${h.abx}</div><div><span>Mucus coats grown</span><br>${h.coats}</div></div>
        <div class="status">Chronic disease: the baseline creeps up a little every month. ${this.status(s)}</div>
        <button class="btn" id="cont" type="button">Next month</button> <span style="color:#7d8ba1;font-size:12px;margin-left:8px">Enter</span></div>`;
      el.classList.add('show');
      $('cont').addEventListener('click', () => this.onContinue());
    }
  }

  tooltip(s: State | null, h: Pick | null, r: Renderer, x: number, y: number): void {
    const el = $('tip');
    const c = s && h ? s.cells[(h.j + B.R) * (2 * B.R + 1) + (h.i + B.R)] : null;
    if (!s || !h || !c || s.phase !== 'wave') { el.style.display = 'none'; return; }
    const patch = r.patchOf(s, h.i, h.j).size, co = COLOURS[c.c], thr = Math.round(coatThreshold(s));
    const role = ROLE[c.c];
    el.innerHTML = `<b style="color:${COLOUR_HEX[c.c]}">${COLOUR_NAME[c.c]}</b> · ${role}<br>Patch of <b>${patch}</b> same-colour pixels · ${patch >= thr ? '<b style="color:#fde047">big enough for a mucus coat</b>' : `a coat needs ${thr}`}${patch >= 150 ? ' <b style="color:#fca5a5">(a hit takes a big bite)</b>' : ''}<br>${exposed(s, h.i, h.j) ? 'On the surface' : 'Inside the blob'} · resist ${Math.round(co.resist * 100)}% · evasion ${Math.round(co.evade * 100)}% · cooling ${Math.round(co.anti * 100)}%${c.m > 0 ? '<br><b style="color:#fde047">Coated</b>' : ''}`;
    el.style.display = 'block'; el.style.left = `${Math.min(innerWidth - 250, x + 14)}px`; el.style.top = `${Math.min(innerHeight - 130, y + 14)}px`;
  }
}

export function showScreen(html: string): void { const el = $('screen'); el.innerHTML = `<div class="card">${html}</div>`; el.classList.add('show'); }
export function hideScreen(): void { $('screen').classList.remove('show'); }
