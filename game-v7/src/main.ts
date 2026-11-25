import './style.css';
import balance from './data/balance.json';
import { CARD } from './engine/cards';
import { count } from './engine/geometry';
import { score } from './engine/score';
import { Recorder, dailySeed, todayUTC } from './engine/replay';
import { createState, step } from './engine/sim';
import { Input } from './input';
import { COLOUR_NAME, Renderer, type Target } from './render/draw';
import { Hud, hideScreen, showScreen } from './ui/hud';
import type { State } from './engine/types';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas, renderer);
const hud = new Hud();

let state: State | null = null, demo: State | null = null;
let seed = 0, acc = 0, last = performance.now(), shown = false;
/** Today's gut: everyone plays the same world on the same date (UTC). Free play: a new world every time. */
let mode: 'daily' | 'free' = 'daily', day = todayUTC();
let rec = new Recorder();
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
let dragTarget: Target | null = null;

function startRun(m: 'daily' | 'free' = mode, forced?: number): void {
  mode = m; day = todayUTC();
  seed = forced ?? (mode === 'daily' ? dailySeed(day) : (Math.random() * 2 ** 31) >>> 0);
  state = createState(seed); rec = new Recorder(); acc = 0; shown = false; dragTarget = null;
  renderer.reset(); input.reset(); hud.reset(); hideScreen();
}

function titleScreen(): void {
  showScreen(`
    <div class="kick">Mbiota</div>
    <h1>Remission</h1>
    <h2>You are the <i>Bacteroides</i> of someone with Crohn's disease. Keep the gut in remission for ${balance.cycles} months. It takes about five minutes.</h2>
    <ul>
      <li><i style="background:#f2ebdc"></i><span><b>Between waves, garden.</b> Drag one card onto the colony or the gut wall: food grows one colour, drugs calm the wall or clear cells.</span></li>
      <li><i style="background:#d0392a"></i><span><b>In a wave, turn the colony.</b> Drag, scroll, or use A and D. Phages come in volleys, wait at the rim before they launch, and infect only the colour of their head.</span></li>
      <li><i style="background:#1d6fa5"></i><span><b>Blue calms the wall.</b> Turn blue toward a hot part of the wall and it pulses out to cool it. Too hot for too long ends the run.</span></li>
      <li><i style="background:#1f7a52"></i><span><b>Each colour has a job.</b> Yellow resists immune cells. Green slows flares: the more green, the slower they build.</span></li>
      <li><i style="background:#f2b01e"></i><span><b>Big patch or mixed?</b> A big patch of one colour grows a coat that blocks hits, but a bite into it takes far more. Your score rewards calm months and keeping all three colours.</span></li>
    </ul>
    <div><span class="chipd">Today's gut · ${dayLabel(todayUTC())} · the same for everyone</span></div>
    <div><button class="btn" id="go" type="button">Play today's gut</button><button class="btn alt" id="free" type="button">Free play</button></div>`);
  document.getElementById('go')!.addEventListener('click', () => startRun('daily'));
  document.getElementById('free')!.addEventListener('click', () => startRun('free'));
}

/** The best score is a per-browser convenience; the game works the same without it. */
function best(total: number): { best: number; isNew: boolean } {
  let prev = 0;
  try { prev = Number(localStorage.getItem('mbiota-best') || 0); } catch { /* storage unavailable */ }
  const isNew = total > prev;
  if (isNew) { try { localStorage.setItem('mbiota-best', String(total)); } catch { /* ignore */ } }
  return { best: Math.max(prev, total), isNew };
}

function endScreen(s: State): void {
  const won = s.status === 'won', sc = score(s), b = best(sc.total);
  const months = won ? s.cycle : s.cycle - 1, longest = Math.max(0, ...s.history.map((h) => h.streak ?? 0));
  const where = mode === 'daily' ? `today's gut, ${dayLabel(day)}` : 'free play';
  const text = `Mbiota: Remission · ${where} · ${won ? `remission in ${s.cycle} months` : s.endless ? `remission, then flare-out in month ${s.cycle}` : `flare-out in month ${s.cycle}`} · score ${sc.total}`;
  showScreen(`
    <div class="kick">${mode === 'daily' ? `Today's gut · ${dayLabel(day)}` : 'Free play'}</div>
    <div class="big">${won ? 'Remission.' : 'Flare-out.'}</div>
    <h2>${won ? `You kept the gut calm for ${s.cycle} months. Keep going to build your score: each month past remission is harder, and calm streaks still multiply.` : s.endless ? `You held remission and kept going until month ${s.cycle}.` : `Inflammation stayed too high in month ${s.cycle}.`}</h2>
    <div class="stats">
      <div><span>Remission score${b.isNew ? ' · new best' : ''}</span><br><b style="font-size:28px">${sc.total}</b></div><div><span>Best score</span><br><b style="font-size:28px">${b.best}</b></div>
      <div><span>Months completed</span><br>${months}</div><div><span>Longest calm streak</span><br>${longest}</div>
      <div><span>Calm months (with streak bonus)</span><br>${sc.calm}</div><div><span>Colony size + colour mix</span><br>${sc.size} + ${sc.mix}</div>
    </div>
    <div>${won ? '<button class="btn" id="more" type="button">Keep going</button>' : ''}<button class="btn${won ? ' alt' : ''}" id="again" type="button">Play again</button>${mode === 'daily' ? '<button class="btn alt" id="free" type="button">Free play</button>' : ''}<button class="btn alt" id="copy" type="button">Copy result</button></div>`);
  document.getElementById('more')?.addEventListener('click', () => { if (state && rec.more(state)) { hideScreen(); shown = false; } });
  document.getElementById('again')!.addEventListener('click', () => startRun(mode));
  document.getElementById('free')?.addEventListener('click', () => startRun('free'));
  document.getElementById('copy')!.addEventListener('click', (e) => { navigator.clipboard?.writeText(text).then(() => { (e.target as HTMLElement).textContent = 'Copied'; }).catch(() => { (e.target as HTMLElement).textContent = text; }); });
}

/** Where a dragged card would land, or null if the pointer is not over a valid spot. */
function targetFor(s: State, i: number, x: number, y: number): Target | null {
  const card = CARD[s.offer[i]]; if (!card || s.phase !== 'groom' || s.pending) return null;
  const d = renderer.distOf(x, y);
  if (!card.target) return d < balance.wallR + 8 ? { kind: 'any', text: 'Cools the whole wall' } : null;
  if (card.target === 'blob') {
    const p = renderer.pick(s, x, y); if (!p) return null;
    return card.effect === 'abx' ? { kind: 'blob', i: p.i, j: p.j, clear: true, text: 'Clears these cells' } : { kind: 'blob', i: p.i, j: p.j, colour: card.colour, text: `${COLOUR_NAME[card.colour ?? 0]} grows here` };
  }
  if (d > renderer.blobRadius(s) + 3 && d < balance.wallR + 8) return { kind: 'wall', sector: renderer.sectorAt(x, y), text: 'Cooler this wave' };
  return null;
}

input.bind(() => state);
input.onStart = () => { if (!state || state.status !== 'run') startRun(); };
input.actions = { pick: (s, i) => rec.pick(s, i), place: (s, t) => rec.place(s, t), next: (s) => rec.next(s) };
hud.onContinue = () => { if (state) rec.next(state); };
hud.onDragMove = (i, x, y) => { dragTarget = state ? targetFor(state, i, x, y) : null; };
hud.onDragEnd = () => { dragTarget = null; };
hud.onDrop = (i, x, y) => {
  if (!state) return false;
  const t = targetFor(state, i, x, y); if (!t) return false;
  rec.pick(state, i);
  if (state.pending) rec.place(state, t.kind === 'blob' ? { i: t.i, j: t.j } : { sector: t.sector });
  return true;
};

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state && state.status === 'run' && state.phase === 'wave') {
    acc += dt;
    while (acc >= balance.dt && state.phase === 'wave' && state.status === 'run') { const before = state.cmd; input.apply(state); rec.turn(before, state.cmd); step(state, balance.dt); rec.stepped(); acc -= balance.dt; }
  } else acc = 0;
  if (state) {
    const hover = input.pointer.inside && !input.dragging ? renderer.pick(state, input.pointer.x, input.pointer.y) : null;
    renderer.target = dragTarget;
    if (state.pending && input.pointer.inside) { // keyboard pick: choose the spot with a click
      const card = CARD[state.pending.id];
      if (state.pending.target === 'blob') { if (hover) renderer.target = { kind: 'blob', i: hover.i, j: hover.j, colour: card.colour, clear: card.effect === 'abx' }; }
      else if (renderer.distOf(input.pointer.x, input.pointer.y) > renderer.blobRadius(state) + 3) renderer.target = { kind: 'wall', sector: renderer.sectorAt(input.pointer.x, input.pointer.y) };
    }
    renderer.draw(state, acc, state.phase === 'wave' ? hover : null);
    hud.update(state);
    hud.tooltip(state, hover, renderer, input.pointer.x, input.pointer.y);
    if (state.status !== 'run' && !shown) { shown = true; endScreen(state); }
  } else {
    if (!demo) { demo = createState(7); demo.phase = 'wave'; demo.status = 'won'; }
    demo.theta += dt * 0.2;
    renderer.draw(demo, 0, null);
  }
  requestAnimationFrame(frame);
}

titleScreen();
requestAnimationFrame(frame);
(window as unknown as { __mbiota: unknown }).__mbiota = { start: startRun, get state() { return state; }, get run() { return { mode, day, seed, moves: rec.moves }; } };
