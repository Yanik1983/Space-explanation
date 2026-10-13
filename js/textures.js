// טקסטורות פרוצדורליות שמצוירות על canvas, כדי שהאתר לא יהיה תלוי בקבצי תמונה.
// הרעש מחושב על נקודות של כדור תלת־ממדי, כך שאין "תפר" בטקסטורה.

import * as THREE from 'three';

function hash(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 0xffff;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function noise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

function fbm(x, y, z, seed, octaves = 5) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  t = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// מצייר טקסטורה אקוויטלקטנגולרית. shade(nx, ny, nz, lat, lon) מחזיר [r,g,b].
function paint(width, height, shade) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const lat = Math.PI / 2 - (y / height) * Math.PI;
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      const lon = (x / width) * Math.PI * 2;
      const rgb = shade(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon), lat, lon);
      const i = (y * width + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// כוכב לכת סלעי עם כתמים ומכתשים
function rocky(base, dark, light, seed, scale = 3) {
  const A = hex(base), D = hex(dark), L = hex(light);
  return paint(512, 256, (x, y, z) => {
    const n = fbm(x * scale, y * scale, z * scale, seed);
    const m = fbm(x * scale * 4, y * scale * 4, z * scale * 4, seed + 99, 3);
    let c = n < 0.5 ? mix(D, A, (n - 0.3) / 0.2) : mix(A, L, (n - 0.5) / 0.25);
    c = mix(c, D, Math.max(0, m - 0.62) * 2.5);
    return c;
  });
}

// ענק גזים עם פסים. bands = רשימת צבעים לפי קו רוחב
function banded(bands, seed, turbulence = 0.08, spot = null) {
  const cols = bands.map(hex);
  return paint(512, 256, (x, y, z, lat, lon) => {
    const warp = (fbm(x * 3, y * 3, z * 3, seed) - 0.5) * turbulence;
    let t = ((Math.sin(lat) + 1) / 2 + warp) * (cols.length - 1);
    t = Math.min(cols.length - 1.001, Math.max(0, t));
    const i = Math.floor(t);
    let c = mix(cols[i], cols[i + 1], smooth(t - i));
    const fine = fbm(x * 12, y * 40, z * 12, seed + 5, 3);
    c = mix(c, [255, 255, 255], (fine - 0.5) * 0.25);
    if (spot) {
      const dLat = (lat - spot.lat) / spot.h;
      let dLon = lon - spot.lon;
      if (dLon > Math.PI) dLon -= Math.PI * 2;
      dLon /= spot.w;
      const d = dLat * dLat + dLon * dLon;
      if (d < 1) c = mix(c, hex(spot.color), (1 - d) * 1.4);
    }
    return c;
  });
}

const makers = {
  sun: () => {
    const a = hex('#fff3b0'), b = hex('#ffb52e'), c = hex('#e8590c');
    return paint(512, 256, (x, y, z) => {
      const n = fbm(x * 6, y * 6, z * 6, 3);
      return n > 0.5 ? mix(b, a, (n - 0.5) * 3) : mix(c, b, (n - 0.25) * 4);
    });
  },
  mercury: () => rocky('#9a948c', '#5e5a55', '#cfc9c0', 11, 4),
  venus: () => banded(['#d9b26b', '#efd59a', '#e8c27a', '#f3dfae', '#d9b26b', '#efd59a', '#d6a95c'], 21, 0.35),
  earth: () => {
    const ocean = hex('#1f5fae'), deep = hex('#123f80'), land = hex('#3f8f3a');
    const desert = hex('#c9a865'), ice = hex('#f4f8ff');
    return paint(512, 256, (x, y, z, lat) => {
      const n = fbm(x * 2.2, y * 2.2, z * 2.2, 31);
      const polar = Math.abs(lat) > 1.2 + (n - 0.5) * 0.4;
      if (polar) return ice;
      if (n < 0.52) return mix(deep, ocean, (n - 0.3) / 0.22);
      const dry = fbm(x * 5, y * 5, z * 5, 37, 3);
      const c = mix(land, desert, (dry - 0.45) * 3 + (1 - Math.abs(lat)) * 0.3 - 0.2);
      const cloud = fbm(x * 4, y * 8, z * 4, 41, 4);
      return mix(c, [255, 255, 255], (cloud - 0.6) * 2);
    });
  },
  moon: () => rocky('#a8a8a8', '#6f6f6f', '#d6d6d6', 51, 5),
  pluto: () => {
    const tex = rocky('#c9b29a', '#7d5c45', '#eadccb', 111, 3);
    // הלב הבהיר (טומבו רג'יו) שגילתה ניו הורייזנס
    const ctx = tex.image.getContext('2d');
    ctx.fillStyle = 'rgba(250,244,236,0.92)';
    ctx.beginPath();
    ctx.arc(250, 122, 26, 0, Math.PI * 2);
    ctx.arc(290, 118, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(226, 132);
    ctx.lineTo(318, 128);
    ctx.lineTo(268, 176);
    ctx.fill();
    tex.needsUpdate = true;
    return tex;
  },
  mars: () => {
    const base = rocky('#c1440e', '#7a2a0a', '#e07a3c', 61, 3);
    // כיפות קרח בקטבים
    const ctx = base.image.getContext('2d');
    ctx.fillStyle = 'rgba(250,245,240,0.92)';
    ctx.fillRect(0, 0, 512, 14);
    ctx.fillRect(0, 244, 512, 12);
    base.needsUpdate = true;
    return base;
  },
  jupiter: () =>
    banded(
      ['#c9a27a', '#efe2c8', '#b9835a', '#f2e6cf', '#a8714a', '#efe0c0', '#c48c5e', '#ead8b8', '#b98b66'],
      71,
      0.12,
      { lat: -0.38, lon: 2.0, w: 0.32, h: 0.12, color: '#c2552f' },
    ),
  saturn: () => banded(['#d8c18c', '#efe0b4', '#cdb27a', '#f2e6c2', '#d8c18c', '#e8d6a2', '#c9ae78'], 81, 0.06),
  uranus: () => banded(['#8fd3dc', '#a6e1e8', '#9fdbe3', '#b2e6ec', '#93d6df'], 91, 0.04),
  neptune: () =>
    banded(['#2f4fc4', '#4a6be0', '#3a5bd0', '#5577e6', '#2f4fc4'], 101, 0.1, {
      lat: -0.35, lon: 4.0, w: 0.22, h: 0.1, color: '#1b2c7a',
    }),
};

export function planetTexture(id) {
  return makers[id]();
}

export function ringTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < 512; x++) {
    const t = x / 512;
    const n = noise3(t * 60, 0, 0, 7) * 0.6 + noise3(t * 200, 0, 0, 9) * 0.4;
    let a = 0.35 + n * 0.6;
    if (t > 0.62 && t < 0.67) a *= 0.1; // מרווח קסיני
    if (t < 0.05 || t > 0.97) a *= 0.3;
    const c = mix(hex('#bfa77a'), hex('#f3e7c6'), n);
    ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
    ctx.fillRect(x, 0, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
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
