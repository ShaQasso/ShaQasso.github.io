import type { Move } from '../engine/replay';

/** The daily leaderboard. Everything here is optional: if the server cannot be reached, the game plays the same. */
const PROD = 'https://mbiota-remission.shaqasso.workers.dev';
// for local testing only: ?api=http://127.0.0.1:8787 when the game itself runs on localhost
const API = (() => {
  try { const p = new URLSearchParams(location.search).get('api'); if (p && location.hostname === 'localhost') return p; } catch { /* ignore */ }
  return PROD;
})();

export type Row = { initials: string; score: number; months: number; outcome: string; day?: string };
export type Board = { day: string | null; total: number | null; scores: Row[] };

async function call<T>(path: string, body?: unknown, ms = 8000): Promise<T> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API + path, body === undefined ? { signal: ctl.signal } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? `error ${r.status}`);
    return j as T;
  } finally { clearTimeout(timer); }
}

export const ticket = (day: string) => call<{ ticket: string }>('/ticket', { day }).then((r) => r.ticket);
export const top = (day: string | 'all', limit = 10) => call<Board>(day === 'all' ? `/top?all=1&limit=${limit}` : `/top?day=${day}&limit=${limit}`);
export const submit = (run: { ticket: string; initials: string; score: number; outcome: string; moves: Move[] }) => call<Board & { rank: number }>('/submit', run, 15000);

export function savedInitials(): string { try { return localStorage.getItem('mbiota-initials') ?? ''; } catch { return ''; } }
export function saveInitials(v: string): void { try { localStorage.setItem('mbiota-initials', v); } catch { /* ignore */ } }

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (n: number) => n.toLocaleString('en-US');

/** The board as a table; `mine` highlights the player's own row (by rank). */
export function boardHtml(b: Board, mine?: number, allTime = false): string {
  if (!b.scores.length) return `<p class="note">No scores yet today. Be the first on the board.</p>`;
  const rows = b.scores.map((r, k) => `<tr${mine === k + 1 ? ' class="me"' : ''}><td>${k + 1}</td><td class="n">${esc(r.initials)}</td><td class="m">${allTime && r.day ? esc(r.day.slice(5).replace('-', '/')) + ' · ' : ''}${esc(r.months)} ${r.months === 1 ? 'month' : 'months'}</td><td class="s">${num(r.score)}</td></tr>`).join('');
  return `<table class="lb">${rows}</table>`;
}
