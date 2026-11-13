import balance from '../data/balance.json';
import { CARD } from '../engine/cards';
import { count, exposed } from '../engine/geometry';
import { coatThreshold, patches } from '../engine/sim';
import { score } from '../engine/score';
import type { State } from '../engine/types';
import { COLOUR_HEX, COLOUR_NAME, type Pick, type Renderer } from '../render/draw';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const B = balance;
const FAM: Record<string, string> = { food: 'Food', drug: 'Drug', motility: 'Motion' };
const ROLE = ['capsule type', 'capsule type', 'capsule type (PSA): calms the wall it faces'];
const LABEL = ['Yellow', 'Green', 'Blue · calms the wall'];
/** What each month adds, so there is always something new. */
export const NEW: Record<number, string> = { 2: 'flares', 3: 'two-colour phages', 4: 'faster phages', 5: 'stronger flares', 6: 'a second flare' };
const BIO: Record<number, string> = {
  1: 'Phages attack one type of capsule at a time, so a colony with several types is rarely wiped out.',
  2: 'Blue stands for a capsule like PSA of Bacteroides fragilis, which calms the immune system. In an inflamed gut, fewer bacteria make it.',
  3: 'Bacteria change capsule type by flipping short stretches of DNA, so one lineage can hold several types at once.',
  4: 'Diet moves the same switches: different carbohydrates favour different capsule states.',
  5: 'A thick mucus layer keeps bacteria and the gut wall apart. It thins when the gut is inflamed.',
};

/** Flat poster art for each card, built from a few shapes. */
function art(id: string): string {
  const d = (style: string) => `<div style="${style}"></div>`;
  switch (id) {
    case 'fibre': return `<div class="art" style="background:#0d0d0d">${d('left:50px;top:8px;width:84px;height:84px;border-radius:50%;border:4px dashed #eef3d4')}${d('left:68px;top:26px;width:48px;height:48px;border-radius:50%;background:#1d6fa5')}</div>`;
    case 'mucin': return `<div class="art" style="background:#f2b01e">${d('left:20px;top:44px;width:140px;height:140px;border-radius:50%;border:7px solid #0d0d0d')}${d('left:44px;top:68px;width:92px;height:92px;border-radius:50%;border:7px solid #0d0d0d')}${d('left:68px;top:92px;width:44px;height:44px;border-radius:50%;background:#0d0d0d')}</div>`;
    case 'starch': return `<div class="art" style="background:#1f7a52">${d('left:66px;top:20px;width:48px;height:58px;background:#eef3d4;clip-path:polygon(50% 0,100% 22%,100% 78%,50% 100%,0 78%,0 22%)')}${d('left:40px;top:45px;width:100px;height:9px;background:#0d0d0d;transform:rotate(-32deg)')}</div>`;
    case 'antibiotic': return `<div class="art" style="background:#d0392a">${d('left:55px;top:15px;width:70px;height:70px;border-radius:50%;background:#0d0d0d')}${d('left:14px;top:20px;width:16px;height:16px;border-radius:3px;background:#eef3d4')}${d('left:22px;top:62px;width:16px;height:16px;border-radius:3px;background:#f2b01e')}${d('left:146px;top:28px;width:16px;height:16px;border-radius:3px;background:#f2b01e')}${d('left:140px;top:66px;width:16px;height:16px;border-radius:3px;background:#eef3d4')}</div>`;
    case 'mesalamine': return `<div class="art" style="background:#0d0d0d">${d('left:10px;top:20px;width:160px;height:160px;border-radius:50%;background:#d0392a')}${d('left:35px;top:45px;width:110px;height:110px;border-radius:50%;background:#e0701f')}${d('left:60px;top:70px;width:60px;height:60px;border-radius:50%;background:#1d6fa5')}</div>`;
    default: return `<div class="art" style="background:#e0701f">${d('left:40px;top:0;width:100px;height:100px;border-radius:50%;border:6px solid #eef3d4')}${d('left:62px;top:22px;width:56px;height:56px;border-radius:50%;border:6px solid #eef3d4')}${d('left:82px;top:42px;width:16px;height:16px;border-radius:50%;background:#0d0d0d')}</div>`;
  }
}

export class Hud {
  onPick: (i: number) => void = () => {};
  onContinue: () => void = () => {};
  /** Drag-to-play: the game says whether the pointer is over a valid spot, and plays the card on drop. */
  onDragMove: (i: number, x: number, y: number) => void = () => {};
  onDrop: (i: number, x: number, y: number) => boolean = () => false;
  onDragEnd: () => void = () => {};
  private bannerT = 0;
  private seen = new Set<string>();
  private key = '';
  private lastCycle = 0;

  update(s: State): void {
    const n = count(s), wave = s.phase === 'wave';
    $('turn').textContent = `Month ${s.cycle} of ${B.cycles}`;
    $('phase').textContent = s.status !== 'run' ? '' : s.phase === 'groom' ? (s.pending ? '' : 'Choose one card. Drag it to where it should work.') : '';
    $('timer').style.display = wave ? 'block' : 'none';
    $('b-timer').style.width = `${Math.min(100, (s.waveT / s.waveLen) * 100)}%`;
    const fr = Math.min(1, s.inflammation / B.overload);
    $('b-infl').style.width = `${fr * 78}%`;
    $('b-infl').style.background = s.overloadT > 0 ? '#d0392a' : fr > 0.75 ? '#e0701f' : '';
    $('m-over').style.left = '78%';
    $('b-pop').style.width = `${Math.min(100, (n / B.capacity) * 100)}%`;
    $('pop-label').textContent = `Colony ${n} / ${B.capacity}`;
    $('score').textContent = String(score(s).total);
    this.patchPanel(s);

    // one prompt at a time, the first time each thing appears
    if (wave && s.cycle !== this.lastCycle) {
      this.lastCycle = s.cycle;
      if (s.cycle === 1) this.banner('Drag to turn the colony', 'Phages arrive in volleys and wait at the rim before they launch. A head colour is the cells it infects: turn so they land on a different colour.', 9);
      else if (s.flares.length && !this.seen.has('flare')) { this.seen.add('flare'); this.banner('A flare is coming', 'The orange arc heats the wall and sends immune cells that scrape a strip off the colony. Turn blue toward it and it pulses out to calm the wall, but the immune cells scrape whatever faces them.', 8); }
      else if (s.cycle === 3) this.banner('Two-colour phages', 'A head split in two colours infects both.', 6);
    }
    if (s.stats.coats > 0 && !this.seen.has('coat')) { this.seen.add('coat'); this.banner('Mucus coat', 'A big single-colour patch coated itself (pale edge). It blocks hits, but once it is chipped a bite takes far more.', 7); }
    if (this.bannerT > 0 && this.bannerT < 9000) { this.bannerT -= 1 / 60; if (this.bannerT <= 0) $('banner').classList.remove('show'); }

    this.screens(s);
  }

  /** The trade-off, always visible: a big single-colour patch grows a coat, but a bite into it is big. */
  private patchT = 0;
  private patchPanel(s: State): void {
    const el = $('patches');
    const show = s.status === 'run' && s.phase !== 'checkup';
    el.style.display = show ? '' : 'none';
    if (!show || performance.now() - this.patchT < 350) return;
    this.patchT = performance.now();
    const thr = Math.round(coatThreshold(s)), big = [0, 0, 0];
    for (const p of patches(s)) big[p.colour] = Math.max(big[p.colour], p.cells.length);
    const rows = [2, 0, 1].map((c) => { const on = big[c] >= thr; return `<div class="prow"><i style="background:${COLOUR_HEX[c]}"></i><div class="t"><span>${LABEL[c]}</span><em class="${on ? 'on' : ''}">${big[c]} · ${on ? 'coat, big bite' : 'no coat, small bite'}</em></div><div class="pbar"><b style="width:${Math.min(100, (big[c] / (2 * thr)) * 100)}%;background:${COLOUR_HEX[c]}"></b><u></u></div></div>`; }).join('');
    el.innerHTML = `<div class="h">Biggest patch of each type. At ${thr} cells a patch grows a coat that blocks hits, but a bite into it takes far more.</div>${rows}`;
  }

  banner(title: string, sub: string, secs: number): void { const b = $('banner'); b.innerHTML = `${title}<small>${sub}</small>`; b.classList.add('show'); this.bannerT = secs; }
  reset(): void { this.seen.clear(); this.lastCycle = 0; this.key = ''; $('banner').classList.remove('show'); $('hand').classList.remove('show'); $('summary').classList.remove('show'); }

  /** The hand (grooming) and the month summary (check-up). */
  private screens(s: State): void {
    const key = s.status !== 'run' ? 'end' : s.phase === 'groom' && s.pending ? `p|${s.pending.id}` : s.phase === 'groom' ? `g|${s.cycle}|${s.offer.join(',')}` : s.phase === 'checkup' ? `c|${s.cycle}` : 'w';
    if (key === this.key) return;
    this.key = key;
    const hand = $('hand'), sum = $('summary');
    hand.classList.remove('show'); sum.classList.remove('show');
    if (key === 'w' || key === 'end') { if (this.bannerT > 9000) { this.bannerT = 0; $('banner').classList.remove('show'); } return; }
    if (s.pending) {
      const card = CARD[s.pending.id];
      this.banner(card.name, s.pending.target === 'blob' ? 'Click the colony where it should work.' : 'Click the section of the wall to treat.', 9999);
      return;
    }
    $('banner').classList.remove('show'); this.bannerT = 0;
    if (s.phase === 'groom') {
      hand.innerHTML = s.offer.map((id, i) => { const c = CARD[id]; return `<div class="slot"><button class="pcard" type="button" data-i="${i}" aria-label="${c.name}: ${c.text}"><kbd>${i + 1}</kbd>${art(id)}<div class="body"><div class="fam">${FAM[c.family]}</div><div class="name">${c.name}</div><div class="txt">${c.text}</div></div></button></div>`; }).join('');
      hand.classList.add('show');
      hand.querySelectorAll<HTMLButtonElement>('.pcard').forEach((el) => this.draggable(el, Number(el.dataset.i)));
    } else if (s.phase === 'checkup') {
      const h = s.history[s.history.length - 1], thr = Math.round(coatThreshold(s)), peak = Math.round(h.peak * 100);
      const head = h.peak < 0.5 ? 'Remission holds.' : h.peak < 0.68 ? 'A rough month.' : 'A close call.';
      const row = (col: string, a: string, b: string) => `<div class="row"><i style="background:${col}"></i><div><b>${a}</b><span>${b}</span></div></div>`;
      sum.innerHTML = `<div><div class="k">Month ${s.cycle} of ${B.cycles}</div><h1>${head}</h1></div>
        <div class="rows">
          ${h.blocked > 0 ? row('#eef3d4', `${h.blocked} hit${h.blocked > 1 ? 's' : ''} stopped by a coat`, 'A big single-colour patch coated itself.') : row('#eef3d4', 'No coat this month', `A coat needs one patch of ${thr} cells in a single colour.`)}
          ${h.flares > 0 ? row('#1d6fa5', h.peak < B.overload * 0.85 ? 'The flare was kept in check' : 'The flare nearly got away', `Inflammation peaked at ${peak}%. Flare-out is at ${Math.round(B.overload * 100)}%.`) : row('#1d6fa5', 'No flare this month', `Inflammation peaked at ${peak}%.`)}
          ${row('#d0392a', `${h.lost} cells lost, ${h.births} grew back`, `${h.hits} phage hit${h.hits === 1 ? '' : 's'}${h.immune ? `, ${h.immune} cells scraped by immune cells` : ''}.`)}
        </div>
        ${BIO[s.cycle] ? `<div><div class="k" style="margin-bottom:6px">In the biology</div><div class="bio">${BIO[s.cycle]}</div></div>` : ''}
        <div class="go"><button class="btn" id="cont" type="button">Month ${s.cycle + 1}</button><span>${NEW[s.cycle + 1] ? `New this month: ${NEW[s.cycle + 1]}` : ''}</span></div>`;
      sum.classList.add('show');
      $('cont').addEventListener('click', () => this.onContinue());
    }
  }

  private draggable(el: HTMLButtonElement, i: number): void {
    let start: { x: number; y: number; left: number; top: number } | null = null, moved = false;
    el.addEventListener('pointerdown', (e) => { const r = el.getBoundingClientRect(); start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top }; moved = false; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true; el.classList.add('drag');
      // the card shrinks and hangs below the pointer, so the spot it will land on stays visible
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate(${e.clientX + 16 - start.left}px, ${e.clientY + 18 - start.top}px) rotate(-7deg) scale(0.6)`;
      this.onDragMove(i, e.clientX, e.clientY);
    });
    const end = (e: PointerEvent, cancel: boolean) => {
      if (!start) return;
      const played = moved && !cancel && this.onDrop(i, e.clientX, e.clientY);
      start = null; el.classList.remove('drag'); el.style.transform = ''; el.style.transformOrigin = '';
      this.onDragEnd();
      if (!moved && !cancel) this.banner('Drag the card', 'Pull it onto the colony or the wall and let go.', 3);
      if (played) $('hand').classList.remove('show');
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));
  }

  tooltip(s: State | null, h: Pick | null, r: Renderer, x: number, y: number): void {
    const el = $('tip');
    const c = s && h ? s.cells[(h.j + B.R) * (2 * B.R + 1) + (h.i + B.R)] : null;
    if (!s || !h || !c || s.phase !== 'wave') { el.style.display = 'none'; return; }
    const patch = r.patchOf(s, h.i, h.j).size, thr = Math.round(coatThreshold(s));
    el.innerHTML = `<b>${COLOUR_NAME[c.c]}</b> ${ROLE[c.c]}.<br>Patch of ${patch} cells. ${patch >= thr ? 'Big enough for a coat.' : `A coat needs ${thr}.`}${c.m > 0 ? '<br><b>Coated</b>' : ''}`;
    el.style.display = 'block'; el.style.left = `${Math.min(innerWidth - 260, x + 14)}px`; el.style.top = `${Math.min(innerHeight - 110, y + 14)}px`;
  }
}

export function showScreen(html: string): void { const el = $('screen'); el.innerHTML = `<div class="card">${html}</div>`; el.classList.add('show'); }
export function hideScreen(): void { $('screen').classList.remove('show'); }
void exposed;
