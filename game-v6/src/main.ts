import './style.css';
import balance from './data/balance.json';
import { count } from './engine/geometry';
import { createState, nextCycle, pickCard, step } from './engine/sim';
import { Input } from './input';
import { Renderer } from './render/draw';
import { Hud, hideScreen, showScreen } from './ui/hud';
import type { State } from './engine/types';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas, renderer);
const hud = new Hud();

let state: State | null = null, demo: State | null = null;
let seed = 0, acc = 0, last = performance.now(), shown = false;

function startRun(forced?: number): void {
  seed = forced ?? ((Math.random() * 2 ** 31) | 0);
  state = createState(seed); acc = 0; shown = false;
  renderer.reset(); input.reset(); hud.reset(); hideScreen();
}

function titleScreen(): void {
  showScreen(`
    <h1>MBIOTA</h1>
    <h2>You are the <i>Bacteroides</i> of a patient with Crohn's disease. Keep the gut in remission for a year.</h2>
    <ul>
      <li>Each month has two parts. <b>Grooming</b>: pick cards, calmly (a carb source, a way to turn better, or an IBD treatment). Then <b>the wave</b>: a real-time stretch where the disease attacks.</li>
      <li><b>One control in a wave: turn the blob</b> (drag, scroll, or A/D). Phages come from every side, coloured like the pixels they hunt (<span class="sw" style="background:#fbbf24"></span>amber, <span class="sw" style="background:#22d3ee"></span>cyan, <span class="sw" style="background:#a78bfa"></span>violet). A bite spreads through same-colour neighbours, so staying mixed keeps bites small.</li>
      <li><b>Cooling is passive and directional.</b> The wall is cooled by the anti-inflammatory pixels <i>facing</i> it, best at the edge, violet most (the gold halo shows it). When a flare heats an arc of the wall, turn violet toward it, and mind the phages.</li>
      <li>A single-colour patch that is <b>really big</b> grows a gold <b>mucus coat</b> that soaks up hits. Big patches shield you, but a bite into one is large.</li>
      <li>You can hold <b>one card</b> and use it with <b>Space</b> in a wave (a steroid, a mucus burst, or <b>Ring turn</b> to turn the outer band against the core and reshape the blob).</li>
      <li>The disease is chronic: the baseline creeps up every month. Lose to a <b>flare-out</b> (sustained inflammation overload). Survive ${balance.cycles} months.</li>
    </ul>
    <button class="btn" id="go" type="button">Start</button> <span style="color:#7d8ba1;font-size:12px;margin-left:8px">Enter</span>`);
  document.getElementById('go')!.addEventListener('click', () => startRun());
}

function endScreen(s: State): void {
  const won = s.status === 'won', n = count(s);
  const best = Math.max(0, ...s.history.map((h) => h.peak));
  const text = `MBIOTA: ${won ? 'a year in remission' : `flare-out in month ${s.cycle}`} · ${n} pixels · worst month ${Math.round(best * 100)}% inflammation  seed ${seed}`;
  showScreen(`
    <div class="big ${s.status}">${won ? 'A year in remission' : s.reason.startsWith('flare') ? 'Flare-out' : 'The community collapsed'}</div>
    <h2>${won ? `You kept the gut calm for ${balance.cycles} months.` : `It ended in month ${s.cycle}: ${s.reason}.`}</h2>
    <div class="stats">
      <div><span>Months</span><br>${won ? balance.cycles : s.cycle - 1} completed</div><div><span>Pixels left</span><br>${n}</div>
      <div><span>Worst month</span><br>${Math.round(best * 100)}% inflammation</div><div><span>Cards picked</span><br>${s.stats.cards}</div>
      <div><span>Phage hits</span><br>${s.stats.hits}</div><div><span>Pixels burst</span><br>${s.stats.lysed}</div>
      <div><span>Immune bites</span><br>${s.stats.immuneKilled}</div><div><span>Coats grown</span><br>${s.stats.coats}</div>
    </div>
    <button class="btn" id="again" type="button">Play again</button>
    <button class="btn alt" id="copy" type="button">Copy result</button>
    <div style="color:#7d8ba1;font-size:12px;margin-top:10px">seed ${seed}</div>`);
  document.getElementById('again')!.addEventListener('click', () => startRun());
  document.getElementById('copy')!.addEventListener('click', (e) => { navigator.clipboard?.writeText(text).catch(() => {}); (e.target as HTMLElement).textContent = 'Copied'; });
}

input.bind(() => state);
input.onStart = () => { if (!state || state.status !== 'run') startRun(); };
hud.onPick = (i) => { if (state) pickCard(state, i); };
hud.onContinue = () => { if (state) nextCycle(state); };

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state && state.status === 'run' && state.phase === 'wave') {
    acc += dt;
    while (acc >= balance.dt && state.phase === 'wave' && state.status === 'run') { input.apply(state); step(state, balance.dt); acc -= balance.dt; }
  } else acc = 0;
  if (state) {
    const hover = input.pointer.inside && !input.dragging ? renderer.pick(state, input.pointer.x, input.pointer.y) : null;
    renderer.draw(state, acc, hover);
    hud.update(state);
    hud.tooltip(state, hover, renderer, input.pointer.x, input.pointer.y);
    if (state.status !== 'run' && !shown) { shown = true; endScreen(state); }
  } else {
    if (!demo) demo = createState(7);
    demo.theta += dt * 0.2;
    renderer.draw(demo, 0, null);
  }
  requestAnimationFrame(frame);
}

titleScreen();
requestAnimationFrame(frame);
(window as unknown as { __mbiota: unknown }).__mbiota = { start: startRun, get state() { return state; } };
