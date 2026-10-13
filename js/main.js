import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUN, PLANETS, TOUR_INTRO, TOUR_OUTRO } from './data.js';
import { planetTexture, ringTexture, glowTexture } from './textures.js';
import { Narrator, splitSentences } from './speech.js';
import { Presenter } from './presenter.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86400000;
const MAX_SPIN = 5; // מהירות סיבוב עצמי מקסימלית בתצוגה (רדיאנים לשנייה), כדי שלא "יהבהב"

// ---------- סצנה ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
$('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.maxDistance = 500;

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
  const tilt = new THREE.Group();
  tilt.rotation.z = data.tilt * DEG;
  group.add(tilt);
  scene.add(group);

  const geo = new THREE.SphereGeometry(data.size, 64, 32);
  const map = planetTexture(data.id);
  const mat = isSun
    ? new THREE.MeshBasicMaterial({ map })
    : new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  tilt.add(mesh);

  const body = { data, group, tilt, mesh, spin: 0, isSun };
  mesh.userData.body = body;

  if (isSun) {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.scale.setScalar(data.size * 5.5);
    group.add(glow);
  } else {
    body.orbitLine = createOrbit(data.orbit, data.color);
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
    const pivot = new THREE.Group();
    group.add(pivot);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(data.moon.size, 32, 16),
      new THREE.MeshStandardMaterial({ map: planetTexture('moon'), roughness: 1 }),
    );
    moon.position.x = data.moon.distance;
    pivot.add(moon);
    body.moonPivot = pivot;
  }

  body.label = createLabel(body);
  bodies.push(body);
  return body;
}

function createOrbit(radius, color) {
  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, -Math.sin(a) * radius));
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 }),
  );
  scene.add(line);
  return line;
}

function addStars() {
  const count = 5000;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(900 + Math.random() * 900);
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

// ---------- זמן ----------
let simDays = (Date.now() - J2000) / DAY_MS;
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
      const a = d.L0 * DEG + (2 * Math.PI * simDays) / d.period;
      b.group.position.set(Math.cos(a) * d.orbit, 0, -Math.sin(a) * d.orbit);
    }
    if (playing) {
      const omega = ((2 * Math.PI) / d.rotation) * daysPerSecond;
      b.spin += Math.sign(omega) * Math.min(Math.abs(omega), MAX_SPIN) * dt;
    }
    b.mesh.rotation.y = b.spin;
    if (b.moonPivot) b.moonPivot.rotation.y = (2 * Math.PI * simDays) / d.moon.period;
  }
}

// ---------- מצלמה ----------
const tmp = new THREE.Vector3();
const lastFollowPos = new THREE.Vector3();
let followBody = null;
let tween = null;

function overviewPosition() {
  const far = camera.aspect < 1 ? 1.9 : 1;
  return new THREE.Vector3(0, 85 * far, 125 * far);
}

function flyTo(body) {
  const from = { pos: camera.position.clone(), target: controls.target.clone() };
  let offset;
  if (!body) {
    offset = null;
  } else if (body.isSun) {
    offset = new THREE.Vector3(0, 9, 26).multiplyScalar(camera.aspect < 1 ? 1.6 : 1);
  } else {
    // המצלמה מוצבת בין השמש לכוכב הלכת (בזווית), כדי לראות את הצד המואר
    const dist = (body.data.size * (body.data.rings ? 7 : 5.5) + 3) * (camera.aspect < 1 ? 1.6 : 1);
    const out = body.group.position.clone().normalize();
    offset = out.negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), 40 * DEG).multiplyScalar(dist);
    offset.y = dist * 0.35;
  }
  tween = { from, offset, body, t: 0, duration: 1.8 };
  followBody = body;
  controls.enabled = false;
  controls.minDistance = body ? body.data.size * 1.6 : 5;
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
    const minR = SUN.size * 2.2;
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
  if (!$('panel').hidden) {
    const rect = $('panel').getBoundingClientRect();
    if (w <= 720) ty = (h - rect.top) * 0.5;
    else tx = -(rect.width + 16) * 0.5;
  }
  const k = Math.min(1, dt * 4);
  viewShift.x += (tx - viewShift.x) * k;
  viewShift.y += (ty - viewShift.y) * k;
  camera.setViewOffset(w, h, viewShift.x, viewShift.y, w, h);
}

// ---------- תוויות על המסך ----------
function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  for (const b of bodies) {
    tmp.copy(b.group.position).project(camera);
    if (tmp.z > 1) {
      b.label.style.display = 'none';
      continue;
    }
    const x = (tmp.x * 0.5 + 0.5) * w;
    const y = (-tmp.y * 0.5 + 0.5) * h;
    // רדיוס הכוכב על המסך, כדי למקם את התווית מתחתיו
    const dist = camera.position.distanceTo(b.group.position);
    const px = (b.data.size / dist) * (h / 2) / Math.tan((camera.fov * DEG) / 2);
    const hide = b === followBody && px > 60;
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
  } else if (!$('panel').hidden) {
    const r = $('panel').getBoundingClientRect();
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
  $('panel-text').replaceChildren(
    ...splitSentences(text).flatMap((s) => {
      const span = document.createElement('span');
      span.textContent = s;
      return [span, ' '];
    }),
  );
  $('panel-fun').textContent = funFact;
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

function speakCurrent(onEnd) {
  const spans = [...$('panel-text').querySelectorAll('span')];
  setListening(true);
  narrator.speak(currentText, {
    onSentence: (i) => spans.forEach((s, j) => s.classList.toggle('speaking', i === j)),
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
  // "פותח" את מנוע ההקראה בדפדפנים שדורשים לחיצה של המשתמש (למשל ספארי)
  if (narrator.supported) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
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
  updateBodies(dt);
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
