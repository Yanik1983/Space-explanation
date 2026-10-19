// טקסטורות של כוכבי הלכת.
// - כדור הארץ והירח: תמונות אמיתיות (מבוססות על צילומי נאס"א) מתוך הדוגמאות של three.js, בתיקייה textures/.
// - כוכב חמה, מאדים, צדק, שבתאי, אורנוס ונפטון: מפות אמיתיות (Planet Pixel Emporium, מבוססות על צילומי נאס"א).
// - השמש: פני השטח מתוך מודל תלת־ממדי חופשי (CC BY, ראו README). נוגה ופלוטו: מחושבים (js/texgen.js) – לנוגה רואים את העננים ולפלוטו את ה"לב", כמו בצילומים.
// בכל מקרה קודם מוצגת גרסה קטנה ומחושבת שנטענת מיד, ואז היא מוחלפת. אם תמונה לא נטענת – Web Worker
// מייצר במקומה גרסה מחושבת מפורטת.

import * as THREE from 'three';
import { generate, ringProfile, SIZES } from './texgen.js';

function canvasFrom(rgba, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return canvas;
}

// גרסה מהירה (256×128) שמוצגת מיד בטעינה
export function planetTexture(id) {
  const { rgba } = generate(id, 256, 128);
  const tex = new THREE.CanvasTexture(canvasFrom(rgba, 256, 128));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dataTexture(data, w, h, srgb) {
  const tex = new THREE.DataTexture(data, w, h);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// מייצר את הטקסטורות המפורטות ברקע, אחת אחרי השנייה, וקורא ל־onReady(id, map, bump) לכל אחת
export function loadDetailed(ids, onReady) {
  const queue = ids.filter((id) => SIZES[id]);
  let worker = null;
  try {
    worker = new Worker(new URL('./texture-worker.js', import.meta.url), { type: 'module' });
  } catch {
    return; // דפדפן ישן: נשארים עם הגרסה הקטנה
  }
  const next = () => worker.postMessage({ id: queue.shift() });
  worker.onmessage = (e) => {
    const { id, w, h, rgba, bump } = e.data;
    onReady(id, dataTexture(rgba, w, h, true), bump && dataTexture(bump, w, h, false));
    if (queue.length) next();
    else worker.terminate();
  };
  worker.onerror = () => worker.terminate();
  if (queue.length) next();
}

const loader = new THREE.TextureLoader();

// מפות אמיתיות: map = צבע, bump = מפת גובה (הרים ומכתשים)
const PHOTOS = {
  sun: { map: 'sun_1024.jpg' },
  mercury: { map: 'mercury_1024.jpg', bump: 'mercury_bump_1024.jpg' },
  mars: { map: 'mars_1024.jpg', bump: 'mars_bump_1024.jpg' },
  jupiter: { map: 'jupiter_1024.jpg' },
  saturn: { map: 'saturn_1024.jpg' },
  uranus: { map: 'uranus_1024.jpg' },
  neptune: { map: 'neptune_1024.jpg' },
};
export const PHOTO_IDS = Object.keys(PHOTOS);

function loadTexture(path, srgb) {
  return new Promise((resolve, reject) => {
    loader.load(path, (tex) => {
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      resolve(tex);
    }, undefined, reject);
  });
}

// טוען את המפות האמיתיות. onReady(id, map, bump) כשהן מוכנות, onFail(id) אם משהו לא נטען
export function loadPhotos(onReady, onFail) {
  for (const [id, p] of Object.entries(PHOTOS)) {
    Promise.all([loadTexture(`textures/${p.map}`, true), p.bump ? loadTexture(`textures/${p.bump}`, false) : null])
      .then(([map, bump]) => onReady(id, map, bump))
      .catch(() => onFail(id));
  }
}

// הטבעות של שבתאי: צבעים מצילום, שקיפות לפי הצפיפות של כל טבעת
export function ringPhoto(onReady) {
  loadTexture('textures/saturn_ring.png', true).then((tex) => {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    onReady(tex);
  }).catch(() => {});
}

// השמיים: תמונה אמיתית של שביל החלב (cube map)
export function skyTexture() {
  const tex = new THREE.CubeTextureLoader()
    .setPath('textures/sky/')
    .load(['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg']);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function imageTexture(path, srgb = true) {
  const tex = loader.load(path);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function ringTexture() {
  const tex = dataTexture(ringProfile(1024), 1024, 1, true);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export function glowTexture(inner = 'rgba(255,220,120,1)', outer = 'rgba(255,140,0,0)') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, 'rgba(255,190,80,0.55)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
