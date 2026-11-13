// Tiny static builder: wraps every src/pages/**/*.html in src/layout.html and copies assets to dist/.
// Usage: node build.mjs     (output: site/dist)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src'), out = join(here, 'dist');
const SITE = JSON.parse(readFileSync(join(src, 'site.json'), 'utf8'));
const layout = readFileSync(join(src, 'layout.html'), 'utf8');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const d of ['assets', 'media', 'data']) if (existsSync(join(src, d))) cpSync(join(src, d), join(out, d), { recursive: true });
if (existsSync(join(src, 'play-game'))) cpSync(join(src, 'play-game'), join(out, 'play', 'game'), { recursive: true });

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const pages = walk(join(src, 'pages')).filter((f) => f.endsWith('.html'));
const fill = (s, vars) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));

for (const file of pages) {
  const rel = relative(join(src, 'pages'), file).split(sep).join('/');
  let body = readFileSync(file, 'utf8');
  const m = body.match(/^<!--(\{[\s\S]*?\})-->\s*/);
  const meta = m ? JSON.parse(m[1]) : {};
  if (m) body = body.slice(m[0].length);
  const depth = rel.split('/').length - 1;
  const root = depth ? '../'.repeat(depth) : './';
  const url = SITE.url + '/' + (rel === 'index.html' ? '' : rel.replace(/index\.html$/, ''));
  const vars = { root, ...SITE, title: meta.title ? `${meta.title} · ${SITE.name}` : `${SITE.name} · ${SITE.tagline}`, desc: meta.desc || SITE.desc, bodyClass: meta.class || '', navKey: meta.nav || '', canonical: url, ogImage: SITE.url + '/media/' + (meta.og || 'portrait.jpg') };
  const html = fill(fill(layout, { ...vars, content: body }), vars);
  const dest = join(out, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html);
}
console.log(`built ${pages.length} pages -> ${relative(process.cwd(), out) || out}`);
