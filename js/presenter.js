// נועם – דמות ילד תלת־ממדית שמציגה את ההסברים.
// הדמות בנויה כולה מצורות של three.js (בלי קבצי מודל), ומצוירת על canvas נפרד ושקוף.

import * as THREE from 'three';

const COLORS = {
  skin: '#f2c29b',
  skinShade: '#e3a982',
  hair: '#5a3522',
  suit: '#f3f5fb',
  accent: '#ff9f1c',
  blue: '#3a7bd5',
  dark: '#2b2f3a',
  iris: '#6b4423',
  mouth: '#7a2330',
  cheek: '#ff8a8a',
};

function toonGradient() {
  const data = new Uint8Array([90, 170, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export class Presenter {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 0.55, 7.6);
    this.camera.lookAt(0, 0.45, 0);

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2440, 1.4));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
    key.position.set(2, 3, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb0ff, 1.6);
    rim.position.set(-3, 1, -3);
    this.scene.add(rim);

    this.gradient = toonGradient();
    this.build();

    this.time = 0;
    this.mouth = 0;
    this.accent = 0;
    this.nextBlink = 2;
    this.blink = 0;
    this.gestureTime = 0;
    this.gesture = null;
    this.look = 0;
  }

  mat(color, opts = {}) {
    return new THREE.MeshToonMaterial({ color, gradientMap: this.gradient, ...opts });
  }

  add(parent, geo, color, pos = [0, 0, 0], scale = null, opts) {
    const m = new THREE.Mesh(geo, typeof color === 'string' ? this.mat(color, opts) : color);
    m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    parent.add(m);
    return m;
  }

  build() {
    const C = COLORS;
    const root = (this.root = new THREE.Group());
    this.scene.add(root);

    // גוף – חליפת חלל
    this.add(root, new THREE.CapsuleGeometry(0.36, 0.22, 8, 24), C.suit, [0, 0.4, 0]);
    this.add(root, new THREE.TorusGeometry(0.25, 0.07, 12, 32), C.accent, [0, 0.84, 0]).rotation.x = Math.PI / 2;
    this.add(root, new THREE.TorusGeometry(0.36, 0.045, 10, 40), C.blue, [0, 0.14, 0]).rotation.x = Math.PI / 2;
    this.add(root, new THREE.BoxGeometry(0.5, 0.56, 0.22), C.blue, [0, 0.45, -0.36]);
    // סמל על החזה: כוכב לכת קטן עם טבעת
    const badge = new THREE.Group();
    badge.position.set(-0.14, 0.52, 0.34);
    badge.rotation.y = -0.3;
    root.add(badge);
    this.add(badge, new THREE.SphereGeometry(0.07, 16, 12), C.accent);
    const ring = this.add(badge, new THREE.TorusGeometry(0.105, 0.012, 6, 24), C.blue);
    ring.rotation.set(1.2, 0, 0.3);
    // כפתורים
    this.add(root, new THREE.SphereGeometry(0.035, 10, 8), '#ff5a5a', [0.13, 0.5, 0.35]);
    this.add(root, new THREE.SphereGeometry(0.035, 10, 8), '#4cd964', [0.13, 0.4, 0.355]);

    // רגליים ומגפיים
    for (const x of [-0.16, 0.16]) {
      this.add(root, new THREE.CapsuleGeometry(0.13, 0.22, 6, 16), C.suit, [x, -0.28, 0]);
      this.add(root, new THREE.SphereGeometry(0.16, 16, 12), C.blue, [x, -0.55, 0.05], [1, 0.72, 1.25]);
    }

    // ידיים (ציר בכתף)
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.38, 0.72, 0);
      root.add(shoulder);
      this.add(shoulder, new THREE.CapsuleGeometry(0.1, 0.3, 6, 16), C.suit, [0, -0.24, 0]);
      this.add(shoulder, new THREE.TorusGeometry(0.1, 0.03, 8, 20), C.accent, [0, -0.42, 0]).rotation.x = Math.PI / 2;
      this.add(shoulder, new THREE.SphereGeometry(0.13, 16, 12), C.suit, [0, -0.52, 0]);
      shoulder.rotation.z = side * 0.22;
      this.arms.push({ side, pivot: shoulder, z: side * 0.22, x: 0 });
    }

    // ראש
    const head = (this.head = new THREE.Group());
    head.position.set(0, 1.28, 0);
    root.add(head);
    this.add(head, new THREE.SphereGeometry(0.55, 40, 32), C.skin, [0, 0, 0], [1, 0.95, 0.95]);
    for (const side of [-1, 1]) {
      this.add(head, new THREE.SphereGeometry(0.1, 16, 12), C.skin, [side * 0.53, -0.03, 0], [0.55, 1, 0.9]);
    }

    // שיער
    const hairCap = this.add(head, new THREE.SphereGeometry(0.585, 40, 24, 0, Math.PI * 2, 0, 1.35), C.hair);
    hairCap.rotation.x = -0.42;
    hairCap.scale.set(1, 0.97, 0.98);
    const fringe = [
      [-0.26, 0.33, 0.39, 0.5], [-0.08, 0.38, 0.42, -0.2], [0.12, 0.37, 0.41, 0.3], [0.29, 0.31, 0.37, -0.4],
    ];
    for (const [x, y, z, r] of fringe) {
      const tuft = this.add(head, new THREE.SphereGeometry(0.15, 16, 12), C.hair, [x, y, z], [1.1, 0.6, 0.7]);
      tuft.rotation.z = r;
    }
    const cowlick = this.add(head, new THREE.ConeGeometry(0.06, 0.22, 10), C.hair, [0.05, 0.6, -0.05]);
    cowlick.rotation.z = -0.5;

    // עיניים
    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.19, 0.02, 0.44);
      head.add(eye);
      this.add(eye, new THREE.SphereGeometry(0.12, 24, 16), '#ffffff', [0, 0, 0], [1, 1.18, 0.55]);
      const iris = new THREE.Group();
      eye.add(iris);
      this.add(iris, new THREE.SphereGeometry(0.078, 20, 14), C.iris, [0, -0.005, 0.045], [1, 1.1, 0.5]);
      this.add(iris, new THREE.SphereGeometry(0.042, 16, 12), '#15100c', [0, -0.005, 0.075], [1, 1.1, 0.4]);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      shine.position.set(0.028, 0.035, 0.095);
      iris.add(shine);
      this.eyes.push({ group: eye, iris });

      const brow = this.add(head, new THREE.CapsuleGeometry(0.022, 0.12, 4, 8), C.hair, [side * 0.19, 0.2, 0.5]);
      brow.rotation.z = Math.PI / 2 + side * 0.12;
      this.eyes.at(-1).brow = brow;

      const cheek = this.add(head, new THREE.CircleGeometry(0.075, 20), new THREE.MeshBasicMaterial({
        color: C.cheek, transparent: true, opacity: 0.45, depthWrite: false,
      }), [side * 0.31, -0.13, 0.452]);
      cheek.rotation.y = side * 0.55;
    }

    this.add(head, new THREE.SphereGeometry(0.045, 12, 10), C.skinShade, [0, -0.08, 0.525]);

    // פה: חיוך כשהוא שותק, פה פתוח כשהוא מדבר
    const mouth = new THREE.Group();
    mouth.position.set(0, -0.25, 0.475);
    mouth.rotation.x = -0.25;
    head.add(mouth);
    this.smile = this.add(mouth, new THREE.TorusGeometry(0.075, 0.016, 8, 20, Math.PI), C.mouth);
    this.smile.rotation.z = Math.PI;
    this.smile.position.y = 0.04;
    this.openMouth = this.add(mouth, new THREE.SphereGeometry(0.09, 20, 14), C.mouth, [0, 0, 0], [1.1, 0.3, 0.45]);
    this.tongue = this.add(mouth, new THREE.SphereGeometry(0.055, 12, 10), '#e0606e', [0, -0.03, 0.02], [1.2, 0.5, 0.5]);

    // אוזניות עם מיקרופון של מגיש
    const band = this.add(head, new THREE.TorusGeometry(0.6, 0.028, 8, 40, Math.PI), C.dark, [0, 0.02, -0.02]);
    band.rotation.y = 0;
    for (const side of [-1, 1]) {
      const cup = this.add(head, new THREE.CylinderGeometry(0.12, 0.12, 0.09, 20), C.dark, [side * 0.6, 0, 0]);
      cup.rotation.z = Math.PI / 2;
      this.add(head, new THREE.CylinderGeometry(0.075, 0.075, 0.1, 20), C.accent, [side * 0.64, 0, 0]).rotation.z = Math.PI / 2;
    }
    const from = new THREE.Vector3(-0.6, -0.08, 0.06);
    const to = new THREE.Vector3(-0.2, -0.3, 0.5);
    const boom = this.add(head, new THREE.CylinderGeometry(0.015, 0.015, from.distanceTo(to), 8), C.dark);
    boom.position.copy(from).add(to).multiplyScalar(0.5);
    boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    this.add(head, new THREE.SphereGeometry(0.045, 12, 10), C.dark, to.toArray());
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

    // ריחוף בחלל
    this.root.position.y = Math.sin(t * 1.3) * 0.07;
    this.root.rotation.z = Math.sin(t * 0.8) * 0.035;
    this.root.rotation.y = Math.sin(t * 0.5) * 0.12 + lookSide * 0.25;

    // פה
    let target = 0;
    if (talking) {
      const n = Math.sin(t * 17.3) * 0.5 + Math.sin(t * 11.1 + 1.3) * 0.35 + Math.sin(t * 6.7) * 0.15;
      target = 0.2 + Math.max(0, n) * 0.8 + this.accent * 0.3;
    }
    this.accent *= Math.exp(-dt * 8);
    this.mouth += (target - this.mouth) * k(18);
    const open = this.mouth > 0.06;
    this.smile.visible = !open;
    this.openMouth.visible = this.tongue.visible = open;
    this.openMouth.scale.y = 0.25 + this.mouth * 0.75;
    this.tongue.position.y = -0.03 - this.mouth * 0.02;

    // ראש
    const nod = talking ? Math.sin(t * 3.1) * 0.06 + Math.sin(t * 1.7) * 0.04 : 0;
    this.head.rotation.x += (nod - 0.05 - this.head.rotation.x) * k(6);
    this.head.rotation.z = Math.sin(t * 0.9) * 0.06 + (talking ? Math.sin(t * 2.3) * 0.05 : 0);
    this.head.rotation.y += (lookSide * 0.35 + Math.sin(t * 0.6) * 0.1 - this.head.rotation.y) * k(4);

    // מצמוץ
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.16;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    const lid = this.blink > 0 ? Math.max(0.08, Math.abs(this.blink - 0.08) / 0.08) : 1;
    const browLift = talking ? 0.015 + this.accent * 0.03 + Math.max(0, Math.sin(t * 2.2)) * 0.02 : 0;
    for (const e of this.eyes) {
      e.group.scale.y = lid;
      e.iris.position.x = lookSide * 0.025;
      e.brow.position.y = 0.2 + browLift;
    }

    // ידיים
    this.gestureTime = Math.max(0, this.gestureTime - dt);
    const g = this.gestureTime > 0 ? this.gesture : null;
    for (const arm of this.arms) {
      let z = arm.side * 0.22, x = 0;
      if (talking) {
        z = arm.side * (0.32 + Math.sin(t * 2.6 + arm.side) * 0.12);
        x = -0.25 + Math.sin(t * 2.1 + arm.side * 1.7) * 0.15;
      }
      if (g === 'wave' && arm.side === 1) {
        z = 2.5 + Math.sin(t * 9) * 0.35;
        x = 0;
      } else if (g === 'point' && arm.side === Math.sign(lookSide || -1)) {
        z = arm.side * 1.45;
        x = -0.45;
      } else if (g === 'open') {
        z = arm.side * 1.05;
        x = -0.4;
      }
      arm.z += (z - arm.z) * k(7);
      arm.x += (x - arm.x) * k(7);
      arm.pivot.rotation.set(arm.x, 0, arm.z);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
