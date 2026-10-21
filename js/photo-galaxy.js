// שביל החלב "מהתמונה": גלקסיה תלת־ממדית שנבנית מתמונת האבל של גלקסיית M101 (textures/sky/m101-1k.jpg, מוקטנת ל־512×512).
// משמש גם את האתר (main.js – הגלקסיה מבחוץ והכוכבים בטיסה) וגם את הכלי שמצייר מראש את השמיים כפי שהם נראים מהשמש
// (tools/paint-sky-photo.mjs), ולכן אין כאן three.js – כך העולם אחד: אותם כוכבים בדיוק מבפנים ומבחוץ.
//
// כל נקודה נבחרת לפי הבהירות של התמונה (איפה שבהיר – יותר נקודות) ומקבלת את הצבע שלה, וגובה אקראי מעל הדיסק או מתחתיו:
// הדיסק עבה, ומתעבה מאוד לכיוון המרכז. בנוסף יש בליטה: ענן של כוכבים צהבהבים בצורת ביצה פחוסה.
// הקואורדינטות הן "של התמונה": המרכז בראשית, ציר y הוא הקוטב הצפוני, ושורה 0 בתמונה היא z שלילי.
// כדי שהשמש תשב במקום הנכון, כל הגלקסיה מסובבת סביב y ב־PHOTO_ROT (ראו למטה).

import { GAL_R, GAL_SUN_R } from './galaxy.js';

export const PHOTO_W = 512; // גודל התמונה שממנה דוגמים
export const PHOTO_SIDE = GAL_R * 2.5; // רוחב התמונה ביחידות של הגלקסיה
// השמש יושבת, כמו במציאות, בערך באמצע הדרך מהמרכז לקצה, ברווח כהה יותר בין שתי זרועות (כמו "שלוחת אוריון").
// בתמונה המקום הזה נמצא בזווית 205° (0° ימינה, 90° למטה) מהמרכז. מסובבים את הגלקסיה כך שהוא יגיע ל־(0, 0, GAL_SUN_R)
export const SUN_ANGLE = (205 * Math.PI) / 180;
export const PHOTO_ROT = SUN_ANGLE - Math.PI / 2;

const lin = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);

// מנסה להגריל כוכב אחד מהדיסק. מחזיר null אם הניסיון נדחה (במקום כהה), אחרת
// { x, y, z, r, g, b, lum, rr } – מיקום, צבע (ליניארי, 0..1), בהירות הפיקסל, ומרחק מהמרכז ביחס לרדיוס הגלקסיה
export function diskStar(px, random, gauss) {
  const W = PHOTO_W;
  const cx = random() * W, cy = random() * W;
  const o = ((cy | 0) * W + (cx | 0)) * 4;
  const r8 = px[o], g8 = px[o + 1], b8 = px[o + 2];
  const lum = (0.3 * r8 + 0.55 * g8 + 0.15 * b8) / 255;
  if (random() > Math.pow(lum, 1.4) * 2.2) return null;
  const x = (cx / W - 0.5) * PHOTO_SIDE, z = (cy / W - 0.5) * PHOTO_SIDE;
  const rr = Math.hypot(x, z) / GAL_R;
  const th = (0.05 + 0.13 * Math.exp(-(rr * rr) / 0.05)) * GAL_R;
  return { x, y: gauss() * th, z, r: lin(r8), g: lin(g8), b: lin(b8), lum, rr };
}

// כוכב מהבליטה: { x, y, z, r, g, b }
export function bulgeStar(random, gauss) {
  const rr = Math.abs(gauss());
  const u = random() * 2 - 1, phi = random() * Math.PI * 2, sn = Math.sqrt(1 - u * u);
  const c = random();
  return { x: sn * Math.cos(phi) * rr * 0.14 * GAL_R, y: u * rr * 0.1 * GAL_R, z: sn * Math.sin(phi) * rr * 0.14 * GAL_R, r: 1, g: 0.72 + 0.2 * c, b: 0.42 + 0.3 * c };
}

export const BULGE_SHARE = 0.12; // כמה כוכבי בליטה ביחס לכוכבי הדיסק
export { GAL_R, GAL_SUN_R };
