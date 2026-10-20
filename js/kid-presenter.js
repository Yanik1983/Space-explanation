// נועם – ילד בן 6–7 בחליפת חלל שמציג את ההסברים.
// הגוף והפנים הם מודל תלת־ממדי מוכן עם שלד מלא ולסת ("Kid-character-fully-rigged" של Guilherme Navarro, CC BY 4.0).
// חליפת החלל, האוזניות, התג והחיבורים נוספו בקוד. המודל נטען ברקע; אם הטעינה נכשלת חוזרים לנועם הישן (presenter.js).
// היחידות הן מטרים. הילד מביט אל +z, וצד ימין שלו הוא −x.

import * as THREE from 'three';
import { tt } from './i18n.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ProceduralPresenter } from './presenter.js';

const MODEL = 'models/noam.glb';
const D = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const rot = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const euler = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const patchTexture = () => canvasTexture(128, 128, (g) => {
  g.fillStyle = '#1d3d8f';
  g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.fillStyle = '#f2b13a';
  g.beginPath(); g.arc(64, 64, 24, 0, 7); g.fill();
  g.strokeStyle = '#f7d27a';
  g.lineWidth = 6;
  g.beginPath(); g.ellipse(64, 64, 46, 12, -0.4, 0, 7); g.stroke();
});

const nameTagTexture = (name) => canvasTexture(256, 96, (g, w, h) => {
  g.fillStyle = '#1d3f8f';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff';
  g.font = 'bold 58px Rubik, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'rtl';
  g.fillText(name, w / 2, h / 2 + 4);
});

export class Presenter {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth || 300;
    this.height = container.clientHeight || 330;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 0.95;
    r.domElement.style.opacity = '0';
    r.domElement.style.transition = 'opacity 0.5s';
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
    this.camera.position.set(0.03, 1.0, 2.15);
    this.camera.lookAt(0.03, 0.96, 0);

    // תאורה: אור מפתח חם, מילוי רך וקריר, ושני אורות קצה מאחור שמפרידים את הדמות מהחלל
    this.scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x5a4a40, 1.5));
    const key = new THREE.DirectionalLight(0xfff1dd, 2.8);
    key.position.set(0.8, 1.6, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc0ff, 2.0);
    rim.position.set(-1.6, 1.5, -1.5);
    this.scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xffd2a8, 1.2);
    rim2.position.set(1.5, 1.1, -1.5);
    this.scene.add(rim2);

    this.time = 0;
    this.mouth = 0;
    this.accent = 0;
    this.nextBlink = 1.5;
    this.blink = 0;
    this.gesture = null;
    this.gestureTime = 0;
    this.ready = false;
    this.curlSign = { Left: 1, Right: 1 };
    this.arms = [1, -1].map((side) => ({ side, az: -side * 72 * D, ax: -0.08, e: 0, ey: 0, ez: 0, curl: 0.35 }));
    this.followers = [];
    this.setSize(this.width, this.height);

    new GLTFLoader().load(MODEL, (gltf) => {
      try {
        this.build(gltf.scene);
      } catch (err) {
        console.warn('Noam model failed, using procedural Noam', err);
        this.useFallback();
      }
    }, undefined, (err) => {
      console.warn('Noam model failed to load, using procedural Noam', err);
      this.useFallback();
    });
  }

  // אם המודל לא נטען (למשל בלי רשת) – חוזרים לנועם שנבנה כולו בקוד
  useFallback() {
    if (this.fallback) return;
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.fallback = new ProceduralPresenter(this.container);
    this.fallback.setSize(this.width, this.height);
    this.fallback.time = this.time;
  }

  build(kid) {
    this.kid = kid;
    const root = (this.root = new THREE.Group());
    root.add(kid);
    this.scene.add(root);
    root.updateMatrixWorld(true);

    const bones = (this.bones = {});
    const rest = (this.rest = {});
    kid.traverse((o) => {
      if (o.isBone) {
        const key = o.name.replace(/_\d+$/, '');
        bones[key] = o;
        rest[key] = o.quaternion.clone();
      }
      if (o.isSkinnedMesh) o.frustumCulled = false;
    });
    this.jaw = bones.jaw_BND;

    const white = new THREE.MeshStandardMaterial({ color: '#eceff3', roughness: 0.82 });
    const grey = new THREE.MeshStandardMaterial({ color: '#8d96a3', roughness: 0.7 });
    const metal = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.85, roughness: 0.3 });
    const orange = new THREE.MeshStandardMaterial({ color: '#f08a1c', roughness: 0.6 });
    const blue = new THREE.MeshStandardMaterial({ color: '#2a56b8', roughness: 0.55 });
    const black = new THREE.MeshStandardMaterial({ color: '#1c1e22', roughness: 0.45, metalness: 0.2 });

    // הבגדים המקוריים הופכים לחליפה: חולצה ומכנסיים לבנים, גרביים לבנות, נעליים בהירות
    const suit = [];
    kid.traverse((m) => {
      if (!m.isMesh) return;
      const name = [].concat(m.material)[0].name;
      if (name === 'lambert8' || name === 'lambert9') {
        m.material = white;
        if (name === 'lambert8') suit.push(m);
      } else if (name === 'lambert10' || name === 'lambert11' || name === 'RootNode') {
        m.material = m.material.clone();
        m.material.map = null;
        m.material.color.set('#dfe3e9');
      }
    });
    this.fitSuit(suit);

    const wp = (b) => b.getWorldPosition(new THREE.Vector3());
    const add = (obj) => { this.scene.add(obj); return obj; };
    const up = new THREE.Vector3(0, 1, 0);

    // שרוולים ורגליים: גלילים מתכווצים בין שני מפרקים
    const limb = (a, b, r0, r1, extend = 1) => {
      const geo = new THREE.CylinderGeometry(r1, r0, 1, 24, 1);
      geo.translate(0, 0.5, 0);
      const m = add(new THREE.Mesh(geo, white));
      this.followers.push(() => {
        const A = wp(bones[a]);
        const d = wp(bones[b]).sub(A);
        m.position.copy(A);
        m.scale.set(1, d.length() * extend, 1);
        m.quaternion.setFromUnitVectors(up, d.normalize());
      });
    };
    // טבעת (חפתים, קרסוליים) בנקודה t בין שני מפרקים
    const ring = (a, b, t, r, h, mat) => {
      const m = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), mat));
      this.followers.push(() => {
        const A = wp(bones[a]);
        const d = wp(bones[b]).sub(A);
        m.position.copy(A).addScaledVector(d, t);
        m.quaternion.setFromUnitVectors(up, d.normalize());
      });
    };
    // חפץ שנצמד לעצם: מיקום ההיסט וסיבוב ההתחלתי נשמרים, והחפץ מקבל את הסיבוב של העצם
    const bq0 = new THREE.Quaternion(), bq = new THREE.Quaternion(), dq = new THREE.Quaternion();
    const attach = (boneName, obj, offset, q0 = null) => {
      const b = bones[boneName];
      const rq0 = b.getWorldQuaternion(bq0).clone();
      const rqInv = rq0.clone().invert();
      const off = new THREE.Vector3(...offset);
      const objQ0 = q0 ? q0.clone() : new THREE.Quaternion();
      add(obj);
      const place = () => {
        const pos = wp(b);
        dq.copy(b.getWorldQuaternion(bq)).multiply(rqInv);
        obj.position.copy(pos).add(off.clone().applyQuaternion(dq));
        obj.quaternion.copy(dq).multiply(objQ0);
      };
      this.followers.push(place);
      place();
      return obj;
    };

    for (const side of ['Left', 'Right']) {
      limb(`Boy_${side}Arm`, `Boy_${side}ForeArm`, 0.057, 0.043);
      limb(`Boy_${side}ForeArm`, `Boy_${side}Hand`, 0.043, 0.04, 1.14);
      limb(`Boy_${side}UpLeg`, `Boy_${side}Leg`, 0.06, 0.049);
      limb(`Boy_${side}Leg`, `Boy_${side}Foot`, 0.049, 0.039);
      ring(`Boy_${side}ForeArm`, `Boy_${side}Hand`, 0.8, 0.043, 0.024, blue);
      ring(`Boy_${side}ForeArm`, `Boy_${side}Hand`, 0.97, 0.039, 0.018, orange);
      ring(`Boy_${side}Arm`, `Boy_${side}ForeArm`, 0.18, 0.05, 0.02, blue);
      ring(`Boy_${side}Leg`, `Boy_${side}Foot`, 0.86, 0.043, 0.026, orange);
      const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 18), white));
      this.followers.push(() => cap.position.copy(wp(bones[`Boy_${side}Arm`])));
    }

    const mesh = (geo, mat) => new THREE.Mesh(geo, mat);
    const flat = Math.PI / 2;
    // צווארון מתכת
    attach('Boy_Neck', mesh(new THREE.TorusGeometry(0.082, 0.017, 14, 40), metal), [0, -0.012, 0], euler(flat + 0.1, 0, 0));
    attach('Boy_Neck', mesh(new THREE.TorusGeometry(0.083, 0.005, 8, 40), orange), [0, -0.03, 0.002], euler(flat + 0.1, 0, 0));
    // חזה: רוכסן, לוח בקרה, תג כוכב לכת ושם
    attach('Boy_Spine2', mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.26, 6), grey), [0, 0.065, 0.088]);
    const panel = attach('Boy_Spine2', mesh(new THREE.BoxGeometry(0.085, 0.05, 0.02), grey), [0, -0.02, 0.094], euler(-0.04, 0, 0));
    for (const [color, x] of [['#e2483d', -0.025], ['#3fcf6b', 0], ['#f2c133', 0.025]]) {
      const l = mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
      l.position.set(x, 0, 0.011);
      l.rotation.x = flat;
      panel.add(l);
    }
    attach('Boy_Spine2', mesh(new THREE.CircleGeometry(0.03, 40), new THREE.MeshStandardMaterial({ map: patchTexture(), roughness: 0.8 })), [0.06, 0.13, 0.087], euler(-0.15, 0.35, 0));
    attach('Boy_Spine2', mesh(new THREE.PlaneGeometry(0.06, 0.022), new THREE.MeshStandardMaterial({ map: nameTagTexture(tt('נועם', 'Noam')), roughness: 0.8 })), [-0.062, 0.14, 0.087], euler(-0.15, -0.35, 0));
    attach('Boy_Spine2', mesh(new THREE.BoxGeometry(0.2, 0.26, 0.09), new THREE.MeshStandardMaterial({ color: '#d7dbe1', roughness: 0.7 })), [0, 0.04, -0.1]);

    // אוזניות עם מיקרופון
    for (const x of [1, -1]) {
      const cup = attach('Boy_Head', mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.032, 28), black), [x * 0.128, 0.052, -0.006], euler(0, 0, flat));
      const inner = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.034, 28), orange);
      inner.position.y = x * 0.004;
      cup.add(inner);
    }
    attach('Boy_Head', mesh(new THREE.TorusGeometry(0.134, 0.011, 12, 48, Math.PI), black), [0, 0.052, -0.012]);
    const curve = new THREE.CatmullRomCurve3([[0.13, 0.04, 0.012], [0.118, -0.01, 0.085], [0.07, -0.045, 0.14], [0.03, -0.062, 0.145]].map((p) => new THREE.Vector3(...p)));
    attach('Boy_Head', mesh(new THREE.TubeGeometry(curve, 24, 0.0028, 8), black), [0, 0, 0]);
    const tip = mesh(new THREE.SphereGeometry(0.008, 16, 12), new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.9 }));
    tip.scale.set(1.3, 1, 1);
    attach('Boy_Head', tip, [0.027, -0.063, 0.146]);

    this.buildGloves(white);
    this.buildLids(attach);

    this.ready = true;
    this.renderer.domElement.style.opacity = '1';
  }

  // התאמת החולצה לגוף: מצמצמים אותה סביב החזה והמותניים עד קרוב לגוף הילד (בלי לגעת בשרוולים ובמכנסיים)
  fitSuit(suit) {
    const body = [];
    this.kid.traverse((m) => {
      if (m.isSkinnedMesh && [].concat(m.material)[0].name === 'lambert3') body.push(m);
    });
    const v = new THREE.Vector3();
    // מיקום קודקוד בעולם במצב המנוחה של השלד
    const rw = (m, i, loc, out) => {
      out.copy(loc);
      m.applyBoneTransform(i, out);
      return out.applyMatrix4(m.matrixWorld);
    };
    const BIN = 0.04;
    const bins = {};
    const w = new THREE.Vector3();
    const record = (m, tag) => {
      const P = m.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        rw(m, i, v, w);
        if (Math.abs(w.x) < 0.17 && w.y > 0.55 && w.y < 1.0) {
          const k = Math.round(w.y / BIN);
          const b = (bins[k] ||= { B: { x: 0, z0: 9, z1: -9 }, S: { x: 0, z0: 9, z1: -9 } })[tag];
          b.x = Math.max(b.x, Math.abs(w.x));
          b.z0 = Math.min(b.z0, w.z);
          b.z1 = Math.max(b.z1, w.z);
        }
      }
    };
    // החולצה היא הרשת הלבנה שמרכזה בגובה החזה (ולא המכנסיים)
    const shirts = suit.filter((m) => {
      const P = m.geometry.attributes.position;
      let sum = 0;
      for (let i = 0; i < P.count; i += 7) {
        v.fromBufferAttribute(P, i);
        sum += rw(m, i, v, w).y;
      }
      return sum / Math.ceil(P.count / 7) > 0.72;
    });
    body.forEach((m) => record(m, 'B'));
    shirts.forEach((m) => record(m, 'S'));
    const MARGIN = 0.012;
    const at = (y) => {
      const f = y / BIN, k0 = Math.floor(f), t = f - k0;
      const a = bins[k0] || bins[k0 + 1], b = bins[k0 + 1] || bins[k0];
      if (!a || !a.S.x) return null;
      const L = (p, q) => p + (q - p) * t;
      return { Bx: L(a.B.x, b.B.x), Bz0: L(a.B.z0, b.B.z0), Bz1: L(a.B.z1, b.B.z1), Sx: L(a.S.x, b.S.x), Sz0: L(a.S.z0, b.S.z0), Sz1: L(a.S.z1, b.S.z1) };
    };
    const w0 = new THREE.Vector3(), w1 = new THREE.Vector3(), t1 = new THREE.Vector3(), vv = new THREE.Vector3(), d = new THREE.Vector3();
    const J = new THREE.Matrix3();
    const EPS = 1e-3;
    for (const m of shirts) {
      const P = m.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        rw(m, i, v, w0);
        w1.copy(w0);
        const wy = smooth(0.66, 0.8, w0.y) * (1 - smooth(0.96, 1.04, w0.y)) * (1 - smooth(0.12, 0.2, Math.abs(w0.x)));
        if (wy <= 0) continue;
        const g = at(w0.y);
        if (!g) continue;
        w1.x = w0.x * (1 - wy + wy * Math.min(1, (g.Bx + MARGIN) / g.Sx));
        const zc = (g.Sz0 + g.Sz1) / 2, bc = (g.Bz0 + g.Bz1) / 2;
        const tz = Math.min(1, (g.Bz1 - g.Bz0 + 2 * MARGIN) / (g.Sz1 - g.Sz0));
        w1.z = (w0.z - zc) * (1 - wy + wy * tz) + zc + (bc - zc) * wy;
        d.copy(w1).sub(w0);
        // הזזה בעולם מתורגמת להזזה במרחב הרשת (ג'קוביאן מספרי)
        const cols = [[EPS, 0, 0], [0, EPS, 0], [0, 0, EPS]].map((e) => {
          vv.copy(v).add(t1.set(...e));
          rw(m, i, vv, t1);
          return t1.clone().sub(w0).divideScalar(EPS);
        });
        J.set(cols[0].x, cols[1].x, cols[2].x, cols[0].y, cols[1].y, cols[2].y, cols[0].z, cols[1].z, cols[2].z).invert();
        d.applyMatrix3(J);
        P.setXYZ(i, v.x + d.x, v.y + d.y, v.z + d.z);
      }
      P.needsUpdate = true;
    }
  }


  // כפפות עם אצבעות: עותק לבן ומעט מנופח של משולשי היד בגוף של הילד, שמחובר לאותן עצמות (גם עצמות האצבעות)
  buildGloves(material) {
    let body = null;
    this.kid.traverse((m) => {
      if (m.isSkinnedMesh && [].concat(m.material)[0].name === 'lambert3') body = m;
    });
    if (!body) return;
    const g = body.geometry;
    const pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const bones = body.skeleton.bones;
    const isHand = bones.map((b) => /Hand|ForeArmRoll1/.test(b.name)); // כולל פרק כף היד
    const handness = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      for (let k = 0; k < 4; k++) if (isHand[si.getComponent(i, k)]) handness[i] += sw.getComponent(i, k);
    }
    const index = g.index ? g.index.array : null;
    const tris = [];
    const keep = [];
    const n = index ? index.length : pos.count;
    for (let t = 0; t < n; t += 3) {
      const a = index ? index[t] : t, b = index ? index[t + 1] : t + 1, c = index ? index[t + 2] : t + 2;
      if (Math.max(handness[a], handness[b], handness[c]) > 0.3) tris.push(a, b, c);
      else keep.push(a, b, c);
    }
    // העור של הידיים מוסר מהגוף, כדי שלא יבצבץ דרך הכפפה
    g.setIndex(keep);
    const remap = new Map();
    const P = [], N = [], SI = [], SW = [], I = [];
    const take = (v) => {
      if (!remap.has(v)) {
        remap.set(v, P.length / 3);
        P.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        N.push(nor.getX(v), nor.getY(v), nor.getZ(v));
        for (let k = 0; k < 4; k++) { SI.push(si.getComponent(v, k)); SW.push(sw.getComponent(v, k)); }
      }
      return remap.get(v);
    };
    for (const v of tris) I.push(take(v));
    // המרה ממטר ליחידות הרשת, כדי לנפח את הכפפה בכ־6.5 מ"מ
    const a = new THREE.Vector3(), b = new THREE.Vector3(), wa = new THREE.Vector3(), wb = new THREE.Vector3();
    const first = [...remap.keys()];
    const rest = (v, out) => { out.fromBufferAttribute(pos, v); body.applyBoneTransform(v, out); return out.applyMatrix4(body.matrixWorld); };
    a.fromBufferAttribute(pos, first[0]); b.fromBufferAttribute(pos, first[Math.floor(first.length / 2)]);
    const local = a.distanceTo(b), world = rest(first[0], wa).distanceTo(rest(first[Math.floor(first.length / 2)], wb));
    const grow = 0.0065 * (local / Math.max(world, 1e-6));
    for (let i = 0; i < P.length; i += 3) { P[i] += N[i] * grow; P[i + 1] += N[i + 1] * grow; P[i + 2] += N[i + 2] * grow; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    geo.setIndex(I);
    const glove = new THREE.SkinnedMesh(geo, material);
    glove.frustumCulled = false;
    body.parent.add(glove);
    glove.bind(body.skeleton, body.bindMatrix);
    this.glove = glove;
  }

  // עפעפיים: שני דיסקים בצבע העור שיורדים על העין כשמצמצים
  buildLids(attach) {
    const skin = new THREE.MeshStandardMaterial({ color: '#c8978a', roughness: 0.75, side: THREE.DoubleSide });
    const v = new THREE.Vector3();
    const hp = this.bones.Boy_Head.getWorldPosition(new THREE.Vector3());
    this.lids = [];
    this.kid.traverse((m) => {
      if (!m.isSkinnedMesh || [].concat(m.material)[0].name !== 'lambert6') return;
      const P = m.geometry.attributes.position;
      const box = new THREE.Box3();
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        m.applyBoneTransform(i, v);
        box.expandByPoint(v.applyMatrix4(m.matrixWorld));
      }
      const c = box.getCenter(new THREE.Vector3());
      const r = (box.max.y - box.min.y) / 2;
      const geo = new THREE.CircleGeometry(1, 32);
      geo.translate(0, -1, 0); // הקצה העליון של הדיסק בראשית, כך שהעפעף "יורד" מלמעלה
      const lid = new THREE.Mesh(geo, skin);
      lid.visible = false;
      const rx = r * 0.7, ry = r * 0.58;
      const pivot = new THREE.Group();
      pivot.add(lid);
      // העין הימנית במודל מוסטת מעט פנימה ביחס לפתח העין, ולכן מיישרים את העפעף לפתח
      attach('Boy_Head', pivot, [c.x + (c.x < 0 ? -0.007 : 0) - hp.x, c.y + r * 0.54 - hp.y, c.z + r * 1.3 - hp.z]);
      lid.userData = { rx, ry };
      this.lids.push(lid);
    });
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;
    if (this.fallback) return this.fallback.setSize(w, h);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // מחווה: 'wave' – נפנוף שלום, 'point' – הצבעה לכיוון חלון ההסבר, 'open' – ידיים פתוחות
  play(gesture, duration = 2.2) {
    if (this.fallback) return this.fallback.play(gesture, duration);
    this.gesture = gesture;
    this.gestureTime = duration;
  }

  // הדגשה קטנה בפה ובגבות (למשל בתחילת מילה)
  pulse() {
    if (this.fallback) return this.fallback.pulse();
    this.accent = 1;
  }

  // מסובב עצם סביב ציר בעולם (ולא סביב הציר המקומי שלה)
  turn(name, q) {
    const b = this.bones[name];
    const pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(pq.clone().invert().multiply(q).multiply(pq).multiply(b.quaternion));
    b.updateMatrixWorld(true);
  }

  update(dt, talking, lookSide = 0) {
    if (this.fallback) return this.fallback.update(dt, talking, lookSide);
    const t = (this.time += dt);
    if (!this.ready) return;
    const k = (speed) => 1 - Math.exp(-speed * dt);
    const { root, kid, bones, rest } = this;

    // נשימה ותנודה קלה
    const breathe = Math.sin(t * 1.6);
    kid.scale.set(1 + breathe * 0.004, 1, 1 + breathe * 0.006);
    root.position.y = Math.sin(t * 0.9) * 0.006;
    root.rotation.y += (lookSide * 0.3 + Math.sin(t * 0.4) * 0.05 - root.rotation.y) * k(3);
    root.rotation.z = Math.sin(t * 0.7) * 0.01;

    // פה
    let target = 0;
    if (talking) {
      const n = Math.sin(t * 15.7) * 0.5 + Math.sin(t * 9.3 + 1.3) * 0.35 + Math.sin(t * 5.1) * 0.15;
      target = 0.15 + Math.max(0, n) * 0.85 + this.accent * 0.25;
    }
    this.accent *= Math.exp(-dt * 8);
    this.mouth += (target - this.mouth) * k(20);
    const jaw = clamp(this.mouth * 0.7, 0, 0.8);

    // מצמוץ
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.18;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    const closed = this.blink > 0 ? 1 - Math.abs(this.blink - 0.09) / 0.09 : 0;

    // ידיים: ערכי היעד לפי המחווה, עם החלקה
    this.gestureTime = Math.max(0, this.gestureTime - dt);
    const g = this.gestureTime > 0 ? this.gesture : null;
    for (const arm of this.arms) {
      const s = arm.side; // +1 = צד ימין של המסך
      let az = -s * 72 * D, ax = -5 * D, e = 0, ey = 0, ez = 0, curl = 0.35;
      if (talking) {
        az = -s * (77 + Math.sin(t * 2.4 + s) * 3) * D;
        ax = -(26 + Math.sin(t * 1.9 + s * 1.7) * 6) * D;
        e = -(72 + Math.sin(t * 2.7 + s * 0.9) * 9) * D;
        ey = -s * 0.36;
        curl = 0.28;
      }
      if (g === 'wave' && s === 1) {
        az = 14 * D; ax = -30 * D; e = 0; ey = 0; ez = (58 + Math.sin(t * 8) * 18) * D; curl = 0.04;
      } else if (g === 'point' && s === Math.sign(lookSide || -1)) {
        az = -s * 64 * D; ax = -56 * D; e = -62 * D; ey = s * 0.5; ez = 0; curl = 0.12;
      } else if (g === 'open') {
        az = -s * 66 * D; ax = -30 * D; e = -62 * D; ey = s * 0.1; ez = 0; curl = 0.1;
      }
      arm.az += (az - arm.az) * k(6);
      arm.ax += (ax - arm.ax) * k(6);
      arm.e += (e - arm.e) * k(6);
      arm.ey += (ey - arm.ey) * k(6);
      arm.ez += (ez - arm.ez) * k(6);
      arm.curl += (curl - arm.curl) * k(8);
    }

    // שלד: מאפסים את העצמות שזזות, ואז מפעילים סיבובים
    for (const n of ['Boy_Neck', 'Boy_Head', 'Boy_LeftArm', 'Boy_RightArm', 'Boy_LeftForeArm', 'Boy_RightForeArm']) bones[n].quaternion.copy(rest[n]);
    root.updateMatrixWorld(true);
    for (const arm of this.arms) {
      const side = arm.side > 0 ? 'Left' : 'Right';
      this.turn(`Boy_${side}Arm`, rot(AX.z, arm.az));
      this.turn(`Boy_${side}Arm`, rot(AX.x, arm.ax));
      this.turn(`Boy_${side}ForeArm`, rot(AX.x, arm.e));
      this.turn(`Boy_${side}ForeArm`, rot(AX.y, arm.ey));
      this.turn(`Boy_${side}ForeArm`, rot(AX.z, arm.ez));
    }
    // ראש: הנהון בזמן דיבור, הסתכלות לכיוון ההסבר
    const nod = talking ? Math.sin(t * 2.9) * 0.05 + Math.sin(t * 1.7) * 0.03 : 0;
    const headQ = euler(0.03 + nod + this.accent * 0.02, lookSide * 0.18 + Math.sin(t * 0.5) * 0.08, Math.sin(t * 0.8) * 0.04 + (talking ? Math.sin(t * 2.1) * 0.03 : 0));
    const id = new THREE.Quaternion();
    this.turn('Boy_Neck', id.clone().slerp(headQ, 0.45));
    this.turn('Boy_Head', id.clone().slerp(headQ, 0.55));
    // אצבעות: כיפוף קל של כל אצבע סביב הציר המקומי שלה (האגודל נשאר ישר)
    for (const arm of this.arms) {
      const side = arm.side > 0 ? 'Left' : 'Right';
      for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
        for (const [n, w] of [[1, 0.7], [2, 1], [3, 0.8]]) {
          const name = `Boy_${side}Hand${f}${n}`;
          bones[name].quaternion.copy(rest[name]).multiply(rot(AX.y, arm.curl * w * (f === 'Pinky' ? 1.15 : 1) * this.curlSign[side]));
        }
      }
    }
    // לסת: הפתיחה הגדולה ביותר היא כ־0.29 רדיאן
    this.jaw.quaternion.copy(rest.jaw_BND).multiply(rot(AX.x, jaw * 0.36 + 0.015));
    kid.updateMatrixWorld(true);

    for (const f of this.followers) f();
    for (const lid of this.lids) {
      lid.visible = closed > 0.02;
      lid.scale.set(lid.userData.rx, lid.userData.ry * closed, 1);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
