/**
 * Mbiota: Remission — the daily leaderboard.
 *
 * Runs on the Cloudflare Workers free plan, which allows ~10 ms of CPU per request, so it does not replay
 * games. Instead it makes cheating slow and annoying, and keeps every run's moves so a score can be replayed
 * and checked later:
 *   1. a signed ticket when a run of today's gut starts (date + start time); no ticket, no score
 *   2. real time must pass: every month of the game takes 30 s of play
 *   3. the score must be possible for the months reached
 *   4. one score per ticket, and a daily limit per visitor
 */
import balance from '../../src/data/balance.json';

interface Env { DB: D1Database; TICKET_KEY: string; ORIGINS: string }

const MONTH_SECONDS = balance.wave.len;
const STEPS_PER_MONTH = Math.round(balance.wave.len / balance.dt);
const MAX_BODY = 1_500_000, MAX_MOVES = 120_000, MAX_MONTHS = 60, PER_VISITOR_PER_DAY = 40;
// a few words that should not be on the board, as three letters
const BLOCKED = new Set(['ASS', 'CUM', 'FAG', 'FUK', 'FUC', 'FCK', 'KKK', 'NIG', 'NGR', 'SEX', 'TIT', 'XXX', 'DIK', 'DIC', 'COK', 'CNT', 'PUS', 'SHT', 'NAZ']);

const today = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function key(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(env.TICKET_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signTicket(env: Env, day: string, t: number): Promise<string> {
  const payload = b64u(enc.encode(JSON.stringify({ d: day, t, n: b64u(crypto.getRandomValues(new Uint8Array(9))) })));
  return `${payload}.${b64u(await crypto.subtle.sign('HMAC', await key(env), enc.encode(payload)))}`;
}
async function readTicket(env: Env, ticket: string): Promise<{ d: string; t: number } | null> {
  const [payload, sig] = String(ticket).split('.');
  if (!payload || !sig || ticket.length > 300) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await key(env), unb64u(sig), enc.encode(payload)))) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    return typeof p.d === 'string' && typeof p.t === 'number' ? p : null;
  } catch { return null; }
}
async function visitorOf(env: Env, req: Request): Promise<string> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(`${env.TICKET_KEY}|${ip}`))).slice(0, 22);
}

/** The highest score possible after `months` months: every month perfectly calm on a full streak, a full colony, a perfect mix. */
function maxScore(months: number): number {
  let calm = 0;
  for (let m = 1; m <= months; m++) calm += 100 * (1 + balance.heal.streakScore * Math.max(0, m - 1));
  return Math.ceil(calm + balance.capacity / 5 + 200) + 5;
}

/** What the move list says about the run, without replaying it. */
function shape(moves: unknown): { months: number; steps: number } | null {
  if (!Array.isArray(moves) || moves.length > MAX_MOVES) return null;
  let checkups = 0, keeps = 0, lastStep = -1, maxStep = 0;
  for (const m of moves) {
    if (!Array.isArray(m) || typeof m[0] !== 'string') return null;
    if (m[0] === 'r') {
      if (m.length !== 3 || !Number.isInteger(m[1]) || typeof m[2] !== 'number' || !Number.isFinite(m[2]) || m[2] < -1 || m[2] > 1 || m[1] < lastStep) return null;
      lastStep = m[1]; maxStep = m[1];
    } else if (m[0] === 'n') checkups++;
    else if (m[0] === 'k') { if (++keeps > 1) return null; }
    else if (!['p', 'b', 'w'].includes(m[0])) return null;
  }
  const months = checkups + 1;
  if (months > MAX_MONTHS || maxStep > months * STEPS_PER_MONTH) return null;
  return { months, steps: maxStep };
}

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const ok = env.ORIGINS.split(',').map((s) => s.trim()).includes(origin);
  return { 'Access-Control-Allow-Origin': ok ? origin : 'https://shaqasso.github.io', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (h: Record<string, string>, body: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': cache } });

async function board(env: Env, day: string | null, limit: number) {
  const q = day
    ? env.DB.prepare('SELECT initials, score, months, outcome FROM scores WHERE day = ? AND hidden = 0 ORDER BY score DESC, created ASC LIMIT ?').bind(day, limit)
    : env.DB.prepare('SELECT initials, score, months, outcome, day FROM scores WHERE hidden = 0 ORDER BY score DESC, created ASC LIMIT ?').bind(limit);
  const total = day ? await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE day = ? AND hidden = 0').bind(day).first<{ n: number }>() : null;
  return { day, total: total?.n ?? null, scores: (await q.all()).results };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try { return await handle(req, env); }
    catch (err) { console.error(err); return json(cors(env, req), { error: 'the board had a problem' }, 500); }
  },
};

async function handle(req: Request, env: Env): Promise<Response> {
    const h = cors(env, req), url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    // today's (or any day's) board, or the all-time board
    if (req.method === 'GET' && url.pathname === '/top') {
      const limit = Math.max(1, Math.min(20, Number(url.searchParams.get('limit')) || 10));
      const all = url.searchParams.get('all') === '1';
      const day = all ? null : (url.searchParams.get('day') ?? today());
      if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(h, { error: 'bad day' }, 400);
      return json(h, await board(env, day, limit), 200, 'public, max-age=15');
    }

    if (req.method !== 'POST') return json(h, { error: 'not found' }, 404);
    const origin = req.headers.get('Origin') ?? '';
    if (!env.ORIGINS.split(',').map((s) => s.trim()).includes(origin)) return json(h, { error: 'not allowed from here' }, 403);
    const text = await req.text();
    if (text.length > MAX_BODY) return json(h, { error: 'too big' }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { return json(h, { error: 'bad request' }, 400); }

    // a ticket for a run of today's gut
    if (url.pathname === '/ticket') {
      if (body.day !== today()) return json(h, { error: "that is not today's gut" }, 400);
      return json(h, { ticket: await signTicket(env, today(), Date.now()) });
    }

    // a finished run
    if (url.pathname === '/submit') {
      const now = Date.now();
      const t = await readTicket(env, String(body.ticket ?? ''));
      if (!t) return json(h, { error: 'no valid ticket' }, 400);
      if (t.d !== today(now) && t.d !== today(now - 86_400_000)) return json(h, { error: 'that day is over' }, 400);
      const initials = String(body.initials ?? '').toUpperCase();
      if (!/^[A-Z]{3}$/.test(initials) || BLOCKED.has(initials)) return json(h, { error: 'initials must be three letters' }, 400);
      const sh = shape(body.moves);
      if (!sh) return json(h, { error: 'that run does not add up' }, 400);
      const score = Number(body.score), outcome = body.outcome === 'remission' ? 'remission' : 'flare-out';
      if (!Number.isInteger(score) || score < 0 || score > maxScore(sh.months)) return json(h, { error: 'that score is not possible' }, 400);
      // real time: every month you reached took 30 s of waves, the last one at least partly
      const played = (now - t.t) / 1000, needed = Math.max(sh.steps * balance.dt, (sh.months - 1) * MONTH_SECONDS) * 0.9;
      if (played < needed) return json(h, { error: 'too fast' }, 400);
      const visitor = await visitorOf(env, req);
      const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE visitor = ? AND day = ?').bind(visitor, t.d).first<{ n: number }>();
      if ((used?.n ?? 0) >= PER_VISITOR_PER_DAY) return json(h, { error: 'that is enough for today' }, 429);
      try {
        await env.DB.prepare('INSERT INTO scores (day, initials, score, months, outcome, ticket, moves, visitor, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(t.d, initials, score, sh.months, outcome, String(body.ticket), JSON.stringify(body.moves), visitor, now).run();
      } catch { return json(h, { error: 'this run is already on the board' }, 409); }
      const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE day = ? AND hidden = 0 AND score > ?').bind(t.d, score).first<{ n: number }>();
      return json(h, { rank: (above?.n ?? 0) + 1, ...(await board(env, t.d, 10)) });
    }
    return json(h, { error: 'not found' }, 404);
}
