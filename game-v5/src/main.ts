import './style.css';
import balance from './data/balance.json';
import { count } from './engine/geometry';
import { preview, type Preview } from './engine/plan';
import { createState, step } from './engine/sim';
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
let pv: Preview | null = null, pvKey = '';

function startRun(forced?: number): void {
  seed = forced ?? ((Math.random() * 2 ** 31) | 0);
  state = createState(seed);
  acc = 0; shown = false; pv = null; pvKey = '';
  renderer.reset(); input.reset(); hud.reset(); hideScreen();
}

function titleScreen(): void {
  showScreen(`
    <h1>MBIOTA</h1>
    <h2>You are a living blob of <i>Bacteroides</i> pixels. Each turn, the world announces its attack. You get time to plan.</h2>
    <ul>
      <li><b>Every turn is announced.</b> Phages are drawn at their landing spots, coloured like the pixels they hunt (<span class="sw" style="background:#fbbf24"></span>amber, <span class="sw" style="background:#22d3ee"></span>cyan, <span class="sw" style="background:#a78bfa"></span>violet). A green tick means deflected, a red circle shows the bite it would take.</li>
      <li><b>Drag the blob</b> to turn it (or A/D, or scroll). Find the rotation where the phages meet the wrong colour. A bite spreads through same-colour neighbours, so staying mixed keeps bites small.</li>
      <li><b>Aim your cooling.</b> Click or drag outside the blob (or Q/E) to point the gold arc at the hot part of the wall. It cools by how many <span class="sw" style="background:#a78bfa"></span>violet pixels (and some amber) sit near the edge in that direction. Deep pixels count for less.</li>
      <li>Later, <b>immune sections</b> (pre-flare, flare, after-flare) heat an arc of the wall and fire white immune cells at you. Antibiotics and two-colour phages arrive too. More each turn.</li>
      <li>A <b>perfect parry</b> (every phage deflected) earns a <b>skip</b>: cancel a whole announced turn. A mostly-one-colour outside also blooms a protective mucus layer, amber most of all, but it leaves you easy prey.</li>
      <li>The planning timer shrinks, to a floor. You lose to <b>inflammation overload</b> or if the blob <b>collapses</b>. Survive ${balance.turns.toWin} turns.</li>
    </ul>
    <button class="btn" id="go" type="button">Start</button> <span style="color:#7d8ba1;font-size:12px;margin-left:8px">Enter</span>`);
  document.getElementById('go')!.addEventListener('click', () => startRun());
}

function endScreen(s: State): void {
  const won = s.status === 'won', n = count(s);
  const text = `MBIOTA: my blob ${won ? 'survived' : 'fell'} (${s.reason}) on turn ${s.turn} · ${s.perfects} perfect parries (best streak ${s.bestStreak}) · ${n} pixels  seed ${seed}`;
  showScreen(`
    <div class="big ${s.status}">${won ? 'The blob held' : 'The blob fell'}</div>
    <h2>${won ? `Survived all ${balance.turns.toWin} turns` : `Cause: ${s.reason}, on turn ${s.turn}`}</h2>
    <div class="stats">
      <div><span>Turns</span><br>${s.turn}</div><div><span>Pixels left</span><br>${n}</div>
      <div><span>Perfect parries</span><br>${s.perfects} (best streak ${s.bestStreak})</div><div><span>Skips used</span><br>${s.stats.skipsUsed}</div>
      <div><span>Phage hits</span><br>${s.stats.hits}</div><div><span>Pixels burst</span><br>${s.stats.lysed}</div>
      <div><span>Immune bites</span><br>${s.stats.immuneKilled}</div><div><span>Antibiotic kills</span><br>${s.stats.abxKilled}</div>
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
  if (state && state.status === 'run') {
    input.tick(dt);
    if (state.phase === 'plan') step(state, dt);
    else { acc += dt * (input.fast ? 3 : 1); while (acc >= balance.dt && (state.phase as string) !== 'plan' && state.status === 'run') { step(state, balance.dt); acc -= balance.dt; } }
  }
  if (state) {
    if (state.phase === 'plan' && state.status === 'run') {
      const key = `${state.turn}|${state.theta.toFixed(3)}|${state.exert.toFixed(3)}`;
      if (key !== pvKey) { pvKey = key; pv = preview(state); }
    } else { pv = null; pvKey = ''; }
    const hover = input.pointer.inside && !input.dragging ? renderer.pick(state, input.pointer.x, input.pointer.y) : null;
    renderer.draw(state, pv, hover);
    hud.update(state, pv);
    hud.tooltip(state, hover, renderer, input.pointer.x, input.pointer.y);
    if (state.status !== 'run' && !shown) { shown = true; endScreen(state); }
  } else {
    if (!demo) { demo = createState(7); demo.ann = { phages: [], immune: [], abx: null }; }
    demo.theta += dt * 0.25;
    renderer.draw(demo, null, null);
  }
  requestAnimationFrame(frame);
}

titleScreen();
requestAnimationFrame(frame);
(window as unknown as { __mbiota: unknown }).__mbiota = { start: startRun, get state() { return state; } };
