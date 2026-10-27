// Prozedurale Texturen auf Canvas: Nussbaum-Maserung und Hüllenrücken.
// Keine Bilddateien nötig.

// Deterministischer Zufall, damit das Holz bei jedem Laden gleich aussieht.
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

export function woodCanvas(w = 2048, h = 512, seed = 7) {
  const r = rng(seed);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');

  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#4a2c19');
  base.addColorStop(.5, '#3a2113');
  base.addColorStop(1, '#46291a');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  // Breite, weiche Farbstreifen
  for (let i = 0; i < 18; i++) {
    const y = r() * h, th = 20 + r() * 80;
    g.fillStyle = `rgba(${r() > .5 ? '110,70,40' : '20,10,5'},${.08 + r() * .12})`;
    g.beginPath();
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * .003 + i) * 18 + Math.sin(x * .011) * 4);
    for (let x = w; x >= 0; x -= 16) g.lineTo(x, y + th + Math.sin(x * .0035 + i) * 16);
    g.fill();
  }

  // Feine Maserlinien
  for (let i = 0; i < 420; i++) {
    const y0 = r() * h, amp = 2 + r() * 9, f = .002 + r() * .004, ph = r() * 10;
    g.strokeStyle = r() > .35 ? `rgba(18,8,3,${.12 + r() * .3})` : `rgba(150,100,60,${.06 + r() * .14})`;
    g.lineWidth = .4 + r() * 1.8;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * .25;
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }

  // Poren
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(10,4,0,${.15 + r() * .35})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 10, .8);
  }
  return c;
}

const shade = (hex, f) => {
  const n = parseInt((hex || '#555555').slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * f));
  return `rgb(${ch.join(',')})`;
};

// Text so groß wie möglich, aber innerhalb von maxW × maxH.
function fitText(g, text, font, maxW, maxH) {
  let size = maxH;
  g.font = `${font} ${size}px "Barlow Condensed", sans-serif`;
  const w = g.measureText(text).width;
  if (w > maxW) size *= maxW / w;
  g.font = `${font} ${size}px "Barlow Condensed", sans-serif`;
  return size;
}

// Rücken einer Hülle. Gezeichnet wird im gedrehten System: x läuft entlang des Rückens
// (von unten nach oben, wie bei europäischen Hüllen), y quer dazu.
export function spineCanvas(game, sys, meta, owned) {
  const H = 1536;
  const W = Math.max(96, Math.round(H * sys.d / sys.h));
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d');
  const bg = sys.bg || shade(meta.color, .45);

  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.translate(0, H);
  g.rotate(-Math.PI / 2);
  // Ab hier: Länge L = H (x-Richtung), Breite B = W (y-Richtung)
  const L = H, B = W;
  const band = sys.band;
  const bandLen = band ? L * .2 : 0;

  if (band) {
    g.fillStyle = band.bg;
    g.fillRect(L - bandLen, 0, bandLen, B);
    let x = L - bandLen + B * .25;
    if (band.dots) {
      const s = B * .16;
      band.dots.forEach((col, i) => {
        g.fillStyle = col;
        g.fillRect(x + (i % 2) * s * 1.1, B / 2 - s * 1.1 + Math.floor(i / 2) * s * 1.1, s, s);
      });
      x += s * 2.6;
    }
    if (band.swirl) {
      g.strokeStyle = band.swirl;
      g.lineWidth = B * .07;
      g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += .1) {
        const rr = a * B * .024;
        g.lineTo(x + B * .3 + Math.cos(a) * rr, B / 2 + Math.sin(a) * rr);
      }
      g.stroke();
      x += B * .7;
    }
    g.fillStyle = band.ink;
    g.textBaseline = 'middle';
    fitText(g, band.text, 700, L - x - B * .2, B * .36);
    g.fillText(band.text, x, B / 2);
    if (band.line) {
      g.fillStyle = band.line;
      g.fillRect(L - bandLen - 6, 0, 6, B);
    }
  }

  // Titel
  const title = game.title.replace(/\s*\(Remake\)/, '');
  const maxLen = L - bandLen - L * .2;
  g.fillStyle = sys.ink;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  fitText(g, title.toUpperCase(), 800, maxLen, B * .5);
  g.fillText(title.toUpperCase(), L * .12 + maxLen / 2, B / 2 + B * .03);

  // Publisher unten
  g.globalAlpha = .65;
  g.textAlign = 'left';
  fitText(g, (game.publisher || '').toUpperCase(), 600, L * .1, B * .2);
  g.fillText((game.publisher || '').toUpperCase(), B * .25, B / 2);
  g.globalAlpha = 1;

  // Sammlungs-Aufkleber
  if (owned) {
    const rr = B * .2, cx = L * .135, cy = B * .78;
    g.fillStyle = '#7bd88f';
    g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#0f2a15';
    g.lineWidth = rr * .28;
    g.beginPath(); g.moveTo(cx - rr * .45, cy); g.lineTo(cx - rr * .1, cy + rr * .35); g.lineTo(cx + rr * .5, cy - rr * .4); g.stroke();
  }

  // Leichte Abnutzung an den Kanten
  g.setTransform(1, 0, 0, 1, 0, 0);
  const edge = g.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(0,0,0,.35)');
  edge.addColorStop(.12, 'rgba(0,0,0,0)');
  edge.addColorStop(.88, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,.35)');
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
  return c;
}
