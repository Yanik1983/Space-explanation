import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SUN, PLANETS, TOUR_INTRO, TOUR_OUTRO, SCALE_REAL, SCALE_COMPRESSED, ASTEROID_BELT, GALAXY_MOTION } from './data.js';
import { heliocentric, orbitPoints, moonDirection, poleVector, makeAsteroids, asteroidPosition, cometPosition, cometOrbitPoints } from './orbits.js';
import { planetTexture, ringTexture, glowTexture, imageTexture, loadDetailed, loadPhotos, ringPhoto, skyTexture } from './textures.js';
import { Narrator, splitSentences, DEFAULT_SETTINGS } from './speech.js';
import { Presenter } from './presenter.js';
import { GLOSSARY, GLOSSARY_FORMS, CONTINUE_QUESTION } from './glossary.js';
import { MOONS } from './moons.js';
import { COMETS, COMETS_INFO } from './comets.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86400000;
const MAX_SPIN = 5; // מהירות סיבוב עצמי מקסימלית בתצוגה (רדיאנים לשנייה), כדי שלא "יהבהב"
const UP = new THREE.Vector3(0, 1, 0);

// מיקום השמש במערכת של המצלמה – משמש להאיר רק את הצד הנכון (אורות ערים בלילה, אטמוספירה ביום)
const sunView = { value: new THREE.Vector3() };
// הזמן של האנימציה על פני השמש, וכמה להבהיר אותה כשיש זוהר (bloom)
const sunUniforms = { uTime: { value: 0 }, uBoost: { value: 1 } };
const LOGDEPTH_V = ['#include <common>\n#include <logdepthbuf_pars_vertex>', '#include <logdepthbuf_vertex>'];
const LOGDEPTH_F = ['#include <common>\n#include <logdepthbuf_pars_fragment>', '#include <logdepthbuf_fragment>'];
const moonImage = imageTexture('textures/moon_1024.jpg');

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

// הרקע: צילום אמיתי של שביל החלב
scene.background = skyTexture();
scene.backgroundIntensity = 0.85;

// זוהר סביב דברים בהירים (השמש) – "bloom". במכשירים חלשים, או אם האתר מתחיל לגמגם, הוא נכבה לבד.
// ?fx=high / ?fx=low בכתובת מכריחים מצב מסוים (לבדיקות).
const fxParam = new URLSearchParams(location.search).get('fx');
// בטלפונים הוא כבוי: בחלק מהטלפונים מעבד הגרפיקה לא תומך בו (והמסך יוצא שחור), והוא גם מבזבז סוללה.
// להילה של השמש יש גם גרסה רגילה, כך שבלי bloom היא עדיין זוהרת.
const weakDevice = (navigator.hardwareConcurrency || 4) < 4 || (navigator.deviceMemory || 4) < 3;
const touchDevice = matchMedia('(pointer: coarse)').matches;
const canRenderFloat = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
let bloomOn = fxParam === 'high' || (fxParam !== 'low' && !weakDevice && !touchDevice && canRenderFloat);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.55, 0.9);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);

const perf = { t: 0, n: 0, slow: 0 };
function watchPerformance(rawDt) {
  if (!bloomOn || fxParam) return;
  perf.t += Math.min(rawDt, 1);
  perf.n++;
  if (perf.t < 2) return;
  const avg = perf.t / perf.n;
  perf.slow = avg > 1 / 30 ? perf.slow + 1 : 0; // פחות מ־30 פריימים בשנייה
  perf.t = perf.n = 0;
  if (perf.slow >= 2 || avg > 1 / 15) bloomOn = false; // איטי מאוד – מכבים מיד
}

// בדיקה עצמית: אחרי כמה פריימים עם bloom בודקים שהשמש באמת נראית על המסך.
// אם מעבד הגרפיקה לא הצליח לצייר (מסך שחור) – מכבים את ה־bloom וממשיכים בציור הרגיל.
let bloomCheck = { frames: 0, done: false };
function checkBloomOutput() {
  if (bloomCheck.done || ++bloomCheck.frames < 4) return;
  const v = sun.group.position.clone().project(camera);
  if (v.z > 1 || Math.abs(v.x) > 0.8 || Math.abs(v.y) > 0.8) return; // השמש לא במסך – בודקים בפעם אחרת
  bloomCheck.done = true;
  const gl = renderer.getContext();
  const x = Math.round((v.x * 0.5 + 0.5) * gl.drawingBufferWidth);
  const y = Math.round((v.y * 0.5 + 0.5) * gl.drawingBufferHeight);
  const px = new Uint8Array(4 * 25);
  renderer.setRenderTarget(null);
  gl.readPixels(x - 2, y - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let brightest = 0;
  for (let i = 0; i < px.length; i += 4) brightest = Math.max(brightest, px[i] + px[i + 1]);
  if (brightest < 120 && !fxParam) bloomOn = false;
  bloomCheck.brightest = brightest;
}

scene.add(new THREE.AmbientLight(0xffffff, 0.28));
const sunLight = new THREE.PointLight(0xfff4e0, 3, 0, 0);
scene.add(sunLight);

addStars();

// ---------- גופים ----------
const bodies = [];
const sun = createBody(SUN, true);
for (const p of PLANETS) createBody(p, false);
const bodyById = Object.fromEntries(bodies.map((b) => [b.data.id, b]));
const comets = COMETS.map(createComet);

// טקסטורות מפורטות נוצרות ברקע ומחליפות את הגרסה הקטנה, כוכב אחרי כוכב
// השמש, נוגה ופלוטו מחושבים; לשאר יש מפות אמיתיות (ואם תמונה לא נטענת – מחשבים גם אותה)
loadDetailed(['sun', 'venus', 'pluto'], applyDetailed);
loadPhotos(applyDetailed, (id) => loadDetailed([id], applyDetailed));
function applyDetailed(id, map, bump) {
  const mat = bodyById[id]?.mesh.material;
  if (!mat) return;
  if (mat.uniforms) {
    mat.uniforms.map.value.dispose();
    mat.uniforms.map.value = map;
    return;
  }
  mat.map?.dispose();
  mat.map = map;
  if (bump) {
    mat.bumpMap = bump;
    mat.bumpScale = 3;
  }
  mat.needsUpdate = true;
}

// ---------- חגורת האסטרואידים ----------
// "גוף" מיוחד: אין לו כדור, רק נקודה במרכז החגורה שהמצלמה טסה אליה
const belt = { data: ASTEROID_BELT, group: new THREE.Object3D(), isBelt: true, moons: [], au: new THREE.Vector3(0, 0, 2.75) };
const asteroids = makeAsteroids(window.innerWidth <= 720 ? 1600 : 2600);
const asteroidPoints = (() => {
  const pos = new Float32Array(asteroids.length * 3);
  const col = new Float32Array(asteroids.length * 3);
  for (let i = 0; i < asteroids.length; i++) {
    const k = 0.45 + Math.random() * 0.4;
    col.set([k * 1.05, k * 0.95, k * 0.85], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // נקודה עגולה ורכה במקום ריבוע
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const g = dot.getContext('2d').createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  dot.getContext('2d').fillStyle = g;
  dot.getContext('2d').fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.22, vertexColors: true, sizeAttenuation: true, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
})();

function updateAsteroids() {
  const attr = asteroidPoints.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < asteroids.length; i++) {
    toDisplay(asteroidPosition(asteroids[i], simDays, v), v);
    attr.setXYZ(i, v.x, v.y, v.z);
  }
  attr.needsUpdate = true;
  asteroidPoints.material.size = 0.22 * (1 + scaleMix * 1.5);
  toDisplay(belt.au, belt.group.position);
}

// ---------- חומרים מיוחדים ----------

// השמש: הקצוות כהים יותר מהמרכז, כמו במציאות (limb darkening)
function sunMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, ...sunUniforms },
    vertexShader: `${LOGDEPTH_V[0]}
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vObj;
      void main() {
        vUv = uv;
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
        ${LOGDEPTH_V[1]}
      }`,
    fragmentShader: `${LOGDEPTH_F[0]}
      uniform sampler2D map; uniform float uTime; uniform float uBoost;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vObj;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) {
        vec3 i = floor(x), f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        ${LOGDEPTH_F[1]}
        float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        vec3 n = normalize(vObj);
        // גרעיניות שזזה לאט (גזים חמים שעולים ויורדים) וכתמים גדולים שמשתנים
        float gran = fbm(n * 22.0 + vec3(0.0, uTime * 0.06, uTime * 0.04));
        float cells = fbm(n * 5.0 - vec3(uTime * 0.015));
        vec3 c = texture2D(map, vUv).rgb * (0.72 + 0.42 * gran + 0.2 * cells);
        // השוליים כהים ואדמדמים יותר מהמרכז (limb darkening)
        c *= (0.45 + 0.65 * pow(mu, 0.5)) * mix(vec3(1.0, 0.6, 0.35), vec3(1.0), pow(mu, 0.35));
        gl_FragColor = vec4(c * uBoost, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// הטבעות של שבתאי: מוארות מהשמש, עם הצל של כוכב הלכת עליהן. מהצד שלא מואר הן נראות כהות יותר.
function ringMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `${LOGDEPTH_V[0]}
      varying vec2 vUv; varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        ${LOGDEPTH_V[1]}
      }`,
    fragmentShader: `${LOGDEPTH_F[0]}
      uniform sampler2D map; uniform vec3 planetCenter; uniform float planetRadius; uniform vec3 ringNormal;
      varying vec2 vUv; varying vec3 vWorld;
      void main() {
        ${LOGDEPTH_F[1]}
        vec4 c = texture2D(map, vUv);
        vec3 toSun = normalize(-vWorld);
        vec3 oc = planetCenter - vWorld;
        float t = dot(oc, toSun);
        float shadow = t > 0.0 ? smoothstep(planetRadius * 0.96, planetRadius * 1.04, length(oc - toSun * t)) : 1.0;
        float sameSide = step(0.0, dot(toSun, ringNormal) * dot(cameraPosition - vWorld, ringNormal));
        float light = mix(0.4, 1.0, sameSide) * shadow;
        gl_FragColor = vec4(c.rgb * (0.1 + 0.9 * light), c.a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

// הצל של הטבעות על שבתאי: מכל נקודה בכוכב בודקים אם הדרך אל השמש עוברת דרך הטבעות
function addRingShadow(mat, ring) {
  mat.customProgramCacheKey = () => 'ring-shadow';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { ringMap: ring.map, ringCenter: ring.planetCenter, ringNormal: ring.ringNormal, ringInner: ring.ringInner, ringOuter: ring.ringOuter });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorldP; uniform sampler2D ringMap; uniform vec3 ringCenter; uniform vec3 ringNormal; uniform float ringInner; uniform float ringOuter;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          vec3 L = normalize(-vWorldP);
          float denom = dot(L, ringNormal);
          float t = abs(denom) > 1e-4 ? dot(ringCenter - vWorldP, ringNormal) / denom : -1.0;
          if (t > 0.0) {
            float u = (length(vWorldP + L * t - ringCenter) - ringInner) / (ringOuter - ringInner);
            if (u > 0.0 && u < 1.0) {
              float k = 1.0 - 0.85 * texture2D(ringMap, vec2(u, 0.5)).a;
              reflectedLight.directDiffuse *= k;
              reflectedLight.directSpecular *= k;
            }
          }
        }`);
  };
}

// הילה דקה של אטמוספירה בשולי כוכב הלכת, רק בצד המואר
function atmosphere(radius, color, strength) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, uSunView: sunView },
      vertexShader: `${LOGDEPTH_V[0]}
        varying vec3 vN; varying vec3 vP;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vP = mv.xyz;
          gl_Position = projectionMatrix * mv;
          ${LOGDEPTH_V[1]}
        }`,
      fragmentShader: `${LOGDEPTH_F[0]}
        uniform vec3 color; uniform float strength; uniform vec3 uSunView; varying vec3 vN; varying vec3 vP;
        void main() {
          ${LOGDEPTH_F[1]}
          float rim = pow(1.0 - max(dot(normalize(vN), normalize(-vP)), 0.0), 2.2);
          float lit = smoothstep(-0.35, 0.5, dot(normalize(vN), normalize(uSunView - vP)));
          gl_FragColor = vec4(color * rim * lit * strength, 1.0);
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
}

// כדור הארץ: צילומי לוויין, אוקיינוסים מבריקים, הרים בתבליט, ואורות ערים רק בצד של הלילה
function earthMaterial() {
  const mat = new THREE.MeshPhongMaterial({
    map: imageTexture('textures/earth_atmos_2048.jpg'),
    specularMap: imageTexture('textures/earth_specular_2048.jpg', false),
    specular: new THREE.Color(0x3a3a3a),
    shininess: 18,
    normalMap: imageTexture('textures/earth_normal_2048.jpg', false),
    normalScale: new THREE.Vector2(0.8, 0.8),
    emissiveMap: imageTexture('textures/earth_lights_2048.jpg'),
    emissive: new THREE.Color(0xffd29a),
    emissiveIntensity: 1.3,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunView = sunView;
    sh.fragmentShader = 'uniform vec3 uSunView;\n' + sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance *= smoothstep(0.12, -0.22, dot(normal, normalize(uSunView + vViewPosition)));`,
    );
  };
  return mat;
}


// ---------- שביטים ----------
// "גוף" להסבר הכללי על שביטים (המצלמה טסה לשביט הקרוב ביותר לשמש)
const cometsInfo = { data: COMETS_INFO, isCometsInfo: true, moons: [] };

// זנב: מלבן שקוף שתמיד פונה למצלמה, בהיר ליד הראש ודועך לאורכו
function tailMesh(color, strength) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0.5, 0, 0);
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
    vertexShader: `${LOGDEPTH_V[0]}
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        ${LOGDEPTH_V[1]}
      }`,
    fragmentShader: `${LOGDEPTH_F[0]}
      uniform vec3 color; uniform float strength; varying vec2 vUv;
      void main() {
        ${LOGDEPTH_F[1]}
        float x = vUv.x;
        float y = (vUv.y - 0.5) * 2.0;
        float w = 0.15 + 0.85 * x;
        float a = pow(1.0 - x, 1.4) * exp(-3.0 * y * y / (w * w)) * strength;
        gl_FragColor = vec4(color * a, 1.0);
        #include <colorspace_fragment>
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function createComet(data) {
  const group = new THREE.Group();
  scene.add(group);
  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshStandardMaterial({ color: '#b8b0a6', emissive: '#3a3630', roughness: 1 }),
  );
  group.add(nucleus);
  const coma = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(235,245,255,1)', 'rgba(120,180,255,0)'),
    color: data.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  group.add(coma);
  const comet = {
    data, group, nucleus, coma, isComet: true, moons: [], au: new THREE.Vector3(),
    ion: tailMesh('#7fb4ff', 1.1), dust: tailMesh('#ffe0a0', 0.85),
    prev: new THREE.Vector3(), vel: new THREE.Vector3(0, 0, 1),
    orbitAU: cometOrbitPoints(data.el, 720), orbitLine: createOrbit(data.color, 720),
  };
  nucleus.userData.body = comet;
  comet.label = createLabel(comet);
  return comet;
}

const tailTmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
function setTail(mesh, origin, dir, length, width) {
  mesh.visible = length > 0.05;
  if (!mesh.visible) return;
  const [view, side, along, normal] = tailTmp;
  view.subVectors(camera.position, origin).normalize();
  side.crossVectors(dir, view).normalize().multiplyScalar(width);
  along.copy(dir).multiplyScalar(length);
  normal.crossVectors(along, side).normalize();
  mesh.matrix.makeBasis(along, side, normal).setPosition(origin);
  mesh.matrixWorldNeedsUpdate = true;
}

// השביט "מתעורר" כשהוא מתקרב לשמש: ענן זוהר וזנבות שהולכים ומתארכים
const cometDir = [new THREE.Vector3(), new THREE.Vector3()];
function updateComets() {
  for (const c of comets) {
    c.prev.copy(c.group.position);
    toDisplay(cometPosition(c.data.el, simDays, c.au), c.group.position);
    if (c.prev.distanceToSquared(c.group.position) > 1e-10) c.vel.subVectors(c.group.position, c.prev).normalize();
    const act = Math.min(1, Math.max(0, (4.5 - c.au.length()) / 3.6)) ** 1.5;
    c.coma.scale.setScalar(0.6 + act * 3.4);
    c.coma.material.opacity = 0.35 + act * 0.65;
    const far = 1 + scaleMix * 3;
    const [anti, dust] = cometDir;
    anti.copy(c.group.position).normalize(); // זנב הגז: תמיד הרחק מהשמש
    dust.copy(anti).multiplyScalar(0.8).addScaledVector(c.vel, -0.45).normalize(); // זנב האבק: מתעקל אחורה
    setTail(c.ion, c.group.position, anti, act * 16 * far, 0.5 + act * 1.4);
    setTail(c.dust, c.group.position, dust, act * 11 * far, 0.9 + act * 2.8);
  }
}

// ---------- מערכת השמש טסה בחלל ----------
// הכיוון שבו השמש נעה סביב מרכז הגלקסיה (לכיוון קבוצת הכוכבים ברבור, עלייה ישרה 318°, נטייה +48°).
// הוא מוטה בערך 60 מעלות למישור שבו כוכבי הלכת מקיפים את השמש.
// השמש טסה קדימה ומשאירה זנב זוהר, וכל כוכב לכת מצייר מאחוריה שביל זוהר בצורת ספירלה.
const GALAXY_DIR = poleVector([318, 48.3]);
const GALAXY_SPEED = 0.09; // יחידות תצוגה ליום – מואט מאוד לעומת המציאות, כדי שהספירלות ייכנסו במסך
const TRAIL_DAYS = 2200; // אורך השביל: בערך שש שנים אחורה
const TRAIL_POINTS = 600;
const MOTION_MIN_SPEED = 25; // במצב הזה הזמן רץ לפחות 25 ימים בשנייה, כדי לראות את כוכבי הלכת מסתובבים
const galaxyInfo = { data: GALAXY_MOTION, isGalaxy: true, moons: [], group: new THREE.Object3D() };
let motionMix = 0, motionTarget = 0, trailGrow = 0, speedBoostShown = false;
let trails = [], dust = null, motionArrow = null, sunTail = null;

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function initGalaxyMotion() {
  const dot = softDot();
  // שביל זוהר: קו דק באמצע ו"הילה" של נקודות רכות סביבו, שדועכים לאורך השביל
  const makeTrail = (color, isSun) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((TRAIL_POINTS + 1) * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((TRAIL_POINTS + 1) * 3), 3));
    const col = geo.attributes.color, c = new THREE.Color(color);
    for (let k = 0; k <= TRAIL_POINTS; k++) {
      const f = (1 - k / TRAIL_POINTS) ** 1.2;
      col.setXYZ(k, c.r * f, c.g * f, c.b * f);
    }
    const additive = { vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial(additive));
    const glow = new THREE.Points(geo, new THREE.PointsMaterial({ ...additive, map: dot, size: isSun ? 3 : 1.8, sizeAttenuation: true }));
    for (const o of [line, glow]) {
      o.frustumCulled = false;
      o.visible = false;
      scene.add(o);
    }
    return { line, glow, geo };
  };
  trails = [...bodies.filter((b) => !b.isSun), sun].map((b) => ({ body: b, ...makeTrail(b.isSun ? '#ffd27a' : b.data.color, b.isSun) }));

  // הזנב הזוהר של השמש
  sunTail = tailMesh('#ffb347', 1.2);
  sunTail.visible = false;

  // אבק דק שעומד במקום בחלל – מערכת השמש טסה דרכו
  const N = 900, pos = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const side = new THREE.Vector3().crossVectors(GALAXY_DIR, UP).normalize();
  const up = new THREE.Vector3().crossVectors(side, GALAXY_DIR).normalize();
  dust = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.9, map: dot, color: '#c8d4ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  dust.frustumCulled = false;
  dust.visible = false;
  dust.userData.seeds = Array.from({ length: N }, () => {
    const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 240;
    return { perp: side.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r), phase: Math.random() * 700 };
  });
  scene.add(dust);

  // חץ שמראה לאן מערכת השמש טסה
  motionArrow = new THREE.ArrowHelper(GALAXY_DIR, GALAXY_DIR.clone().multiplyScalar(18), 40, 0x9db8ff, 9, 5);
  motionArrow.visible = false;
  scene.add(motionArrow);
  galaxyInfo.label = document.createElement('div');
  galaxyInfo.label.className = 'label motion-label';
  galaxyInfo.label.textContent = 'כיוון התנועה של מערכת השמש';
  galaxyInfo.label.style.display = 'none';
  $('labels').appendChild(galaxyInfo.label);
  galaxyInfo.group.position.copy(GALAXY_DIR).multiplyScalar(-70);
}

const motionTmp = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();
const BACKWARD = GALAXY_DIR.clone().negate();
function updateGalaxyMotion(dt) {
  if (motionMix !== motionTarget) {
    motionMix = motionTarget > motionMix ? Math.min(1, motionMix + dt / 1.5) : Math.max(0, motionMix - dt / 1.5);
  }
  // בכניסה למצב, השבילים "נמתחים" מאחורי השמש במשך כמה שניות
  trailGrow = motionTarget ? Math.min(1, trailGrow + dt / 6) : motionMix > 0 ? trailGrow : 0;
  const on = motionMix > 0.001;
  for (const t of trails) t.line.visible = t.glow.visible = on;
  dust.visible = motionArrow.visible = on;

  // פחות עומס: קווי המסלולים, האסטרואידים והשביטים נעלמים בהדרגה
  for (const b of bodies) if (b.orbitLine && b !== selected) b.orbitLine.material.opacity = (b.highlight ? 0.95 : 0.3) * (1 - motionMix);
  asteroidPoints.material.opacity = 1 - motionMix;
  asteroidPoints.visible = motionMix < 0.99;
  for (const c of comets) {
    c.group.visible = c.orbitLine.visible = motionMix < 0.5;
    if (motionMix >= 0.5) c.ion.visible = c.dust.visible = false;
    if (motionMix > 0.3) c.label.style.display = 'none';
  }

  // במצב הזה הזמן רץ מהר יותר – מעדכנים גם את התווית
  const boosted = timeRuns() && motionMix > 0 && MOTION_MIN_SPEED * motionMix > simSpeed();
  if (boosted !== speedBoostShown) {
    speedBoostShown = boosted;
    if (boosted) $('speed-label').textContent = `כל שנייה = ${MOTION_MIN_SPEED} ימים`;
    else updateSpeedLabel();
  }
  if (!on) {
    sunTail.visible = false;
    galaxyInfo.label.style.display = 'none';
    return;
  }
  const days = TRAIL_DAYS * (0.04 + 0.96 * smoothstep01(trailGrow));
  // כל נקודה בשביל: המקום של כוכב הלכת לפני tau ימים, פחות הדרך שהשמש עברה מאז
  for (const t of trails) {
    const attr = t.geo.attributes.position;
    for (let k = 0; k <= TRAIL_POINTS; k++) {
      const tau = (k / TRAIL_POINTS) * days;
      if (t.body.isSun) motionTmp.set(0, 0, 0);
      else toDisplay(heliocentric(t.body.data.id, simDays - tau, motionTmp), motionTmp);
      motionTmp.addScaledVector(GALAXY_DIR, -GALAXY_SPEED * tau);
      attr.setXYZ(k, motionTmp.x, motionTmp.y, motionTmp.z);
    }
    attr.needsUpdate = true;
    t.line.material.opacity = motionMix;
    t.glow.material.opacity = motionMix * 0.8;
  }
  setTail(sunTail, ORIGIN, BACKWARD, GALAXY_SPEED * days * 0.8, 9);
  sunTail.material.uniforms.strength.value = 1.2 * motionMix;

  // האבק עומד במקום בחלל, ולכן הוא זז לאחור בדיוק במהירות שבה השמש טסה קדימה
  const L = 700, flow = simDays * GALAXY_SPEED;
  const pa = dust.geometry.attributes.position;
  dust.userData.seeds.forEach((sd, i) => {
    const s = (((sd.phase + flow) % L) + L) % L;
    motionTmp.copy(sd.perp).addScaledVector(GALAXY_DIR, L / 2 - s);
    pa.setXYZ(i, motionTmp.x, motionTmp.y, motionTmp.z);
  });
  pa.needsUpdate = true;
  dust.material.opacity = motionMix * 0.55;

  motionArrow.line.material.transparent = motionArrow.cone.material.transparent = true;
  motionArrow.line.material.opacity = motionArrow.cone.material.opacity = motionMix;
  // תווית ליד קצה החץ
  motionTmp.copy(GALAXY_DIR).multiplyScalar(64).project(camera);
  const show = motionTmp.z < 1 && motionMix > 0.5;
  galaxyInfo.label.style.display = show ? '' : 'none';
  if (show) {
    galaxyInfo.label.style.transform =
      `translate(-50%, 0) translate(${(motionTmp.x * 0.5 + 0.5) * innerWidth}px, ${(-motionTmp.y * 0.5 + 0.5) * innerHeight}px)`;
  }
}
const smoothstep01 = (t) => t * t * (3 - 2 * t);
initGalaxyMotion();

function createBody(data, isSun) {
  const group = new THREE.Group();
  // ציר הסיבוב מכוון לכיוון האמיתי של הקוטב הצפוני (כך העונות בכדור הארץ נכונות)
  const tilt = new THREE.Group();
  tilt.quaternion.setFromUnitVectors(UP, poleVector(data.pole));
  group.add(tilt);
  scene.add(group);

  const geo = new THREE.SphereGeometry(data.size, 96, 48);
  const mat = isSun
    ? sunMaterial(planetTexture(data.id))
    : data.id === 'earth'
      ? earthMaterial()
      : new THREE.MeshStandardMaterial({ map: planetTexture(data.id), roughness: 0.9, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  tilt.add(mesh);

  let clouds = null;
  if (data.id === 'earth') {
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(data.size * 1.012, 96, 48),
      new THREE.MeshPhongMaterial({ map: imageTexture('textures/earth_clouds_1024.png'), transparent: true, depthWrite: false, shininess: 2 }),
    );
    tilt.add(clouds);
    group.add(atmosphere(data.size * 1.04, '#5aa8ff', 1.4));
  }
  if (data.id === 'venus') group.add(atmosphere(data.size * 1.035, '#ffdca8', 0.9));

  const body = { data, group, tilt, mesh, spin: 0, isSun, au: new THREE.Vector3(), clouds };
  mesh.userData.body = body;

  if (isSun) {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.scale.setScalar(data.size * 5.5);
    group.add(glow);
    body.glow = glow;
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
    body.ringUniforms = {
      map: { value: ringTexture() },
      planetCenter: { value: group.position },
      planetRadius: { value: data.size },
      ringNormal: { value: poleVector(data.pole) },
      ringInner: { value: inner },
      ringOuter: { value: outer },
    };
    ringPhoto((tex) => (body.ringUniforms.map.value = tex));
    const ring = new THREE.Mesh(ringGeo, ringMaterial(body.ringUniforms));
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
    addRingShadow(mat, body.ringUniforms);
  }

  if (data.moon) {
    body.moon = new THREE.Mesh(
      new THREE.SphereGeometry(data.moon.size, 32, 16),
      new THREE.MeshStandardMaterial({ map: moonImage, roughness: 1 }),
    );
    group.add(body.moon);
  }

  // הירחים החשובים: מקיפים במישור קו המשווה של כוכב הלכת
  body.moons = (MOONS[data.id] || []).map((m) => {
    let mesh = body.moon, pivot = null;
    if (m.render !== false) {
      pivot = new THREE.Group();
      tilt.add(pivot);
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(m.size, 32, 16),
        new THREE.MeshStandardMaterial({ map: moonImage, color: m.color, roughness: 1 }),
      );
      mesh.position.x = data.size * m.dist;
      pivot.add(mesh);
    }
    const entry = { data: m, planet: body, pivot, mesh, angle: Math.random() * Math.PI * 2 };
    mesh.userData.moon = entry;
    entry.label = document.createElement('div');
    entry.label.className = 'label moon-label';
    entry.label.textContent = m.title;
    entry.label.style.display = 'none';
    entry.label.addEventListener('click', () => openMoon(entry));
    $('labels').appendChild(entry.label);
    return entry;
  });

  body.label = createLabel(body);
  bodies.push(body);
  return body;
}

function createOrbit(color, n = 360) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 3), 3));
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
  for (const b of [...bodies, ...comets]) {
    if (!b.orbitLine) continue;
    if (recompute && !b.isComet) b.orbitAU = orbitPoints(b.data.id, simDays, 360);
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
  if (body.data.id === 'mars') {
    const beltChip = document.createElement('button');
    beltChip.type = 'button';
    beltChip.className = 'chip';
    beltChip.innerHTML = '<span class="ball-emoji" aria-hidden="true">🪨</span><span>אסטרואידים</span>';
    beltChip.addEventListener('click', () => userSelect(belt));
    $('chooser').appendChild(beltChip);
    belt.chip = beltChip;
  }
}
{
  const cometChip = document.createElement('button');
  cometChip.type = 'button';
  cometChip.className = 'chip';
  cometChip.innerHTML = '<span class="ball-emoji" aria-hidden="true">☄️</span><span>שביטים</span>';
  cometChip.addEventListener('click', () => userSelect(cometsInfo));
  $('chooser').appendChild(cometChip);
  cometsInfo.chip = cometChip;
  const galaxyChip = document.createElement('button');
  galaxyChip.type = 'button';
  galaxyChip.className = 'chip';
  galaxyChip.innerHTML = '<span class="ball-emoji" aria-hidden="true">🌀</span><span>טסים בחלל</span>';
  galaxyChip.addEventListener('click', () => userSelect(galaxyInfo));
  $('chooser').appendChild(galaxyChip);
  galaxyInfo.chip = galaxyChip;
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
// מהירות זמנית שהפתיחה של הסיור קובעת (null = המהירות שהמשתמש בחר). כשהיא פעילה הזמן רץ גם אם עצרו אותו
let showSpeed = null;
const simSpeed = () => showSpeed ?? daysPerSecond;
const timeRuns = () => playing || showSpeed !== null;

function sliderToSpeed(v) {
  return 0.05 * Math.pow(4000, v / 100); // מ־0.05 עד 200 ימים בשנייה
}

function updateSpeedLabel() {
  const d = simSpeed();
  let text;
  if (d < 1) text = `כל שנייה = ${Math.max(1, Math.round(d * 24))} שעות`;
  else if (d < 60) text = `כל שנייה = ${Math.round(d)} ימים`;
  else text = `כל שנייה = ${(d / 30.44).toFixed(d < 300 ? 1 : 0)} חודשים`;
  $('speed-label').textContent = timeRuns() ? text : 'הזמן עצר';
}

const dateFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

$('speed').addEventListener('input', (e) => {
  daysPerSecond = sliderToSpeed(+e.target.value);
  showSpeed = null; // המשתמש הזיז את המהירות – היא גוברת על ההדגמה
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
    if (timeRuns()) {
      const omega = ((2 * Math.PI) / d.rotation) * simSpeed();
      b.spin += Math.sign(omega) * Math.min(Math.abs(omega), MAX_SPIN) * dt;
    }
    b.mesh.rotation.y = b.spin;
    if (b.clouds) b.clouds.rotation.y = b.spin * 1.02 + simDays * 0.01;
    if (b.moon) {
      // הירח במיקום האמיתי שלו סביב כדור הארץ (המרחק מוגדל), ותמיד אותו צד פונה אלינו
      moonDirection(simDays, b.moon.position).multiplyScalar(d.moon.distance);
      b.moon.lookAt(b.group.position);
    }
    for (const m of b.moons) {
      if (!m.pivot) continue;
      if (timeRuns()) {
        const omega = ((2 * Math.PI) / m.data.period) * simSpeed();
        m.angle += Math.sign(omega) * Math.min(Math.abs(omega), 2.5) * dt;
      }
      m.pivot.rotation.y = m.angle;
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
  const compressed = new THREE.Vector3(0, 136, 200);
  const real = new THREE.Vector3(0, 2500, 3900);
  return compressed.lerp(real, scaleMix).multiplyScalar(far);
}

function flyTo(body, duration = null, pose = null) {
  const from = { pos: camera.position.clone(), target: controls.target.clone() };
  let offset;
  if (!body) {
    offset = null;
  } else if (body.isGalaxy) {
    // מבט מהצד על השבילים: מאונך לכיוון התנועה
    const side = new THREE.Vector3().crossVectors(GALAXY_DIR, UP).normalize();
    offset = side.multiplyScalar(-250).add(new THREE.Vector3(0, 30, 0)).multiplyScalar(camera.aspect < 1 ? 1.8 : 1);
  } else if (body.isComet) {
    // מהצד, כדי לראות את הזנב לכל אורכו
    const out = body.group.position.clone().normalize();
    const sideways = new THREE.Vector3().crossVectors(out, UP).normalize();
    offset = sideways.multiplyScalar(16).addScaledVector(out, -4).add(new THREE.Vector3(0, 6, 0));
  } else if (body.isBelt) {
    // מבט מלמעלה ומבחוץ על החגורה
    const out = body.group.position.clone().normalize();
    const r = body.group.position.length();
    offset = out.multiplyScalar(r * 0.55).add(new THREE.Vector3(0, r * 0.9, 0));
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
  tween = { from, offset, body, pose, t: 0, duration: duration ?? 1.8 + Math.min(1.7, travel / 600) };
  followBody = body;
  controls.enabled = false;
  controls.minDistance = body ? sizeOf(body) * 1.6 : 5;
}

function updateCamera(dt) {
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / tween.duration);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    const targetPos = tween.body ? tween.body.group.position : new THREE.Vector3();
    const camPos = tween.body ? targetPos.clone().add(tween.offset) : tween.pose ? tween.pose() : overviewPosition();
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
const labelOrder = () => [...bodies, ...(motionMix > 0.3 ? [] : comets)].sort((a, b) => (b === selected) - (a === selected) || b.data.size - a.data.size);

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
  // שמות הירחים מוצגים רק ליד כוכב הלכת שנבחר
  for (const b of bodies) {
    for (const m of b.moons) {
      let show = b === selected && b === followBody && !tween;
      if (show) {
        m.mesh.getWorldPosition(tmp).project(camera);
        show = tmp.z < 1;
      }
      if (show) {
        const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h + 8;
        const lw = (m.labelWidth ||= m.label.offsetWidth || 50);
        const box = { x0: x - lw / 2, x1: x + lw / 2, y0: y, y1: y + 20 };
        show = !placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0);
        if (show) {
          placed.push(box);
          m.label.style.transform = `translate(-50%, 0) translate(${x}px, ${y}px)`;
        }
      }
      m.label.style.display = show ? '' : 'none';
    }
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
  const hit = raycaster.intersectObjects([
    ...bodies.map((b) => b.mesh), ...bodies.flatMap((b) => b.moons.map((m) => m.mesh)), ...comets.map((c) => c.nucleus),
  ])[0];
  if (hit?.object.userData.moon) openMoon(hit.object.userData.moon);
  else if (hit) userSelect(hit.object.userData.body);
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

// הגובה שבו מתחילה שורת הכפתורים בתחתית (משתנה בין מחשב, טלפון לאורך וטלפון לרוחב)
const chooserTop = () => {
  const c = $('chooser');
  return c.offsetParent ? c.getBoundingClientRect().top - 4 : window.innerHeight - 8;
};

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
      y = Math.min(r.bottom, chooserTop()) - ph;
      lookSide = -1;
    }
  } else if (phone) {
    x = w - pw - 4;
    y = document.querySelector('.timebar').getBoundingClientRect().top - ph + 14;
  } else {
    x = 12;
    y = chooserTop() - ph;
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
  hideAsk();
  const used = new Set();
  $('panel-text').replaceChildren(
    ...splitSentences(text).flatMap((s) => {
      const span = document.createElement('span');
      span.append(...linkTerms(s, used));
      return [span, ' '];
    }),
  );
  $('panel-fun').replaceChildren(...linkTerms(funFact, used));
  $('panel-moons').hidden = true;
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
      runCue(i);
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
  hideAsk();
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
  $('term-kicker').textContent = term.kicker || 'נועם מסביר מושג';
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
// חוזרים מהמושג להסבר הכללי. אם נועם היה באמצע הסבר או סיור, הוא שואל אם להמשיך.
let pendingResume = null;
function closeTerm() {
  const st = termState;
  dismissTerm();
  if (!st || $('panel').hidden) return;
  const canResume = st.resume || (st.tourWaiting && tour && tour.index < tourSteps.length - 1);
  if (!canResume) return;
  pendingResume = st;
  $('ask-continue').hidden = false;
  $('panel').scrollTop = 0;
  presenter.play('open', 2);
  if (voiceOn) narrator.speak(CONTINUE_QUESTION);
}

function hideAsk() {
  $('ask-continue').hidden = true;
  pendingResume = null;
}

$('ask-yes').addEventListener('click', () => {
  const st = pendingResume;
  hideAsk();
  if (!st) return;
  if (st.resume) speakCurrent(st.resume.onEnd, st.resume.index);
  else if (tour && tour.index < tourSteps.length - 1) goToStep(tour.index + 1);
});
// "לא עכשיו": נועם עוצר. בסיור אפשר להמשיך בכפתור "הבא"
$('ask-no').addEventListener('click', () => {
  hideAsk();
  narrator.stop();
  presenter.play('wave', 1.5);
});

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
  belt.chip.classList.toggle('active', body === belt);
  for (const c of comets) {
    c.label.classList.toggle('active', c === body);
    c.orbitLine.material.opacity = c === body ? 0.7 : 0.18;
  }
  cometsInfo.chip.classList.toggle('active', body === cometsInfo || !!body?.isComet);
  galaxyInfo.chip.classList.toggle('active', body === galaxyInfo);
  motionTarget = body === galaxyInfo ? 1 : 0;
}

const distFmt = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });
function updateLiveDistance() {
  const el = $('panel-live');
  if (!selected?.au || selected.isSun || selected.isBelt || $('panel').hidden) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const million = selected.au.length() * 149.598;
  const text = million >= 1000 ? `${distFmt.format(million / 1000)} מיליארד ק"מ` : `${distFmt.format(million)} מיליון ק"מ`;
  if (el.dataset.text !== text) el.textContent = el.dataset.text = `המרחק מהשמש עכשיו: ${text}`;
}

$('btn-scale').addEventListener('click', () => {
  endShow();
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
  if (body === cometsInfo) return showComets();
  if (body === galaxyInfo) {
    markActive(galaxyInfo);
    presenter.play('open', 2.6);
    flyTo(galaxyInfo, 3);
    const d = GALAXY_MOTION;
    return showPanel({ title: d.name, subtitle: d.subtitle, color: d.color, text: d.narration, facts: d.facts, funFact: d.funFact });
  }
  const d = body.data;
  markActive(body);
  presenter.play('point', 2.4);
  flyTo(body);
  showPanel({ title: d.name, subtitle: d.subtitle, color: d.color, text: d.narration, facts: d.facts, funFact: d.funFact });
  if (body.moons.length) {
    const h = document.createElement('h3');
    h.textContent = body.moons.length === 1 ? '🌙 לחצו כדי לשמוע על הירח:' : `🌙 הירחים החשובים של ${d.name}:`;
    const list = document.createElement('div');
    list.className = 'moons-list';
    for (const m of body.moons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = `${m.data.emoji} ${m.data.title}`;
      btn.addEventListener('click', () => openMoon(m));
      list.appendChild(btn);
    }
    $('panel-moons').replaceChildren(h, list);
    $('panel-moons').hidden = false;
  }
}

// הסבר כללי על שביטים: המצלמה טסה לשביט הקרוב ביותר לשמש, ובחלון יש כפתורים לכל שביט
function showComets() {
  const nearest = comets.reduce((a, b) => (b.au.length() < a.au.length() ? b : a));
  const d = COMETS_INFO;
  markActive(cometsInfo);
  presenter.play('point', 2.4);
  flyTo(nearest);
  showPanel({ title: d.name, subtitle: d.subtitle, color: d.color, text: d.narration, facts: d.facts, funFact: d.funFact });
  const h = document.createElement('h3');
  h.textContent = '☄️ שביטים מפורסמים:';
  const list = document.createElement('div');
  list.className = 'moons-list';
  for (const c of comets) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = c.data.short;
    btn.addEventListener('click', () => userSelect(c));
    list.appendChild(btn);
  }
  $('panel-moons').replaceChildren(h, list);
  $('panel-moons').hidden = false;
}

// נועם מסביר על ירח, באותו כרטיס של המושגים
function openMoon(m) {
  if (selected !== m.planet) {
    if (tour) endTour();
    showBody(m.planet);
  }
  openTerm({ ...m.data, kicker: `ירח של ${m.planet.data.name}` }, 'panel');
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
  if (!voiceOn) {
    stopSpeaking();
    clearShowEffects();
  }
});

// ---------- הגדרות קול ----------
const settingsEl = $('settings');
const percent = (v) => `${Math.round(v * 100)}%`;

function showSettings() {
  const { pitch, speed } = narrator.settings;
  $('pitch').value = pitch;
  $('rate').value = speed;
  $('pitch-value').textContent = percent(pitch);
  $('rate-value').textContent = percent(speed);
  const voice = narrator.hasRecordings ? 'הקול של נועם (קבצים מוקלטים)' : 'קול הדפדפן';
  const last = { files: 'הקול של נועם', browser: 'קול הדפדפן', none: 'בלי קול' }[narrator.status];
  $('voice-status').textContent =
    `קול זמין: ${voice}` + (last ? ` · הושמע לאחרונה: ${last}` : '') + (narrator.lastError ? ` · שגיאה: ${narrator.lastError}` : '');
}

function toggleSettings(open = settingsEl.hidden) {
  settingsEl.hidden = !open;
  $('btn-settings').setAttribute('aria-expanded', String(open));
  if (open) {
    showSettings();
    // מתחת לכפתור, גם כשהסרגל העליון נשבר לשתי שורות בטלפון
    settingsEl.style.top = `${$('btn-settings').getBoundingClientRect().bottom + 8}px`;
  }
}

$('btn-settings').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSettings();
});
// לחיצה מחוץ לחלון או Escape סוגרות אותו
document.addEventListener('pointerdown', (e) => {
  if (!settingsEl.hidden && !settingsEl.contains(e.target) && e.target !== $('btn-settings')) toggleSettings(false);
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && !settingsEl.hidden && toggleSettings(false));

$('pitch').addEventListener('input', () => {
  narrator.setSettings({ pitch: +$('pitch').value });
  showSettings();
});
$('rate').addEventListener('input', () => {
  narrator.setSettings({ speed: +$('rate').value });
  showSettings();
});
$('settings-reset').addEventListener('click', () => {
  narrator.setSettings(DEFAULT_SETTINGS);
  showSettings();
});
$('settings-test').addEventListener('click', () => {
  if (tour) endTour();
  stopSpeaking();
  narrator.unlock();
  setListening(false);
  presenter.play('wave', 2);
  narrator.speak('שלום! קוראים לי נועם, ואני אהיה המדריך שלכם.');
});

// ---------- סיור מודרך ----------
const tourSteps = [
  ...TOUR_INTRO.map((intro) => ({ intro })),
  ...bodies.flatMap((body) => (body.data.id === 'mars' ? [{ body }, { body: belt }] : [{ body }])),
  { body: cometsInfo },
  { body: galaxyInfo },
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
  endShow();
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
    if (INTRO_CUES[step.intro.id]) startShow(INTRO_CUES[step.intro.id]);
  }
  const advance = () => {
    if (!tour) return;
    if (tour.index === tourSteps.length - 1) return; // בסוף נשארים על המסך האחרון
    tour.timer = setTimeout(() => goToStep(tour.index + 1), 1800);
  };
  if (voiceOn) speakCurrent(advance);
  else {
    stopSpeaking();
    if (show) playShowSilently();
  }
}

// ---------- הפתיחה של הסיור: כל משפט של נועם מפעיל משהו על המסך ----------
// show = האפקטים של התחנה הנוכחית. כשעוזבים את התחנה (הבא, הקודם, סיום, בחירה אחרת) הכול חוזר למצב הרגיל.
let show = null;
let sunPulse = 99;

function pulseSun() {
  sunPulse = 0;
}
function updateSunPulse(dt) {
  if (sunPulse > 1.6) return;
  sunPulse += dt;
  const k = Math.sin(Math.PI * Math.min(1, sunPulse / 1.6) * 2) ** 2; // שתי פעימות
  sun.glow.scale.setScalar(sun.data.size * 5.5 * (1 + 0.5 * k));
}

// מדגיש מסלולים ושמות של כוכבי לכת
function highlight(ids) {
  for (const b of bodies) {
    b.highlight = ids.includes(b.data.id);
    b.label.classList.toggle('active', b.highlight || b === selected);
  }
}

function showTimer(fn, ms) {
  show?.timers.push(setTimeout(fn, ms));
}

const planetIds = PLANETS.map((p) => p.id).filter((id) => id !== 'pluto'); // שמונה כוכבי הלכת
const farView = () => (camera.aspect < 1 ? 2.3 : 1);
// מבט כמעט מהצד – רואים שכל המסלולים כמעט באותו מישור
const sideView = () => new THREE.Vector3(0, 16, 250).multiplyScalar(farView());
// מבט מלמעלה וקרוב על כוכבי הלכת הפנימיים
const innerView = () => new THREE.Vector3(0, 78, 34).multiplyScalar(farView());

// האפקטים לפי מספר המשפט בכל תחנה
const INTRO_CUES = {
  welcome: {
    0: () => {
      presenter.play('wave', 2.4);
      flyTo(null, 2.5);
    },
    3: () => {
      pulseSun();
      planetIds.forEach((id, k) => showTimer(() => highlight(planetIds.slice(0, k + 1)), 900 + k * 380));
    },
    4: () => {
      setShowSpeed(40);
      flyTo(null, 3.5, sideView);
    },
    5: () => {
      flyTo(null, 3);
      pulseSun();
    },
  },
  motion: {
    0: () => {
      setShowSpeed(40);
      flyTo(null, 2.5);
      highlight(['mercury', 'neptune']);
    },
    1: () => highlight(['mercury', 'pluto']),
    2: () => {
      setShowSpeed(12);
      highlight(['mercury']);
      flyTo(null, 3, innerView);
    },
    3: () => {
      setShowSpeed(null);
      highlight([]);
      simDays = (Date.now() - J2000) / DAY_MS;
      flyTo(null, 2.5);
      flash($('date-label').parentElement);
    },
    4: () => {
      highlight(['earth']);
      flyTo(bodyById.earth, 3);
    },
  },
  secret: {
    0: () => {
      scaleTarget = 1;
      flyTo(null, 3.5);
    },
    2: () => {
      scaleTarget = show.baseScale;
      flyTo(null, 3.5);
    },
    3: () => $('btn-scale').classList.add('glow'),
    4: () => presenter.play('wave', 2.4),
  },
};

function setShowSpeed(v) {
  showSpeed = v;
  updateSpeedLabel();
}

function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth; // מאתחל את האנימציה
  el.classList.add('flash');
}

function startShow(cues) {
  endShow();
  show = { cues, timers: [], baseScale: scaleTarget };
}

// מחזיר את המסך למצב הרגיל, אבל נשארים בתחנה (למשל לפני הקראה חוזרת)
function clearShowEffects() {
  if (!show) return;
  show.timers.forEach(clearTimeout);
  show.timers = [];
  setShowSpeed(null);
  highlight([]);
  scaleTarget = show.baseScale;
  $('btn-scale').classList.remove('glow');
}

function endShow() {
  clearShowEffects();
  show = null;
}

function runCue(i) {
  if (!show) return;
  if (i === 0) clearShowEffects();
  show.cues[i]?.();
}

// בלי קול: האפקטים רצים לפי זמן קריאה משוער של כל משפט
function playShowSilently() {
  let t = 0;
  splitSentences(currentText).forEach((sentence, i) => {
    if (i === 0) runCue(0);
    else showTimer(() => runCue(i), t);
    t += 700 + sentence.split(/\s+/).length * 420;
  });
}

function endTour() {
  if (!tour) return;
  clearTimeout(tour.timer);
  endShow();
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
// ---------- המסך נשאר דולק ----------
// בטלפון המסך נכבה אחרי כמה שניות בלי מגע. כל עוד האתר פתוח וגלוי, מבקשים מהמכשיר להשאיר את המסך דולק
// (Screen Wake Lock). כשעוברים ללשונית אחרת הבקשה משתחררת לבד, ומבקשים אותה שוב כשחוזרים.
let wakeLock = null;
async function keepScreenOn() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {
    // לא נתמך או נחסם (למשל מצב חיסכון בסוללה) – המסך יתנהג כרגיל
  }
}
document.addEventListener('visibilitychange', keepScreenOn);
document.addEventListener('pointerdown', keepScreenOn, { passive: true });
keepScreenOn();

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
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.1);
  watchPerformance(rawDt);
  if (timeRuns()) simDays += Math.max(simSpeed(), MOTION_MIN_SPEED * motionMix) * dt;
  updateSunPulse(dt);
  if (scaleT !== scaleTarget) {
    scaleT = scaleTarget > scaleT ? Math.min(1, scaleT + dt / 2.8) : Math.max(0, scaleT - dt / 2.8);
    scaleMix = scaleT * scaleT * (3 - 2 * scaleT);
  }
  updateBodies(dt);
  sunUniforms.uTime.value += dt;
  sunUniforms.uBoost.value = bloomOn ? 1.35 : 1;
  sun.glow.material.opacity = bloomOn ? 0.55 : 1; // עם bloom ההילה של השמש כבר חזקה
  for (const b of bodies) {
    if (!b.ringUniforms) continue;
    const s = b.group.scale.x;
    b.ringUniforms.planetRadius.value = b.data.size * s;
    b.ringUniforms.ringInner.value = b.data.size * 1.25 * s;
    b.ringUniforms.ringOuter.value = b.data.size * 2.3 * s;
  }
  updateOrbits();
  updateAsteroids();
  updateComets();
  updateGalaxyMotion(dt);
  updateLiveDistance();
  updateCamera(dt);
  controls.update();
  updateViewOffset(dt);
  camera.updateMatrixWorld();
  sunView.value.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
  if (bloomOn) {
    composer.render(dt);
    checkBloomOutput();
  } else renderer.render(scene, camera);
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
  composer.setSize(window.innerWidth, window.innerHeight);
  presenter.setSize(presenterEl.clientWidth, presenterEl.clientHeight);
});
presenter.play('wave', 3);

// גישה נוחה לבדיקות מהקונסול
window.solar = { bodies: bodyById, narrator, presenter, comets, setDate: (iso) => (simDays = (Date.parse(iso) - J2000) / DAY_MS), bloom: () => ({ on: bloomOn, check: bloomCheck }) };
