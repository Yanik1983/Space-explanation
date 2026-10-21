// מצייר מראש את השמיים כפי שהם נראים מהשמש, מתוך הגלקסיה שבנויה מתמונת האבל (js/photo-galaxy.js) – אותה גלקסיה
// שרואים מבחוץ באתר, כך שבפנים ובחוץ זה עולם אחד:
//   node tools/paint-sky-photo.mjs && python3 tools/save-sky.py galaxy-photo
//   node tools/paint-sky-photo.mjs --haze-only && python3 tools/save-sky.py galaxy-photo-haze   (מה שהאתר משתמש בו)
// התוצאה: textures/sky/galaxy-photo.jpg (4096×2048) ו־galaxy-photo-2k.jpg. השיטה כמו ב־tools/paint-sky.mjs
// (זוהר רך, מיליוני כוכבים זעירים ואבק כהה), רק שהכוכבים באים מהתמונה.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { seeded } from '../js/galaxy.js';
import { GAL_SUN_R, PHOTO_W, PHOTO_ROT, diskStar, bulgeStar, BULGE_SHARE } from '../js/photo-galaxy.js';

const R0 = GAL_SUN_R;
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const W = 4096, H = 2048;
// --haze-only: רק הזוהר של הפס והאבק, בלי הכוכבים הקטנים. באתר הכוכבים מצוירים בנפרד כנקודות חדות (שלא נמרחות
// כשהתמונה נמתחת על כל השמיים), והתמונה הזאת נותנת רק את הזוהר הרך: textures/sky/galaxy-photo-haze.jpg
const HAZE_ONLY = process.argv.includes('--haze-only');
const NAME = HAZE_ONLY ? 'galaxy-photo-haze' : 'galaxy-photo';
const THICK = 1.5; // הפס בשמיים קצת עבה יותר מהדיסק, כמו שהוא נראה באמת

// הפיקסלים של התמונה, מוקטנת ל־512×512 כמו באתר (RGBA)
const px = execFileSync('python3', ['-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA').resize((${PHOTO_W}, ${PHOTO_W}), Image.BILINEAR)
sys.stdout.buffer.write(im.tobytes())
`, path.join(root, 'textures/sky/m101-1k.jpg')], { maxBuffer: 1 << 26 });

const random = seeded(2026);
const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
console.time('build');
// הכוכבים, מסובבים כמו באתר (כך שהשמש ב־(0, 0, R0)), בצבע מנורמל (הבהירות באה מהצפיפות)
const N = 3000000, NB = Math.round(N * BULGE_SHARE);
const stars = { pos: new Float32Array((N + NB) * 3), col: new Float32Array((N + NB) * 3), size: { length: N + NB } };
const cr = Math.cos(PHOTO_ROT), sr = Math.sin(PHOTO_ROT);
let m = 0;
const add = (st, k) => {
  stars.pos[m * 3] = st.x * cr + st.z * sr;
  stars.pos[m * 3 + 1] = st.y;
  stars.pos[m * 3 + 2] = -st.x * sr + st.z * cr;
  stars.col[m * 3] = st.r * k; stars.col[m * 3 + 1] = st.g * k; stars.col[m * 3 + 2] = st.b * k;
  m++;
};
while (m < N) {
  const st = diskStar(px, random, gauss);
  if (!st) continue;
  add(st, 1 / Math.max(0.05, 0.3 * st.r + 0.55 * st.g + 0.15 * st.b));
}
while (m < N + NB) add(bulgeStar(random, gauss), 0.45); // הבליטה צפופה מאוד – כל כוכב בה חלש יותר
console.timeEnd('build');
const NS = N + NB;

// כיוון מהשמש → מקום במפה (ברזולוציה כלשהי)
function project(bag, i, thick, w, h) {
  const x = bag.pos[i * 3], y = bag.pos[i * 3 + 1] * thick, z = bag.pos[i * 3 + 2] - R0;
  const d = Math.hypot(x, y, z);
  const u = ((Math.atan2(z, -x) / (2 * Math.PI)) % 1 + 1) % 1;
  return [u * w, (Math.acos(y / d) / Math.PI) * h, d];
}

// כתם רך (1 - מרחק²)², כולל מעבר בין קצה שמאל לקצה ימין
function splat(w, h, px, py, rad, fn) {
  const r2 = rad * rad;
  for (let y = Math.max(0, Math.floor(py - rad)); y <= Math.min(h - 1, Math.ceil(py + rad)); y++) {
    for (let xx = Math.floor(px - rad); xx <= Math.ceil(px + rad); xx++) {
      const q = ((xx - px) ** 2 + (y - py) ** 2) / r2;
      if (q >= 1) continue;
      fn(y * w + ((xx % w) + w) % w, (1 - q) * (1 - q));
    }
  }
}

// ---- רעש וספיגה ----
// רעש "עננים" שחוזר על עצמו במעבר בין קצה שמאל לימין
const hash = (x, y) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vnoise = (x, y, period) => {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => hash(((i % period) + period) % period, j);
  return (h(x0, y0) * (1 - sx) + h(x0 + 1, y0) * sx) * (1 - sy) + (h(x0, y0 + 1) * (1 - sx) + h(x0 + 1, y0 + 1) * sx) * sy;
};
const fbm = (u, v) => {
  let s = 0, a = 0.5, f = 8;
  for (let o = 0; o < 6; o++) {
    s += a * vnoise(u * f, v * f * 0.5, f);
    a *= 0.5;
    f *= 2;
  }
  return s;
};
// אבק בין הכוכבים בולע אור: ככל שהדרך אל הכוכב עוברת יותר בתוך שכבת האבק הדקה של הדיסק, הוא חלש יותר.
// כך הדיסק הרחוק לא נראה כקו דק ובהיר, והמרכז מוסתר חלקית – בדיוק כמו בשמיים האמיתיים. העננים (רעש) הופכים את זה לכתמים.
const DUST_H = 0.03 * R0, KAPPA = 1 / (0.3 * R0);
function extinction(bag, i, px, py, w, h) {
  const x = bag.pos[i * 3], y = bag.pos[i * 3 + 1], z = bag.pos[i * 3 + 2] - R0;
  const d = Math.hypot(x, y, z);
  const inside = DUST_H / Math.hypot(y, DUST_H);
  // עננים: באזורים מסוימים האבק סמיך, ובאחרים יש "חלונות" שקופים
  const patch = 0.5 + Math.max(0, Math.min(2, (fbm(px / w * 2, py / h * 2) - 0.35) * 4));
  return Math.exp(-KAPPA * d * inside * patch);
}

// ---- 1. הזוהר הרך, ב־1024×512 ----
console.time('haze');
const w1 = 1024, h1 = 512;
const haze = new Float32Array(w1 * h1 * 3);
// כל הכוכבים, בכתמים קטנים (כדי שהזוהר יהיה חלק ולא "צמר גפן"), באותה בהירות כוללת כמו הציור הקודם
const per = 60000 / NS * 5;
const hazeStar = (a, grow) => (i) => {
  const [px, py, d] = project(stars, i, THICK, w1, h1);
  // כוכבים קרובים לא נכנסים לזוהר (הם מצוירים בנפרד כנקודות): הדיסק עבה, והם היו ממלאים את כל השמיים בערפל
  if (d < 0.3 * R0) return;
  const rad = Math.min(2.6, Math.max(1.2, (0.7 * R0) / d)) * grow;
  const k = a * per * extinction(stars, i, px, py, w1, h1) * (Math.hypot(stars.pos[i * 3], stars.pos[i * 3 + 2]) < 0.35 * R0 ? 0.45 : 1);
  const r = stars.col[i * 3] * k, g = stars.col[i * 3 + 1] * k, b = stars.col[i * 3 + 2] * k;
  splat(w1, h1, px, py, rad, (p, f) => { haze[p * 3] += r * f; haze[p * 3 + 1] += g * f; haze[p * 3 + 2] += b * f; });
};
for (let i = 0; i < NS; i++) hazeStar(0.09, 1)(i);
for (let i = 0; i < NS; i += 4) hazeStar(0.007 * 4, 4)(i); // הזוהר הרחב חלש יותר מאשר ב־paint-sky.mjs: הדיסק כאן עבה, והזוהר כיסה את כל השמיים
console.timeEnd('haze');

// מגדילים לרזולוציה המלאה (דגימה דו־ליניארית)
const buf = new Float32Array(W * H * 3);
for (let y = 0; y < H; y++) {
  const sy = Math.min(h1 - 1.001, Math.max(0, (y + 0.5) * h1 / H - 0.5));
  const y0 = Math.floor(sy), fy = sy - y0;
  for (let x = 0; x < W; x++) {
    const sx = (x + 0.5) * w1 / W - 0.5;
    const x0 = Math.floor(sx), fx = sx - x0;
    const a = ((x0 % w1) + w1) % w1, b = (a + 1) % w1;
    for (let c = 0; c < 3; c++) {
      const v = (haze[(y0 * w1 + a) * 3 + c] * (1 - fx) + haze[(y0 * w1 + b) * 3 + c] * fx) * (1 - fy) +
        (haze[((y0 + 1) * w1 + a) * 3 + c] * (1 - fx) + haze[((y0 + 1) * w1 + b) * 3 + c] * fx) * fy;
      buf[(y * W + x) * 3 + c] = v;
    }
  }
}

// ---- 2. מיליוני כוכבים זעירים (לא בגרסת "זוהר בלבד": שם הכוכבים מצוירים באתר עצמו כנקודות חדות) ----
if (!HAZE_ONLY) {
console.time('stars');
// כל כוכב מתחלק בין ארבעת הפיקסלים הקרובים (כך שגם כוכב "בין פיקסלים" נראה חד ולא מרובע)
const dot = (px, py, r, g, b) => {
  const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5), fx = px - 0.5 - x0, fy = py - 0.5 - y0;
  for (const [dx, dy, f] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const yy = y0 + dy;
    if (yy < 0 || yy >= H) continue;
    const p = yy * W + (((x0 + dx) % W) + W) % W;
    buf[p * 3] += r * f; buf[p * 3 + 1] += g * f; buf[p * 3 + 2] += b * f;
  }
};
for (let i = 0; i < NS; i++) {
  const [px, py, d] = project(stars, i, THICK, W, H);
  if (d < 1) continue;
  // בהירות: כוכבים קרובים בהירים יותר; פיזור רחב בין חלשים לבהירים, כמו בשמיים האמיתיים
  const lum = 0.16 * Math.min(6, (0.6 * R0) / d) * (0.25 + 1.75 * random() ** 6);
  const crowd = Math.hypot(stars.pos[i * 3], stars.pos[i * 3 + 2]) < 0.35 * R0 ? 0.5 : 1;
  const k = lum * crowd * extinction(stars, i, px, py, W, H);
  const r = stars.col[i * 3] * k, g = stars.col[i * 3 + 1] * k, b = stars.col[i * 3 + 2] * k;
  if (d < 0.08 * R0) splat(W, H, px, py, 1.6, (p, f) => { buf[p * 3] += r * f; buf[p * 3 + 1] += g * f; buf[p * 3 + 2] += b * f; });
  else dot(px, py, r, g, b);
}
// כוכבים קרובים מכל הכיוונים (לא רק בפס): השכנים שלנו, בכל השמיים
for (let i = 0; i < 1200000; i++) {
  const u = random(), cz = random() * 2 - 1;
  const t = random();
  const lum = 0.025 + 0.6 * t ** 16;
  const warm = random();
  const col = warm < 0.25 ? [1, 0.82, 0.62] : warm < 0.55 ? [1, 0.95, 0.88] : [0.82, 0.88, 1];
  dot(u * W, (Math.acos(cz) / Math.PI) * H, col[0] * lum, col[1] * lum, col[2] * lum);
}
console.timeEnd('stars');
}

// ---- 3. האבק הכהה ----
console.time('dust');
const shade = new Float32Array(W * H).fill(1);
// עננים כהים של אבק בתוך הפס, ברזולוציה המלאה, מתוחים לאורך הפס (כמו בצילומים) – זה מה שנותן לו מרקם
const clouds = (u, v) => {
  let s = 0, a = 0.5, f = 32;
  for (let o = 0; o < 5; o++) {
    s += a * vnoise(u * f + 17.3 * o, v * f * 1.6, f);
    a *= 0.5;
    f *= 2;
  }
  return s;
};
for (let y = 0; y < H; y++) {
  const band = Math.exp(-(((y / H - 0.5) / 0.045) ** 2));
  if (band < 0.02) continue;
  for (let x = 0; x < W; x++) {
    const t = Math.min(1, Math.max(0, (clouds(x / W, y / H) - 0.5) / 0.22));
    shade[y * W + x] *= 1 - 0.7 * band * t * t * (3 - 2 * t);
  }
}
console.timeEnd('dust');

// ---- חשיפה: האזורים הבהירים בפס מגיעים לבהירות קבועה, בלי קשר למספר הכוכבים ----
{
  const lum = [];
  for (let y = Math.floor(H * 0.4); y < H * 0.6; y += 2) for (let x = 0; x < W; x += 2) {
    const p = y * W + x;
    lum.push((buf[p * 3] + buf[p * 3 + 1] + buf[p * 3 + 2]) / 3 * Math.max(0.25, shade[p]));
  }
  lum.sort((a, b) => a - b);
  const k = 1.0 / lum[Math.floor(lum.length * 0.96)];
  console.log('exposure', k.toFixed(3));
  for (let p = 0; p < buf.length; p++) buf[p] *= k;
}

// ---- מספרים → צבעים, בלי "שריפה" של האזורים הבהירים ----
const out = Buffer.alloc(W * H * 3);
for (let p = 0; p < W * H; p++) {
  const s = Math.max(0.25, shade[p]);
  // החזקה 0.8 מעלה מעט את האזורים החלשים בפס, בלי לשרוף את המרכז
  for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.round(255 * (1 - Math.exp(-((buf[p * 3 + c] * s) ** 0.8))));
}
const raw = path.join(root, `textures/sky/${NAME}.raw`);
fs.writeFileSync(raw, out);
console.log('wrote', raw, W, H);
