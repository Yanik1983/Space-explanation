import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LANG, LOCALE, tt } from './i18n.js';
import { SUN, PLANETS, TOUR_INTRO, TOUR_OUTRO, SCALE_REAL, SCALE_COMPRESSED, ASTEROID_BELT, GALAXY_MOTION, BLACK_HOLE, MILKY_WAY, GLOSSARY, GLOSSARY_FORMS, CONTINUE_QUESTION, MOONS, COMETS, COMETS_INFO } from './content.js';
import { heliocentric, orbitPoints, moonDirection, poleVector, makeAsteroids, asteroidPosition, cometPosition, cometOrbitPoints } from './orbits.js';
import { planetTexture, ringTexture, glowTexture, imageTexture, loadDetailed, loadPhotos, ringPhoto } from './textures.js';
import { Narrator, splitSentences, DEFAULT_SETTINGS } from './speech.js';
import { Presenter } from './kid-presenter.js';
import { GAL_R, GAL_SUN_R, buildGalaxy, seeded } from './galaxy.js';

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
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 90000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.maxDistance = 8000;

// הרקע: שביל החלב שבנינו (כדור השמיים, ראו "שביל החלב מבחוץ"), כך שכל האתר הוא עולם אחד
scene.background = null;

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

const starField = addStars();

// ---------- גופים ----------
const bodies = [];
const sun = createBody(SUN, true);
for (const p of PLANETS) createBody(p, false);
const bodyById = Object.fromEntries(bodies.map((b) => [b.data.id, b]));
const comets = COMETS.map(createComet);

// טקסטורות מפורטות נוצרות ברקע ומחליפות את הגרסה הקטנה, כוכב אחרי כוכב
// נוגה ופלוטו מחושבים; לשמש ולשאר יש מפות אמיתיות (ואם תמונה לא נטענת – מחשבים גם אותה)
loadDetailed(['venus', 'pluto'], applyDetailed);
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
// מעברים רכים בין התחנות: כל אפקט מתקדם ב־p (ליניארי), והמראה עצמו לפי עקומה רכה (מתחיל ונגמר בעדינות).
// בזמן טיסה המעבר נמשך כחצי מהטיסה: מה שנעלם – מתחילת הטיסה, ומה שמופיע – אחרי שליש ממנה, כשהמצלמה כבר בדרך.
const fadeP = { motion: 0, milky: 0, bh: 0 };
function stepFade(key, target, up, down, dt) {
  let p = fadeP[key];
  if (p !== target) {
    const len = tween ? Math.max(0.6, tween.duration * 0.55) : target > p ? up : down;
    if (target > p && !(tween && tween.e < 0.33)) p = Math.min(1, p + dt / len);
    else if (target < p) p = Math.max(0, p - dt / len);
    fadeP[key] = p;
  }
  return p * p * (3 - 2 * p);
}
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
  galaxyInfo.label.textContent = tt('כיוון התנועה של מערכת השמש', 'The direction the Solar System is moving');
  galaxyInfo.label.style.display = 'none';
  $('labels').appendChild(galaxyInfo.label);
  galaxyInfo.group.position.copy(GALAXY_DIR).multiplyScalar(-44);
}

const motionTmp = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();
const BACKWARD = GALAXY_DIR.clone().negate();
function updateGalaxyMotion(dt) {
  motionMix = stepFade('motion', motionTarget, 1.5, 1.5, dt);
  // בכניסה למצב, השבילים "נמתחים" מאחורי השמש במשך כמה שניות
  trailGrow = motionTarget ? Math.min(1, trailGrow + dt / 6) : motionMix > 0 ? trailGrow : 0;
  const on = motionMix > 0.001;
  for (const t of trails) t.line.visible = t.glow.visible = on;
  dust.visible = motionArrow.visible = on;

  // פחות עומס: קווי המסלולים, האסטרואידים והשביטים נעלמים בהדרגה
  for (const b of bodies) if (b.orbitLine && b !== selected) b.orbitLine.material.opacity = (b.highlight ? 0.95 : 0.3) * (1 - motionMix) * (1 - milkyMix);
  // גם כשמסתכלים על הגלקסיה מבחוץ (שם מערכת השמש קטנה מנקודה)
  asteroidPoints.material.opacity = (1 - motionMix) * (1 - milkyMix);
  asteroidPoints.visible = motionMix < 0.99 && milkyMix < 0.99;
  for (const c of comets) {
    c.group.visible = c.orbitLine.visible = motionMix < 0.5 && milkyMix < 0.5;
    if (motionMix >= 0.5) c.ion.visible = c.dust.visible = false;
    if (motionMix > 0.3) c.label.style.display = 'none';
  }

  // במצב הזה הזמן רץ מהר יותר – מעדכנים גם את התווית
  const boosted = timeRuns() && motionMix > 0 && MOTION_MIN_SPEED * motionMix > simSpeed();
  if (boosted !== speedBoostShown) {
    speedBoostShown = boosted;
    if (boosted) $('speed-label').textContent = tt(`כל שנייה = ${MOTION_MIN_SPEED} ימים`, `${MOTION_MIN_SPEED} days per second`);
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
    // התווית נשארת באזור הפנוי: לא מתחת לכפתורים בראש המסך ולא מעל חלון ההסבר
    const lw = galaxyInfo.label.offsetWidth || 200;
    const lx = Math.min(Math.max((motionTmp.x * 0.5 + 0.5) * innerWidth, lw / 2 + 8), innerWidth - lw / 2 - 8);
    const ly = Math.min(Math.max((-motionTmp.y * 0.5 + 0.5) * innerHeight, 112), innerHeight - 130);
    galaxyInfo.label.style.transform = `translate(-50%, 0) translate(${lx}px, ${ly}px)`;
  }
}
const smoothstep01 = (t) => t * t * (3 - 2 * t);
initGalaxyMotion();

// ---------- שביל החלב מבחוץ ----------
// הגלקסיה בנויה בקוד מכוכבים (ראו בהמשך) ומכוונת כמו הגלקסיה האמיתית: המרכז שלה בכיוון
// מזל קשת, והמישור שלה נוטה בכ־60 מעלות למישור של כוכבי הלכת. השמש (נקודת האפס) יושבת על אחת הזרועות,
// בערך באמצע הדרך בין המרכז לקצה. הגדלים כאן לא בקנה מידה – מערכת השמש האמיתית קטנה מפיקסל בציור הזה.
const GAL_POLE = poleVector([192.859, 27.128]); // הקוטב הצפוני של הגלקסיה
const GAL_CENTRE_DIR = poleVector([266.405, -28.936]); // מרכז הגלקסיה (קשת A*)
// המצלמה מכוונת לנקודה שבין מרכז הגלקסיה לשמש, כדי שגם המרכז וגם "אנחנו כאן" ייראו
const milkyInfo = { data: MILKY_WAY, isMilky: true, moons: [], group: new THREE.Object3D() };
const galaxyGroup = new THREE.Group();
let milkyMix = 0, milkyTarget = 0;
const milky = (() => {
  const g = galaxyGroup;
  g.position.copy(GAL_CENTRE_DIR).multiplyScalar(GAL_SUN_R);
  milkyInfo.group.position.copy(g.position).multiplyScalar(0.45);
  const toSun = GAL_CENTRE_DIR.clone().negate().projectOnPlane(GAL_POLE).normalize();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(toSun, GAL_POLE, new THREE.Vector3().crossVectors(toSun, GAL_POLE)));
  scene.add(g);

  // הגלקסיה בנויה בקוד (js/galaxy.js) ונמצאת בתוך holder: ציר y הוא הקוטב הצפוני שלה והשמש נמצאת על ציר z.
  const R0 = GAL_SUN_R;
  const side = GAL_R * 2.2;
  // שכבת זוהר רכה מתחת לכוכבים (מצוירת על קנבס מאותן נקודות), כדי שהזרועות ייראו רציפות
  const disk = new THREE.Mesh(
    new THREE.PlaneGeometry(side, side),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  disk.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.rotation.y = Math.PI / 2; // ציר z של holder → הכיוון מהמרכז אל השמש
  holder.add(disk);
  g.add(holder);
  disk.frustumCulled = false;
  // זוהר עדין של הבליטה במרכז, כדי שבמבט מהצד הגלקסיה לא תיראה כמו דף שטוח
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,230,190,1)', 'rgba(255,170,90,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  core.scale.setScalar(GAL_R * 0.35);
  g.add(core);
  // הסימון "אנחנו כאן": טבעת זוהרת בגודל קבוע על המסך
  const here = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(140,220,255,1)', 'rgba(60,140,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0, sizeAttenuation: false }));
  here.scale.setScalar(0.06);
  scene.add(here);
  const label = (text, cls) => {
    const el = document.createElement('div');
    el.className = `label ${cls}`;
    el.textContent = text;
    el.style.display = 'none';
    $('labels').appendChild(el);
    return el;
  };
  disk.visible = core.visible = here.visible = false;
  // נקודת השמש על הדיסק: מסתובבת יחד עם הגלקסיה
  const sunAnchor = new THREE.Object3D();
  sunAnchor.position.set(0, 0, R0);
  holder.add(sunAnchor);

  // הכוכבים מנצנצים, ומדי פעם כוכב מתלקח לרגע. שכבת האבק מציירת בצבע כהה (לא מוסיפה אור) ומסתירה חלק מהכוכבים.
  const pointsMaterial = (dust, steady = false) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uScale: { value: 1 }, uMaxPx: { value: 1e4 }, uNear: { value: 0 } },
    vertexShader: `${LOGDEPTH_V[0]}
      attribute float size; attribute float phase; attribute float flare;
      uniform float uTime; uniform float uScale; uniform float uMaxPx; uniform float uNear;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vColor = color;
        float tw = ${dust || steady ? '1.0' : '0.6 + 0.4 * sin(uTime * (1.2 + fract(phase * 7.3) * 2.5) + phase * 6.2831)'};
        float burst = flare * pow(max(0.0, sin(uTime * 0.35 + phase * 40.0)), 60.0);
        vAlpha = tw + 3.0 * burst;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // מבפנים (uNear > 0) כוכבים קרובים מדי נעלמים, והגודל מוגבל – כדי שלא יהיו כתמים ענקיים
        vAlpha *= smoothstep(uNear, uNear * 2.0, -mv.z);
        gl_PointSize = clamp(size * (1.0 + 2.5 * burst) * uScale / -mv.z, 1.0, uMaxPx);
        gl_Position = projectionMatrix * mv;
        ${LOGDEPTH_V[1]}
      }`,
    fragmentShader: `${LOGDEPTH_F[0]}
      uniform float uOpacity; varying vec3 vColor; varying float vAlpha;
      void main() {
        ${LOGDEPTH_F[1]}
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(d));
        ${dust ? 'gl_FragColor = vec4(vColor, a * a * 0.42 * uOpacity);' : 'gl_FragColor = vec4(vColor * a * vAlpha * uOpacity, 1.0);'}
        #include <colorspace_fragment>
      }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: dust ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const starsMat = pointsMaterial(false);
  const dustMat = pointsMaterial(true);
  // זוהר רך ותלת ממדי: כתמים גדולים וחלשים שנראים גם כשמסתכלים על הגלקסיה מהצד (שכבת הזוהר השטוחה נעלמת אז)
  const glowMat = pointsMaterial(false, true);
  const glowPoints = new THREE.Points(new THREE.BufferGeometry(), glowMat);
  const starPoints = new THREE.Points(new THREE.BufferGeometry(), starsMat);
  const dustPoints = new THREE.Points(new THREE.BufferGeometry(), dustMat);
  for (const [o, order] of [[glowPoints, 0], [starPoints, 1], [dustPoints, 2]]) {
    o.frustumCulled = false;
    o.visible = false;
    o.renderOrder = order;
    holder.add(o);
  }

  const setGeo = (points, bag) => {
    const geo = points.geometry;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bag.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(bag.col, 3));
    geo.setAttribute('size', new THREE.Float32BufferAttribute(bag.size, 1));
    geo.setAttribute('phase', new THREE.Float32BufferAttribute(bag.phase, 1));
    geo.setAttribute('flare', new THREE.Float32BufferAttribute(bag.flare, 1));
  };

  // הזוהר: כל כוכב עשירי מצויר ככתם רך על קנבס, ואחר כך האבק מכהה אותו
  function paintHaze({ stars, dust }) {
    const W = window.innerWidth <= 720 ? 512 : 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = W;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, W);
    const toPx = (v) => (v / side + 0.5) * W;
    const blob = (x, z, rad, rgba) => {
      const px = toPx(x), py = toPx(z);
      const gr = ctx.createRadialGradient(px, py, 0, px, py, rad);
      gr.addColorStop(0, rgba);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    };
    ctx.globalCompositeOperation = 'lighter';
    const rad = W * 0.016;
    for (let i = 0; i < stars.size.length; i += 10) {
      const [r, g, b] = [stars.col[i * 3], stars.col[i * 3 + 1], stars.col[i * 3 + 2]].map((v) => Math.round(Math.min(1, v) * 255));
      blob(stars.pos[i * 3], stars.pos[i * 3 + 2], rad, `rgba(${r},${g},${b},0.16)`);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < dust.size.length; i += 2) blob(dust.pos[i * 3], dust.pos[i * 3 + 2], rad * 0.8, 'rgba(0,0,0,0.45)');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // השמיים: אותה גלקסיה בדיוק, כפי שהיא נראית מהמקום של השמש – תמונה שמצוירת מראש מאותו מודל
  // (tools/paint-sky.mjs), עם מיליוני כוכבים ועננים של אבק. הכדור נע עם המצלמה, ולכן השמיים תמיד "באינסוף".
  const skyMap = imageTexture(window.innerWidth <= 720 ? 'textures/sky/galaxy-2k.jpg' : 'textures/sky/galaxy.jpg');
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(40000, 96, 48),
    new THREE.MeshBasicMaterial({ map: skyMap, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }),
  );
  // הכדור מסובב כמו holder במנוחה, כך שהפס נמצא בכיוון האמיתי שלו בשמיים
  skyDome.quaternion.copy(g.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2));
  skyDome.renderOrder = -1;
  skyDome.frustumCulled = false;
  scene.add(skyDome);

  // הגלקסיה נבנית רק כשמגיעים לאחת התחנות שלה בפעם הראשונה
  const load = () => {
    if (disk.material.map) return;
    const phone = window.innerWidth <= 720;
    const gal = buildGalaxy({ n: phone ? 26000 : 60000, nd: phone ? 3500 : 8000, random: seeded(7) });
    setGeo(starPoints, gal.stars);
    setGeo(glowPoints, gal.glow);
    setGeo(dustPoints, gal.dust);
    // שורה 0 בקנבס היא הקצה העליון של המשטח, שאחרי הסיבוב שלו נמצא ב־z שלילי של holder – בדיוק כמו ב־toPx
    disk.material.map = paintHaze(gal);
    disk.material.needsUpdate = true;
  };
  return { disk, core, here, holder, sunAnchor, starPoints, starsMat, dustPoints, dustMat, glowPoints, glowMat, skyDome, load, hereLabel: label(tt('☀️ אנחנו כאן', '☀️ We are here'), 'milky-here'), centreLabel: label(tt('מרכז הגלקסיה', 'Galactic center'), 'milky-centre') };
})();

const milkyTmp = new THREE.Vector3();
function placeMilkyLabel(el, worldPos, dy) {
  milkyTmp.copy(worldPos).project(camera);
  const show = milkyMix > 0.6 && milkyTmp.z < 1;
  el.style.display = show ? '' : 'none';
  if (show) el.style.transform = `translate(-50%, 0) translate(${(milkyTmp.x * 0.5 + 0.5) * innerWidth}px, ${(-milkyTmp.y * 0.5 + 0.5) * innerHeight + dy}px)`;
}

function updateMilkyWay(dt) {
  if (tween?.milky) {
    // בטיסה אל שביל החלב או ממנו, הגלקסיה מבחוץ מופיעה לפי המרחק – כשיוצאים ממנה, ולא לפי השעון
    const k = THREE.MathUtils.clamp((Math.log(camera.position.length()) - Math.log(1800)) / (Math.log(16000) - Math.log(1800)), 0, 1);
    fadeP.milky = k;
    milkyMix = k * k * (3 - 2 * k);
  } else milkyMix = stepFade('milky', milkyTarget, 2.5, 1.5, dt);
  if (milkyTarget || motionTarget || bhTarget) milky.load();
  // בתחנות "טסים בחלל" ו"חור שחור" שביל החלב שברקע הוא הגלקסיה מהקוד, כפי שהיא נראית מבפנים (במקום הצילום)
  const inside = Math.max(motionMix, bhMix) * (1 - milkyMix);
  // השמיים נעלמים רק כשיוצאים מהגלקסיה (אז רואים אותה מבחוץ)
  milky.skyDome.visible = milkyMix < 0.999;
  milky.skyDome.material.opacity = 1 - milkyMix;
  milky.skyDome.position.copy(camera.position);
  const on = milkyMix > 0.001;
  for (const o of [milky.disk, milky.core, milky.here, milky.starPoints, milky.dustPoints, milky.glowPoints]) o.visible = on;
  if (!on && inside > 0.001) {
    // גם הכוכבים עצמם של הגלקסיה נראים מבפנים: הגלקסיה חוזרת למקום שבו השמש נמצאת בדיוק אצלנו
    milky.holder.rotation.y = Math.PI / 2;
    milky.starPoints.visible = true;
    milky.dustPoints.visible = false;
    const m = milky.starsMat.uniforms;
    m.uOpacity.value = inside * 0.4;
    m.uTime.value = performance.now() / 1000;
    m.uScale.value = (renderer.domElement.height / 2) / Math.tan((camera.fov * DEG) / 2);
    m.uMaxPx.value = 2 * renderer.getPixelRatio();
    m.uNear.value = 0.04 * GAL_SUN_R;
  }
  // מבחוץ מערכת השמש קטנה מנקודה – מסתירים את הגופים עצמם (הסימון "אנחנו כאן" מראה איפה היא)
  for (const b of bodies) b.group.visible = milkyMix < 0.5;
  starField.material.opacity = 1 - milkyMix;
  controls.maxDistance = on || tween || followBody === milkyInfo ? 60000 : 8000;
  if (!on) {
    milky.hereLabel.style.display = milky.centreLabel.style.display = 'none';
    return;
  }
  const t = performance.now() / 1000;
  // הגלקסיה מסתובבת עם כיוון השעון (במבט מהקוטב הצפוני שלה), והשמש מקיפה איתה את המרכז
  milky.holder.rotation.y -= dt * 0.025;
  // עם הזוהר (bloom) המרכז הבהיר מתפשט על כל המסך – מחלישים את שכבת הזוהר והליבה
  const glowK = bloomOn ? 0.45 : 1;

  // בזמן שהמצלמה עוברת בין הכוכבים (בדרך החוצה או חזרה) הכוכבים הקרובים לא הופכים לכתמים ענקיים
  const out = THREE.MathUtils.smoothstep(camera.position.distanceTo(galaxyGroup.position), 0.9 * GAL_R, 2.1 * GAL_R);
  for (const m of [milky.starsMat, milky.dustMat, milky.glowMat]) {
    m.uniforms.uMaxPx.value = Math.exp(THREE.MathUtils.lerp(Math.log(3 * renderer.getPixelRatio()), Math.log(1e4), out * out));
    m.uniforms.uNear.value = (1 - out) * 0.04 * GAL_SUN_R;
    m.uniforms.uOpacity.value = milkyMix;
    m.uniforms.uTime.value = t;
    m.uniforms.uScale.value = (renderer.domElement.height / 2) / Math.tan((camera.fov * DEG) / 2);
  }
  // שכבת הזוהר השטוחה נראית טוב רק מרחוק; מקרוב (בדרך פנימה) היא נראית כמו ריבוע מטושטש
  milky.disk.material.opacity = milkyMix * 0.9 * glowK * out;
  milky.core.material.opacity = milkyMix * glowK * (0.22 + 0.08 * Math.sin(t * 0.8)); // הליבה "נושמת"
  milky.here.material.opacity = milkyMix * (0.75 + 0.25 * Math.sin(t * 3.3));
  milky.sunAnchor.getWorldPosition(milky.here.position);
  placeMilkyLabel(milky.hereLabel, milky.here.position, 14);
  placeMilkyLabel(milky.centreLabel, galaxyGroup.position, 0);
}

// ---------- חור שחור ----------
// Gaia BH1, החור השחור הכי קרוב שאנחנו מכירים, בכיוון האמיתי שלו בשמיים (נושא הנחש, עלייה ישרה 262.17°, נטייה ‎-0.58°).
// הוא מצויר כמו "גרגנטואה" מהסרט "בין כוכבים": לכל פיקסל מחשבים את המסלול של קרן האור סביב החור (לפי תורת היחסות),
// והקרן פוגעת בטבעת הגז, בכוכב השכן, נבלעת בחור – או בורחת ומראה את השמיים שמאחור, מעוקמים.
// המרחק והגודל לא בקנה מידה (באמת הוא רחוק פי מאה מיליון מנפטון, וקטן בהרבה מהשמש).
const BH_DIR = poleVector([262.171, -0.581]);
const BH_DIST = 6000; // רחוק מאוד מהשמש: הטיסה אליו מתרחקת קודם עד שמערכת השמש נעלמת, ורק אז מתקרבת
const BH_RS = 12; // רדיוס אופק האירועים, ביחידות של התצוגה
const BH_R = 80; // הרדיוס (באופקי אירועים) של הכדור שבתוכו מחושב העיקום. המצלמה בתוכו, כך שכל השמיים שרואים מעוקמים
const blackHoleInfo = { data: BLACK_HOLE, isBlackHole: true, moons: [], group: new THREE.Object3D() };
let bhMix = 0, bhTarget = 0;
const blackHole = (() => {
  const g = blackHoleInfo.group;
  g.position.copy(BH_DIR).multiplyScalar(BH_DIST);
  // מסתכלים על החור לכיוון מרכז הגלקסיה, כך ששביל החלב והמרכז הבהיר שלו נמצאים בדיוק מאחוריו.
  // ציר z של החור פונה אל המצלמה, וטבעת הגז (במישור xz) אופקית על המסך, כמו בסרט. שביל החלב חוצה את המסך באלכסון
  const z = GAL_CENTRE_DIR.clone().negate();
  const y = UP.clone().projectOnPlane(z).normalize();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, z), y, z));
  g.scale.setScalar(BH_RS);
  scene.add(g);
  const phone = window.innerWidth <= 720 || touchDevice;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uDome: { value: null },
      uDomeRot: { value: new THREE.Matrix3() },
      uToWorld: { value: new THREE.Matrix3() },
      uCam: { value: new THREE.Vector3() },
      uStar: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: `${LOGDEPTH_V[0]}
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        ${LOGDEPTH_V[1]}
      }`,
    fragmentShader: `${LOGDEPTH_F[0]}
      #define STEPS ${phone ? 150 : 260}
      #define R_OUT ${BH_R.toFixed(1)}
      #define DISK_IN 2.6
      #define DISK_OUT 13.0
      #define STAR_R 0.45
      uniform sampler2D uDome; uniform mat3 uDomeRot; uniform mat3 uToWorld;
      uniform vec3 uCam; uniform vec3 uStar; uniform float uTime; uniform float uOpacity;
      varying vec3 vPos;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      // השמיים שמאחור: שביל החלב מהקוד (אותה מפה שמצוירת על הכדור הגדול בתחנה "טסים בחלל"),
      // ועוד כוכבים קטנים וחדים – גם הם מתעקמים יחד עם השמיים
      vec3 sky(vec3 d) {
        d = normalize(uDomeRot * normalize(uToWorld * d));
        vec2 uv = vec2(atan(d.z, -d.x) / 6.2831853 + 0.5, 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.1415927);
        uv.x = fract(uv.x - 0.5);
        vec3 c = texture2D(uDome, uv).rgb; // בדיוק כמו כדור השמיים, כדי שלא ייראה גבול
        vec3 q = d * 260.0, cell = floor(q);
        float h = hash3(cell);
        if (h > 0.975) {
          vec3 sp = cell + 0.5 + 0.3 * (vec3(hash3(cell + 1.3), hash3(cell + 2.7), hash3(cell + 4.1)) - 0.5);
          float k = smoothstep(0.32, 0.0, length(q - sp));
          c += k * (h - 0.975) * 30.0 * mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash3(cell + 7.7));
        }
        return c;
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      // טבעת הגז: חמה ובהירה בפנים, כתומה ועמומה בחוץ, עם פסים שמסתובבים מהר יותר ככל שקרובים לחור.
      // הצד שמתקרב אלינו בהיר וכחלחל יותר, והצד שמתרחק כהה ואדמדם (אפקט דופלר). קרוב לחור האור גם "מאבד אנרגיה" ומאדים.
      vec4 disk(vec3 q, vec3 dir) {
        float r = length(q.xz);
        if (r < DISK_IN || r > DISK_OUT) return vec4(0.0);
        float spin = mod(uTime * 1.6 * pow(r, -1.5), 6.2831853);
        vec2 uv = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * q.xz;
        float a = atan(uv.y, uv.x);
        float n = noise(vec2(r * 3.0, a * 2.0)) * 0.5 + noise(vec2(r * 9.0, a * 3.0)) * 0.3 + noise(vec2(r * 26.0, a * 1.5)) * 0.2;
        float band = 0.82 + 0.18 * sin(r * 4.0 + n * 6.0);
        float edge = smoothstep(DISK_IN, DISK_IN + 0.5, r) * (1.0 - smoothstep(DISK_OUT * 0.55, DISK_OUT, r));
        float t = pow(DISK_IN / r, 1.6);
        vec3 col = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.86, 0.6), t);
        vec3 vel = normalize(vec3(-q.z, 0.0, q.x)) * sqrt(0.5 / r);
        float beta = length(vel);
        float dop = 1.0 / (sqrt(1.0 - beta * beta) * (1.0 + dot(vel, dir)));
        float shift = clamp(dop * sqrt(1.0 - 1.0 / r), 0.35, 1.8);
        col *= mix(vec3(1.25, 0.8, 0.6), vec3(0.85, 0.95, 1.25), smoothstep(0.7, 1.4, shift));
        float lum = (0.4 + 1.5 * t) * (0.45 + 0.75 * n) * band * pow(shift, 2.2);
        return vec4(col * lum, clamp(edge * (0.55 + 0.45 * n) * 1.15, 0.0, 0.97));
      }

      void main() {
        ${LOGDEPTH_F[1]}
        vec3 dir = normalize(vPos - uCam);
        vec3 p = uCam;
        if (dot(p, p) > R_OUT * R_OUT) {
          float b = dot(p, dir), c = dot(p, p) - R_OUT * R_OUT, h = b * b - c;
          if (h < 0.0) discard;
          p += dir * (-b - sqrt(h));
        }
        vec3 v = dir;
        float h2 = dot(cross(p, v), cross(p, v));
        // ליד שפת הכדור הקרניים כמעט לא מתעקמות – מחליקים אל הכיוון הישר, כדי שלא יהיה "תפר" עם הרקע
        float edgeK = smoothstep(0.75 * R_OUT, 0.98 * R_OUT, sqrt(h2));
        vec3 col = vec3(0.0);
        float trans = 1.0;
        bool fell = false;
        for (int i = 0; i < STEPS; i++) {
          float r2 = dot(p, p), r = sqrt(r2);
          if (r < 1.0) { fell = true; break; }
          float dt = ${phone ? '0.06' : '0.045'} * r; // בטלפון צעדים גדולים יותר – פחות חישוב
          v += -1.5 * h2 * p / (r2 * r2 * r) * dt;
          vec3 pn = p + v * dt;
          // הכוכב השכן (דמוי שמש): גם האור שלו מתעקם, ולפעמים רואים אותו פעמיים
          vec3 ds = p - uStar, seg = pn - p;
          float s = clamp(-dot(ds, seg) / dot(seg, seg), 0.0, 1.0);
          float dStar = length(ds + seg * s);
          col += trans * vec3(1.0, 0.85, 0.55) * exp(-dStar * dStar * 3.0) * length(seg) * 0.35;
          if (dStar < STAR_R) { col += trans * vec3(1.6, 1.35, 0.95); trans = 0.0; break; }
          if (p.y * pn.y < 0.0) {
            vec3 q = mix(p, pn, p.y / (p.y - pn.y));
            vec4 d = disk(q, normalize(v));
            col += trans * d.rgb * d.a;
            trans *= 1.0 - d.a;
            if (trans < 0.02) break;
          }
          p = pn;
          if (dot(p, p) > R_OUT * R_OUT && dot(p, v) > 0.0) break;
        }
        if (!fell && trans > 0.0) col += trans * sky(normalize(mix(v, dir, edgeK)));
        gl_FragColor = vec4(col, uOpacity);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BH_R, 64, 32), mat);
  mesh.visible = false;
  mesh.frustumCulled = false;
  g.add(mesh);
  return { mesh, mat };
})();

const bhTmp = new THREE.Matrix4();
function updateBlackHole(dt) {
  bhMix = stepFade('bh', bhTarget, 2, 1.5, dt);
  blackHole.mesh.visible = bhMix > 0.001;
  if (!blackHole.mesh.visible) return;
  const u = blackHole.mat.uniforms;
  const t = performance.now() / 1000;
  u.uOpacity.value = bhMix;
  u.uTime.value = t;
  blackHole.mesh.updateMatrixWorld();
  u.uCam.value.copy(camera.position);
  blackHole.mesh.worldToLocal(u.uCam.value);
  u.uToWorld.value.setFromMatrix4(blackHole.mesh.matrixWorld).multiplyScalar(1 / BH_RS);
  // מפת השמיים של שביל החלב, והסיבוב מכיוון בעולם לכיוון על המפה (ההפך מהסיבוב של הכדור הגדול)
  u.uDome.value = milky.skyDome.material.map;
  u.uDomeRot.value.setFromMatrix4(bhTmp.makeRotationFromQuaternion(milky.skyDome.quaternion).transpose());
  // הכוכב השכן מקיף את החור (באמת פעם בחצי שנה, ובמרחק גדול בהרבה)
  const a = t * 0.35;
  u.uStar.value.set(Math.cos(a) * 19, Math.sin(a) * 2.5, Math.sin(a) * 19);
}

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
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true }));
  scene.add(pts);
  return pts;
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
    beltChip.innerHTML = '<span class="ball-emoji" aria-hidden="true">🪨</span><span>' + tt('אסטרואידים', 'Asteroids') + '</span>';
    beltChip.addEventListener('click', () => userSelect(belt));
    $('chooser').appendChild(beltChip);
    belt.chip = beltChip;
  }
}
{
  const cometChip = document.createElement('button');
  cometChip.type = 'button';
  cometChip.className = 'chip';
  cometChip.innerHTML = '<span class="ball-emoji" aria-hidden="true">☄️</span><span>' + tt('שביטים', 'Comets') + '</span>';
  cometChip.addEventListener('click', () => userSelect(cometsInfo));
  $('chooser').appendChild(cometChip);
  cometsInfo.chip = cometChip;
  const galaxyChip = document.createElement('button');
  galaxyChip.type = 'button';
  galaxyChip.className = 'chip';
  galaxyChip.innerHTML = '<span class="ball-emoji" aria-hidden="true">🌀</span><span>' + tt('טסים בחלל', 'Flying through space') + '</span>';
  galaxyChip.addEventListener('click', () => userSelect(galaxyInfo));
  $('chooser').appendChild(galaxyChip);
  galaxyInfo.chip = galaxyChip;
  const bhChip = document.createElement('button');
  bhChip.type = 'button';
  bhChip.className = 'chip';
  bhChip.innerHTML = '<span class="ball-emoji" aria-hidden="true">⚫</span><span>' + tt('חור שחור', 'Black hole') + '</span>';
  bhChip.addEventListener('click', () => userSelect(blackHoleInfo));
  $('chooser').appendChild(bhChip);
  blackHoleInfo.chip = bhChip;
  const milkyChip = document.createElement('button');
  milkyChip.type = 'button';
  milkyChip.className = 'chip';
  milkyChip.innerHTML = '<span class="ball-emoji" aria-hidden="true">🌌</span><span>' + tt('שביל החלב', 'Milky Way') + '</span>';
  milkyChip.addEventListener('click', () => userSelect(milkyInfo));
  $('chooser').appendChild(milkyChip);
  milkyInfo.chip = milkyChip;
}
{
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.innerHTML = '<span class="ball-emoji" aria-hidden="true">📖</span><span>' + tt('מילון', 'Glossary') + '</span>';
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
  if (d < 1) {
    const h = Math.max(1, Math.round(d * 24));
    text = tt(`כל שנייה = ${h} שעות`, `${h} ${h === 1 ? 'hour' : 'hours'} per second`);
  } else if (d < 60) {
    const n = Math.round(d);
    text = tt(`כל שנייה = ${n} ימים`, `${n} ${n === 1 ? 'day' : 'days'} per second`);
  } else {
    const m = (d / 30.44).toFixed(d < 300 ? 1 : 0);
    text = tt(`כל שנייה = ${m} חודשים`, `${m} months per second`);
  }
  $('speed-label').textContent = timeRuns() ? text : tt('הזמן עצר', 'Time is paused');
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

$('speed').addEventListener('input', (e) => {
  daysPerSecond = sliderToSpeed(+e.target.value);
  showSpeed = null; // המשתמש הזיז את המהירות – היא גוברת על ההדגמה
  updateSpeedLabel();
});
$('btn-play').addEventListener('click', () => {
  playing = !playing;
  $('btn-play').textContent = playing ? '⏸' : '▶';
  $('btn-play').title = playing ? tt('עצירת הזמן', 'Pause time') : tt('הפעלת הזמן', 'Resume time');
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
  } else if (body.isBlackHole) {
    // מהצד של השמש, קצת מעל טבעת הגז – כמו הצילום המפורסם מהסרט
    const z = GAL_CENTRE_DIR.clone().negate();
    offset = z.multiplyScalar(50 * BH_RS).addScaledVector(body.group.up.clone().applyQuaternion(body.group.quaternion), 1.6 * BH_RS);
    if (camera.aspect < 1) offset.multiplyScalar(1.35);
  } else if (body.isMilky) {
    // מלמעלה ובזווית, כשהצד של השמש קרוב יותר אלינו
    const toSun = galaxyGroup.position.clone().negate().normalize();
    offset = GAL_POLE.clone().multiplyScalar(GAL_R * 2.4).addScaledVector(toSun, GAL_R * 1.15).multiplyScalar(camera.aspect < 1 ? 2.1 : 1);
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
  // הטיסה: המרחק מהמצלמה למה שמסתכלים עליו משתנה בקצב קבוע ב"סדרי גודל" (לוגריתמי) – כמו זום –
  // ואם הדרך ארוכה, המצלמה קודם מתרחקת כדי לראות גם את נקודת ההתחלה וגם את היעד, ואז מתקרבת.
  // כך גם טיסה מכוכב לכת אל שביל החלב (פי אלפים במרחק) נראית רציפה, בלי "נפילה" פתאומית בסוף.
  const toTarget = body ? body.group.position.clone() : new THREE.Vector3();
  const toPos = body ? toTarget.clone().add(offset) : pose ? pose() : overviewPosition();
  const r0 = Math.max(1e-3, from.pos.distanceTo(from.target)), r1 = Math.max(1e-3, toPos.distanceTo(toTarget));
  const travel = from.target.distanceTo(toTarget);
  const rPeak = Math.max(r0, r1, travel * 0.7);
  const la = Math.log(r0), lb = Math.log(r1);
  // נקודת הביקורת של עקומת בזייה (ריבועית) בסולם הלוגריתמי: באמצע הדרך המרחק מגיע בערך ל־rPeak
  const lc = rPeak > Math.max(r0, r1) * 1.05 ? 2 * Math.log(rPeak) - (la + lb) / 2 : (la + lb) / 2;
  const logR = (e) => (1 - e) ** 2 * la + 2 * e * (1 - e) * lc + e * e * lb;
  // נקודת המבט זזה מהר כשרחוקים ולאט כשקרובים (כך שעל המסך היא זזה בקצב אחיד)
  const cum = [0];
  for (let i = 1; i <= 64; i++) cum.push(cum[i - 1] + Math.exp(logR((i - 0.5) / 64)));
  const along = cum.map((v) => v / cum[64]);
  const zoom = Math.abs(lb - la) + 2 * (lc - (la + lb) / 2);
  tween = {
    from, offset, body, pose, t: 0, e: 0, logR, along,
    milky: body === milkyInfo || followBody === milkyInfo,
    avoid: Math.min(sizeOf(sun) * 5, toPos.length() * 0.9),
    dir0: from.pos.clone().sub(from.target).divideScalar(r0),
    duration: duration ?? Math.min(4.5, 1.6 + 0.12 * zoom + Math.min(0.8, travel / 1500)),
  };
  followBody = body;
  controls.enabled = false;
  controls.minDistance = body ? sizeOf(body) * 1.6 : 5;
}

const camQ = new THREE.Quaternion(), camQ1 = new THREE.Quaternion(), camDir = new THREE.Vector3();
function updateCamera(dt) {
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / tween.duration);
    const t = tween.t;
    const e = (tween.e = t * t * t * (t * (6 * t - 15) + 10)); // התחלה וסיום רכים מאוד
    const targetPos = tween.body ? tween.body.group.position : ORIGIN;
    const camPos = tween.body ? tmp.copy(targetPos).add(tween.offset) : tween.pose ? tween.pose() : overviewPosition();
    // היעד עשוי לזוז בזמן הטיסה (כוכב לכת מסתובב), ולכן הכיוון והמרחק בסוף מחושבים מחדש בכל פריים
    camDir.subVectors(camPos, targetPos);
    const r1 = Math.max(1e-3, camDir.length());
    camDir.divideScalar(r1);
    camQ1.setFromUnitVectors(tween.dir0, camDir);
    camQ.identity().slerp(camQ1, e);
    const k = e * 64, i = Math.min(63, Math.floor(k));
    const s = tween.along[i] + (tween.along[i + 1] - tween.along[i]) * (k - i);
    controls.target.lerpVectors(tween.from.target, targetPos, s);
    // המרחק: לפי העקומה הלוגריתמית, עם תיקון קטן אם היעד זז מאז תחילת הטיסה
    const r = Math.exp(tween.logR(e)) * (1 + (r1 / Math.exp(tween.logR(1)) - 1) * e);
    camera.position.copy(tween.dir0).applyQuaternion(camQ).multiplyScalar(r).add(controls.target);
    // לא עוברים דרך השמש והזוהר שלה בדרך
    const minR = Math.max(sizeOf(sun) * 2.2, tween.avoid);
    if (camera.position.length() < minR) camera.position.setLength(minR);
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
const labelOrder = () => [...(milkyMix > 0.3 ? [] : bodies), ...(motionMix > 0.3 || milkyMix > 0.3 ? [] : comets)].sort((a, b) => (b === selected) - (a === selected) || b.data.size - a.data.size);

function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  const placed = [];
  if (milkyMix > 0.3) for (const b of [...bodies, ...comets]) b.label.style.display = 'none';
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

// ---------- אופק, הילד שמציג את ההסברים ----------
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

// ממקם את אופק ליד מה שהוא מסביר: כרטיס הפתיחה, חלון ההסבר, או בפינה
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
      y = Math.min(r.bottom, chooserTop()) - ph;
      // אופק עומד בצד של חלון ההסבר שיש בו מקום (בעברית החלון משמאל, באנגלית מימין)
      if (r.right - 6 + pw <= w + 20) {
        x = r.right - 6;
        lookSide = -1;
      } else {
        x = r.left - pw + 6;
        lookSide = 1;
      }
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

// מעבר רך בין השפות: הדף מתעמעם ורק אז עוברים
document.querySelectorAll('a[hreflang]').forEach((a) => a.addEventListener('click', (e) => {
  if (e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  document.body.classList.add('leaving');
  setTimeout(() => { location.href = a.href; }, 350);
}));
$('btn-guide').addEventListener('click', () => {
  guideOn = !guideOn;
  presenterEl.hidden = !guideOn;
  $('btn-guide').setAttribute('aria-pressed', String(guideOn));
  $('btn-guide').textContent = guideOn ? tt('👦 הסתרת אופק המדריך', '👦 Hide Ofek the guide') : tt('👦 הצגת אופק המדריך', '👦 Show Ofek the guide');
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
  $('btn-listen').textContent = on ? tt('⏹ עצירה', '⏹ Stop') : tt('🔊 הקשיבו', '🔊 Listen');
}

$('btn-listen').addEventListener('click', () => {
  hideAsk();
  if (listening) stopSpeaking();
  else speakCurrent();
});

// ---------- מילון מושגים ----------
const LETTER = LANG === 'en' ? /[A-Za-z]/ : /[\u05D0-\u05EA]/;
const isLetter = (ch) => !!ch && LETTER.test(ch);

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
        (LANG === 'en' ? text.slice(i, i + form.length).toLowerCase() === form : text.startsWith(form, i)) && !isLetter(text[i + form.length]) &&
        !(term.notBefore || []).some((w) => text.startsWith(' ' + w, i + form.length)));
    }
    if (!match) {
      plain += text[i++];
      continue;
    }
    const shown = text.slice(i, i + match.form.length); // באנגלית שומרים על האות הגדולה כפי שנכתבה
    if (used.has(match.term.id)) {
      plain += shown;
      i += match.form.length;
      continue;
    }
    if (plain) nodes.push(plain);
    plain = '';
    used.add(match.term.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'term';
    btn.textContent = shown;
    btn.title = tt('מה זה ', 'What is ') + match.term.title + '?';
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
  $('term-kicker').textContent = term.kicker || tt('אופק מסביר מושג', 'Ofek explains');
  $('term-text').replaceChildren(
    ...splitSentences(term.text).flatMap((s) => {
      const span = document.createElement('span');
      span.textContent = s;
      return [span, ' '];
    }),
  );
  $('term-back').textContent = from === 'list' ? tt('חזרה למילון', 'Back to the glossary') : $('panel').hidden ? tt('סגירה', 'Close') : tt('חזרה להסבר', 'Back to the story');
  $('term-card').scrollTop = 0;
  presenter.play('open', 2.4);
  if (voiceOn) speakTerm();
  else narrator.stop();
}

function speakTerm() {
  const spans = [...$('term-text').querySelectorAll('span')];
  termSpeaking = true;
  $('term-listen').textContent = tt('⏹ עצירה', '⏹ Stop');
  narrator.speak(currentTerm.text, {
    onSentence: (i) => spans.forEach((s, j) => s.classList.toggle('speaking', i === j)),
    onEnd: () => {
      spans.forEach((s) => s.classList.remove('speaking'));
      termSpeaking = false;
      $('term-listen').textContent = tt('🔊 שוב', '🔊 Again');
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
// חוזרים מהמושג להסבר הכללי. אם אופק היה באמצע הסבר או סיור, הוא שואל אם להמשיך.
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
// "לא עכשיו": אופק עוצר. בסיור אפשר להמשיך בכפתור "הבא"
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
    $('term-listen').textContent = tt('🔊 שוב', '🔊 Again');
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
  milkyInfo.chip.classList.toggle('active', body === milkyInfo);
  blackHoleInfo.chip.classList.toggle('active', body === blackHoleInfo);
  bhTarget = body === blackHoleInfo ? 1 : 0;
  motionTarget = body === galaxyInfo ? 1 : 0;
  if (body === milkyInfo && milkyMix === 0) milky.holder.rotation.y = Math.PI / 2; // השמש מתחילה במקום האמיתי שלה
  milkyTarget = body === milkyInfo ? 1 : 0;
}

const distFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
function updateLiveDistance() {
  const el = $('panel-live');
  if (!selected?.au || selected.isSun || selected.isBelt || $('panel').hidden) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const million = selected.au.length() * 149.598;
  const text = million >= 1000
    ? tt(`${distFmt.format(million / 1000)} מיליארד ק"מ`, `${distFmt.format(million / 1000)} billion km`)
    : tt(`${distFmt.format(million)} מיליון ק"מ`, `${distFmt.format(million)} million km`);
  if (el.dataset.text !== text) el.textContent = el.dataset.text = tt(`המרחק מהשמש עכשיו: ${text}`, `Distance from the Sun now: ${text}`);
}

$('btn-scale').addEventListener('click', () => {
  endShow();
  scaleTarget = 1 - scaleTarget;
  $('btn-scale').querySelector('span').textContent = scaleTarget ? tt('מרחקים מוקטנים', 'Compact distances') : tt('מרחקים אמיתיים', 'Real distances');
  $('btn-scale').title = scaleTarget ? tt('מעבר למרחקים מוקטנים', 'Switch to compact distances') : tt('מעבר למרחקים אמיתיים', 'Switch to real distances');
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
  if (body === milkyInfo) {
    markActive(milkyInfo);
    presenter.play('open', 2.6);
    flyTo(milkyInfo, 5);
    const d = MILKY_WAY;
    return showPanel({ title: d.name, subtitle: d.subtitle, color: d.color, text: d.narration, facts: d.facts, funFact: d.funFact });
  }
  if (body === blackHoleInfo) {
    markActive(blackHoleInfo);
    presenter.play('open', 2.6);
    flyTo(blackHoleInfo, 7);
    const d = BLACK_HOLE;
    return showPanel({ title: d.name, subtitle: d.subtitle, color: d.color, text: d.narration, facts: d.facts, funFact: d.funFact });
  }
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
    h.textContent = body.moons.length === 1 ? tt('🌙 לחצו כדי לשמוע על הירח:', '🌙 Tap to hear about the moon:') : tt(`🌙 הירחים החשובים של ${d.name}:`, `🌙 The important moons of ${d.name}:`);
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
  h.textContent = tt('☄️ שביטים מפורסמים:', '☄️ Famous comets:');
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

// אופק מסביר על ירח, באותו כרטיס של המושגים
function openMoon(m) {
  if (selected !== m.planet) {
    if (tour) endTour();
    showBody(m.planet);
  }
  openTerm({ ...m.data, kicker: tt(`ירח של ${m.planet.data.name}`, `Moon of ${m.planet.data.name}`) }, 'panel');
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
  $('btn-voice').title = voiceOn ? tt('קריין פועל', 'Narrator on') : tt('קריין כבוי', 'Narrator off');
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
  const voice = narrator.hasRecordings ? tt('הקול של אופק (קבצים מוקלטים)', "Ofek's voice (recorded files)") : tt('קול הדפדפן', 'Browser voice');
  const last = { files: tt('הקול של אופק', "Ofek's voice"), browser: tt('קול הדפדפן', 'Browser voice'), none: tt('בלי קול', 'No voice') }[narrator.status];
  $('voice-status').textContent =
    tt(`קול זמין: ${voice}`, `Available voice: ${voice}`) + (last ? tt(` · הושמע לאחרונה: ${last}`, ` · Last played: ${last}`) : '') + (narrator.lastError ? tt(` · שגיאה: ${narrator.lastError}`, ` · Error: ${narrator.lastError}`) : '');
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
  narrator.speak(splitSentences(TOUR_INTRO[0].narration).slice(0, 2).join(' '));
});

// ---------- סיור מודרך ----------
const tourSteps = [
  ...TOUR_INTRO.map((intro) => ({ intro })),
  ...bodies.flatMap((body) => (body.data.id === 'mars' ? [{ body }, { body: belt }] : [{ body }])),
  { body: cometsInfo },
  { body: galaxyInfo },
  { body: blackHoleInfo },
  { body: milkyInfo },
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
  $('tour-step').textContent = tt(`${tour.index + 1} מתוך ${tourSteps.length}`, `${tour.index + 1} of ${tourSteps.length}`);
  $('tour-prev').disabled = tour.index === 0;
  $('tour-next').textContent = tour.index === tourSteps.length - 1 ? tt('סיום', 'Finish') : tt('הבא ←', 'Next →');

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

// ---------- הפתיחה של הסיור: כל משפט של אופק מפעיל משהו על המסך ----------
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
    ? tt('לא מצאנו במכשיר הזה קול שמדבר עברית, אז ההסברים יופיעו כטקסט בלבד. ' +
        'אפשר להוסיף קול עברי בהגדרות המכשיר (שפה ודיבור), או לנסות בדפדפן כרום.',
      "We couldn't find an English voice on this device, so the explanations will appear as text only. " +
        'You can add an English voice in the device settings (language and speech), or try the Chrome browser.')
    : tt('הדפדפן הזה לא תומך בהקראה, אז ההסברים יופיעו כטקסט בלבד.', 'This browser does not support reading aloud, so the explanations will appear as text only.');
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
  updateMilkyWay(dt);
  updateBlackHole(dt);
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
