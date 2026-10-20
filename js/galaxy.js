// מודל שביל החלב: איפה נמצאים הכוכבים והאבק. משמש גם את הגלקסיה התלת־ממדית באתר (main.js)
// וגם את הכלי שמצייר מראש את השמיים כפי שהם נראים מהשמש (tools/paint-sky.mjs), ולכן אין כאן three.js.
//
// הגלקסיה בנויה לפי המפות שהמדענים משרטטים מבפנים: מוט במרכז, שתי זרועות גדולות (פרסאוס
// ומגן־קנטאורוס), שתיים קטנות יותר (קשת ומרובע), ושלוחת אוריון הקטנה שעליה יושבת השמש – בין זרוע קשת
// לזרוע פרסאוס. ציר y הוא הקוטב הצפוני של הגלקסיה, המרכז בראשית, והשמש על ציר z במרחק R0.
// זווית חיובית סביב y היא נגד כיוון השעון במבט מהקוטב הצפוני (כמו קו האורך הגלקטי), והגלקסיה מסתובבת
// עם כיוון השעון – ולכן הזרועות נגררות: ככל שמתרחקים מהמרכז הן מתעקלות נגד כיוון השעון.

export const GAL_R = 9000;
export const GAL_SUN_R = 0.52 * GAL_R;
const R0 = GAL_SUN_R;
const DEG = Math.PI / 180;

const PITCH = Math.tan(12.5 * DEG); // זווית הסלסול של הזרועות, כמו במציאות (12–13 מעלות)
const BAR_ANGLE = 27 * DEG; // המוט נוטה ב־27 מעלות לקו שבין השמש למרכז; הקצה הקרוב אלינו בצד של רביע הקשת
const BAR_LEN = 0.6 * R0;
// הזרועות: הרדיוס של כל זרועה בכיוון של השמש (זווית 0), ביחס למרחק השמש מהמרכז
export const ARMS = [
  { r0: 1.22, w: 1.0, wide: 1.0, start: 0.62 }, // פרסאוס – זרוע גדולה, מחוץ לשמש
  { r0: 0.874, w: 0.32, wide: 0.6, start: 0.75 }, // קשת – זרוע קטנה, בין השמש למרכז
  { r0: 0.626, w: 1.0, wide: 1.0, start: 0.62 }, // מגן־קנטאורוס – זרוע גדולה
  { r0: 0.449, w: 0.32, wide: 0.6, start: 0.75 }, // מרובע (והזרוע החיצונית בהמשכה)
];
const angleAt = (arm, r) => Math.log(r / (arm.r0 * R0)) / PITCH; // הזווית שבה הזרוע מגיעה לרדיוס r

// צבעים ב"מרחב הליניארי" (כמו ש־THREE.Color ממיר צבע hex), כדי שהגלקסיה תיראה בדיוק כמו קודם
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const C = (hex) => [0, 2, 4].map((i) => lin(parseInt(hex.slice(1 + i, 3 + i), 16) / 255));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const COL = { bulge: C('#ffd29a'), bar: C('#ffdcaa'), disc: C('#f2e4cc'), arm: C('#a8c0ff'), young: C('#d6e4ff'), hii: C('#ff6f9e'), dust: C('#140c08') };

// מספרים אקראיים שחוזרים על עצמם (seed), כדי שהגלקסיה תהיה זהה בכל טעינה
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// n כוכבים ו־nd כתמי אבק. כל "שק" מכיל מערכים: pos (x,y,z), col (r,g,b), size, phase, flare
export function buildGalaxy({ n, nd, random = Math.random }) {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const stars = { pos: [], col: [], size: [], phase: [], flare: [] };
  const dust = { pos: [], col: [], size: [], phase: [], flare: [] };
  const put = (bag, x, y, z, c, size, k = 1) => {
    bag.pos.push(x, y, z);
    bag.col.push(c[0] * k, c[1] * k, c[2] * k);
    bag.size.push(size);
    bag.phase.push(random());
    bag.flare.push(bag === stars && random() < 0.006 ? 1 : 0);
  };
  // נקודה על זרוע: מרחק r וזווית לפי הספירלה, עם פיזור לרוחב הזרוע (שגדל כלפי חוץ)
  const onArm = (arm, r, across) => {
    const th = angleAt(arm, r);
    const w = (0.022 + 0.03 * r / R0) * R0 * arm.wide * across;
    const rr = r + w;
    return [Math.sin(th) * rr, Math.cos(th) * rr];
  };
  const pickArm = () => {
    let arm;
    do arm = ARMS[(random() * ARMS.length) | 0]; while (random() > arm.w);
    return arm;
  };
  for (let i = 0; i < n; i++) {
    const kind = random();
    if (kind < 0.1) {
      // הבליטה: "ביצה" תפוחה של כוכבים זקנים וצהבהבים, בעובי של בערך 10,000 שנות אור
      const r = Math.abs(gauss()) * 0.22 * R0;
      const u = random() * 2 - 1, phi = random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      put(stars, s * Math.cos(phi) * r, u * r * 0.8, s * Math.sin(phi) * r, COL.bulge, 30 + random() * 40, 0.75 + random() * 0.4);
    } else if (kind < 0.2) {
      // המוט
      const t = (random() * 2 - 1) * BAR_LEN * (0.35 + 0.65 * random()), wdt = gauss() * 0.11 * BAR_LEN;
      const x = -Math.sin(BAR_ANGLE) * t + Math.cos(BAR_ANGLE) * wdt;
      const z = Math.cos(BAR_ANGLE) * t + Math.sin(BAR_ANGLE) * wdt;
      put(stars, x, gauss() * 0.06 * R0, z, COL.bar, 30 + random() * 40, 0.85 + random() * 0.4);
    } else if (kind < 0.34) {
      // הדיסק: כוכבים בין הזרועות, דלילים יותר ככל שמתרחקים
      const r = Math.min(GAL_R, -Math.log(1 - random() * 0.97) * 0.42 * R0 + 0.15 * R0);
      const th = random() * Math.PI * 2;
      const thick = (0.026 + 0.06 * Math.exp(-r / (0.35 * R0))) * R0;
      put(stars, Math.sin(th) * r, gauss() * thick, Math.cos(th) * r, mix(COL.disc, COL.arm, Math.min(1, r / GAL_R) * 0.5), 18 + random() * 22, 0.25 + random() * 0.3);
    } else if (kind < 0.42) {
      // "הדיסק העבה": כוכבים זקנים ודלילים מעל ומתחת לדיסק, שיוצרים סביבו זוהר רך שמתעבה לכיוון המרכז
      const r = Math.min(GAL_R, -Math.log(1 - random() * 0.97) * 0.38 * R0 + 0.1 * R0);
      const th = random() * Math.PI * 2;
      const thick = (0.07 + 0.09 * Math.exp(-r / (0.4 * R0))) * R0;
      put(stars, Math.sin(th) * r, gauss() * thick, Math.cos(th) * r, mix(COL.disc, COL.bulge, 0.4), 16 + random() * 18, 0.35 + random() * 0.3);
    } else {
      // הזרועות: הגדולות מקבלות יותר כוכבים; כוכבים צעירים כחולים, וכאן ושם ענני גז ורודים שבהם נולדים כוכבים
      const arm = pickArm();
      const r = arm.start * R0 * 0.6 + Math.pow(random(), 0.85) * (GAL_R - arm.start * R0 * 0.6);
      const [x, z] = onArm(arm, r, gauss());
      const outer = r / GAL_R;
      const y = gauss() * (0.018 + 0.022 * (1 - outer)) * R0;
      const fade = Math.min(1, (GAL_R - r) / (0.25 * GAL_R)) * Math.min(1, r / (0.55 * R0));
      if (arm.w === 1 && random() < 0.004) {
        // ענן ורוד שבו נולדים כוכבים: קבוצה קטנה וצפופה של נקודות
        for (let k = 0; k < 9; k++) put(stars, x + gauss() * 0.012 * R0, y, z + gauss() * 0.012 * R0, COL.hii, 50 + random() * 60, 0.8 * fade);
      } else if (random() < 0.12) put(stars, x, y, z, COL.young, 40 + random() * 40, 1.0 * fade);
      else put(stars, x, y, z, mix(COL.disc, COL.arm, 0.35 + 0.5 * outer), 22 + random() * 34, (0.55 + random() * 0.45) * fade);
    }
  }
  // שלוחת אוריון: קטע קצר ודליל של זרוע, שעובר דרך השמש
  for (let i = 0; i < n * 0.03; i++) {
    const a = (random() - 0.5) * 70 * DEG;
    const r = R0 * Math.exp(a * Math.tan(20 * DEG)) + gauss() * 0.03 * R0;
    put(stars, Math.sin(a) * r, gauss() * 0.02 * R0, Math.cos(a) * r, mix(COL.disc, COL.arm, 0.6), 22 + random() * 30, 0.7);
  }
  // אבק כהה בצד הפנימי של הזרועות (כמו בצילומים של גלקסיות ספירליות)
  for (let i = 0; i < nd; i++) {
    const arm = pickArm();
    const r = arm.start * R0 + random() * (0.9 * GAL_R - arm.start * R0);
    const [x, z] = onArm(arm, r, -1.1 + gauss() * 0.35);
    put(dust, x, gauss() * 0.006 * R0, z, COL.dust, 140 + random() * 160);
  }
  // הזוהר: כל כוכב ארבעים הופך לכתם גדול וחלש באותו מקום (ובאותו עובי)
  const glow = { pos: [], col: [], size: [], phase: [], flare: [] };
  for (let i = 0; i < stars.size.length; i += 40) {
    // כתם בודד רחוק מהדיסק נראה כמו ענן מוזר – מדלגים עליו
    if (Math.abs(stars.pos[i * 3 + 1]) > 0.06 * R0) continue;
    glow.pos.push(stars.pos[i * 3], stars.pos[i * 3 + 1] * 1.6, stars.pos[i * 3 + 2]);
    for (let c = 0; c < 3; c++) glow.col.push(stars.col[i * 3 + c] * 0.006);
    glow.size.push(900 + random() * 600);
    glow.phase.push(0);
    glow.flare.push(0);
  }
  return { stars, dust, glow };
}
