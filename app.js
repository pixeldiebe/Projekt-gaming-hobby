// Spieleregal: Konsolen → Regal → Spiel.
// Daten: data/games.js (deine Liste), data/meta.js (Cover & Texte, vom Abrufskript),
// localStorage (Sammlungsstatus & Notizen, bis du sie per "Liste exportieren" sicherst).

const SYSTEMS = [
  { id: 'SNES', short: 'SNES', name: 'Super Nintendo', gen: '1990 · 16 Bit', c: '#c8c4d4', c2: '#6f6889', ink: '#221b38', dots: ['#d62d2d', '#f2c11c', '#2d9b48', '#2c5fd4'], depth: .14 },
  { id: 'PS1', short: 'PS one', name: 'PlayStation', gen: '1994 · 32 Bit', c: '#c2bfb8', c2: '#77746d', ink: '#22201c', dots: ['#e03d3d', '#f0c419', '#25a35a', '#2d73d8'], depth: .05, case: true },
  { id: 'N64', short: 'N64', name: 'Nintendo 64', gen: '1996 · 64 Bit', c: '#45454c', c2: '#141417', dots: ['#d23a2b', '#2a6bd6', '#f3c623', '#20a052'], depth: .15 },
  { id: 'DC', short: 'Dreamcast', name: 'Sega Dreamcast', gen: '1998 · 128 Bit', c: '#f1eee8', c2: '#c4bcae', ink: '#3a2e22', dots: ['#f07020'], depth: .06, case: true },
  { id: 'PS2', short: 'PS2', name: 'PlayStation 2', gen: '2000 · DVD', c: '#2a2f45', c2: '#08090f', dots: ['#2e5fd1'], depth: .07, case: true, spine: '#0d0e13' },
  { id: 'X360', short: 'Xbox 360', name: 'Microsoft Xbox 360', gen: '2005 · HD', c: '#eef1ea', c2: '#93b87c', ink: '#1d2a14', dots: ['#5dc21e'], depth: .07, case: true, spine: '#4fae1a' },
  { id: 'PS4', short: 'PS4', name: 'PlayStation 4', gen: '2013 · Blu-ray', c: '#123a85', c2: '#04112b', dots: ['#3c7cf0'], depth: .06, case: true, spine: '#0b3b8f' },
  { id: 'PS5', short: 'PS5', name: 'PlayStation 5', gen: '2020 · SSD', c: '#f6f7fb', c2: '#b9c1d6', ink: '#101527', dots: ['#0070d1', '#111'], depth: .06, case: true, spine: '#1257c4' },
  { id: 'PC', short: 'PC', name: 'Big Box bis Steam', gen: 'Seit immer', c: '#d9cfb6', c2: '#857a5e', ink: '#2a2418', dots: ['#4fd16b'], depth: .2 },
];
const SYS = Object.fromEntries(SYSTEMS.map(s => [s.id, s]));
const STORE = 'spieleregal:v1';

// Muss zu slug() in tools/fetch.mjs passen.
const slug = (g) => `${g.system}-${g.title}`.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch {} };
let local = load();

const META = window.META || {};
const games = (window.GAMES || []).map(g => {
  const id = slug(g);
  return { ...g, ...local[id], id, meta: META[id] || {} };
});
const byId = Object.fromEntries(games.map(g => [g.id, g]));

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel, el = document) => el.querySelector(sel);
const view = $('#view');
const dialog = $('#detail');
let filter = 'all';
let current = [];   // aktuell sichtbare Spiele im Regal, für Vor/Zurück

function update(g, patch) {
  Object.assign(g, patch);
  local[g.id] = { owned: g.owned, note: g.note };
  save(local);
  renderStats();
}

function renderStats() {
  const own = games.filter(g => g.owned).length;
  $('#stats').textContent = `${games.length} Spiele · ${own} in Sammlung`;
}

// --- Hüllen ------------------------------------------------------------------
function boxHtml(g, size = 'sm') {
  const img = g.meta.cover
    ? `<img src="covers/${size}/${g.id}.webp" alt="" loading="${size === 'sm' ? 'lazy' : 'eager'}" decoding="async">`
    : `<div class="placeholder">${esc(g.title)}</div>`;
  return `<span class="side"></span><span class="front">${img}</span>`;
}
function boxStyle(g) {
  const s = SYS[g.system] || {};
  return `--ar:${g.meta.ar || .72};--spine:${s.spine || g.meta.color || s.c2};--depth:calc(var(--box-h) * ${s.depth || .08})`;
}

// --- Startseite ----------------------------------------------------------------
function renderHome() {
  document.title = 'Spieleregal';
  const cards = SYSTEMS.map(s => {
    const list = games.filter(g => g.system === s.id).sort((a, b) => a.year - b.year);
    if (!list.length) return '';
    const own = list.filter(g => g.owned).length;
    const years = `${list[0].year}–${list[list.length - 1].year}`;
    const peek = list.filter(g => g.meta.cover).slice(-3).map((g, i, a) =>
      `<img src="covers/sm/${g.id}.webp" alt="" loading="lazy" style="--r:${(i - (a.length - 1) / 2) * 6}deg;--y:${Math.abs(i - (a.length - 1) / 2) * 6}px">`).join('');
    return `<a class="console" href="#/${s.id.toLowerCase()}" style="--c:${s.c};--c2:${s.c2};--ink:${s.ink || '#fff'}">
      <span class="dots">${s.dots.map(d => `<i style="background:${d}"></i>`).join('')}</span>
      <span class="gen">${s.gen}</span>
      <h2>${s.short}</h2>
      <span class="name">${s.name}</span>
      <span class="count">${list.length} Spiele · ${years}<br>${own} in Sammlung</span>
      <span class="peek">${peek}</span>
    </a>`;
  }).join('');
  view.innerHTML = `
    <section class="intro">
      <h1>Meine All-Time-Favoriten</h1>
      <p>${games.length} Spiele von ${SYSTEMS.filter(s => games.some(g => g.system === s.id)).length} Systemen. Wähle eine Konsole und zieh ein Spiel aus dem Regal.</p>
    </section>
    <section class="consoles">${cards}</section>`;
}

// --- Regal ---------------------------------------------------------------------
function renderShelf(sysId) {
  const s = SYS[sysId];
  if (!s) return renderHome();
  document.title = `${s.name} · Spieleregal`;
  const all = games.filter(g => g.system === sysId).sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  current = all.filter(g => filter === 'all' || (filter === 'own') === !!g.owned);
  const own = all.filter(g => g.owned).length;
  const btn = (k, label) => `<button data-filter="${k}" aria-pressed="${filter === k}">${label}</button>`;

  view.innerHTML = `
    <div class="shelf-head">
      <div>
        <a class="back" href="#/">← Alle Konsolen</a>
        <h1>${s.name}</h1>
        <div class="sub">${all.length} Spiele · ${own} in Sammlung · sortiert nach Erscheinungsjahr</div>
      </div>
      <div class="filter" role="group" aria-label="Filter">${btn('all', 'Alle')}${btn('own', 'In Sammlung')}${btn('missing', 'Fehlen noch')}</div>
    </div>
    <div class="cabinet" id="cabinet"></div>`;
  layoutRows();
}

// Hüllen auf Regalbretter verteilen: so viele pro Brett, wie in die Breite passen.
function layoutRows() {
  const cab = $('#cabinet');
  if (!cab) return;
  if (!current.length) {
    cab.innerHTML = `<div class="row"><p class="empty">${filter === 'own' ? 'Noch nichts davon in deiner Sammlung.' : 'Alles da!'}</p></div>`;
    return;
  }
  const boxH = parseFloat(getComputedStyle(cab).getPropertyValue('--box-h')) || 200;
  const gap = boxH < 160 ? 12 : 18;
  const avail = cab.clientWidth - 60;
  const rows = [[]];
  let w = 0;
  for (const g of current) {
    const bw = boxH * (g.meta.ar || .72) + boxH * (SYS[g.system].depth || .08) + gap;
    if (w + bw > avail && rows.at(-1).length) { rows.push([]); w = 0; }
    rows.at(-1).push(g);
    w += bw;
  }
  cab.innerHTML = rows.map(r => `<div class="row">${r.map(g => `
    <div class="slot">
      <a class="box ${SYS[g.system].case ? 'case' : ''} ${g.owned ? '' : 'missing'}" href="#/${g.system.toLowerCase()}/${g.id}"
         style="${boxStyle(g)}" title="${esc(g.title)} (${g.year})" aria-label="${esc(g.title)}, ${g.year}">${boxHtml(g)}</a>
      <span class="shadow"></span>
      <span class="tag ${g.owned ? 'own' : ''}">${g.owned ? '✓ ' : ''}${g.year}</span>
    </div>`).join('')}</div>`).join('');
}

// --- Detail --------------------------------------------------------------------
function openDetail(g) {
  const s = SYS[g.system];
  const m = g.meta;
  if (!current.includes(g)) current = games.filter(x => x.system === g.system).sort((a, b) => a.year - b.year);
  document.title = `${g.title} · Spieleregal`;
  $('#detail-body').innerHTML = `
    <div class="hero">
      <div class="box ${s.case ? 'case' : ''}" style="${boxStyle(g)}">${boxHtml(g, 'lg')}</div>
    </div>
    <div class="info">
      <div class="meta-line">${s.name} · ${g.year}</div>
      <h2>${esc(g.title)}</h2>
      <dl class="facts">
        <dt>Entwickler</dt><dd>${esc(g.developer || '–')}</dd>
        <dt>Publisher</dt><dd>${esc(g.publisher || '–')}</dd>
        <dt>Genre</dt><dd>${esc(g.genre || '–')}</dd>
      </dl>
      ${m.desc ? `<p class="desc">${esc(m.desc)}</p>
      <div class="source">Text: <a href="${esc(m.source)}" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA)${m.lang === 'en' ? ', englisch' : ''}</div>` : ''}
      <label class="own-toggle">
        <input type="checkbox" id="own" ${g.owned ? 'checked' : ''}>
        <span>In meiner Sammlung<small>${g.owned ? 'Steht bei mir im Regal' : 'Fehlt noch'}</small></span>
      </label>
      <div class="note">
        <label for="note">Meine Erinnerung</label>
        <textarea id="note" placeholder="Mit wem hast du es gespielt? Was ist hängen geblieben?">${esc(g.note)}</textarea>
      </div>
    </div>`;

  $('#own').onchange = (e) => {
    update(g, { owned: e.target.checked });
    e.target.nextElementSibling.querySelector('small').textContent = g.owned ? 'Steht bei mir im Regal' : 'Fehlt noch';
  };
  $('#note').oninput = (e) => update(g, { note: e.target.value });
  dialog.dataset.id = g.id;
  if (!dialog.open) dialog.showModal();
}

function step(dir) {
  const i = current.findIndex(g => g.id === dialog.dataset.id);
  const next = current[(i + dir + current.length) % current.length];
  if (next) location.replace(`#/${next.system.toLowerCase()}/${next.id}`);
}

// --- Routing -------------------------------------------------------------------
let shownShelf = null;
function route() {
  const [sys, id] = location.hash.replace(/^#\/?/, '').split('/');
  const sysId = sys && SYSTEMS.find(s => s.id.toLowerCase() === sys)?.id;
  if (!sysId) { shownShelf = null; dialog.open && dialog.close(); return renderHome(); }
  if (shownShelf !== sysId || !$('#cabinet')) { shownShelf = sysId; renderShelf(sysId); }
  if (id && byId[id]) openDetail(byId[id]);
  else if (dialog.open) { dialog.close(); }
}

dialog.addEventListener('close', () => {
  renderShelf(shownShelf);   // Sammlungsstatus im Regal aktualisieren
  if (location.hash.split('/').length > 2) history.replaceState(null, '', `#/${shownShelf.toLowerCase()}`);
  document.title = `${SYS[shownShelf]?.name} · Spieleregal`;
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  const s = e.target.closest('[data-step]');
  if (s) step(+s.dataset.step);
});
document.addEventListener('keydown', (e) => {
  if (!dialog.open || e.target.matches('textarea')) return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});
view.addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]');
  if (f) { filter = f.dataset.filter; renderShelf(shownShelf); }
});

let t;
window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(layoutRows, 120); });
window.addEventListener('hashchange', route);

// --- Export --------------------------------------------------------------------
$('#export').onclick = () => {
  const keep = ({ id, meta, ...g }) => g;
  const lines = games.map(g => '  ' + JSON.stringify(keep(g)).replace(/,"/g, ', "').replace(/":/g, '": '));
  const js = 'window.GAMES = [\n' + lines.join(',\n') + '\n];\n';
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([js], { type: 'text/javascript' })),
    download: 'games.js',
  });
  a.click();
  URL.revokeObjectURL(a.href);
};

renderStats();
route();
