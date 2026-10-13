// יצירת טקסטורות מפורטות לכוכבי הלכת, בחישוב (בלי קבצי תמונה).
// הקובץ "טהור" (בלי three.js) כדי שאפשר יהיה להריץ אותו גם ב־Web Worker, ברקע.
//
// generate(id, w, h) מחזיר { rgba, bump }: צבע, ומפת גובה (bump) לגופים סלעיים.
// כל נקודה בתמונה מחושבת על כדור תלת־ממדי, כך שאין "תפר" ואין עיוות בקטבים.

const DEG = Math.PI / 180;

function hash(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 0xffff;
}
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a)));

function noise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const c000 = hash(xi, yi, zi, seed), c100 = hash(xi + 1, yi, zi, seed);
  const c010 = hash(xi, yi + 1, zi, seed), c110 = hash(xi + 1, yi + 1, zi, seed);
  const c001 = hash(xi, yi, zi + 1, seed), c101 = hash(xi + 1, yi, zi + 1, seed);
  const c011 = hash(xi, yi + 1, zi + 1, seed), c111 = hash(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * xf, x10 = c010 + (c110 - c010) * xf;
  const x01 = c001 + (c101 - c001) * xf, x11 = c011 + (c111 - c011) * xf;
  const y0 = x00 + (x10 - x00) * yf, y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

function fbm(x, y, z, seed, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f, seed + i * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

// מכתשים: בכל תא של רשת תלת־ממדית יש (אולי) מכתש אחד – קערה עם שפה מוגבהת
function craters(x, y, z, scale, seed, density = 0.55) {
  x *= scale; y *= scale; z *= scale;
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let h = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = xi + dx, cy = yi + dy, cz = zi + dz;
        if (hash(cx, cy, cz, seed + 7) > density) continue;
        const px = cx + hash(cx, cy, cz, seed), py = cy + hash(cx, cy, cz, seed + 1), pz = cz + hash(cx, cy, cz, seed + 2);
        const r = 0.12 + 0.55 * hash(cx, cy, cz, seed + 3) ** 2.5;
        const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2) / r;
        if (d > 1.6) continue;
        const depth = 0.6 + 0.4 * r;
        if (d < 1) h -= depth * (1 - d * d) * 0.9;
        h += depth * 0.45 * Math.exp(-(((d - 1) / 0.22) ** 2));
      }
    }
  }
  return h;
}

// תאים (כמו גרגירים על פני השמש): מחזיר את המרחק לנקודה הקרובה ולשנייה הקרובה
function cells(x, y, z, scale, seed, out) {
  x *= scale; y *= scale; z *= scale;
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let d1 = 9, d2 = 9;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = xi + dx, cy = yi + dy, cz = zi + dz;
        const px = cx + hash(cx, cy, cz, seed), py = cy + hash(cx, cy, cz, seed + 1), pz = cz + hash(cx, cy, cz, seed + 2);
        const d = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
    }
  }
  out[0] = Math.sqrt(d1);
  out[1] = Math.sqrt(d2);
  return out;
}

const hex = (c) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
function mixInto(out, a, b, t) {
  t = clamp(t);
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
function scaleInto(out, k) {
  out[0] *= k; out[1] *= k; out[2] *= k;
  return out;
}

// מרחק זוויתי (ברדיאנים) בין נקודה לבין מרכז אזור לפי קו רוחב/אורך במעלות
function angDist(lat, lon, lat0, lon0) {
  const a = lat0 * DEG, b = lon0 * DEG;
  const c = Math.sin(lat) * Math.sin(a) + Math.cos(lat) * Math.cos(a) * Math.cos(lon - b);
  return Math.acos(clamp(c, -1, 1));
}

// פסים לפי קו רוחב: stops = [[קו רוחב במעלות, צבע], ...] מדרום לצפון
function bandColor(stops, latDeg, out) {
  if (latDeg <= stops[0][0]) return mixInto(out, stops[0][1], stops[0][1], 0);
  for (let i = 1; i < stops.length; i++) {
    if (latDeg <= stops[i][0]) {
      const t = (latDeg - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return mixInto(out, stops[i - 1][1], stops[i][1], smooth(clamp(t)));
    }
  }
  const last = stops[stops.length - 1][1];
  return mixInto(out, last, last, 0);
}
const prepStops = (s) => s.map(([l, c]) => [l, hex(c)]);

// ---------- הגופים ----------
const P = {}; // צבעים מוכנים
const C = (c) => (P[c] ||= hex(c));
const tmpC = [0, 0, 0], tmpD = [0, 0, 0], cellOut = [0, 0];

const JUPITER = prepStops([
  [-90, '#8f8a86'], [-62, '#a39a8f'], [-55, '#c9b89c'], [-48, '#b39a7c'], [-42, '#d8c8a8'],
  [-35, '#b8946d'], [-29, '#c7a47c'], [-26, '#ecdfc4'], [-19, '#e6d2b0'], [-17, '#a8693f'],
  [-10, '#b97b4e'], [-7, '#e9d8b8'], [0, '#f1e6cf'], [6, '#e4c79e'], [8, '#9c613d'],
  [16, '#a66e48'], [19, '#ead9bc'], [24, '#e4d1b1'], [26, '#b08560'], [31, '#c39c74'],
  [34, '#dccaa8'], [42, '#c2a585'], [48, '#d8c5a4'], [56, '#b4a08a'], [64, '#9c958c'], [90, '#8b8782'],
]);
const SATURN = prepStops([
  [-90, '#b8a57e'], [-60, '#c9b383'], [-40, '#d9c391'], [-28, '#cdb07a'], [-18, '#e2cf9f'],
  [-8, '#d9bf86'], [0, '#ecdcae'], [8, '#d6bb83'], [18, '#e4d2a3'], [28, '#c8aa76'],
  [40, '#d8c393'], [55, '#c2ad82'], [70, '#a99f86'], [90, '#9a9580'],
]);
const NEPTUNE = prepStops([
  [-90, '#3c5ab8'], [-70, '#4565c8'], [-55, '#2c45a0'], [-45, '#4b6ed6'], [-30, '#3f60cc'],
  [-10, '#4a6cd8'], [10, '#4366d2'], [30, '#3d5ec9'], [50, '#4a6bd3'], [90, '#3a57b6'],
]);
const URANUS = prepStops([
  [-90, '#93d0d8'], [-60, '#9fd8df'], [-30, '#a8dde3'], [0, '#acdfe5'], [30, '#a6dce2'],
  [50, '#b3e3e8'], [70, '#c4ebee'], [90, '#cdeff1'],
]);

const SHADERS = {
  sun(x, y, z, lat, lon, out) {
    cells(x, y, z, 55, 3, cellOut);
    const gran = clamp(cellOut[1] - cellOut[0]) ** 0.6; // מרכז בהיר, שוליים כהים
    const big = fbm(x * 5, y * 5, z * 5, 9, 4);
    let k = 0.72 + gran * 0.33 + (big - 0.5) * 0.35;
    // כתמי שמש ליד קווי רוחב ±15
    // קבוצות קטנות של כתמים: צל חלקי (פנומברה) ומרכז כהה (אומברה)
    for (const [la, lo, r] of [[14, 40, 1.1], [15.5, 43, 0.6], [-17, 130, 0.9], [12, 210, 0.7], [-12, 300, 1], [-13, 303.5, 0.55]]) {
      const d = angDist(lat, lon, la, lo) / (r * DEG);
      if (d < 1.8) k *= 1 - 0.35 * sstep(1.8, 1.1, d) - 0.45 * sstep(0.8, 0.35, d);
    }
    mixInto(out, C('#e2560f'), C('#ffcf5a'), k);
    if (k > 0.95) mixInto(out, out, C('#fff3c4'), (k - 0.95) * 4);
    return 0;
  },
  mercury(x, y, z, lat, lon, out) {
    let h = craters(x, y, z, 6, 11) * 0.5 + craters(x, y, z, 16, 12, 0.6) * 0.25 + craters(x, y, z, 40, 13, 0.7) * 0.1;
    h += (fbm(x * 4, y * 4, z * 4, 14) - 0.5) * 0.6;
    const caloris = angDist(lat, lon, 30, 160) / (17 * DEG); // אגן קלוריס הענק
    if (caloris < 1.3) h += -0.5 * (1 - caloris) * (caloris < 1) + 0.4 * Math.exp(-(((caloris - 1) / 0.12) ** 2));
    const alb = fbm(x * 3, y * 3, z * 3, 15, 4);
    mixInto(out, C('#6e6862'), C('#b2aca4'), alb * 0.9 + h * 0.25 + 0.15);
    if (caloris < 1) mixInto(out, out, C('#c2b7a6'), 0.35 * (1 - caloris));
    return h;
  },
  venus(x, y, z, lat, lon, out) {
    // עננים: זרמים מתפתלים לאורך קווי הרוחב, עם צורת V עדינה
    const wx = fbm(x * 2, y * 2, z * 2, 21, 4);
    const latV = lat + (wx - 0.5) * 0.5 + Math.abs(Math.sin(lon * 0.5)) * 0.25;
    const s = fbm(Math.cos(latV) * 3 + x * 2, latV * 9, Math.sin(latV) * 3 + z * 2, 22, 5);
    mixInto(out, C('#c9a96a'), C('#f3e5bd'), s * 1.3 - 0.1);
    mixInto(out, out, C('#e8d2a0'), 0.25 * sstep(0.5, 1.2, Math.abs(lat)));
    return 0;
  },
  mars(x, y, z, lat, lon, out) {
    const latD = lat / DEG, lonD = lon / DEG;
    let h = (fbm(x * 3, y * 3, z * 3, 61) - 0.5) * 0.9;
    h += craters(x, y, z, 7, 62, 0.4) * 0.35 + craters(x, y, z, 20, 63, 0.5) * 0.12;
    // תרסיס והר אולימפוס
    h += 0.6 * Math.exp(-((angDist(lat, lon, 2, 255) / (28 * DEG)) ** 2));
    const om = angDist(lat, lon, 18.6, 226) / (5.5 * DEG);
    h += 1.6 * Math.exp(-(om * om)) - 0.25 * Math.exp(-(((om - 1.05) / 0.12) ** 2));
    // עמק מרינר – קניון ענק
    if (lonD > 255 && lonD < 330) {
      const along = sstep(255, 268, lonD) * sstep(330, 318, lonD);
      const w = 2.2 + 1.5 * fbm(x * 9, y * 9, z * 9, 64, 3);
      h -= 1.1 * along * Math.exp(-(((latD + 8 + Math.sin(lonD * 0.2) * 1.5) / w) ** 2));
    }
    // אגן הלס
    h -= 0.9 * Math.exp(-((angDist(lat, lon, -42, 70) / (14 * DEG)) ** 2));
    // צבע: אזורים כהים ובהירים
    const albedo = fbm(x * 2.2, y * 2.2, z * 2.2, 65, 5);
    const dark = sstep(0.5, 0.62, albedo) * (1 - sstep(35, 60, Math.abs(latD)) * 0.5);
    mixInto(out, C('#d0865a'), C('#b8582f'), fbm(x * 6, y * 6, z * 6, 66, 4) * 1.2 - 0.1);
    mixInto(out, out, C('#5f3324'), dark * 0.75);
    scaleInto(out, 0.9 + h * 0.12);
    // כיפות קרח (הצפונית גדולה יותר)
    const ragged = (fbm(x * 8, y * 8, z * 8, 67, 3) - 0.5) * 6;
    const cap = Math.max(sstep(77, 80, latD + ragged), sstep(-81, -84, latD + ragged));
    mixInto(out, out, C('#f4efe8'), cap * 0.95);
    return h;
  },
  jupiter(x, y, z, lat, lon, out) {
    const latD = lat / DEG;
    // מערבולות בגבולות בין הפסים
    const w1 = fbm(x * 3, y * 9, z * 3, 71, 4);
    const w2 = fbm(x * 10 + w1 * 2, y * 30, z * 10 + w1 * 2, 72, 4);
    const latW = latD + (w1 - 0.5) * 3 + (w2 - 0.5) * 2.2;
    bandColor(JUPITER, latW, out);
    const fine = fbm(x * 25, y * 90, z * 25, 73, 3);
    scaleInto(out, 0.9 + fine * 0.2);
    // "פסטונים" כחלחלים בשולי האזור המשווני
    if (latD > 4 && latD < 10) {
      const f = fbm(x * 14, y * 14, z * 14, 74, 3);
      mixInto(out, out, C('#5f6e80'), sstep(0.62, 0.75, f) * 0.6);
    }
    // שרשרת אובלים לבנים בקו רוחב -33
    for (let i = 0; i < 6; i++) {
      const d = angDist(lat, lon, -33 + (i % 2), 30 + i * 52) / (2.2 * DEG);
      if (d < 1.5) mixInto(out, out, C('#f6f0e4'), sstep(1.4, 0.6, d) * 0.85);
    }
    // הכתם האדום הגדול
    const gx = ((((lon / DEG - 250 + 540) % 360) - 180)) / 12, gy = (latD + 22) / 6;
    const g = Math.sqrt(gx * gx + gy * gy);
    if (g < 1.6) {
      const swirl = fbm(x * 30 + gx, y * 30 + gy, z * 30, 75, 3);
      mixInto(out, out, C('#e8c9a4'), sstep(1.6, 1.15, g) * 0.8);
      mixInto(out, out, C('#b8502c'), sstep(1.15, 0.5, g) * (0.75 + swirl * 0.3));
    }
    return 0;
  },
  saturn(x, y, z, lat, lon, out) {
    const latD = lat / DEG;
    const w = fbm(x * 3, y * 10, z * 3, 81, 4);
    bandColor(SATURN, latD + (w - 0.5) * 2.5, out);
    scaleInto(out, 0.93 + fbm(x * 20, y * 80, z * 20, 82, 3) * 0.14);
    // המשושה בקוטב הצפוני
    if (latD > 66) {
      const r = 90 - latD;
      const a = ((lon % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6;
      const R = 13.5 / Math.cos(a);
      mixInto(out, out, C('#7e8b8a'), sstep(R + 0.6, R - 0.6, r) * 0.7);
      mixInto(out, out, C('#5d6b70'), sstep(4, 1.5, r) * 0.6);
    }
    return 0;
  },
  uranus(x, y, z, lat, lon, out) {
    const latD = lat / DEG;
    bandColor(URANUS, latD + (fbm(x * 3, y * 8, z * 3, 91, 3) - 0.5) * 3, out);
    scaleInto(out, 0.97 + fbm(x * 12, y * 50, z * 12, 92, 3) * 0.06);
    // כמה עננים בהירים
    for (const [la, lo] of [[28, 40], [32, 200], [-24, 120]]) {
      const d = angDist(lat, lon, la, lo) / (2.5 * DEG);
      if (d < 1.5) mixInto(out, out, C('#f2fbfc'), sstep(1.5, 0.3, d) * 0.6);
    }
    return 0;
  },
  neptune(x, y, z, lat, lon, out) {
    const latD = lat / DEG;
    const w = fbm(x * 4, y * 12, z * 4, 101, 4);
    bandColor(NEPTUNE, latD + (w - 0.5) * 6, out);
    scaleInto(out, 0.92 + fbm(x * 16, y * 60, z * 16, 102, 3) * 0.16);
    // הכתם הכהה הגדול ועננים לבנים לידו
    const gx = ((((lon / DEG - 120 + 540) % 360) - 180)) / 13, gy = (latD + 20) / 6.5;
    const g = Math.sqrt(gx * gx + gy * gy);
    if (g < 1.4) mixInto(out, out, C('#1c2a72'), sstep(1.4, 0.7, g) * 0.85);
    const streak = (la, lo, wl, hl) => {
      const sx = ((((lon / DEG - lo + 540) % 360) - 180)) / wl, sy = (latD - la) / hl;
      const d = sx * sx + sy * sy;
      if (d < 1) mixInto(out, out, C('#eef3ff'), (1 - d) * 0.8 * fbm(x * 40, y * 10, z * 40, 103, 2) * 1.6);
    };
    streak(-27, 120, 12, 1.4);
    streak(-42, 250, 18, 1.6);
    streak(25, 60, 22, 1.2);
    return 0;
  },
  pluto(x, y, z, lat, lon, out) {
    const latD = lat / DEG, lonD = lon / DEG;
    let h = (fbm(x * 4, y * 4, z * 4, 111) - 0.5) * 0.8 + craters(x, y, z, 9, 112, 0.35) * 0.3;
    mixInto(out, C('#b99a7c'), C('#d9c3a6'), fbm(x * 5, y * 5, z * 5, 113, 4) * 1.2 - 0.1);
    // קטולו – אזור כהה אדמדם לאורך קו המשווה
    const cth = sstep(18, 2, Math.abs(latD + 4 + Math.sin(lonD * DEG * 3) * 4)) * sstep(15, 35, lonD) * sstep(150, 125, lonD);
    mixInto(out, out, C('#4f2c20'), cth * 0.85);
    // הלב: שתי "אונות" בהירות וקצה מחודד למטה
    const lobeL = angDist(lat, lon, 22, 172) / (13 * DEG);
    const lobeR = angDist(lat, lon, 16, 200) / (15 * DEG);
    const tip = angDist(lat, lon, -2, 186) / (8 * DEG);
    const heart = Math.max(sstep(1.05, 0.85, lobeL), sstep(1.05, 0.85, lobeR) * 0.85, sstep(1.05, 0.8, tip));
    mixInto(out, out, C('#f4eee6'), heart * 0.92);
    if (lobeL < 1) h = h * 0.2 - 0.2; // ספוטניק פלניטיה: מישור חלק של קרח
    // אזור קוטבי צפוני אדמדם-בהיר
    mixInto(out, out, C('#c8a48a'), sstep(55, 75, latD) * 0.5);
    return h;
  },
};

export const SIZES = {
  sun: [1024, 512], mercury: [1024, 512], venus: [1024, 512], mars: [1024, 512],
  jupiter: [2048, 1024], saturn: [1024, 512], uranus: [512, 256], neptune: [1024, 512], pluto: [1024, 512],
};
export const HAS_BUMP = { mercury: 1, mars: 1, pluto: 1 };

// flip: לכתוב את השורות מלמטה למעלה (כמו ש־DataTexture מצפה)
export function generate(id, w, h, flip = false) {
  const shade = SHADERS[id];
  const rgba = new Uint8ClampedArray(w * h * 4);
  const bump = HAS_BUMP[id] ? new Uint8ClampedArray(w * h * 4) : null;
  const out = [0, 0, 0];
  for (let row = 0; row < h; row++) {
    const lat = Math.PI / 2 - ((row + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    const y = flip ? h - 1 - row : row;
    for (let col = 0; col < w; col++) {
      const lon = ((col + 0.5) / w) * Math.PI * 2;
      const hh = shade(cl * Math.cos(lon), sl, cl * Math.sin(lon), lat, lon, out);
      const i = (y * w + col) * 4;
      rgba[i] = out[0];
      rgba[i + 1] = out[1];
      rgba[i + 2] = out[2];
      rgba[i + 3] = 255;
      if (bump) {
        const v = clamp(0.5 + hh * 0.3) * 255;
        bump[i] = bump[i + 1] = bump[i + 2] = v;
        bump[i + 3] = 255;
      }
    }
  }
  return { rgba, bump };
}

// טבעות שבתאי: פרופיל רדיאלי לפי המבנה האמיתי (טבעות C, B, A, חלוקת קסיני, פער אנקה, טבעת F)
export function ringProfile(n) {
  const rgba = new Uint8ClampedArray(n * 4);
  // רדיוסים יחסיים מ־1.24 עד 2.33 רדיוסי שבתאי
  const r0 = 1.24, r1 = 2.33;
  for (let i = 0; i < n; i++) {
    const r = r0 + (i / (n - 1)) * (r1 - r0);
    let a = 0, b = 0.6;
    if (r < 1.53) { a = 0.12 + 0.1 * Math.sin(r * 180); b = 0.45; } // טבעת C – דקה וכהה
    else if (r < 1.95) { a = 0.75 + 0.2 * Math.sin(r * 140) * Math.sin(r * 37); b = 0.92; } // טבעת B – הכי צפופה
    else if (r < 2.03) { a = 0.05; b = 0.4; } // חלוקת קסיני
    else if (r < 2.27) { a = 0.55 + 0.12 * Math.sin(r * 160); b = 0.8; } // טבעת A
    if (r > 2.21 && r < 2.225) a = 0.05; // פער אנקה
    if (r > 2.315 && r < 2.33) { a = 0.5; b = 0.85; } // טבעת F
    const noise = hash(i, 0, 0, 5) * 0.15;
    a = clamp(a + noise - 0.07);
    const cr = 200 + b * 45, cg = 180 + b * 45, cb = 140 + b * 50;
    rgba.set([cr, cg, cb, a * 255], i * 4);
  }
  return rgba;
}
