'use strict';
/* Sonic Driller 3D: the world. Site, FS 250 truck rig with a sonic head, drill string, crew, water truck,
   core table, particles, and the driller's head-look camera. Units are metres; the drilling model is in feet. */
window.WORLD = (() => {
  const FT = 0.3048;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  let renderer, scene, camera, grad, inkMat;
  const matCache = {};

  // the driller stands at the console beside the mast and looks toward the hole at the origin
  const EYE = V(1.7, 1.93, 2.3);
  const BASE_YAW = Math.atan2(EYE.x, EYE.z);
  const look = { yaw: BASE_YAW, pitch: -0.58, tYaw: BASE_YAW, tPitch: -0.58, fov: 72, tFov: 72, base: BASE_YAW, range: 2.9 };
  // the driller can walk over to the core table: where he stands there, and which way he faces
  const TABLE_EYE = V(0.74, 1.72, 4.6), TABLE_YAW = Math.PI + 0.15;
  const camPos = EYE.clone();
  const walk = { on: false, t: 0, dur: 2.4, from: V(), to: V(), table: false, done: null };
  let aspect = 1.6, phone = false, insets = null;
  // tall, narrow screens get a wider lens, so the view from side to side stays about the same
  function effFov(f) { return aspect >= 1.25 ? f : Math.min(118, 2 * Math.atan(Math.tan(f * Math.PI / 360) * 1.25 / aspect) * 180 / Math.PI); }
  const opt = { sens: 1, shake: true };
  // main menu: a drone circles the site. k is how far the view has blended from the driller's eyes (0) to the drone (1)
  const drone = { on: false, k: 0, a: 2.4, done: null };
  const DRONE_AT = V(0.6, 3.6, 1.0), DRONE_R = 17.5, DRONE_H = 9.8;
  const dPos = V(), dQ = new THREE.Quaternion(), fQ = new THREE.Quaternion(), dM = new THREE.Matrix4();
  const sad = { dale: 0, tess: 0 };                 // seconds left of looking at his feet, per helper
  const panic = { t: 0, dur: 0, hit: false };
  const mad = { dale: 0, tess: 0 };                 // seconds left of glaring at the driller, after a Zonnic came his way
  const toss = { on: false, t: 0, dur: 0.6, arc: 0.4, from: V(), to: V(), v: V(), id: '', hit: false, col: 0, mesh: null, state: '', lie: 0 };
  const laughFx = { t: 0, dur: 0 };      // a fumbled connection: a pipe falls over and the helpers run about
  // the well install: js/well.js runs the job and says here what to show (see setWell)
  const wj = { on: false, k: 0, engK: 0, paper: false, carry: false, talk: false, pour: '', rate: 0, pvcTop: 0, pvcLen: 0, strSlot: false, piece: null, cap: false, hold: false, work: false,
    watch: false, cine: false, meK: 0, bendK: 0, spankT: -1, hop: 0, freak: false, burst: 0, burstCol: 0xa49c8a };
  const cine = { on: false, k: 0 };                 // the outside camera for the wrecked-install scene
  const cig = { on: false, len: 1, t: 0, next: 3, drag: 0, exhale: 0, flame: 0, ash: 0, emit: 0 };
  const MAST_Z = -0.42, MAST_H = 10.2;
  const SLIDE_M = 0.85;                 // metres of head side-shift at full left / right
  const UP = V(0, 1, 0);

  // ---------- material + mesh helpers ----------
  function toon(color, extra) {
    if (color && color.isTexture) { const k = 'tex' + color.uuid; return matCache[k] || (matCache[k] = new THREE.MeshToonMaterial({ map: color, gradientMap: grad })); }      // a pattern (see pat) in place of a flat colour
    const key = color + (extra ? JSON.stringify(extra) : '');
    if (!extra && matCache[key]) return matCache[key];
    const m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: grad }, extra || {}));
    if (!extra) matCache[key] = m;
    return m;
  }
  function outline(mesh, t) {
    const g = mesh.geometry; g.computeBoundingBox();
    const s = g.boundingBox.getSize(V()), c = g.boundingBox.getCenter(V());
    const o = new THREE.Mesh(g, inkMat);
    const sx = (s.x + 2 * t) / Math.max(s.x, 1e-4), sy = (s.y + 2 * t) / Math.max(s.y, 1e-4), sz = (s.z + 2 * t) / Math.max(s.z, 1e-4);
    o.scale.set(sx, sy, sz); o.position.set(c.x * (1 - sx), c.y * (1 - sy), c.z * (1 - sz));
    o.raycast = () => {}; o.userData.outline = true;
    mesh.add(o); return mesh;
  }
  function M(geo, color, t, mat) {
    const m = new THREE.Mesh(geo, mat || toon(color));
    m.castShadow = true; m.receiveShadow = true;
    if (t !== 0) outline(m, t == null ? 0.012 : t);
    return m;
  }
  const box = (w, h, d, c, t) => M(new THREE.BoxGeometry(w, h, d), c, t);
  const cyl = (rt, rb, h, c, t, seg) => M(new THREE.CylinderGeometry(rt, rb, h, seg || 16), c, t);
  const sph = (r, c, t, ws, hs) => M(new THREE.SphereGeometry(r, ws || 16, hs || 12), c, t);
  const cap = (r, len, c, t) => M(new THREE.CapsuleGeometry(r, len, 6, 12), c, t);
  function put(o, x, y, z, parent) { o.position.set(x, y, z); (parent || scene).add(o); return o; }
  function canvasTex(w, h, draw) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function rnd(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

  // ---------- scene objects we animate ----------
  const R = {};   // references
  let parts = [], smoke = [];
  let ptsGeo, ptsMesh, smkGeo, smkMesh;

  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfe3f5);
    scene.fog = new THREE.Fog(0xd6eef8, 70, 300);
    camera = new THREE.PerspectiveCamera(64, 1, 0.05, 900);
    camera.rotation.order = 'YXZ';
    camera.position.copy(EYE);
    grad = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
    inkMat = new THREE.MeshBasicMaterial({ color: 0x2a2320, side: THREE.BackSide });

    scene.add(new THREE.HemisphereLight(0xe3f3ff, 0x7a9a5a, 1.15));
    const sun = new THREE.DirectionalLight(0xfff1d8, 1.9);
    sun.position.set(14, 22, 12); sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
    sun.shadow.bias = -0.0005;
    scene.add(sun); R.sun = sun;

    buildSky(); buildGround(); buildScenery(); buildTruck(); buildMast(); buildHead(); buildString();
    buildWaterTruck(); buildPipeYard(); buildTable(); buildCrew(); buildDriller(); buildMe(); buildParticles(); buildCig();
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    const cv = renderer.domElement;
    const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect; camera.fov = effFov(look.fov); camera.updateProjectionMatrix();
    if (R.cig) setCigLift();
  }

  // ---------- sky, ground, scenery ----------
  function buildSky() {
    const g = new THREE.SphereGeometry(500, 32, 16);
    const col = [], pos = g.attributes.position;
    const top = new THREE.Color(0x5fb2e6), hor = new THREE.Color(0xe4f4fb);
    for (let i = 0; i < pos.count; i++) { const k = clamp(pos.getY(i) / 300, 0, 1); const c = hor.clone().lerp(top, Math.pow(k, 0.7)); col.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
    const sunTex = canvasTex(128, 128, (c) => { c.fillStyle = '#ffd84d'; c.beginPath(); c.arc(64, 64, 40, 0, 7); c.fill(); c.strokeStyle = '#2a2320'; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#f6c945'; c.lineWidth = 7; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); c.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); c.stroke(); } });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false }));
    s.scale.set(40, 40, 1); s.position.set(180, 240, 160); scene.add(s);
    R.clouds = [];
    const r = rnd(11);
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) put(sph(3 + r() * 3, 0xffffff, 0.4, 12, 8), j * 3.6 - n * 1.8, r() * 2, r() * 2, c);
      const a = r() * Math.PI * 2, d = 120 + r() * 140;
      c.position.set(Math.cos(a) * d, 40 + r() * 35, Math.sin(a) * d);
      c.userData.speed = 0.6 + r();
      scene.add(c); R.clouds.push(c);
    }
  }

  function buildGround() {
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), toon(0x7db552));
    grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
    const dirtTex = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#a5845c'; c.fillRect(0, 0, w, h);
      const r = rnd(5);
      for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? 'rgba(80,58,35,0.25)' : 'rgba(255,235,200,0.18)'; c.beginPath(); c.arc(r() * w, r() * h, 1 + r() * 3, 0, 7); c.fill(); }
      c.strokeStyle = 'rgba(70,50,30,0.25)'; c.lineWidth = 6;
      for (let i = 0; i < 14; i++) { c.beginPath(); c.moveTo(r() * w, 0); c.lineTo(r() * w, h); c.stroke(); }
    });
    dirtTex.wrapS = dirtTex.wrapT = THREE.RepeatWrapping; dirtTex.repeat.set(3, 4);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(1, 48), toon(0xffffff, { map: dirtTex }));
    pad.rotation.x = -Math.PI / 2; pad.scale.set(11, 14, 1); pad.position.set(-1.5, 0.012, 0); pad.receiveShadow = true; scene.add(pad);
    R.puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x6b7f86, transparent: true, opacity: 0.85 }));
    R.puddle.rotation.x = -Math.PI / 2; R.puddle.position.set(0.15, 0.022, 0.35); R.puddle.scale.set(0.01, 0.01, 1); scene.add(R.puddle);
    const mud = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshBasicMaterial({ color: 0x5b4330 }));
    mud.rotation.x = -Math.PI / 2; mud.position.set(0, 0.018, 0); scene.add(mud);
  }

  function tree(x, z, s, kind) {
    const g = new THREE.Group();
    put(cyl(0.18 * s, 0.25 * s, 1.6 * s, 0x6d4c30, 0.05), 0, 0.8 * s, 0, g);
    if (kind) { put(M(new THREE.ConeGeometry(1.5 * s, 3.2 * s, 9), 0x3f7f45, 0.06), 0, 2.7 * s, 0, g); put(M(new THREE.ConeGeometry(1.15 * s, 2.5 * s, 9), 0x4c9150, 0.06), 0, 3.9 * s, 0, g); }
    else { put(sph(1.5 * s, 0x5f9e45, 0.06), 0, 2.7 * s, 0, g); put(sph(1.0 * s, 0x6aac4d, 0.05), 0.9 * s, 2.2 * s, 0.4 * s, g); }
    g.position.set(x, 0, z); scene.add(g); return g;
  }
  function buildScenery() {
    const r = rnd(21);
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 22 + r() * 70;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      tree(x, z, 0.8 + r() * 0.9, r() < 0.55);
    }
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + 0.3, d = 190 + (i % 3) * 30;
      const h = M(new THREE.SphereGeometry(1, 24, 12), [0x9cca72, 0x8fbf66, 0xa9d27e][i % 3], 0);
      h.scale.set(70 + (i % 4) * 20, 26 + (i % 3) * 12, 60); h.position.set(Math.cos(a) * d, -6, Math.sin(a) * d); h.castShadow = false; scene.add(h);
    }
    // site trailer and a portable toilet behind the driller
    const tr = new THREE.Group();
    put(box(6, 2.4, 2.4, 0xf1ede2), 0, 1.6, 0, tr);
    put(box(0.9, 1.9, 0.08, 0x7b8a99), -1.5, 1.35, 1.22, tr);
    put(box(1.1, 0.7, 0.06, 0x8fd0ef, 0.008), 1.2, 1.9, 1.22, tr);
    put(box(5.6, 0.25, 2.2, 0x55595d), 0, 0.3, 0, tr);
    for (const x of [-2, 2]) put(cyl(0.35, 0.35, 0.3, 0x2f3133, 0.02), x, 0.35, 1.0, tr).rotation.x = Math.PI / 2;
    const sign = canvasTex(512, 128, (c) => { c.fillStyle = '#1f4e7a'; c.fillRect(0, 0, 512, 128); c.fillStyle = '#fff'; c.font = '700 54px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SITE OFFICE', 256, 66); });
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: sign })); sg.position.set(0.6, 2.55, 1.215); tr.add(sg);
    tr.position.set(10.5, 0, 5.5); tr.rotation.y = -0.55; scene.add(tr);
    const pt = new THREE.Group();
    put(box(1.1, 2.2, 1.1, 0x2e78c7), 0, 1.1, 0, pt); put(box(1.15, 0.12, 1.15, 0xeef2f5), 0, 2.26, 0, pt);
    put(box(0.6, 1.6, 0.04, 0x245f9e, 0.006), 0, 1.0, 0.57, pt);
    pt.position.set(8, 0, -2.5); pt.rotation.y = -1.2; scene.add(pt);
    for (const [x, z] of [[2.9, 0.4], [0.2, 7.4], [3.6, -1.6], [-3.4, -1.5]]) {
      const cone = new THREE.Group();
      put(M(new THREE.ConeGeometry(0.17, 0.5, 14), 0xff7a1a, 0.012), 0, 0.27, 0, cone);
      put(cyl(0.12, 0.135, 0.07, 0xffffff, 0), 0, 0.3, 0, cone);
      put(box(0.36, 0.03, 0.36, 0x2b2b2b, 0.006), 0, 0.015, 0, cone);
      cone.position.set(x, 0, z); scene.add(cone);
    }
  }

  // ---------- FS 250 truck rig ----------
  const GREEN = 0x6f9e5a, GREEN_D = 0x587f47, STEEL = 0xcfd4d8, DARK = 0x3a3f43, RED = 0xc62828;
  function buildTruck() {
    const rig = new THREE.Group(); scene.add(rig); R.rig = rig;
    // chassis and wheels (6x6)
    put(box(0.95, 0.32, 9.2, DARK), 0, 0.98, -4.9, rig);
    R.wheels = [];
    for (const z of [-8.35, -3.95, -2.55]) for (const x of [-1.08, 1.08]) {
      const w = new THREE.Group();
      const t = cyl(0.56, 0.56, 0.44, 0x2a2c2e, 0.015, 24); t.rotation.z = Math.PI / 2; w.add(t);
      const hub = cyl(0.26, 0.26, 0.46, 0xb9bec2, 0.01, 12); hub.rotation.z = Math.PI / 2; w.add(hub);
      put(w, x, 0.56, z, rig);
    }
    // cab (white, orange stripe)
    put(box(2.5, 2.05, 2.15, 0xf3f1ea), 0, 2.08, -8.25, rig);
    put(box(2.52, 0.14, 2.17, 0xf28c28, 0), 0, 1.6, -8.25, rig);
    put(box(2.2, 0.85, 0.06, 0x2c4f6e, 0.01), 0, 2.45, -9.33, rig);
    for (const x of [-1.26, 1.26]) put(box(0.06, 0.7, 1.1, 0x2c4f6e, 0.008), x, 2.5, -8.0, rig);
    put(box(1.6, 0.5, 0.08, 0x3a3f43, 0.01), 0, 1.4, -9.34, rig);
    put(box(2.55, 0.28, 0.32, 0x8a9096), 0, 0.92, -9.35, rig);
    for (const x of [-0.95, 0.95]) put(sph(0.12, 0xfff3c2, 0.01), x, 1.38, -9.36, rig);
    R.beacons = [];
    for (const x of [-0.6, 0.6]) { const b = sph(0.13, 0xc98a2b, 0.01); put(b, x, 3.17, -8.0, rig); R.beacons.push(b); }
    // drilling deck and power pack (Fraste green)
    put(box(2.5, 0.2, 6.25, GREEN), 0, 1.25, -3.85, rig);
    put(box(2.35, 1.65, 2.9, GREEN), 0, 2.18, -5.45, rig);
    for (let i = 0; i < 6; i++) for (const x of [-1.18, 1.18]) put(box(0.04, 1.05, 0.12, 0x2d3a28, 0), x, 2.2, -6.55 + i * 0.4, rig);
    put(cyl(0.11, 0.11, 1.5, 0x6b6f73, 0.01), 0.85, 3.6, -6.55, rig);
    put(cyl(0.14, 0.14, 0.1, 0x4e5256, 0.01), 0.85, 4.38, -6.55, rig);
    put(box(0.95, 0.95, 1.3, GREEN_D), -0.72, 1.82, -3.25, rig);
    put(box(0.08, 0.5, 0.2, 0xcfe8ef, 0.006), -0.24, 1.85, -3.25, rig);
    for (const x of [-1.15, 1.15]) put(box(0.25, 0.45, 1.6, GREEN_D), x, 1.0, -3.25, rig);
    // deck pipe tray with spare casing
    for (let i = 0; i < 4; i++) { const p = cyl(0.085, 0.085, 3.0, 0x7d8790, 0.008, 14); p.rotation.x = Math.PI / 2; put(p, -0.95 + i * 0.19, 1.45, -2.2, rig); }
    // rear jacks (outriggers)
    for (const z of [-1.05, -6.85]) for (const x of [-1.32, 1.32]) {
      put(cyl(0.09, 0.09, 1.2, 0xe2b33a, 0.01), x, 0.75, z, rig);
      put(box(0.45, 0.08, 0.45, DARK, 0.01), x, 0.04, z, rig);
    }
    put(box(2.5, 0.25, 0.55, GREEN_D), 0, 1.25, -0.95, rig);
    // FS 250 badge on the power pack
    const badge = canvasTex(512, 128, (c) => { c.fillStyle = '#587f47'; c.fillRect(0, 0, 512, 128); c.fillStyle = '#f4f1e6'; c.font = '800 82px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FS 250 SONIC', 256, 68); });
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.37), new THREE.MeshBasicMaterial({ map: badge }));
    bm.rotation.y = Math.PI / 2; bm.position.set(1.181, 2.7, -5.4); rig.add(bm);
  }

  function buildMast() {
    const rig = R.rig;
    const mast = new THREE.Group(); rig.add(mast); R.mast = mast;
    for (const x of [-0.27, 0.27]) put(box(0.14, MAST_H, 0.16, STEEL), x, MAST_H / 2, MAST_Z, mast);
    put(box(0.44, MAST_H, 0.06, 0x8f969c, 0.008), 0, MAST_H / 2, MAST_Z - 0.1, mast);
    for (let y = 0.6; y < MAST_H - 0.3; y += 0.75) {
      const b = box(0.62, 0.05, 0.05, 0x9aa1a7, 0.006); put(b, 0, y, MAST_Z - 0.06, mast);
    }
    put(box(1.0, 0.38, 0.75, GREEN), 0, MAST_H + 0.15, MAST_Z, mast);
    const sh = cyl(0.22, 0.22, 0.12, 0xe6e8ea, 0.01, 20); sh.rotation.x = Math.PI / 2; put(sh, 0, MAST_H + 0.42, MAST_Z + 0.3, mast);
    put(box(1.0, 0.1, 1.0, DARK), 0, 0.05, MAST_Z, mast);
    // raise cylinders
    for (const x of [-0.45, 0.45]) {
      const a = V(x, 1.45, -2.6), b = V(x * 0.7, 4.4, MAST_Z - 0.12);
      const len = a.distanceTo(b), c = cyl(0.07, 0.07, len, 0xe2b33a, 0.01);
      c.position.copy(a).add(b).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      mast.add(c);
    }
    // winch line and hoist plug (used on trips)
    R.line = cyl(0.012, 0.012, 1, 0x3c3f42, 0, 6); scene.add(R.line);
    R.plug = cyl(0.07, 0.07, 0.16, 0xe0b040, 0.01); scene.add(R.plug);
  }

  function buildHead() {
    const g = new THREE.Group(); R.head = g; R.rig.add(g);
    put(box(0.72, 1.05, 0.12, 0x8a9096), 0, 0.95, MAST_Z + 0.12, g);
    // the body shakes (headBody) and tilts out about its middle (tiltG); the group origin is the spindle thread
    const shake = new THREE.Group(); g.add(shake); R.headBody = shake;
    const tiltG = new THREE.Group(); tiltG.position.set(0, 0.9, 0); shake.add(tiltG); R.tiltG = tiltG;
    const body = new THREE.Group(); body.position.set(0, -0.55, 0); tiltG.add(body);
    put(box(0.66, 0.74, 0.66, RED), 0, 0.56, 0, body);
    put(cyl(0.27, 0.3, 0.22, RED, 0.012, 24), 0, 1.04, 0, body);
    for (const x of [-0.42, 0.42]) { const mo = cyl(0.11, 0.11, 0.32, 0x2b2f33, 0.01); mo.rotation.z = Math.PI / 2; put(mo, x, 0.62, 0.05, body); }
    put(box(0.5, 0.18, 0.04, 0x9b1d1d, 0.006), 0, 0.3, 0.34, body);
    put(cyl(0.065, 0.065, 0.56, 0x9aa1a7, 0.01), 0, -0.07, 0, body);
    put(cyl(0.075, 0.075, 0.1, 0x6f777e, 0.008), 0, -0.3, 0, body);
    put(cyl(0.065, 0.065, 0.2, 0x5b6e86, 0.01), 0, 1.24, 0, body);
    const decal = canvasTex(256, 128, (c) => { c.fillStyle = '#c62828'; c.fillRect(0, 0, 256, 128); c.fillStyle = '#fff4e6'; c.font = '800 70px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SONIC', 128, 68); });
    for (const [rx, x, z] of [[Math.PI / 2, 0.331, 0], [0, 0, 0.331]]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: decal }));
      d.rotation.y = rx; d.position.set(x, 0.62, z); body.add(d);
    }
    R.hoses = new THREE.Group(); R.rig.add(R.hoses); R.hoseKey = '';
    R.hoseMat = toon(0x1f2224);
  }

  function stripeTex(c1, c2) {
    const t = canvasTex(64, 64, (c) => { c.fillStyle = c1; c.fillRect(0, 0, 64, 64); c.fillStyle = c2; for (let i = -64; i < 128; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 14, 0); c.lineTo(i + 14 - 64, 64); c.lineTo(i - 64, 64); c.closePath(); c.fill(); } });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function buildString() {
    R.casTex = stripeTex('#7d8790', '#6a737c');
    R.rodTex = stripeTex('#d4d8dc', '#b5bbc1');
    R.casing = M(new THREE.CylinderGeometry(0.085, 0.085, 1, 20), 0, 0.008, toon(0xffffff, { map: R.casTex })); scene.add(R.casing);
    R.collar = cyl(0.1, 0.1, 0.09, 0x646d76, 0.008, 20); scene.add(R.collar);
    R.rods = M(new THREE.CylinderGeometry(0.045, 0.045, 1, 14), 0, 0.006, toon(0xffffff, { map: R.rodTex })); scene.add(R.rods);
    R.barrel = cyl(0.058, 0.058, 1, 0xbcc3c9, 0.007); scene.add(R.barrel);
    R.shoe = cyl(0.062, 0.062, 0.08, 0xf07d1a, 0.006); scene.add(R.shoe);
    // tool joints on the rod string, so you can see a connection come up into the clamps
    R.jcol = [];
    for (let i = 0; i < 4; i++) { const j = cyl(0.058, 0.058, 0.16, 0x4f6f8f, 0.006, 14); scene.add(j); R.jcol.push(j); }
    // a single joint on the head or standing in the top clamp, and a 20 ft stand on the winch
    R.singleCas = cyl(0.085, 0.085, 1, 0x7d8790, 0.008, 18); scene.add(R.singleCas);
    R.singleRod = cyl(0.045, 0.045, 1, 0xd4d8dc, 0.006, 12); scene.add(R.singleRod);
    R.stand = cyl(0.045, 0.045, 1, 0xd4d8dc, 0.006, 12); scene.add(R.stand);
    R.standCol = cyl(0.058, 0.058, 0.16, 0x4f6f8f, 0.006, 14); scene.add(R.standCol);

    // clamp table over the hole: bottom (holding) clamp and top (break-out) clamp
    const tb = new THREE.Group(); scene.add(tb); R.clamp = tb;
    const hz = canvasTex(256, 64, (c) => { c.fillStyle = '#2b2b2b'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#f2b630'; for (let x = -64; x < 300; x += 40) { c.beginPath(); c.moveTo(x, 64); c.lineTo(x + 20, 64); c.lineTo(x + 44, 0); c.lineTo(x + 24, 0); c.closePath(); c.fill(); } });
    put(M(new THREE.BoxGeometry(1.1, 0.2, 0.75), 0, 0.012, toon(0xffffff, { map: hz })), 0, 0.12, -0.08, tb);
    for (const x of [-0.47, 0.47]) put(box(0.1, 0.95, 0.12, DARK), x, 0.66, -0.34, tb);
    for (const x of [-0.36, 0.36]) put(box(0.3, 0.07, 0.5, 0x596067, 0.008), x, 0.5, -0.1, tb);
    R.bJawL = put(box(0.17, 0.17, 0.3, 0xf2b630, 0.01), -0.3, 0.61, 0, tb);
    R.bJawR = put(box(0.17, 0.17, 0.3, 0xf2b630, 0.01), 0.3, 0.61, 0, tb);
    put(box(1.04, 0.07, 0.12, DARK, 0.008), 0, 0.86, -0.34, tb);
    const tc = new THREE.Group(); tc.position.set(0, 0.975, 0); tb.add(tc); R.tcG = tc;
    R.tJawL = put(box(0.15, 0.15, 0.26, 0xf07d1a, 0.01), -0.28, 0, 0, tc);
    R.tJawR = put(box(0.15, 0.15, 0.26, 0xf07d1a, 0.01), 0.28, 0, 0, tc);
    put(box(0.86, 0.05, 0.08, 0x8a4a12, 0.006), 0, -0.08, -0.17, tc);
    put(box(0.86, 0.05, 0.08, 0x8a4a12, 0.006), 0, -0.08, 0.17, tc);
    const ram = cyl(0.035, 0.035, 0.5, 0xe6e8ea, 0.006, 10); ram.rotation.z = Math.PI / 2; put(ram, -0.62, -0.02, 0.17, tc);
  }

  // casing rack on the rig with its presenter arm, and the sawhorses where the rods are laid out
  function buildPipeYard() {
    const rig = R.rig;
    // rack: three joints per row, on the right of the driller
    for (const z of [-0.45, -2.6]) {
      put(box(0.95, 0.08, 0.1, DARK), 1.28, 1.39, z, rig);
      put(box(0.08, 0.55, 0.1, DARK), 1.72, 1.62, z, rig);
      put(box(0.08, 0.5, 0.1, DARK), 1.72, 1.12, z, rig);
    }
    R.rackJ = [];
    for (let i = 0; i < 9; i++) {          // up to 80 ft of casing, in rows of three
      const p = cyl(0.085, 0.085, 3.05, 0x7d8790, 0.008, 16); p.rotation.x = Math.PI / 2;
      put(p, 1.12 + (i % 3) * 0.2, 1.52 + Math.floor(i / 3) * 0.18, -1.55, rig); R.rackJ.push(p);
      const c = cyl(0.1, 0.1, 0.1, 0x646d76, 0.006, 16); c.position.y = 1.48; p.add(c);
    }
    // presenter arm: lies along the deck, swings a joint up to vertical beside the mast
    put(box(0.34, 0.3, 0.34, GREEN_D), SLIDE_M, 1.3, -0.12, rig);
    const arm = new THREE.Group(); arm.position.set(SLIDE_M, 1.49, 0); rig.add(arm); R.armG = arm;
    put(box(0.1, 2.7, 0.1, 0xe2b33a), 0.15, 1.35, 0, arm);
    for (const y of [0.55, 2.35]) { put(box(0.3, 0.1, 0.22, DARK, 0.008), 0.05, y, 0, arm); put(box(0.06, 0.16, 0.26, DARK, 0.006), -0.11, y, 0, arm); }
    put(box(0.26, 0.05, 0.26, DARK, 0.008), 0, -0.03, 0, arm);
    R.armCas = cyl(0.085, 0.085, 3.05, 0x7d8790, 0.008, 16); put(R.armCas, 0, 1.525, 0, arm);
    const ac = cyl(0.1, 0.1, 0.1, 0x646d76, 0.006, 16); ac.position.y = 1.48; R.armCas.add(ac);
    // sawhorses on the lead hand side
    for (const z of [1.7, 4.0, 6.3]) {
      const g = new THREE.Group();
      put(box(1.3, 0.09, 0.1, 0xa87b4f), 0, 0.9, 0, g);
      for (const x of [-0.55, 0.55]) for (const dz of [-0.2, 0.2]) { const l = box(0.07, 0.95, 0.07, 0x8a6a45, 0.008); l.rotation.x = dz < 0 ? -0.22 : 0.22; put(l, x, 0.45, dz, g); }
      g.position.set(-1.45, 0, z); scene.add(g);
    }
    R.yardStands = []; R.yardSingles = [];
    for (let i = 0; i < 3; i++) {
      const p = cyl(0.045, 0.045, 6.1, 0xd4d8dc, 0.006, 12); p.rotation.x = Math.PI / 2; put(p, standX(i), 0.99, 3.95);
      const c = cyl(0.058, 0.058, 0.16, 0x4f6f8f, 0.006, 14); p.add(c); R.yardStands.push(p);
    }
    for (let i = 0; i < 2; i++) { const p = cyl(0.045, 0.045, 3.05, 0xd4d8dc, 0.006, 12); p.rotation.x = Math.PI / 2; put(p, -1.9 - i * 0.12, 0.99, 3.2); R.yardSingles.push(p); }
    // spare rods on timbers
    for (const z of [3.0, 5.0]) put(box(0.7, 0.12, 0.12, 0x8a6a45, 0.008), -3.0, 0.06, z);
    for (let i = 0; i < 4; i++) { const p = cyl(0.045, 0.045, 3.05, 0xd4d8dc, 0.006, 12); p.rotation.x = Math.PI / 2; put(p, -3.2 + i * 0.13, 0.17, 4.0); }
  }
  const standX = i => -1.02 - i * 0.22;
  // where a 20 ft stand on the winch is: bottom point and top point, from upright (lay 0) to lying on the horses (lay 1)
  function standPose(S) {
    const st = S.stand, L = st.len * FT, s = st.lay, th = s * Math.PI / 2;
    const xs = standX(Math.min(2, S.yard.stands));
    const by = lerp(st.bot * FT, 0.99, s);
    const T = V(lerp(0, xs, s), by + L * Math.cos(th), lerp(0, 0.9, s));
    const B = V(T.x, by, T.z + L * Math.sin(th));
    return { T, B };
  }
  const segD = V();
  function seg(m, a, b) {          // stretch a unit-tall cylinder between two points
    segD.copy(b).sub(a); const len = segD.length();
    if (len < 1e-3) { m.visible = false; return; }
    m.visible = true;
    m.position.copy(a).addScaledVector(segD, 0.5);
    m.scale.y = len;
    m.quaternion.setFromUnitVectors(UP, segD.multiplyScalar(1 / len));
  }

  function buildWaterTruck() {
    const t = new THREE.Group(); R.wt = t; scene.add(t);
    put(box(1.9, 1.7, 1.9, 0xf2efe6), -2.4, 1.55, 0, t);
    put(box(0.06, 0.65, 1.6, 0x2c4f6e, 0.008), -3.36, 1.85, 0, t);
    put(box(1.9, 0.12, 1.92, 0x2e78c7, 0), -2.4, 1.05, 0, t);
    put(box(4.6, 0.25, 1.9, 0x6f7479), 0.6, 0.85, 0, t);
    R.tankOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 3.1, 28), new THREE.MeshToonMaterial({ color: 0xbfe3f5, gradientMap: grad, transparent: true, opacity: 0.55 }));
    R.tankOuter.rotation.z = Math.PI / 2; R.tankOuter.position.set(0.25, 1.85, 0); outline(R.tankOuter, 0.02); t.add(R.tankOuter);
    R.tankWater = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1, 1.45), toon(0x2f93d6));
    R.tankWater.position.set(0.25, 1.4, 0); t.add(R.tankWater);
    put(box(0.7, 0.6, 1.0, 0xd8402f), 2.35, 1.3, 0, t);
    put(cyl(0.16, 0.16, 0.05, 0xf6f1e2, 0.006), 2.35, 1.42, 0.52, t).rotation.x = Math.PI / 2;
    R.wtWheels = [];
    for (const x of [-2.3, 1.2, 2.05]) for (const z of [-0.85, 0.85]) {
      const w = cyl(0.42, 0.42, 0.32, 0x2a2c2e, 0.012, 20); w.rotation.x = Math.PI / 2; put(w, x, 0.42, z, t); R.wtWheels.push(w);
    }
    R.wtHome = V(-6.3, 0, 9.0);
    t.position.copy(R.wtHome);
    R.waterHose = new THREE.Mesh(new THREE.BufferGeometry(), toon(0x2e5d8a)); scene.add(R.waterHose); R.waterKey = '';
  }

  function buildTable() {
    const g = new THREE.Group(); R.table = g;
    for (const x of [-0.95, 0.95]) for (const z of [-0.25, 0.25]) { const l = box(0.07, 0.9, 0.07, 0x8a6a45, 0.008); l.rotation.z = x < 0 ? 0.12 : -0.12; put(l, x, 0.43, z, g); }
    put(box(2.4, 0.06, 0.7, 0xa87b4f), 0, 0.88, 0, g);
    R.sleeves = new THREE.Group(); g.add(R.sleeves); R.sleeveKey = '';
    g.position.set(0.9, 0, 5.7); g.rotation.y = 0.15; scene.add(g);
  }

  // ---------- people ----------
  // Crew in blue coveralls with reflective tape, hard hats, gloves, boots and wrap-around mirrored shades.
  // Each one faces +z. Hips, knees, shoulders and elbows are pivots so they can walk and work.
  const TAPE = 0xdfe84a, SILVER = 0xeef2f4, BOOT = 0x3a2a1c, SOLE = 0x1c1a18, GLOVE = 0xe0a83a, CUFF = 0xc48e33;
  function band(r, y, parent, h) {          // reflective band: yellow with a silver stripe
    put(cyl(r, r, h || 0.05, TAPE, 0, 16), 0, y, 0, parent);
    put(cyl(r + 0.001, r + 0.001, (h || 0.05) * 0.36, SILVER, 0, 16), 0, y, 0, parent);
  }
  // ---------- patterns for the swag shop (js/swag.js): small repeating pictures used in place of a flat colour ----------
  // A look names one as a string, for example suit: 'camo'. w, h = picture size, rx, ry = how many times it repeats round and up a part.
  const PATS = {
    carbon: { rx: 5, ry: 3, draw(c, w, h) { c.fillStyle = '#0e0f11'; c.fillRect(0, 0, w, h); const n = 32; for (let y = 0; y < h; y += n) for (let x = 0; x < w; x += n) { const a = ((x + y) / n) % 2 === 0, g = c.createLinearGradient(x, y, x + n, y + n); g.addColorStop(0, a ? '#4a5058' : '#101114'); g.addColorStop(1, a ? '#101114' : '#4a5058'); c.fillStyle = g; c.fillRect(x + 1, y + 1, n - 2, n - 2); } } },
    flames: { w: 256, rx: 2, draw(c, w, h) {
      c.fillStyle = '#16161a'; c.fillRect(0, 0, w, h);
      const r = rnd(11), flame = (x, ht, wd, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x - wd, h); c.quadraticCurveTo(x - wd * 1.1, h - ht * 0.5, x - wd * 0.2, h - ht * 0.72); c.quadraticCurveTo(x + wd * 0.1, h - ht * 0.9, x, h - ht); c.quadraticCurveTo(x + wd * 0.5, h - ht * 0.7, x + wd * 0.3, h - ht * 0.5); c.quadraticCurveTo(x + wd * 1.2, h - ht * 0.4, x + wd, h); c.closePath(); c.fill(); };
      for (const [col, k] of [['#d92a1c', 1], ['#f47a1a', 0.74], ['#ffd23f', 0.46]]) { const q = rnd(5); for (let i = 0; i < 9; i++) flame(i * 32 + 6 + q() * 10, (58 + q() * 52) * k, 22 * (0.6 + k * 0.4), col); }
      r();
    } },
    camo: { rx: 2, ry: 2, draw(c, w, h) { c.fillStyle = '#6f7d48'; c.fillRect(0, 0, w, h); const r = rnd(23); for (const col of ['#3f4d2a', '#a59c6c', '#27301c']) for (let i = 0; i < 9; i++) { c.fillStyle = col; const x = r() * w, y = r() * h; for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { c.beginPath(); c.ellipse(x + dx, y + dy, 9 + r() * 15, 6 + r() * 9, r() * 3, 0, 7); c.fill(); } } } },
    dots: { rx: 3, ry: 2, draw(c, w, h) { c.fillStyle = '#fffdf4'; c.fillRect(0, 0, w, h); const cols = ['#e0362b', '#2c8ad6', '#f2b630', '#3aa856']; let k = 0; for (let y = 16; y < h; y += 32) for (let x = (y / 32 | 0) % 2 ? 32 : 16; x < w; x += 32) { c.fillStyle = cols[k++ % 4]; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); } } },
    stripesBW: { ry: 3, draw(c, w, h) { c.fillStyle = '#f4f4ee'; c.fillRect(0, 0, w, h); c.fillStyle = '#17181b'; c.fillRect(0, 0, w, h / 2); } },
    stripesRef: { rx: 7, draw(c, w, h) { c.fillStyle = '#f4f4ee'; c.fillRect(0, 0, w, h); c.fillStyle = '#17181b'; c.fillRect(0, 0, w / 2, h); } },
    stripesRed: { ry: 4, draw(c, w, h) { c.fillStyle = '#f4f4ee'; c.fillRect(0, 0, w, h); c.fillStyle = '#c0271f'; c.fillRect(0, 0, w, h / 2); } },
    floral: { rx: 3, ry: 2, draw(c, w, h) { c.fillStyle = '#12a59c'; c.fillRect(0, 0, w, h); const fl = (x, y, col, s) => { c.fillStyle = col; for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; c.beginPath(); c.ellipse(x + Math.cos(a) * 9 * s, y + Math.sin(a) * 9 * s, 8 * s, 5.5 * s, a, 0, 7); c.fill(); } c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(x, y, 4.5 * s, 0, 7); c.fill(); }; c.fillStyle = '#0c6b55'; for (const [x, y, a] of [[20, 90, 0.5], [80, 30, 2], [108, 100, 4]]) { c.beginPath(); c.ellipse(x, y, 16, 6, a, 0, 7); c.fill(); } fl(34, 34, '#fffdf4', 1.15); fl(96, 70, '#ff8fb4', 1); fl(40, 104, '#ffb14a', 0.8); } },
    plaid: { rx: 5, ry: 4, draw(c, w, h) { c.fillStyle = '#c0271f'; c.fillRect(0, 0, w, h); c.fillStyle = '#6f1611'; c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2); c.fillStyle = '#17181b'; c.fillRect(w / 2, 0, w / 2, h / 2); } },
    check: { rx: 9, ry: 9, draw(c, w, h) { c.fillStyle = '#f4f4ee'; c.fillRect(0, 0, w, h); c.fillStyle = '#23262b'; c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2); } },
    chrome: { draw(c, w, h) { const g = c.createLinearGradient(0, 0, 0, h); for (const [p, col] of [[0, '#ffffff'], [0.28, '#c3ccd3'], [0.5, '#6f7c86'], [0.56, '#eef3f6'], [1, '#98a4ad']]) g.addColorStop(p, col); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.8)'; for (const x of [18, 30, 84]) { c.beginPath(); c.moveTo(x, 4); c.lineTo(x + 8, 4); c.lineTo(x - 6, 60); c.lineTo(x - 14, 60); c.closePath(); c.fill(); } } },
    gold: { draw(c, w, h) { const g = c.createLinearGradient(0, 0, 0, h); for (const [p, col] of [[0, '#fff6b8'], [0.3, '#f2c230'], [0.52, '#b8860b'], [0.58, '#ffe98a'], [1, '#d9a51c']]) g.addColorStop(p, col); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.75)'; for (const x of [22, 34, 90]) { c.beginPath(); c.moveTo(x, 4); c.lineTo(x + 8, 4); c.lineTo(x - 6, 60); c.lineTo(x - 14, 60); c.closePath(); c.fill(); } } },
    hatFlames: { w: 256, rx: 2, draw(c, w, h) { PATS.flames.draw(c, w, h); } },
    feathers: { rx: 3, ry: 3, draw(c, w, h) { c.fillStyle = '#fdfdf8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d5d2c4'; c.lineWidth = 3; for (let y = 0; y <= h; y += 32) for (let x = (y / 32) % 2 ? 0 : 16; x <= w; x += 32) { c.beginPath(); c.arc(x, y, 15, 0.15, Math.PI - 0.15); c.stroke(); } } },
    jersey: { draw(c, w, h) { c.fillStyle = '#0b3d91'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.fillRect(0, 88, w, 30); c.fillStyle = '#f26a1b'; c.fillRect(0, 94, w, 18); } },
    socks: { draw(c, w, h) { c.fillStyle = '#fdfdf8'; c.fillRect(0, 0, w, h); c.fillStyle = '#0b3d91'; c.fillRect(0, 34, w, 40); c.fillStyle = '#f26a1b'; c.fillRect(0, 46, w, 16); } },
    mustard: { draw(c, w, h) { c.fillStyle = '#b5402a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffd23f'; c.lineWidth = 9; c.lineJoin = 'round'; c.lineCap = 'round'; for (const ox of [0, w]) { c.beginPath(); for (let i = 0; i <= 8; i++) { const x = ox + (i % 2 ? 11 : -11), y = 8 + i * 14; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); } } },
    stars: { rx: 3, ry: 2, draw(c, w, h) { c.fillStyle = '#3b2a7a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd23f'; const st = (x, y, r) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, q = i % 2 ? r * 0.42 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); c.fill(); }; st(30, 30, 13); st(92, 58, 9); st(44, 98, 10); st(104, 108, 6); c.beginPath(); c.arc(84, 22, 9, 0.6, 4.2); c.arc(89, 20, 8, 4.0, 0.9, true); c.fill(); } },
    mail: { rx: 6, ry: 5, draw(c, w, h) { c.fillStyle = '#8a949c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#4f5961'; c.lineWidth = 4; for (let y = 0; y <= h; y += 32) for (let x = (y / 32) % 2 ? 0 : 16; x <= w; x += 32) { c.beginPath(); c.arc(x, y, 14, 0, 7); c.stroke(); } c.strokeStyle = '#c3ccd3'; c.lineWidth = 1.5; for (let y = 0; y <= h; y += 32) for (let x = (y / 32) % 2 ? 0 : 16; x <= w; x += 32) { c.beginPath(); c.arc(x, y, 11, 3.6, 5.4); c.stroke(); } } },
    leopard: { rx: 3, ry: 2, draw(c, w, h) { c.fillStyle = '#e2a23c'; c.fillRect(0, 0, w, h); const r = rnd(41); for (let i = 0; i < 13; i++) { const x = r() * w, y = r() * h, s = 7 + r() * 5; for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { c.fillStyle = '#4a2f14'; c.beginPath(); c.ellipse(x + dx, y + dy, s, s * 0.8, r() * 3, 0, 7); c.fill(); c.fillStyle = '#b8721f'; c.beginPath(); c.ellipse(x + dx + 1, y + dy, s * 0.5, s * 0.4, 0, 0, 7); c.fill(); } } } },
    bee: { ry: 3, draw(c, w, h) { c.fillStyle = '#ffd23f'; c.fillRect(0, 0, w, h); c.fillStyle = '#17181b'; c.fillRect(0, 0, w, h / 2); } },
    cow: { rx: 2, ry: 2, draw(c, w, h) { c.fillStyle = '#fdfdf8'; c.fillRect(0, 0, w, h); const r = rnd(77); c.fillStyle = '#17181b'; for (let i = 0; i < 5; i++) { const x = r() * w, y = r() * h; for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { c.beginPath(); c.ellipse(x + dx, y + dy, 14 + r() * 14, 10 + r() * 10, r() * 3, 0, 7); c.fill(); } } } },
  };
  const patCache = {};
  function pat(name) {
    if (patCache[name]) return patCache[name];
    const P = PATS[name]; if (!P) return 0xff00ff;
    const t = canvasTex(P.w || 128, P.h || 128, P.draw);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(P.rx || 1, P.ry || 1);
    return (patCache[name] = t);
  }
  const coneM = (r, h, c, t) => M(new THREE.ConeGeometry(r, h, 14), c, t == null ? 0.006 : t);
  function flatShape(pts, col, edge) {          // a flat cut-out (a heart, a star) with a dark edge behind it
    const sh = new THREE.Shape(); pts(sh);
    const g = new THREE.Group(), geo = new THREE.ShapeGeometry(sh, 10);
    const back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: edge || 0x1b1710, side: THREE.DoubleSide })); back.scale.setScalar(1.18); back.position.z = -0.0015; g.add(back);
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })));
    return g;
  }
  // Hats from the swag shop that are not hard hats at all. Built in the hat's own space: y = 0 is where a hard hat's rim sits.
  function swagHat(kind, hat, o) {
    const dome = (col, r) => put(M(new THREE.SphereGeometry(r || 0.19, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), col, 0.01), 0, 0, 0, hat);
    const drape = (col) => { const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.188, 0.206, 0.23, 22, 1, true, Math.PI * 0.42, Math.PI * 1.16), new THREE.MeshToonMaterial({ color: col, gradientMap: grad, side: THREE.DoubleSide })); ln.position.set(0, -0.115, -0.008); ln.scale.set(1, 1, 1.06); hat.add(ln); };
    const hood = (col) => { dome(col).scale.set(1, 1, 1.08); drape(col); };          // a costume's hood: over the top and down the back, face showing
    const bm = c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
    const eyeDots = (y, z, x) => { for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), bm(0x14100c)); e.position.set(sx * x, y, z); hat.add(e); } };
    if (kind === 'babytoque') {
      put(sph(0.168, 0x9fd0f0, 0.008, 16, 10), 0, 0.03, -0.005, hat).scale.set(1, 0.72, 1);
      put(cyl(0.172, 0.172, 0.04, 0xfdfdf8, 0.006, 20), 0, 0.02, -0.005, hat);
      put(sph(0.042, 0xfdfdf8, 0.006, 10, 8), 0, 0.165, -0.005, hat);
    } else if (kind === 'chicken') {
      hood(0xfdfdf8);
      for (const [z, r] of [[0.07, 0.04], [0.0, 0.05], [-0.07, 0.042]]) put(sph(r, 0xd4271b, 0.005, 10, 8), 0, 0.21, z, hat).scale.set(0.5, 1, 1);
      put(coneM(0.045, 0.11, 0xf28c1a), 0, 0.05, 0.215, hat).rotation.x = Math.PI / 2;
      put(sph(0.026, 0xd4271b, 0.004, 8, 6), 0, 0.0, 0.2, hat).scale.set(0.7, 1.3, 0.7);
      eyeDots(0.1, 0.165, 0.075);
    } else if (kind === 'cow') {
      hood(0xfdfdf8);
      put(sph(0.08, 0x17181b, 0, 10, 8), -0.1, 0.12, 0.06, hat).scale.set(1, 0.7, 1);
      for (const sx of [-1, 1]) {
        put(coneM(0.03, 0.11, 0xf3ead2), sx * 0.1, 0.2, 0, hat).rotation.z = -sx * 0.5;
        put(sph(0.05, 0xf7b8c4, 0.005, 10, 8), sx * 0.21, 0.07, 0, hat).scale.set(1, 0.6, 0.35);
      }
    } else if (kind === 'shark') {
      hood(0x7f8b96);
      for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.3; put(coneM(0.022, 0.05, 0xfdfdf8, 0.003), Math.sin(a) * 0.19, -0.015, Math.cos(a) * 0.2, hat).rotation.x = Math.PI; }
      eyeDots(0.1, 0.13, 0.13);
      const fin = put(coneM(0.09, 0.2, 0x7f8b96), 0, 0.24, -0.05, hat); fin.scale.x = 0.2; fin.rotation.x = -0.3;
    } else if (kind === 'hockey') {
      dome(0xfdfdf8, 0.194).scale.set(1, 1, 1.1);
      put(cap(0.03, 0.26, 0x0b3d91, 0.005), 0, 0.17, -0.005, hat).rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) put(box(0.03, 0.15, 0.15, 0xfdfdf8, 0.006), sx * 0.185, -0.07, -0.01, hat);
      const vz = new THREE.Mesh(new THREE.CylinderGeometry(0.197, 0.197, 0.085, 28, 1, true, -1.15, 2.3), new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })); vz.position.set(0, -0.045, 0.004); hat.add(vz);
      const ve = new THREE.Mesh(new THREE.CylinderGeometry(0.198, 0.198, 0.01, 28, 1, true, -1.15, 2.3), bm(0x17181b)); ve.position.set(0, -0.004, 0.004); hat.add(ve);
    } else if (kind === 'wiener') {
      hood(0xb5402a);
      put(sph(0.15, 0xb5402a, 0.01, 16, 10), 0, 0.12, -0.01, hat).scale.set(1, 1.1, 1);
    } else if (kind === 'banana') {
      hood(0xffd92e);
      const t1 = put(cyl(0.05, 0.13, 0.2, 0xffd92e, 0.008, 14), 0, 0.24, -0.02, hat); t1.rotation.x = -0.25;
      put(cyl(0.03, 0.045, 0.07, 0x5a3d1a, 0.006, 10), 0, 0.36, -0.06, hat).rotation.x = -0.35;
    } else if (kind === 'wizard') {
      put(cyl(0.27, 0.28, 0.018, pat('stars'), 0.008, 28), 0, 0.03, 0, hat);
      const cn = put(M(new THREE.ConeGeometry(0.175, 0.46, 20), pat('stars'), 0.01), 0, 0.26, -0.01, hat); cn.rotation.x = -0.1;
      put(cyl(0.178, 0.178, 0.035, 0xf2c230, 0.004, 22), 0, 0.055, 0, hat);
    } else if (kind === 'knight') {
      dome(0xaab3ba, 0.192).scale.set(1, 1.05, 1.08); drape(0xaab3ba);
      const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.183, 0.176, 0.25, 26, 1, true, -1.45, 2.9), new THREE.MeshToonMaterial({ color: 0xaab3ba, gradientMap: grad, side: THREE.DoubleSide })); fp.position.set(0, -0.12, 0.012); hat.add(fp);
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.022, 26, 1, true, -0.95, 1.9), bm(0x14100c)); sl.position.set(0, -0.062, 0.012); hat.add(sl);
      for (let i = -2; i <= 2; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 5), bm(0x14100c)); d.position.set(Math.sin(i * 0.2) * 0.181, -0.16, Math.cos(i * 0.2) * 0.181 + 0.012); hat.add(d); }
      const pl = put(cap(0.035, 0.2, 0xc8201a, 0.006), 0, 0.26, -0.09, hat); pl.rotation.x = -0.9;
    } else if (kind === 'lucha' || kind === 'ninja') {      // a mask over the whole head
      const col = kind === 'lucha' ? 0x1f8fd6 : 0x17181b;
      put(sph(0.176, col, 0.008, 20, 14), 0, -0.068, 0.002, hat).scale.set(1, 1.06, 1.03);
      if (kind === 'ninja') {
        const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.184, 0.184, 0.055, 26, 1, true, -1.0, 2.0), bm(o.skin)); bd.position.set(0, -0.06, 0.004); hat.add(bd);
        put(box(0.4, 0.035, 0.02, 0xc8201a, 0.004), 0, 0.02, -0.19, hat);
        for (const sx of [-1, 1]) put(box(0.03, 0.16, 0.012, 0xc8201a, 0.003), sx * 0.04, -0.07, -0.2, hat).rotation.z = sx * 0.25;
      }
      for (const sx of [-1, 1]) {
        if (kind === 'lucha') { const ey = flatShape((sh) => { sh.moveTo(-0.045, 0); sh.quadraticCurveTo(0, 0.05, 0.05, 0.012); sh.quadraticCurveTo(0.005, -0.03, -0.045, 0); }, 0xfdfdf8, 0xf2c230); ey.position.set(sx * 0.066, -0.058, 0.175); ey.rotation.y = sx * 0.3; ey.scale.x = sx; hat.add(ey); }
        const wh = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), bm(0xfffdf4)); wh.position.set(sx * 0.062, -0.06, 0.181); wh.scale.z = 0.4; hat.add(wh);
        const pu = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), bm(0x14100c)); pu.position.set(sx * 0.062, -0.06, 0.188); pu.scale.z = 0.4; hat.add(pu);
      }
      if (kind === 'lucha') { const mo = flatShape((sh) => { sh.absellipse(0, 0, 0.04, 0.022, 0, Math.PI * 2); }, 0xc46a66, 0xf2c230); mo.position.set(0, -0.185, 0.168); mo.rotation.x = 0.25; hat.add(mo); put(coneM(0.04, 0.09, 0xf2c230, 0.004), 0, 0.02, 0.175, hat).rotation.x = Math.PI / 2 + 1.2; }
    } else if (kind === 'topknot') {
      put(sph(0.16, 0x17120f, 0.008, 16, 10), 0, 0.015, -0.02, hat).scale.set(1, 0.55, 1);
      put(sph(0.05, 0x17120f, 0.006, 10, 8), 0, 0.13, -0.03, hat);
      put(cyl(0.022, 0.022, 0.03, 0xfdfdf8, 0.003, 8), 0, 0.095, -0.03, hat);
    } else if (kind === 'bonehair') {
      put(sph(0.175, 0x2b1d14, 0.008, 14, 9), 0, 0.02, -0.03, hat).scale.set(1.1, 0.7, 1.05);
      for (const [x, y, z] of [[-0.15, 0.03, 0.02], [0.15, 0.04, 0.0], [0, 0.11, -0.1], [-0.09, 0.12, 0.04], [0.1, 0.11, 0.05]]) put(sph(0.07, 0x2b1d14, 0.006, 9, 7), x, y, z, hat);
      const bn = put(cap(0.016, 0.3, 0xf3ead2, 0.004), 0, 0.16, 0, hat); bn.rotation.z = Math.PI / 2 - 0.25;
      for (const sx of [-1, 1]) for (const dy of [-0.016, 0.016]) put(sph(0.022, 0xf3ead2, 0.004, 8, 6), sx * 0.165, 0.16 + sx * 0.042 + dy, 0, hat);
    } else if (kind === 'antennae') {
      put(cyl(0.165, 0.165, 0.03, 0x17181b, 0.005, 20), 0, 0.03, 0, hat).scale.set(1, 1, 1.04);
      for (const sx of [-1, 1]) { put(cyl(0.008, 0.008, 0.2, 0x17181b, 0.003, 6), sx * 0.08, 0.17, 0.02, hat).rotation.z = -sx * 0.3; put(sph(0.032, 0xffd23f, 0.005, 10, 8), sx * 0.11, 0.27, 0.02, hat); }
    } else if (kind === 'robot') {
      dome(pat('chrome'), 0.188).scale.set(1, 0.9, 1.08);
      put(cyl(0.193, 0.193, 0.03, 0x39424a, 0.005, 22), 0, 0.015, 0, hat).scale.set(1, 1, 1.08);
      put(cyl(0.008, 0.008, 0.16, 0x39424a, 0.003, 6), 0, 0.24, 0, hat); put(sph(0.03, 0xe0362b, 0.005, 10, 8), 0, 0.33, 0, hat);
      for (const sx of [-1, 1]) put(cyl(0.035, 0.035, 0.04, 0x39424a, 0.005, 10), sx * 0.2, -0.07, 0, hat).rotation.z = Math.PI / 2;
    } else if (kind === 'firehat') {
      dome(0xc8201a, 0.19).scale.set(1, 1.05, 1.08);
      put(cyl(0.24, 0.25, 0.018, 0xc8201a, 0.008, 28), 0, 0.006, -0.05, hat).scale.set(0.9, 1, 1.35);
      put(cap(0.022, 0.25, 0xc8201a, 0.005), 0, 0.19, -0.005, hat).rotation.x = Math.PI / 2;
      const sh = put(box(0.1, 0.12, 0.014, 0xf2c230, 0.005), 0, 0.1, 0.19, hat); sh.rotation.x = -0.35;
    } else if (kind === 'alpine') {
      put(cyl(0.25, 0.25, 0.016, 0x2f6b3a, 0.008, 26), 0, 0.03, 0, hat);
      put(cyl(0.13, 0.172, 0.14, 0x2f6b3a, 0.008, 20), 0, 0.105, 0, hat);
      put(cyl(0.176, 0.176, 0.03, 0x4a2f1b, 0.004, 20), 0, 0.055, 0, hat);
      const f = put(coneM(0.02, 0.2, 0xc8201a, 0.004), 0.17, 0.17, -0.02, hat); f.rotation.z = -0.35; f.scale.z = 0.4;
    } else if (kind === 'laurel') {
      for (let i = 0; i < 14; i++) { const a = 0.5 + i * (Math.PI * 2 - 1.0) / 13; const lf = put(sph(0.034, i % 2 ? 0x3aa856 : 0x2f8a45, 0.004, 8, 6), Math.sin(a) * 0.172, 0.01 + Math.abs(Math.cos(a)) * 0.012, Math.cos(a) * 0.178, hat); lf.scale.set(0.5, 1, 0.9); lf.rotation.y = a; lf.rotation.z = 0.5; }
    } else if (kind === 'pompadour') {
      put(sph(0.168, 0x17120f, 0.008, 16, 10), 0, 0.01, -0.025, hat).scale.set(1.02, 0.7, 1.02);
      put(sph(0.11, 0x17120f, 0.008, 14, 10), 0, 0.1, 0.09, hat).scale.set(1.25, 0.85, 1.05);
      put(sph(0.08, 0x17120f, 0.006, 12, 8), 0, 0.13, 0.0, hat).scale.set(1.3, 0.8, 1.3);
      for (const sx of [-1, 1]) put(box(0.025, 0.13, 0.05, 0x17120f, 0.004), sx * 0.152, -0.1, 0.03, hat);
    } else if (kind === 'viking') {
      put(M(new THREE.SphereGeometry(0.186, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xaab3ba, 0.01), 0, 0, 0, hat).scale.set(1, 0.98, 1.08);
      put(cyl(0.192, 0.196, 0.04, 0x8a6a2c, 0.006, 24), 0, 0.02, 0, hat).scale.set(1, 1, 1.08);
      put(box(0.036, 0.12, 0.02, 0xaab3ba, 0.004), 0, -0.045, 0.2, hat);
      for (const sx of [-1, 1]) {
        put(cyl(0.056, 0.056, 0.03, 0x8a6a2c, 0.004, 14), sx * 0.178, 0.07, 0, hat).rotation.z = -sx * 1.15;
        put(coneM(0.05, 0.16, 0xf3ead2), sx * 0.235, 0.098, 0, hat).rotation.z = -sx * 1.15;
        put(coneM(0.033, 0.14, 0xf3ead2), sx * 0.318, 0.19, 0, hat).rotation.z = -sx * 0.3;
      }
    } else if (kind === 'propeller') {
      const cols = [0xe0362b, 0xf2c230, 0x2c8ad6, 0x3aa856];
      put(M(new THREE.SphereGeometry(0.186, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x1b1710, 0), 0, 0, 0, hat).scale.set(1, 0.9, 1.06);
      for (let i = 0; i < 4; i++) put(M(new THREE.SphereGeometry(0.19, 8, 10, i * Math.PI / 2 + 0.03, Math.PI / 2 - 0.06, 0, Math.PI / 2), cols[i], 0), 0, 0, 0, hat).scale.set(1, 0.9, 1.06);
      put(cyl(0.135, 0.135, 0.016, 0xe0362b, 0.006, 18), 0, 0.008, 0.15, hat).scale.set(1, 1, 0.75);
      put(cyl(0.012, 0.012, 0.08, 0x23272b, 0.003, 8), 0, 0.2, 0, hat);
      const b1 = put(box(0.3, 0.012, 0.05, 0xf2c230, 0.004), 0, 0.24, 0, hat); b1.rotation.set(0.18, 0.5, 0);
      put(sph(0.022, 0xe0362b, 0.004, 10, 8), 0, 0.245, 0, hat);
    } else if (kind === 'cone') {
      put(box(0.37, 0.024, 0.37, 0xf26a1b, 0.008), 0, 0.03, 0, hat);
      put(cyl(0.03, 0.165, 0.44, 0xf26a1b, 0.01, 20), 0, 0.26, 0, hat);
      put(cyl(0.094, 0.12, 0.085, 0xfdfdf8, 0, 20), 0, 0.235, 0, hat);
      put(cyl(0.061, 0.076, 0.05, 0xfdfdf8, 0, 20), 0, 0.36, 0, hat);
    } else if (kind === 'crown') {
      put(sph(0.15, 0xa3202a, 0.008, 16, 10), 0, 0.1, 0, hat).scale.set(1, 0.55, 1);
      put(cyl(0.172, 0.164, 0.085, pat('gold'), 0.008, 24), 0, 0.085, 0, hat);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        put(coneM(0.04, 0.1, 0xf2c230), Math.sin(a) * 0.15, 0.17, Math.cos(a) * 0.15, hat);
        put(sph(0.017, i % 2 ? 0x2c8ad6 : 0xe0362b, 0.003, 8, 6), Math.sin(a + 0.39) * 0.172, 0.085, Math.cos(a + 0.39) * 0.172, hat);
      }
    } else if (kind === 'clownwig') {
      const cols = [0xe0362b, 0xf47a1a, 0xf2c230, 0x3aa856, 0x2c8ad6, 0x8a4fd6, 0xff5fa8, 0x3aa856];
      [[-0.17, -0.02, 0], [0.17, -0.02, 0], [-0.13, 0.1, 0], [0.13, 0.1, 0], [0, 0.15, 0], [-0.1, 0.0, -0.12], [0.1, 0.0, -0.12], [0, 0.09, -0.13]].forEach(([x, y, z], i) => put(sph(0.098, cols[i], 0.008, 12, 9), x, y, z, hat));
    } else if (kind === 'frosted') {
      put(sph(0.158, 0xf1e3a0, 0.008, 16, 10), 0, 0.01, -0.02, hat).scale.set(1, 0.62, 1);
      const spike = (a, r, y, tilt, len) => { const pv = new THREE.Group(); pv.rotation.y = a; hat.add(pv); put(coneM(0.036, len, 0xf7edb5), r, y, 0, pv).rotation.z = -tilt; };
      for (let i = 0; i < 9; i++) spike(i * Math.PI * 2 / 9, 0.115, 0.1, 0.62, 0.15);
      for (let i = 0; i < 6; i++) spike(i * Math.PI / 3 + 0.4, 0.06, 0.15, 0.3, 0.16);
      spike(0, 0, 0.17, 0, 0.16);
    } else if (kind === 'toque') {
      put(cyl(0.174, 0.168, 0.12, 0xfdfdf8, 0.008, 22), 0, 0.085, 0, hat);
      put(sph(0.2, 0xfdfdf8, 0.01, 16, 10), 0, 0.225, 0, hat).scale.set(1.06, 0.62, 1.06);
    } else if (kind === 'santa') {
      put(cyl(0.19, 0.19, 0.06, 0xfdfdf8, 0.008, 22), 0, 0.045, 0, hat);
      const b = put(cyl(0.03, 0.18, 0.3, 0xc8201a, 0.01, 18), 0, 0.2, -0.045, hat); b.rotation.x = -0.36;
      put(sph(0.046, 0xfdfdf8, 0.006, 10, 8), 0, 0.335, -0.115, hat);
    } else return false;
    return true;
  }
  // The trimmings of an outfit from the swag shop: ties, capes, belts, badges. o.extras lists them.
  function dressUp(p, g, o, W) {
    const has = k => o.extras.includes(k), front = (m, x, y, z) => { put(m, x, y, z * W, g).rotation.x = -0.1; return m; };
    if (has('bib')) { front(box(0.15, 0.32, 0.012, o.bib || 0xfdfdf8, 0.003), 0, 1.33, 0.232); for (const y of [1.42, 1.34, 1.26]) front(sph(0.011, 0x17181b, 0, 8, 6), 0, y, 0.241); }
    if (has('lapels')) for (const sx of [-1, 1]) { const l = front(box(0.05, 0.25, 0.012, o.lapel || 0x0e0f11, 0.003), sx * 0.108, 1.385, 0.236); l.rotation.z = sx * 0.2; }
    if (has('bowtie')) { for (const sx of [-1, 1]) put(coneM(0.03, 0.06, o.tie || 0x17181b, 0.004), sx * 0.034, 1.515, 0.165, g).rotation.z = sx * Math.PI / 2; put(sph(0.014, o.tie || 0x17181b, 0.003, 8, 6), 0, 1.515, 0.168, g); }
    if (has('tie')) { front(box(0.05, 0.3, 0.012, o.tie || 0xc0271f, 0.003), 0, 1.32, 0.238); put(box(0.042, 0.036, 0.02, o.tie || 0xc0271f, 0.003), 0, 1.495, 0.175, g); }
    if (has('belt')) { put(cyl(0.214 * W, 0.214 * W, 0.06, o.belt || 0x17181b, 0.004, 18), 0, 1.075, 0, g); put(box(0.07, 0.07, 0.02, 0xf2c230, 0.004), 0, 1.075, 0.212 * W, g); }
    if (has('sash')) { put(cyl(0.216 * W, 0.216 * W, 0.09, o.belt || 0xc0271f, 0.004, 18), 0, 1.075, 0, g); put(box(0.07, 0.22, 0.02, o.belt || 0xc0271f, 0.004), 0.13 * W, 0.97, 0.17 * W, g).rotation.z = 0.12; }
    if (has('cape')) { const c = put(box(0.52 * W, 0.86, 0.02, o.cape || 0xc8201a, 0.008), 0, 1.07, -0.25 * W, g); c.rotation.x = 0.13; put(cyl(0.12, 0.15, 0.05, o.cape || 0xc8201a, 0.004, 14), 0, 1.535, 0, g); }
    if (has('emblem')) {
      const tx = canvasTex(128, 128, (c) => { c.fillStyle = o.emblemBg || '#f2c230'; c.beginPath(); c.arc(64, 64, 58, 0, 7); c.fill(); c.lineWidth = 8; c.strokeStyle = '#1b1710'; c.stroke(); c.fillStyle = o.emblemInk || '#c8201a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '400 78px Bungee, "Arial Black", sans-serif'; c.fillText(o.emblem || 'D', 64, 70); });
      const em = new THREE.Mesh(new THREE.CircleGeometry(0.062, 24), new THREE.MeshBasicMaterial({ map: tx, transparent: true })); em.position.set(0, 1.345, 0.2395 * W); em.rotation.x = -0.1; g.add(em);
    }
    if (has('ruff')) for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; put(sph(0.05, i % 2 ? 0xe0362b : 0xfdfdf8, 0.004, 8, 6), Math.sin(a) * 0.125, 1.535, Math.cos(a) * 0.115, g).scale.set(1, 0.62, 1); }
    if (has('poms')) [0xe0362b, 0x2c8ad6, 0xf2c230].forEach((col, i) => front(sph(0.028, col, 0.004, 10, 8), 0, 1.4 - i * 0.1, 0.242));
    if (has('star')) { const st = flatShape((sh) => { for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? 0.018 : 0.042; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } }, 0xf2c230); st.position.set(0.115 * W, 1.43, (o.vest ? 0.272 : 0.243) * W); st.rotation.x = -0.1; g.add(st); }
    if (has('ribs')) { front(box(0.022, 0.3, 0.012, 0xf4f4ee, 0), 0, 1.31, 0.236); for (let i = 0; i < 4; i++) front(box(0.2 - i * 0.022, 0.024, 0.012, 0xf4f4ee, 0), 0, 1.42 - i * 0.062, 0.234); front(box(0.15, 0.05, 0.012, 0xf4f4ee, 0), 0, 1.1, 0.214); }
    if (has('bones')) {                           // one long bone down each arm and leg
      for (const a of p.arms) put(cap(0.014, 0.16, 0xf4f4ee, 0), 0, -0.17, 0.072 * W, a);
      for (const f of p.fores) put(cap(0.012, 0.13, 0xf4f4ee, 0), 0, -0.14, 0.062 * W, f);
      for (const l of p.legs) put(cap(0.016, 0.22, 0xf4f4ee, 0), 0, -0.2, 0.09 * W, l);
      for (const k of p.shins) put(cap(0.014, 0.2, 0xf4f4ee, 0), 0, -0.2, 0.076 * W, k);
    }
    if (has('sideStripes')) {                     // tracksuit: white stripes down the outside of each arm and leg
      p.arms.forEach((a, i) => put(box(0.012, 0.3, 0.03, 0xfdfdf8, 0), (i ? 1 : -1) * 0.072 * W, -0.17, 0, a));
      p.fores.forEach((f, i) => put(box(0.012, 0.22, 0.03, 0xfdfdf8, 0), (i ? 1 : -1) * 0.062 * W, -0.14, 0, f));
      p.legs.forEach((l, i) => put(box(0.012, 0.36, 0.03, 0xfdfdf8, 0), (i ? 1 : -1) * 0.09 * W, -0.2, 0, l));
      p.shins.forEach((k, i) => put(box(0.012, 0.3, 0.03, 0xfdfdf8, 0), (i ? 1 : -1) * 0.076 * W, -0.2, 0, k));
      front(box(0.014, 0.44, 0.012, 0xfdfdf8, 0), 0, 1.3, 0.2295);
    }
    if (has('fur')) { front(box(0.06, 0.46, 0.014, 0xfdfdf8, 0.003), 0, 1.3, 0.232); put(cyl(0.222 * W, 0.222 * W, 0.07, 0xfdfdf8, 0.006, 18), 0, 0.92, 0, g); }
    if (has('suspenders')) for (const sx of [-1, 1]) front(box(0.035, 0.42, 0.012, o.tie || 0xc0271f, 0.003), sx * 0.1 * W, 1.32, 0.232);
    if (has('buttons2')) for (const sx of [-1, 1]) for (const y of [1.42, 1.33, 1.24]) front(sph(0.014, o.button || 0x23262b, 0.002, 8, 6), sx * 0.05, y, 0.236);
    if (has('robe')) { for (const sx of [-1, 1]) { const l = front(box(0.05, 0.42, 0.014, o.lapel || 0xfdfdf8, 0.003), sx * 0.062, 1.32, 0.234); l.rotation.z = sx * 0.22; } put(cyl(0.216 * W, 0.216 * W, 0.05, o.lapel || 0xfdfdf8, 0.004, 18), 0, 1.075, 0, g); put(box(0.03, 0.2, 0.02, o.lapel || 0xfdfdf8, 0.003), 0.05, 0.98, 0.2 * W, g).rotation.z = 0.15; }
    if (has('chain')) { const ch = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.009, 6, 24), toon(0xf2c230)); ch.position.set(0, 1.5, 0.05); ch.rotation.x = Math.PI / 2 - 0.62; g.add(ch); front(sph(0.022, 0xf2c230, 0.003, 10, 8), 0, 1.4, 0.236); }
    if (has('collar')) for (const sx of [-1, 1]) { const col = put(box(0.15, 0.06, 0.09, o.lapel || 0xfdfdf8, 0.005), sx * 0.085, 1.55, 0.09, g); col.rotation.z = sx * -0.55; col.rotation.y = sx * 0.35; }
    if (has('bandana')) { put(cyl(0.09, 0.105, 0.05, o.tie || 0xc0271f, 0.004, 14), 0, 1.535, 0.005, g); put(coneM(0.06, 0.09, o.tie || 0xc0271f, 0.004), 0, 1.47, 0.16, g).rotation.x = Math.PI; }
    if (has('diaper')) { put(sph(0.236 * W, 0xfdfdf8, 0.01, 16, 10), 0, 0.97, 0, g).scale.set(1, 0.62, 1); put(cyl(0.23 * W, 0.23 * W, 0.06, 0xfdfdf8, 0.006, 18), 0, 1.07, 0, g); put(box(0.05, 0.022, 0.016, 0xf2c230, 0.003), 0.13 * W, 1.06, 0.195 * W, g).rotation.z = 0.4; }
    if (has('babybib')) { front(box(0.15, 0.13, 0.012, 0xfdfdf8, 0.004), 0, 1.43, 0.24); front(box(0.15, 0.02, 0.014, 0x9fd0f0, 0), 0, 1.372, 0.241); front(sph(0.022, 0xffd23f, 0.003, 8, 6), 0, 1.435, 0.245); }
    if (has('chaps')) {
      p.legs.forEach((l, i) => put(cap(0.097 * W, 0.24, o.chaps || 0x9a6a3a, 0.008), (i ? 1 : -1) * 0.022, -0.21, 0.004, l).scale.set(0.9, 1, 1.02));
      p.shins.forEach((k, i) => { put(cap(0.086 * W, 0.2, o.chaps || 0x9a6a3a, 0.008), (i ? 1 : -1) * 0.02, -0.19, 0.004, k).scale.set(0.9, 1, 1.02); for (let j = 0; j < 4; j++) put(box(0.012, 0.03, 0.04, o.chaps || 0x9a6a3a, 0), (i ? 1 : -1) * 0.1 * W, -0.06 - j * 0.07, 0, k); });
    }
    if (has('buckle')) put(sph(0.05, 0xf2c230, 0.005, 12, 8), 0, 1.075, 0.212 * W, g).scale.set(1.2, 0.85, 0.35);
    if (has('tailfeathers')) for (const [x, rz] of [[-0.07, 0.35], [0, 0], [0.07, -0.35]]) { const f = put(coneM(0.05, 0.3, 0xfdfdf8), x, 1.08, -0.28 * W, g); f.rotation.x = -0.9; f.rotation.z = rz; f.scale.z = 0.5; }
    if (has('wings')) for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.2, 22), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false })); w.scale.set(0.55, 1, 1); w.position.set(sx * 0.17, 1.52, -0.25 * W); w.rotation.z = -sx * 0.55; g.add(w); }
    if (has('stinger')) put(coneM(0.05, 0.16, 0x17181b), 0, 0.96, -0.27 * W, g).rotation.x = -Math.PI / 2;
    if (has('udder')) { put(sph(0.085, 0xf7b8c4, 0.006, 12, 9), 0, 1.03, 0.19 * W, g); for (const x of [-0.04, 0, 0.04]) put(cap(0.012, 0.03, 0xf08fa4, 0.003), x, 0.955, 0.215 * W, g); }
    if (has('tail')) { const t = put(cap(0.016, 0.34, o.tail || 0xfdfdf8, 0.004), 0, 0.82, -0.25 * W, g); t.rotation.x = 0.35; put(sph(0.035, o.tailTip || 0x17181b, 0.004, 8, 6), 0, 0.62, -0.31 * W, g); }
    if (has('fin')) { const f = put(coneM(0.11, 0.26, o.finCol || 0x7f8b96), 0, 1.42, -0.28 * W, g); f.scale.x = 0.18; f.rotation.x = -0.45; }
    if (has('bellypanel')) put(sph(0.17 * W, o.belly2 || 0xfdfdf8, 0.006, 16, 10), 0, 1.25, 0.115 * W, g).scale.set(0.92, 1.3, 0.78);
    if (has('panel')) { front(box(0.22, 0.18, 0.02, 0x39424a, 0.005), 0, 1.34, 0.238); [0xe0362b, 0xffd23f, 0x3aa856].forEach((col, i) => front(sph(0.018, col, 0.002, 8, 6), -0.06 + i * 0.06, 1.385, 0.252)); front(cyl(0.03, 0.03, 0.012, 0xc9d1d8, 0.003, 12), -0.04, 1.3, 0.252).rotation.x = Math.PI / 2 - 0.1; front(box(0.07, 0.014, 0.012, 0x3aa856, 0), 0.05, 1.3, 0.25); }
    if (has('tabard')) { front(box(0.27, 0.52, 0.014, o.tabard || 0xfdfdf8, 0.005), 0, 1.25, 0.247); front(box(0.05, 0.3, 0.012, o.cross || 0xc8201a, 0), 0, 1.3, 0.256); front(box(0.17, 0.05, 0.012, o.cross || 0xc8201a, 0), 0, 1.36, 0.257); }
    if (has('trunks')) put(cyl(0.22 * W, 0.214 * W, 0.2, o.trunks || 0xc8201a, 0.008, 18), 0, 0.98, 0, g);
    if (has('mawashi')) { put(cyl(0.228 * W, 0.228 * W, 0.1, o.belt || 0x3b2a7a, 0.008, 18), 0, 1.06, 0, g); put(box(0.13, 0.24, 0.022, o.belt || 0x3b2a7a, 0.006), 0, 0.93, 0.2 * W, g); }
    if (has('skirt')) { const len = o.skirtLen || 0.3; put(cyl(0.214 * W, (0.214 + 0.11 * len / 0.85 + 0.03) * W, len, typeof o.skirt === 'string' ? pat(o.skirt) : o.skirt || 0xfdfdf8, 0.01, 20), 0, 1.08 - len / 2, 0, g); }
    if (has('beads')) for (let i = -3; i <= 3; i++) put(i % 2 ? coneM(0.014, 0.05, 0xf3ead2, 0.003) : sph(0.02, 0xf3ead2, 0.003, 8, 6), Math.sin(i * 0.33) * 0.13, 1.52 - Math.cos(i * 0.33) * 0.03 + (i % 2 ? -0.03 : 0), Math.cos(i * 0.33) * 0.125 + 0.04, g).rotation.x = i % 2 ? Math.PI : 0;
    if (has('togaSash')) { const t = front(box(0.13, 0.66, 0.016, 0xfdfdf8, 0.005), 0.01, 1.32, 0.245); t.rotation.z = 0.72; const e = front(box(0.022, 0.66, 0.012, 0xf2c230, 0), -0.03, 1.36, 0.255); e.rotation.z = 0.72; put(sph(0.1 * W, 0xfdfdf8, 0.008, 12, 8), -0.24 * W, 1.52, 0.02, g).scale.set(1, 0.6, 1); }
    if (has('studs')) for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) front(sph(0.012, 0xf2c230, 0.002, 8, 6), sx * (0.095 - i * 0.02), 1.47 - i * 0.07, 0.238);
    if (has('number')) {
      const tx = canvasTex(256, 256, (c) => { c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.font = '400 170px Bungee, "Arial Black", sans-serif'; c.lineWidth = 22; c.strokeStyle = '#ffffff'; c.strokeText(o.number || '97', 128, 148); c.fillStyle = o.numberInk || '#f26a1b'; c.fillText(o.number || '97', 128, 148); c.font = '400 54px Bungee, "Arial Black", sans-serif'; c.lineWidth = 10; c.strokeText('C', 222, 36); c.fillText('C', 222, 36); });
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.23), new THREE.MeshBasicMaterial({ map: tx, transparent: true })); nm.position.set(0, 1.335, 0.2385 * W); nm.rotation.x = -0.1; g.add(nm);
    }
    if (has('bun')) put(cap(0.3 * W, 0.6, 0xd9a35a, 0.012), 0, 1.13, -0.13 * W, g).scale.set(1.18, 1, 0.72);
    if (has('chestbar')) front(box(0.24, 0.04, 0.012, o.tie || 0x4a2f1b, 0.003), 0, 1.4, 0.234);
    if (has('hose')) { front(box(0.09, 0.12, 0.05, 0x8a8f96, 0.005), 0, 1.36, 0.25); put(cyl(0.016, 0.016, 0.3, 0x23262b, 0.003, 8), 0.1 * W, 1.34, 0.2 * W, g).rotation.z = 0.5; }
  }
  function lensTex(cols) {
    return canvasTex(128, 32, (c) => {
      const g = c.createLinearGradient(0, 0, 128, 0);
      cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
      c.fillStyle = g; c.fillRect(0, 0, 128, 32);
      const v = c.createLinearGradient(0, 0, 0, 32); v.addColorStop(0, 'rgba(255,255,255,0.35)'); v.addColorStop(0.5, 'rgba(255,255,255,0)'); v.addColorStop(1, 'rgba(0,0,30,0.3)');
      c.fillStyle = v; c.fillRect(0, 0, 128, 32);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      for (const x of [26, 38, 92]) { c.beginPath(); c.moveTo(x, 4); c.lineTo(x + 7, 4); c.lineTo(x - 3, 28); c.lineTo(x - 10, 28); c.closePath(); c.fill(); }
    });
  }
  function makePerson(o) {
    o = Object.assign({}, o);
    for (const k of ['torso', 'arms', 'pants', 'shins', 'boot', 'cuff', 'sole', 'bib', 'yoke']) if (o[k] === 'skin') o[k] = o.skin;      // swag: bare skin
    for (const k of ['suit', 'suitDark', 'torso', 'arms', 'pants', 'shins', 'yoke', 'hat', 'hatTrim']) if (typeof o[k] === 'string') o[k] = pat(o[k]);      // swag: a pattern by name
    const g = new THREE.Group();
    const p = { g, legs: [], arms: [], shins: [], fores: [] };
    const SUIT = o.suit, DARK = o.suitDark, W = o.build || 1;
    // swag outfits (js/swag.js): torso, arms and pants can each have their own colour, and a costume (plain) has no reflective tape
    const TORSO = o.torso || SUIT, ARM = o.arms || SUIT, LEG = o.pants || SUIT, SHIN = o.shins || LEG, BOOTC = o.boot || BOOT, CUFFC = o.cuff || CUFF;
    const tape = o.plain ? () => {} : band;
    // legs: thigh, knee, shin, boot
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.105, 0.9, 0); g.add(hip);
      put(cap(0.088 * W, 0.26, LEG, 0.01), 0, -0.2, 0, hip);
      const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); hip.add(knee);
      put(sph(0.082 * W, SHIN, 0.01, 12, 8), 0, 0, 0.005, knee);
      put(cap(0.074 * W, 0.24, SHIN, 0.01), 0, -0.2, 0, knee);
      tape(0.078 * W, -0.21, knee);
      put(cyl(0.082, 0.088, 0.12, BOOTC, 0.008, 12), 0, -0.38, 0, knee);
      put(box(0.15, 0.085, 0.27, BOOTC, 0.008), 0, -0.445, 0.05, knee);
      put(box(0.162, 0.03, 0.29, o.sole || SOLE, 0), 0, -0.475, 0.05, knee);
      put(sph(0.072, 0x4d3826, 0.006, 10, 8), 0, -0.43, 0.15, knee).scale.set(1, 0.68, 0.9);
      p.legs.push(hip); p.shins.push(knee);
    }
    // torso: hips, tapered chest, shoulder yoke
    put(cyl(0.2 * W, 0.212 * W, 0.2, o.pants ? LEG : TORSO, 0.012, 18), 0, 0.98, 0, g);
    put(cyl(0.245 * W, 0.2 * W, 0.42, TORSO, 0.012, 18), 0, 1.27, 0, g);
    put(sph(0.245 * W, o.yoke || TORSO, 0.012, 18, 10), 0, 1.47, 0, g).scale.set(1, 0.42, 0.92);
    put(cyl(0.206 * W, 0.206 * W, 0.05, DARK, 0, 18), 0, 1.075, 0, g);
    if (o.belly) put(sph(0.2 * W, TORSO, 0.01, 16, 10), 0, 1.16, 0.062 * W, g).scale.set(1.08, 0.92, 0.9);
    tape(0.226 * W, 1.24, g, 0.055);
    for (const sx of [-1, 1]) {
      if (o.plain) continue;
      const st = put(box(0.05, 0.27, 0.014, TAPE, 0), sx * 0.115 * W, 1.385, 0.222 * W, g); st.rotation.x = -0.1;
      const sv = put(box(0.018, 0.27, 0.016, SILVER, 0), sx * 0.115 * W, 1.385, 0.223 * W, g); sv.rotation.x = -0.1;
      const pk = put(box(0.1, 0.085, 0.016, DARK, 0.004), sx * 0.115 * W, 1.14, 0.2 * W, g); pk.rotation.x = -0.1;
      const col = put(box(0.11, 0.05, 0.07, DARK, 0.005), sx * 0.065, 1.535, 0.085, g); col.rotation.z = sx * -0.5; col.rotation.y = sx * 0.3;
    }
    if (!o.plain) { const zip = put(box(0.016, 0.44, 0.012, 0x1d2430, 0), 0, 1.3, 0.228 * W, g); zip.rotation.x = -0.1; }
    const PZ = o.vest ? 0.266 : 0.228;                 // how far forward the name patch sits
    if (o.vest) {                                       // a hi-vis vest worn over the top
      put(cyl(0.256 * W, 0.216 * W, 0.4, o.vest, 0.01, 18), 0, 1.275, 0, g);
      put(sph(0.258 * W, o.vest, 0.01, 18, 10), 0, 1.472, 0, g).scale.set(1, 0.44, 0.95);
      if (!o.vestPlain) { put(cyl(0.243 * W, 0.238 * W, 0.05, TAPE, 0, 18), 0, 1.2, 0, g); put(cyl(0.2445 * W, 0.2395 * W, 0.018, SILVER, 0, 18), 0, 1.2, 0, g); }      // a costume's waistcoat has no reflective tape
      for (const sx of o.vestPlain ? [] : [-1, 1]) { const vs = put(box(0.05, 0.3, 0.012, TAPE, 0), sx * 0.115 * W, 1.38, 0.249 * W, g); vs.rotation.x = -0.1; const v2 = put(box(0.018, 0.3, 0.014, SILVER, 0), sx * 0.115 * W, 1.38, 0.25 * W, g); v2.rotation.x = -0.1; }
    }
    if (!o.plain) put(box(0.108, 0.044, 0.012, 0xf4f1e6, 0.002), -0.122 * W, 1.455, PZ * W, g).rotation.x = -0.1;      // name patch, sewn on over the strap
    if (o.patch && !o.plain) {
      const tx = canvasTex(256, 96, (c) => {
        c.fillStyle = '#f7f5ec'; c.fillRect(0, 0, 256, 96); c.strokeStyle = '#24468f'; c.lineWidth = 9; c.strokeRect(6, 6, 244, 84);
        c.fillStyle = '#1d3a7a'; c.textAlign = 'center'; c.textBaseline = 'middle';
        let px = 58; do { c.font = `italic 700 ${px}px Georgia, "Times New Roman", serif`; px -= 4; } while (c.measureText(o.patch).width > 214 && px > 20);
        c.fillText(o.patch, 128, 51);
      });
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.106, 0.042), new THREE.MeshBasicMaterial({ map: tx }));
      pm.position.set(-0.122 * W, 1.4557, PZ * W + 0.0066); pm.rotation.x = -0.1; g.add(pm);
    }
    put(cyl(0.068, 0.08, 0.1, o.skin, 0.006, 12), 0, 1.555, 0, g);                                      // neck
    if (o.shirt) put(cyl(0.084, 0.104, 0.04, o.shirt, 0.004, 16), 0, 1.524, 0.008, g);        // the neck of a shirt under the coveralls
    if (o.hangGlasses) {                                // safety glasses hanging on a cord at the chest
      for (const sx of [-1, 1]) {
        put(box(0.05, 0.03, 0.012, 0x1a1c1f, 0.002), sx * 0.03, 1.365, 0.236 * W, g).rotation.x = -0.1;
        const cd = put(box(0.006, 0.19, 0.006, 0x1a1c1f, 0), sx * 0.066, 1.455, 0.2 * W, g); cd.rotation.z = sx * 0.2; cd.rotation.x = 0.42;
      }
    }
    if (o.chain) { const ch = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.0065, 6, 24), toon(0xd9dde2)); ch.position.set(0, 1.535, 0.02); ch.rotation.x = Math.PI / 2 - 0.45; g.add(ch); }
    if (o.hood) {
      put(sph(0.14, o.hood, 0.01, 14, 10), 0, 1.565, -0.125, g).scale.set(1.3, 0.6, 0.82);
      put(cyl(0.092, 0.118, 0.05, o.hood, 0.006, 16), 0, 1.528, 0.012, g);
    }
    // arms: shoulder, upper arm, elbow, forearm, glove
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 0.285 * W, 1.46, 0); g.add(sh);
      put(sph(0.092 * W, ARM, 0.01, 12, 8), 0, 0, 0, sh);
      put(cap(0.07 * W, 0.2, ARM, 0.01), 0, -0.17, 0, sh);
      tape(0.074 * W, -0.2, sh, 0.04);
      const el = new THREE.Group(); el.position.set(0, -0.33, 0); sh.add(el);
      put(sph(0.066 * W, ARM, 0.008, 10, 8), 0, 0, 0, el);
      put(cap(0.06 * W, 0.17, ARM, 0.01), 0, -0.14, 0, el);
      put(cyl(0.064, 0.072, 0.065, CUFFC, 0.006, 12), 0, -0.265, 0, el);
      put(sph(0.068, o.glove || GLOVE, 0.008, 12, 8), 0, -0.34, 0.005, el).scale.set(0.82, 1.08, 1);
      const th = put(cap(0.021, 0.035, o.glove || GLOVE, 0.004), sx * -0.045, -0.325, 0.045, el); th.rotation.x = 0.9; th.rotation.z = sx * 0.4;
      p.arms.push(sh); p.fores.push(el);
    }
    if (o.extras) dressUp(p, g, o, W);
    // ---- head: a kit of parts. Each part is chosen or tuned by the person's look (see js/crew.js for the list) ----
    const head = new THREE.Group(); head.position.set(0, 1.72, 0); g.add(head); p.head = head;
    const F = Object.assign({ w: 1, len: 1, jaw: 1, nose: 1 }, o.face);          // face shape
    const basic = c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
    const G = o.glasses || 'wrap', hairStyle = o.hairStyle || 'short';
    const BS = o.beardSize || 1, fullBeard = !!o.beard && o.beardStyle === 'full', proud = 0.03 + 0.131 * BS;    // how far a full beard stands out at the mouth
    // hair under the hat
    if (o.hair && hairStyle !== 'bald') put(sph(0.152, o.hair, 0.008, 14, 10), 0, -0.02, -0.045, head).scale.set(1.02, 0.95, 0.9);
    if (o.hair && hairStyle === 'curly') {              // curls showing round the back and sides, below the hat
      for (let i = 0; i < 9; i++) {
        const an = -1.55 + i * 0.3875, r = 0.036 + (i % 2) * 0.006;
        put(sph(r, o.hair, 0.006, 8, 6), Math.sin(an) * 0.148, -0.03 - (i % 3) * 0.018, -Math.cos(an) * 0.15 - 0.012, head);
      }
    }
    if (o.hair && hairStyle === 'mullet') {             // long at the back, flicking out below the hat
      put(sph(0.11, o.hair, 0.008, 14, 10), 0, -0.1, -0.105, head).scale.set(1.28, 1.15, 0.62);
      for (const sx of [-1, 1]) { put(sph(0.045, o.hair, 0.006, 10, 8), sx * 0.142, -0.05, -0.05, head).scale.set(0.7, 1.3, 1); put(sph(0.034, o.hair, 0.005, 8, 6), sx * 0.118, -0.165, -0.115, head); }
    }
    if (o.hair && hairStyle === 'long') {               // down past the ears to the shoulders, flicking out at the ends
      put(sph(0.115, o.hair, 0.008, 14, 10), 0, -0.1, -0.1, head).scale.set(1.3, 1.25, 0.62);
      for (const sx of [-1, 1]) {
        const sd = put(cap(0.036, 0.13, o.hair, 0.006), sx * 0.168, -0.085, -0.012, head); sd.rotation.z = sx * 0.1;
        put(sph(0.04, o.hair, 0.006, 10, 8), sx * 0.196, -0.185, 0.0, head).scale.set(1.1, 0.8, 1);
        put(sph(0.03, o.hair, 0.005, 8, 6), sx * 0.15, -0.2, -0.09, head);
      }
    }
    if (o.hair && hairStyle === 'dreads') {             // short dreadlocks sticking out below the hat, all round the back and sides
      for (let i = 0; i < 15; i++) {
        const an = -2.05 + i * (4.1 / 14), sn = Math.sin(an), cs = -Math.cos(an), len = 0.095 + (i % 3) * 0.024;
        const lk = put(cap(0.0145, len, o.hair, 0.004), sn * 0.176, -0.035 - len * 0.34 - (i % 2) * 0.012, cs * 0.172 - 0.01, head);
        lk.rotation.z = -sn * 0.5; lk.rotation.x = cs * 0.5;
        const l2 = put(cap(0.013, 0.06, o.hair, 0.004), sn * 0.156, 0.01, cs * 0.158 - 0.01, head); l2.rotation.z = -sn * 0.95; l2.rotation.x = cs * 0.95;
      }
    }
    if (o.hair && hairStyle === 'braid') {              // long hair in a braid, hanging over one shoulder
      put(sph(0.07, o.hair, 0.006, 12, 8), 0.02, -0.07, -0.12, head).scale.set(1.3, 1, 0.7);
      const BR = [[0.11, -0.08, -0.08], [0.14, -0.13, -0.03], [0.158, -0.165, 0.045], [0.166, -0.212, 0.195], [0.166, -0.268, 0.232], [0.162, -0.322, 0.236]];   // up over the shoulder and down the chest
      BR.forEach((q, i) => put(sph(0.034 - i * 0.002, o.hair, 0.005, 8, 6), q[0] * W, q[1], q[2] * (i > 2 ? W : 1), head));
      put(sph(0.017, 0x2b2f33, 0.003, 8, 6), 0.16 * W, -0.36, 0.232 * W, head);
    }
    if (o.hair && o.sideburns) for (const sx of [-1, 1]) put(box(0.008, 0.05, 0.022, o.hair, 0), sx * 0.151 * F.w, 0.0, 0.04, head);
    // skull, jaw, ears, nose
    put(sph(0.165, o.skin, 0.012, 20, 14), 0, 0, 0, head).scale.set(0.95 * F.w, 1.05 * F.len, 1);
    put(sph(0.13, o.skin, 0.01, 16, 10), 0, -0.085 * F.len, 0.03, head).scale.set(0.96 * F.w * F.jaw, 0.75 * F.len, 0.95);
    for (const sx of [-1, 1]) put(sph(0.036, o.skin, 0.005, 8, 6), sx * 0.158 * F.w, -0.02, -0.005, head).scale.set(0.5, 1, 0.8);
    put(sph(0.036, o.nose || o.skin, 0.005, 10, 8), 0, -0.04, 0.165, head).scale.set(0.9 * F.nose, F.nose, 1.1 * F.nose);
    if (o.moles) for (const [mx, my, mz, mr] of o.moles) { const ml = new THREE.Mesh(new THREE.SphereGeometry(mr || 0.006, 8, 6), basic(0x3a2418)); ml.position.set(mx, my, mz); ml.scale.z = 0.4; head.add(ml); }   // moles: [x, y, z, size] on the head
    if (o.lines) {                                      // an older face: crow's feet, bags under the eyes, lines beside the mouth
      const lc = new THREE.Color(o.skin).multiplyScalar(0.68).getHex();
      for (const sx of [-1, 1]) {
        for (const dz of [-0.35, 0.3]) { const cf = put(box(0.022, 0.004, 0.006, lc, 0), sx * 0.108 * F.w, 0.008 + dz * 0.03, 0.118, head); cf.rotation.y = sx * 0.9; cf.rotation.z = sx * dz; }
        const bg = put(box(0.036, 0.004, 0.006, lc, 0), sx * 0.06 * F.w, -0.014, 0.151, head); bg.rotation.y = sx * 0.3; bg.rotation.z = sx * -0.12;
        const nl = put(box(0.005, 0.04, 0.006, lc, 0), sx * 0.05, -0.078 * F.len, 0.148, head); nl.rotation.z = sx * 0.42; nl.rotation.y = sx * 0.35;
      }
    }
    if (o.plugs) for (const sx of [-1, 1]) { const pg = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), basic(o.plugs)); pg.position.set(sx * 0.176 * F.w, -0.02, 0.0); pg.scale.set(1.2, 1, 1); head.add(pg); }   // foam ear plugs
    if (o.cheeks) {                                     // rosy cheeks
      const cm = new THREE.MeshBasicMaterial({ color: o.cheeks, transparent: true, opacity: 0.42, depthWrite: false });
      for (const sx of [-1, 1]) { const ch = new THREE.Mesh(new THREE.CircleGeometry(0.03, 18), cm); ch.position.set(sx * 0.094 * F.w, -0.04, 0.131); ch.rotation.y = sx * 0.62; ch.rotation.x = 0.1; head.add(ch); }
    }
    if (o.stubble) {                                    // a shadow of stubble over the jaw
      const sm = new THREE.MeshToonMaterial({ color: o.stubble, gradientMap: grad, transparent: true, opacity: o.stubbleA || 0.2, depthWrite: false });
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.1315, 16, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), sm);
      st.position.set(0, -0.085 * F.len, 0.03); st.scale.set(0.96 * F.w * F.jaw, 0.75 * F.len, 0.95); head.add(st);
    }
    // mouth: a plain line, or a grin with teeth. p.mouth is the part that moves when they talk
    if (o.smile === 'closed') {                         // lips pressed together, turned up at the ends
      const ar = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.0055, 6, 18, Math.PI * 0.62), basic(0x6a2f24));
      ar.rotation.z = Math.PI + (Math.PI * 0.38) / 2; ar.position.set(0, -0.092 * F.len, 0.151); ar.rotation.x = 0.3; head.add(ar); p.mouth = ar;
      for (const sx of [-1, 1]) { const dm = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), basic(0x6a2f24)); dm.position.set(sx * 0.036, -0.115 * F.len, 0.143); head.add(dm); }
    } else if (o.smile) {
      const mg = new THREE.Group(); mg.position.set(0, -0.104 * F.len, fullBeard ? proud + 0.012 : 0.154); mg.rotation.x = fullBeard ? 0.2 : 0.36; head.add(mg); p.mouth = mg;
      mg.add(new THREE.Mesh(new THREE.CircleGeometry(0.037, 22, Math.PI, Math.PI), basic(0xfffdf4)));
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.0052, 6, 22, Math.PI), basic(0x4a2018)); lip.rotation.z = Math.PI; mg.add(lip);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.008, 0.008), basic(0x4a2018)); mg.add(top);
      if (o.tongue) { const tg = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 8), basic(0xe8707e)); tg.position.set(0, -0.03, 0.006); tg.scale.set(0.95, 1.25, 0.4); mg.add(tg); }
    } else {
      p.mouth = put(box(0.066, fullBeard ? 0.017 : 0.013, 0.02, fullBeard ? 0xc46a66 : 0x5a2a20, 0), 0, -0.118 * F.len, fullBeard ? proud : 0.14, head);
      if (o.smirk) { p.mouth.rotation.z = 0.16; p.mouth.position.x = 0.006; }
    }
    // eyewear: 'wrap' mirrored shades, 'round' glasses (mirrored unless lensClear), or 'none'
    const eyes = G === 'none' || G === 'clear' || G === 'up' || G === 'square' || (G === 'round' && o.lensClear) || G === 'monocle' || G === '3d' || G === 'shutter';
    if (eyes && o.eyeStyle === 'happy') {               // squeezed shut in a laugh: two little arches
      for (const sx of [-1, 1]) {
        const ar = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0048, 6, 14, Math.PI), basic(0x2a1a10));
        ar.position.set(sx * 0.06 * F.w, 0.002, 0.152); ar.rotation.y = sx * 0.3; head.add(ar);
      }
    } else if (eyes) {
      for (const sx of [-1, 1]) {
        const wide = o.eyeStyle === 'wide';
        put(sph(0.022, 0xfffdf4, 0.003, 10, 8), sx * 0.06 * F.w, 0.008, 0.142, head).scale.set(1.08, wide ? 0.86 : 0.6, 0.5);
        if (!wide) put(box(0.05, 0.008, 0.012, o.skin, 0), sx * 0.06 * F.w, 0.021, 0.15, head).rotation.y = sx * 0.3;      // upper eyelid
        const ir = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 12, 8), basic(o.eye || 0x4a2f1b)); ir.position.set(sx * 0.06 * F.w, 0.007, 0.151); ir.scale.z = 0.5; head.add(ir);
        const pu = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), basic(0x14100c)); pu.position.set(sx * 0.06 * F.w, 0.007, 0.1565); pu.scale.z = 0.5; head.add(pu);
      }
    }
    // ---- eyewear from the swag shop (js/swag.js) ----
    const eyeAt = sx => { const gl = new THREE.Group(); gl.position.set(sx * 0.064 * F.w, 0.006, 0.156); gl.rotation.y = sx * 0.3; head.add(gl); return gl; };
    const arc = (r, h, a, mat, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true, -a, a * 2), mat); m.position.set(0, y, 0.004); head.add(m); return m; };
    const strap = (r, h, a, col, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true, a, Math.PI * 2 - a * 2), basic(col)); m.position.set(0, y, 0); head.add(m); return m; };
    if (G === 'laser') {                                // a black visor with a red beam across it
      arc(0.176, 0.064, 1.25, basic(0x16181b), 0.012); arc(0.178, 0.018, 1.05, basic(0xff2a1a), 0.012);
      arc(0.18, 0.04, 1.05, new THREE.MeshBasicMaterial({ color: 0xff6a4a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), 0.012);
      for (const sx of [-1, 1]) put(box(0.022, 0.05, 0.16, 0x16181b, 0), sx * 0.168, 0.02, -0.01, head);
    } else if (G === 'swim') {                          // little blue cups on a strap
      for (const sx of [-1, 1]) {
        const gl = eyeAt(sx);
        put(cyl(0.041, 0.035, 0.03, 0x1b4f8f, 0.004, 18), 0, 0, 0.008, gl).rotation.x = Math.PI / 2;
        const ln = new THREE.Mesh(new THREE.CircleGeometry(0.032, 20), new THREE.MeshBasicMaterial({ map: lensTex(['#d3f1ff', '#3aa0e8', '#0d4f9c']) })); ln.position.z = 0.0245; gl.add(ln);
      }
      put(box(0.034, 0.012, 0.012, 0x1b4f8f, 0), 0, 0.012, 0.172, head);
      strap(0.158, 0.018, 0.95, 0x111418, 0.012);
    } else if (G === 'ski') {                           // big mirrored ski goggles
      arc(0.18, 0.108, 1.1, new THREE.MeshBasicMaterial({ map: lensTex(['#ffd06a', '#ff5a2a', '#7a2ad6']), side: THREE.DoubleSide }), 0.016);
      arc(0.184, 0.02, 1.16, basic(0xf4f4ee), 0.078); arc(0.184, 0.02, 1.16, basic(0xf4f4ee), -0.046);
      for (const sx of [-1, 1]) put(box(0.03, 0.13, 0.03, 0xf4f4ee, 0), sx * 0.162, 0.016, 0.085, head);
      strap(0.162, 0.05, 1.05, 0x1c1f24, 0.016); strap(0.1635, 0.014, 1.05, 0xff5a2a, 0.016);
    } else if (G === '3d' || G === 'shutter') {         // paper 3D glasses, or slatted shutter shades
      const fc = G === '3d' ? 0xf4f4ee : 0x35e06a;
      for (const sx of [-1, 1]) {
        const gl = eyeAt(sx);
        if (G === '3d') { const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.058), new THREE.MeshBasicMaterial({ color: sx < 0 ? 0xe0362b : 0x22c7d6, transparent: true, opacity: 0.78, depthWrite: false })); ln.position.z = 0.004; gl.add(ln); }
        else for (let i = 0; i < 4; i++) put(box(0.09, 0.008, 0.01, fc, 0), 0, 0.0225 - i * 0.015, 0.004, gl);
        for (const [w, h, x, y] of [[0.1, 0.011, 0, 0.034], [0.1, 0.011, 0, -0.034], [0.011, 0.079, 0.0495, 0], [0.011, 0.079, -0.0495, 0]]) put(box(w, h, 0.012, fc, 0), x, y, 0.004, gl);
        put(box(0.011, 0.014, 0.15, fc, 0), sx * 0.142 * F.w, 0.022, 0.07, head).rotation.y = -sx * 0.3;
      }
      put(box(0.03, 0.012, 0.012, fc, 0), 0, 0.024, 0.174, head);
    } else if (G === 'monocle') {                       // one lens, on a gold chain
      const gl = eyeAt(1);
      const ln = new THREE.Mesh(new THREE.CircleGeometry(0.047, 28), new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.3, depthWrite: false })); ln.position.z = 0.004; gl.add(ln);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.006, 8, 30), basic(0xf2c230)); rim.position.z = 0.004; gl.add(rim);
      put(box(0.005, 0.2, 0.005, 0xf2c230, 0), 0.118 * F.w, -0.13, 0.125, head).rotation.z = 0.16;
    } else if (G === 'heart' || G === 'star') {         // novelty shades
      const col = G === 'heart' ? 0xff4f9a : 0xffd23f;
      for (const sx of [-1, 1]) {
        const gl = eyeAt(sx);
        const sh = G === 'heart'
          ? flatShape((s) => { s.moveTo(0, -0.046); s.bezierCurveTo(-0.075, 0.0, -0.05, 0.062, 0, 0.026); s.bezierCurveTo(0.05, 0.062, 0.075, 0.0, 0, -0.046); }, col)
          : flatShape((s) => { for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? 0.026 : 0.058; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } }, col);
        sh.position.z = 0.006; gl.add(sh);
        put(box(0.01, 0.012, 0.15, col, 0), sx * 0.14 * F.w, 0.018, 0.07, head).rotation.y = -sx * 0.3;
      }
      put(box(0.03, 0.012, 0.012, col, 0), 0, 0.016, 0.174, head);
    } else if (G === 'googly') {                        // googly eyes, each looking its own way
      for (const sx of [-1, 1]) {
        put(sph(0.047, 0xfffdf4, 0.005, 14, 10), sx * 0.062 * F.w, 0.014, 0.14, head).scale.set(1, 1, 0.6);
        const pu = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 8), basic(0x14100c)); pu.position.set(sx * 0.062 * F.w + (sx < 0 ? -0.012 : 0.014), sx < 0 ? 0.03 : -0.006, 0.166); pu.scale.z = 0.5; head.add(pu);
      }
    } else if (G === 'wrap') {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.173, 0.166, 0.078, 28, 1, true, -1.18, 2.36), new THREE.MeshBasicMaterial({ map: lensTex(o.lens), side: THREE.DoubleSide }));
      lens.position.set(0, 0.012, 0.004); head.add(lens);
      const fr = new THREE.Mesh(new THREE.CylinderGeometry(0.177, 0.176, 0.02, 28, 1, true, -1.24, 2.48), basic(o.frame));
      fr.position.set(0, 0.056, 0.004); head.add(fr);
      const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.169, 0.168, 0.012, 28, 1, true, -1.2, 2.4), basic(0x1a1a1a));
      fb.position.set(0, -0.031, 0.004); head.add(fb);
      for (const sx of [-1, 1]) put(box(0.014, 0.026, 0.15, o.frame, 0), sx * 0.164, 0.03, -0.01, head);
      put(box(0.03, 0.03, 0.02, 0x1a1a1a, 0), 0, -0.02, 0.166, head);                                   // nose bridge
    } else if (G === 'up') {                            // wrap shades pushed up to sit on the front of the hat
      const ug = new THREE.Group(); ug.position.set(0, 0.128, 0.008); ug.rotation.x = -0.3; head.add(ug);
      ug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.197, 0.203, 0.062, 28, 1, true, -1.05, 2.1), new THREE.MeshBasicMaterial({ map: lensTex(o.lens), side: THREE.DoubleSide })));
      const uf = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 28, 1, true, -1.1, 2.2), basic(o.frame)); uf.position.y = 0.034; ug.add(uf);
      for (const sx of [-1, 1]) put(box(0.012, 0.02, 0.13, o.frame, 0), sx * 0.19, 0.01, -0.02, ug);
    } else if (G === 'clear') {                         // clear wrap-around safety glasses
      const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.174, 0.168, 0.07, 28, 1, true, -1.2, 2.4), new THREE.MeshBasicMaterial({ color: 0xe8f7ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      cl.position.set(0, 0.012, 0.004); head.add(cl);
      const ed = new THREE.Mesh(new THREE.CylinderGeometry(0.1755, 0.1755, 0.007, 28, 1, true, -1.2, 2.4), basic(0xdfe8ee)); ed.position.set(0, 0.05, 0.004); head.add(ed);
      const e2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1695, 0.1695, 0.005, 28, 1, true, -1.2, 2.4), basic(0xdfe8ee)); e2.position.set(0, -0.024, 0.004); head.add(e2);
      for (const sx of [-1, 1]) put(box(0.01, 0.014, 0.15, 0xcfd8de, 0), sx * 0.166, 0.03, -0.01, head);
    } else if (G === 'square') {                        // chunky rectangular glasses with clear lenses
      const lm = new THREE.MeshBasicMaterial({ color: 0xe8f7ff, transparent: true, opacity: 0.22, depthWrite: false });
      for (const sx of [-1, 1]) {
        const gl = new THREE.Group(); gl.position.set(sx * 0.064 * F.w, 0.006, 0.156); gl.rotation.y = sx * 0.3; head.add(gl);
        const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.058), lm); ln.position.z = 0.004; gl.add(ln);
        for (const [w, h, x, y] of [[0.1, 0.011, 0, 0.034], [0.1, 0.011, 0, -0.034], [0.011, 0.079, 0.0495, 0], [0.011, 0.079, -0.0495, 0]]) put(box(w, h, 0.012, o.frame, 0), x, y, 0.004, gl);
        const ga = put(box(0.011, 0.014, 0.15, o.frame, 0), sx * 0.142 * F.w, 0.022, 0.07, head); ga.rotation.y = -sx * 0.3;
      }
      put(box(0.03, 0.012, 0.012, o.frame, 0), 0, 0.024, 0.174, head);
    } else if (G === 'round') {
      const lm = o.lensClear ? new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.28, depthWrite: false })
        : new THREE.MeshBasicMaterial({ map: lensTex(o.lens), side: THREE.DoubleSide });
      for (const sx of [-1, 1]) {
        const gl = new THREE.Group(); gl.position.set(sx * 0.064 * F.w, 0.006, 0.156); gl.rotation.y = sx * 0.3; head.add(gl);
        const ln = new THREE.Mesh(new THREE.CircleGeometry(0.047, 28), lm); ln.position.z = 0.004; gl.add(ln);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.048, o.wire ? 0.003 : 0.0065, 8, 30), basic(o.frame)); rim.position.z = 0.004; gl.add(rim);
        const ga = put(box(o.wire ? 0.005 : 0.009, o.wire ? 0.005 : 0.011, 0.15, o.frame, 0), sx * 0.137 * F.w, 0.018, 0.072, head); ga.rotation.y = -sx * 0.3;   // arm back to the ear
      }
      put(box(0.036, o.wire ? 0.005 : 0.011, o.wire ? 0.006 : 0.012, o.frame, 0), 0, 0.02, 0.172, head);                                  // bridge
    }
    // eyebrows (hidden by wrap shades)
    if (o.brow && G !== 'wrap' && !['laser', 'ski', 'swim', 'googly', 'heart', 'star'].includes(G)) {
      for (const sx of [-1, 1]) {
        const br = put(box(0.056, 0.013 * (o.browT || 1), 0.014, o.brow, 0), sx * 0.062 * F.w, G === 'round' || G === 'square' || G === '3d' || G === 'shutter' || G === 'monocle' ? 0.066 : G === 'clear' ? 0.064 : 0.05, 0.146, head);
        br.rotation.z = sx * -0.14; br.rotation.y = sx * 0.3;
      }
    }
    // moustache: 'full' (the big one) or 'thin'
    if (o.stache && o.stacheStyle === 'thin') {
      put(sph(0.0085, o.stache, 0.002, 8, 6), 0, -0.083 * F.len, 0.158, head).scale.set(1.6, 0.8, 0.8);
      for (const sx of [-1, 1]) {
        const m1 = put(cap(0.0062, 0.036, o.stache, 0.002), sx * 0.027, -0.086 * F.len, 0.155, head);
        m1.rotation.z = -sx * (Math.PI / 2 + (o.stacheFlat ? 0.05 : 0.16)); m1.rotation.y = sx * 0.3;
        if (o.stacheFlat) continue;                     // straight across, no droop at the ends
        const m2 = put(cap(0.0055, 0.012, o.stache, 0.002), sx * 0.052, -0.094 * F.len, 0.146, head);
        m2.rotation.z = -sx * (Math.PI / 2 + 0.75); m2.rotation.y = sx * 0.45;
      }
    } else if (o.stache && o.stacheStyle === 'horseshoe') {
      const mz = fullBeard ? proud + 0.007 : 0.156;
      put(sph(0.014, o.stache, 0.003, 8, 6), 0, -0.084 * F.len, mz + 0.003, head).scale.set(1.5, 0.9, 0.8);
      for (const sx of [-1, 1]) {
        const m1 = put(cap(0.0135, 0.04, o.stache, 0.003), sx * 0.032, -0.089 * F.len, mz, head);
        m1.rotation.z = -sx * (Math.PI / 2 + 0.3); m1.rotation.y = sx * 0.3;
        const m2 = put(cap(0.0115, 0.04, o.stache, 0.003), sx * 0.062, -0.125 * F.len, mz - 0.017, head);
        m2.rotation.z = sx * 0.12; m2.rotation.y = sx * 0.4;
      }
    } else if (o.stache && o.stacheStyle === 'medium') {
      const mz = fullBeard ? proud + 0.007 : 0.156;
      for (const sx of [-1, 1]) {
        const SS = o.stacheSize || 1;
        const m1 = put(cap(0.0125 * SS, 0.04, o.stache, 0.003), sx * 0.03, (-0.09 - (SS - 1) * 0.008) * F.len, mz + (SS - 1) * 0.006, head);
        m1.rotation.z = -sx * (Math.PI / 2 + 0.22); m1.rotation.y = sx * 0.3;
      }
    } else if (o.stache) {
      for (const sx of [-1, 1]) {
        const m1 = put(sph(0.044, o.stache, 0.005, 10, 8), sx * 0.04, -0.088, 0.152, head); m1.scale.set(1.35, 0.6, 0.62); m1.rotation.z = sx * -0.35;
        put(sph(0.022, o.stache, 0.004, 8, 6), sx * 0.092, -0.118, 0.13, head);
      }
    }
    // beard: 'goatee' = a tuft on the chin, 'full' = round the whole jaw
    if (o.beard && o.beardStyle === 'full') {
      const bd = put(M(new THREE.SphereGeometry(0.139, 18, 10, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), o.beard, 0.006), 0, -0.085 * F.len, 0.03, head);
      bd.scale.set(0.97 * F.w * F.jaw * BS, 0.82 * F.len * BS * (BS > 1 ? 1.12 : 1), 0.97 * BS);
    } else if (o.beard) {
      put(sph(0.046, o.beard, 0.004, 12, 8), 0, -0.15 * F.len, 0.117, head).scale.set(1.25, 0.82, 0.6);
      put(sph(0.015, o.beard, 0.002, 8, 6), 0, -0.132 * F.len, 0.139, head).scale.set(1.3, 0.8, 0.6);
    }
    if (o.tail) { const t = put(cap(0.042, 0.2, o.hair, 0.008), 0, -0.12, -0.2, head); t.rotation.x = 0.45; put(sph(0.03, 0xe0362b, 0.004, 8, 6), 0, -0.03, -0.17, head); }
    // hard hat: dome, brim ('cap' with a front peak, or 'full' brim all the way round), top ridge, optional ear muffs swung up
    const hat = new THREE.Group(); hat.position.set(0, 0.07, 0); head.add(hat);
    if (o.hatKit && swagHat(o.hatKit, hat, o)) {           // a hat from the swag shop that is not a hard hat (js/swag.js)
    } else if (o.hatStyle === 'cowboy') {                 // a western hard hat: tall creased crown, wide brim curled up at the sides
      put(cyl(0.158, 0.184, 0.15, o.hat, 0.01, 22), 0, 0.085, 0, hat).scale.set(1, 1, 1.12);
      put(sph(0.158, o.hat, 0.01, 18, 10), 0, 0.16, 0, hat).scale.set(1, 0.3, 1.12);
      put(cap(0.03, 0.2, o.hatTrim, 0), 0, 0.2, 0, hat).rotation.x = Math.PI / 2;                        // the crease along the top
      put(cyl(0.187, 0.187, 0.03, o.hatTrim, 0, 22), 0, 0.03, 0, hat).scale.set(1, 1, 1.12);             // hat band
      put(cyl(0.3, 0.31, 0.016, o.hat, 0.008, 30), 0, 0.006, 0.01, hat).scale.set(0.9, 1, 1.12);
      for (const sx of [-1, 1]) {
        const fl = put(box(0.1, 0.014, 0.5, o.hat, 0.007), sx * 0.285, 0.036, 0.01, hat); fl.rotation.z = sx * 0.75;
        const roll = put(cap(0.017, 0.46, o.hat, 0.006), sx * 0.322, 0.073, 0.01, hat); roll.rotation.x = Math.PI / 2;
      }
    } else {
      put(M(new THREE.SphereGeometry(0.186, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), o.hat, 0.01), 0, 0, 0, hat).scale.set(1, 0.98, 1.08);
      if (o.hatStyle === 'full') {
        put(cyl(0.252, 0.262, 0.02, o.hat, 0.008, 30), 0, 0.004, 0.005, hat).scale.set(1, 1, 1.1);
        put(cyl(0.196, 0.2, 0.03, o.hatTrim, 0, 24), 0, 0.022, 0, hat).scale.set(1, 1, 1.08);
      } else {
        put(cyl(0.203, 0.207, 0.022, o.hat, 0.008, 24), 0, 0.006, 0, hat).scale.set(1, 1, 1.08);
        put(cyl(0.15, 0.15, 0.02, o.hat, 0.008, 20), 0, 0.004, 0.14, hat).scale.set(1, 1, 0.8);
      }
      const ridge = put(cap(0.024, 0.24, o.hatTrim, 0.006), 0, 0.172, -0.005, hat); ridge.rotation.x = Math.PI / 2;
      put(box(0.07, 0.045, 0.01, 0xf4f1e6, 0), 0, 0.075, 0.186, hat).rotation.x = -0.42;
      if (o.hatFlag === 'israel') {                     // a flag sticker on the front of the hat
        const ft = canvasTex(220, 160, (c) => {
          c.fillStyle = '#ffffff'; c.fillRect(0, 0, 220, 160);
          c.fillStyle = '#0038b8'; c.fillRect(0, 18, 220, 24); c.fillRect(0, 118, 220, 24);
          c.strokeStyle = '#0038b8'; c.lineWidth = 7; c.lineJoin = 'miter';
          for (const up of [1, -1]) { c.beginPath(); for (let i = 0; i < 3; i++) { const an = -Math.PI / 2 * up + i * Math.PI * 2 / 3; const x = 110 + Math.cos(an) * 30, y = 80 + Math.sin(an) * 30; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); c.stroke(); }
        });
        const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.076, 0.055), new THREE.MeshBasicMaterial({ map: ft }));
        fm.position.set(0, 0.0775, 0.1925); fm.rotation.x = -0.42; hat.add(fm);
      }
    }
    if (o.liner) {                                      // a quilted winter liner under the hat, down over the ears and neck
      const lm = new THREE.MeshToonMaterial({ color: o.liner, gradientMap: grad, side: THREE.DoubleSide });
      const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.183, 0.2, 0.2, 22, 1, true, Math.PI * 0.42, Math.PI * 1.16), lm);
      ln.position.set(0, -0.1, -0.008); ln.scale.set(1, 1, 1.06); hat.add(ln);
    }
    if (o.lamp) {                                       // a headlamp strapped to the front of the hat
      put(cyl(0.192, 0.196, 0.022, 0x17181b, 0, 24), 0, 0.085, 0, hat).scale.set(1, 1, 1.08);
      put(box(0.1, 0.05, 0.04, 0x1b1c1f, 0.004), 0, 0.105, 0.19, hat).rotation.x = -0.35;
      const ll = new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), basic(0xffe9a0)); ll.position.set(0, 0.112, 0.214); ll.rotation.x = -0.35; hat.add(ll);
    }
    if (o.muffs) {
      const mc = o.muffCol || 0x3a3f44;
      for (const sx of [-1, 1]) {
        put(box(0.03, 0.045, 0.045, 0x2b2f33, 0.004), sx * 0.192, 0.042, -0.03, hat);                   // the clip on the side of the hat
        if (o.muffs === 'down') {                       // over the ears
          put(box(0.014, 0.1, 0.02, mc, 0.003), sx * 0.2, -0.02, -0.02, hat);
          const cup = put(cyl(0.07, 0.064, 0.052, mc, 0.006, 18), sx * 0.19, -0.1, -0.012, hat); cup.rotation.z = sx * Math.PI / 2; cup.scale.set(1, 1, 1.18);
        } else {                                        // swung up against the back of the dome
          const arm = put(box(0.012, 0.085, 0.018, 0x2b2f33, 0.003), sx * 0.19, 0.088, -0.06, hat); arm.rotation.x = -0.75; arm.rotation.z = sx * 0.2;
          const cup = put(cyl(0.056, 0.05, 0.048, mc, 0.006, 16), sx * 0.158, 0.128, -0.105, hat); cup.rotation.z = sx * 1.2; cup.rotation.x = -0.45;
        }
      }
    }
    if (o.noseBall) put(sph(0.036, o.noseBall, 0.005, 12, 9), 0, -0.035 * F.len, 0.168, head);      // a clown's nose
    if (o.soother) {                                    // a baby's soother, plugged in
      put(cyl(0.034, 0.034, 0.01, o.soother, 0.004, 14), 0, -0.118 * F.len, 0.166, head).rotation.x = Math.PI / 2;
      const rg = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 16), basic(0xfdfdf8)); rg.position.set(0, -0.118 * F.len - 0.012, 0.188); rg.rotation.x = 0.5; head.add(rg);
    }
    p.rod = put(cyl(0.05, 0.05, 2.6, 0xd4d8dc, 0.008, 10), 0.26, 1.58, 0, g); p.rod.rotation.x = Math.PI / 2; p.rod.visible = false;
    if (o.height) { g.scale.setScalar(o.height); head.scale.setScalar(1 / o.height); }
    (o.parent || scene).add(g);
    return p;
  }
  function buildCrew() {
    const who = id => ROSTER.find(p => p.id === id).look, def = ROSTER.defaults();
    R.dale = makePerson(who(def.lead)); R.tess = makePerson(who(def.core));
    R.dale.g.position.set(-0.92, 0, 0.72); R.tess.g.position.set(-0.72, 0, 5.5);
  }
  // sim crew positions are 2D "scene pixels"; map them to paths on the 3D site
  const PATHS = {
    dale: [[430, -3.1, 1.4], [600, -0.5, 0.36], [612, -0.92, 0.72], [792, -2.25, 2.7]],
    tess: [[110, -5.3, 7.9], [400, -0.5, 7.6], [700, 0.55, 3.9], [850, -0.6, 4.9], [905, -0.72, 5.5]],
  };
  function pathPos(id, px) {
    const P = PATHS[id];
    if (px <= P[0][0]) return V(P[0][1], 0, P[0][2]);
    for (let i = 1; i < P.length; i++) {
      if (px <= P[i][0] || i === P.length - 1) {
        const a = P[i - 1], b = P[i], k = clamp((px - a[0]) / (b[0] - a[0]), 0, 1);
        return V(lerp(a[1], b[1], k), 0, lerp(a[2], b[2], k));
      }
    }
  }

  // the driller's own legs (seen when looking down)
  function buildDriller() {
    const fwd = V(-Math.sin(BASE_YAW), 0, -Math.cos(BASE_YAW)), right = V(-fwd.z, 0, fwd.x);
    R.fwd = fwd; R.right = right;
    R.legs = new THREE.Group(); scene.add(R.legs);
    for (const s of [-1, 1]) {
      const p = EYE.clone().addScaledVector(right, s * 0.12).addScaledVector(fwd, -0.12);
      put(cap(0.09, 0.62, 0x2c62b0, 0.01), p.x, 0.75, p.z, R.legs);
      put(cyl(0.094, 0.094, 0.05, TAPE, 0, 14), p.x, 0.55, p.z, R.legs);
      put(cyl(0.095, 0.095, 0.018, SILVER, 0, 14), p.x, 0.55, p.z, R.legs);
      put(box(0.17, 0.13, 0.3, BOOT, 0.01), p.x + fwd.x * 0.06, 0.32, p.z + fwd.z * 0.06, R.legs).rotation.y = BASE_YAW;
    }
    const grate = box(1.5, 0.25, 1.3, 0x5b6166, 0.012); put(grate, EYE.x - 0.1, 0.125, EYE.z); grate.rotation.y = BASE_YAW;
    for (const s of [-1, 1]) {
      for (const f of [-0.5, 0.35]) put(box(0.06, 1.0, 0.06, 0xd9c23a, 0.008), EYE.x + R.right.x * s * 0.72 + fwd.x * f - 0.1 * fwd.x, 0.75, EYE.z + R.right.z * s * 0.72 + fwd.z * f - 0.1 * fwd.z);
      const rail = box(0.06, 0.06, 0.95, 0xd9c23a, 0.008); rail.rotation.y = BASE_YAW;
      put(rail, EYE.x + R.right.x * s * 0.72 - 0.17 * fwd.x, 1.25, EYE.z + R.right.z * s * 0.72 - 0.17 * fwd.z);
    }
  }
  // the legs you see when you look down wear the outfit too
  function dressLegs(look) {
    if (!R.legs) return;
    const col = v => (v === 'skin' ? look.skin : typeof v === 'string' ? pat(v) : v);
    R.legs.children.forEach((m, i) => {
      const k = i % 4;
      if (k === 0) m.material = toon(col(look.pants || look.suit));
      else if (k === 3) m.material = toon(col(look.boot) || BOOT);
      else m.visible = !look.plain;
    });
  }
  // the driller himself, only shown from the drone (in play you look out of his eyes)
  function buildMe() {
    R.me = makePerson(ROSTER.find(p => p.id === ROSTER.defaults().driller).look);
    poseMe();
  }
  function poseMe() {
    R.me.g.position.set(EYE.x - R.fwd.x * 0.14, 0.25, EYE.z - R.fwd.z * 0.14);
    R.me.g.rotation.y = BASE_YAW + Math.PI;
    for (let i = 0; i < 2; i++) { R.me.arms[i].rotation.x = -0.85; R.me.fores[i].rotation.x = -0.75; }
    R.me.head.rotation.x = 0.2;
    R.me.g.visible = false;
  }
  // put the people the player picked on the site: the driller (seen from the drone) and the two helpers
  function setCrew(looks) {
    const swap = (key, look) => {
      const old = R[key], p = makePerson(look);
      p.g.position.copy(old.g.position); p.g.rotation.copy(old.g.rotation); p.g.visible = old.g.visible;
      scene.remove(old.g);
      R[key] = p;
    };
    if (looks.lead) swap('dale', looks.lead);
    if (looks.core) swap('tess', looks.core);
    if (looks.driller) { const vis = R.me.g.visible; swap('me', looks.driller); poseMe(); R.me.g.visible = vis; dressLegs(looks.driller); }
  }
  // head-and-shoulders pictures of people, for the pick-your-crew screen
  // full: a full-length picture (for outfits) instead of head and shoulders
  function portraits(looks, w, h, full) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    let r;
    try { r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return looks.map(() => ''); }
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x9aa08a, 1.25));
    const d = new THREE.DirectionalLight(0xfff1d8, 1.7); d.position.set(2, 3, 4); sc.add(d);
    const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 20);
    const out = [];
    for (const look of looks) {
      const p = makePerson(Object.assign({}, look, { parent: sc })), hy = 1.72 * (look.height || 1);
      const back = look.frameBack || (look.hatStyle === 'cowboy' && !look.hatKit ? 1.16 : 1);          // step back to fit a wide brim or a tall hat in
      if (full) { cam.position.set(1.0, 1.25, 5.0); cam.lookAt(0, 1.0 + (back - 1) * 0.4, 0); }
      else { cam.position.set(0.42 * back, hy + 0.02, 1.72 * back); cam.lookAt(0, hy - 0.03 + (back - 1) * 0.25, 0); }
      r.render(sc, cam); out.push(cv.toDataURL('image/png'));
      sc.remove(p.g);
    }
    r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
    return out;
  }
  // A connection was fumbled: a pipe topples over by the hole and the two helpers throw their hands up and run in circles.
  // Purely for show. Nothing in the drilling model changes. Returns after `sec` seconds on its own.
  function startPanic(sec, radius, color) {
    if (!R.dropG) {
      R.dropG = new THREE.Group(); scene.add(R.dropG);
      R.dropPipe = cyl(1, 1, 3.05, 0xbfc5ca, 0.012, 16); R.dropPipe.position.y = 1.525; R.dropG.add(R.dropPipe);
    }
    const r = radius || 0.045;
    R.dropPipe.scale.set(r, 1, r); R.dropPipe.material = toon(color || 0xbfc5ca);
    R.dropG.position.set(0.25, r + 0.02, 0.55); R.dropG.rotation.set(0, 0.25, 0); R.dropG.visible = true;
    panic.t = panic.dur = sec; panic.hit = false;
  }
  function updatePanic(dt) {
    if (panic.t <= 0) return false;
    panic.t -= dt;
    const el = panic.dur - panic.t, fall = Math.min(1, el / 0.62);
    let ang = fall * fall * Math.PI / 2;
    if (fall >= 1) { ang = Math.PI / 2 - Math.abs(Math.sin((el - 0.62) * 14)) * 0.07 * Math.exp(-(el - 0.62) * 5); if (!panic.hit) panic.hit = true; }
    R.dropG.rotation.z = ang;                         // tips over across the open ground beside the rig, where the helpers stand
    if (panic.t <= 0) R.dropG.visible = false;
    return true;
  }
  // ---------- the well install ----------
  // Purely for show. js/well.js decides everything and calls setWell() every frame with what there is to see:
  // the engineer walking up with the drawing, a bag being poured down the casing, the white PVC going together.
  const ENG_FROM = V(-4.8, 0, 7.6), ENG_AT = V(0.72, 0, 3.4);
  const HANDS = { dale: V(-0.64, 0, 0.42), tess: V(0.74, 0, -0.1) };       // where the two helpers stand: either side of the hole, as the driller sees it
  const ENG_WATCH = V(1.45, 0, 0.35);                                      // where the engineer stands to watch the job
  // the wrecked-install scene: where the helper bends over, where the driller stands, and where the camera goes to watch
  const SPANK_H = V(-0.45, 0, 1.3), SPANK_D = V(0.25, 0, 1.3), SPANK_WP = V(0.4, 0, 2.55), CINE_POS = V(-0.1, 1.55, 4.7), CINE_AT = V(-0.1, 0.95, 1.3), ME_AT = V();
  function updateCine(dt) {
    const job = jb.on && jb.cine;                   // the grouting is watched from outside too (see setJob)
    cine.on = (wj.on && wj.cine) || job || (bs.on && bs.cine);
    if (!cine.on && cine.k <= 0) return;
    cine.k = clamp(cine.k + (cine.on ? dt / 0.45 : -dt / 0.6), 0, 1);
    const e = cine.k * cine.k * (3 - 2 * cine.k);
    let P = CINE_POS, A = CINE_AT, F = 46;
    if (job || (jCam.live && !wj.on)) {
      if (job) {                                    // two places to watch from: close on the drum, or back far enough to see the top of the tower
        const T = jb.far ? JOB_FAR : JOB_NEAR, kk = jCam.live ? 1 - Math.exp(-dt * 2.4) : 1;
        jCam.p.lerp(T.p, kk); jCam.a.lerp(T.a, kk); jCam.f += (T.f - jCam.f) * kk; jCam.live = true;
      }
      P = jCam.p; A = jCam.a; F = jCam.f;
    }
    dM.lookAt(P, A, UP); dQ.setFromRotationMatrix(dM);
    fQ.copy(camera.quaternion);
    camera.position.lerp(P, e);
    camera.quaternion.copy(fQ).slerp(dQ, e);
    const f = effFov(lerp(look.fov, F, e));
    if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
    R.me.g.visible = cine.k > 0.3; R.legs.visible = cine.k <= 0.3;
    if (cine.k <= 0) { poseMe(); jCam.live = false; }
  }
  // ---------- the boss on site (js/aaron.js runs it) ----------
  // Purely for show. After a second failed hole in a row Aaron turns up before the next one starts, and the driller
  // gets what a helper gets for wrecking a well: called over, bent over, and smacked while he cries. setBoss() is
  // called every frame with what there is to see. It is watched from outside, from the same place as the wrecked well.
  const bs = { on: false, cine: false, k: 0, out: false, talk: false, point: false, meK: 0, meBack: false, bendK: 0, spankT: -1, hop: 0, cry: 0, myw: null };
  const BOSS_FROM = V(2.7, 0, 6.3), BOSS_SPLIT = 0.78;      // where he walks in from, and how far along his walk he rounds the console
  function setBoss(o) {
    if (!o) {
      if (!bs.on) return;
      bs.on = false; bs.cine = false; bs.myw = null;
      if (R.boss) R.boss.g.visible = false;
      const vis = R.me.g.visible; poseMe(); R.me.g.visible = vis;      // the driller is back at the console
      R.me.g.rotation.x = 0; R.me.mouth.scale.y = 1;
      for (let i = 0; i < 2; i++) { R.me.legs[i].rotation.x = 0; R.me.shins[i].rotation.x = 0; }
      return;
    }
    if (o.look && R.bossLook !== o.look) { if (R.boss) scene.remove(R.boss.g); R.boss = makePerson(o.look); R.bossLook = o.look; R.boss.g.visible = false; }
    Object.assign(bs, o); bs.on = true;
  }
  function updateBoss(dt) {
    if (!bs.on || !R.boss) return;
    const B = R.boss, Me = R.me, ek = 1 - Math.exp(-dt * 9), turn = (cur, to, rate) => cur + Math.atan2(Math.sin(to - cur), Math.cos(to - cur)) * (1 - Math.exp(-dt * rate));
    // Aaron: in from the right, round the console to stand behind the driller, and out the way he came
    {
      const k = clamp(bs.k, 0, 1), moving = k > 0.001 && k < 0.999, first = k < BOSS_SPLIT;
      const a = first ? BOSS_FROM : SPANK_WP, b = first ? SPANK_WP : SPANK_D, kk = first ? k / BOSS_SPLIT : (k - BOSS_SPLIT) / (1 - BOSS_SPLIT), sg = bs.out ? -1 : 1;
      B.g.visible = k > 0 || !bs.out;
      B.g.position.lerpVectors(a, b, kk);
      B.g.rotation.y = turn(B.g.rotation.y, moving ? Math.atan2((b.x - a.x) * sg, (b.z - a.z) * sg) : -Math.PI / 2, 9);
      const w = moving ? Math.sin(t * 11) : 0;
      B.legs[0].rotation.x = w * 0.6; B.legs[1].rotation.x = -w * 0.6;
      B.shins[0].rotation.x = Math.max(0, w) * 0.85; B.shins[1].rotation.x = Math.max(0, -w) * 0.85;
      B.g.position.y = moving ? Math.abs(w) * 0.03 : 0;
      let r1 = w * 0.5, g1 = moving ? -0.45 : -0.18, r0 = -w * 0.5, g0 = g1, hd = 0;
      if (bs.spankT >= 0) { const ph = (bs.spankT % 0.55) / 0.55; r1 = -0.75 - 1.2 * Math.sin(Math.PI * ph); g1 = -0.12; r0 = -0.15; g0 = -1.5; hd = 0.35; }      // wind up, and down. The other hand on his hip
      else if (!moving && bs.point) { r1 = -1.45 + Math.sin(t * 9) * 0.05; g1 = -0.1; r0 = -0.15; g0 = -1.5; hd = 0.1; }                                           // pointing at the ground in front of him
      else if (!moving && bs.talk) { r1 = -0.95 + Math.sin(t * 5) * 0.08; g1 = -1.15; r0 = -0.15; g0 = -1.5; }
      else if (!moving) { r0 = r1 = -0.15; g0 = g1 = -1.5; }                                                                                                       // both hands on his hips
      B.arms[1].rotation.x += (r1 - B.arms[1].rotation.x) * (bs.spankT >= 0 ? 1 : ek); B.fores[1].rotation.x += (g1 - B.fores[1].rotation.x) * ek;
      B.arms[0].rotation.x += (r0 - B.arms[0].rotation.x) * ek; B.fores[0].rotation.x += (g0 - B.fores[0].rotation.x) * ek;
      B.mouth.scale.y = bs.talk ? 1 + 2.5 * Math.abs(Math.sin(t * 11)) : 1;
      B.head.rotation.x = hd;
    }
    // the driller, seen from outside: round the console to where Aaron is pointing, bent over, and back again
    if (cine.k > 0 || bs.cine) {
      const u = clamp(bs.meK, 0, 1), walking = u > 0.001 && u < 0.999, a = u < 0.5 ? ME_AT : SPANK_WP, b = u < 0.5 ? SPANK_WP : SPANK_H, k = u < 0.5 ? u * 2 : u * 2 - 1, sg = bs.meBack ? -1 : 1;
      ME_AT.set(EYE.x - R.fwd.x * 0.14, 0, EYE.z - R.fwd.z * 0.14);
      Me.g.position.lerpVectors(a, b, k);
      let y = 0.25 * (1 - Math.min(1, u * 5)) + (walking ? Math.abs(Math.sin(t * 9)) * 0.03 : 0);
      if (bs.myw == null) bs.myw = Me.g.rotation.y;
      bs.myw = turn(bs.myw, u <= 0.001 ? BASE_YAW + Math.PI : walking ? Math.atan2((b.x - a.x) * sg, (b.z - a.z) * sg) : -Math.PI / 2, 10);
      Me.g.rotation.order = 'YXZ'; Me.g.rotation.y = bs.myw; Me.g.rotation.x = 0;
      const w = walking ? Math.sin(t * 9) * (bs.meBack ? 0.6 : 1) : 0, sob = bs.cry > 0 ? Math.abs(Math.sin(t * 13)) : 0;
      Me.legs[0].rotation.x = w * 0.55; Me.legs[1].rotation.x = -w * 0.55;
      Me.shins[0].rotation.x = Math.max(0, w) * 0.85; Me.shins[1].rotation.x = Math.max(0, -w) * 0.85;
      let a0 = -w * 0.5, a1 = w * 0.5, f0 = walking ? -0.45 : -0.18, f1 = f0, hd = walking ? 0.3 : 0.1;
      if (u <= 0.001) { a0 = a1 = -0.85; f0 = f1 = -0.75; hd = 0.2; }                    // at the console
      if (bs.cry > 0 && u > 0.001) { a0 = a1 = -2.3 + sob * 0.12; f0 = f1 = -2.15; hd = 0.4; }      // crying into his hands on the walk back
      const bk = bs.bendK * bs.bendK * (3 - 2 * bs.bendK);
      if (bk > 0.02) {                               // bent over with straight legs, and hopping at every smack
        const an = 0.8 * bk, sn = Math.sin(an);
        Me.g.rotation.x = an;
        Me.legs[0].rotation.x -= an; Me.legs[1].rotation.x -= an;
        Me.g.position.x -= Math.sin(bs.myw) * 0.9 * sn; Me.g.position.z -= Math.cos(bs.myw) * 0.9 * sn;
        y += 0.9 * (1 - Math.cos(an)) + bs.hop * 0.09;
        a0 = a1 = lerp(a0, -0.55 - bs.hop * 1.6, bk); f0 = f1 = lerp(f0, -0.3, bk); hd = lerp(hd, -0.5, bk);      // arms fly out at every smack
        Me.shins[0].rotation.x = bs.hop * 0.5; Me.shins[1].rotation.x = bs.hop * 0.25;
      }
      Me.g.position.y = y;
      Me.arms[0].rotation.x = a0; Me.arms[1].rotation.x = a1; Me.fores[0].rotation.x = f0; Me.fores[1].rotation.x = f1;
      Me.head.rotation.x = hd;
      Me.mouth.scale.y = bs.cry > 0 ? 1.6 + 1.8 * sob + 1.4 * bs.hop : 1;
      if (bs.cry > 0 && dt > 0 && Math.random() < 0.75 * bs.cry) {      // tears
        Me.head.getWorldPosition(pB);
        drop(V(pB.x + (Math.random() - 0.5) * 0.14, pB.y + 0.05, pB.z + (Math.random() - 0.5) * 0.14), V((Math.random() - 0.5) * 1.1, 0.5 + Math.random() * 0.7, (Math.random() - 0.2) * 1.2), 0x4ab0f0, 1.1);
      }
    }
  }
  // the two helpers while the boss is on site: they step back out of the way, turn to look, and then cannot watch
  const BOSS_BACK = { dale: V(-1.85, 0, 0.3), tess: V(1.25, 0, -0.3) };
  function bossCrew(m, P, pos, dt) {
    P.bossK = clamp((P.bossK || 0) + (bs.on ? dt : -dt) / 0.9, 0, 1);
    const e = P.bossK * P.bossK * (3 - 2 * P.bossK), at = BOSS_BACK[m.id], moving = P.bossK > 0.001 && P.bossK < 0.999, sg = bs.on ? 1 : -1;
    P.g.position.lerpVectors(pos, at, e);
    const yw = moving && pos.distanceToSquared(at) > 0.01 ? Math.atan2((at.x - pos.x) * sg, (at.z - pos.z) * sg) : Math.atan2(SPANK_H.x - at.x, SPANK_H.z - at.z);
    P.g.rotation.y += Math.atan2(Math.sin(yw - P.g.rotation.y), Math.cos(yw - P.g.rotation.y)) * (1 - Math.exp(-dt * 9));
    const w = moving ? Math.sin(t * 9) : 0;
    P.legs[0].rotation.x = w * 0.55; P.legs[1].rotation.x = -w * 0.55;
    P.shins[0].rotation.x = Math.max(0, w) * 0.85; P.shins[1].rotation.x = Math.max(0, -w) * 0.85;
    P.g.position.y = Math.abs(w) * 0.03;
    const hide = bs.on && (bs.spankT >= 0 || bs.bendK > 0.6), ek = 1 - Math.exp(-dt * 10);      // hands over the eyes
    for (let i = 0; i < 2; i++) {
      P.arms[i].rotation.x += ((hide ? -2.3 : (i ? w : -w) * 0.5) - P.arms[i].rotation.x) * ek;
      P.fores[i].rotation.x += ((hide ? -2.15 : moving ? -0.45 : -0.18) - P.fores[i].rotation.x) * ek;
    }
    P.head.rotation.x = hide ? 0.15 : 0; P.rod.visible = false;
  }
  function slotTex() {
    const t = canvasTex(32, 32, (c) => { c.fillStyle = '#f4f4ee'; c.fillRect(0, 0, 32, 32); c.fillStyle = '#7d8790'; for (let y = 3; y < 32; y += 8) c.fillRect(3, y, 26, 2.5); });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 24); return t;
  }
  function buildWell() {
    const g = new THREE.Group(); scene.add(g); R.wellG = g;
    const pal = new THREE.Group(); pal.position.set(-1.9, 0, 1.75); pal.rotation.y = 0.5; g.add(pal);            // a pallet of bags beside the hole
    put(box(1.05, 0.1, 0.8, 0x9a7b4f, 0.008), 0, 0.05, 0, pal);
    for (let i = 0; i < 8; i++) put(box(0.46, 0.13, 0.32, i % 2 ? 0xc8ae78 : 0xece6d2, 0.006), i % 2 ? 0.25 : -0.25, 0.17 + Math.floor(i / 2) * 0.135, (i % 4 < 2 ? 0.03 : -0.03), pal);
    R.bag = new THREE.Group(); g.add(R.bag);                                                                    // the bag being poured
    R.bagMesh = M(new THREE.BoxGeometry(0.3, 0.46, 0.14), 0, 0.006, toon(0xc8ae78, {})); R.bag.add(R.bagMesh);
    R.pvcMat = toon(0xf4f4ee); R.pvcSlot = toon(0xffffff, { map: slotTex() }); R.pvcSlot2 = toon(0xffffff, { map: slotTex() });
    R.pvcStr = M(new THREE.CylinderGeometry(0.032, 0.032, 1, 14), 0, 0.005, R.pvcMat); g.add(R.pvcStr);
    R.pvcNew = M(new THREE.CylinderGeometry(0.032, 0.032, 1, 14), 0, 0.005, R.pvcMat); g.add(R.pvcNew);
    R.pvcCap = cyl(0.042, 0.042, 0.06, 0xd0382c, 0.005, 14); g.add(R.pvcCap);
  }
  function ensureEng(look) {                          // one engineer per hole: built the first time they are needed
    if (!look || R.engLook === look) return;
    if (R.eng) scene.remove(R.eng.g);
    R.eng = makePerson(look); R.engLook = look; R.eng.g.visible = false;
    R.engPaper = put(box(0.25, 0.32, 0.006, 0x2a5db0, 0.004), 0.02, -0.37, 0.12, R.eng.fores[1]); R.engPaper.rotation.x = -1.0;
  }
  // The engineer drops by during the drilling (js/nag.js): walks up beside the driller, taps his shoulder, has a word, walks off.
  const vis = { on: false, k: 0, out: false, tap: false, talk: false }, VIS_FROM = V(-0.6, 0, 6.4);
  function setVisit(o) {
    if (!o) { if (vis.on && R.eng && !wj.on) R.eng.g.visible = false; vis.on = false; return; }
    ensureEng(o.look); Object.assign(vis, o); vis.on = true;
  }
  function updateVisit(dt) {
    if (!vis.on || wj.on || !R.eng) return;
    const E = R.eng, u = clamp(vis.k, 0, 1), e = u * u * (3 - 2 * u), moving = u > 0 && u < 1;
    E.g.visible = u > 0;
    E.g.position.lerpVectors(VIS_FROM, ENG_AT, e);
    const sgn = vis.out ? -1 : 1;
    const yaw = moving ? Math.atan2((ENG_AT.x - VIS_FROM.x) * sgn, (ENG_AT.z - VIS_FROM.z) * sgn) : Math.atan2(EYE.x - ENG_AT.x, EYE.z - ENG_AT.z);
    E.g.rotation.y += Math.atan2(Math.sin(yaw - E.g.rotation.y), Math.cos(yaw - E.g.rotation.y)) * (1 - Math.exp(-dt * 9));
    const w = moving ? Math.sin(t * 10) : 0, ek = 1 - Math.exp(-dt * 10);
    E.legs[0].rotation.x = w * 0.6; E.legs[1].rotation.x = -w * 0.6;
    E.shins[0].rotation.x = Math.max(0, w) * 0.85; E.shins[1].rotation.x = Math.max(0, -w) * 0.85;
    E.g.position.y = moving ? Math.abs(w) * 0.03 : 0;
    // tapping: an arm up to the driller's shoulder. Talking: one hand out, palm up, as if to say "well?"
    const a1 = vis.tap ? -1.85 + Math.sin(t * 22) * 0.1 : vis.talk ? -0.95 + Math.sin(t * 5) * 0.08 : w * 0.5, f1 = vis.tap ? -0.3 : vis.talk ? -1.15 : moving ? -0.45 : -0.18;
    E.arms[1].rotation.x += (a1 - E.arms[1].rotation.x) * ek; E.fores[1].rotation.x += (f1 - E.fores[1].rotation.x) * ek;
    E.arms[0].rotation.x = vis.talk ? -0.15 : -w * 0.5; E.fores[0].rotation.x = vis.talk ? -1.5 : moving ? -0.45 : -0.18;      // other hand on the hip
    R.engPaper.visible = false;
    E.mouth.scale.y = vis.talk ? 1 + 2.5 * Math.abs(Math.sin(t * 11)) : 1;
    E.head.rotation.x = moving ? 0 : -0.22;
  }
  function setWell(o) {
    if (!o) {
      wj.on = false; wj.k = 0; wj.cine = false; if (R.wellG) R.wellG.visible = false; if (R.eng) R.eng.g.visible = false;
      if (cine.k > 0) { cine.k = 0; cine.on = false; poseMe(); R.legs.visible = true; }
      return;
    }
    if (!R.wellG) buildWell();
    ensureEng(o.look);
    Object.assign(wj, o); wj.on = true;
  }
  function updateWell(S, dt, casTop) {
    if (!wj.on) return;
    const live = S.paused ? 0 : dt;
    wj.k = Math.min(1, wj.k + live / 1.6);
    R.wellG.visible = true;
    const E = R.eng;
    if (E) {                                             // the engineer: walks up, holds the drawing out, then stands and watches
      const u = clamp(wj.engK, 0, 1), e = u * u * (3 - 2 * u), moving = u > 0 && u < 1 && !wj.watch;
      E.g.visible = u > 0;
      if (wj.watch) E.g.position.copy(ENG_WATCH); else E.g.position.lerpVectors(ENG_FROM, ENG_AT, e);
      const facing = wj.bendK > 0 ? SPANK_H : wj.watch && !wj.talk ? V(0, 0, 0) : EYE;
      const yaw = moving ? Math.atan2(ENG_AT.x - ENG_FROM.x, ENG_AT.z - ENG_FROM.z) : Math.atan2(facing.x - E.g.position.x, facing.z - E.g.position.z);
      E.g.rotation.y += Math.atan2(Math.sin(yaw - E.g.rotation.y), Math.cos(yaw - E.g.rotation.y)) * (1 - Math.exp(-dt * 7));
      const w = moving ? Math.sin(t * 9) : 0;
      E.legs[0].rotation.x = w * 0.55; E.legs[1].rotation.x = -w * 0.55;
      E.shins[0].rotation.x = Math.max(0, w) * 0.85; E.shins[1].rotation.x = Math.max(0, -w) * 0.85;
      E.g.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.03 : 0;
      const palm = wj.spankT >= 0, wave = Math.sin(t * 17) * 0.25;        // arms in the air when it lets go, a hand over the eyes for what comes next
      E.arms[0].rotation.x = wj.freak ? -2.9 + wave : -w * 0.5; E.fores[0].rotation.x = wj.freak ? -0.25 : moving ? -0.45 : -0.18;
      const ax = wj.freak ? -2.9 - wave : palm ? -2.3 : wj.paper ? -1.2 : wj.carry ? -0.25 : w * 0.5, fx = wj.freak ? -0.25 : palm ? -2.15 : wj.paper ? -0.6 : wj.carry ? -1.1 : (moving ? -0.45 : -0.18), ek = 1 - Math.exp(-dt * 8);
      E.arms[1].rotation.x += (ax - E.arms[1].rotation.x) * ek; E.fores[1].rotation.x += (fx - E.fores[1].rotation.x) * ek;
      R.engPaper.visible = !!wj.carry;
      if (wj.freak) E.g.position.y = Math.abs(Math.sin(t * 13)) * 0.09;
      E.mouth.scale.y = wj.talk || wj.freak ? 1 + 2.5 * Math.abs(Math.sin(t * 11)) : 1;
      E.head.rotation.x = moving ? 0 : palm ? 0.4 : wj.freak ? -0.3 : -0.1;
    }
    const pouring = !!wj.pour && wj.k >= 1;               // a bag tipped into the top of the casing
    R.bag.visible = pouring;
    if (pouring) {
      R.bagMesh.material.color.setHex(wj.pour === 'sand' ? 0xece6d2 : 0xc8ae78);
      const tilt = wj.rate > 0 ? 2.0 + Math.sin(t * 13) * 0.05 : 0.55;
      R.bagMesh.rotation.x += (tilt - R.bagMesh.rotation.x) * (1 - Math.exp(-dt * 8));
      R.bag.position.set(HANDS.dale.x * 0.34, casTop + 0.36, HANDS.dale.z * 0.34); R.bag.rotation.y = Math.atan2(-HANDS.dale.x, -HANDS.dale.z);
      if (wj.rate > 0 && live > 0) {
        const n = Math.max(1, Math.round(wj.rate * 1.6));
        for (let i = 0; i < n; i++) drop(V((Math.random() - 0.5) * 0.06, casTop + 0.25, (Math.random() - 0.5) * 0.06), V((Math.random() - 0.5) * 0.3, -0.5, (Math.random() - 0.5) * 0.3), wj.pour === 'sand' ? 0xe2c462 : 0xa49c8a, 0.3);
      }
    }
    if (wj.burst !== R.wellBurst) {                       // the packed casing lets go: a spray of whatever was in it
      if (R.wellBurst != null && wj.burst > R.wellBurst) for (let i = 0; i < 70; i++) drop(V((Math.random() - 0.5) * 0.2, casTop + Math.random() * 0.3, (Math.random() - 0.5) * 0.2), V((Math.random() - 0.5) * 3.2, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 3.2), i % 5 ? wj.burstCol : 0xf4f4ee, 1.6);
      R.wellBurst = wj.burst;
    }
    if (cine.k > 0 || wj.cine) {                          // the driller, seen from outside for once: round the console and over to the helper
      const Me = R.me, u = clamp(wj.meK, 0, 1), walking = u > 0 && u < 1, a = u < 0.5 ? ME_AT : SPANK_WP, b = u < 0.5 ? SPANK_WP : SPANK_D, k = u < 0.5 ? u * 2 : u * 2 - 1;
      ME_AT.set(EYE.x - R.fwd.x * 0.14, 0, EYE.z - R.fwd.z * 0.14);
      Me.g.position.lerpVectors(a, b, k); Me.g.position.y = 0.25 * (1 - Math.min(1, u * 5)) + (walking ? Math.abs(Math.sin(t * 9)) * 0.03 : 0);
      const yw = u <= 0 ? BASE_YAW + Math.PI : walking ? Math.atan2(b.x - a.x, b.z - a.z) : -Math.PI / 2;
      Me.g.rotation.y += Math.atan2(Math.sin(yw - Me.g.rotation.y), Math.cos(yw - Me.g.rotation.y)) * (1 - Math.exp(-dt * 10));
      const w = walking ? Math.sin(t * 9) : 0;
      Me.legs[0].rotation.x = w * 0.55; Me.legs[1].rotation.x = -w * 0.55;
      Me.shins[0].rotation.x = Math.max(0, w) * 0.85; Me.shins[1].rotation.x = Math.max(0, -w) * 0.85;
      if (u > 0) {
        let r1 = w * 0.5, g1 = walking ? -0.45 : -0.18;
        if (wj.spankT >= 0) { const ph = (wj.spankT % 0.55) / 0.55; r1 = -0.75 - 1.2 * Math.sin(Math.PI * ph); g1 = -0.12; }     // wind up, and down
        Me.arms[1].rotation.x = r1; Me.fores[1].rotation.x = g1; Me.arms[0].rotation.x = -w * 0.5; Me.fores[0].rotation.x = walking ? -0.45 : -0.95;
        Me.head.rotation.x = walking ? 0 : 0.35;
      }
    }
    R.pvcStr.visible = R.pvcNew.visible = R.pvcCap.visible = false;     // the PVC: what is already together, and the length going on
    if (wj.pvcLen > 0) {
      const topY = wj.pvcTop * FT, botY = Math.max(casTop - 0.06, (wj.pvcTop - wj.pvcLen) * FT);
      if (topY > botY + 0.01) { seg(R.pvcStr, pB.set(0, botY, 0), pC.set(0, topY, 0)); R.pvcStr.material = wj.strSlot ? R.pvcSlot : R.pvcMat; }
      if (wj.cap) { R.pvcCap.visible = true; R.pvcCap.position.set(0, topY + 0.02, 0); }
    }
    if (wj.piece) { const b = wj.piece.bot * FT; seg(R.pvcNew, pB.set(0, b, 0), pC.set(0, b + wj.piece.len * FT, 0)); R.pvcNew.material = wj.piece.slot ? R.pvcSlot2 : R.pvcMat; }
  }
  // ---------- the SPT and the grouting on a geotechnical hole (js/spt.js and js/grout.js run the jobs) ----------
  // Purely for show, like the well install. setJob() is called every frame with what there is to see. The sonic head
  // slides left with the barrel hanging on it, so the winch line can come down the middle of the mast. The SPT is
  // watched from the driller's place. The grouting is watched from outside, so the driller can be seen as well.
  const jb = { on: false, kind: '', k: 0, sl: 0, cine: false, far: false, hookOn: false, hook: V(), up: 0, meK: 0 };
  const DRUM_AT = V(0.05, 0, 1.9), POUR_AT = V(-0.62, 0, 1.95), NOZ_AT = V(0.12, 0, 1.2), PUMP_AT = V(0.25, 0, 2.95), ME_WP = V(0.62, 0, 2.95), ORIGIN = V();
  const JOB_NEAR = { p: V(0.15, 2.05, 6.3), a: V(0.15, 0.85, 1.4), f: 46 }, JOB_FAR = { p: V(2.6, 4.2, 11.6), a: V(-0.1, 4.5, 0.7), f: 62 };
  const jCam = { p: V(), a: V(), f: 46, live: false };
  const JOB_ENG = V(-1.75, 0, 0.15), JOB_BACK = { dale: V(-1.1, 0, 0.85), tess: V(1.25, 0, -0.3) };      // where the engineer watches from, and where the helpers stand back to
  const DRUM_H = 0.88, DRUM_R = 0.29, MARK_REF = 1.05;      // MARK_REF: the top face of the top clamp, in metres: the chalk marks are read against it
  const HOIST = 6.6;                                        // how high the helper's boots go, metres
  function buildJob() {
    const g = new THREE.Group(); scene.add(g); R.jobG = g;
    const steel = toon(0xdfe5e8), rod = () => M(new THREE.CylinderGeometry(0.022, 0.022, 1, 12), 0, 0.004, steel);
    // the SPT: AW rods, the anvil, the hammer on the winch line, three chalk marks
    R.awRod = rod(); R.awNew = rod(); g.add(R.awRod, R.awNew);
    R.anvil = cyl(0.055, 0.055, 0.12, 0x5f6a72, 0.006, 14); g.add(R.anvil);
    R.hammer = new THREE.Group(); g.add(R.hammer);
    put(cyl(0.085, 0.085, 0.82, 0xf2a61c, 0.008, 16), 0, 0.41, 0, R.hammer);
    for (const y of [0.16, 0.39, 0.62]) put(cyl(0.088, 0.088, 0.045, 0x1b1710, 0, 16), 0, y, 0, R.hammer);
    put(cyl(0.06, 0.06, 0.05, 0x39424a, 0.005, 14), 0, 0.02, 0, R.hammer);
    R.marks = [];
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0255, 0.0255, 0.016, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); g.add(m); R.marks.push(m); }
    R.markFlash = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.016, 8, 24), new THREE.MeshBasicMaterial({ color: 0x37c04a })); R.markFlash.rotation.x = Math.PI / 2; g.add(R.markFlash);
    // the grouting: PVC and its fitting, the drum, the pump and its two hoses, the bag, the bentonite on top
    R.gPvc = M(new THREE.CylinderGeometry(0.017, 0.017, 1, 10), 0, 0.004, toon(0xf4f4ee)); g.add(R.gPvc);
    R.gFit = cyl(0.03, 0.03, 0.08, 0x3b6fd1, 0.004, 12); g.add(R.gFit);
    const drum = new THREE.Group(); drum.position.copy(DRUM_AT); g.add(drum); R.drum = drum;
    const side = new THREE.Mesh(new THREE.CylinderGeometry(DRUM_R, DRUM_R, DRUM_H, 24, 1, true), toon(0x2b6fd1, { side: THREE.DoubleSide })); side.position.y = DRUM_H / 2; side.castShadow = true; drum.add(side);
    put(cyl(DRUM_R, DRUM_R, 0.03, 0x1f57a8, 0, 24), 0, 0.015, 0, drum);
    for (const y of [0.02, 0.3, 0.6, DRUM_H]) { const r = new THREE.Mesh(new THREE.TorusGeometry(DRUM_R + 0.004, 0.012, 6, 28), toon(0x1f57a8)); r.rotation.x = Math.PI / 2; r.position.y = y; drum.add(r); }
    R.drumLiq = new THREE.Mesh(new THREE.CylinderGeometry(DRUM_R - 0.012, DRUM_R - 0.012, 1, 24), toon(0x78bee8)); drum.add(R.drumLiq);
    const pump = new THREE.Group(); pump.position.copy(PUMP_AT); g.add(pump); R.pump = pump;
    put(box(0.5, 0.3, 0.34, 0xc8201a, 0.008), 0, 0.27, 0, pump);
    put(box(0.26, 0.2, 0.26, 0x39424a, 0.006), -0.08, 0.5, 0, pump);
    put(box(0.58, 0.06, 0.4, 0x39424a, 0.006), 0, 0.07, 0, pump);
    const hd = cyl(0.015, 0.015, 0.5, 0x39424a, 0, 8); hd.rotation.z = Math.PI / 2; put(hd, 0, 0.66, 0, pump);
    R.hoseSuck = new THREE.Mesh(new THREE.BufferGeometry(), toon(0x2a2f33)); R.hoseOut = new THREE.Mesh(new THREE.BufferGeometry(), toon(0xe0a020)); g.add(R.hoseSuck, R.hoseOut); R.jobHose = '';
    R.gBag = new THREE.Group(); g.add(R.gBag);
    R.gBagMesh = M(new THREE.BoxGeometry(0.34, 0.5, 0.15), 0, 0.006, toon(0xb9bcb6)); R.gBag.add(R.gBagMesh);
    R.gCap = cyl(0.11, 0.11, 0.05, 0xc9b79a, 0.005, 16); g.add(R.gCap);
    R.gSpill = cyl(0.5, 0.5, 0.02, 0x9a9c94, 0, 20); g.add(R.gSpill);
  }
  function setJob(o) {
    if (!o) {
      if (!jb.on) return;
      jb.on = false; jb.cine = false; jb.k = 0; jb.up = 0; jb.hookOn = false;
      if (R.jobG) R.jobG.visible = false;
      if (R.eng && !wj.on && !vis.on) R.eng.g.visible = false;
      return;
    }
    if (!R.jobG) buildJob();
    if (o.eng) ensureEng(o.eng);
    Object.assign(jb, { kind: '', cine: false, far: false, eng: null, talk: '', hold: false, work: false, back: false, piece: null, rodTop: -99, anvil: 0, hamK: 0, lift: 0, hits: 0, marks: 0, sink: 0, flash: 0,
      station: false, pvcTop: -99, fit: false, water: 0, mixed: 0, drained: 0, hose: '', jet: false, splash: false, pour: '', rate: 0, pourer: 'helper', up: 0, meK: 0, meArm: false, cap: false, spill: 0 }, o);
    jb.on = true;
  }
  function jobHoses(key, pvcTop) {
    if (key === R.jobHose) return; R.jobHose = key;
    R.hoseSuck.geometry.dispose(); R.hoseOut.geometry.dispose();
    const D = DRUM_AT, P = PUMP_AT, inP = V(P.x - 0.25, 0.3, P.z), outP = V(P.x + 0.25, 0.3, P.z);
    let a = null, b = null;
    if (key === 'truck') {                        // 2 in. suction from the water truck, and straight into the drum
      a = [inP, V(-0.9, 0.05, 3.7), V(-3.0, 0.05, 6.2), V(R.wt.position.x + 2.75, 1.2, R.wt.position.z + 0.4)];
      b = [outP, V(0.7, 0.05, 2.6), V(0.55, 0.85, 2.2), V(D.x + 0.2, DRUM_H + 0.14, D.z + 0.12), V(D.x + 0.12, DRUM_H - 0.2, D.z)];
    } else if (key === 'drum' || key === 'pvc') {   // suction out of the drum; 1 in. back to the nozzle, or on to the PVC
      a = [inP, V(-0.25, 0.05, 2.65), V(-0.22, 0.8, 2.35), V(D.x - 0.1, DRUM_H + 0.16, D.z + 0.2), V(D.x - 0.12, 0.15, D.z + 0.05)];
      b = key === 'drum' ? [outP, V(0.8, 0.05, 2.5), V(0.75, 0.05, 1.5), V(0.5, 0.7, 1.3), V(D.x + 0.06, DRUM_H + 0.34, D.z - 0.34)]
        : [outP, V(0.8, 0.05, 2.5), V(0.65, 0.05, 1.0), V(0.3, 0.9, 0.35), V(0.02, pvcTop + 0.07, 0)];
    }
    R.hoseSuck.geometry = a ? tube(a, 0.03, 40) : new THREE.BufferGeometry();
    R.hoseOut.geometry = b ? tube(b, 0.016, 40) : new THREE.BufferGeometry();
  }
  function updateJob(S, dt, casTop) {
    jb.sl = clamp(jb.sl + (jb.on ? dt / 0.9 : -dt / 0.9), 0, 1);
    if (!jb.on) return;
    const live = S.paused ? 0 : dt;
    jb.k = Math.min(1, jb.k + live / 1.2);
    R.jobG.visible = true;
    const spt = jb.kind === 'spt', gr = jb.kind === 'grout', low = Math.max(casTop - 0.06, -0.15);
    R.awRod.visible = R.awNew.visible = R.anvil.visible = R.hammer.visible = R.markFlash.visible = false;
    R.marks.forEach(m => { m.visible = false; });
    R.gPvc.visible = R.gFit.visible = R.gBag.visible = R.gCap.visible = R.gSpill.visible = false;
    R.drum.visible = R.pump.visible = R.hoseSuck.visible = R.hoseOut.visible = gr;
    jb.hookOn = false;
    if (spt) {
      const top = jb.rodTop * FT;
      if (top > low + 0.02) seg(R.awRod, pB.set(0, low, 0), pC.set(0, top, 0));
      if (jb.piece) { const b = jb.piece.bot * FT; seg(R.awNew, pB.set(0, b, 0), pC.set(0, b + jb.piece.len * FT, 0)); }
      for (let i = 0; i < jb.marks; i++) { const y = MARK_REF + (0.5 * (i + 1) - jb.sink) * FT; if (y > MARK_REF + 0.004) { R.marks[i].visible = true; R.marks[i].position.set(0, y, 0); } }
      if (jb.flash > 0) { R.markFlash.visible = true; R.markFlash.position.set(0, MARK_REF + 0.014, 0); }
      if (jb.anvil && top > low) { R.anvil.visible = true; R.anvil.position.set(0, top + 0.06 + (jb.anvil === 'hover' ? 0.12 + Math.sin(t * 9) * 0.015 : 0), 0); }
      if (jb.hamK > 0) {                            // the hammer comes down the winch line and sits on the anvil
        const e = jb.hamK * jb.hamK * (3 - 2 * jb.hamK), bot = top + 0.12 + (1 - e) * 2.7 + jb.lift * 0.17;
        R.hammer.visible = true; R.hammer.position.set(0, bot, 0);
        jb.hookOn = true; jb.hook.set(0, bot + 0.84, 0);
      }
      if (jb.hits !== R.jobHits) {                  // a blow: a few sparks off the anvil
        if (R.jobHits != null && jb.hits > R.jobHits && live > 0) for (let i = 0; i < 5; i++) drop(V(0, top + 0.13, 0), V((Math.random() - 0.5) * 1.5, 0.5 + Math.random(), (Math.random() - 0.5) * 1.5), 0xfff3a8, 0.3);
        R.jobHits = jb.hits;
      }
    }
    const E = R.eng;                                // the engineer stands by with the clipboard for the whole test
    if (E && jb.eng) {
      E.g.visible = true; E.g.position.copy(JOB_ENG);
      const yaw = Math.atan2(-JOB_ENG.x, -JOB_ENG.z);
      E.g.rotation.y += Math.atan2(Math.sin(yaw - E.g.rotation.y), Math.cos(yaw - E.g.rotation.y)) * (1 - Math.exp(-dt * 7));
      for (let i = 0; i < 2; i++) { E.legs[i].rotation.x = 0; E.shins[i].rotation.x = 0; }
      E.arms[0].rotation.x = -0.3; E.fores[0].rotation.x = -1.2; E.arms[1].rotation.x = -0.25; E.fores[1].rotation.x = -1.1; R.engPaper.visible = true;
      E.mouth.scale.y = jb.talk === 'eng' ? 1 + 2.5 * Math.abs(Math.sin(t * 11)) : 1; E.head.rotation.x = 0.12;
    } else if (E && !wj.on && !vis.on) E.g.visible = false;
    if (gr) {
      const pt = jb.pvcTop * FT;
      if (jb.pvcTop > -50 && pt > low + 0.02) seg(R.gPvc, pB.set(0, low, 0), pC.set(0, pt, 0));
      if (jb.fit) { R.gFit.visible = true; R.gFit.position.set(0, pt + 0.03, 0); }
      const lv = clamp(jb.water * (1 - jb.drained), 0, 1) * (DRUM_H - 0.07);
      R.drumLiq.visible = lv > 0.01; R.drumLiq.scale.y = Math.max(0.01, lv); R.drumLiq.position.y = 0.035 + lv / 2;
      R.drumLiq.material.color.setRGB(lerp(0.47, 0.6, jb.mixed), lerp(0.75, 0.61, jb.mixed), lerp(0.91, 0.58, jb.mixed));
      jobHoses(jb.hose, pt);
      const D = DRUM_AT;
      if (live > 0) {
        if (jb.jet) for (let i = 0; i < 2; i++) drop(V(D.x + 0.06, DRUM_H + 0.32, D.z - 0.32), V((Math.random() - 0.5) * 0.4, -1.6, 1.1 + Math.random() * 0.5), 0xdff2ff, 0.28);
        if (jb.splash) for (let i = 0; i < 3; i++) drop(V(D.x + (Math.random() - 0.5) * 0.5, DRUM_H, D.z + (Math.random() - 0.5) * 0.5), V((Math.random() - 0.5) * 1.6, 1 + Math.random(), (Math.random() - 0.5) * 1.6), 0x78bee8, 0.8);
      }
      if (jb.pour) {                                // the bag, tipped over the rim by whoever is pouring
        R.gBag.visible = true;
        R.gBagMesh.material.color.setHex(jb.pour === 'gel' ? 0xe9d6a6 : 0xb9bcb6);
        const tilt = 0.5 + jb.rate * 1.5 + (jb.rate > 0 ? Math.sin(t * 13) * 0.04 : 0);
        R.gBagMesh.rotation.x += (tilt - R.gBagMesh.rotation.x) * (1 - Math.exp(-dt * 10));
        R.gBag.position.set(D.x - 0.3, DRUM_H + 0.42, D.z + 0.02); R.gBag.rotation.y = Math.atan2(D.x - POUR_AT.x, D.z - POUR_AT.z);
        if (jb.rate > 0.03 && live > 0) { const n = 1 + Math.round(jb.rate * 3); for (let i = 0; i < n; i++) drop(V(D.x - 0.12 + (Math.random() - 0.5) * 0.06, DRUM_H + 0.3, D.z + (Math.random() - 0.5) * 0.06), V((Math.random() - 0.5) * 0.3, -0.6, (Math.random() - 0.5) * 0.3), jb.pour === 'gel' ? 0xd9c38a : 0x8f918b, 0.32); }
      }
      if (jb.cap) { R.gCap.visible = true; R.gCap.position.set(0, Math.max(casTop, 0.02) + 0.02, 0); }
      if (jb.spill > 0.02) { R.gSpill.visible = true; R.gSpill.position.set(0, 0.012, 0.3); R.gSpill.scale.set(1 + jb.spill * 0.8, 1, 1 + jb.spill * 0.8); }
      // the driller, seen from outside: at the console, or walked round to the drum to pour
      if (cine.k > 0 || jb.cine) {
        const Me = R.me, u = clamp(jb.meK, 0, 1), walking = u > 0.001 && u < 0.999, back = u < (R.meKPrev == null ? u : R.meKPrev) - 1e-6; R.meKPrev = u;
        ME_AT.set(EYE.x - R.fwd.x * 0.14, 0, EYE.z - R.fwd.z * 0.14);
        const a = u < 0.5 ? ME_AT : ME_WP, b = u < 0.5 ? ME_WP : POUR_AT, k2 = u < 0.5 ? u * 2 : u * 2 - 1;
        Me.g.position.lerpVectors(a, b, k2); Me.g.position.y = 0.25 * (1 - Math.min(1, u * 5)) + (walking ? Math.abs(Math.sin(t * 9)) * 0.03 : 0);
        const yw = u <= 0.001 ? BASE_YAW + Math.PI : walking ? Math.atan2((b.x - a.x) * (back ? -1 : 1), (b.z - a.z) * (back ? -1 : 1)) : Math.atan2(D.x - POUR_AT.x, D.z - POUR_AT.z);
        Me.g.rotation.y += Math.atan2(Math.sin(yw - Me.g.rotation.y), Math.cos(yw - Me.g.rotation.y)) * (1 - Math.exp(-dt * 10));
        const w = walking ? Math.sin(t * 9) : 0;
        Me.legs[0].rotation.x = w * 0.55; Me.legs[1].rotation.x = -w * 0.55;
        Me.shins[0].rotation.x = Math.max(0, w) * 0.85; Me.shins[1].rotation.x = Math.max(0, -w) * 0.85;
        let r0 = -w * 0.5, r1 = w * 0.5, g0 = walking ? -0.45 : -0.18, g1 = g0, hd2 = 0.1;
        if (u <= 0.001) { r0 = r1 = -0.85; g0 = g1 = -0.75; hd2 = 0.2; }                          // hands on the levers
        else if (!walking && jb.pour && jb.pourer === 'driller') { const q = jb.rate > 0 ? Math.sin(t * 13) * 0.05 : 0; r0 = r1 = -1.0 + q; g0 = g1 = -0.8; hd2 = 0.3; }
        if (jb.meArm) { r1 = -2.5 + Math.sin(t * 7) * 0.12; g1 = -0.2; hd2 = -0.25; }           // pointing up the tower
        Me.arms[0].rotation.x = r0; Me.arms[1].rotation.x = r1; Me.fores[0].rotation.x = g0; Me.fores[1].rotation.x = g1; Me.head.rotation.x = hd2;
        Me.mouth.scale.y = jb.talk === 'me' ? 1 + 2.5 * Math.abs(Math.sin(t * 11)) : 1;
      }
    }
  }
  // where the two helpers are and what their arms are doing, on these jobs. Called from the crew part of update()
  function jobCrew(m, P, pos, dt) {
    const lead = m.id === 'dale', station = jb.kind === 'grout' && jb.station;
    const at = station ? (lead ? POUR_AT : NOZ_AT) : jb.back ? JOB_BACK[m.id] : HANDS[m.id], face = station ? DRUM_AT : ORIGIN;
    if (!P.jp) P.jp = pos.clone();                  // they walk from wherever they were to where the job wants them
    tmp.copy(at).sub(P.jp);
    const dist = tmp.length(), going = dist > 0.03;
    if (going) P.jp.addScaledVector(tmp, Math.min(1, dt * 2.0 / dist));
    P.g.position.copy(P.jp);
    const yw = going ? Math.atan2(tmp.x, tmp.z) : Math.atan2(face.x - at.x, face.z - at.z);
    if (P.wy == null) P.wy = P.g.rotation.y;
    P.wy += Math.atan2(Math.sin(yw - P.wy), Math.cos(yw - P.wy)) * (1 - Math.exp(-dt * 8));
    P.g.rotation.order = 'YXZ'; P.g.rotation.set(0, P.wy, 0);
    const w = going ? Math.sin(t * 9) : 0;
    P.legs[0].rotation.set(w * 0.55, 0, 0); P.legs[1].rotation.set(-w * 0.55, 0, 0);
    P.shins[0].rotation.x = Math.max(0, w) * 0.85; P.shins[1].rotation.x = Math.max(0, -w) * 0.85;
    P.g.position.y = w ? Math.abs(w) * 0.03 : 0;
    let b0 = -w * 0.5, b1 = w * 0.5, f0 = going ? -0.45 : -0.18, f1 = f0, hd = 0.1;
    if (!going) {
      if (station && lead && jb.pour && jb.pourer === 'helper') { const q = jb.rate > 0 ? Math.sin(t * 13) * 0.05 : 0; b0 = b1 = -1.0 + q; f0 = f1 = -0.8; hd = 0.3; }      // tipping the bag
      else if (station && !lead && jb.hose === 'drum') { b0 = b1 = -1.05 + (jb.jet ? Math.sin(t * 17) * 0.03 : 0); f0 = f1 = -0.6; hd = 0.28; }                        // on the nozzle
      else if (!station && jb.hold) { const q = jb.work ? Math.sin(t * 10 + (lead ? 0 : 2)) * 0.22 : 0; b0 = -1.45 + q; b1 = -1.45 - q; f0 = f1 = -0.8; hd = -0.12; }  // hands on the pipe
    }
    P.arms[0].rotation.set(b0, 0, 0); P.arms[1].rotation.set(b1, 0, 0); P.fores[0].rotation.x = f0; P.fores[1].rotation.x = f1;
    P.head.rotation.x = hd; P.rod.visible = false;
    P.mouth.scale.y = jb.talk === (lead ? 'lead' : 'core') ? 1 + 2.5 * Math.abs(Math.sin(t * 11)) : 1;
    if (lead && jb.up > 0) {                        // hooked to the winch and sent up the tower: crying, arms and legs going
      const e = jb.up * jb.up * (3 - 2 * jb.up), hy = e * HOIST, in0 = Math.min(1, jb.up * 3), f = t * 11;
      P.g.position.set(lerp(POUR_AT.x, 0, in0), hy, lerp(POUR_AT.z, 0.14, in0));
      P.wy = Math.atan2(camera.position.x - P.g.position.x, camera.position.z - P.g.position.z);
      P.g.rotation.set(Math.sin(t * 2.3) * 0.12, P.wy, Math.sin(t * 3.1) * 0.24);
      P.arms[0].rotation.set(-2.5 + Math.sin(f) * 0.6, 0, -0.55 - Math.sin(f * 0.9) * 0.45); P.arms[1].rotation.set(-2.5 + Math.cos(f * 1.13) * 0.6, 0, 0.55 + Math.cos(f) * 0.45);
      P.fores[0].rotation.x = P.fores[1].rotation.x = -0.35;
      P.legs[0].rotation.set(Math.sin(f * 0.9 + 1) * 0.9, 0, -0.25 - Math.sin(f * 0.7) * 0.2); P.legs[1].rotation.set(Math.cos(f * 1.07) * 0.9, 0, 0.25 + Math.cos(f * 0.8) * 0.2);
      P.shins[0].rotation.x = 0.5 + Math.sin(f * 1.2) * 0.45; P.shins[1].rotation.x = 0.5 + Math.cos(f * 1.3) * 0.45;
      P.mouth.scale.y = 3.2; P.head.rotation.x = -0.3;
      jb.hookOn = true; jb.hook.set(P.g.position.x, hy + 1.52, P.g.position.z);
      if (jb.up > 0.4 && Math.random() < 0.5) drop(V(P.g.position.x + (Math.random() - 0.5) * 0.14, hy + 1.72, P.g.position.z + 0.1), V((Math.random() - 0.5) * 0.9, 0.3, (Math.random() - 0.5) * 0.9), 0x4ab0f0, 1.3);      // tears
    }
    pos.copy(at);
  }
  // ---------- throwing a Zonnic at a helper (js/toss.js runs the game side) ----------
  // A lump of core flies from the driller's hand to a helper. A hit sticks to the hard hat and stays for the rest of the
  // hole. A miss bounces off his chest and lies in the dirt for a few seconds.
  function sonicLump() {                          // a small white thing, about the size of a chewed piece of gum
    const g = new THREE.Group();
    const b = sph(0.023, 0xf8f6ef, 0.003, 12, 8); b.scale.set(1.3, 0.6, 0.9); g.add(b);
    return g;
  }
  const crewP = id => (id === 'dale' ? R.dale : R.tess);
  function throwSonic(id, hit, col) {
    if (toss.mesh) scene.remove(toss.mesh);
    const P = crewP(id);
    toss.mesh = sonicLump(); scene.add(toss.mesh);
    Object.assign(toss, { on: true, t: 0, id, hit, col, state: 'fly' });
    camera.updateMatrixWorld(true); P.g.updateMatrixWorld(true);
    toss.from.copy(camera.localToWorld(V(0.24, -0.2, -0.3)));
    if (hit) toss.to.copy(P.head.localToWorld(V(0, 0.27, 0.01)));
    else { const d = V(EYE.x - P.g.position.x, 0, EYE.z - P.g.position.z).normalize(); toss.to.copy(P.g.position).addScaledVector(d, 0.26).setY(1.3 * (P.g.scale.y || 1)); }
    const dist = toss.from.distanceTo(toss.to);
    toss.dur = 0.3 + dist * 0.07; toss.arc = 0.25 + dist * 0.07;
  }
  function updateToss(dt) {
    if (!toss.on) return;
    const m = toss.mesh; toss.t += dt;
    if (toss.state === 'fly') {
      const u = Math.min(1, toss.t / toss.dur);
      m.position.lerpVectors(toss.from, toss.to, u); m.position.y += Math.sin(Math.PI * u) * toss.arc;
      m.rotation.x += dt * 13; m.rotation.z += dt * 8;
      if (u < 1) return;
      if (toss.hit) {                                    // splat: it is on the hat now
        scene.remove(m); toss.mesh = null; toss.on = false;
        const P = crewP(toss.id), n = (P.stuck = (P.stuck || 0) + 1) - 1, a = 0.9 + n * 2.4, r = 0.07;
        const lump = sonicLump(), x = Math.cos(a) * r, z = 0.045 + Math.sin(a) * r * 0.7;                 // on the front of the dome, beside the ridge, where the driller can see it
        lump.position.set(x, 0.07 + 0.98 * Math.sqrt(Math.max(0.001, 0.186 * 0.186 - x * x - (z / 1.08) * (z / 1.08))) + 0.014, z);
        lump.rotation.set(-z * 3, Math.random() * 6, -x * 3);
        P.head.add(lump);
      } else {                                           // bounced off him: falls in the dirt
        toss.state = 'fall';
        const P = crewP(toss.id), back = V(toss.from.x - P.g.position.x, 0, toss.from.z - P.g.position.z).normalize();
        toss.v.set(back.x * 0.9, 0.9, back.z * 0.9);
      }
    } else if (toss.state === 'fall') {
      toss.v.y -= 9.8 * dt; m.position.addScaledVector(toss.v, dt); m.rotation.x += dt * 6;
      if (m.position.y <= 0.05) { m.position.y = 0.05; m.rotation.set(0, Math.random() * 6, Math.PI / 2); toss.state = 'lie'; toss.lie = 4; }
    } else if (toss.state === 'lie') {
      toss.lie -= dt;
      if (toss.lie <= 0) { scene.remove(m); toss.mesh = null; toss.on = false; }
    }
  }
  // the driller's own right hand, pointing at whoever just got it, shaking with laughter
  function buildPoint() {
    const g = new THREE.Group(); g.visible = false; camera.add(g); R.point = g;
    const SUIT = 0x2c62b0, GL = 0xe0a83a;
    const arm = cap(0.045, 0.32, SUIT, 0.004); arm.rotation.x = Math.PI / 2; arm.position.set(0.03, -0.03, 0.16); g.add(arm);
    put(cyl(0.048, 0.052, 0.04, 0xc48e33, 0.003, 12), 0, 0, 0.02, g).rotation.x = Math.PI / 2;
    const fist = sph(0.046, GL, 0.004, 12, 10); fist.scale.set(0.9, 0.8, 1.1); g.add(fist);
    const fin = cap(0.013, 0.07, GL, 0.003); fin.rotation.x = Math.PI / 2; fin.position.set(-0.012, 0.014, -0.075); g.add(fin);
    const th = cap(0.013, 0.03, GL, 0.003); th.rotation.set(Math.PI / 2, 0, 0.9); th.position.set(-0.04, 0.0, -0.025); g.add(th);
    for (let i = 0; i < 3; i++) put(sph(0.016, GL, 0.003, 8, 6), 0.002 + i * 0.01, -0.016, -0.04 + i * 0.004, g);
  }
  function updateLaugh(dt) {
    if (!R.point) buildPoint();
    if (laughFx.t <= 0) { if (R.point.visible) R.point.visible = false; return; }
    laughFx.t -= dt;
    const u = 1 - laughFx.t / laughFx.dur, inK = Math.min(1, u * 6), outK = Math.min(1, laughFx.t * 5), k = Math.min(inK, outK);
    R.point.visible = true;
    R.point.position.set(0.2, -0.42 + 0.22 * k + Math.abs(Math.sin(u * 40)) * 0.014, -0.62);
    R.point.rotation.set(0.12 + Math.sin(u * 40) * 0.04, 0.42, Math.sin(u * 27) * 0.05);
  }
  function setDrone(on, instant, done) {
    drone.on = !!on; drone.done = done || null;
    if (instant) drone.k = on ? 1 : 0;
    if (on) R.legs.visible = false;
  }
  function updateDrone(dt) {
    if (!drone.on && drone.k <= 0) return;
    if (drone.on) drone.a += dt * 0.11;
    else {                                            // coming in to land: swing round behind the driller on the way down
      const home = Math.atan2(EYE.z - DRONE_AT.z, EYE.x - DRONE_AT.x);
      drone.a += Math.atan2(Math.sin(home - drone.a), Math.cos(home - drone.a)) * (1 - Math.exp(-dt * 2.2));
    }
    drone.k = clamp(drone.k + (drone.on ? dt / 1.8 : -dt / 3.2), 0, 1);
    const e = drone.k * drone.k * (3 - 2 * drone.k);
    dPos.set(DRONE_AT.x + Math.cos(drone.a) * DRONE_R, DRONE_H + Math.sin(drone.a * 1.7) * 0.7, DRONE_AT.z + Math.sin(drone.a) * DRONE_R);
    dM.lookAt(dPos, DRONE_AT, UP); dQ.setFromRotationMatrix(dM);
    fQ.copy(camera.quaternion);
    camera.position.lerp(dPos, e);
    camera.quaternion.copy(fQ).slerp(dQ, e);
    const f = effFov(lerp(look.fov, 55, e));
    if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
    R.me.g.visible = drone.k > 0.25;
    if (drone.k <= 0 || (drone.on && drone.k >= 1)) {
      if (drone.k <= 0 && !walk.on && camPos.distanceToSquared(EYE) < 0.01) R.legs.visible = true;
      const d = drone.done; drone.done = null; if (d) d();
    }
  }
  function setOptions(o) {
    if (o.sens != null) opt.sens = o.sens;
    if (o.shake != null) opt.shake = !!o.shake;
    if (o.calm != null) opt.calm = !!o.calm;
    if (o.quality) {
      const dpr = window.devicePixelRatio || 1, q = o.quality;
      renderer.setPixelRatio(Math.min(q === 'low' ? 1 : q === 'medium' ? 1.25 : 1.75, dpr));
      R.sun.castShadow = q !== 'low';
      resize();
    }
  }
  function shoulder(side) {
    return EYE.clone().add(V(0, -0.27, 0)).addScaledVector(R.right, side * 0.2).addScaledVector(R.fwd, 0.04);
  }

  // ---------- particles ----------
  function dotTex() { return canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(32, 32, 28, 0, 7); c.fill(); }); }
  function buildParticles() {
    const N = 500, tex = dotTex();
    ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    ptsGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    ptsMesh = new THREE.Points(ptsGeo, new THREE.PointsMaterial({ size: 0.06, map: tex, vertexColors: true, alphaTest: 0.5, sizeAttenuation: true }));
    ptsMesh.frustumCulled = false; scene.add(ptsMesh);
    smkGeo = new THREE.BufferGeometry();
    smkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(120 * 3), 3));
    smkMesh = new THREE.Points(smkGeo, new THREE.PointsMaterial({ size: 0.55, map: tex, color: 0x6e7072, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true }));
    smkMesh.frustumCulled = false; scene.add(smkMesh);
  }
  function drop(p, v, col, life) { if (parts.length < 500) parts.push({ p, v, c: new THREE.Color(col), life: life || 1 }); }
  function stepParticles(dt) {
    for (const q of parts) { q.life -= dt; q.v.y -= 9.8 * dt; q.p.addScaledVector(q.v, dt); if (q.p.y < 0.02) { q.p.y = 0.02; q.v.set(0, 0, 0); } }
    parts = parts.filter(q => q.life > 0);
    const pa = ptsGeo.attributes.position.array, ca = ptsGeo.attributes.color.array;
    for (let i = 0; i < 500; i++) {
      const q = parts[i];
      if (q) { pa[i * 3] = q.p.x; pa[i * 3 + 1] = q.p.y; pa[i * 3 + 2] = q.p.z; ca[i * 3] = q.c.r; ca[i * 3 + 1] = q.c.g; ca[i * 3 + 2] = q.c.b; }
      else { pa[i * 3 + 1] = -50; }
    }
    ptsGeo.attributes.position.needsUpdate = true; ptsGeo.attributes.color.needsUpdate = true;
    for (const s of smoke) { s.life -= dt; s.p.addScaledVector(s.v, dt); }
    smoke = smoke.filter(s => s.life > 0);
    const sa = smkGeo.attributes.position.array;
    for (let i = 0; i < 120; i++) { const s = smoke[i]; if (s) { sa[i * 3] = s.p.x; sa[i * 3 + 1] = s.p.y; sa[i * 3 + 2] = s.p.z; } else sa[i * 3 + 1] = -50; }
    smkGeo.attributes.position.needsUpdate = true;
  }

  // ---------- the driller's cigarette ----------
  // It is fixed to the driller's face, so it pokes up from the bottom of the view. The smoke is let go into
  // the world, so it hangs in the air when the driller turns his head or walks off.
  function buildCig() {
    scene.add(camera);
    const g = new THREE.Group(); g.visible = false; camera.add(g); R.cig = g;
    const inner = new THREE.Group(); g.add(inner); R.cigIn = inner;      // placed every frame in updateCig
    const part = (r, len, color) => {
      const m = cyl(r, r, 1, color, 0.0005, 14); m.rotation.x = Math.PI / 2; m.scale.y = len;
      m.castShadow = false; m.receiveShadow = false; inner.add(m); return m;
    };
    R.cigFilter = part(0.0038, 0.024, 0xd58d3f); R.cigFilter.position.z = -0.012;
    R.cigPaper = part(0.0036, 0.05, 0xf7f4ec);
    R.cigAsh = part(0.0033, 0.004, 0x8f8f8c);
    R.cigEmber = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5a1e }));
    inner.add(R.cigEmber);
    const flameTex = canvasTex(64, 96, (c) => {
      const gr = c.createRadialGradient(32, 66, 2, 32, 60, 34); gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.45, '#ffc93a'); gr.addColorStop(1, 'rgba(255,110,20,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(32, 4); c.quadraticCurveTo(60, 56, 32, 92); c.quadraticCurveTo(4, 56, 32, 4); c.fill();
    });
    R.cigFlame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, fog: false }));
    R.cigFlame.visible = false; inner.add(R.cigFlame);
    const soft = canvasTex(64, 64, (c) => {
      const gr = c.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    });
    R.puffs = [];
    for (let i = 0; i < 64; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: 0xf3f3f0, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      sp.visible = false; scene.add(sp);
      R.puffs.push({ s: sp, life: 0, max: 1, v: V(), r0: 0.01, r1: 0.05, a: 0.3 });
    }
  }
  function puff(p, v, life, r0, r1, a) {
    const q = R.puffs.find(x => x.life <= 0); if (!q) return;
    q.s.position.copy(p); q.v.copy(v); q.life = q.max = life; q.r0 = r0; q.r1 = r1; q.a = a; q.s.visible = true;
  }
  const cA = new THREE.Color(0xc8401a), cB = new THREE.Color(0xffd27a), cT = V(), cF = V(), cDir = V(), cFwd = V(0, 0, -1);
  let cigLift = 0.006;
  function setCigLift() {
    const ins = phone && insets ? insets() : null, h = renderer.domElement.clientHeight || 1;
    cigLift = ins ? (2 * ins.bottom / h) * 0.12 * 0.7265 : 0.006;
  }
  function updateCig(dt) {
    const f = Math.tan(camera.fov * Math.PI / 360) / Math.tan(36 * Math.PI / 180);
    R.cig.scale.set(f, f, 1);                       // keeps it the same size on screen whatever the zoom
    // It hangs from the left corner of the mouth and comes up into the bottom left of the view, clear of the panel.
    // k keeps it at the same place across the screen on wide and narrow screens; cigLift raises it above the buttons on a phone.
    const k = clamp(aspect / 1.78, 0.25, 1.2), slide = (1 - cig.len) * 0.014;
    cDir.set(-0.78 * k, 0.1, -0.62).normalize();
    R.cigIn.quaternion.setFromUnitVectors(cFwd, cDir);
    R.cigIn.position.set(-0.05 * k, -0.085 + cigLift - Math.max(0, 1 - k) * 0.03, -0.085).addScaledVector(cDir, slide);
    if (cig.on) {
      cig.t += dt; cig.ash += dt;
      const dragging = cig.drag > 0;
      cig.len = Math.max(0, cig.len - dt / 150 - (dragging ? dt / 45 : 0));
      const L = 0.028 + 0.028 * cig.len, tip = -0.024 - L;
      if (cig.ash > 24) cig.ash = 0;                // the ash falls off
      const a = 0.0015 + Math.min(0.011, cig.ash * 0.00055);
      R.cigPaper.scale.y = L; R.cigPaper.position.z = -0.024 - L / 2;
      R.cigEmber.position.z = tip;
      R.cigAsh.scale.y = a; R.cigAsh.position.z = tip - 0.002 - a / 2;
      const glow = dragging ? 1 : 0.22 + 0.12 * Math.sin(cig.t * 2.3) + (cig.flame > 0 ? 0.5 : 0);
      R.cigEmber.material.color.copy(cA).lerp(cB, clamp(glow, 0, 1));
      R.cigEmber.scale.setScalar(dragging ? 1.18 : 1);
      // a drag every so often: the tip glows, then a cloud is blown out ahead
      cig.next -= dt;
      if (cig.next <= 0 && !dragging) { cig.drag = 1.4; cig.next = 9 + Math.random() * 8; }
      if (dragging) { cig.drag -= dt; if (cig.drag <= 0) cig.exhale = 0.55; }
      R.cigEmber.getWorldPosition(cT);
      cig.emit += dt * (dragging ? 3 : 11);
      while (cig.emit > 1) {
        cig.emit -= 1;
        puff(cT, cF.set(0.02 + (Math.random() - 0.5) * 0.05, 0.11 + Math.random() * 0.05, (Math.random() - 0.5) * 0.05), 1.5 + Math.random() * 0.5, 0.005, 0.05, 0.36);
      }
      if (cig.len <= 0) { cig.on = false; cig.exhale = 0.4; }
    }
    if (cig.exhale > 0) {
      cig.exhale -= dt;
      for (let i = 0; i < 2; i++) {
        cT.set(-0.02, -0.06, -0.11); camera.localToWorld(cT);
        cF.set(-0.3 + (Math.random() - 0.5) * 0.3, -0.16 + (Math.random() - 0.5) * 0.2, -1).transformDirection(camera.matrixWorld).multiplyScalar(0.55 + Math.random() * 0.45);
        puff(cT, cF, 1.5 + Math.random() * 0.7, 0.018, 0.2, 0.13);
      }
    }
    if (cig.flame > 0) {
      cig.flame -= dt;
      const k = 0.85 + Math.random() * 0.3;
      R.cigFlame.visible = cig.flame > 0; R.cigFlame.scale.set(0.02 * k, 0.034 * k, 1);
      R.cigFlame.position.set(0, 0.014, R.cigEmber.position.z - 0.002);
    }
    for (const q of R.puffs) {
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { q.s.visible = false; continue; }
      const u = 1 - q.life / q.max;
      q.s.position.addScaledVector(q.v, dt);
      q.v.multiplyScalar(Math.max(0, 1 - dt * 1.1)); q.v.y += dt * 0.07;
      const r = q.r0 + (q.r1 - q.r0) * u;
      q.s.scale.set(r, r, 1);
      q.s.material.opacity = q.a * (1 - u) * Math.min(1, u * 9);
    }
  }
  // light one up, or stub it out. Returns whether a cigarette is now lit
  function lightUp(on) {
    if (on === cig.on) return cig.on;
    cig.on = on;
    if (on) { cig.len = 1; cig.t = 0; cig.ash = 0; cig.emit = 0; cig.flame = 0.75; cig.drag = 0; cig.next = 1.6; }
    else { cig.drag = 0; cig.exhale = 0.3; R.cigFlame.visible = false; cig.flame = 0; }
    return cig.on;
  }

  // the special cigarette from the shop: gold paper, a green filter and green smoke
  function cigStyle(special) {
    if (!R.cig) return;
    if (!R.cigOwn) { R.cigOwn = true; R.cigPaper.material = R.cigPaper.material.clone(); R.cigFilter.material = R.cigFilter.material.clone(); }
    R.cigPaper.material.color.setHex(special ? 0xf2cf62 : 0xf7f4ec); R.cigFilter.material.color.setHex(special ? 0x2f8f57 : 0xd58d3f);
    for (const q of R.puffs) q.s.material.color.setHex(special ? 0x9df08a : 0xf3f3f0);
  }

  // ---------- rebuilt-on-change geometry ----------
  function tube(points, r, segs) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segs || 32, r, 8, false); }
  function updateHoses(headY, slide) {
    const key = headY.toFixed(2) + slide.toFixed(2);
    if (key === R.hoseKey) return; R.hoseKey = key;
    R.hoses.children.forEach(c => c.geometry.dispose()); R.hoses.clear();
    const top = headY + 1.1;
    for (const [dx, dz] of [[-0.22, 0], [0, 0.05], [0.22, -0.02]]) {
      const pts = [V(0.3 + dx, 3.0, -4.0), V(0.2 + dx, Math.max(top + 1.6, 4.4), -2.2), V(slide + dx * 0.6 - 0.1, top + 1.0, -1.0 + dz), V(slide + dx * 0.6 - 0.36, top - 0.1, -0.05 + dz)];
      const m = new THREE.Mesh(tube(pts, 0.045, 28), R.hoseMat); m.castShadow = true; R.hoses.add(m);
    }
  }
  function updateWaterHose(S, swivel, wtPos) {
    const home = wtPos.x > R.wtHome.x - 0.05;
    const key = swivel.x.toFixed(2) + swivel.y.toFixed(2) + (home ? 1 : 0);
    if (key === R.waterKey) return; R.waterKey = key;
    R.waterHose.geometry.dispose();
    let pts;
    if (home) pts = [V(wtPos.x + 2.75, 1.25, wtPos.z + 0.4), V(wtPos.x + 3.1, 0.06, wtPos.z - 0.6), V(-2.7, 0.06, 6.5), V(-2.6, 0.06, 1.2), V(-0.95, 0.06, 0.05), V(-0.55, 0.6, MAST_Z + 0.25), V(-0.5, Math.max(1.2, swivel.y - 0.6), MAST_Z + 0.25), V(swivel.x - 0.1, swivel.y + 0.35, swivel.z - 0.05), V(swivel.x, swivel.y + 0.05, swivel.z)];
    else pts = [V(-3.2, 0.06, 7.6), V(-2.7, 0.06, 6.5), V(-2.6, 0.06, 1.2), V(-0.95, 0.06, 0.05), V(-0.55, 0.6, MAST_Z + 0.25), V(-0.5, Math.max(1.2, swivel.y - 0.6), MAST_Z + 0.25), V(swivel.x - 0.1, swivel.y + 0.35, swivel.z - 0.05), V(swivel.x, swivel.y + 0.05, swivel.z)];
    R.waterHose.geometry = tube(pts, 0.035, 60);
  }

  function updateSleeves(S) {
    const tess = S.crew[1];
    const ext = S.phase === 'EXTRUDE' ? Math.round(SIM.taskProgress(tess) * 20) : -1;
    const key = S.runs.length + ':' + ext;
    if (key === R.sleeveKey) return; R.sleeveKey = key;
    R.sleeves.children.forEach(c => { c.traverse(o => o.geometry && o.geometry.dispose()); });
    R.sleeves.clear();
    const k = 0.2;                       // 10 ft run -> 2.0 m sleeve
    const list = S.runs.slice(-5).map(r => ({ r, raw: false }));
    if (ext >= 0) list.push({ r: S.run, raw: true, prog: ext / 20 });
    list.forEach((it, i) => {
      const z = -0.02 + i * 0.075, r = it.r;
      const tubeM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 14), new THREE.MeshToonMaterial({ color: 0xe8f4f8, gradientMap: grad, transparent: true, opacity: 0.45 }));
      tubeM.rotation.z = Math.PI / 2; tubeM.position.set(0, 0.96, z); R.sleeves.add(tubeM);
      const lostFrom = r.from + r.fill - (it.raw ? 0 : Math.min(r.fill, r.tripLoss));
      const limit = it.raw ? r.from + r.fill * it.prog : lostFrom;
      for (const s of r.segs) {
        const a = s.a, b = Math.min(s.b, limit); if (b <= a) continue;
        const len = (b - a) * k;
        const col = s.slough ? 0xd2c39b : new THREE.Color(s.color).getHex();
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, len, 12), new THREE.MeshToonMaterial({ color: col, gradientMap: grad, transparent: s.q < 0.85 || s.slough, opacity: s.slough ? 0.6 : 0.3 + 0.7 * s.q }));
        m.rotation.z = Math.PI / 2; m.position.set(-1.0 + ((a + b) / 2 - r.from) * k, 0.96, z); R.sleeves.add(m);
      }
    });
  }

  // ---------- per frame ----------
  let t = 0;
  const tmp = V(), pA = V(), pB = V(), pC = V(), pD = V(), pE = V();
  function update(S, dt, running) {
    t += dt;
    const h = S.head, conn = SIM.attached(S) ? h.conn : null;
    // look
    if (walk.on) {
      walk.t += dt;
      const u = clamp(walk.t / walk.dur, 0, 1), e = u * u * (3 - 2 * u);
      camPos.lerpVectors(walk.from, walk.to, e);
      if (u < 1) camPos.y += Math.abs(Math.sin(walk.t * 8.5)) * 0.035;
      else {
        walk.on = false;
        if (walk.table) { look.tPitch = -0.8; look.tFov = 64; } else { preset('work'); R.legs.visible = true; }
        const d = walk.done; walk.done = null; if (d) d();
      }
    }
    const k = 1 - Math.exp(-dt * (walk.on ? 3.5 : opt.calm ? 4 : 14));
    look.yaw += (look.tYaw - look.yaw) * k; look.pitch += (look.tPitch - look.pitch) * k; look.fov += (look.tFov - look.fov) * k;
    camera.rotation.set(look.pitch, look.yaw, 0);
    const ef = effFov(look.fov);
    if (Math.abs(camera.fov - ef) > 0.01) { camera.fov = ef; camera.updateProjectionMatrix(); }
    const sh = running ? S.shake : 0;
    const csh = opt.shake && camPos.distanceToSquared(EYE) < 0.01 ? sh : 0;
    camera.position.set(camPos.x + (Math.random() - 0.5) * csh * 0.006, camPos.y + (Math.random() - 0.5) * csh * 0.006, camPos.z);
    updateDrone(dt);
    updateCine(dt);
    camera.updateMatrixWorld(true);
    updateLaugh(dt);
    R.cig.visible = cig.on && drone.k <= 0 && cine.k <= 0;
    updateCig(S.paused || drone.k > 0 ? 0 : dt);
    // clouds
    for (const c of R.clouds) { c.position.x += c.userData.speed * dt * (running ? 1 : 0.2); if (c.position.x > 300) c.position.x = -300; }

    // sonic head: up and down the mast, side-shift left / right, and tilt-out
    const headY = h.y * FT;
    const jsl = jb.sl * jb.sl * (3 - 2 * jb.sl);          // on the SPT and the grouting the head is slid left with the barrel hanging straight
    R.slide = lerp(h.x, -1, jsl) * SLIDE_M;
    R.head.position.set(R.slide, headY, 0);
    const ta = h.tilt * Math.PI / 4 * (1 - jsl);
    R.tiltG.rotation.x = -ta;
    const vib = h.hz > 8 && running ? Math.min(0.012, 0.002 + sh * 0.01) : 0;
    R.headBody.position.set((Math.random() - 0.5) * vib, (Math.random() - 0.5) * vib, (Math.random() - 0.5) * vib);
    R.rig.position.set((Math.random() - 0.5) * sh * 0.004, 0, 0);
    updateHoses(headY, R.slide);

    // casing string standing in the table
    const casTop = SIM.casTop(S) * FT;
    R.casing.visible = R.collar.visible = casTop > 0.02;
    R.casing.position.set(0, (casTop - 0.4) / 2, 0); R.casing.scale.y = casTop + 0.4;
    R.casTex.repeat.set(1, (casTop + 0.4) * 3);
    R.collar.position.set(0, casTop - 0.05, 0);
    if (conn === 'casing') R.casing.rotation.y += S.rpm * dt * 0.105;

    // core string: rods on top of the barrel. It hangs straight, or swings out with the head when tilted
    const core = S.core, hasCore = core.len > 0;
    const tilted = hasCore && h.conn === 'core' && ta > 0.001;
    const top = tilted ? pA.set(R.slide, headY + 0.9 - 0.9 * Math.cos(ta), 0.9 * Math.sin(ta)) : pA.set(jsl > 0 ? R.slide : 0, SIM.coreTop(S) * FT, 0);
    const dn = tilted ? pD.set(0, -Math.cos(ta), Math.sin(ta)) : pD.set(0, -1, 0);
    const lenM = core.len * FT, rodsM = Math.max(0, core.len - SIM.BARREL) * FT;
    const dMax = hasCore ? (tilted ? lenM : Math.min(lenM, top.y + 0.4)) : 0;
    const along = d => pB.copy(top).addScaledVector(dn, d);
    R.rods.visible = R.barrel.visible = R.shoe.visible = false;
    if (conn === 'core') R.rodSpin = (R.rodSpin || 0) + S.rpm * dt * 0.105;
    if (hasCore && dMax > 0.02) {
      const rEnd = Math.min(rodsM, dMax);
      if (rEnd > 0.02) { seg(R.rods, top, along(rEnd)); R.rods.rotateY(R.rodSpin || 0); R.rodTex.repeat.set(1, rEnd * 3); }
      if (dMax > rodsM + 0.02) { seg(R.barrel, pC.copy(top).addScaledVector(dn, rodsM), along(dMax)); R.barrel.rotateY(R.rodSpin || 0); }
      if (core.bit < -0.02 || tilted) { R.shoe.visible = true; R.shoe.position.copy(along(lenM - 0.04)); R.shoe.quaternion.copy(R.barrel.quaternion); }
    }
    const nJ = SIM.rodsIn(S);
    R.jcol.forEach((j, i) => {
      const d = (i + 1) * SIM.JT * FT;
      j.visible = hasCore && i < nJ && d < dMax - 0.05;
      if (j.visible) { j.position.copy(along(d)); j.quaternion.copy(R.rods.quaternion); }
    });

    // a single joint: threaded to the head, or standing loose in the top clamp
    R.singleCas.visible = R.singleRod.visible = false;
    if (S.hang && !S.hang.onArm) {
      const b = SIM.hangBot(S) * FT;
      seg(S.hang.type === 'casing' ? R.singleCas : R.singleRod, pB.set(R.slide, b, 0), pC.set(R.slide, b + S.hang.len * FT, 0));
    } else if (S.loose) {
      seg(S.loose.type === 'casing' ? R.singleCas : R.singleRod, pB.set(0, S.loose.bot * FT, 0), pC.set(0, (S.loose.bot + S.loose.len) * FT, 0));
    }

    // casing presenter arm, casing rack, and what is laid out on the sawhorses
    R.armG.rotation.x = -(1 - S.arm.ang) * Math.PI / 2;
    R.armCas.visible = S.arm.holds;
    R.rackJ.forEach((p, i) => { p.visible = i < S.rack.casing; });
    R.yardStands.forEach((p, i) => { p.visible = i < S.yard.stands; });
    R.yardSingles.forEach((p, i) => { p.visible = i < S.yard.singles; });

    // winch: line from the crown to the hoist plug, and a 20 ft stand if one is on it
    const hook = jb.on && jb.hookOn ? pE.copy(jb.hook) : pE.set(0, S.winch.y * FT, 0);      // (the SPT hammer, or a helper, on the line)
    R.stand.visible = R.standCol.visible = !!S.stand;
    R.standB = null;
    if (S.stand) {
      const ps = standPose(S);
      seg(R.stand, ps.B, ps.T);
      R.standCol.position.copy(ps.B).lerp(ps.T, 0.5); R.standCol.quaternion.copy(R.stand.quaternion);
      hook.copy(ps.T); R.standB = ps.B;
    }
    R.plug.visible = true; R.plug.position.copy(hook).y += 0.07;
    seg(R.line, pB.copy(hook).setY(hook.y + 0.14), pC.set(0, MAST_H + 0.42, MAST_Z + 0.3));

    // clamps: the bottom one holds, the top one grips and swings to break or make a joint
    const ease = 1 - Math.exp(-dt * 10);
    const bGap = 0.085 + 0.085 + (S.ctl.clampB ? 0 : 0.13);
    R.bJawL.position.x = lerp(R.bJawL.position.x, -bGap, ease); R.bJawR.position.x = -R.bJawL.position.x;
    let rT = 0.045;
    if (S.hang && !S.hang.onArm && S.hang.type === 'casing' && Math.abs(h.x) < 0.05 && SIM.hangBot(S) < SIM.CLAMP_T) rT = 0.085;
    else if (hasCore && !tilted && SIM.BARREL - core.bit > SIM.CLAMP_T) rT = 0.058;
    const tGap = rT + 0.075 + (S.ctl.clampT ? 0 : 0.13);
    R.tJawL.position.x = lerp(R.tJawL.position.x, -tGap, ease); R.tJawR.position.x = -R.tJawL.position.x;
    R.tcG.rotation.y = (S.tc.ang - 0.5) * 0.9;

    // water truck (drives off to the hydrant when refilling)
    const wx = R.wtHome.x + (S.truckX - SIM.POS.truckHome) / 30;
    const moved = wx - R.wt.position.x;
    R.wt.position.x = wx;
    for (const w of R.wtWheels) w.rotation.y += moved / 0.42;
    const fill = clamp(S.water.tank / SIM.TANK_CAP, 0.001, 1);
    R.tankWater.scale.y = fill * 1.45; R.tankWater.position.y = 1.15 + fill * 0.72;
    if (Math.abs(moved) > 0.001 && running && Math.random() < 0.5) smoke.push({ p: V(R.wt.position.x + 2.6, 0.3, R.wt.position.z), v: V(0.4, 0.5, 0), life: 1.2 });
    const swivel = V(R.slide, headY + 1.71, 0);
    updateWaterHose(S, swivel, R.wt.position);

    // crew
    updateWell(S, dt, casTop);
    updateJob(S, dt, casTop);
    updateBoss(S.paused ? 0 : dt);
    updateVisit(S.paused ? 0 : dt);
    const panicking = updatePanic(dt);
    for (const m of S.crew) {
      const P = m.id === 'dale' ? R.dale : R.tess;
      const hid = m.hidden && !wj.on && !jb.on;
      P.g.visible = !hid;
      if (hid) continue;
      const pos = pathPos(m.id, m.x);
      if (m.id === 'dale' && R.standB && S.stand.lay > 0) pos.set(R.standB.x - 0.5, 0, Math.max(0.6, R.standB.z - 0.25));
      const prev = P.g.position.clone();
      P.g.position.copy(pos);
      const d = pos.clone().sub(prev);
      let yaw = P.g.rotation.y;
      if (d.lengthSq() > 1e-6) yaw = Math.atan2(d.x, d.z);
      else if (m.atWork && m.id === 'dale') yaw = Math.atan2(-pos.x, -pos.z);
      else if (m.id === 'tess') yaw = Math.atan2(R.table.position.x - pos.x + 0.001, R.table.position.z - pos.z) + (m.atWork ? 0 : 0.6);
      else yaw = Math.atan2(-pos.x, -pos.z) + 0.4;
      P.g.rotation.y += Math.atan2(Math.sin(yaw - P.g.rotation.y), Math.cos(yaw - P.g.rotation.y)) * (1 - Math.exp(-dt * 8));
      const walk = m.walking ? Math.sin(t * 9) : 0;
      P.legs[0].rotation.x = walk * 0.55; P.legs[1].rotation.x = -walk * 0.55;
      P.shins[0].rotation.x = Math.max(0, walk) * 0.85; P.shins[1].rotation.x = Math.max(0, -walk) * 0.85;
      const working = m.atWork && !(m.task && m.task.blocked);
      let a0, a1, e0 = -0.18, e1 = -0.18;
      if (m.carry) { a1 = -2.6; a0 = -walk * 0.4; e1 = -0.5; }
      else if (working) { const w = Math.sin(t * 8) * 0.3; a0 = -0.95 + w; a1 = -0.95 - w; e0 = -0.9 - w * 0.6; e1 = -0.9 + w * 0.6; }
      else if (m.task && m.task.blocked) { a0 = -0.3; a1 = -2.9 + Math.sin(t * 6) * 0.2; e1 = -0.3; }
      else { a0 = -walk * 0.5; a1 = walk * 0.5; if (m.walking) { e0 = -0.45; e1 = -0.45; } }
      P.arms[0].rotation.x = a0; P.arms[1].rotation.x = a1; P.fores[0].rotation.x = e0; P.fores[1].rotation.x = e1;
      P.mouth.scale.y = m.sayT > 0 ? 1 + 2.5 * Math.abs(Math.sin(t * 11)) : 1;
      P.head.rotation.x = working ? 0.22 : 0;
      P.rod.visible = !!m.carry;
      if (m.carry) { P.rod.scale.set(m.carry === 'casing' ? 1.7 : 1, 1, m.carry === 'casing' ? 1.7 : 1); }
      P.g.position.y = m.walking ? Math.abs(Math.sin(t * 9)) * 0.03 : 0;
      if (wj.on) {                                    // the well install: both helpers come and stand at the hole
        const lead = m.id === 'dale', bk = lead ? wj.bendK * wj.bendK * (3 - 2 * wj.bendK) : 0;
        const at = HANDS[m.id], e = wj.k * wj.k * (3 - 2 * wj.k), going = wj.k < 1 && pos.distanceToSquared(at) > 0.01;
        P.g.position.lerpVectors(pos, at, e);
        if (bk > 0) P.g.position.lerp(SPANK_H, bk);
        const yw = bk > 0 ? -Math.PI / 2 : going ? Math.atan2(at.x - pos.x, at.z - pos.z) : Math.atan2(-at.x, -at.z);
        if (P.wy == null) P.wy = P.g.rotation.y;
        P.wy += Math.atan2(Math.sin(yw - P.wy), Math.cos(yw - P.wy)) * (1 - Math.exp(-dt * 8));
        P.g.rotation.y = P.wy;
        const w = going || (bk > 0 && bk < 1) ? Math.sin(t * 9) : 0;
        P.legs[0].rotation.x = w * 0.55; P.legs[1].rotation.x = -w * 0.55;
        P.shins[0].rotation.x = Math.max(0, w) * 0.85; P.shins[1].rotation.x = Math.max(0, -w) * 0.85;
        P.g.position.y = w ? Math.abs(w) * 0.03 : 0;
        let b0 = -w * 0.5, b1 = w * 0.5, f0 = going ? -0.45 : -0.18, f1 = f0, hd = 0.1;
        if (!going && wj.hold) {                      // hands on the pipe
          const q = wj.work ? Math.sin(t * 10 + (lead ? 0 : 2)) * 0.22 : 0;
          b0 = -1.45 + q; b1 = -1.45 - q; f0 = f1 = -0.8; hd = -0.12;
        } else if (!going && wj.pour) {
          if (lead) { const q = wj.rate > 0 ? Math.sin(t * 13) * 0.05 : 0; b0 = b1 = -1.0 + q; f0 = f1 = -0.8; hd = 0.3; }     // tipping the bag
          else { b1 = -0.7; f1 = -0.65; hd = 0.36; }                                                                     // feeding the tape down the hole
        }
        if (!lead && wj.spankT >= 0) { b0 = b1 = -2.3; f0 = f1 = -2.15; hd = 0.15; }      // the other helper cannot watch
        P.arms[0].rotation.x = b0; P.arms[1].rotation.x = b1; P.fores[0].rotation.x = f0; P.fores[1].rotation.x = f1;
        P.head.rotation.x = hd; P.rod.visible = false;
        P.g.rotation.order = 'YXZ'; P.g.rotation.x = 0;
        if (bk > 0.02) {                              // the helper who was pouring: bent over with straight legs, and hopping at every smack
          const a = 0.8 * bk, sn = Math.sin(a);
          P.g.rotation.x = a;
          P.legs[0].rotation.x -= a; P.legs[1].rotation.x -= a;
          P.g.position.x -= Math.sin(P.wy) * 0.9 * sn; P.g.position.z -= Math.cos(P.wy) * 0.9 * sn;
          P.g.position.y += 0.9 * (1 - Math.cos(a)) + wj.hop * 0.08;
          P.arms[0].rotation.x = P.arms[1].rotation.x = -0.55 * bk; P.fores[0].rotation.x = P.fores[1].rotation.x = -0.3;
          P.head.rotation.x = -0.5 * bk; P.mouth.scale.y = 1 + 2.6 * wj.hop;
        }
        pos.copy(at);
      } else if (jb.on) jobCrew(m, P, pos, S.paused ? 0 : dt);
      else if (bs.on || P.bossK > 0) bossCrew(m, P, pos, S.paused ? 0 : dt);
      else {
        P.wy = null; if (P.g.rotation.x) P.g.rotation.x = 0;
        if (P.jp) { P.jp = null; P.g.rotation.z = 0; for (let i = 0; i < 2; i++) { P.arms[i].rotation.z = 0; P.legs[i].rotation.z = 0; } }
      }
      if (panicking) {                                // hands in the air, running in a circle
        const ph = t * 6.5 + (m.id === 'dale' ? 0 : 2.6), out = Math.hypot(pos.x, pos.z) || 1, rr = 0.6;
        const cx = pos.x + pos.x / out * 0.75, cz = pos.z + pos.z / out * 0.75;
        P.g.position.set(cx + Math.cos(ph) * rr, Math.abs(Math.sin(t * 15)) * 0.06, cz + Math.sin(ph) * rr);
        P.g.rotation.y = Math.atan2(-Math.sin(ph), Math.cos(ph));
        const run = Math.sin(t * 15);
        P.legs[0].rotation.x = run * 0.8; P.legs[1].rotation.x = -run * 0.8;
        P.shins[0].rotation.x = Math.max(0, run) * 1.0; P.shins[1].rotation.x = Math.max(0, -run) * 1.0;
        P.arms[0].rotation.x = -2.85 + Math.sin(t * 17) * 0.28; P.arms[1].rotation.x = -2.85 - Math.sin(t * 17) * 0.28;
        P.fores[0].rotation.x = -0.25; P.fores[1].rotation.x = -0.25;
        P.mouth.scale.y = 3.2; P.head.rotation.x = -0.15; P.rod.visible = false;
      } else if (sad[m.id] > 0) {                     // just been yelled at: head down, arms hanging, shoulders dropped
        sad[m.id] -= dt;
        const k = Math.min(1, sad[m.id] * 4, (sad.len - sad[m.id]) * 5);       // ease in and out
        P.head.rotation.x = lerp(P.head.rotation.x, 0.68, k);
        for (let i = 0; i < 2; i++) { P.arms[i].rotation.x = lerp(P.arms[i].rotation.x, 0.08, k); P.fores[i].rotation.x = lerp(P.fores[i].rotation.x, -0.04, k); }
        P.mouth.scale.y = 0.6;
        P.g.position.y -= 0.025 * k;
      } else if (mad[m.id] > 0) {                     // a Zonnic just came his way: he turns on the driller with his arms out
        mad[m.id] -= dt;
        const k = Math.min(1, mad[m.id] * 4, (mad.len - mad[m.id]) * 6);
        if (P.my == null) P.my = P.g.rotation.y;
        const yw = Math.atan2(EYE.x - P.g.position.x, EYE.z - P.g.position.z);
        P.my += Math.atan2(Math.sin(yw - P.my), Math.cos(yw - P.my)) * (1 - Math.exp(-dt * 9));
        P.g.rotation.y = P.my;
        for (let i = 0; i < 2; i++) { P.arms[i].rotation.x = lerp(P.arms[i].rotation.x, -1.1, k); P.fores[i].rotation.x = lerp(P.fores[i].rotation.x, -0.75, k); P.legs[i].rotation.x *= 1 - k; P.shins[i].rotation.x *= 1 - k; }
        P.head.rotation.x = lerp(P.head.rotation.x, -0.06, k); P.rod.visible = false;
      }
      if (!(mad[m.id] > 0)) P.my = null;
    }
    updateToss(dt);
    updateSleeves(S);

    // alarm beacons
    const crit = S.alarms.some(a => a[0] === 'crit');
    if (!R.beaconOn) { R.beaconOn = toon(0xffb020, { emissive: 0xff8a00, emissiveIntensity: 1 }); R.beaconOff = toon(0xc98a2b); }
    for (const b of R.beacons) b.material = crit && Math.sin(t * 9) > 0 ? R.beaconOn : R.beaconOff;

    // particles
    if (running) {
      if ((S.engine.rpm > 300) && Math.random() < dt * (3 + S.engine.load * 18)) smoke.push({ p: V(0.85 + (Math.random() - 0.5) * 0.1, 4.45, -6.55), v: V(0.25, 0.9 + Math.random() * 0.4, 0.1), life: 2.2 });
      if (casTop > 0.02 && (S.overflow || (conn === 'casing' && S.water.flow > 3))) {
        const n = S.overflow ? 3 : 1;
        for (let i = 0; i < n; i++) drop(V((Math.random() - 0.5) * 0.12, casTop, (Math.random() - 0.5) * 0.12), V((Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.0, (Math.random() - 0.5) * 1.6), conn === 'casing' && S.rop > 0.3 ? 0x8a6a45 : 0x5bb8f0, 1.2);
      }
      if (S.hoseBurst) for (let i = 0; i < 4; i++) drop(V(-1.2, 0.1, 1.3), V((Math.random() - 0.5) * 2, 3 + Math.random() * 2, (Math.random() - 0.5) * 2), 0x5bb8f0, 1.2);
      if (S.rop > 0.3 && conn === 'core' && Math.random() < 0.5) drop(V((Math.random() - 0.5) * 0.15, 0.05, (Math.random() - 0.5) * 0.15), V((Math.random() - 0.5) * 0.8, 0.8, (Math.random() - 0.5) * 0.8), 0x7a5a3a, 0.8);
    }
    stepParticles(running || ((wj.on || jb.on || bs.on) && !S.paused) ? dt : 0);
    const tgt = Math.min(2.6, 0.15 + Math.sqrt(S.water.spilled) * 0.12);
    R.puddle.scale.x = lerp(R.puddle.scale.x, S.water.spilled > 2 ? tgt : 0.01, 0.02); R.puddle.scale.y = R.puddle.scale.x * 0.7;
  }

  function render() { renderer.render(scene, camera); }

  // ---------- look controls ----------
  function lookDrag(dx, dy) {
    const s = 0.0042 * look.fov / 64 * opt.sens;
    look.tYaw = clamp(look.tYaw - dx * s, look.base - look.range, look.base + look.range);
    look.tPitch = clamp(look.tPitch - dy * s, -1.25, 1.3);
  }
  function walkTo(table, done) {
    walk.on = true; walk.t = 0; walk.table = !!table; walk.done = done || null;
    walk.from.copy(camPos); walk.to.copy(table ? TABLE_EYE : EYE);
    R.legs.visible = false;
    const ty = table ? TABLE_YAW : BASE_YAW;
    look.tYaw = look.yaw + Math.atan2(Math.sin(ty - look.yaw), Math.cos(ty - look.yaw));   // turn the short way
    look.base = look.tYaw; look.range = table ? 1.0 : 2.9;
    look.tPitch = -0.15; look.tFov = 70;
  }
  // the newest core, laid in a tray at the front of the table with a detailed picture wrapped round it
  function setInspectCore(canvas) {
    if (!R.insp) {
      const g = new THREE.Group(); g.position.set(0, 0.92, -0.22); R.table.add(g); R.insp = g;
      put(box(2.34, 0.02, 0.2, 0xd9c7a0, 0.006), 0, 0, 0, g);
      for (const z of [-0.1, 0.1]) put(box(2.34, 0.06, 0.02, 0xb9a57c, 0.006), 0, 0.03, z, g);
      const geo = new THREE.CylinderGeometry(0.062, 0.062, 2.2, 28, 1, true);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, 1 - v, u); }   // picture runs along the core, top of the run on the left
      R.inspMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad });
      R.inspCore = new THREE.Mesh(geo, R.inspMat); R.inspCore.rotation.z = Math.PI / 2; R.inspCore.position.y = 0.075; g.add(R.inspCore);
      outline(R.inspCore, 0.006);
    }
    R.insp.visible = !!canvas;
    if (!canvas) return;
    if (R.inspMat.map) R.inspMat.map.dispose();
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    R.inspMat.map = t; R.inspMat.needsUpdate = true;
  }
  // turn the driller's head toward a point in the world (thumb-pad mode follows the work with this)
  function aim(x, y, z, fov) {
    const dx = x - camPos.x, dy = y - camPos.y, dz = z - camPos.z;
    const yw = Math.atan2(-dx, -dz);
    look.tYaw = clamp(look.yaw + Math.atan2(Math.sin(yw - look.yaw), Math.cos(yw - look.yaw)), look.base - look.range, look.base + look.range);
    look.tPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -1.25, 1.3);
    if (fov) look.tFov = fov;
  }
  function zoom(d) { look.tFov = clamp(look.tFov + d, 20, 80); }
  function zoomBy(ratio) { look.tFov = clamp(2 * Math.atan(Math.tan(look.tFov * Math.PI / 360) / ratio) * 180 / Math.PI, 20, 80); }
  // Aim and zoom so a set of points in the world fills the part of the screen that the overlays leave free.
  // frac pushes the points into the lower part of that space (0 = use all of it), leaving the rig in view above.
  let fitCam = null;
  function frameOn(points, frac) {
    const cv = renderer.domElement, w = cv.clientWidth, h = cv.clientHeight;
    const ins = Object.assign({ top: 0, bottom: 0, left: 0, right: 0 }, insets ? insets() : null);
    const top = ins.top + (h - ins.top - ins.bottom) * (frac || 0);
    const x0 = ins.left / w * 2 - 1, x1 = 1 - ins.right / w * 2, y1 = 1 - top / h * 2, y0 = ins.bottom / h * 2 - 1;
    if (!fitCam) { fitCam = new THREE.PerspectiveCamera(60, 1, 0.05, 900); fitCam.rotation.order = 'YXZ'; }
    fitCam.aspect = aspect; fitCam.position.copy(EYE);
    let yaw = BASE_YAW, pitch = -0.75, fov = 50;
    for (let i = 0; i < 16; i++) {
      fitCam.fov = effFov(fov); fitCam.rotation.set(pitch, yaw, 0); fitCam.updateProjectionMatrix(); fitCam.updateMatrixWorld(true);
      let a = 9, b = -9, c = 9, d = -9;
      for (const p of points) { tmp.copy(p).project(fitCam); a = Math.min(a, tmp.x); b = Math.max(b, tmp.x); c = Math.min(c, tmp.y); d = Math.max(d, tmp.y); }
      const th = Math.tan(fitCam.fov * Math.PI / 360);
      pitch = clamp(pitch + Math.atan(((c + d) / 2 - (y0 + y1) / 2) * th), -1.25, 0.2);
      yaw -= Math.atan(((a + b) / 2 - (x0 + x1) / 2) * th * aspect);
      const sc = Math.max((b - a) / (x1 - x0), (d - c) / (y1 - y0));
      fov = clamp(2 * Math.atan(Math.tan(fov * Math.PI / 360) * sc) * 180 / Math.PI, 16, 84);
    }
    return [yaw, pitch, fov];
  }
  const PRESETS = {
    work: () => (phone ? frameOn(PANEL.framePoints(), 0.3) : [BASE_YAW, -0.58, 72]),
    panel: () => (phone ? frameOn(PANEL.framePoints(), 0) : [BASE_YAW, -0.9, 60]),
    rig: () => [BASE_YAW + 0.05, 0.05, 66],
    mast: () => [BASE_YAW + 0.12, 0.72, 70],
    clamps: () => [BASE_YAW, -0.36, 46],
    rack: () => [Math.atan2(EYE.x - 1.0, EYE.z + 0.9), 0.02, 72],
    horses: () => [Math.atan2(EYE.x + 1.6, EYE.z - 3.6), -0.3, 70],
    table: () => [Math.atan2(EYE.x - 0.9, EYE.z - 5.7), -0.3, 64],
    truck: () => [Math.atan2(EYE.x + 6.3, EYE.z - 9.0), -0.08, 64],
  };
  function preset(name) { setCigLift(); const [y, p, f] = PRESETS[name](); let dy = y - look.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); look.tYaw = look.yaw + dy; look.tPitch = p; look.tFov = f; }
  function project(v) {
    tmp.copy(v).project(camera);
    const cv = renderer.domElement;
    return { x: (tmp.x * 0.5 + 0.5) * cv.clientWidth, y: (-tmp.y * 0.5 + 0.5) * cv.clientHeight, front: tmp.z < 1 };
  }
  function crewHead(id) {
    const P = id === 'dale' ? R.dale : R.tess, p = P.g.position.clone().add(V(0, 2.15, 0));
    if (id === 'dale' && wj.on && wj.bendK > 0) p.lerp(V(SPANK_H.x - 0.6, 1.78, SPANK_H.z), wj.bendK);      // bent over: his head is out in front of him
    return p;
  }

  return {
    init, update, render, resize, lookDrag, zoom, zoomBy, preset, project, crewHead, shoulder, walkTo, setInspectCore, smoke: lightUp, cigStyle,
    setPhone(p) { phone = !!p; }, setInsets(fn) { insets = fn; }, setDrone, setOptions, aim, setCrew, portraits, panic: startPanic, setWell, setJob, setBoss,
    engHead() { return R.eng ? R.eng.g.position.clone().add(V(0, 2.15 * (R.engLook.height || 1), 0)) : V(0, 2, 0); },
    sadden(id, sec) { sad[id] = sec; sad.len = sec; },
    setVisit, throwSonic, laugh(sec) { laughFx.t = laughFx.dur = sec; }, annoy(id, sec) { mad[id] = sec; mad.len = sec; }, get tossing() { return toss.on && toss.state === 'fly'; },
    get panicHit() { if (panic.hit === true) { panic.hit = 'done'; return true; } return false; },      // true once, when the pipe hits the ground
    get flying() { return drone.k > 0; },
    get smoking() { return cig.on; },
    get walking() { return walk.on; },
    get scene() { return scene; }, get camera() { return camera; }, get renderer() { return renderer; },
    helpers: { M, box, cyl, sph, cap, toon, outline, put, canvasTex, V, pat }, EYE, BASE_YAW, look,
  };
})();
