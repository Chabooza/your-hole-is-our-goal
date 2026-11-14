'use strict';
/* Sonic Driller 3D: the driller's control panel in front of the camera, with working gauges, levers,
   knobs and switches, plus the driller's gloved hands that reach for whatever you operate. */
window.PANEL = (() => {
  const W = 1.42, HH = 0.64, FH = 0.92, K = 1400;   // panel width, top-row height, full face height (m), texture px per metre
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let H, APP, group, face, faceTex, lcdCtx, lcdTex, lcd2Ctx, lcd2Tex;
  const S = () => APP.S, C = () => APP.S.ctl;
  const pickables = [], gauges = {}, ctrls = {};
  let dirLamps;
  const hands = {};
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  const psi = v => `${Math.round(v * SIM.PD_MAX)} psi`;
  const DEF = [
    { id: 'start', type: 'button', x: -0.665, y: -0.03, color: 0x2f9a3a, label: 'START', tip: 'Start the engine (E)', press: () => { AUDIO.init(); SIM.ACT.engineStart(S()); } },
    { id: 'stop', type: 'button', x: -0.665, y: -0.12, color: 0xc8302a, label: 'STOP', tip: 'Shut the engine down (E)', press: () => SIM.ACT.engineStop(S()) },
    { id: 'throttle', type: 'knob', x: -0.55, y: -0.085, color: 0xf2b630, min: 0, max: 1, step: 0.05, lo: 'IDLE', hi: 'FULL', label: 'THROTTLE', tip: 'Engine throttle (T / G)', get: () => C().throttle, set: v => { C().throttle = v; }, fmt: v => `${Math.round(900 + 1300 * v)} rpm` },
    { id: 'feed', type: 'lever', x: -0.42, y: -0.13, color: 0xd3322a, label: 'FEED', far: 'DOWN', near: 'RAISE', tip: 'Push to feed down, pull to raise (S / W)', get: () => C().feed, set: v => { C().feed = v; }, fmt: v => v === 0 ? 'neutral' : `${v > 0 ? 'down' : 'raise'} ${Math.round(Math.abs(v) * 100)}%` },
    { id: 'pulldown', type: 'knob', x: -0.31, y: -0.085, color: 0xe9e5d4, min: 0, max: 1, step: 0.02, lo: '0', hi: '2500', label: 'PULLDOWN', tip: 'Feed pressure limit', get: () => C().feedSet, set: v => { C().feedSet = v; }, fmt: psi },
    { id: 'holdback', type: 'knob', x: -0.215, y: -0.085, color: 0xe9e5d4, min: 0, max: 1, step: 0.02, lo: '0', hi: '1500', label: 'HOLDBACK', tip: 'Takes head and string weight off the bit', get: () => C().holdback, set: v => { C().holdback = v; }, fmt: v => `${Math.round(v * SIM.HB_MAX)} psi` },
    { id: 'rot', type: 'lever', x: -0.07, y: -0.13, color: 0x2a6fd3, label: 'ROTATION', far: 'FWD', near: 'REV', tip: 'Push for forward, pull for reverse (D / A)', get: () => C().rot, set: v => { C().rot = v; }, fmt: v => v === 0 ? 'neutral' : `${v > 0 ? 'fwd' : 'rev'} ${Math.round(Math.abs(v) * 100)}%` },
    { id: 'osc', type: 'toggle', x: 0.065, y: -0.09, lamp: 0xff9a2e, label: 'OSCILLATOR', on: 'ON', off: 'OFF', tip: 'Sonic oscillator on/off (O)', get: () => C().oscOn, set: v => { AUDIO.init(); SIM.ACT.setOsc(S(), v); } },
    { id: 'freq', type: 'knob', x: 0.175, y: -0.085, color: 0xff9a2e, min: 0, max: 150, step: 1, lo: '0', hi: '150', label: 'FREQUENCY', tip: 'Sonic head frequency (↑ / ↓)', get: () => C().oscSet, set: v => { C().oscSet = v; }, fmt: v => `set ${Math.round(v)} Hz` },
    { id: 'pump', type: 'toggle', x: 0.31, y: -0.09, lamp: 0x5bb8f0, label: 'PUMP', on: 'ON', off: 'OFF', tip: 'Water pump on/off (P)', get: () => C().pumpOn, set: v => { AUDIO.init(); SIM.ACT.setPump(S(), v); } },
    { id: 'flow', type: 'knob', x: 0.42, y: -0.085, color: 0x5bb8f0, min: 0, max: 1, step: 0.02, lo: '0', hi: '30', label: 'FLOW', tip: 'Pump flow ([ / ])', get: () => C().pumpSet, set: v => { C().pumpSet = v; }, fmt: v => `${Math.round(v * 30)} gpm` },
    // second row: pipe handling
    { id: 'slide', type: 'lever', axis: 'x', x: -0.585, y: -0.455, color: 0x8e5bd0, label: 'HEAD SLIDE', far: 'RIGHT', near: 'LEFT', tip: 'Slide the head left or right. It always stops at centre of mast (J / L)', get: () => C().slide, set: v => { C().slide = v; }, fmt: v => v === 0 ? 'neutral' : `${v > 0 ? 'right' : 'left'} ${Math.round(Math.abs(v) * 100)}%` },
    { id: 'side', type: 'toggle', axis: 'x', x: -0.42, y: -0.44, lamp: 0x8e5bd0, label: 'HEAD SIDE', on: 'RIGHT', off: 'LEFT', tip: 'Which side of the mast the slide works on. LEFT: far left to centre. RIGHT: centre to far right (K)', get: () => C().side, set: v => SIM.ACT.setSide(S(), v) },
    { id: 'arm', type: 'lever', x: -0.275, y: -0.455, color: 0x6fae4a, label: 'CASING ARM', far: 'RAISE', near: 'LOWER', tip: 'Presenter arm: push to stand a casing joint up beside the mast, pull to lay it back on the rack (U / Y)', get: () => C().arm, set: v => { C().arm = v; }, fmt: v => v === 0 ? 'neutral' : `${v > 0 ? 'raise' : 'lower'} ${Math.round(Math.abs(v) * 100)}%` },
    { id: 'clampT', type: 'toggle', x: -0.135, y: -0.44, lamp: 0xf07d1a, label: 'TOP CLAMP', on: 'CLOSE', off: 'OPEN', tip: 'Top (break-out) clamp open/close (X)', get: () => C().clampT, set: v => SIM.ACT.setClampT(S(), v) },
    { id: 'brk', type: 'lever', x: 0, y: -0.455, color: 0xf07d1a, label: 'BREAK-OUT', far: 'MAKE', near: 'BREAK', tip: 'Swings the top clamp. Push = clockwise (make / wind up). Pull = counter-clockwise (break) (, / .)', get: () => C().brk, set: v => { C().brk = v; }, fmt: v => v === 0 ? 'neutral' : `${v > 0 ? 'make' : 'break'} ${Math.round(Math.abs(v) * 100)}%` },
    { id: 'clampB', type: 'toggle', x: 0.135, y: -0.44, lamp: 0xf2b630, label: 'BOTTOM CLAMP', on: 'CLOSE', off: 'OPEN', tip: 'Bottom (holding) clamp open/close (C)', get: () => C().clampB, set: v => SIM.ACT.setClampB(S(), v) },
    { id: 'tilt', type: 'toggle', x: 0.27, y: -0.44, lamp: 0xe0362b, label: 'HEAD TILT', on: 'OUT', off: 'IN', tip: 'Tilt the head and barrel out 45 degrees to shake the core out (Q)', get: () => C().tilt, set: v => SIM.ACT.setTilt(S(), v) },
    { id: 'winch', type: 'lever', x: 0.405, y: -0.455, color: 0xe9b52a, label: 'WINCH', far: 'LOWER', near: 'RAISE', tip: 'Pull to raise, push to lower (R / F)', get: () => -C().winch, set: v => { C().winch = -v; }, fmt: v => v === 0 ? 'neutral' : `${v > 0 ? 'lower' : 'raise'} ${Math.round(Math.abs(v) * 100)}%` },
    { id: 'horn', type: 'button', x: 0.665, y: 0.035, color: 0x2b2f33, label: 'HORN', tip: 'Sound the horn (H)', press: () => { AUDIO.init(); SIM.ACT.horn(S()); } },
    { id: 'estop', type: 'estop', x: 0.575, y: 0.13, label: 'E-STOP', tip: 'Emergency stop: kills the engine and every function', press: () => SIM.ACT.estop(S()) },
  ];
  const SECTIONS = [
    ['ENGINE', -0.705, -0.475, '#f2b630'], ['FEED', -0.465, -0.155, '#f2b630'], ['ROTATION', -0.145, 0.005, '#f2b630'],
    ['SONIC HEAD', 0.015, 0.245, '#f07d1a'], ['WATER', 0.255, 0.485, '#4aaee9'], ['SAFETY', 0.495, 0.705, '#f2b630'],
  ];
  const SECTIONS2 = [
    ['HEAD SLIDE', -0.705, -0.355, '#b493e6'], ['CASING ARM', -0.345, -0.205, '#8fcf66'], ['CLAMPS · BREAK-OUT', -0.195, 0.2, '#f07d1a'],
    ['TILT', 0.21, 0.33, '#f2b630'], ['WINCH', 0.34, 0.47, '#f2b630'], ['PIPE HANDLING', 0.48, 0.705, '#a6ee74'],
  ];
  const LCD2 = { x: 0.5925, y: -0.472, w: 0.205, h: 0.2 };
  const GDEF = [
    { id: 'rpm', x: -0.643, y: 0.125, r: 0.04, label: 'ENGINE', unit: 'RPM ×1000', min: 0, max: 3000, major: 500, minor: 100, every: 2, div: 1000, zones: [[1800, 2300, '#3f9b35'], [2400, 3000, '#c8302a']] },
    { id: 'hyd', x: -0.535, y: 0.125, r: 0.04, label: 'HYD OIL', unit: '°F', min: 50, max: 250, major: 50, minor: 10, zones: [[90, 180, '#3f9b35'], [180, 200, '#e0a020'], [200, 250, '#c8302a']] },
    { id: 'feed', x: -0.385, y: 0.115, r: 0.055, label: 'FEED', unit: 'PSI ×100', min: 0, max: 3000, major: 500, minor: 100, div: 100, zones: [[0, 2000, '#3f9b35'], [2000, 2600, '#e0a020'], [2600, 3000, '#c8302a']] },
    { id: 'hold', x: -0.235, y: 0.115, r: 0.055, label: 'HOLDBACK', unit: 'PSI ×100', min: 0, max: 2000, major: 500, minor: 100, div: 100, zones: [[0, 1500, '#3f9b35']] },
    { id: 'rot', x: -0.07, y: 0.115, r: 0.055, label: 'ROTATION', unit: 'PSI ×100', min: 0, max: 3000, major: 500, minor: 100, div: 100, zones: [[0, 1800, '#3f9b35'], [1800, 2500, '#e0a020'], [2500, 3000, '#c8302a']] },
    { id: 'osc', x: 0.08, y: 0.115, r: 0.055, label: 'OSCILLATION', unit: 'PSI ×100', min: 0, max: 5000, major: 1000, minor: 200, div: 100, zones: [[1200, 3200, '#3f9b35'], [3200, 4000, '#e0a020'], [4000, 5000, '#c8302a']] },
    { id: 'htemp', x: 0.198, y: 0.125, r: 0.04, label: 'HEAD', unit: '°F', min: 50, max: 300, major: 50, minor: 10, zones: [[70, 200, '#3f9b35'], [200, 230, '#e0a020'], [230, 300, '#c8302a']] },
    { id: 'pump', x: 0.32, y: 0.115, r: 0.055, label: 'PUMP', unit: 'PSI ×100', min: 0, max: 1500, major: 250, minor: 50, every: 2, div: 100, zones: [[50, 500, '#3f9b35'], [500, 950, '#e0a020'], [950, 1500, '#c8302a']] },
    { id: 'tank', x: 0.438, y: 0.125, r: 0.04, label: 'TANK', unit: 'GAL', min: 0, max: SIM.TANK_CAP, major: 50, minor: 10, zones: [[0, 30, '#c8302a'], [30, 60, '#e0a020'], [60, SIM.TANK_CAP, '#3f9b35']] },
  ];

  // face-local (metres, origin at the panel centre) to face texture pixels
  const px = x => (x + W / 2) * K, py = y => (HH / 2 - y) * K;

  function drawFace(c) {
    const w = W * K, h = FH * K;
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#363f38'); g.addColorStop(1, '#262d28');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#111'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#6c766e';
    for (const [x, y] of [[24, 24], [w - 24, 24], [24, h - 24], [w - 24, h - 24]]) { c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); }
    // LCD bezel
    c.fillStyle = '#050805'; rr(c, px(-0.7) - 8, py(0.305) - 8, (1.16) * K + 16, 0.064 * K + 16, 10); c.fill();
    // sections
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const [name, a, b, col] of SECTIONS) {
      c.strokeStyle = '#4a554d'; c.lineWidth = 4; rr(c, px(a), py(0.225), (b - a) * K, (0.225 + 0.3) * K, 14); c.stroke();
      c.fillStyle = col; rr(c, px(a) + 8, py(0.215), (b - a) * K - 16, 0.034 * K, 8); c.fill();
      c.fillStyle = name === 'SONIC HEAD' || name === 'WATER' ? '#0f1210' : '#1a1408';
      c.font = '800 34px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText(name, px((a + b) / 2), py(0.198) + 2);
    }
    for (const [name, a, b, col] of SECTIONS2) {
      c.strokeStyle = '#4a554d'; c.lineWidth = 4; rr(c, px(a), py(-0.31), (b - a) * K, 0.28 * K, 14); c.stroke();
      c.fillStyle = col; rr(c, px(a) + 8, py(-0.318), (b - a) * K - 16, 0.034 * K, 8); c.fill();
      c.fillStyle = '#16120a';
      c.font = '800 32px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText(name, px((a + b) / 2), py(-0.335) + 2);
    }
    c.fillStyle = '#050805'; rr(c, px(LCD2.x - LCD2.w / 2) - 6, py(LCD2.y + LCD2.h / 2) - 6, LCD2.w * K + 12, LCD2.h * K + 12, 10); c.fill();
    // gauge sockets
    for (const gd of GDEF) { c.fillStyle = '#121513'; c.beginPath(); c.arc(px(gd.x), py(gd.y), (gd.r + 0.012) * K, 0, 7); c.fill(); }
    c.font = '700 26px "Barlow Condensed", Arial Narrow, sans-serif';
    for (const d of DEF) {
      c.fillStyle = '#e6e8dc';
      if (d.type === 'lever' && d.axis === 'x') {
        c.fillStyle = '#0c0f0d'; rr(c, px(d.x - 0.075), py(d.y) - 16, 0.15 * K, 32, 16); c.fill();
        c.fillStyle = '#6e786f'; c.fillRect(px(d.x) - 2, py(d.y) - 30, 4, 60);
        c.fillStyle = '#9ba495'; c.font = '800 24px "Barlow Condensed", Arial Narrow, sans-serif';
        c.fillText(d.near, px(d.x - 0.062), py(d.y + 0.045)); c.fillText(d.far, px(d.x + 0.062), py(d.y + 0.045));
        c.fillStyle = '#e6e8dc'; c.font = '800 27px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText(d.label, px(d.x), py(d.y - 0.118));
      } else if (d.type === 'lever') {
        c.fillStyle = '#0c0f0d'; rr(c, px(d.x) - 16, py(d.y + 0.075), 32, 0.15 * K, 16); c.fill();
        c.fillStyle = '#6e786f'; c.fillRect(px(d.x) - 30, py(d.y) - 2, 60, 4);
        c.fillStyle = '#9ba495'; c.font = '800 24px "Barlow Condensed", Arial Narrow, sans-serif';
        c.fillText(d.far, px(d.x), py(d.y + 0.092)); c.fillText(d.near, px(d.x), py(d.y - 0.092));
        c.fillStyle = '#e6e8dc'; c.font = '800 27px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText(d.label, px(d.x), py(d.y - 0.118));
      } else if (d.type === 'knob') {
        c.strokeStyle = '#c9cdbf';
        for (let i = 0; i <= 10; i++) {
          const a = (-135 + 27 * i) * Math.PI / 180, r0 = (i % 5 ? 0.033 : 0.031) * K, r1 = 0.038 * K;
          c.lineWidth = i % 5 ? 2 : 4; c.beginPath();
          c.moveTo(px(d.x) + Math.sin(a) * r0, py(d.y) - Math.cos(a) * r0); c.lineTo(px(d.x) + Math.sin(a) * r1, py(d.y) - Math.cos(a) * r1); c.stroke();
        }
        c.fillStyle = '#9ba495'; c.font = '700 20px "Barlow Condensed", Arial Narrow, sans-serif';
        c.fillText(d.lo, px(d.x - 0.03), py(d.y - 0.04)); c.fillText(d.hi, px(d.x + 0.03), py(d.y - 0.04));
        c.fillStyle = '#e6e8dc'; c.font = '800 25px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText(d.label, px(d.x), py(d.y - 0.065));
      } else if (d.type === 'toggle' && d.axis === 'x') {
        c.fillStyle = '#9ba495'; c.font = '800 21px "Barlow Condensed", Arial Narrow, sans-serif';
        c.fillText(d.off, px(d.x - 0.03), py(d.y - 0.045)); c.fillText(d.on, px(d.x + 0.032), py(d.y - 0.045));
        c.fillStyle = '#e6e8dc'; c.font = '800 24px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText(d.label, px(d.x), py(d.y - 0.078));
      } else if (d.type === 'toggle') {
        c.fillStyle = '#9ba495'; c.font = '800 21px "Barlow Condensed", Arial Narrow, sans-serif';
        c.fillText(d.on, px(d.x), py(d.y + 0.047)); c.fillText(d.off, px(d.x), py(d.y - 0.045));
        c.fillStyle = '#e6e8dc'; c.font = '800 24px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText(d.label, px(d.x), py(d.y - 0.07));
      } else if (d.type === 'button') {
        c.font = '800 22px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText(d.label, px(d.x + 0.04), py(d.y));
      } else if (d.type === 'estop') {
        c.fillStyle = '#f2b630'; c.beginPath(); c.arc(px(d.x), py(d.y), 0.05 * K, 0, 7); c.fill();
        c.fillStyle = '#1a1408'; c.font = '800 20px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText('EMERGENCY', px(d.x), py(d.y + 0.043));
        c.fillStyle = '#ffb3a8'; c.font = '800 24px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText('E-STOP', px(d.x), py(d.y - 0.065));
      }
    }
    // feed direction lamp labels
    c.fillStyle = '#9ba495'; c.font = '800 20px "Barlow Condensed", Arial Narrow, sans-serif';
    c.fillText('FEED DN', px(-0.345), py(0.045)); c.fillText('UP', px(-0.27), py(0.045));
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  function gaugeFace(o) {
    return H.canvasTex(256, 256, (c) => {
      const cx = 128, cy = 128;
      const gr = c.createRadialGradient(118, 104, 10, 128, 128, 128); gr.addColorStop(0, '#fbf7ea'); gr.addColorStop(1, '#e3dcc4');
      c.fillStyle = gr; c.beginPath(); c.arc(cx, cy, 127, 0, 7); c.fill();
      const span = o.max - o.min, A = v => (-135 + 270 * (v - o.min) / span - 90) * Math.PI / 180;
      for (const [a, b, col] of o.zones) { c.strokeStyle = col; c.lineWidth = 13; c.beginPath(); c.arc(cx, cy, 92, A(a), A(b)); c.stroke(); }
      c.strokeStyle = '#1f1b18'; c.fillStyle = '#1f1b18';
      for (let v = o.min; v <= o.max + 1e-6; v += o.minor) {
        const n = (v - o.min) / o.major, major = Math.abs(n - Math.round(n)) < 1e-6, a = A(v);
        c.lineWidth = major ? 4 : 2; c.beginPath();
        c.moveTo(cx + Math.cos(a) * (major ? 86 : 96), cy + Math.sin(a) * (major ? 86 : 96)); c.lineTo(cx + Math.cos(a) * 108, cy + Math.sin(a) * 108); c.stroke();
        if (major && Math.round(n) % (o.every || 1) === 0) {
          c.font = `700 ${o.r < 0.05 ? 26 : 22}px "Barlow Condensed", Arial Narrow, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(String(Math.round(v / (o.div || 1) * 10) / 10), cx + Math.cos(a) * 66, cy + Math.sin(a) * 66);
        }
      }
      c.font = `800 ${o.r < 0.05 ? 26 : 23}px "Barlow Condensed", Arial Narrow, sans-serif`; c.fillText(o.label, cx, cy + 46);
      c.font = '600 16px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillStyle = '#5d5347'; c.fillText(o.unit, cx, cy + 68);
    });
  }

  function addGauge(gd) {
    const g = new THREE.Group(); g.position.set(gd.x, gd.y, 0); face.add(g);
    const housing = H.cyl(gd.r + 0.01, gd.r + 0.01, 0.03, 0x4b5258, 0.003, 32); housing.rotation.x = Math.PI / 2; housing.position.z = 0.002; g.add(housing);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(gd.r, 48), new THREE.MeshBasicMaterial({ map: gaugeFace(gd) })); disc.position.z = 0.0175; g.add(disc);
    const bez = new THREE.Mesh(new THREE.TorusGeometry(gd.r + 0.004, 0.0055, 8, 48), H.toon(0xc5ccd2)); bez.position.z = 0.018; g.add(bez);
    const pivot = new THREE.Group(); pivot.position.z = 0.02; g.add(pivot);
    const nd = new THREE.Mesh(new THREE.BoxGeometry(gd.r * 0.075, gd.r * 0.86, 0.002), new THREE.MeshBasicMaterial({ color: 0xc8202a })); nd.position.y = gd.r * 0.34; pivot.add(nd);
    const capm = new THREE.Mesh(new THREE.CircleGeometry(gd.r * 0.12, 20), new THREE.MeshBasicMaterial({ color: 0x1b1b1b })); capm.position.z = 0.0215; g.add(capm);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(gd.r, 32, 0.6, 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })); glass.position.z = 0.023; g.add(glass);
    let shown = gd.min;
    const span = gd.max - gd.min;
    gauges[gd.id] = (v, dt, jit) => {
      shown += (v - shown) * Math.min(1, dt * 7);
      const j = jit ? (Math.random() - 0.5) * jit * span * 0.02 : 0;
      const f = clamp((shown + j - gd.min) / span, -0.01, 1.01);
      pivot.rotation.z = -(-135 + 270 * f) * Math.PI / 180;
    };
  }

  function hitSphere(r, d) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    m.userData.ctl = d; pickables.push(m); return m;
  }
  function collectOutlines(obj) { const a = []; obj.traverse(o => { if (o.userData.outline) a.push(o); }); return a; }

  function addControl(d) {
    const g = new THREE.Group(); g.position.set(d.x, d.y, 0.004); face.add(g);
    const c = { d, g, anchor: new THREE.Object3D(), hand: d.x < 0 ? 'L' : 'R', press: 0 };
    if (d.type === 'lever') {
      const boot = H.cyl(0.018, 0.026, 0.03, 0x1b1e20, 0.003, 16); boot.rotation.x = Math.PI / 2; boot.position.z = 0.012; g.add(boot);
      const pivot = new THREE.Group(); g.add(pivot);
      const stick = H.cyl(0.0075, 0.0075, 0.15, 0xdfe4e8, 0.002, 10); stick.rotation.x = Math.PI / 2; stick.position.z = 0.075; pivot.add(stick);
      const ball = H.sph(0.021, d.color, 0.003, 18, 12); ball.position.z = 0.16; pivot.add(ball);
      pivot.add(c.anchor); c.anchor.position.z = 0.16;
      c.axis = d.axis || 'y';
      const hs = hitSphere(0.04, d); hs.position.z = 0.15; pivot.add(hs);
      const hs2 = hitSphere(0.03, d); hs2.position.z = 0.07; pivot.add(hs2);
      c.pivot = pivot; c.grip = 1;
    } else if (d.type === 'knob') {
      const skirt = H.cyl(0.03, 0.03, 0.01, 0x1b1e20, 0.002, 28); skirt.rotation.x = Math.PI / 2; skirt.position.z = 0.005; g.add(skirt);
      const rot = new THREE.Group(); g.add(rot);
      const capk = H.cyl(0.022, 0.024, 0.026, 0x2b2f33, 0.003, 18); capk.rotation.x = Math.PI / 2; capk.position.z = 0.023; rot.add(capk);
      const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.003), new THREE.MeshBasicMaterial({ color: d.color })); ptr.position.set(0, 0.011, 0.037); rot.add(ptr);
      c.rot = rot; c.anchor.position.set(0, -0.005, 0.045); g.add(c.anchor);
      const hs = hitSphere(0.034, d); hs.position.z = 0.02; g.add(hs);
      c.grip = 0.55;
    } else if (d.type === 'toggle') {
      const plate = H.box(0.04, 0.06, 0.006, 0x1b201d, 0.002); plate.position.z = 0.003; g.add(plate);
      const pivot = new THREE.Group(); pivot.position.z = 0.006; g.add(pivot);
      const bat = H.cyl(0.005, 0.0065, 0.045, 0xe6eaec, 0.0015, 10); bat.rotation.x = Math.PI / 2; bat.position.z = 0.022; pivot.add(bat);
      c.lampOff = new THREE.MeshBasicMaterial({ color: 0x2a2e2b }); c.lampOn = new THREE.MeshBasicMaterial({ color: d.lamp });
      c.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.009, 14, 10), c.lampOff); c.lamp.position.set(0, 0.062, 0.006); g.add(c.lamp);
      c.pivot = pivot; c.anchor.position.set(0, 0, 0.045); pivot.add(c.anchor); c.axis = d.axis || 'y';
      const hs = hitSphere(0.034, d); hs.position.z = 0.02; g.add(hs);
      c.grip = 0.2;
    } else if (d.type === 'button') {
      const ring = H.cyl(0.024, 0.024, 0.01, 0x7a8288, 0.002, 20); ring.rotation.x = Math.PI / 2; ring.position.z = 0.005; g.add(ring);
      const capb = H.cyl(0.018, 0.018, 0.016, d.color, 0.002, 20); capb.rotation.x = Math.PI / 2; capb.position.z = 0.015; g.add(capb);
      c.cap = capb; c.anchor.position.set(0, 0, 0.03); g.add(c.anchor);
      const hs = hitSphere(0.03, d); hs.position.z = 0.012; g.add(hs);
      c.grip = 0.2;
    } else if (d.type === 'estop') {
      const base = H.cyl(0.03, 0.034, 0.018, 0x1a1408, 0.002, 24); base.rotation.x = Math.PI / 2; base.position.z = 0.009; g.add(base);
      const mush = H.sph(0.036, 0xd8281f, 0.003, 24, 12); mush.scale.z = 0.55; mush.position.z = 0.026; g.add(mush);
      c.cap = mush; c.anchor.position.set(0, 0, 0.05); g.add(c.anchor);
      const hs = hitSphere(0.045, d); hs.position.z = 0.02; g.add(hs);
      c.grip = 0; c.hand = 'R';
    }
    if (d.type === 'lever' && d.id === 'feed') c.hand = 'L';
    c.outlines = collectOutlines(g);
    ctrls[d.id] = c;
  }

  // ---------- hands ----------
  function makeHand(side) {
    const g = new THREE.Group();
    const glove = 0xd9a441, cuff = 0xc48e33;
    g.add(H.box(0.082, 0.09, 0.03, glove, 0.004));
    const cf = H.cyl(0.042, 0.047, 0.07, cuff, 0.004, 14); cf.position.y = -0.075; g.add(cf);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const pv = new THREE.Group(); pv.position.set(-0.03 + i * 0.02, 0.043, 0); g.add(pv);
      const f = H.cap(0.0105, 0.038 - Math.abs(i - 1.5) * 0.004, glove, 0.003); f.position.y = 0.026; pv.add(f);
      fingers.push(pv);
    }
    const th = new THREE.Group(); th.position.set(-side * 0.043, -0.005, 0.004); th.rotation.z = side * 0.9; g.add(th);
    const tf = H.cap(0.012, 0.03, glove, 0.003); tf.position.y = 0.024; th.add(tf);
    const arm = H.cyl(0.046, 0.052, 1, 0x2f5d8c, 0.006, 12);
    H.put(arm, 0, 0, 0, H.scene || null);
    return { g, fingers, thumb: th, arm, side, ctl: null, t: 0, curl: 0, pos: null, poke: 0 };
  }

  function build(app) {
    APP = app; H = WORLD.helpers; H.scene = WORLD.scene;
    const E = WORLD.EYE, yaw = WORLD.BASE_YAW;
    const fwd = V(-Math.sin(yaw), 0, -Math.cos(yaw));
    group = new THREE.Group();
    group.position.set(E.x + fwd.x * 0.72, 1.22, E.z + fwd.z * 0.72);
    group.rotation.y = yaw;
    group.scale.setScalar(0.66);
    WORLD.scene.add(group);
    // pedestal
    H.put(H.box(0.9, 1.3, 0.3, 0x2a302c), 0, -0.95, -0.05, group);
    face = new THREE.Group(); face.rotation.x = -0.87; group.add(face);
    const FY = HH / 2 - FH / 2;            // the face grew downward; the top row keeps its old coordinates
    H.put(H.box(W + 0.05, FH + 0.05, 0.1, 0x1f2421, 0.008), 0, FY, -0.052, face);
    const cv = document.createElement('canvas'); cv.width = Math.round(W * K); cv.height = Math.round(FH * K);
    drawFace(cv.getContext('2d'));
    faceTex = new THREE.CanvasTexture(cv); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 8;
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(W, FH), new THREE.MeshToonMaterial({ map: faceTex, gradientMap: null }));
    fm.position.y = FY; fm.receiveShadow = true; face.add(fm);
    // LCD strip
    const lc = document.createElement('canvas'); lc.width = 1624; lc.height = 90; lcdCtx = lc.getContext('2d');
    lcdTex = new THREE.CanvasTexture(lc); lcdTex.colorSpace = THREE.SRGBColorSpace; lcdTex.anisotropy = 8;
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.064), new THREE.MeshBasicMaterial({ map: lcdTex }));
    lm.position.set(-0.7 + 0.58, 0.273, 0.003); face.add(lm);
    const l2 = document.createElement('canvas'); l2.width = 492; l2.height = 480; lcd2Ctx = l2.getContext('2d');
    lcd2Tex = new THREE.CanvasTexture(l2); lcd2Tex.colorSpace = THREE.SRGBColorSpace; lcd2Tex.anisotropy = 8;
    const l2m = new THREE.Mesh(new THREE.PlaneGeometry(LCD2.w, LCD2.h), new THREE.MeshBasicMaterial({ map: lcd2Tex }));
    l2m.position.set(LCD2.x, LCD2.y, 0.003); face.add(l2m);
    GDEF.forEach(addGauge);
    DEF.forEach(addControl);
    // feed direction lamps
    const mk = () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0x2a2e2b })); face.add(m); return m; };
    dirLamps = { dn: mk(), up: mk(), off: new THREE.MeshBasicMaterial({ color: 0x2a2e2b }), dnOn: new THREE.MeshBasicMaterial({ color: 0xffcf5a }), upOn: new THREE.MeshBasicMaterial({ color: 0x8ed2ff }) };
    dirLamps.dn.position.set(-0.345, 0.062, 0.006); dirLamps.up.position.set(-0.27, 0.062, 0.006);
    // hands
    hands.L = makeHand(-1); hands.R = makeHand(1);
    WORLD.scene.add(hands.L.g, hands.R.g);
    for (const hnd of [hands.L, hands.R]) WORLD.scene.add(hnd.arm);
    face.updateMatrixWorld(true);
  }

  // ---------- interaction ----------
  let hovered = null;
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xffd34a, side: THREE.BackSide });
  function setHover(d) {
    if (hovered === d) return;
    if (hovered) ctrls[hovered.id].outlines.forEach(o => { o.material = o.userData.mat0; });
    hovered = d;
    if (d) ctrls[d.id].outlines.forEach(o => { o.userData.mat0 = o.userData.mat0 || o.material; o.material = hlMat; });
  }
  function hit(raycaster) {
    const r = raycaster.intersectObjects(pickables, false);
    return r.length ? r[0].object.userData.ctl : null;
  }
  // for fingers: the control whose handle is nearest the touch, within maxPx on screen
  function nearest(x, y, maxPx) {
    let best = null, bd = maxPx;
    for (const id in ctrls) {
      ctrls[id].anchor.getWorldPosition(wp);
      const p = WORLD.project(wp); if (!p.front) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = ctrls[id].d; }
    }
    return best;
  }
  // the outline of the panel face (and the tops of the levers) in the world, for framing the close-up view
  function framePoints() {
    return [[-0.735, 0.345, 0], [0.735, 0.345, 0], [-0.735, -0.625, 0], [0.735, -0.625, 0], [-0.6, -0.455, 0.2], [0.42, -0.455, 0.2], [-0.42, -0.13, 0.2]]
      .map(([x, y, z]) => face.localToWorld(V(x, y, z)));
  }
  function touch(id) {
    const c = ctrls[id]; if (!c) return;
    let hand = hands[c.hand];
    const other = hands[c.hand === 'L' ? 'R' : 'L'];
    if (c.d.type !== 'estop' && hand.ctl && hand.ctl !== id && ctrls[hand.ctl].d.type === 'lever' && ctrls[hand.ctl].d.get() !== 0 && !(other.ctl && ctrls[other.ctl].d.type === 'lever' && ctrls[other.ctl].d.get() !== 0)) hand = other;
    if (other.ctl === id) hand = other;
    hand.ctl = id; hand.t = 0;
    if (c.d.type === 'button' || c.d.type === 'estop' || c.d.type === 'toggle') hand.poke = 0.25;
  }
  let drag = null;
  function begin(d) {
    touch(d.id);
    if (d.type === 'lever' || d.type === 'knob') { drag = { d, v0: d.get() }; return true; }
    if (d.type === 'toggle') d.set(!d.get());
    else d.press();
    ctrls[d.id].press = 0.18;
    return false;
  }
  function move(dx, dy) {
    if (!drag) return;
    const d = drag.d; drag.dx = (drag.dx || 0) + dx; drag.dy = (drag.dy || 0) + dy;
    touch(d.id);
    if (d.type === 'lever') {
      let v = clamp(d.axis === 'x' ? drag.v0 + drag.dx / 130 : drag.v0 - drag.dy / 130, -1, 1);
      if (Math.abs(v) < 0.07) v = 0;
      d.set(Math.round(v * 50) / 50);
    } else {
      const v = drag.v0 + (-drag.dy + drag.dx * 0.5) / 260 * (d.max - d.min);
      d.set(clamp(Math.round(v / d.step) * d.step, d.min, d.max));
    }
  }
  function end() { drag = null; }
  function cancel() { if (drag) drag.d.set(drag.v0); drag = null; }   // a lever grabbed by mistake goes back where it was
  function wheel(d, dir) {
    touch(d.id);
    if (d.type === 'knob') d.set(clamp(Math.round((d.get() + dir * d.step) / d.step) * d.step, d.min, d.max));
    else if (d.type === 'lever') { let v = clamp(d.get() + dir * 0.1, -1, 1); if (Math.abs(v) < 0.05) v = 0; d.set(Math.round(v * 10) / 10); }
  }
  function describe(d) {
    let val = '';
    if (d.type === 'lever' || d.type === 'knob') val = d.fmt(d.get());
    else if (d.type === 'toggle') val = d.get() ? d.on : d.off;
    return { title: d.label + (val ? ` · ${val}` : ''), tip: d.tip };
  }

  // ---------- per frame ----------
  let lcdT = 0;
  const q = new THREE.Quaternion(), nrm = V(), up = V(), wp = V(), tmp = V();
  function update(s, dt) {
    const sh = s.shake;
    gauges.rpm(s.engine.rpm, dt, s.engine.on ? 0.4 + sh : 0);
    gauges.hyd(s.hyd.temp, dt, 0);
    gauges.feed(s.g.feed, dt, sh * 1.2);
    gauges.hold(s.g.hold, dt, sh * 0.6);
    gauges.rot(s.g.rot, dt, sh + (s.inCobble ? 1.5 : 0));
    gauges.osc(s.g.osc, dt, s.head.hz > 8 ? 0.4 + sh * 1.5 : 0);
    gauges.htemp(s.head.temp, dt, 0);
    gauges.pump(s.g.pump, dt, s.water.flow > 0 ? 0.6 : 0);
    gauges.tank(s.water.tank, dt, 0);
    dirLamps.dn.material = s.g.feedDir > 0 ? dirLamps.dnOn : dirLamps.off;
    dirLamps.up.material = s.g.feedDir < 0 ? dirLamps.upOn : dirLamps.off;
    for (const id in ctrls) {
      const c = ctrls[id], d = c.d;
      if (d.type === 'lever' && c.axis === 'x') c.pivot.rotation.y += (d.get() * 0.5 - c.pivot.rotation.y) * Math.min(1, dt * 18);
      else if (d.type === 'lever') c.pivot.rotation.x += (-d.get() * 0.5 - c.pivot.rotation.x) * Math.min(1, dt * 18);
      else if (d.type === 'knob') c.rot.rotation.z = -(-135 + 270 * (d.get() - d.min) / (d.max - d.min)) * Math.PI / 180;
      else if (d.type === 'toggle') { const on = !!d.get(), ax = c.axis === 'x' ? 'y' : 'x'; c.pivot.rotation[ax] += ((on ? 0.55 : -0.55) - c.pivot.rotation[ax]) * Math.min(1, dt * 25); c.lamp.material = on ? c.lampOn : c.lampOff; }
      if (c.cap) { c.press = Math.max(0, c.press - dt); c.cap.position.z = (d.type === 'estop' ? 0.026 : 0.015) - (c.press > 0 ? 0.006 : 0); }
    }
    lcdT += dt; if (lcdT > 0.1) { lcdT = 0; drawLCD(s); drawLCD2(s); }
    updateHands(dt);
  }

  function drawLCD(s) {
    const c = lcdCtx, w = 1624, h = 90;
    c.fillStyle = '#121c0e'; c.fillRect(0, 0, w, h);
    const trip = Math.abs(s.winchV) > 0.01;
    const cells = [
      ['BARREL', s.core.len && s.core.bit >= 0 ? `${s.core.bit.toFixed(1)} ft` : 'OUT'], ['CASING', `${s.casing.depth.toFixed(1)} ft`],
      trip ? ['WINCH', `${Math.abs(s.winchV).toFixed(2)} ft/s`] : ['RUN', `${s.run.fill.toFixed(1)}/10`],
      ['PEN RATE', `${s.rop.toFixed(1)}/min`], ['HEAD', `${Math.round(s.head.hz)} Hz`],
      ['ROTATION', `${Math.round(Math.abs(s.rpm))} ${s.rpm > 0.5 ? 'F' : s.rpm < -0.5 ? 'R' : ''}rpm`],
      ['WATER CSG', s.casing.depth > 0.5 ? `${s.water.level.toFixed(1)} ft` : '—'], ['HEAVE', `${s.hole.heave.toFixed(1)} ft`],
    ];
    const cw = w / cells.length;
    cells.forEach(([l, v], i) => {
      const warn = (l === 'RUN' && s.phase === 'CORE_RUN' && SIM.rodDown(s)) || (l === 'HEAVE' && s.hole.heave > 0.25) || (l === 'WATER CSG' && s.casing.depth > SIM.WT && s.water.level > SIM.WT);
      c.fillStyle = '#6fa04c'; c.font = '700 22px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText(l, i * cw + 14, 8);
      c.fillStyle = warn ? '#ffcf5a' : '#a6ee74'; c.font = '700 33px "B612 Mono", Consolas, monospace';
      c.fillText(v, i * cw + 14, 38);
      if (i) { c.fillStyle = '#20301a'; c.fillRect(i * cw, 8, 2, h - 16); }
    });
    lcdTex.needsUpdate = true;
  }

  function drawLCD2(s) {
    const c = lcd2Ctx, w = 492, hh = 480, h = s.head, f = v => v.toFixed(1);
    c.fillStyle = '#121c0e'; c.fillRect(0, 0, w, hh);
    const xs = Math.abs(h.x) < 0.02 ? 'CENTRE' : h.x < -0.98 ? 'FULL LEFT' : h.x > 0.98 ? 'FULL RIGHT' : `${h.x < 0 ? 'L' : 'R'} ${Math.round(Math.abs(h.x) * 100)}%`;
    const nm = { core: 'RODS', casing: 'CASING', pipe: 'JOINT', arm: 'CASING', hang: 'STRING', loose: 'PIPE' };
    let th, thW = false;
    if (h.conn && h.eng < 1) { th = `${nm[h.conn]} ${Math.round(h.eng * 100)}%`; thW = true; }
    else if (h.conn === 'pipe') { const g = s.hang; th = g.eng > 0 ? `MAKING ${Math.round(g.eng * 100)}%` : s.contact === 'hang' ? 'JOINT LANDED' : `CARRY ${g.type === 'casing' ? 'CASING' : 'ROD'}`; thW = g.eng > 0 || s.contact === 'hang'; }
    else if (h.conn) { const j = s.jt; th = j && j.eng < 1 ? `ROD OUT ${Math.round((1 - j.eng) * 100)}%` : `ON ${nm[h.conn]}`; }
    else if (s.contact) { th = `LANDED ${nm[s.contact]}`; thW = true; }
    else th = 'FREE';
    const k = SIM.zoneJoint(s), j = s.jt;
    let jt = '—', jtW = false;
    if (k && j && j.above === k) { jt = `${f(SIM.jointY(s))}ft ${j.tight <= 0 ? 'BROKEN' : Math.round(j.tight * 100) + '%'}`; jtW = true; }
    else if (SIM.rodsIn(s)) { const y = SIM.coreTop(s) - SIM.JT; jt = y > 0 ? `at ${f(y)} ft` : 'below table'; }
    const gB = SIM.gripB(s), gT = SIM.gripT(s), gn = { core: 'RODS', casing: 'CASING', hang: 'JOINT', loose: 'PIPE', stand: 'STAND' };
    const rows = [
      ['HEAD', `${xs}  ${f(h.y)} ft`, Math.abs(h.x) < 0.02],
      ['THREAD', th, thW],
      ['JOINT', jt, jtW],
      ['TOP CLAMP', `${s.ctl.clampT ? (gn[gT] || 'CLOSED') : 'OPEN'}  swing ${Math.round(s.tc.ang * 100)}%`, s.ctl.clampT],
      ['BOTTOM CLAMP', s.ctl.clampB ? (gn[gB] || 'CLOSED') : 'OPEN', s.ctl.clampB],
      ['WINCH HOOK', `${f(s.winch.y)} ft${s.winch.conn ? (s.winch.conn === 'core' ? '  RODS' : '  STAND') : ''}`, !!s.winch.conn],
      ['RACK / HORSES', `${s.rack.casing + (s.arm.holds ? 1 : 0)} csg  ${s.yard.stands} std  ${s.yard.singles} sgl`, false],
    ];
    const rh = hh / rows.length;
    rows.forEach(([l, v, hot], i) => {
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillStyle = '#6fa04c'; c.font = '700 19px "Barlow Condensed", Arial Narrow, sans-serif'; c.fillText(l, 12, i * rh + 5);
      c.fillStyle = hot ? '#ffcf5a' : '#a6ee74'; c.font = '700 27px "B612 Mono", Consolas, monospace'; c.fillText(v, 12, i * rh + 27);
      if (i) { c.fillStyle = '#20301a'; c.fillRect(8, i * rh, w - 16, 2); }
    });
    lcd2Tex.needsUpdate = true;
  }

  function updateHands(dt) {
    face.updateMatrixWorld(true);
    face.getWorldQuaternion(q);
    nrm.set(0, 0, 1).applyQuaternion(q); up.set(0, 1, 0).applyQuaternion(q);
    for (const key of ['L', 'R']) {
      const hd = hands[key];
      hd.t += dt; hd.poke = Math.max(0, hd.poke - dt);
      if (hd.ctl) {
        const c = ctrls[hd.ctl];
        const holdLever = c.d.type === 'lever' && c.d.get() !== 0;
        if (!holdLever && hd.t > (drag && drag.d.id === hd.ctl ? 999 : 2.2)) hd.ctl = null;
      }
      let target, curl;
      if (hd.ctl) {
        const c = ctrls[hd.ctl];
        c.anchor.getWorldPosition(wp);
        target = wp.clone();
        if (c.d.type === 'lever') target.addScaledVector(nrm, 0.022).addScaledVector(up, -0.035);
        else if (c.d.type === 'knob') target.addScaledVector(nrm, 0.012).addScaledVector(up, -0.05);
        else target.addScaledVector(nrm, 0.01 + (hd.poke > 0.12 ? -0.008 : 0.012)).addScaledVector(up, -0.07);
        curl = c.grip;
      } else {
        tmp.set(key === 'L' ? -0.34 : 0.32, -0.66, 0.04); target = face.localToWorld(tmp.clone());
        curl = 0.35;
      }
      if (!hd.pos) hd.pos = target.clone();
      hd.pos.lerp(target, 1 - Math.exp(-dt * 12));
      hd.curl += (curl - hd.curl) * Math.min(1, dt * 10);
      hd.g.position.copy(hd.pos);
      hd.g.quaternion.copy(q);
      hd.g.rotateZ(hd.side * -0.22);
      hd.fingers.forEach((f, i) => { f.rotation.x = -hd.curl * (1.35 + i * 0.05); });
      hd.thumb.rotation.x = -hd.curl * 0.8;
      // forearm from shoulder to the glove cuff
      const wrist = hd.pos.clone().addScaledVector(up, -0.1).addScaledVector(nrm, 0.01);
      const sh = WORLD.shoulder(hd.side);
      const dir = wrist.clone().sub(sh), len = dir.length();
      hd.arm.position.copy(sh).addScaledVector(dir, 0.5);
      hd.arm.scale.set(1, len, 1);
      hd.arm.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
    }
  }

  // What the hands on the levers wear. spec = { palm, cuff, fingers: [four colours], thumb, size } from js/swag.js or
  // the grippy gloves; nothing = the plain tan leather. sleeve = the colour (or pattern name) of the outfit's arms.
  function setGloves(spec, sleeve) {
    const s = spec || {}, palm = s.palm == null ? 0xd9a441 : s.palm, cuff = s.cuff == null ? 0xc48e33 : s.cuff;
    const arm = sleeve == null ? 0x2f5d8c : typeof sleeve === 'string' ? H.pat(sleeve) : sleeve;
    for (const k of ['L', 'R']) {
      const hd = hands[k], ch = hd.g.children;
      ch[0].material = H.toon(palm); ch[1].material = H.toon(cuff);
      for (let i = 0; i < 4; i++) ch[2 + i].children[0].material = H.toon(s.fingers ? s.fingers[k === 'L' ? i : 3 - i] : palm);
      ch[6].children[0].material = H.toon(s.thumb == null ? palm : s.thumb);
      hd.g.scale.setScalar(s.size || 1);
      hd.arm.material = H.toon(arm);
    }
  }
  // the item brought from the shop: a card clipped to the top corner of the console, with its picture and name
  let plaque = null, plaqueCtx = null, plaqueTex = null, plaqueKey = '';
  function setItem(icon, name, spent) {
    if (!group) return;
    if (!plaque) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 300; plaqueCtx = cv.getContext('2d');
      plaqueTex = new THREE.CanvasTexture(cv); plaqueTex.colorSpace = THREE.SRGBColorSpace; plaqueTex.anisotropy = 4;
      plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.2), new THREE.MeshBasicMaterial({ map: plaqueTex, transparent: true }));
      plaque.position.set(W / 2 - 0.1, HH / 2 + 0.085, 0.012); face.add(plaque);
    }
    plaque.visible = !!icon;
    const key = icon + '|' + name + '|' + (spent ? 1 : 0);
    if (!icon || key === plaqueKey) return;
    plaqueKey = key;
    const c = plaqueCtx; c.clearRect(0, 0, 256, 300);
    c.beginPath(); c.moveTo(34, 8); c.arcTo(248, 8, 248, 292, 26); c.arcTo(248, 292, 8, 292, 26); c.arcTo(8, 292, 8, 8, 26); c.arcTo(8, 8, 248, 8, 26); c.closePath();
    c.fillStyle = '#fffdf4'; c.fill(); c.lineWidth = 10; c.strokeStyle = '#1b1710'; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1b1710';
    c.font = '132px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'; c.fillText(icon, 128, 112);
    c.font = '700 31px "Barlow Condensed", "Arial Narrow", sans-serif';
    const words = name.split(' '), lines = [''];
    for (const w of words) { const cur = lines[lines.length - 1], next = cur ? cur + ' ' + w : w; if (c.measureText(next).width > 216 && cur) lines.push(w); else lines[lines.length - 1] = next; }
    lines.slice(0, 3).forEach((l, i) => c.fillText(l, 128, 212 + i * 31 - (Math.min(3, lines.length) - 1) * 15));
    if (spent) { c.fillStyle = 'rgba(255,253,244,0.72)'; c.fillRect(13, 13, 230, 274); c.fillStyle = '#b3261b'; c.font = '400 44px Bungee, "Arial Black", sans-serif'; c.save(); c.translate(128, 150); c.rotate(-0.3); c.fillText('USED', 0, 0); c.restore(); }
    plaqueTex.needsUpdate = true;
  }
  function setHands(v) { for (const k of ['L', 'R']) { hands[k].g.visible = v; hands[k].arm.visible = v; } }
  return { build, update, hit, nearest, framePoints, begin, move, end, cancel, wheel, describe, setHover, touch, setHands, setGloves, setItem, get pickables() { return pickables; }, get dragging() { return drag; } };
})();
