import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUN, PLANETS, TOUR_INTRO, TOUR_OUTRO, SCALE_REAL, SCALE_COMPRESSED } from './data.js';
import { heliocentric, orbitPoints, moonDirection, poleVector } from './orbits.js';
import { planetTexture, ringTexture, glowTexture } from './textures.js';
import { Narrator, splitSentences } from './speech.js';
import { Presenter } from './presenter.js';
import { GLOSSARY, GLOSSARY_FORMS } from './glossary.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86400000;
const MAX_SPIN = 5; // מהירות סיבוב עצמי מקסימלית בתצוגה (רדיאנים לשנייה), כדי שלא "יהבהב"
const UP = new THREE.Vector3(0, 1, 0);

let simDays = (Date.now() - J2000) / DAY_MS; // ימים מאז 1.1.2000 בצהריים

// ---------- קנה מידה ----------
// מוקטן: הכיוונים אמיתיים, והמרחק מהשמש "נדחס" (שורש ריבועי) כדי שכל כוכבי הלכת ייכנסו במסך.
// אמיתי: המרחקים פרופורציונליים למציאות (50 יחידות = יחידה אסטרונומית אחת). הגדלים מוגדלים בשני המצבים.
const COMPRESSED = { r0: 7.5, k: 22 };
const REAL_AU = 50;
const REAL_SIZE = { sun: 0.45, planet: 0.55 };
let scaleT = 0; // 0 = מוקטן, 1 = אמיתי (עובר בהדרגה)
let scaleTarget = 0;
let scaleMix = 0;

function displayRadius(au) {
  const compressed = COMPRESSED.r0 + COMPRESSED.k * Math.sqrt(au);
  return compressed + (REAL_AU * au - compressed) * scaleMix;
}

function toDisplay(v, out) {
  const r = v.length();
  return r ? out.copy(v).multiplyScalar(displayRadius(r) / r) : out.set(0, 0, 0);
}

// ---------- סצנה ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
$('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 40000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.maxDistance = 8000;

scene.add(new THREE.AmbientLight(0xffffff, 0.28));
const sunLight = new THREE.PointLight(0xfff4e0, 3, 0, 0);
scene.add(sunLight);

addStars();

// ---------- גופים ----------
const bodies = [];
const sun = createBody(SUN, true);
for (const p of PLANETS) createBody(p, false);
const bodyById = Object.fromEntries(bodies.map((b) => [b.data.id, b]));

function createBody(data, isSun) {
  const group = new THREE.Group();
  // ציר הסיבוב מכוון לכיוון האמיתי של הקוטב הצפוני (כך העונות בכדור הארץ נכונות)
  const tilt = new THREE.Group();
  tilt.quaternion.setFromUnitVectors(UP, poleVector(data.pole));
  group.add(tilt);
  scene.add(group);

  const geo = new THREE.SphereGeometry(data.size, 64, 32);
  const map = planetTexture(data.id);
  const mat = isSun
    ? new THREE.MeshBasicMaterial({ map })
    : new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  tilt.add(mesh);

  const body = { data, group, tilt, mesh, spin: 0, isSun, au: new THREE.Vector3() };
  mesh.userData.body = body;

  if (isSun) {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.scale.setScalar(data.size * 5.5);
    group.add(glow);
  } else {
    body.orbitLine = createOrbit(data.color);
  }

  if (data.rings) {
    const inner = data.size * 1.25, outer = data.size * 2.3;
    const ringGeo = new THREE.RingGeometry(inner, outer, 128, 1);
    const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
  }

  if (data.moon) {
    body.moon = new THREE.Mesh(
      new THREE.SphereGeometry(data.moon.size, 32, 16),
      new THREE.MeshStandardMaterial({ map: planetTexture('moon'), roughness: 1 }),
    );
    group.add(body.moon);
  }

  body.label = createLabel(body);
  bodies.push(body);
  return body;
}

function createOrbit(color) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(361 * 3), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 }));
  line.frustumCulled = false;
  scene.add(line);
  return line;
}

// המסלולים משתנים לאט מאוד (במשך מאות שנים), לכן מחשבים אותם מחדש רק כשהזמן זז הרבה
let orbitsDays = null;
let orbitsMix = null;
function updateOrbits() {
  const recompute = orbitsDays === null || Math.abs(simDays - orbitsDays) > 3650;
  if (!recompute && orbitsMix === scaleMix) return;
  if (recompute) orbitsDays = simDays;
  orbitsMix = scaleMix;
  for (const b of bodies) {
    if (!b.orbitLine) continue;
    if (recompute) b.orbitAU = orbitPoints(b.data.id, simDays, 360);
    const attr = b.orbitLine.geometry.attributes.position;
    b.orbitAU.forEach((p, i) => {
      toDisplay(p, tmp);
      attr.setXYZ(i, tmp.x, tmp.y, tmp.z);
    });
    attr.needsUpdate = true;
  }
}

function addStars() {
  const count = 5000;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(12000 + Math.random() * 12000);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = Math.random();
    const b = 0.55 + Math.random() * 0.45;
    col.set([b * (0.8 + t * 0.2), b * 0.9, b * (1 - t * 0.2)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true })));
}

// ---------- תוויות ובורר ----------
function createLabel(body) {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = body.data.name;
  el.addEventListener('click', () => userSelect(body));
  $('labels').appendChild(el);
  return el;
}

for (const body of bodies) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.innerHTML = `<span class="ball" style="background:${body.data.color}"></span><span>${body.data.name}</span>`;
  chip.addEventListener('click', () => userSelect(body));
  $('chooser').appendChild(chip);
  body.chip = chip;
}
{
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.innerHTML = '<span class="ball-emoji" aria-hidden="true">📖</span><span>מילון</span>';
  chip.addEventListener('click', () => openGlossary());
  $('chooser').appendChild(chip);
}

// ---------- זמן ----------
let daysPerSecond = 5;
let playing = true;

function sliderToSpeed(v) {
  return 0.05 * Math.pow(4000, v / 100); // מ־0.05 עד 200 ימים בשנייה
}

function updateSpeedLabel() {
  const d = daysPerSecond;
  let text;
  if (d < 1) text = `כל שנייה = ${Math.max(1, Math.round(d * 24))} שעות`;
  else if (d < 60) text = `כל שנייה = ${Math.round(d)} ימים`;
  else text = `כל שנייה = ${(d / 30.44).toFixed(d < 300 ? 1 : 0)} חודשים`;
  $('speed-label').textContent = playing ? text : 'הזמן עצר';
}

const dateFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

$('speed').addEventListener('input', (e) => {
  daysPerSecond = sliderToSpeed(+e.target.value);
  updateSpeedLabel();
});
$('btn-play').addEventListener('click', () => {
  playing = !playing;
  $('btn-play').textContent = playing ? '⏸' : '▶';
  $('btn-play').title = playing ? 'עצירת הזמן' : 'הפעלת הזמן';
  updateSpeedLabel();
});
$('btn-today').addEventListener('click', () => {
  simDays = (Date.now() - J2000) / DAY_MS;
});
daysPerSecond = sliderToSpeed(+$('speed').value);
updateSpeedLabel();

function updateBodies(dt) {
  for (const b of bodies) {
    const d = b.data;
    if (!b.isSun) {
      heliocentric(d.id, simDays, b.au);
      toDisplay(b.au, b.group.position);
    }
    b.group.scale.setScalar(1 + ((b.isSun ? REAL_SIZE.sun : REAL_SIZE.planet) - 1) * scaleMix);
    if (playing) {
      const omega = ((2 * Math.PI) / d.rotation) * daysPerSecond;
      b.spin += Math.sign(omega) * Math.min(Math.abs(omega), MAX_SPIN) * dt;
    }
    b.mesh.rotation.y = b.spin;
    if (b.moon) {
      // הירח במיקום האמיתי שלו סביב כדור הארץ (המרחק מוגדל), ותמיד אותו צד פונה אלינו
      moonDirection(simDays, b.moon.position).multiplyScalar(d.moon.distance);
      b.moon.lookAt(b.group.position);
    }
  }
}

const sizeOf = (b) => b.data.size * b.group.scale.x;

// ---------- מצלמה ----------
const tmp = new THREE.Vector3();
const lastFollowPos = new THREE.Vector3();
let followBody = null;
let tween = null;

function overviewPosition() {
  const far = camera.aspect < 1 ? 2.3 : 1;
  const compressed = new THREE.Vector3(0, 118, 174);
  const real = new THREE.Vector3(0, 2100, 3300);
  return compressed.lerp(real, scaleMix).multiplyScalar(far);
}

function flyTo(body, duration = null) {
  const from = { pos: camera.position.clone(), target: controls.target.clone() };
  let offset;
  if (!body) {
    offset = null;
  } else if (body.isSun) {
    offset = new THREE.Vector3(0, 9, 26).multiplyScalar(camera.aspect < 1 ? 1.6 : 1);
  } else {
    // המצלמה מוצבת בין השמש לכוכב הלכת (בזווית), כדי לראות את הצד המואר
    const dist = (sizeOf(body) * (body.data.rings ? 7 : 5.5) + 3) * (camera.aspect < 1 ? 1.6 : 1);
    const out = body.group.position.clone().normalize();
    offset = out.negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), 40 * DEG).multiplyScalar(dist);
    offset.y = dist * 0.35;
  }
  // טיסה ארוכה יותר כשהדרך ארוכה (למשל במרחקים אמיתיים)
  const travel = from.target.distanceTo(body ? body.group.position : new THREE.Vector3());
  tween = { from, offset, body, t: 0, duration: duration ?? 1.8 + Math.min(1.7, travel / 600) };
  followBody = body;
  controls.enabled = false;
  controls.minDistance = body ? sizeOf(body) * 1.6 : 5;
}

function updateCamera(dt) {
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / tween.duration);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    const targetPos = tween.body ? tween.body.group.position : new THREE.Vector3();
    const camPos = tween.body ? targetPos.clone().add(tween.offset) : overviewPosition();
    camera.position.lerpVectors(tween.from.pos, camPos, e);
    // מעוף בקשת כלפי מעלה, ולא דרך השמש
    camera.position.y += Math.sin(Math.PI * e) * tween.from.pos.distanceTo(camPos) * 0.35;
    const minR = sizeOf(sun) * 2.2;
    if (camera.position.length() < minR) camera.position.setLength(minR);
    controls.target.lerpVectors(tween.from.target, targetPos, e);
    if (tween.t >= 1) {
      tween = null;
      controls.enabled = true;
    }
  } else if (followBody) {
    tmp.subVectors(followBody.group.position, lastFollowPos);
    camera.position.add(tmp);
    controls.target.copy(followBody.group.position);
  }
  if (followBody) lastFollowPos.copy(followBody.group.position);
}

camera.position.copy(overviewPosition());
controls.update();

// כשחלון המידע פתוח, מזיזים את מרכז התמונה כדי שהכוכב לא יוסתר מאחוריו
const viewShift = { x: 0, y: 0 };
function updateViewOffset(dt) {
  const w = window.innerWidth, h = window.innerHeight;
  let tx = 0, ty = 0;
  const box = infoBox();
  if (box) {
    const rect = box.getBoundingClientRect();
    if (w <= 720) ty = (h - rect.top) * 0.5;
    else tx = -(rect.width + 16) * 0.5;
  }
  const k = Math.min(1, dt * 4);
  viewShift.x += (tx - viewShift.x) * k;
  viewShift.y += (ty - viewShift.y) * k;
  camera.setViewOffset(w, h, viewShift.x, viewShift.y, w, h);
}

// ---------- תוויות על המסך ----------
// סדר עדיפות לתוויות: הכוכב שנבחר, השמש, ואז מהגדול לקטן. תווית שמתנגשת באחרת מוסתרת.
const labelOrder = () => [...bodies].sort((a, b) => (b === selected) - (a === selected) || b.data.size - a.data.size);

function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  const placed = [];
  for (const b of labelOrder()) {
    tmp.copy(b.group.position).project(camera);
    if (tmp.z > 1) {
      b.label.style.display = 'none';
      continue;
    }
    const x = (tmp.x * 0.5 + 0.5) * w;
    const y = (-tmp.y * 0.5 + 0.5) * h;
    // רדיוס הכוכב על המסך, כדי למקם את התווית מתחתיו
    const dist = camera.position.distanceTo(b.group.position);
    const px = (sizeOf(b) / dist) * (h / 2) / Math.tan((camera.fov * DEG) / 2);
    const lw = (b.labelWidth ||= b.label.offsetWidth || 70);
    const box = { x0: x - lw / 2, x1: x + lw / 2, y0: y + px + 6, y1: y + px + 30 };
    const overlaps = placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0);
    const hide = (b === followBody && px > 60) || overlaps;
    if (!hide) placed.push(box);
    b.label.style.display = hide ? 'none' : '';
    b.label.style.transform = `translate(-50%, 0) translate(${x}px, ${y + px + 6}px)`;
  }
}

// ---------- בחירה בלחיצה ----------
const raycaster = new THREE.Raycaster();
const pointerDown = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => pointerDown.set(e.clientX, e.clientY));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 6) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(bodies.map((b) => b.mesh))[0];
  if (hit) userSelect(hit.object.userData.body);
});

// ---------- חלון מידע והקראה ----------
const narrator = new Narrator();
let voiceOn = true;

// ---------- נועם, הילד שמציג את ההסברים ----------
const presenterEl = $('presenter');
const presenter = new Presenter(presenterEl);
presenter.setSize(presenterEl.clientWidth, presenterEl.clientHeight);
narrator.onBoundary = () => presenter.pulse();
let guideOn = true;
let presenterPos = '';
let lookSide = 0;

// ממקם את נועם ליד מה שהוא מסביר: כרטיס הפתיחה, חלון ההסבר, או בפינה
function placePresenter() {
  const w = window.innerWidth, h = window.innerHeight;
  const pw = presenterEl.clientWidth, ph = presenterEl.clientHeight;
  const phone = w <= 720;
  let x, y;
  lookSide = 0;
  if (!$('intro').hidden) {
    const r = document.querySelector('.intro-card').getBoundingClientRect();
    if (!phone && r.left > pw - 20) {
      x = r.left - pw + 20;
      y = r.bottom - ph;
      lookSide = 1;
    } else {
      x = r.right - pw + 4;
      y = r.top - ph + 34;
    }
  } else if (infoBox()) {
    const r = infoBox().getBoundingClientRect();
    if (phone) {
      x = w - pw - 4;
      y = r.top - ph + 18;
    } else {
      x = r.right - 6;
      y = Math.min(r.bottom, h - 84) - ph;
      lookSide = -1;
    }
  } else if (phone) {
    x = w - pw - 4;
    y = document.querySelector('.timebar').getBoundingClientRect().top - ph + 14;
  } else {
    x = 12;
    y = h - 84 - ph;
  }
  const pos = `translate(${Math.round(x)}px, ${Math.round(Math.max(0, y))}px)`;
  if (pos !== presenterPos) presenterEl.style.transform = presenterPos = pos;
}

$('btn-guide').addEventListener('click', () => {
  guideOn = !guideOn;
  presenterEl.hidden = !guideOn;
  $('btn-guide').setAttribute('aria-pressed', String(guideOn));
  $('btn-guide').title = guideOn ? 'הסתרת נועם המדריך' : 'הצגת נועם המדריך';
  $('btn-guide').style.opacity = guideOn ? '' : '0.5';
});
let selected = null;

function showPanel({ title, subtitle = '', color = null, text, facts = [], funFact = '' }) {
  $('panel').hidden = false;
  document.body.classList.add('panel-open');
  $('panel-title').textContent = title;
  $('panel-subtitle').textContent = subtitle;
  $('panel-dot').style.display = color ? '' : 'none';
  $('panel-dot').style.background = color || '';
  dismissTerm();
  const used = new Set();
  $('panel-text').replaceChildren(
    ...splitSentences(text).flatMap((s) => {
      const span = document.createElement('span');
      span.append(...linkTerms(s, used));
      return [span, ' '];
    }),
  );
  $('panel-fun').replaceChildren(...linkTerms(funFact, used));
  $('panel-facts').replaceChildren(
    ...facts.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }),
  );
  $('panel').scrollTop = 0;
  currentText = text;
}

let currentText = '';
let currentSentence = 0;
let lastOnEnd = null;

// מקריא את ההסבר שבחלון, מהמשפט from והלאה (כדי שאפשר יהיה להמשיך אחרי הסבר של מושג)
function speakCurrent(onEnd, from = 0) {
  const spans = [...$('panel-text').querySelectorAll(':scope > span')];
  lastOnEnd = onEnd;
  setListening(true);
  narrator.speak(splitSentences(currentText).slice(from).join(' '), {
    onSentence: (k) => {
      const i = k + from;
      currentSentence = i;
      spans.forEach((s, j) => s.classList.toggle('speaking', i === j));
      // בחלון קטן (בטלפון) גוללים אל המשפט שמוקרא עכשיו
      spans[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    onEnd: () => {
      spans.forEach((s) => s.classList.remove('speaking'));
      setListening(false);
      onEnd?.();
    },
  });
}

function stopSpeaking() {
  narrator.stop();
  $('panel-text').querySelectorAll('span').forEach((s) => s.classList.remove('speaking'));
  setListening(false);
}

let listening = false;
function setListening(on) {
  listening = on;
  $('btn-listen').textContent = on ? '⏹ עצירה' : '🔊 הקשיבו';
}

$('btn-listen').addEventListener('click', () => {
  if (listening) stopSpeaking();
  else speakCurrent();
});

// ---------- מילון מושגים ----------
const isLetter = (ch) => !!ch && /[\u05D0-\u05EA]/.test(ch);

// מחזיר את המשפט כרשימת קטעי טקסט וכפתורי מושגים. כל מושג מסומן רק פעם אחת (used)
function linkTerms(text, used) {
  const nodes = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    let match = null;
    if (!isLetter(text[i - 1])) {
      // הצורה הארוכה ביותר שמתאימה כאן (כך "כוכב לכת" לא נקרא בטעות כ"כוכב")
      match = GLOSSARY_FORMS.find(({ form, term }) =>
        text.startsWith(form, i) && !isLetter(text[i + form.length]) &&
        !(term.notBefore || []).some((w) => text.startsWith(' ' + w, i + form.length)));
    }
    if (!match) {
      plain += text[i++];
      continue;
    }
    if (used.has(match.term.id)) {
      plain += match.form;
      i += match.form.length;
      continue;
    }
    if (plain) nodes.push(plain);
    plain = '';
    used.add(match.term.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'term';
    btn.textContent = match.form;
    btn.title = 'מה זה ' + match.term.title + '?';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTerm(match.term);
    });
    nodes.push(btn);
    i += match.form.length;
  }
  if (plain) nodes.push(plain);
  return nodes;
}

const infoBox = () => (!$('term-card').hidden ? $('term-card') : !$('panel').hidden ? $('panel') : null);

let termState = null; // מה הושהה כשנפתח מושג, כדי לחזור אליו אחר כך
let currentTerm = null;
let termSpeaking = false;

function captureForTerm() {
  if (termState) return;
  termState = {
    resume: listening && !$('panel').hidden ? { index: currentSentence, onEnd: lastOnEnd } : null,
    tourWaiting: !!(tour && !listening),
  };
  if (tour) clearTimeout(tour.timer);
  stopSpeaking();
}

function openTerm(term, from = 'panel') {
  captureForTerm();
  termState.from = from;
  currentTerm = term;
  $('term-card').hidden = false;
  document.body.classList.add('term-open');
  $('term-view').hidden = false;
  $('term-list').hidden = true;
  $('term-emoji').textContent = term.emoji;
  $('term-title').textContent = term.title;
  $('term-text').replaceChildren(
    ...splitSentences(term.text).flatMap((s) => {
      const span = document.createElement('span');
      span.textContent = s;
      return [span, ' '];
    }),
  );
  $('term-back').textContent = from === 'list' ? 'חזרה למילון' : $('panel').hidden ? 'סגירה' : 'חזרה להסבר';
  $('term-card').scrollTop = 0;
  presenter.play('open', 2.4);
  if (voiceOn) speakTerm();
  else narrator.stop();
}

function speakTerm() {
  const spans = [...$('term-text').querySelectorAll('span')];
  termSpeaking = true;
  $('term-listen').textContent = '⏹ עצירה';
  narrator.speak(currentTerm.text, {
    onSentence: (i) => spans.forEach((s, j) => s.classList.toggle('speaking', i === j)),
    onEnd: () => {
      spans.forEach((s) => s.classList.remove('speaking'));
      termSpeaking = false;
      $('term-listen').textContent = '🔊 שוב';
    },
  });
}

function openGlossary() {
  captureForTerm();
  termState.from = 'list';
  narrator.stop();
  termSpeaking = false;
  $('term-card').hidden = false;
  document.body.classList.add('term-open');
  $('term-view').hidden = true;
  $('term-list').hidden = false;
  $('term-card').scrollTop = 0;
  presenter.play('open', 2);
}

for (const term of GLOSSARY) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = `${term.emoji} ${term.title}`;
  btn.addEventListener('click', () => openTerm(term, 'list'));
  $('term-grid').appendChild(btn);
}

// סוגר את כרטיס המושג וממשיך את מה שהיה לפניו (ההקראה או הסיור)
function closeTerm() {
  const st = termState;
  dismissTerm();
  if (!st) return;
  if (st.resume && voiceOn) speakCurrent(st.resume.onEnd, st.resume.index);
  else if (st.tourWaiting && tour && tour.index < tourSteps.length - 1) {
    tour.timer = setTimeout(() => goToStep(tour.index + 1), 1500);
  }
}

// סוגר את הכרטיס בלי להמשיך (למשל כשעוברים לכוכב לכת אחר)
function dismissTerm() {
  if ($('term-card').hidden) return;
  if (termSpeaking) narrator.stop();
  termSpeaking = false;
  $('term-card').hidden = true;
  document.body.classList.remove('term-open');
  termState = null;
}

$('term-close').addEventListener('click', closeTerm);
$('term-back').addEventListener('click', () => (termState?.from === 'list' ? openGlossary() : closeTerm()));
$('term-all').addEventListener('click', openGlossary);
$('term-listen').addEventListener('click', () => {
  if (termSpeaking) {
    narrator.stop();
    termSpeaking = false;
    $('term-listen').textContent = '🔊 שוב';
    $('term-text').querySelectorAll('span').forEach((s) => s.classList.remove('speaking'));
  } else speakTerm();
});

function closePanel() {
  stopSpeaking();
  $('panel').hidden = true;
  document.body.classList.remove('panel-open');
  markActive(null);
}
$('panel-close').addEventListener('click', () => {
  if (tour) endTour();
  closePanel();
});

function markActive(body) {
  selected = body;
  for (const b of bodies) {
    const on = b === body;
    b.chip.classList.toggle('active', on);
    b.label.classList.toggle('active', on);
    if (b.orbitLine) b.orbitLine.material.opacity = on ? 0.85 : 0.3;
  }
}

const distFmt = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });
function updateLiveDistance() {
  const el = $('panel-live');
  if (!selected || selected.isSun || $('panel').hidden) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const million = selected.au.length() * 149.598;
  const text = million >= 1000 ? `${distFmt.format(million / 1000)} מיליארד ק"מ` : `${distFmt.format(million)} מיליון ק"מ`;
  if (el.dataset.text !== text) el.textContent = el.dataset.text = `המרחק מהשמש עכשיו: ${text}`;
}

$('btn-scale').addEventListener('click', () => {
  scaleTarget = 1 - scaleTarget;
  $('btn-scale').querySelector('span').textContent = scaleTarget ? 'מרחקים מוקטנים' : 'מרחקים אמיתיים';
  $('btn-scale').title = scaleTarget ? 'מעבר למרחקים מוקטנים' : 'מעבר למרחקים אמיתיים';
  if (tour) endTour();
  markActive(null);
  flyTo(null, 3);
  const info = scaleTarget ? SCALE_REAL : SCALE_COMPRESSED;
  presenter.play('open', 2.6);
  showPanel({ title: info.title, text: info.narration });
  if (voiceOn) speakCurrent();
  else stopSpeaking();
});

function showBody(body) {
  const d = body.data;
  markActive(body);
  presenter.play('point', 2.4);
  flyTo(body);
  showPanel({ title: d.name, subtitle: d.subtitle, color: d.color, text: d.narration, facts: d.facts, funFact: d.funFact });
}

function userSelect(body) {
  if (tour) endTour();
  showBody(body);
  if (voiceOn) speakCurrent();
  else stopSpeaking();
}

$('btn-overview').addEventListener('click', () => {
  if (tour) endTour();
  closePanel();
  flyTo(null);
});

$('btn-voice').addEventListener('click', () => {
  voiceOn = !voiceOn;
  $('btn-voice').textContent = voiceOn ? '🔊' : '🔇';
  $('btn-voice').title = voiceOn ? 'קריין פועל' : 'קריין כבוי';
  $('btn-voice').setAttribute('aria-pressed', String(voiceOn));
  if (!voiceOn) stopSpeaking();
});

// ---------- סיור מודרך ----------
const tourSteps = [
  { intro: TOUR_INTRO },
  ...bodies.map((body) => ({ body })),
  { intro: TOUR_OUTRO },
];
let tour = null;

function startTour() {
  tour = { index: 0, timer: null };
  $('tourbar').hidden = false;
  document.body.classList.add('touring');
  goToStep(0);
}

function goToStep(i) {
  if (!tour) return;
  clearTimeout(tour.timer);
  tour.index = Math.max(0, Math.min(tourSteps.length - 1, i));
  const step = tourSteps[tour.index];
  $('tour-step').textContent = `${tour.index + 1} מתוך ${tourSteps.length}`;
  $('tour-prev').disabled = tour.index === 0;
  $('tour-next').textContent = tour.index === tourSteps.length - 1 ? 'סיום' : 'הבא ←';

  if (step.body) {
    showBody(step.body);
  } else {
    markActive(null);
    flyTo(null);
    presenter.play(step.intro === TOUR_OUTRO ? 'wave' : 'open', 2.6);
    showPanel({ title: step.intro.title, text: step.intro.narration });
  }
  const advance = () => {
    if (!tour) return;
    if (tour.index === tourSteps.length - 1) return; // בסוף נשארים על המסך האחרון
    tour.timer = setTimeout(() => goToStep(tour.index + 1), 1800);
  };
  if (voiceOn) speakCurrent(advance);
  else stopSpeaking();
}

function endTour() {
  if (!tour) return;
  clearTimeout(tour.timer);
  tour = null;
  $('tourbar').hidden = true;
  document.body.classList.remove('touring');
  stopSpeaking();
}

$('btn-tour').addEventListener('click', startTour);
$('tour-prev').addEventListener('click', () => goToStep(tour.index - 1));
$('tour-next').addEventListener('click', () => {
  if (tour.index === tourSteps.length - 1) {
    endTour();
    closePanel();
    flyTo(null);
  } else goToStep(tour.index + 1);
});
$('tour-stop').addEventListener('click', () => {
  endTour();
  closePanel();
  flyTo(null);
});

// ---------- מסך פתיחה ----------
function closeIntro() {
  $('intro').hidden = true;
}
$('start-tour').addEventListener('click', () => {
  closeIntro();
  startTour();
});
$('start-free').addEventListener('click', () => {
  closeIntro();
  // "פותח" את ההקראה בדפדפנים שדורשים לחיצה של המשתמש (למשל ספארי)
  narrator.unlock();
});

function updateVoiceNote() {
  const note = $('voice-note');
  if (narrator.hasHebrew) {
    note.hidden = true;
    return;
  }
  note.hidden = false;
  note.textContent = narrator.supported
    ? 'לא מצאנו במכשיר הזה קול שמדבר עברית, אז ההסברים יופיעו כטקסט בלבד. ' +
      'אפשר להוסיף קול עברי בהגדרות המכשיר (שפה ודיבור), או לנסות בדפדפן כרום.'
    : 'הדפדפן הזה לא תומך בהקראה, אז ההסברים יופיעו כטקסט בלבד.';
}
narrator.onVoiceChange = updateVoiceNote;
// הקולות נטענים לפעמים באיחור, לכן נותנים להם רגע לפני שמציגים אזהרה
setTimeout(updateVoiceNote, 1200);

// ---------- לולאה ----------
const clock = new THREE.Clock();
let lastDateText = '';

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (playing) simDays += daysPerSecond * dt;
  if (scaleT !== scaleTarget) {
    scaleT = scaleTarget > scaleT ? Math.min(1, scaleT + dt / 2.8) : Math.max(0, scaleT - dt / 2.8);
    scaleMix = scaleT * scaleT * (3 - 2 * scaleT);
  }
  updateBodies(dt);
  updateOrbits();
  updateLiveDistance();
  updateCamera(dt);
  controls.update();
  updateViewOffset(dt);
  renderer.render(scene, camera);
  updateLabels();

  if (guideOn) {
    if (!$('intro').hidden && presenter.time > 0.5 && !presenter.gestureTime && Math.random() < dt / 5) {
      presenter.play('wave', 2.5);
    }
    placePresenter();
    presenter.update(dt, narrator.speaking, lookSide);
  }

  const dateText = dateFmt.format(new Date(J2000 + simDays * DAY_MS));
  if (dateText !== lastDateText) {
    $('date-label').textContent = dateText;
    lastDateText = dateText;
  }
  requestAnimationFrame(frame);
}
frame();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  presenter.setSize(presenterEl.clientWidth, presenterEl.clientHeight);
});
presenter.play('wave', 3);

// גישה נוחה לבדיקות מהקונסול
window.solar = { bodies: bodyById, narrator, presenter };
