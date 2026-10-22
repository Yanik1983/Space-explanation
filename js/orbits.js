// חישוב מיקומים אמיתיים של כוכבי הלכת והירח.
//
// כוכבי הלכת: האלמנטים הקפלריים של JPL למיקומים מקורבים (E.M. Standish, תקפים לשנים 1800–2050,
// https://ssd.jpl.nasa.gov/planets/approx_pos.html). הדיוק הוא בערך דקת קשת, הרבה יותר ממה שרואים במסך.
// הירח: נוסחה מקוצרת של קו האורך והרוחב האקליפטיים (דיוק של כמה מעלות – מספיק כדי לראות את מופע הירח הנכון).
//
// מערכות צירים: האקליפטיקה (X, Y, Z) עוברת ל־three.js כ־(X, Z, -Y), כך שציר y הוא "למעלה"
// וכוכבי הלכת נעים נגד כיוון השעון כשמסתכלים מלמעלה.

import * as THREE from 'three';

const DEG = Math.PI / 180;
const OBLIQUITY = 23.43928 * DEG;

// [a (AU), e, I, L, ϖ (קו אורך הפריהליון), Ω (קו אורך הצומת העולה)], ואחריו השינוי למאה
const ELEMENTS = {
  mercury: [
    [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  ],
  venus: [
    [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  ],
  earth: [
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  ],
  mars: [
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  ],
  jupiter: [
    [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  ],
  saturn: [
    [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  ],
  uranus: [
    [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  ],
  neptune: [
    [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  ],
  // פלוטו (כוכב לכת ננסי) – מאותה טבלה של JPL
  pluto: [
    [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
  ],
};

function elementsAt(id, days) {
  const T = days / 36525;
  const [base, rate] = ELEMENTS[id];
  const [a, e, I, L, peri, node] = base.map((v, i) => v + rate[i] * T);
  return { a, e, I: I * DEG, L: L * DEG, peri: peri * DEG, node: node * DEG };
}

function solveKepler(M, e) {
  M = Math.atan2(Math.sin(M), Math.cos(M));
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

// מיקום על המסלול לפי האנומליה האקסצנטרית E, במערכת של three.js (ביחידות AU)
function placeOnOrbit(el, E, out) {
  const { a, e, I, peri, node } = el;
  const w = peri - node;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(node), sO = Math.sin(node);
  const cI = Math.cos(I), sI = Math.sin(I);
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = sw * sI * xp + cw * sI * yp;
  return out.set(x, z, -y);
}

// המיקום של כוכב לכת סביב השמש, בימים מאז 1.1.2000 בצהריים
export function heliocentric(id, days, out = new THREE.Vector3()) {
  const el = elementsAt(id, days);
  return placeOnOrbit(el, solveKepler(el.L - el.peri, el.e), out);
}

// חצי הציר הארוך של המסלול (AU) – "הגודל" של האליפסה
export function semiMajor(id, days) {
  return elementsAt(id, days).a;
}

// נקודות לאורך כל המסלול (אליפסה) לפי האלמנטים בתאריך נתון
export function orbitPoints(id, days, n = 360) {
  const el = elementsAt(id, days);
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(placeOnOrbit(el, (i / n) * Math.PI * 2, new THREE.Vector3()));
  return pts;
}

// כיוון הירח מכדור הארץ (וקטור יחידה)
export function moonDirection(days, out = new THREE.Vector3()) {
  const L = (218.316 + 13.176396 * days) * DEG; // קו אורך ממוצע
  const M = (134.963 + 13.064993 * days) * DEG; // אנומליה ממוצעת
  const F = (93.272 + 13.22935 * days) * DEG; // מרחק מהצומת
  const lon = L + 6.289 * DEG * Math.sin(M);
  const lat = 5.128 * DEG * Math.sin(F);
  return out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}

// כיוון הקוטב הצפוני של גוף, מתוך העלייה הישרה והנטייה (IAU, J2000), במערכת של three.js
export function poleVector([ra, dec]) {
  ra *= DEG;
  dec *= DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  const ey = y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY);
  const ez = -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
  return new THREE.Vector3(x, ez, -ey).normalize();
}

// חגורת האסטרואידים: אלפי סלעים, כל אחד במסלול קפלרי משלו (אקראי, בתחום האמיתי של החגורה)
export function makeAsteroids(n) {
  const gaps = [2.5, 2.82, 2.95]; // פערי קירקווד – אזורים כמעט ריקים בגלל צדק
  const list = [];
  while (list.length < n) {
    const a = 2.1 + Math.random() * 1.2;
    if (gaps.some((g) => Math.abs(a - g) < 0.025)) continue;
    const e = Math.random() * 0.18;
    const I = Math.random() ** 2 * 18 * DEG;
    const node = Math.random() * Math.PI * 2;
    const w = Math.random() * Math.PI * 2;
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(node), sO = Math.sin(node), cI = Math.cos(I), sI = Math.sin(I);
    list.push({
      a, e, b: a * Math.sqrt(1 - e * e),
      M0: Math.random() * Math.PI * 2,
      n: (2 * Math.PI) / (365.256 * a ** 1.5),
      // מקדמי הסיבוב מהמישור של המסלול למערכת של three.js
      p: [cw * cO - sw * sO * cI, -sw * cO - cw * sO * cI, cw * sO + sw * cO * cI, -sw * sO + cw * cO * cI, sw * sI, cw * sI],
    });
  }
  return list;
}

export function asteroidPosition(ast, days, out) {
  let M = ast.M0 + ast.n * days;
  let E = M + ast.e * Math.sin(M);
  E -= (E - ast.e * Math.sin(E) - M) / (1 - ast.e * Math.cos(E));
  E -= (E - ast.e * Math.sin(E) - M) / (1 - ast.e * Math.cos(E));
  const xp = ast.a * (Math.cos(E) - ast.e), yp = ast.b * Math.sin(E);
  const p = ast.p;
  return out.set(p[0] * xp + p[1] * yp, p[4] * xp + p[5] * yp, -(p[2] * xp + p[3] * yp));
}

// שביטים: מסלול לפי אלמנטים קבועים ותאריך המעבר הקרוב ביותר לשמש
function cometElements(el) {
  return {
    a: el.a, e: el.e, I: el.i * DEG, node: el.node * DEG, peri: (el.node + el.argPeri) * DEG,
    T: (Date.parse(el.perihelion + 'T00:00:00Z') - Date.UTC(2000, 0, 1, 12)) / 86400000,
    n: (2 * Math.PI) / (365.25 * el.a ** 1.5),
  };
}

// פתרון משוואת קפלר שעובד גם במסלולים מעוכים מאוד (e קרוב ל־1)
function solveKeplerHighE(M, e) {
  M = Math.atan2(Math.sin(M), Math.cos(M));
  let E = e > 0.8 ? Math.PI * Math.sign(M || 1) : M;
  for (let i = 0; i < 50; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  return E;
}

export function cometPosition(el, days, out) {
  const c = (el._c ||= cometElements(el));
  return placeOnOrbit(c, solveKeplerHighE(c.n * (days - c.T), c.e), out);
}

export function cometOrbitPoints(el, n = 720) {
  const c = (el._c ||= cometElements(el));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(placeOnOrbit(c, (i / n) * Math.PI * 2, new THREE.Vector3()));
  return pts;
}
