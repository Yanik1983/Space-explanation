// נועם – דמות תלת־ממדית של ילד (בן 9 בערך) שמציגה את ההסברים.
// הדמות בנויה כולה בקוד: הראש "מפוסל" מכדור, עם לסת שנפתחת (morph target), עיניים עם קשתית ועפעפיים,
// שיער מקווצות, וחליפת חלל עם חומרים פיזיקליים. היחידות הן מטרים, והמצלמה מצלמת מהמותניים ומעלה.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const SKIN = new THREE.Color('#e7b48e');
const LIPS = new THREE.Color('#c27a72');
const BLUSH = new THREE.Color('#e79a86');
const HAIR = new THREE.Color('#3a2418');

// צבע עור אחיד לגיאומטריה (לחומר שמשתמש בצבעי קודקודים)
function skinTint(geo, k = [1, 1, 1]) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([SKIN.r * k[0], SKIN.g * k[1], SKIN.b * k[2]], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const gauss = (d2, w) => Math.exp(-d2 / (w * w));

// ---------- צורת הראש ----------
// מקבלים נקודה על כדור יחידה (x ימינה, y למעלה, z קדימה) ומחזירים מיקום במטרים.
const HEAD = { sx: 0.081, sy: 0.108, sz: 0.099 };
const MOUTH_Y = -0.52;
const JAW_PIVOT = new THREE.Vector3(0, -0.05, -0.2);

function shapeHead(x0, y0, z0, jaw = 0, smile = 0) {
  let x = x0, y = y0, z = z0;
  const lower = sstep(0.05, -0.95, y0);
  x *= 1 - 0.22 * lower; // לסת וסנטר צרים יותר מהגולגולת
  if (z < 0) z *= 1 - 0.38 * lower;
  if (z < 0 && y0 > -0.2) z *= 1.06; // עורף
  if (z > 0) z *= 0.93; // פנים שטוחות יותר
  const front = sstep(0.3, 0.85, z0);
  const ax = Math.abs(x0);

  let dz = 0;
  dz += 0.035 * gauss((y0 - 0.3) ** 2, 0.12) * sstep(0.75, 0.3, ax) * front; // גבות
  for (const s of [-1, 1]) {
    dz -= 0.1 * gauss((x0 - s * 0.36) ** 2 + 1.3 * (y0 - 0.1) ** 2, 0.2) * front; // ארובות עיניים
    dz += 0.045 * gauss((x0 - s * 0.46) ** 2 + (y0 + 0.2) ** 2, 0.22) * front; // עצמות לחיים
    dz += 0.045 * gauss((x0 - s * 0.12) ** 2 + (y0 + 0.3) ** 2, 0.075) * front; // כנפי האף
  }
  // אף: גשר שהולך ובולט עד הקצה
  const ny = clamp((0.2 - y0) / 0.44, 0, 1);
  dz += (0.03 + 0.24 * ny ** 1.5) * gauss(x0 * x0, 0.07 + 0.06 * ny) * sstep(-0.42, -0.3, y0) * front;
  dz += 0.075 * gauss(x0 * x0 + (y0 + 0.22) ** 2, 0.09) * front; // קצה האף
  // שפתיים וסנטר
  dz += 0.05 * gauss(0.55 * x0 * x0 + (y0 + 0.47) ** 2, 0.065) * front;
  dz += 0.05 * gauss(0.7 * x0 * x0 + (y0 + 0.585) ** 2, 0.065) * front;
  dz -= 0.02 * gauss(x0 * x0 + (y0 + 0.68) ** 2, 0.05) * front;
  dz += 0.07 * gauss(0.8 * x0 * x0 + (y0 + 0.86) ** 2, 0.16) * front;
  z += dz;

  // חיוך: זוויות הפה עולות והלחיים מתרוממות
  if (smile) {
    for (const s of [-1, 1]) {
      const g = gauss((x0 - s * 0.3) ** 2 + (y0 - MOUTH_Y) ** 2, 0.13) * front;
      y += 0.045 * smile * g;
      x += 0.025 * s * smile * g;
      z -= 0.02 * smile * g;
      y += 0.02 * smile * gauss((x0 - s * 0.42) ** 2 + (y0 + 0.25) ** 2, 0.15) * front;
    }
  }

  // השפתיים סגורות: מצמידים את האזור סביב החריץ של הפה
  const my = y0 - MOUTH_Y;
  const wx = sstep(0.42, 0.28, ax) * front;
  y -= my * 0.75 * wx * (1 - sstep(0.015, 0.07, Math.abs(my)));

  // לסת: כל מה שמתחת לפה מסתובב סביב ציר ליד האוזניים
  if (jaw && y0 < MOUTH_Y) {
    // בתוך הפה הלסת נפרדת בחדות מהשפה העליונה; בצדדים העור נמתח בהדרגה
    const spread = 0.004 + 0.45 * sstep(0.22, 0.75, ax);
    const w = sstep(MOUTH_Y, MOUTH_Y - spread, y0) * sstep(-0.6, 0.1, z0) * (1 - 0.5 * sstep(0.6, 0.95, ax));
    const a = jaw * w;
    const py = y - JAW_PIVOT.y, pz = z - JAW_PIVOT.z;
    y = JAW_PIVOT.y + py * Math.cos(a) - pz * Math.sin(a);
    z = JAW_PIVOT.z + py * Math.sin(a) + pz * Math.cos(a);
  }
  return [x * HEAD.sx, y * HEAD.sy, z * HEAD.sz];
}

// נקודה על פני הראש לפי x,y של כדור היחידה (בחזית), ונורמל משוער
function headPoint(ux, uy, back = false) {
  const zz = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy)) * (back ? -1 : 1);
  const p = new THREE.Vector3(...shapeHead(ux, uy, zz));
  const e = 0.01;
  const px = new THREE.Vector3(...shapeHead(ux + e, uy, Math.sqrt(Math.max(0, 1 - (ux + e) ** 2 - uy * uy)) * (back ? -1 : 1)));
  const py = new THREE.Vector3(...shapeHead(ux, uy + e, Math.sqrt(Math.max(0, 1 - ux * ux - (uy + e) ** 2)) * (back ? -1 : 1)));
  const n = px.sub(p).cross(py.sub(p)).normalize();
  if (back) n.negate();
  return { p, n };
}

function buildHeadGeometry() {
  let geo = new THREE.SphereGeometry(1, 144, 108);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-5);
  const unit = geo.attributes.position.array.slice();
  const count = unit.length / 3;

  // חריץ הפה: מוחקים שורה דקה של משולשים
  const idx = geo.index.array;
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    let cx = 0, cz = 0, ymin = 9, ymax = -9;
    for (let k = 0; k < 3; k++) {
      const vy = unit[idx[i + k] * 3 + 1];
      cx += unit[idx[i + k] * 3] / 3;
      cz += unit[idx[i + k] * 3 + 2] / 3;
      ymin = Math.min(ymin, vy);
      ymax = Math.max(ymax, vy);
    }
    const inSlit = cz > 0.5 && Math.abs(cx) < 0.27 && ymin < MOUTH_Y && ymax > MOUTH_Y;
    if (!inSlit) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  geo.setIndex(keep);

  const pos = new Float32Array(count * 3);
  const jawD = new Float32Array(count * 3);
  const smileD = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = unit[i * 3], y = unit[i * 3 + 1], z = unit[i * 3 + 2];
    const base = shapeHead(x, y, z);
    const j = shapeHead(x, y, z, 0.3);
    const s = shapeHead(x, y, z, 0, 1);
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = base[k];
      jawD[i * 3 + k] = j[k] - base[k];
      smileD[i * 3 + k] = s[k] - base[k];
    }
    // צבע עור עם שפתיים, סומק ואזורים כהים יותר
    const front = sstep(0.3, 0.85, z);
    c.copy(SKIN);
    const lip = Math.max(
      gauss(0.5 * x * x + (y + 0.475) ** 2, 0.05),
      gauss(0.6 * x * x + (y + 0.58) ** 2, 0.055),
    ) * sstep(0.36, 0.2, Math.abs(x)) * front;
    c.lerp(LIPS, lip * 0.85);
    for (const sd of [-1, 1]) {
      c.lerp(BLUSH, 0.35 * gauss((x - sd * 0.45) ** 2 + (y + 0.25) ** 2, 0.17) * front);
      c.multiplyScalar(1 - 0.25 * gauss((x - sd * 0.1) ** 2 + 2 * (y + 0.335) ** 2, 0.025) * front); // נחיריים
      c.multiplyScalar(1 - 0.14 * gauss((x - sd * 0.36) ** 2 + 1.5 * (y - 0.12) ** 2, 0.17) * front); // עומק סביב העיניים
    }
    c.multiplyScalar(1 - 0.1 * sstep(-0.6, -1, y)); // צל מתחת לסנטר
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.morphAttributes.position = [new THREE.BufferAttribute(jawD, 3), new THREE.BufferAttribute(smileD, 3)];
  geo.morphTargetsRelative = true;
  geo.computeVertexNormals();
  return { geo, unit };
}

// ---------- טקסטורות קטנות ----------
function irisTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2);
  g.addColorStop(0, '#8a5a2b');
  g.addColorStop(0.45, '#6b4220');
  g.addColorStop(0.85, '#3e2412');
  g.addColorStop(1, '#1b0f08');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  // סיבים של הקשתית
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2;
    const r0 = s * (0.13 + Math.random() * 0.05), r1 = s * (0.3 + Math.random() * 0.17);
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(200,150,90,0.25)' : 'rgba(40,20,8,0.3)';
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(s / 2 + Math.cos(a) * r0, s / 2 + Math.sin(a) * r0);
    ctx.lineTo(s / 2 + Math.cos(a + 0.05) * r1, s / 2 + Math.sin(a + 0.05) * r1);
    ctx.stroke();
  }
  ctx.fillStyle = '#060404';
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.15, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function fabricNormalMap() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const weave = Math.sin(x * 0.9) * 0.5 + Math.sin(y * 0.9) * 0.5;
      const n = (Math.random() - 0.5) * 0.4;
      const i = (y * s + x) * 4;
      img.data[i] = 128 + (weave + n) * 18;
      img.data[i + 1] = 128 + (Math.cos(y * 0.9) * 0.5 + n) * 18;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

function patchTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#e9edf3';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#1d3f8f';
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f2b640';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = '#ff9f1c';
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.5, s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.5, s * 0.3, s * 0.08, -0.35, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s * (0.2 + Math.random() * 0.6), s * (0.15 + Math.random() * 0.7), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function nameTagTexture(name) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1d3f8f';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 58px Rubik, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText(name, 128, 52);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Presenter {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
    this.camera.position.set(0, 1.16, 1.3);
    this.camera.lookAt(0, 1.11, 0);

    const key = new THREE.DirectionalLight(0xfff0e0, 2.4);
    key.position.set(1.2, 2, 2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffd9c4, 0.6);
    fill.position.set(-1.5, 0.5, 1.5);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0x9fc0ff, 1.3);
    rim.position.set(-1, 1.5, -1.8);
    this.scene.add(rim);
    const bounce = new THREE.DirectionalLight(0xffe2cc, 0.55); // אור מוחזר מלמטה, מרכך צללים מתחת לאף ולסנטר
    bounce.position.set(0, -1, 1.2);
    this.scene.add(bounce);

    this.build();

    this.time = 0;
    this.mouth = 0;
    this.accent = 0;
    this.nextBlink = 1.5;
    this.blink = 0;
    this.gesture = null;
    this.gestureTime = 0;
    this.saccade = new THREE.Vector2();
    this.nextSaccade = 0.5;
    this.smile = 0.6;
  }

  build() {
    const root = (this.root = new THREE.Group());
    this.scene.add(root);

    const skinMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.52,
      sheen: 0.6,
      sheenColor: new THREE.Color('#ff9c7a'),
      sheenRoughness: 0.5,
      emissive: new THREE.Color('#3a1206'),
      emissiveIntensity: 0.25,
    });
    this.skinMat = skinMat;
    const fabric = fabricNormalMap();
    const suitMat = new THREE.MeshStandardMaterial({ color: '#eceff3', roughness: 0.82, normalMap: fabric, normalScale: new THREE.Vector2(0.35, 0.35) });
    const suitDark = new THREE.MeshStandardMaterial({ color: '#8d96a3', roughness: 0.7 });
    const metal = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.85, roughness: 0.28 });
    const orange = new THREE.MeshStandardMaterial({ color: '#f08a1c', roughness: 0.6 });
    const blue = new THREE.MeshStandardMaterial({ color: '#2a56b8', roughness: 0.55 });
    const black = new THREE.MeshStandardMaterial({ color: '#1c1e22', roughness: 0.45, metalness: 0.2 });

    const add = (parent, geo, mat, pos = [0, 0, 0], rot = null, scale = null) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      if (scale) m.scale.set(...scale);
      parent.add(m);
      return m;
    };

    // ---------- גוף ----------
    const body = (this.body = new THREE.Group());
    root.add(body);
    const profile = [
      [0.001, 0.6], [0.115, 0.6], [0.118, 0.72], [0.112, 0.8], [0.122, 0.9], [0.133, 0.98],
      [0.134, 1.03], [0.118, 1.075], [0.075, 1.1], [0.045, 1.115], [0.001, 1.118],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const torso = add(body, new THREE.LatheGeometry(profile, 48), suitMat);
    torso.scale.z = 0.68;
    // חזית החליפה
    add(body, new THREE.TorusGeometry(0.118, 0.012, 10, 48), blue, [0, 0.79, 0], [Math.PI / 2, 0, 0], [1, 0.7, 1]);
    add(body, new THREE.CylinderGeometry(0.003, 0.003, 0.24, 6), suitDark, [0.0, 0.92, 0.088], [0.1, 0, 0]);
    const patch = add(body, new THREE.CircleGeometry(0.03, 40), new THREE.MeshStandardMaterial({ map: patchTexture(), roughness: 0.8 }), [-0.062, 0.975, 0.083], [-0.18, -0.38, 0]);
    patch.renderOrder = 1;
    add(body, new THREE.PlaneGeometry(0.06, 0.022), new THREE.MeshStandardMaterial({ map: nameTagTexture('נועם'), roughness: 0.8 }), [0.064, 0.985, 0.083], [-0.18, 0.38, 0]);
    // יחידת בקרה על החזה
    const dcm = add(body, new THREE.BoxGeometry(0.09, 0.05, 0.03), suitDark, [0, 0.86, 0.085], [-0.05, 0, 0]);
    for (const [x, col] of [[-0.025, '#e8453c'], [0, '#41c463'], [0.025, '#f2b640']]) {
      add(dcm, new THREE.CylinderGeometry(0.006, 0.006, 0.008, 16), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }), [x, 0.004, 0.016], [Math.PI / 2, 0, 0]);
    }
    // תרמיל גב וכתפיים
    add(body, new THREE.BoxGeometry(0.24, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: '#d7dbe1', roughness: 0.7 }), [0, 0.92, -0.12]);
    // טבעת צוואר מתכתית
    add(body, new THREE.TorusGeometry(0.058, 0.012, 16, 48), metal, [0, 1.1, 0.004], [Math.PI / 2 + 0.08, 0, 0]);
    add(body, new THREE.TorusGeometry(0.058, 0.004, 8, 48), orange, [0, 1.088, 0.004], [Math.PI / 2 + 0.08, 0, 0]);

    // צוואר
    add(body, skinTint(new THREE.CylinderGeometry(0.041, 0.046, 0.1, 24), [0.93, 0.9, 0.9]), skinMat, [0, 1.13, -0.004]);

    // ---------- ידיים ----------
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.135, 1.04, 0);
      body.add(shoulder);
      add(shoulder, new THREE.SphereGeometry(0.045, 24, 16), suitMat);
      add(shoulder, new THREE.CapsuleGeometry(0.042, 0.17, 8, 20), suitMat, [0, -0.11, 0]);
      add(shoulder, new THREE.TorusGeometry(0.043, 0.006, 8, 32), blue, [0, -0.06, 0], [Math.PI / 2, 0, 0]);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.225, 0);
      shoulder.add(elbow);
      add(elbow, new THREE.CapsuleGeometry(0.038, 0.15, 8, 20), suitMat, [0, -0.09, 0]);
      add(elbow, new THREE.CylinderGeometry(0.043, 0.043, 0.028, 24), orange, [0, -0.18, 0]);
      const hand = new THREE.Group();
      hand.position.set(0, -0.2, 0);
      elbow.add(hand);
      // כפפה: כף יד, אצבעות ואגודל
      const glove = new THREE.MeshStandardMaterial({ color: '#f1f2f4', roughness: 0.75 });
      add(hand, new THREE.SphereGeometry(0.04, 20, 14), glove, [0, -0.035, 0], null, [0.85, 1, 0.5]);
      for (let f = 0; f < 4; f++) {
        add(hand, new THREE.CapsuleGeometry(0.0085, 0.035, 4, 10), glove, [(f - 1.5) * 0.017, -0.085 + Math.abs(f - 1.5) * 0.004, 0.004], [0.15, 0, 0]);
      }
      add(hand, new THREE.CapsuleGeometry(0.01, 0.03, 4, 10), glove, [side * -0.035, -0.04, 0.012], [0.3, 0, side * 0.7]);
      add(hand, new THREE.SphereGeometry(0.03, 16, 10), suitDark, [0, -0.04, -0.012], null, [0.75, 0.8, 0.2]);
      shoulder.rotation.z = side * 0.08;
      this.arms.push({ side, shoulder, elbow, hand, sz: side * 0.08, sx: 0, ex: -0.15, ez: 0 });
    }

    // ---------- ראש ----------
    const head = (this.head = new THREE.Group());
    head.position.set(0, 1.238, 0.008);
    body.add(head);
    const { geo, unit } = buildHeadGeometry();
    this.headMesh = add(head, geo, skinMat);
    this.headMesh.morphTargetInfluences = [0, 0.6];

    // פנים הפה, שיניים ולשון (נראים רק כשהפה נפתח)
    const mouthC = headPoint(0, MOUTH_Y).p;
    add(head, new THREE.SphereGeometry(0.017, 20, 14), new THREE.MeshStandardMaterial({ color: '#3b1214', roughness: 0.9 }), [0, mouthC.y - 0.004, mouthC.z - 0.03], null, [1, 0.75, 0.8]);
    const teethMat = new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.35 });
    add(head, new THREE.CylinderGeometry(0.019, 0.019, 0.006, 24, 1, false, -1.0, 2.0), teethMat, [0, mouthC.y + 0.002, mouthC.z - 0.019], [0, Math.PI, 0]);
    this.jawParts = new THREE.Group();
    head.add(this.jawParts);
    add(this.jawParts, new THREE.CylinderGeometry(0.017, 0.017, 0.005, 24, 1, false, -1.0, 2.0), teethMat, [0, mouthC.y - 0.004, mouthC.z - 0.022], [0, Math.PI, 0]);
    add(this.jawParts, new THREE.SphereGeometry(0.012, 16, 10), new THREE.MeshStandardMaterial({ color: '#b5525b', roughness: 0.6 }), [0, mouthC.y - 0.01, mouthC.z - 0.032], null, [1, 0.4, 1]);
    this.jawPivot = new THREE.Vector3(JAW_PIVOT.x * HEAD.sx, JAW_PIVOT.y * HEAD.sy, JAW_PIVOT.z * HEAD.sz);

    // עיניים
    const iris = irisTexture();
    this.eyes = [];
    for (const side of [-1, 1]) {
      const sp = headPoint(side * 0.36, 0.1).p;
      const eye = new THREE.Group();
      eye.position.set(sp.x, sp.y, sp.z - 0.0095);
      eye.scale.setScalar(1.1);
      head.add(eye);
      const ball = new THREE.Group();
      eye.add(ball);
      add(ball, new THREE.SphereGeometry(0.0115, 32, 24), new THREE.MeshStandardMaterial({ color: '#f3efea', roughness: 0.25 }));
      const irisGeo = new THREE.SphereGeometry(0.01158, 40, 10, 0, Math.PI * 2, 0, 0.52);
      irisGeo.rotateX(Math.PI / 2);
      const ip = irisGeo.attributes.position, iuv = irisGeo.attributes.uv;
      const ir = 0.01158 * Math.sin(0.52);
      for (let i = 0; i < ip.count; i++) iuv.setXY(i, 0.5 + (ip.getX(i) / ir) * 0.5, 0.5 + (ip.getY(i) / ir) * 0.5);
      add(ball, irisGeo, new THREE.MeshStandardMaterial({ map: iris, roughness: 0.35 }));
      add(ball, new THREE.SphereGeometry(0.0068, 24, 16), new THREE.MeshPhysicalMaterial({
        color: '#ffffff', transparent: true, opacity: 0.1, roughness: 0, clearcoat: 1, clearcoatRoughness: 0, depthWrite: false,
      }), [0, 0, 0.0088], null, [1, 1, 0.5]);
      // עפעפיים
      const lidMat = skinMat;
      const upper = new THREE.Group();
      eye.add(upper);
      add(upper, skinTint(new THREE.SphereGeometry(0.0134, 32, 12, 0, Math.PI * 2, 0, 1.0), [0.95, 0.88, 0.86]), lidMat);
      // ריסים לאורך שפת העפעף העליון
      add(upper, new THREE.TorusGeometry(0.0134 * Math.sin(1.0), 0.0008, 6, 32, Math.PI), new THREE.MeshStandardMaterial({ color: '#1a100b', roughness: 0.8 }), [0, 0.0134 * Math.cos(1.0), 0], [Math.PI / 2, 0, 0]);
      const lower = new THREE.Group();
      eye.add(lower);
      add(lower, skinTint(new THREE.SphereGeometry(0.013, 32, 8, 0, Math.PI * 2, 0, 0.9), [0.97, 0.92, 0.9]), lidMat, [0, 0, 0], [Math.PI, 0, 0]);
      this.eyes.push({ side, ball, upper, lower });
    }

    // גבות: קווצות קטנות לאורך קשת
    const browGeo = new THREE.CylinderGeometry(0.0002, 0.0008, 0.007, 4);
    browGeo.translate(0, 0.0035, 0);
    const browMesh = new THREE.InstancedMesh(browGeo, new THREE.MeshStandardMaterial({ color: '#4a2f1f', roughness: 0.85 }), 110);
    this.brows = new THREE.Group();
    head.add(this.brows);
    this.brows.add(browMesh);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    let bi = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 55; i++) {
        const t = i / 54;
        const ux = side * (0.17 + t * 0.4);
        const uy = 0.33 + Math.sin(t * Math.PI) * 0.06 - t * 0.04 + (Math.random() - 0.5) * 0.045 * (1 - t * 0.5);
        const { p, n } = headPoint(ux, uy);
        p.addScaledVector(n, 0.0006);
        const dir = new THREE.Vector3(side, 0.35 - t * 0.6, 0).normalize();
        const xAxis = new THREE.Vector3().crossVectors(dir, n).normalize();
        const zAxis = new THREE.Vector3().crossVectors(xAxis, dir).normalize();
        m.makeBasis(xAxis, dir, zAxis);
        q.setFromRotationMatrix(m);
        sc.set(1, 0.8 + Math.random() * 0.5, 0.6);
        m.compose(p, q, sc);
        browMesh.setMatrixAt(bi++, m);
      }
    }

    // שיער: כיפה צמודה לראש + מאות קווצות
    this.buildHair(head, unit);

    // אוזניים ואוזניות של מגיש
    for (const side of [-1, 1]) {
      const { p } = headPoint(side * 0.985, -0.05);
      add(head, skinTint(new THREE.SphereGeometry(0.016, 20, 14), [0.95, 0.92, 0.92]), skinMat, [p.x + side * 0.004, p.y, p.z - 0.006], [0, side * 0.3, 0], [0.45, 1.25, 0.85]);
      const cup = add(head, new THREE.CylinderGeometry(0.03, 0.03, 0.022, 32), black, [p.x + side * 0.016, p.y, p.z - 0.004], [0, 0, Math.PI / 2]);
      add(cup, new THREE.CylinderGeometry(0.02, 0.02, 0.024, 32), orange, [0, side * 0.002, 0]);
    }
    const band = add(head, new THREE.TorusGeometry(0.092, 0.006, 10, 48, Math.PI), black, [0, 0.008, -0.004], [0, 0, 0], [1.02, 1.18, 1]);
    band.rotation.x = -0.08;
    const from = new THREE.Vector3(-0.085, -0.012, 0.012);
    const to = new THREE.Vector3(-0.024, -0.06, 0.075);
    const curve = new THREE.QuadraticBezierCurve3(from, new THREE.Vector3(-0.075, -0.06, 0.06), to);
    add(head, new THREE.TubeGeometry(curve, 20, 0.0025, 8), black);
    add(head, new THREE.SphereGeometry(0.0065, 16, 12), new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.9 }), to.toArray(), null, [1.3, 1, 1]);
  }

  buildHair(head, unit) {
    const hairline = (x, y, z) => {
      const front = sstep(-0.3, 0.75, z);
      let h = -0.42 + 0.84 * front; // מהעורף ועד המצח
      h -= 0.3 * gauss(x * x * 0.0 + (z - 0.1) ** 2, 0.3) * sstep(0.6, 0.95, Math.abs(x)); // פאות ליד האוזניים
      return h;
    };
    // כיפה: עותק של צורת הראש, מעט מורחב, רק מעל קו השיער
    const g = new THREE.SphereGeometry(1, 96, 64);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    const keepV = [];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const out = shapeHead(v.x, v.y, v.z);
      const grow = 1.05 + 0.03 * sstep(0, 1, v.y) + 0.015 * sstep(0, -0.8, v.z);
      p.setXYZ(i, out[0] * grow, out[1] * grow + 0.002, out[2] * grow);
      keepV.push(v.y > hairline(v.x, v.y, v.z));
    }
    const idx = g.index.array;
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      if (keepV[idx[i]] && keepV[idx[i + 1]] && keepV[idx[i + 2]]) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    g.setIndex(keep);
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const k = 0.8 + Math.random() * 0.3;
      col.set([HAIR.r * k, HAIR.g * k, HAIR.b * k], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, envMapIntensity: 0.15, side: THREE.DoubleSide });
    head.add(new THREE.Mesh(g, hairMat));

    // קווצות: חרוטים שטוחים שזורמים מהקודקוד החוצה
    const strandGeo = new THREE.CylinderGeometry(0.0012, 0.005, 0.032, 5);
    strandGeo.translate(0, 0.016, 0);
    const N = 1100;
    const strands = new THREE.InstancedMesh(strandGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, envMapIntensity: 0.15 }), N);
    const crown = new THREE.Vector3(0, 0.75, -0.55).normalize();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const c = new THREE.Color();
    let n = 0, guard = 0;
    while (n < N && guard++ < 20000) {
      const u = new THREE.Vector3().randomDirection();
      if (u.y < hairline(u.x, u.y, u.z) + 0.12) continue;
      const out = shapeHead(u.x, u.y, u.z);
      const pos = new THREE.Vector3(...out).multiplyScalar(1.045 + 0.03 * sstep(0, 1, u.y) + Math.random() * 0.012);
      const normal = pos.clone().normalize();
      // כיוון הזרימה: מהקודקוד החוצה, ובחזית – גולש קדימה ומטה על המצח
      let dir = u.clone().sub(crown).projectOnPlane(normal);
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1).projectOnPlane(normal);
      dir.normalize();
      const fringe = sstep(0.3, 0.8, u.z);
      dir.lerp(new THREE.Vector3(0.15 * Math.sign(u.x || 1), -0.6, 0.4).projectOnPlane(normal).normalize(), fringe * 0.6).normalize();
      const xAxis = new THREE.Vector3().crossVectors(dir, normal).normalize();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, dir).normalize();
      m.makeBasis(xAxis, dir, zAxis);
      q.setFromRotationMatrix(m);
      // קצת הרמה מהקרקפת כדי לתת נפח
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.03 + Math.random() * 0.07));
      const len = 0.6 + Math.random() * 0.6 + fringe * 0.4;
      s.set(1.4 + Math.random() * 0.8, len, 0.25);
      m.compose(pos, q, s);
      strands.setMatrixAt(n, m);
      const k = 0.75 + Math.random() * 0.45;
      strands.setColorAt(n, c.copy(HAIR).multiplyScalar(k));
      n++;
    }
    strands.count = n;
    head.add(strands);
  }

  setSize(w, h) {
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // מחווה: 'wave' – נפנוף שלום, 'point' – הצבעה לכיוון חלון ההסבר, 'open' – ידיים פתוחות
  play(gesture, duration = 2.2) {
    this.gesture = gesture;
    this.gestureTime = duration;
  }

  // הדגשה קטנה בפה ובגבות (למשל בתחילת מילה)
  pulse() {
    this.accent = 1;
  }

  update(dt, talking, lookSide = 0) {
    const t = (this.time += dt);
    const k = (speed) => 1 - Math.exp(-speed * dt);

    // נשימה ותנודה קלה
    const breathe = Math.sin(t * 1.6);
    this.body.scale.set(1 + breathe * 0.006, 1, 1 + breathe * 0.01);
    this.root.position.y = Math.sin(t * 0.9) * 0.008;
    this.root.rotation.y += (lookSide * 0.3 + Math.sin(t * 0.4) * 0.05 - this.root.rotation.y) * k(3);
    this.root.rotation.z = Math.sin(t * 0.7) * 0.012;

    // פה ולסת
    let target = 0;
    if (talking) {
      const n = Math.sin(t * 15.7) * 0.5 + Math.sin(t * 9.3 + 1.3) * 0.35 + Math.sin(t * 5.1) * 0.15;
      target = 0.15 + Math.max(0, n) * 0.85 + this.accent * 0.25;
    }
    this.accent *= Math.exp(-dt * 8);
    this.mouth += (target - this.mouth) * k(20);
    const jaw = clamp(this.mouth * 0.7, 0, 0.8); // 1 = 0.3 רדיאן
    this.smile += ((talking ? 0.3 : 0.75) - this.smile) * k(2);
    this.headMesh.morphTargetInfluences[0] = jaw;
    this.headMesh.morphTargetInfluences[1] = this.smile;
    // שיניים תחתונות ולשון זזות יחד עם הלסת
    const a = jaw * 0.3;
    this.jawParts.position.copy(this.jawPivot).negate().applyAxisAngle(new THREE.Vector3(1, 0, 0), a).add(this.jawPivot);
    this.jawParts.rotation.x = a;

    // ראש
    const nod = talking ? Math.sin(t * 2.9) * 0.05 + Math.sin(t * 1.7) * 0.03 : 0;
    this.head.rotation.x += (nod - 0.04 + this.accent * 0.02 - this.head.rotation.x) * k(6);
    this.head.rotation.z = Math.sin(t * 0.8) * 0.04 + (talking ? Math.sin(t * 2.1) * 0.035 : 0);
    this.head.rotation.y += (lookSide * 0.3 + Math.sin(t * 0.5) * 0.08 - this.head.rotation.y) * k(4);

    // עיניים: מבט, תנועות קטנות ומצמוץ
    this.nextSaccade -= dt;
    if (this.nextSaccade <= 0) {
      this.saccade.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.08);
      this.nextSaccade = 0.6 + Math.random() * 1.8;
    }
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.18;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    const closed = this.blink > 0 ? 1 - Math.abs(this.blink - 0.09) / 0.09 : 0;
    for (const e of this.eyes) {
      e.ball.rotation.y = lookSide * 0.35 + this.saccade.x;
      e.ball.rotation.x = -this.saccade.y + 0.02;
      // העפעף העליון יורד בזמן מצמוץ; כשמחייכים העין מעט מצטמצמת
      e.upper.rotation.x = 0.2 + closed * 0.52;
      e.lower.rotation.x = -0.08 - closed * 0.12 - this.smile * 0.06;
    }
    this.brows.position.y = talking ? 0.0012 + this.accent * 0.0025 + Math.max(0, Math.sin(t * 2.2)) * 0.0015 : 0;

    // ידיים
    this.gestureTime = Math.max(0, this.gestureTime - dt);
    const g = this.gestureTime > 0 ? this.gesture : null;
    for (const arm of this.arms) {
      const s = arm.side;
      // מנוחה: ידיים למטה
      let sz = s * 0.1, sx = 0.02, ex = -0.2, ez = 0;
      if (talking) {
        // מסביר: אמות קדימה, הידיים זזות מול החזה
        sz = s * (0.16 + Math.sin(t * 2.4 + s) * 0.06);
        sx = -0.45 + Math.sin(t * 1.9 + s * 1.7) * 0.12;
        ex = -1.55 + Math.sin(t * 2.7 + s * 0.9) * 0.2;
        ez = s * -0.25;
      }
      if (g === 'wave' && s === 1) {
        sz = 0.3; sx = -0.25; ex = -0.1; ez = 2.5 + Math.sin(t * 8) * 0.3;
      } else if (g === 'point' && s === Math.sign(lookSide || -1)) {
        sz = s * 0.55; sx = -1.05; ex = -0.25; ez = 0;
      } else if (g === 'open') {
        sz = s * 0.45; sx = -0.55; ex = -1.0; ez = s * 0.3;
      }
      arm.sz += (sz - arm.sz) * k(6);
      arm.sx += (sx - arm.sx) * k(6);
      arm.ex += (ex - arm.ex) * k(6);
      arm.ez += (ez - arm.ez) * k(6);
      arm.shoulder.rotation.set(arm.sx, 0, arm.sz);
      arm.elbow.rotation.set(arm.ex, 0, arm.ez);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
