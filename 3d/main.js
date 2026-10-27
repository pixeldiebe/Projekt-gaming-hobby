// Spieleregal 3D, Phase 1: ein Regalfach in WebGPU (Fallback WebGL 2).
// Einheiten: Zentimeter.

import * as THREE from 'three/webgpu';
import {
  pass, uniform, screenUV, smoothstep, vec2, float, uv, texture, color,
  normalView, positionViewDirection, pow, abs, dot, oneMinus, reflector, mx_noise_float, positionWorld,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SYSTEMS, ORDER, slug } from './systems.js';
import { woodCanvas, spineCanvas } from './textures.js';
import { makePackage } from './packages.js';

const $ = (s) => document.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const DEPTH = 26;          // Brett-Tiefe
const FOV = 30;

// --- Daten (gleicher Speicher wie Version 1) ------------------------------------
const STORE = 'spieleregal:v1';
const local = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
const saveLocal = () => { try { localStorage.setItem(STORE, JSON.stringify(local)); } catch {} };
const games = (window.GAMES || []).map(g => {
  const id = slug(g);
  return { ...g, ...local[id], id, meta: (window.META || {})[id] || {} };
});

// --- Renderer -------------------------------------------------------------------
const renderer = new THREE.WebGPURenderer({ canvas: $('#gl'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;   // farbtreu, entsättigt die Cover nicht
renderer.toneMappingExposure = .9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
await renderer.init();
$('#backend').textContent = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#b8b1a7');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.1;

// Bei verstecktem Tab kann das Fenster 0 px groß sein, dann ein sinnvolles Format annehmen.
const viewAspect = () => (innerWidth && innerHeight ? innerWidth / innerHeight : 16 / 10);
const camera = new THREE.PerspectiveCamera(FOV, viewAspect(), 1, 800);
const maxAniso = renderer.getMaxAnisotropy?.() ?? 8;

// --- Licht ----------------------------------------------------------------------
const spot = new THREE.SpotLight('#fff1e2', 22000, 0, .3, .7, 1.6);
spot.shadow.radius = 6;
spot.castShadow = true;
spot.shadow.mapSize.set(4096, 4096);
spot.shadow.bias = -0.0004;
spot.shadow.normalBias = 0.02;
scene.add(spot, spot.target);

// Helles Tageslicht im Raum, damit es nicht nach Keller aussieht
scene.add(new THREE.HemisphereLight('#fff7ee', '#5a4c40', 1.1));
const rim = new THREE.DirectionalLight('#dfe6ff', .6);
rim.position.set(-80, 60, -20);
scene.add(rim);
const fill = new THREE.PointLight('#ffd9b3', 250, 0, 2);
scene.add(fill);

// Präsentationslicht: folgt dem herausgezogenen Spiel, damit es nicht im Dunkeln schwebt
const inspect = new THREE.SpotLight('#fff3e6', 0, 0, .45, .8, 2);
scene.add(inspect, inspect.target);

// --- Holz -----------------------------------------------------------------------
const woodImg = woodCanvas();
function woodTex(rx, ry, rot = 0) {
  const t = new THREE.CanvasTexture(woodImg);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.rotation = rot;
  t.anisotropy = maxAniso;
  return t;
}
const polished = (map, tint = '#ffffff') => new THREE.MeshPhysicalNodeMaterial({
  map, color: tint, roughness: .42, clearcoat: .5, clearcoatRoughness: .12,
});

// --- Hüllen ---------------------------------------------------------------------
const loader = new THREE.TextureLoader();

// --- Jahresschild am Brett ---------------------------------------------------------
function tagCanvas(year, owned) {
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 96 });
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 96);
  grad.addColorStop(0, owned ? '#9be3a8' : '#e2c28a');
  grad.addColorStop(1, owned ? '#5fbf74' : '#a9844c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = owned ? '#0f2a15' : '#2b1d0c';
  g.font = '800 64px "Barlow Condensed", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText((owned ? '✓ ' : '') + year, 128, 52);
  return c;
}

// --- Regal ----------------------------------------------------------------------
let shelf = null;   // { group, boxes, frame: {w, h, cy}, dispose() }
const BACK_ROT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));

async function buildShelf(sysId) {
  const sys = SYSTEMS[sysId];
  const list = games.filter(g => g.system === sysId).sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  const gap = 1.6;
  const widthOf = (g) => Math.min(Math.max(sys.h * (g.meta.ar || .72), sys.h * .55), sys.h * 1.6);

  // Auf Fächer verteilen: so viele Reihen, dass das Regal zum Bildformat passt.
  const total = list.reduce((s, g) => s + widthOf(g) + gap, 0);
  const rowH = sys.h + 7;
  let rows = 1;
  while (rows < list.length && total / rows > (rows * (rowH + 3)) * camera.aspect * 2) rows++;
  const perRow = Math.ceil(list.length / rows);
  const rowLists = Array.from({ length: rows }, (_, r) => list.slice(r * perRow, (r + 1) * perRow)).filter(r => r.length);
  rows = rowLists.length;
  const rowW = rowLists.map(r => r.reduce((s, g) => s + widthOf(g) + gap, 0) - gap);
  const pitch = rowH + 3;                       // Abstand der Bretter
  const bottomY = -(rows - 1) * pitch;          // Oberkante des untersten Bretts

  const group = new THREE.Group();
  const disposables = [];
  const keep = (...o) => (disposables.push(...o), o[0]);
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Wand
  const wall = add(new THREE.PlaneGeometry(900, 500), keep(new THREE.MeshStandardNodeMaterial({ roughness: .95 })), 0, 40, -DEPTH / 2);
  wall.material.colorNode = color('#c2bbb1').mul(mx_noise_float(positionWorld.mul(.08)).mul(.3).add(.9));
  wall.castShadow = false;

  // Durchlaufende Wandbretter, ohne Seiten und Rückwand.
  // Die Oberseite ist poliert und spiegelt ("wet floor").
  const BW = 600;   // so lang, dass die Bretter über den Bildrand hinauslaufen
  const board = keep(polished(woodTex(BW / 60, 1)));
  const topTex = keep(woodTex(BW / 60, 1));
  const grain = texture(topTex, uv());
  const fresnel = pow(oneMinus(abs(dot(normalView, positionViewDirection))), 1.5);
  for (let r = 0; r < rows; r++) {
    const y = -r * pitch;
    add(new THREE.BoxGeometry(BW, 3, DEPTH), board, 0, y - 1.5, 0);
    // Kein Klarlack hier: die Spiegelung kommt vom Reflektor, nicht von der Umgebung.
    const topMat = keep(new THREE.MeshStandardNodeMaterial({ roughness: .3, envMapIntensity: .05 }));
    const top = add(new THREE.PlaneGeometry(BW, DEPTH), topMat, 0, y + .01, 0);
    top.rotation.x = -Math.PI / 2;
    top.castShadow = false;
    const mirror = reflector({ target: top, resolutionScale: 1, generateMipmaps: true });
    mirror.uvNode = mirror.uvNode.add(grain.r.sub(.25).mul(.012));
    topMat.colorNode = grain.rgb;
    topMat.emissiveNode = mirror.level(2).rgb.mul(grain.rgb.mul(1.4).add(.2)).mul(fresnel.mul(.55).add(.03));
  }

  // Hüllen, Cover nach vorn
  const boxes = [];
  const tex = await Promise.all(list.map(g => g.meta.cover
    ? loader.loadAsync(`../covers/lg/${g.id}.webp`).catch(() => null)
    : null));
  const tagGeo = keep(new THREE.PlaneGeometry(4.4, 1.65));

  let i = 0;
  rowLists.forEach((row, r) => {
    const y = -r * pitch;
    let x = -rowW[r] / 2;
    for (const g of row) {
      const w = widthOf(g);
      const cover = tex[i];
      if (cover) { cover.colorSpace = THREE.SRGBColorSpace; cover.anisotropy = maxAniso; keep(cover); }
      const spineTex = keep(new THREE.CanvasTexture(spineCanvas(g, sys, g.meta, g.owned)));
      spineTex.colorSpace = THREE.SRGBColorSpace;
      spineTex.anisotropy = maxAniso;
      const mesh = makePackage(sys, w, { cover, spine: spineTex, tint: g.meta.color }, keep);
      const base = new THREE.Vector3(x + w / 2, y, DEPTH / 2 - 9 - sys.d / 2);
      mesh.position.copy(base);
      mesh.quaternion.copy(BACK_ROT);
      group.add(mesh);

      const tagTex = keep(new THREE.CanvasTexture(tagCanvas(g.year, g.owned)));
      tagTex.colorSpace = THREE.SRGBColorSpace;
      const tag = add(tagGeo, keep(new THREE.MeshStandardNodeMaterial({ map: tagTex, roughness: .35, metalness: .3 })), x + w / 2, y - 1.5, DEPTH / 2 + .02);
      tag.castShadow = false;
      disposables.pop();   // tagGeo nicht mehrfach freigeben

      const box = { mesh, game: g, base, w, h: sys.h, sys, spineTex, tagTex, tPos: base.clone(), tQuat: BACK_ROT.clone(), spin: 0, index: i };
      mesh.userData.box = box;
      boxes.push(box);
      x += w + gap;
      i++;
    }
  });

  scene.add(group);
  return {
    group, boxes, sysId, aspect: camera.aspect,
    frame: { w: Math.max(...rowW) + 20, h: rows * pitch + 4, cy: (sys.h + 2 + bottomY - 3) / 2 },
    dispose() { scene.remove(group); disposables.forEach(d => d.dispose?.()); },
  };
}

// --- Kamera ---------------------------------------------------------------------
const camBase = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 30, 260);
function frameCamera() {
  if (!shelf) return;
  const { w, h, cy } = shelf.frame;
  const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  // Oben Platz für die Kopfzeile lassen (Anteil der Bildhöhe)
  const headerFrac = Math.min(.3, ($('header').offsetHeight + 12) / (innerHeight || 800));
  const dist = Math.max(h / 2 / t / (1 - headerFrac), w / 2 / (t * camera.aspect));
  const shiftUp = t * dist * headerFrac;
  camLook.set(0, cy + shiftUp, 0);
  camBase.set(0, cy + shiftUp + 3, DEPTH / 2 + dist);
  spot.position.set(-55, cy + 60, 110);
  spot.target.position.set(0, cy, 0);
  spot.angle = Math.min(.7, Math.atan(Math.max(w, h) * .55 / spot.position.distanceTo(spot.target.position)));
  fill.position.set(40, cy + h / 2 + 10, DEPTH / 2 + 20);
}

// Punkt vor der Kamera, an dem ein herausgezogenes Spiel präsentiert wird.
function presentPose(b) {
  const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const portrait = camera.aspect < .9;
  const dist = Math.max(b.h / (portrait ? .3 : .6) / (2 * t), b.w / (portrait ? .62 : .42) / (2 * t * camera.aspect));
  const fwd = camLook.clone().sub(camBase).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd);
  const visW = 2 * t * dist * camera.aspect, visH = 2 * t * dist;
  const p = camBase.clone().addScaledVector(fwd, dist);
  if (portrait) p.addScaledVector(up, visH * .2);
  else p.addScaledVector(right, -visW * .2).addScaledVector(up, -visH * .05);
  p.addScaledVector(up, -b.h / 2);
  return { pos: p, dist, fwd, right, up };
}

// --- Effekte ----------------------------------------------------------------------
const pipeline = new THREE.RenderPipeline(renderer);
const scenePass = pass(scene, camera);
const sceneColor = scenePass.getTextureNode('output');
const uFocus = uniform(120), uFocal = uniform(80), uBokeh = uniform(0);
const sharp = dof(sceneColor, scenePass.getViewZNode(), uFocus, uFocal, uBokeh);
const glow = bloom(sceneColor, .07, .4, 2.4);
const vignette = smoothstep(float(1.0), float(.25), screenUV.sub(.5).mul(vec2(1.25, 1)).length());
pipeline.outputNode = film(sharp.add(glow).mul(vignette.mul(.3).add(.7)), float(.08));

// --- Interaktion -------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2(9, 9);
const pointer = { x: 0, y: 0 };
let hovered = null, selected = null, drag = null;
const tip = $('#tip');

function pick() {
  if (!shelf) return null;
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(shelf.boxes.map(b => b.mesh), true)[0];
  let o = hit?.object;
  while (o && !o.userData.box) o = o.parent;
  return o?.userData.box ?? null;
}

function setHover(b) {
  if (hovered === b) return;
  hovered = b;
  document.body.style.cursor = b ? 'pointer' : '';
  if (!b || selected) { tip.hidden = true; return; }
  tip.innerHTML = `<b>${esc(b.game.title)}</b><span>${b.game.year}${b.game.owned ? ' · ✓ in Sammlung' : ''}</span>`;
  tip.hidden = false;
}

function select(b) {
  if (selected === b) return;
  if (selected) putBack(selected);
  selected = b;
  setHover(null);
  b.spin = 0;
  b.phase = 'out';
  b.tPos = b.base.clone().add(new THREE.Vector3(0, .3, 8));
  b.tQuat.copy(BACK_ROT);
  playClack(.9);
  setTimeout(() => { if (selected === b) { b.phase = 'present'; playClack(.4); } }, 280);
  showPanel(b);
}

function putBack(b) {
  b.phase = 'return';
  b.tPos = b.base.clone().add(new THREE.Vector3(0, .3, 8));
  b.tQuat.copy(BACK_ROT);
  setTimeout(() => { if (b.phase === 'return') { b.phase = null; b.tPos = b.base.clone(); playClack(.6); } }, 380);
  if (selected === b) { selected = null; hidePanel(); }
}

function step(dir) {
  if (!shelf) return;
  const list = shelf.boxes;
  const cur = selected || hovered;
  const i = cur ? (cur.index + dir + list.length) % list.length : 0;
  selected ? select(list[i]) : setHover(list[i]);
}

const canvas = $('#gl');
canvas.addEventListener('pointermove', (e) => {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pointer.x = ndc.x; pointer.y = ndc.y;
  tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 18}px)`;
  if (drag) {
    selected.spin += (e.clientX - drag.x) * .012;
    drag.moved += Math.abs(e.clientX - drag.x);
    drag.x = e.clientX;
    return;
  }
  if (!selected) setHover(pick());
});
canvas.addEventListener('pointerdown', (e) => {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (selected && pick() === selected) { drag = { x: e.clientX, moved: 0 }; canvas.setPointerCapture(e.pointerId); }
});
canvas.addEventListener('pointerup', (e) => {
  if (drag) { const moved = drag.moved; drag = null; if (moved > 4) return; }
  const b = pick();
  if (b) select(b);
  else if (selected) putBack(selected);
});
canvas.addEventListener('pointerleave', () => { if (!selected) setHover(null); });
addEventListener('keydown', (e) => {
  if (e.target.matches('textarea, input')) return;
  if (e.key === 'Escape' && selected) putBack(selected);
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'Enter' && hovered && !selected) select(hovered);
});

// --- Infopanel ----------------------------------------------------------------------
const panel = $('#panel');
function showPanel(b) {
  const g = b.game, m = g.meta;
  panel.innerHTML = `
    <button class="x" aria-label="Zurückstellen">×</button>
    <div class="kicker">${esc(b.sys.name)} · ${g.year}</div>
    <h2>${esc(g.title)}</h2>
    <dl>
      <dt>Entwickler</dt><dd>${esc(g.developer || '–')}</dd>
      <dt>Publisher</dt><dd>${esc(g.publisher || '–')}</dd>
      <dt>Genre</dt><dd>${esc(g.genre || '–')}</dd>
    </dl>
    ${m.desc ? `<p class="desc">${esc(m.desc)}</p><p class="src">Text: <a href="${esc(m.source)}" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA)</p>` : ''}
    <label class="own"><input type="checkbox" ${g.owned ? 'checked' : ''}><span>In meiner Sammlung</span></label>
    <label class="note"><span>Meine Erinnerung</span><textarea placeholder="Mit wem hast du es gespielt?">${esc(g.note)}</textarea></label>
    <p class="hint">Hülle ziehen zum Drehen · ← → blättern · Esc stellt zurück</p>`;
  panel.querySelector('.x').onclick = () => putBack(b);
  panel.querySelector('.own input').onchange = (e) => {
    g.owned = e.target.checked;
    persist(g);
    b.spineTex.image = spineCanvas(g, b.sys, g.meta, g.owned);
    b.spineTex.needsUpdate = true;
    b.tagTex.image = tagCanvas(g.year, g.owned);
    b.tagTex.needsUpdate = true;
  };
  panel.querySelector('textarea').oninput = (e) => { g.note = e.target.value; persist(g); };
  panel.classList.add('open');
  document.body.classList.add('inspecting');
}
function hidePanel() { panel.classList.remove('open'); document.body.classList.remove('inspecting'); }
function persist(g) { local[g.id] = { owned: g.owned, note: g.note }; saveLocal(); }

// --- Klang (synthetisch, Web Audio) --------------------------------------------------
let audio;
function playClack(vol = 1) {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const buf = audio.createBuffer(1, audio.sampleRate * .06, audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * .12));
    const src = audio.createBufferSource();
    src.buffer = buf;
    const bp = Object.assign(audio.createBiquadFilter(), { type: 'bandpass' });
    bp.frequency.value = 1800 + Math.random() * 600;
    bp.Q.value = 1.2;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(.18 * vol, t);
    src.connect(bp).connect(gain).connect(audio.destination);
    src.start(t);
  } catch {}
}

// --- Systemwahl ------------------------------------------------------------------------
const nav = $('#systems');
nav.innerHTML = ORDER.filter(id => games.some(g => g.system === id))
  .map(id => `<button data-sys="${id}">${SYSTEMS[id].name}</button>`).join('');
nav.addEventListener('click', (e) => {
  const b = e.target.closest('[data-sys]');
  if (b) location.hash = b.dataset.sys.toLowerCase();
});

async function show(sysId) {
  if (selected) putBack(selected);
  nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.sys === sysId));
  const swap = async () => {
    const next = await buildShelf(sysId);
    shelf?.dispose();
    shelf = next;
    hovered = null;
    frameCamera();
    camPos.copy(camBase).add(new THREE.Vector3(0, 6, 60));   // Kamerafahrt hinein
    document.body.classList.add('ready');
  };
  // Überblenden nur beim Wechsel; beim ersten Laden gibt es nichts zu überblenden.
  if (shelf && document.startViewTransition) {
    const vt = document.startViewTransition(swap);
    setTimeout(() => vt.skipTransition(), 1500);   // Absicherung, falls der Browser keine Frames liefert
    await vt.updateCallbackDone.catch(swap);
  } else {
    await swap();
  }
}
window.__regal = { camera, camBase, camLook, get shelf() { return shelf; } };   // zum Debuggen in der Konsole
const fromHash = () => ORDER.find(id => id.toLowerCase() === location.hash.slice(1)) || 'PS1';
addEventListener('hashchange', () => show(fromHash()));

let resizeT;
addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return;
  camera.aspect = viewAspect();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  frameCamera();
  // Fächeraufteilung neu berechnen, wenn sich das Format deutlich ändert
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (shelf && Math.abs(Math.log(camera.aspect / shelf.aspect)) > .25) show(shelf.sysId);
  }, 250);
});

// --- Animationsschleife -----------------------------------------------------------------
const timer = new THREE.Timer();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const damp = (k, dt) => 1 - Math.exp(-k * dt);
let fpsT = 0, fpsN = 0;

renderer.setAnimationLoop((now) => {
  if (!innerWidth || !innerHeight) return;   // versteckter Tab: nichts zu zeichnen
  timer.update(now);
  const dt = Math.min(timer.getDelta(), .05);
  const t = timer.getElapsed();

  // Kamera: sanftes Mitschwenken mit der Maus
  if (shelf) {
    if (!Number.isFinite(camPos.x + camPos.y + camPos.z)) camPos.copy(camBase);
    const target = camBase.clone().add(new THREE.Vector3(pointer.x * 3, pointer.y * 1.5, 0));
    camPos.lerp(target, damp(selected ? 1.5 : 2.5, dt));
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    let lit = 0;
    for (const b of shelf.boxes) {
      let pos = b.tPos, quat = b.tQuat;
      if (b.phase === 'present') {
        const p = presentPose(b);
        pos = p.pos.add(new THREE.Vector3(0, Math.sin(t * 1.3) * .25, 0));
        tmpE.set(.04 + pointer.y * .08, -Math.PI / 2 + .28 + b.spin + pointer.x * .12, Math.sin(t * .9) * .015);
        quat = tmpQ.setFromEuler(tmpE);
        uFocus.value += (p.dist - uFocus.value) * damp(4, dt);
        // Licht von oben links vorn auf die Hülle richten
        const center = b.mesh.position.clone().addScaledVector(p.up, b.h / 2);
        inspect.target.position.copy(center);
        inspect.position.copy(center).addScaledVector(p.fwd, -p.dist * .6).addScaledVector(p.up, p.dist * .45).addScaledVector(p.right, -p.dist * .3);
        lit = inspect.position.distanceTo(center);
      } else if (!b.phase) {
        const hov = b === hovered;
        pos = hov ? b.base.clone().add(new THREE.Vector3(0, 0, 1.4)) : b.base;
        quat = hov ? tmpQ.setFromEuler(tmpE.set(.12, -Math.PI / 2, 0)) : b.tQuat;
      }
      b.mesh.position.lerp(pos, damp(b.phase === 'present' ? 5 : 11, dt));
      b.mesh.quaternion.slerp(quat, damp(b.phase === 'present' ? 5 : 11, dt));
    }

    inspect.intensity += ((lit ? 9 * lit * lit : 0) - inspect.intensity) * damp(lit ? 4 : 8, dt);

    // Tiefenunschärfe: beim Präsentieren wird das Regal dahinter weich
    const focusShelf = camBase.distanceTo(camLook);
    if (!selected) uFocus.value += (focusShelf - uFocus.value) * damp(3, dt);
    uFocal.value += ((selected ? 14 : 90) - uFocal.value) * damp(3, dt);
    uBokeh.value += ((selected ? 3 : 0) - uBokeh.value) * damp(3, dt);
  }

  pipeline.render();

  fpsN++; fpsT += dt;
  if (fpsT > 1) { $('#fps').textContent = `${Math.round(fpsN / fpsT)} fps`; fpsN = 0; fpsT = 0; }
});

await document.fonts.load('800 40px "Barlow Condensed"');
await document.fonts.load('600 40px "Barlow Condensed"');
show(fromHash());
