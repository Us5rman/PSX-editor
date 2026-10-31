const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const cfg = { v: 2, ultra: false, aa: 'fxaa', res: 1, fps: 60, theme: 'dark', map: 'grid' };
try {
  const saved = JSON.parse(localStorage.getItem('psxviewer') || '{}');
  if (saved.v === 2) Object.assign(cfg, saved);
  else {
    if (saved.theme) cfg.theme = saved.theme === 'forest' ? 'flourite' : saved.theme;
    if (saved.map) cfg.map = saved.map;
  }
} catch (e) { }
function saveCfg() { try { localStorage.setItem('psxviewer', JSON.stringify(cfg)); } catch (e) { } }

let toastTimer = 0;
function toast(text, ms) {
  const el = $('toast');
  clearTimeout(toastTimer);
  if (!text) { el.classList.add('hidden'); return; }
  el.textContent = text;
  el.classList.remove('hidden');
  if (ms) toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
window.addEventListener('error', e => toast('Error: ' + (e.message || 'unknown'), 5000));
window.addEventListener('unhandledrejection', e => toast('Error: ' + ((e.reason && e.reason.message) || e.reason), 5000));

/* renderer and scene */

const haveComposer = !!(THREE.EffectComposer && THREE.RenderPass && THREE.ShaderPass && THREE.CopyShader && THREE.GammaCorrectionShader);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !haveComposer, powerPreference: 'high-performance' });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
const controls = new THREE.OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.8;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.495;

const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 0.9);
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.castShadow = true;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 30 });
key.shadow.mapSize.set(1024, 1024);
const rim = new THREE.DirectionalLight(0x9fb4ff, 0.3);
rim.position.set(-4, 3, -5);
scene.add(hemi, key, key.target, rim);

const groundMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* maps */

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function speckle(x, size, count, hueFn, rMin, rMax) {
  for (let i = 0; i < count; i++) {
    x.fillStyle = hueFn();
    x.beginPath();
    x.arc(Math.random() * size, Math.random() * size, rnd(rMin, rMax), 0, 6.2832);
    x.fill();
  }
}

function groundGrid(size) {
  const c = makeCanvas(size), x = c.getContext('2d');
  x.fillStyle = cssVar('--g1') || '#2b2b31';
  x.fillRect(0, 0, size, size);
  const step = size / 8;
  x.strokeStyle = cssVar('--gl') || '#5c5c68';
  for (let i = 0; i <= 8; i++) {
    x.lineWidth = i % 4 === 0 ? 4 : 1.5;
    x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, size); x.stroke();
    x.beginPath(); x.moveTo(0, i * step); x.lineTo(size, i * step); x.stroke();
  }
  return c;
}

function groundGrass(size) {
  const c = makeCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#3d7b37';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const px = Math.random() * size, py = Math.random() * size, r = rnd(30, 140);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, Math.random() < 0.5 ? 'rgba(30,90,30,0.14)' : 'rgba(110,160,70,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  x.lineWidth = 1.3;
  for (let i = 0; i < 38000; i++) {
    const px = Math.random() * size, py = Math.random() * size;
    x.strokeStyle = 'hsla(' + rnd(80, 125) + ',' + rnd(40, 62) + '%,' + rnd(20, 44) + '%,0.6)';
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + rnd(-3, 3), py - rnd(4, 11)); x.stroke();
  }
  return c;
}

function groundDesert(size) {
  const c = makeCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#d9b77c';
  x.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 16) {
    x.strokeStyle = 'rgba(150,100,50,' + rnd(0.05, 0.14) + ')';
    x.lineWidth = rnd(2, 6);
    x.beginPath();
    const ph = Math.random() * 6, amp = rnd(3, 9);
    for (let px = 0; px <= size; px += 24) x.lineTo(px, y + Math.sin(px / 70 + ph) * amp);
    x.stroke();
  }
  speckle(x, size, 30000, () => 'rgba(' + (140 + Math.random() * 60 | 0) + ',100,60,' + rnd(0.08, 0.3) + ')', 0.6, 1.8);
  return c;
}

function groundSnow(size) {
  const c = makeCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#eef3f8';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 200; i++) {
    const px = Math.random() * size, py = Math.random() * size, r = rnd(40, 160);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(150,175,205,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  speckle(x, size, 25000, () => 'rgba(255,255,255,' + rnd(0.3, 0.9) + ')', 0.6, 1.6);
  return c;
}

function groundConcrete(size) {
  const c = makeCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#8d8e90';
  x.fillRect(0, 0, size, size);
  speckle(x, size, 60000, () => 'rgba(' + (60 + Math.random() * 120 | 0) + ',' + (60 + Math.random() * 120 | 0) + ',' + (60 + Math.random() * 120 | 0) + ',' + rnd(0.1, 0.35) + ')', 0.5, 2);
  x.strokeStyle = 'rgba(40,40,44,0.7)';
  x.lineWidth = 3;
  const step = size / 4;
  for (let i = 0; i <= 4; i++) {
    x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, size); x.stroke();
    x.beginPath(); x.moveTo(0, i * step); x.lineTo(size, i * step); x.stroke();
  }
  x.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) {
    let px = Math.random() * size, py = Math.random() * size, a = Math.random() * 6.28;
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 14; s++) { a += rnd(-0.7, 0.7); px += Math.cos(a) * 12; py += Math.sin(a) * 12; x.lineTo(px, py); }
    x.stroke();
  }
  return c;
}

function groundNeon(size) {
  const c = makeCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#0a0d19';
  x.fillRect(0, 0, size, size);
  const step = size / 8;
  x.shadowColor = '#22d3ee';
  x.shadowBlur = 8;
  x.strokeStyle = '#22d3ee';
  x.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, size); x.stroke();
    x.beginPath(); x.moveTo(0, i * step); x.lineTo(size, i * step); x.stroke();
  }
  x.shadowColor = '#e11d8f';
  x.strokeStyle = '#e11d8f';
  x.lineWidth = 4;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(0, size); x.moveTo(0, 0); x.lineTo(size, 0); x.stroke();
  return c;
}

function groundWet(size) {
  const c = makeCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#14161b';
  x.fillRect(0, 0, size, size);
  speckle(x, size, 20000, () => 'rgba(255,255,255,' + rnd(0.02, 0.07) + ')', 0.6, 1.8);
  x.strokeStyle = '#2b2f3a';
  x.lineWidth = 3;
  const step = size / 4;
  for (let i = 0; i <= 4; i++) {
    x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, size); x.stroke();
    x.beginPath(); x.moveTo(0, i * step); x.lineTo(size, i * step); x.stroke();
  }
  return c;
}

const MAPS = [
  { id: 'grid', name: 'Studio grid', make: groundGrid, rep: 100, rough: 0.85, metal: 0, sun: 0xffffff, hemi: 0.9, fog: [28, 150] },
  { id: 'grass', name: 'Grassland', make: groundGrass, rep: 90, rough: 1, metal: 0, sky: ['#5ea4e8', '#d6eaff'], sun: 0xfff0d2, hemi: 0.85, fog: [30, 170] },
  { id: 'desert', name: 'Desert', make: groundDesert, rep: 90, rough: 1, metal: 0, sky: ['#5c9fdc', '#f4d9ab'], sun: 0xffe2b0, hemi: 0.8, fog: [30, 170] },
  { id: 'snow', name: 'Snowfield', make: groundSnow, rep: 90, rough: 0.8, metal: 0, sky: ['#9bb4cf', '#eef3f8'], sun: 0xeaf2ff, hemi: 1, fog: [20, 120] },
  { id: 'concrete', name: 'Concrete yard', make: groundConcrete, rep: 60, rough: 0.9, metal: 0, sky: ['#76828f', '#c3c8cf'], sun: 0xffffff, hemi: 0.85, fog: [30, 160] },
  { id: 'neon', name: 'Neon night', make: groundNeon, rep: 100, rough: 0.5, metal: 0.2, sky: ['#04020d', '#1a1038'], sun: 0x9aa8ff, hemi: 0.45, fog: [18, 110] },
  { id: 'wet', name: 'Wet tiles', make: groundWet, rep: 60, rough: 0.14, metal: 0.25, sky: ['#0e111a', '#2a2f40'], sun: 0xdde6ff, hemi: 0.5, fog: [22, 130] }
];
const mapTex = {};
let curMap = MAPS[0];

function skyTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, top);
  g.addColorStop(0.6, bottom);
  g.addColorStop(1, bottom);
  x.fillStyle = g;
  x.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function mapSky(m) {
  return m.sky || [cssVar('--sky1') || '#23232b', cssVar('--sky2') || '#4a4a58'];
}

function applyMap(id) {
  curMap = MAPS.find(m => m.id === id) || MAPS[0];
  cfg.map = curMap.id;
  const key2 = curMap.id + (curMap.id === 'grid' ? ':' + cfg.theme : '');
  if (!mapTex[key2]) {
    const t = new THREE.CanvasTexture(curMap.make(curMap.id === 'grass' ? 2048 : 1024));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(curMap.rep, curMap.rep);
    t.anisotropy = maxAniso;
    t.encoding = THREE.sRGBEncoding;
    mapTex[key2] = t;
  }
  groundMat.map = mapTex[key2];
  groundMat.roughness = curMap.rough;
  groundMat.metalness = curMap.metal;
  groundMat.needsUpdate = true;
  const sky = mapSky(curMap);
  if (scene.background && scene.background.dispose) scene.background.dispose();
  scene.background = skyTexture(sky[0], sky[1]);
  scene.fog = new THREE.Fog(new THREE.Color(sky[1]), curMap.fog[0], curMap.fog[1]);
  key.color.setHex(curMap.sun);
  hemi.color.set(sky[0]).lerp(new THREE.Color(0xffffff), 0.5);
  hemi.groundColor.set(sky[1]).multiplyScalar(0.45);
  envDirty = true;
  applyQuality();
  saveCfg();
}

/* quality: ultra, anti-aliasing, resolution */

let envRT = null, envDirty = true;

function rebuildEnv() {
  const sky = mapSky(curMap);
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene();
  const st = skyTexture(sky[0], sky[1]);
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: st, side: THREE.BackSide })));
  const box = (r, g, b, px, py, pz, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide }));
    m.position.set(px, py, pz);
    m.lookAt(0, 0, 0);
    es.add(m);
  };
  box(6, 5.8, 5.5, -18, 16, 22, 16, 9);
  box(1.8, 2, 2.5, 22, 8, 10, 10, 14);
  box(3, 3, 3.4, 4, 12, -26, 18, 6);
  if (envRT) envRT.dispose();
  envRT = pm.fromScene(es, 0.03);
  pm.dispose();
  st.dispose();
  envDirty = false;
}

let composer = null;

function rebuildComposer() {
  composer = null;
  const bloom = cfg.ultra && THREE.UnrealBloomPass;
  if (!haveComposer || (cfg.aa === 'off' && !bloom)) return;
  try {
    const pr = renderer.getPixelRatio();
    const w = Math.max(2, Math.floor(innerWidth * pr)), h = Math.max(2, Math.floor(innerHeight * pr));
    let rt;
    if (cfg.aa === 'msaa' && renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) {
      rt = new THREE.WebGLMultisampleRenderTarget(w, h);
      rt.samples = 4;
    } else {
      rt = new THREE.WebGLRenderTarget(w, h);
    }
    const c = new THREE.EffectComposer(renderer, rt);
    c.setSize(w, h);
    c.addPass(new THREE.RenderPass(scene, camera));
    if (bloom) c.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(w >> 1, h >> 1), 0.2, 0.6, 0.92));
    c.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
    if (cfg.aa === 'fxaa' && THREE.FXAAShader) {
      const f = new THREE.ShaderPass(THREE.FXAAShader);
      f.material.uniforms['resolution'].value.set(1 / w, 1 / h);
      c.addPass(f);
    }
    composer = c;
  } catch (e) {
    console.error(e);
    composer = null;
  }
}

function applyQuality() {
  const u = cfg.ultra;
  renderer.toneMapping = u ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = u ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const size = u ? Math.min(2048, renderer.capabilities.maxTextureSize) : 1024;
  if (key.shadow.mapSize.x !== size) {
    key.shadow.mapSize.set(size, size);
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
  }
  if (u && (envDirty || !envRT)) rebuildEnv();
  scene.environment = u && envRT ? envRT.texture : null;
  hemi.intensity = curMap.hemi * (u ? 0.35 : 1);
  key.intensity = u ? 1.5 : 1.1;
  scene.traverse(o => {
    if (!o.material) return;
    [].concat(o.material).forEach(m => {
      m.needsUpdate = true;
      if ('envMapIntensity' in m) m.envMapIntensity = u ? 1.1 : 1;
    });
  });
  rebuildComposer();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let pr = Math.max(0.4, dpr * cfg.res);
  pr = Math.min(pr, Math.sqrt(8e6 / (w * h)));
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  rebuildComposer();
}

/* model handling */

const player = { root: new THREE.Group(), pos: new V3(), yaw: 0, vy: 0, grounded: true };
scene.add(player.root);
let model = null;
let playing = false;

function disposeTree(o) {
  o.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    [].concat(n.material || []).forEach(m => {
      ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'].forEach(k => {
        if (m[k] && !m[k].userData.keep) m[k].dispose();
      });
      m.dispose();
    });
  });
}

function normalise(inner) {
  const holder = new THREE.Group();
  holder.add(inner);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new V3());
  const s = size.y > 1e-6 ? 1.75 / size.y : 1;
  inner.scale.multiplyScalar(s);
  holder.updateMatrixWorld(true);
  box.setFromObject(inner);
  const c = box.getCenter(new V3());
  inner.position.x -= c.x;
  inner.position.z -= c.z;
  inner.position.y -= box.min.y;
  holder.updateMatrixWorld(true);
  return holder;
}

function facingOf(holder) {
  holder.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert();
  const m = new THREE.Matrix4(), v = new V3();
  let fz = 0, fn = 0, sz = 0, sn = 0;
  holder.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const p = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(p.count / 6000));
    for (let i = 0; i < p.count; i += step) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      if (v.y < 0.1) { fz += v.z; fn++; }
      else if (v.y > 0.3 && v.y < 0.5) { sz += v.z; sn++; }
    }
  });
  if (!fn || !sn) return 1;
  return (fz / fn - sz / sn) >= 0 ? 1 : -1;
}

/* animation */

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();

function limbOf(holder, bone) {
  if (!bone) return null;
  holder.updateMatrixWorld(true);
  const rigQ = holder.getWorldQuaternion(new THREE.Quaternion());
  const parentQ = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  const rel = rigQ.clone().invert().multiply(parentQ).invert();
  return { bone, rest: bone.quaternion.clone(), x: new V3(1, 0, 0).applyQuaternion(rel), y: new V3(0, 1, 0).applyQuaternion(rel) };
}

function pose(l, ax, ay) {
  if (!l) return;
  _qa.setFromAxisAngle(l.x, ax || 0);
  _qb.setFromAxisAngle(l.y, ay || 0);
  _qc.copy(_qb).multiply(_qa);
  l.bone.quaternion.copy(_qc).multiply(l.rest);
}

class RigAnim {
  constructor(holder, parts, F) {
    this.F = F;
    this.phase = 0;
    this.amp = 0;
    this.air = 0;
    const L = this.L = {};
    for (const n of ['thigh', 'calf', 'arm', 'fore']) {
      const p = parts[n] || {};
      L[n + 'L'] = limbOf(holder, p.l);
      L[n + 'R'] = limbOf(holder, p.r);
    }
    L.spine = limbOf(holder, parts.spine);
    L.head = limbOf(holder, parts.head);
    this.pelvis = parts.pelvis && parts.pelvis.isGroup ? parts.pelvis : null;
    this.pelvisY = this.pelvis ? this.pelvis.position.y : 0;
  }
  reset() {
    this.phase = 0; this.amp = 0; this.air = 0;
    Object.values(this.L).forEach(l => { if (l) l.bone.quaternion.copy(l.rest); });
    if (this.pelvis) this.pelvis.position.y = this.pelvisY;
  }
  update(dt, sp, air, t) {
    const L = this.L, F = this.F, f = -F;
    this.amp += (sp - this.amp) * Math.min(1, dt * 8);
    this.air += ((air ? 1 : 0) - this.air) * Math.min(1, dt * 10);
    this.phase += dt * 6.2832 * (0.8 + 0.9 * this.amp) * (this.amp > 0.03 ? 1 : 0);
    const a = this.amp * (1 - this.air), ar = this.air;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    pose(L.thighL, f * (s * 0.75 * a + 0.55 * ar));
    pose(L.thighR, f * (-s * 0.75 * a + 0.55 * ar));
    pose(L.calfL, F * (Math.max(0, c) * 0.9 * a + 0.9 * ar));
    pose(L.calfR, F * (Math.max(0, -c) * 0.9 * a + 0.9 * ar));
    pose(L.armL, f * (-s * 0.55 * a - 0.5 * ar));
    pose(L.armR, f * (s * 0.55 * a - 0.5 * ar));
    pose(L.foreL, f * (0.22 + 0.35 * a + 0.3 * ar));
    pose(L.foreR, f * (0.22 + 0.35 * a + 0.3 * ar));
    const breathe = Math.sin(t * 1.7) * 0.012 * (1 - this.amp);
    pose(L.spine, breathe, s * 0.12 * a);
    pose(L.head, -breathe, -s * 0.08 * a);
    if (this.pelvis) this.pelvis.position.y = this.pelvisY + Math.abs(c) * 0.02 * a;
  }
}

class MixerAnim {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    const find = re => clips.find(c => re.test(c.name));
    this.clips = {
      idle: find(/idle|stand|breath/i) || clips[0],
      walk: find(/walk/i) || find(/run|jog/i) || clips[0],
      run: find(/run|jog|sprint/i) || find(/walk/i) || clips[0]
    };
    this.cur = null;
    this.play('idle');
  }
  play(k) {
    if (this.cur === k) return;
    const next = this.mixer.clipAction(this.clips[k]);
    next.reset().play();
    if (this.curAct) next.crossFadeFrom(this.curAct, 0.25, false);
    this.curAct = next;
    this.cur = k;
  }
  reset() { this.play('idle'); }
  update(dt, sp) {
    this.play(sp < 0.05 ? 'idle' : sp < 0.6 ? 'walk' : 'run');
    this.mixer.update(dt);
  }
}

class BobAnim {
  constructor(holder) { this.h = holder; this.ph = 0; this.amp = 0; }
  reset() { this.ph = 0; this.amp = 0; this.h.position.y = 0; this.h.rotation.z = 0; }
  update(dt, sp, air) {
    this.amp += (sp - this.amp) * Math.min(1, dt * 8);
    this.ph += dt * 9 * (0.5 + this.amp) * (this.amp > 0.03 ? 1 : 0);
    this.h.position.y = Math.abs(Math.sin(this.ph)) * 0.05 * this.amp;
    this.h.rotation.z = Math.sin(this.ph) * 0.04 * this.amp;
  }
}

function findBones(root) {
  const bones = [];
  root.traverse(o => { if (o.isBone) bones.push(o); });
  if (bones.length < 8) return null;
  const skip = /twist|roll|helper|corrective|_ik|ik_|jiggle|cloth|phys|custom|prop|weapon|socket|nub|metacarp|finger|thumb|index|middle|ring|pinky|toe|ball|_end|target|pole/i;
  const side = n => {
    n = n.toLowerCase();
    if (/(^|[^a-z])l([^a-z]|$)|left/.test(n)) return 'l';
    if (/(^|[^a-z])r([^a-z]|$)|right/.test(n)) return 'r';
    return '';
  };
  const pick = (re, sd) => bones.find(b => !skip.test(b.name) && re.test(b.name) && side(b.name) === sd) || null;
  const both = re => ({ l: pick(re, 'l'), r: pick(re, 'r') });
  const parts = {
    thigh: both(/thigh|upleg|up_leg|upperleg|upper_leg|leg_up/i),
    calf: both(/calf|shin|lowerleg|lower_leg|leg_low|(left|right)leg$/i),
    arm: both(/upperarm|upper_arm|uparm|up_arm|arm_up|(left|right)arm$/i),
    fore: both(/lowerarm|lower_arm|forearm|fore_arm|arm_low/i),
    spine: bones.find(b => /spine/i.test(b.name) && !skip.test(b.name)) || null,
    head: bones.find(b => /(^|[^a-z])head$|^head$|mixamorighead$/i.test(b.name)) || null
  };
  const legs = parts.thigh.l && parts.thigh.r, arms = parts.arm.l && parts.arm.r;
  return legs || arms ? parts : null;
}

function showModel(inner, label, clips, parts, kind) {
  if (model) {
    player.root.remove(model.holder);
    disposeTree(model.holder);
    if (model.anim && model.anim.mixer) model.anim.mixer.stopAllAction();
  }
  const holder = normalise(inner);
  const F = facingOf(holder);
  holder.rotation.y = F < 0 ? Math.PI : 0;
  holder.updateMatrixWorld(true);
  player.root.add(holder);
  holder.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.isSkinnedMesh) o.frustumCulled = false; }
  });
  model = { holder, inner, label, kind: kind || 'glb', flipY: kind === 'skeleton' || kind === 'obj', anim: null };
  if (clips && clips.length) model.anim = new MixerAnim(inner, clips);
  else if (parts) model.anim = new RigAnim(holder, parts, 1);
  else {
    const found = findBones(inner);
    model.anim = found ? new RigAnim(holder, found, F) : new BobAnim(holder);
  }
  player.pos.set(0, 0, 0);
  player.yaw = 0;
  player.vy = 0;
  applyPlayer();
  applyQuality();
  resetCamera();
}

let boneTex = null;
function loadSkeleton() {
  if (!boneTex) {
    boneTex = new THREE.CanvasTexture(makeBoneTexture(4096));
    boneTex.encoding = THREE.sRGBEncoding;
    boneTex.wrapS = boneTex.wrapT = THREE.RepeatWrapping;
    boneTex.anisotropy = maxAniso;
    boneTex.userData.keep = true;
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: boneTex, roughness: 0.58, metalness: 0 });
  const root = buildSkeleton(mat);
  showModel(root, 'Skeleton', null, root.userData.parts, 'skeleton');
  cfg.model = 'skeleton';
  saveCfg();
}

/* app storage (IndexedDB) */

let dbp = null;
function openDb() {
  if (!dbp) {
    dbp = new Promise((ok, bad) => {
      const r = indexedDB.open('psxviewer', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => bad(r.error);
    });
  }
  return dbp;
}
async function dbTx(mode, fn) {
  const db = await openDb();
  return new Promise((ok, bad) => {
    const tx = db.transaction('files', mode);
    const rq = fn(tx.objectStore('files'));
    tx.oncomplete = () => ok(rq && rq.result);
    tx.onerror = () => bad(tx.error);
    tx.onabort = () => bad(tx.error);
  });
}
const dbPut = rec => dbTx('readwrite', st => st.add(rec));
const dbDel = id => dbTx('readwrite', st => st.delete(id));
async function dbAll(kind) {
  const all = await dbTx('readonly', st => st.getAll());
  return (all || []).filter(r => r.kind === kind);
}
const sizeText = n => (n / 1048576).toFixed(1) + ' MB';

async function canvasFromBlob(blob, max) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c;
}

async function registerCustomMap(rec) {
  const c = await canvasFromBlob(rec.blob, 2048);
  const m = { id: 'c' + rec.id, name: rec.name, dbId: rec.id, rep: 40, rough: 0.9, metal: 0, sun: 0xffffff, hemi: 0.9, fog: [28, 150], make: () => c };
  MAPS.push(m);
  return m;
}

async function loadCustomMaps() {
  try {
    for (const r of await dbAll('map')) await registerCustomMap(r);
  } catch (e) { console.warn('maps not restored', e); }
}

async function removeCustomMap(m) {
  const i = MAPS.indexOf(m);
  if (i >= 0) MAPS.splice(i, 1);
  if (mapTex[m.id]) { mapTex[m.id].dispose(); delete mapTex[m.id]; }
  try { await dbDel(m.dbId); } catch (e) { }
  if (curMap === m) applyMap('grid');
}

async function applyModelTexture(blob) {
  if (!model) return;
  const c = await canvasFromBlob(blob, 4096);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  tex.flipY = model.flipY;
  model.holder.traverse(o => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach(m => {
      if (!('origMap' in m.userData)) m.userData.origMap = m.map || null;
      m.map = tex;
      if (m.color) m.color.setHex(0xffffff);
      m.needsUpdate = true;
    });
  });
}

function restoreModelTexture() {
  if (!model) return;
  model.holder.traverse(o => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach(m => {
      if ('origMap' in m.userData) { m.map = m.userData.origMap; m.needsUpdate = true; }
    });
  });
}

async function saveModel(f, pick) {
  try {
    const all = await dbAll('model');
    if (all.some(r => r.name === f.name && r.blob.size === f.size)) return;
    await dbPut({ kind: 'model', name: f.name, blob: f, pick: pick || null, added: Date.now() });
  } catch (e) {
    toast('Loaded, but it could not be saved to app storage', 3500);
  }
}

async function loadFile(f, opts) {
  opts = opts || {};
  const ext = f.name.split('.').pop().toLowerCase();
  try {
    let pick = null;
    if (ext === 'pak') {
      const res = await loadPakModel(f, opts.pick);
      if (!res) { toast('', 0); return false; }
      showModel(res.root, res.name, null, null, 'pak');
      pick = res.pick;
      toast('Loaded: ' + res.name + (res.rigged ? '' : ' (no skeleton found)'), 2600);
    } else if (ext === 'glb' || ext === 'gltf') {
      toast('Reading model...');
      const buf = await f.arrayBuffer();
      const gltf = await new Promise((ok, bad) => new THREE.GLTFLoader().parse(buf, '', ok, bad));
      showModel(gltf.scene, f.name, gltf.animations, null, 'glb');
      toast('Loaded: ' + f.name, 2200);
    } else if (ext === 'obj') {
      const g = new THREE.OBJLoader().parse(await f.text());
      g.traverse(o => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0xbdbdc4, roughness: 0.8, side: THREE.DoubleSide }); });
      showModel(g, f.name, null, null, 'obj');
      toast('Loaded: ' + f.name, 2200);
    } else {
      throw new Error('Unsupported file type: .' + ext);
    }
    if (opts.save) await saveModel(f, pick);
    return true;
  } catch (e) {
    console.error(e);
    toast(String(e.message || e), 6000);
    return false;
  }
}

/* player, camera and input */

const cam = { yaw: Math.PI, pitch: 0.28, dist: 4.2 };
const input = { x: 0, y: 0, jump: false };
const keys = {};

function applyPlayer() {
  player.root.position.copy(player.pos);
  player.root.rotation.y = player.yaw;
}

function resetCamera() {
  camera.position.set(player.pos.x, 1.15, player.pos.z + 4.6);
  controls.target.set(player.pos.x, 0.9, player.pos.z);
  controls.update();
}

function inputVec() {
  let x = input.x, y = input.y;
  if (keys.arrowleft || keys.a) x -= 1;
  if (keys.arrowright || keys.d) x += 1;
  if (keys.arrowup || keys.w) y += 1;
  if (keys.arrowdown || keys.s) y -= 1;
  const m = Math.hypot(x, y);
  return m > 1 ? { x: x / m, y: y / m } : { x, y };
}

function setPlay(on) {
  playing = on;
  $('hud').classList.toggle('hidden', !on);
  $('btnPlay').classList.toggle('on', on);
  $('btnPlay').querySelector('span').textContent = on ? 'Stop' : 'Play';
  controls.enabled = !on;
  input.x = input.y = 0;
  if (on) {
    cam.yaw = player.yaw + Math.PI;
    cam.pitch = 0.28;
    cam.dist = 4.2;
    $('settings').classList.add('hidden');
  } else {
    controls.target.set(player.pos.x, 0.9, player.pos.z);
    controls.update();
  }
}

function resetModel() {
  setPlay(false);
  player.pos.set(0, 0, 0);
  player.yaw = 0;
  player.vy = 0;
  player.grounded = true;
  applyPlayer();
  if (model && model.anim) model.anim.reset();
  resetCamera();
  toast('Model reset', 1200);
}

function update(dt, t) {
  let sp = 0;
  if (playing) {
    const v = inputVec();
    const mag = Math.min(1, Math.hypot(v.x, v.y));
    if (mag > 0.08) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      const dx = fx * v.y + rx * v.x, dz = fz * v.y + rz * v.x;
      const speed = 1.5 + 3.4 * mag;
      player.pos.x = clamp(player.pos.x + dx * speed * dt, -95, 95);
      player.pos.z = clamp(player.pos.z + dz * speed * dt, -95, 95);
      const target = Math.atan2(dx, dz);
      let d = target - player.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      player.yaw += d * Math.min(1, dt * 10);
      sp = mag;
    }
    if (input.jump && player.grounded) { player.vy = 5.4; player.grounded = false; }
    input.jump = false;
    if (!player.grounded) {
      player.vy -= 14 * dt;
      player.pos.y += player.vy * dt;
      if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.grounded = true; }
    }
    applyPlayer();
    const tgt = new V3(player.pos.x, player.pos.y + 1.1, player.pos.z);
    const cp = Math.cos(cam.pitch);
    const want = new V3(tgt.x + Math.sin(cam.yaw) * cp * cam.dist, Math.max(0.3, tgt.y + Math.sin(cam.pitch) * cam.dist), tgt.z + Math.cos(cam.yaw) * cp * cam.dist);
    camera.position.lerp(want, 1 - Math.exp(-dt * 12));
    camera.lookAt(tgt);
  } else {
    controls.update();
  }
  if (model && model.anim) model.anim.update(dt, sp, playing && !player.grounded, t);
  key.position.set(player.pos.x + 3.5, 7, player.pos.z + 4.5);
  key.target.position.copy(player.pos);
}

let lastRender = 0, lastInput = 0, simTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const idle = !playing && now - lastInput > 2500;
  const fps = idle ? 30 : cfg.fps;
  if (now - lastRender < 1000 / fps - 3) return;
  const dt = Math.min((now - lastRender) / 1000, 0.05);
  lastRender = now;
  simTime += dt;
  update(dt, simTime);
  if (composer) composer.render(dt); else renderer.render(scene, camera);
}
['pointerdown', 'pointermove', 'wheel', 'keydown'].forEach(n => addEventListener(n, () => { lastInput = performance.now(); }, { passive: true }));

/* touch and keyboard */

let drag = null;
canvas.addEventListener('pointerdown', e => {
  if (!playing) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  cam.yaw -= (e.clientX - drag.x) * 0.006;
  cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.005, -0.15, 1.2);
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = e => { if (drag && e.pointerId === drag.id) drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => { if (playing) cam.dist = clamp(cam.dist + e.deltaY * 0.004, 1.8, 9); }, { passive: true });

const stick = $('stick'), knob = $('knob');
let stickId = null;
function moveStick(e) {
  const r = stick.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  const m = Math.hypot(dx, dy), max = r.width * 0.36;
  if (m > max) { dx *= max / m; dy *= max / m; }
  knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  input.x = dx / max;
  input.y = -dy / max;
}
stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(stickId); moveStick(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) moveStick(e); });
const endStick = e => {
  if (e.pointerId !== stickId) return;
  stickId = null;
  input.x = input.y = 0;
  knob.style.transform = '';
};
stick.addEventListener('pointerup', endStick);
stick.addEventListener('pointercancel', endStick);
$('jump').addEventListener('pointerdown', () => { input.jump = true; });

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === ' ') input.jump = true;
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

/* ui */

const THEMES = [['dark', 'Dark'], ['light', 'Light'], ['midnight', 'Midnight'], ['flourite', 'Flourite'], ['sunset', 'Sunset'], ['rose', 'Rose']];

function applyTheme(name) {
  cfg.theme = name;
  document.documentElement.dataset.theme = name;
  if (curMap.id === 'grid' || curMap.dbId) applyMap(curMap.id);
  saveCfg();
}

function buildSettings() {
  const p = $('settings');
  p.innerHTML = '';
  const h = document.createElement('h3');
  h.textContent = 'Settings';
  p.appendChild(h);

  const sw = document.createElement('div');
  sw.className = 'row switch';
  sw.innerHTML = '<div><span>Ultra graphics</span><small>RTX-style look: reflections, soft shadows, bloom, filmic tone mapping</small></div>';
  const tg = document.createElement('button');
  tg.className = 'tgl' + (cfg.ultra ? ' on' : '');
  tg.onclick = () => {
    cfg.ultra = !cfg.ultra;
    tg.classList.toggle('on', cfg.ultra);
    applyQuality();
    saveCfg();
  };
  sw.appendChild(tg);
  p.appendChild(sw);

  const seg = (label, keyName, opts, onChange) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<label>' + label + '</label>';
    const s = document.createElement('div');
    s.className = 'seg';
    opts.forEach(([val, text]) => {
      const b = document.createElement('button');
      b.textContent = text;
      if (cfg[keyName] === val) b.classList.add('on');
      b.onclick = () => {
        cfg[keyName] = val;
        s.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        onChange();
        saveCfg();
      };
      s.appendChild(b);
    });
    row.appendChild(s);
    p.appendChild(row);
  };
  seg('Anti-aliasing', 'aa', [['off', 'Off'], ['fxaa', 'FXAA'], ['msaa', 'MSAA 4x']], rebuildComposer);
  seg('Resolution', 'res', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.5, '150%'], [2, '200%']], resize);
  seg('Frame rate', 'fps', [[30, '30'], [60, '60']], () => { });

  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = '<label>Theme</label>';
  const s = document.createElement('div');
  s.className = 'seg';
  THEMES.forEach(([id, text]) => {
    const b = document.createElement('button');
    b.textContent = text;
    if (cfg.theme === id) b.classList.add('on');
    b.onclick = () => {
      s.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      applyTheme(id);
    };
    s.appendChild(b);
  });
  row.appendChild(s);
  p.appendChild(row);

  const rb = document.createElement('button');
  rb.className = 'btn';
  rb.textContent = 'Reset model and camera';
  rb.onclick = () => { resetModel(); p.classList.add('hidden'); };
  p.appendChild(rb);

  const note = document.createElement('div');
  note.style.cssText = 'font-size:11px;color:var(--muted);margin-top:10px';
  note.textContent = 'Ultra approximates ray-traced lighting with image-based reflections and soft shadows. True hardware ray tracing is not available inside a WebView. Higher resolution and Ultra use more battery.';
  p.appendChild(note);
}

function openSheet(title) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  const sheetEl = document.createElement('div');
  sheetEl.className = 'sheet';
  const h = document.createElement('h3');
  h.textContent = title;
  sheetEl.appendChild(h);
  const close = () => wrap.remove();
  wrap.appendChild(sheetEl);
  wrap.onclick = e => { if (e.target === wrap) close(); };
  document.body.appendChild(wrap);
  return { sheetEl, close };
}

function sheetItem(sheetEl, label, sub, onClick, onRemove, active, swatch) {
  const b = document.createElement('div');
  b.className = 'item' + (active ? ' on' : '');
  b.setAttribute('role', 'button');
  if (swatch) {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = swatch;
    b.appendChild(sw);
  }
  const g = document.createElement('div');
  g.className = 'grow';
  g.textContent = label;
  if (sub) {
    const sm = document.createElement('small');
    sm.textContent = sub;
    g.appendChild(sm);
  }
  b.appendChild(g);
  if (onRemove) {
    const r = document.createElement('span');
    r.className = 'rm';
    r.textContent = 'Remove';
    r.onclick = e => { e.stopPropagation(); onRemove(); };
    b.appendChild(r);
  }
  b.onclick = onClick;
  sheetEl.appendChild(b);
  return b;
}

async function openModels() {
  const { sheetEl, close } = openSheet('Choose model');
  sheetItem(sheetEl, 'Skeleton', 'Built-in', () => { close(); loadSkeleton(); }, null, model && model.kind === 'skeleton');
  let recs = [];
  try { recs = await dbAll('model'); } catch (e) { }
  recs.forEach(r => sheetItem(sheetEl, r.name, sizeText(r.blob.size), async () => {
    close();
    await loadFile(r.blob instanceof File ? r.blob : new File([r.blob], r.name), { pick: r.pick });
  }, async () => { await dbDel(r.id); close(); openModels(); }));
  sheetItem(sheetEl, 'Add model from files...', '.pak  .glb  .gltf  .obj  (saved to app storage)', () => { close(); $('fileModel').click(); });
}

function openMaps() {
  const { sheetEl, close } = openSheet('Choose map');
  MAPS.forEach(m => {
    const sky = mapSky(m);
    sheetItem(sheetEl, m.name, m.dbId ? 'Custom texture' : '', () => { applyMap(m.id); close(); toast(m.name, 1200); },
      m.dbId ? async () => { await removeCustomMap(m); close(); openMaps(); } : null,
      m.id === curMap.id, 'linear-gradient(' + sky[0] + ',' + sky[1] + ')');
  });
}

let texTarget = 'map';

function openTextures() {
  const { sheetEl, close } = openSheet('Apply texture to');
  sheetItem(sheetEl, 'Map', 'Ground texture, saved as a custom map', () => { close(); openTexList('map'); });
  sheetItem(sheetEl, 'Model', 'Replaces the texture on the current model', () => { close(); openTexList('modeltex'); });
}

async function openTexList(kind) {
  const isMap = kind === 'map';
  const { sheetEl, close } = openSheet(isMap ? 'Map textures' : 'Model textures');
  sheetItem(sheetEl, 'Default', isMap ? 'Back to the studio grid' : 'Restore the original texture', () => {
    close();
    if (isMap) applyMap('grid'); else restoreModelTexture();
  });
  if (isMap) {
    MAPS.filter(m => m.dbId).forEach(m => sheetItem(sheetEl, m.name, 'Saved', () => { applyMap(m.id); close(); }, async () => { await removeCustomMap(m); close(); openTexList(kind); }, m === curMap));
  } else {
    let recs = [];
    try { recs = await dbAll('modeltex'); } catch (e) { }
    recs.forEach(r => sheetItem(sheetEl, r.name, 'Saved', async () => {
      close();
      try { await applyModelTexture(r.blob); toast('Texture applied', 1500); } catch (e) { toast('Could not use that image', 4000); }
    }, async () => { await dbDel(r.id); close(); openTexList(kind); }));
  }
  sheetItem(sheetEl, 'Add image from files...', 'PNG, JPG, WebP (saved to app storage)', () => { close(); texTarget = kind; $('fileImage').click(); });
}

$('fileImage').onchange = async () => {
  const f = $('fileImage').files[0];
  $('fileImage').value = '';
  if (!f) return;
  try {
    const rec = { kind: texTarget, name: f.name, blob: f, added: Date.now() };
    try { rec.id = await dbPut(rec); } catch (e) { rec.id = 't' + Date.now(); toast('Could not save to app storage', 3000); }
    if (texTarget === 'map') {
      const m = await registerCustomMap(rec);
      applyMap(m.id);
      toast('Map texture applied: ' + f.name, 2200);
    } else {
      await applyModelTexture(f);
      toast('Texture applied: ' + f.name, 2200);
    }
  } catch (e) {
    console.error(e);
    toast('Could not use that image', 4000);
  }
};

$('fileModel').onchange = () => {
  const f = $('fileModel').files[0];
  $('fileModel').value = '';
  if (f) loadFile(f, { save: true });
};

$('btnSettings').onclick = () => {
  const p = $('settings');
  if (p.classList.contains('hidden')) { buildSettings(); p.classList.remove('hidden'); } else p.classList.add('hidden');
};
document.addEventListener('pointerdown', e => {
  const p = $('settings');
  if (!p.classList.contains('hidden') && !p.contains(e.target) && !$('btnSettings').contains(e.target)) p.classList.add('hidden');
});
$('btnPlay').onclick = () => setPlay(!playing);
$('btnModel').onclick = openModels;
$('btnTexture').onclick = openTextures;
$('btnMap').onclick = openMaps;

/* start */

document.documentElement.dataset.theme = cfg.theme;
addEventListener('resize', resize);
resize();
const wantedMap = cfg.map;
applyMap('grid');
loadSkeleton();
requestAnimationFrame(frame);
loadCustomMaps().then(() => {
  const m = MAPS.find(x => x.id === wantedMap);
  if (m && m.id !== 'grid') applyMap(m.id);
});
