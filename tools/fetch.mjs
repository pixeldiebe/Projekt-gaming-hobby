// Holt Cover und Beschreibungen für alle Spiele aus data/games.js
// und schreibt sie nach data/meta.js + covers/.
//
//   node tools/fetch.mjs            nur fehlende Einträge holen
//   node tools/fetch.mjs --force    alles neu holen
//   node tools/fetch.mjs zelda      nur Spiele, deren ID "zelda" enthält (immer neu)
//
// Quellen: libretro-thumbnails (Retro-Konsolen, PAL/DE bevorzugt), Steam (PC),
// englische Wikipedia (Cover-Fallback), deutsche Wikipedia (Beschreibung).
// Benötigt: Node 18+, cwebp, sips (macOS).

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = { 'User-Agent': 'SpieleRegal/1.0 (private hobby project)' };
const SIZES = { sm: 240, lg: 600 };
const LIBRETRO = {
  SNES: 'Nintendo_-_Super_Nintendo_Entertainment_System',
  N64: 'Nintendo_-_Nintendo_64',
  PS1: 'Sony_-_PlayStation',
  PS2: 'Sony_-_PlayStation_2',
  DC: 'Sega_-_Dreamcast',
};
// Reihenfolge = Priorität. Deutsche bzw. europäische Fassungen zuerst.
const REGIONS = [/\(Germany\)/, /\(Europe\)[^]*\bDe\b/, /\(Europe\)/, /\(World\)/, /\(USA\)/, /./];

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find(a => !a.startsWith('--'));

export const slug = (g) => `${g.system}-${g.title}`.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

const loadJs = async (file) => {
  if (!existsSync(file)) return null;
  const src = await readFile(file, 'utf8');
  return JSON.parse(src.slice(src.indexOf('=', src.indexOf('window.')) + 1).trim().replace(/;\s*$/, ''));
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Wikimedia drosselt schnell: kurze Pause vor jeder Anfrage, bei 429 länger warten.
async function get(url, type = 'json', tries = 4) {
  if (/wiki/.test(url)) await sleep(400);
  const res = await fetch(url, { headers: UA });
  if (res.status === 429 && tries > 0) {
    await sleep((+res.headers.get('retry-after') || 5) * 1000);
    return get(url, type, tries - 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return type === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
}

// --- libretro --------------------------------------------------------------
const trees = {};
async function libretroList(repo) {
  if (trees[repo]) return trees[repo];
  const api = `https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees`;
  const root = await get(`${api}/master`);
  const box = root.tree.find(t => t.path === 'Named_Boxarts');
  const list = (await get(`${api}/${box.sha}`)).tree.map(t => t.path);
  return (trees[repo] = list);
}

async function libretroCover(g) {
  const repo = LIBRETRO[g.system];
  if (!repo) return null;
  const files = (await libretroList(repo)).filter(f => !/Virtual Console|Beta|Proto|Demo|Sample/.test(f));
  for (const base of g.libretro || [g.title]) {
    const hits = files.filter(f => norm(f.replace(/\.png$/, '')) === norm(base));
    for (const re of REGIONS) {
      const hit = hits.find(f => re.test(f));
      if (hit) return `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/Named_Boxarts/${encodeURIComponent(hit)}`;
    }
  }
  return null;
}

// --- Steam / Wikipedia -----------------------------------------------------
async function steamCover(g) {
  if (!g.steam) return null;
  const url = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.steam}/library_600x900.jpg`;
  const res = await fetch(url, { method: 'HEAD', headers: UA });
  return res.ok ? url : null;
}

const EN = 'https://en.wikipedia.org/w/api.php?format=json&redirects=1';

// Wikipedia-Cover sind nicht-frei und tauchen in "pageimages" nicht auf,
// daher Bildname aus der Infobox lesen und die Datei-URL nachschlagen.
async function wikiCover(g) {
  const p = await get(`${EN}&action=parse&prop=wikitext&section=0&page=${encodeURIComponent(g.wiki || g.title)}`);
  const file = p.parse?.wikitext['*'].match(/\|\s*image\s*=\s*(?:\[\[)?(?:File:|Image:)?([^\n|\]]+\.(?:jpe?g|png|webp|gif))/i)?.[1];
  if (!file) return null;
  const q = await get(`${EN}&action=query&prop=imageinfo&iiprop=url&titles=${encodeURIComponent('File:' + file.trim())}`);
  return Object.values(q.query.pages)[0]?.imageinfo?.[0]?.url || null;
}

async function germanText(g) {
  const q = await get(`${EN}&action=query&prop=langlinks&lllang=de&titles=${encodeURIComponent(g.wiki || g.title)}`);
  const page = Object.values(q.query.pages)[0];
  const de = page?.langlinks?.[0]?.['*'];
  const lang = de ? 'de' : 'en';
  const title = de || page?.title || g.title;
  const s = await get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  return { desc: trimText(s.extract || ''), source: s.content_urls?.desktop?.page, lang };
}

function trimText(t, max = 650) {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf('. ') + 1) || cut + '…';
}

// --- Bilder ----------------------------------------------------------------
function sipsDims(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString();
  return [+out.match(/pixelWidth: (\d+)/)[1], +out.match(/pixelHeight: (\d+)/)[1]];
}

// Durchschnittsfarbe über 1×1-BMP, dient als Farbe für Rücken und Seiten der Hülle.
function avgColor(file, tmp) {
  const bmp = join(tmp, 'c.bmp');
  execFileSync('sips', ['-z', '1', '1', file, '-s', 'format', 'bmp', '--out', bmp], { stdio: 'ignore' });
  const b = readFileSync(bmp);
  const off = b.readUInt32LE(10);
  return '#' + [b[off + 2], b[off + 1], b[off]].map(v => v.toString(16).padStart(2, '0')).join('');
}

async function saveCover(url, id) {
  const tmp = join(tmpdir(), `regal-${id}`);
  await mkdir(tmp, { recursive: true });
  const src = join(tmp, 'src' + (url.match(/\.(png|jpe?g|webp|gif)/i)?.[0] || '.img'));
  let buf = await get(url, 'buf');
  // libretro legt Duplikate als Git-Symlinks ab: der Inhalt ist dann nur der Zieldateiname.
  if (buf.length < 300 && !buf.includes('<')) buf = await get(new URL(encodeURIComponent(buf.toString().trim()), url).href, 'buf');
  await writeFile(src, buf);
  const [w, h] = sipsDims(src);
  for (const [size, max] of Object.entries(SIZES)) {
    await mkdir(join(ROOT, 'covers', size), { recursive: true });
    const resize = w > max ? ['-resize', String(max), '0'] : [];
    execFileSync('cwebp', ['-quiet', '-q', size === 'sm' ? '72' : '80', ...resize, src, '-o', join(ROOT, 'covers', size, `${id}.webp`)]);
  }
  const color = avgColor(src, tmp);
  await rm(tmp, { recursive: true, force: true });
  return { ar: +(w / h).toFixed(3), color };
}

// --- Hauptlauf -------------------------------------------------------------
const games = await loadJs(join(ROOT, 'data/games.js'));
const meta = (await loadJs(join(ROOT, 'data/meta.js'))) || {};
const missing = [];

for (const g of games) {
  const id = slug(g);
  if (only && !id.includes(only)) continue;
  const m = meta[id] || {};
  const redo = force || !!only;
  try {
    if (redo || !m.cover) {
      const url = (await libretroCover(g)) || (await steamCover(g)) || (await wikiCover(g));
      if (url) Object.assign(m, { cover: true, coverSrc: url }, await saveCover(url, id));
      else missing.push(`${id}: kein Cover`);
    }
    if (redo || !m.desc || m.lang !== 'de') Object.assign(m, await germanText(g));
    meta[id] = m;
    console.log(`✓ ${id.padEnd(48)} ${m.cover ? new URL(m.coverSrc).host : '— kein Cover'} · ${m.lang || '?'}`);
  } catch (e) {
    missing.push(`${id}: ${e.message}`);
    console.log(`✗ ${id}: ${e.message}`);
  }
}

const sorted = Object.fromEntries(Object.entries(meta).sort());
await writeFile(join(ROOT, 'data/meta.js'),
  '// Automatisch erzeugt von tools/fetch.mjs. Nicht von Hand bearbeiten.\nwindow.META = ' + JSON.stringify(sorted, null, 1) + ';\n');
if (missing.length) console.log('\nProbleme:\n  ' + missing.join('\n  '));
