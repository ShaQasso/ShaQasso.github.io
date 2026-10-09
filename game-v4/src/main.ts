import './style.css';
import balance from './data/balance.json';
import { count } from './engine/geometry';
import { createState, diversity, step } from './engine/sim';
import { Input } from './input';
import { Renderer } from './render/draw';
import { Hud, hideScreen, showScreen } from './ui/hud';
import type { State } from './engine/types';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas, renderer);
const hud = new Hud();

let state: State | null = null;
let demo: State | null = null;
let seed = 0, acc = 0, last = performance.now(), focus = 1, shown = false;
const SLOW = 0.3;

function startRun(forcedSeed?: number): void {
  seed = forcedSeed ?? ((Math.random() * 2 ** 31) | 0);
  state = createState(seed);
  acc = 0; focus = 1; shown = false;
  renderer.reset(); input.reset(); hud.reset(); hideScreen();
}

function titleScreen(): void {
  showScreen(`
    <h1>MBIOTA</h1>
    <h2>You are a living blob of <i>Bacteroides</i>. The world chips at it from every side.</h2>
    <ul>
      <li><b>Drag</b> to turn the whole blob (or scroll, or A/D). It is heavy, so turn with intent. Threats come from fixed directions, so turning decides which side takes the hit.</li>
      <li>You can't pick colours. <b>Sacrifice what faces the wave</b> and the survivors regrow into the gap, shifting your mix.</li>
      <li>A phage only infects the colour it wears (<span class="sw" style="background:#fbbf24"></span>amber, <span class="sw" style="background:#22d3ee"></span>cyan, <span class="sw" style="background:#a78bfa"></span>violet) and hits the first block it meets. The burst then spreads through <b>same-colour neighbours</b>. Big patches die, a different colour is a firewall.</li>
      <li><b>Space</b> secretes a mucus shield that blocks phages for a moment, and cools the gut wall. A uniform outer layer, and more amber, make the shield last longer. But a uniform blob dies to one matching phage. Hedge your bets.</li>
      <li>Cyan resists cascades, violet survives inflammation and cools better, amber makes mucus. Each grows at a different pace. Hover any block to see its patch.</li>
      <li>Hold <b>Shift</b> for slow-mo. The blob can't outgrow its capacity. Survive ${balance.director.acts} acts.</li>
    </ul>
    <button class="btn" id="go" type="button">Start</button> <span style="color:#7d8ba1;font-size:12px;margin-left:8px">Enter</span>`);
  document.getElementById('go')!.addEventListener('click', () => startRun());
}

function endScreen(s: State): void {
  const won = s.status === 'won';
  const n = count(s), d = Math.round(diversity(s) * 100);
  const text = `MBIOTA: my blob ${won ? 'survived' : 'fell'} (${s.reason}) · ${Math.round(s.t)}s · ${n} blocks · diversity ${d}%  seed ${seed}`;
  showScreen(`
    <div class="big ${s.status}">${won ? 'The blob held' : 'The blob fell'}</div>
    <h2>${won ? `Survived all ${balance.director.acts} acts` : `Cause: ${s.reason}`}</h2>
    <div class="stats">
      <div><span>Time</span><br>${Math.round(s.t)} s</div><div><span>Blocks left</span><br>${n}</div>
      <div><span>Diversity</span><br>${d}%</div><div><span>Host health</span><br>${Math.round(s.health)}</div>
      <div><span>Phage hits</span><br>${s.stats.hits}</div><div><span>Blocks burst</span><br>${s.stats.lysed}</div>
      <div><span>Phages stopped by mucus</span><br>${s.stats.blocked}</div><div><span>Times secreted</span><br>${s.stats.secretes}</div>
    </div>
    <button class="btn" id="again" type="button">Play again</button>
    <button class="btn alt" id="copy" type="button">Copy result</button>
    <div style="color:#7d8ba1;font-size:12px;margin-top:10px">seed ${seed}</div>`);
  document.getElementById('again')!.addEventListener('click', () => startRun());
  document.getElementById('copy')!.addEventListener('click', (e) => { navigator.clipboard?.writeText(text).catch(() => {}); (e.target as HTMLElement).textContent = 'Copied'; });
}

input.bind(() => state);
input.onStart = () => { if (!state || state.status !== 'run') startRun(); };

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const running = !!state && state.status === 'run';
  const slow = running && input.slow && focus > 0.02;
  if (running && state) {
    focus = slow ? Math.max(0, focus - dt * 0.25) : Math.min(1, focus + dt * 0.08);
    acc += dt * (slow ? SLOW : 1);
    while (acc >= balance.dt && state.status === 'run') { input.apply(state); step(state); acc -= balance.dt; }
  }
  if (state) {
    const hover = input.pointer.inside && !input.dragging ? renderer.pick(state, input.pointer.x, input.pointer.y) : null;
    renderer.draw(state, running ? acc : 0, hover, slow);
    hud.update(state, focus);
    hud.tooltip(state, hover, renderer, input.pointer.x, input.pointer.y);
    if (state.status !== 'run' && !shown) { shown = true; endScreen(state); }
  } else {
    if (!demo) demo = createState(7);
    demo.volleys = []; demo.abx = []; demo.flares = []; demo.cmd = 0.12;
    step(demo, balance.dt);
    if (demo.status !== 'run') demo = createState(7);
    renderer.draw(demo, 0, null, false);
  }
  requestAnimationFrame(frame);
}

titleScreen();
requestAnimationFrame(frame);
(window as unknown as { __mbiota: unknown }).__mbiota = { start: startRun, get state() { return state; } };
