import './style.css';
import balance from './data/balance.json';
import { CARD } from './engine/cards';
import { count, eachCell } from './engine/geometry';
import { createState, nextCycle, pickCard, placeTarget, step } from './engine/sim';
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
let dragTarget: Target | null = null;

function startRun(forced?: number): void {
  seed = forced ?? ((Math.random() * 2 ** 31) | 0);
  state = createState(seed); acc = 0; shown = false; dragTarget = null;
  renderer.reset(); input.reset(); hud.reset(); hideScreen();
}

function titleScreen(): void {
  showScreen(`
    <h1>Mbiota</h1>
    <h2>You are the gut bacteria of someone with Crohn's disease. Keep the gut in remission for ${balance.cycles} months. It takes about five minutes.</h2>
    <ul>
      <li><i style="background:#eef3d4"></i><span><b>Between waves, garden.</b> Drag one card onto the colony or the gut wall: food grows one colour, drugs calm the wall or clear cells.</span></li>
      <li><i style="background:#d0392a"></i><span><b>In a wave, turn the colony.</b> Drag, scroll, or use A and D. Phages wait at the rim before they launch, and each infects only the colour of its head.</span></li>
      <li><i style="background:#1d6fa5"></i><span><b>Keep inflammation down.</b> Blue cells facing a hot part of the wall cool it. Too hot for too long ends the run.</span></li>
    </ul>
    <div><button class="btn" id="go" type="button">Start</button></div>`);
  document.getElementById('go')!.addEventListener('click', () => startRun());
}

/** Remission score: calm months, a surviving colony, and a colony that kept all three colours. */
function score(s: State): { total: number; calm: number; size: number; mix: number } {
  const calm = Math.round(s.history.reduce((a, h) => a + Math.max(0, 100 - h.peak * 100), 0));
  const n = count(s), by = [0, 0, 0];
  eachCell(s, (c) => { by[c.c]++; });
  const size = Math.round(n / 5), mix = n ? Math.round((Math.min(...by) / n) * 600) : 0;
  return { total: calm + size + mix, calm, size, mix };
}

function endScreen(s: State): void {
  const won = s.status === 'won', sc = score(s), done = won ? balance.cycles : s.cycle - 1;
  const text = `Mbiota: ${won ? `${balance.cycles} months in remission` : `flare-out in month ${s.cycle}`}, score ${sc.total}`;
  showScreen(`
    <div class="big">${won ? 'Remission.' : 'Flare-out.'}</div>
    <h2>${won ? `You kept the gut calm for ${balance.cycles} months.` : `Inflammation stayed too high in month ${s.cycle}.`}</h2>
    <div class="stats">
      <div><span>Remission score</span><br><b style="font-size:28px">${sc.total}</b></div><div><span>Months completed</span><br>${done} of ${balance.cycles}</div>
      <div><span>Calm months</span><br>${sc.calm}</div><div><span>Colony size</span><br>${sc.size}</div>
      <div><span>Colour mix</span><br>${sc.mix}</div><div><span>Cells left</span><br>${count(s)}</div>
    </div>
    <div><button class="btn" id="again" type="button">Play again</button><button class="btn alt" id="copy" type="button">Copy result</button></div>`);
  document.getElementById('again')!.addEventListener('click', () => startRun());
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
hud.onContinue = () => { if (state) nextCycle(state); };
hud.onDragMove = (i, x, y) => { dragTarget = state ? targetFor(state, i, x, y) : null; };
hud.onDragEnd = () => { dragTarget = null; };
hud.onDrop = (i, x, y) => {
  if (!state) return false;
  const t = targetFor(state, i, x, y); if (!t) return false;
  pickCard(state, i);
  if (state.pending) placeTarget(state, t.kind === 'blob' ? { i: t.i, j: t.j } : { sector: t.sector });
  return true;
};

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state && state.status === 'run' && state.phase === 'wave') {
    acc += dt;
    while (acc >= balance.dt && state.phase === 'wave' && state.status === 'run') { input.apply(state); step(state, balance.dt); acc -= balance.dt; }
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
(window as unknown as { __mbiota: unknown }).__mbiota = { start: startRun, get state() { return state; } };
