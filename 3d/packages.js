// Verpackungen als 3D-Modelle. Jede Funktion baut eine Gruppe mit Drehpunkt unten mittig;
// die Vorderseite zeigt nach +x, der Rücken nach +z (wie bei einem BoxGeometry-Quader).
//
//   card  Pappschachtel (SNES, N64, PC-Big-Box)
//   jewel Jewel Case: klare Hülle, Papier-Inlay, schwarze Schale (PS1, Dreamcast)
//   dvd   Abgerundete Kunststoffhülle in Systemfarbe mit Cover unter Folie (PS2 bis PS5)

import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const EPS = .02;   // Abstand von Aufdrucken zur Oberfläche, gegen Z-Fighting

const darker = (hex, f) => new THREE.Color(hex || '#555555').multiplyScalar(f);

// Fläche mit Blick nach +x (Vorderseite), -x (Rückseite) oder +z (Rücken)
function face(w, h, mat, dir) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  if (dir === '+x') m.rotation.y = Math.PI / 2;
  if (dir === '-x') m.rotation.y = -Math.PI / 2;
  if (dir === '-z') m.rotation.y = Math.PI;
  return m;
}

export function makePackage(sys, w, { cover, spine, tint }, keep) {
  const { d, h } = sys;
  const g = new THREE.Group();
  const put = (mesh, x, y, z, shadow = true) => {
    keep(mesh.geometry);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  if (sys.pack === 'card') {
    // Pappe: matt, Seiten bedruckt statt grauer Kanten
    const edge = keep(new THREE.MeshStandardNodeMaterial({ color: darker(tint, .6), roughness: .85 }));
    const front = keep(new THREE.MeshStandardNodeMaterial({ map: cover, roughness: .72 }));
    const back = keep(new THREE.MeshStandardNodeMaterial({ map: cover, color: '#4a4744', roughness: .8 }));
    const side = keep(new THREE.MeshStandardNodeMaterial({ map: spine, roughness: .75 }));
    put(new THREE.Mesh(new THREE.BoxGeometry(d, h, w), [front, back, edge, edge, side, side]), 0, h / 2, 0);
    return g;
  }

  if (sys.pack === 'jewel') {
    // Schwarze Trägerschale hinten, davor das Inlay, außen die klare Hülle
    const tray = keep(new THREE.MeshStandardNodeMaterial({ color: '#0d0d0f', roughness: .5 }));
    put(new THREE.Mesh(new THREE.BoxGeometry(d * .55, h - .15, w - .15), tray), -d * .2, h / 2, 0);
    const paper = keep(new THREE.MeshStandardNodeMaterial({ map: cover, roughness: .6 }));
    put(face(w - .55, h - .25, paper, '+x'), d / 2 - .08, h / 2, -.2, false);
    const spinePaper = keep(new THREE.MeshStandardNodeMaterial({ map: spine, roughness: .6 }));
    put(face(d - .18, h - .25, spinePaper, '+z'), 0, h / 2, w / 2 - .07, false);
    // Scharnier links an der Vorderseite
    const hinge = keep(new THREE.MeshPhysicalNodeMaterial({ color: '#d5d9de', roughness: .15, transparent: true, opacity: .55 }));
    put(new THREE.Mesh(new THREE.BoxGeometry(.18, h - .2, .35), hinge), d / 2 - .1, h / 2, w / 2 - .3, false);
    // Klare Hülle. Transparenz statt Transmission: die verträgt sich in three.js 0.186
    // nicht mit den Spiegel-Reflektoren (Texturgrößen beim Kopieren passen nicht).
    const glass = keep(new THREE.MeshPhysicalNodeMaterial({
      color: '#ffffff', roughness: .05, metalness: 0, transparent: true, opacity: .035, depthWrite: false,
      clearcoat: .7, clearcoatRoughness: .03, envMapIntensity: .4,
    }));
    put(new THREE.Mesh(new RoundedBoxGeometry(d, h, w, 3, .06), glass), 0, h / 2, 0, false);
    return g;
  }

  // DVD/Blu-ray: Kunststoff in Systemfarbe, Cover unter glänzender Folie
  const r = Math.min(.22, d * .3);
  const plastic = keep(new THREE.MeshPhysicalNodeMaterial({ color: sys.shell || '#111', roughness: .4, clearcoat: .4, clearcoatRoughness: .25 }));
  put(new THREE.Mesh(new RoundedBoxGeometry(d, h, w, 4, r), plastic), 0, h / 2, 0);
  const sleeve = (map, tintCol = '#ffffff') => keep(new THREE.MeshPhysicalNodeMaterial({
    map, color: tintCol, roughness: .5, clearcoat: 1, clearcoatRoughness: .06,
  }));
  const m = r + .05;
  put(face(w - 2 * m, h - 2 * m, sleeve(cover), '+x'), d / 2 + EPS, h / 2, 0, false);
  put(face(w - 2 * m, h - 2 * m, sleeve(cover, '#3a3a3a'), '-x'), -d / 2 - EPS, h / 2, 0, false);
  put(face(d - 2 * r, h - 2 * m, sleeve(spine), '+z'), 0, h / 2, w / 2 + EPS, false);
  return g;
}
