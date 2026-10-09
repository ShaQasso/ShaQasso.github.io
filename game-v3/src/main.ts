import './style.css';
import balance from './data/balance.json';
import { createState, diversity, chooseMeal, step } from './engine/sim';
import { allCells } from './engine/geometry';
import { Input } from './input';
import { Renderer } from './render/draw';
import { Hud, hideScreen, showScreen } from './ui/hud';
import type { State } from './engine/types';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas, renderer);
const hud = new Hud();

let state: State | null = null;
let seed = 0;
let acc = 0;
let last = performance.now();
let focus = 1;
let shown = false;

const SLOW = 0.3;

function startRun(forcedSeed?: number): void {
  seed = forcedSeed ?? ((Math.random() * 2 ** 31) | 0);
  state = createState(seed);
  acc = 0; focus = 1; shown = false;
  renderer.reset(); input.reset(); hud.reset();
  hideScreen();
}

function titleScreen(): void {
  showScreen(`
    <h1>MBIOTA</h1>
    <h2>You are the colony: a bubble of <i>Bacteroides</i> in the gut.</h2>
    <ul>
      <li><b>Drag a ring</b> to rotate it (or scroll, or ↑↓ to pick a ring and ←→ to turn it). Rings are heavy, so move with intent.</li>
      <li>Cells flip their coats <b>at random</b>. You can't choose a coat, only who faces what.</li>
      <li>A <b>phage</b> only infects cells wearing its receptor shape ◆ ● ▲ ■. Same-shape neighbours get hit next. Diversity is your firewall, and a spare block of one shape can soak up a wave.</li>
      <li><span class="b">Blue</span> cells calm the gut wall, <span class="r">red</span> cells inflame it. Park calming cells under the glowing patches.</li>
      <li>Pathogens slip in through holes. Antibiotics clear them, and your own cells too, so rotate them into the beam.</li>
      <li>Hold <b>Space</b> for slow-mo. Survive ${balance.director.acts} acts.</li>
    </ul>
    <button class="btn" id="go" type="button">Start</button> <span style="color:#7d8ba1;font-size:12px;margin-left:8px">Enter</span>`);
  document.getElementById('go')!.addEventListener('click', () => startRun());
}

function endScreen(s: State): void {
  const won = s.status === 'won';
  const cells = allCells(s).length;
  const d = Math.round(diversity(s) * 100);
  const grade = !won ? '—' : d > 70 ? 'A' : d > 55 ? 'B' : d > 40 ? 'C' : 'D';
  const text = `MBIOTA: ${won ? 'my colony survived' : 'my colony fell'} (${s.reason}) · ${Math.round(s.t)}s · ${cells} cells · diversity ${d}%  seed ${seed}`;
  showScreen(`
    <div class="big ${s.status}">${won ? 'The colony held' : 'The colony fell'}</div>
    <h2>${won ? `Survived all ${balance.director.acts} acts` : `Cause: ${s.reason}`}</h2>
    <div class="stats">
      <div><span>Time</span><br>${Math.round(s.t)} s</div><div><span>Cells</span><br>${cells}</div>
      <div><span>Diversity</span><br>${d}%${won ? ` (grade ${grade})` : ''}</div><div><span>Host health</span><br>${Math.round(s.health)}</div>
      <div><span>Cells lysed by phage</span><br>${s.stats.lysed}</div><div><span>Pathogens cleared</span><br>${s.stats.cleared}</div>
      <div><span>Coat flips</span><br>${s.stats.flips}</div><div><span>Seed</span><br>${seed}</div>
    </div>
    <button class="btn" id="again" type="button">Play again</button>
    <button class="btn alt" id="copy" type="button">Copy result</button>`);
  document.getElementById('again')!.addEventListener('click', () => startRun());
  document.getElementById('copy')!.addEventListener('click', (e) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    (e.target as HTMLElement).textContent = 'Copied';
  });
}

input.bind(() => state);
input.onStart = () => { if (!state || state.status !== 'run') startRun(); };
input.onMeal = (i) => { if (state) chooseMeal(state, i); };
hud.onMeal = input.onMeal;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const running = !!state && state.status === 'run';
  const slow = running && input.slow && focus > 0.02;
  if (running && state) {
    focus = slow ? Math.max(0, focus - dt * 0.25) : Math.min(1, focus + dt * 0.08);
    acc += dt * (slow ? SLOW : 1);
    while (acc >= balance.dt && state.status === 'run') {
      input.apply(state);
      step(state);
      acc -= balance.dt;
    }
  }
  if (state) {
    const hover = renderer.cellAt(state, input.pointer.x, input.pointer.y, acc);
    renderer.draw(state, running ? acc : 0, hover, input.selected, slow);
    hud.update(state, focus);
    hud.tooltip(state, input.pointer.inside && !input.dragging ? hover : null, input.pointer.x, input.pointer.y);
    if (state.status !== 'run' && !shown) { shown = true; endScreen(state); }
  } else {
    // title backdrop: a demo colony drifting behind the intro card
    if (!demo) demo = createState(7);
    demo.waves = []; demo.antibiotics = []; demo.gaps = [];
    demo.rings.forEach((r, k) => { r.cmd = k === 0 ? 0 : (k % 2 ? 0.15 : -0.15); });
    step(demo, balance.dt);
    if (demo.status !== 'run') demo = createState(7);
    renderer.draw(demo, 0, null, null, false);
  }
  requestAnimationFrame(frame);
}

let demo: State | null = null;
titleScreen();
requestAnimationFrame(frame);

// handy for tests and poking around in the console
(window as unknown as { __mbiota: unknown }).__mbiota = { start: startRun, get state() { return state; } };
