'use strict';
/* Marl's handiwork. A rare breakdown: about once every two or three holes, one of the rig's functions quits in the middle
   of the job (feed, sonic, rotation, water pump, head slide, casing arm or winch). The control does nothing for a couple
   of seconds, then the job holds still and an Investigate button comes up. Investigating shows what is wrong, and it is
   always something daft that Marl did. The driller says what it is, adds "Fucking Marl.", fixes it and carries on.
   How often is kept in this browser (yhiog-marl = holes since the last one): never two holes running, a coin toss on the
   second hole, certain on the third. */
window.MARL = (() => {
  const $ = id => document.getElementById(id);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const KEY = 'yhiog-marl';
  const DEAD = 2.6;              // seconds the control does nothing before the Investigate button comes up

  // what can quit: its name on the button, the part it is found on, how to tell it is in use, and how to cut it off
  const cut = k => c => { const v = c[k]; c[k] = typeof v === 'boolean' ? false : 0; return () => { c[k] = v; }; };
  const FNS = {
    feed: { name: 'feed', part: 'feed cylinder', used: (S, c) => Math.abs(c.feed) > 0.15 && S.rop > 0.2, mask: cut('feed'), at: S => [0, S.head.y * 0.3048 * 0.6 + 0.4, 0] },
    osc: { name: 'sonic', part: 'sonic head', used: (S, c) => c.oscOn && S.head.hz > 30 && S.rop > 0.2, mask: cut('oscOn'), at: S => [0, S.head.y * 0.3048 + 0.6, 0] },
    rot: { name: 'rotation', part: 'rotation motor', used: (S, c) => Math.abs(c.rot) > 0.15 && Math.abs(S.rpm) > 5, mask: cut('rot'), at: S => [0, S.head.y * 0.3048 + 0.4, 0] },
    pump: { name: 'water pump', part: 'water pump', used: (S, c) => c.pumpOn && S.water.flow > 1, mask: cut('pumpOn'), at: () => [-1.2, 0.5, 1.3] },
    slide: { name: 'head slide', part: 'head slide', used: (S, c) => Math.abs(c.slide) > 0.15, mask: cut('slide'), at: S => [0, S.head.y * 0.3048 + 0.3, 0] },
    arm: { name: 'casing arm', part: 'casing arm', used: (S, c) => Math.abs(c.arm) > 0.15, mask: cut('arm'), at: () => [0.85, 1.6, 0] },
    winch: { name: 'winch', part: 'winch', used: (S, c) => Math.abs(c.winch) > 0.15, mask: cut('winch'), at: () => [0, 5.5, -0.2] },
  };
  // what Marl did: what you find, and what the driller has to say about it
  const GAGS = [
    { id: 'tape', find: 'The hydraulic line to the {part} is held together with duct tape.', say: 'Duct tape on a hydraulic line.' },
    { id: 'bolts', find: 'The {part} mount has four bolt holes and not one bolt.', say: 'Not one bolt in it.' },
    { id: 'zip', find: 'The hose clamp on the {part} is a zip tie.', say: 'A zip tie for a hose clamp.' },
    { id: 'lunch', find: 'There is a sandwich jammed in the valve for the {part}.', say: 'A sandwich. In the valve bank.' },
    { id: 'wrench', find: 'A wrench has been left jammed in the {part}.', say: 'He left his wrench in it.' },
    { id: 'knot', find: 'The hose to the {part} is tied in a knot.', say: 'The hose is tied in a knot.' },
    { id: 'gum', find: 'A leak on the {part} has been plugged with chewing gum.', say: 'Chewing gum on a fitting.' },
    { id: 'plug', find: 'The {part} control was never plugged in. The plug is lying beside it.', say: 'It was never plugged in.' },
  ];

  let APP, E, plan = null, st = '', t = 0, look = null;

  function quiet() {
    const S = APP.S;
    return !(S.done || S.paused || APP.away || APP.menu || APP.fly || APP.freeze || WELL.active || TOSS.state.state || NAG.active || AARON.active || (APP.easy && (AUTO.st.qte || AUTO.st.failed)));
  }
  function init(app) {
    APP = app;
    E = { warn: $('mlWarn'), offer: $('mlOffer'), what: $('mlWhat'), card: $('mlCard'), cv: $('mlCv'), find: $('mlFind'), say: $('mlSay'), fix: $('mlFix') };
    E.offer.addEventListener('click', investigate);
    E.fix.addEventListener('click', fix);
    reset();
  }
  // a new hole: does Marl get to it this time?
  function reset() {
    st = ''; t = 0; plan = null;
    if (E) { E.warn.hidden = true; E.offer.hidden = true; E.card.hidden = true; }
    let since = 1;
    try { const v = parseInt(localStorage.getItem(KEY), 10); if (v >= 0) since = v; } catch (e) { /* storage is blocked */ }
    const hit = since >= 2 || (since === 1 && Math.random() < 0.5);
    try { localStorage.setItem(KEY, String(hit ? 0 : since + 1)); } catch (e) { /* storage is blocked */ }
    if (hit) arm();
  }
  function arm(fn, gag) {
    const keys = Object.keys(FNS);
    plan = { fn: fn || pick(keys), gag: GAGS.find(g => g.id === gag) || pick(GAGS), depth: fn ? 0 : 6 + Math.random() * 42, done: false };
  }
  // called round every step of the drilling model: while it is broken, the control is cut off before the model sees it
  function mask(S) { return st === 'dead' && plan ? FNS[plan.fn].mask(S.ctl) : null; }

  function investigate() {
    if (st !== 'prompt' || APP.S.paused) return;
    AUDIO.init();
    const S = APP.S, F = FNS[plan.fn], G = plan.gag;
    st = 'look'; t = 0;
    look = { yaw: WORLD.look.tYaw, pitch: WORLD.look.tPitch, fov: WORLD.look.tFov };
    E.offer.hidden = true; E.card.hidden = false;
    E.find.textContent = G.find.replace('{part}', F.part);
    E.say.textContent = `“${G.say} Fucking Marl.”`;
    draw(E.cv, G.id);
    S.sfx.push('switch'); setTimeout(() => S.sfx.push('yell'), 500);
    S.crew[0].say = pick(['Marl again?', 'Let me guess. Marl.', 'Classic Marl.']); S.crew[0].sayT = 3;
    E.fix.focus();
  }
  function fix() {
    if (st !== 'look') return;
    const S = APP.S, F = FNS[plan.fn], G = plan.gag;
    st = ''; plan.done = true;
    E.card.hidden = true;
    S.stats.marl = `${G.say.replace(/\.$/, '')} (${F.name})`;
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: `The ${F.name} quit. ${G.find.replace('{part}', F.part)} Fixed. Fucking Marl.`, lvl: 'warn' });
    S.sfx.push('clank'); setTimeout(() => S.sfx.push('done'), 250);
    if (!APP.easy && look) { WORLD.look.tYaw = look.yaw; WORLD.look.tPitch = look.pitch; WORLD.look.tFov = look.fov; }
    look = null;
  }

  function update(S, dt) {
    if (!plan || plan.done) return;
    if (st === '') {
      if (S.item === 'padlock') return;           // a padlock on the toolbox (js/shop.js): Marl never got near the rig
      if (S.hole.depth >= plan.depth && quiet() && FNS[plan.fn].used(S, S.ctl)) {
        if (S.item === 'duct' && SHOP.use(S)) {   // a roll of duct tape: fixed on the spot, no stopping to look
          const name = FNS[plan.fn].name;
          plan.done = true;
          E.warn.textContent = `The ${name} quit. You slap duct tape on it. Fixed. Fucking Marl.`; E.warn.hidden = false;
          setTimeout(() => { if (st === '') E.warn.hidden = true; }, 3400);
          S.stats.marl = `Taped up on the spot (${name})`;
          S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: `The ${name} quit. Duct tape. Fixed. Fucking Marl.`, lvl: 'warn' });
          S.sfx.push('clank');
          return;
        }
        st = 'dead'; t = 0;
        E.warn.textContent = `The ${FNS[plan.fn].name} has quit working!`; E.warn.hidden = false;
        S.sfx.push('cough');
      }
      return;
    }
    if (APP.menu || APP.away) return;
    if (st === 'look' && !S.paused) { const p = FNS[plan.fn].at(S); WORLD.aim(p[0], p[1], p[2], 50); }
    if (S.paused) return;
    t += dt;
    if (st === 'dead' && t >= DEAD) {
      st = 'prompt'; t = 0;
      E.warn.hidden = true; E.what.textContent = `The ${FNS[plan.fn].name} is dead`; E.offer.hidden = false;
      S.sfx.push('alarm');
    }
  }
  function key(e) {
    if (st === 'prompt' && (e.code === 'KeyM' || e.code === 'Enter')) { investigate(); return true; }
    if (st === 'look') { if (e.code === 'KeyM' || e.code === 'Enter') fix(); return e.code !== 'Escape'; }
    return st === 'prompt' && e.code !== 'Escape';
  }

  // ---------- the pictures: what you find when you go and look ----------
  const INK = '#2a2320';
  function hose(c, pts, w, col) {
    const path = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); } const l = pts[pts.length - 1]; c.lineTo(l[0], l[1]); };
    c.lineCap = 'round'; c.lineJoin = 'round';
    path(); c.strokeStyle = INK; c.lineWidth = w + 8; c.stroke();
    path(); c.strokeStyle = col || '#3a3f43'; c.lineWidth = w; c.stroke();
    path(); c.strokeStyle = '#ffffff30'; c.lineWidth = w * 0.22; c.setLineDash([26, 18]); c.stroke(); c.setLineDash([]);
  }
  function shape(c, fill, fn) { c.beginPath(); fn(); c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = INK; c.lineWidth = 4; c.lineJoin = 'round'; c.stroke(); }
  const rr = (c, x, y, w, h, r) => { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); };
  function drip(c, x, y, s) { shape(c, '#d9a02a', () => { c.moveTo(x, y - 12 * s); c.quadraticCurveTo(x + 9 * s, y + 4 * s, x, y + 8 * s); c.quadraticCurveTo(x - 9 * s, y + 4 * s, x, y - 12 * s); }); }
  function note(c, x, y, rot, lines) {            // Marl always leaves a note
    c.save(); c.translate(x, y); c.rotate(rot);
    shape(c, '#ffe86b', () => rr(c, -58, -42, 116, 84, 4));
    c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'italic 700 17px Georgia, "Times New Roman", serif';
    lines.forEach((l, i) => c.fillText(l, 0, -20 + i * 21));
    c.restore();
  }
  function draw(cv, id) {
    const W = 520, H = 250, dpr = Math.min(2, window.devicePixelRatio || 1), c = cv.getContext('2d');
    cv.width = W * dpr; cv.height = H * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#7f9a6b'; c.fillRect(0, 0, W, H);                       // the rig's green paint, with a seam and a few rivets
    c.fillStyle = '#6c8659'; c.fillRect(0, H - 46, W, 46);
    c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(0, H - 46); c.lineTo(W, H - 46); c.stroke();
    for (let x = 26; x < W; x += 78) { c.beginPath(); c.arc(x, H - 23, 5, 0, 7); c.fillStyle = '#566d47'; c.fill(); c.stroke(); }
    const mid = H / 2 - 14;
    if (id === 'tape') {
      hose(c, [[-10, mid + 30], [110, mid - 40], [260, mid + 10], [400, mid + 44], [530, mid - 10]], 34);
      for (let i = 0; i < 5; i++) { c.save(); c.translate(232 + i * 15, mid + 6 + i * 3); c.rotate(0.25 + (i % 2 ? -0.22 : 0.16)); shape(c, i % 2 ? '#b9bfc5' : '#cfd4d9', () => rr(c, -15, -30, 30, 60, 3)); c.restore(); }
      c.save(); c.translate(306, mid + 36); c.rotate(0.9); shape(c, '#cfd4d9', () => rr(c, 0, -12, 62, 24, 3)); c.restore();
      drip(c, 262, mid + 64, 1); drip(c, 284, mid + 86, 0.75);
      shape(c, '#d9a02a', () => c.ellipse(272, H - 30, 54, 9, 0, 0, 7));
      note(c, 420, 62, 0.08, ['GOOD AS', 'NEW!', '- Marl']);
    } else if (id === 'bolts') {
      shape(c, '#d9c23a', () => rr(c, 96, 34, 250, 158, 14));
      shape(c, '#8d949a', () => c.arc(221, 113, 46, 0, 7));
      shape(c, '#5d646a', () => c.arc(221, 113, 20, 0, 7));
      for (const [x, y] of [[126, 62], [316, 62], [126, 164], [316, 164]]) { shape(c, '#1c1a18', () => c.arc(x, y, 13, 0, 7)); c.setLineDash([5, 5]); c.beginPath(); c.arc(x, y, 21, 0, 7); c.strokeStyle = '#2a232088'; c.lineWidth = 2; c.stroke(); c.setLineDash([]); }
      c.save(); c.translate(300, H - 22); c.rotate(-0.3); shape(c, '#b9bfc5', () => rr(c, -6, -26, 12, 34, 2)); shape(c, '#cfd4d9', () => rr(c, -13, -38, 26, 14, 3)); c.restore();   // one bolt, on the ground
      note(c, 432, 86, -0.1, ['BOLTS:', 'tomorrow', '- Marl']);
    } else if (id === 'zip') {
      shape(c, '#8d949a', () => rr(c, 330, mid - 44, 200, 88, 8));
      shape(c, '#aab1b7', () => rr(c, 268, mid - 22, 74, 44, 4));
      hose(c, [[-10, mid + 50], [90, mid + 36], [190, mid - 4], [292, mid]], 38);
      shape(c, '#f4f4ee', () => rr(c, 246, mid - 30, 11, 60, 3));                                         // the zip tie, and its tail
      shape(c, '#f4f4ee', () => rr(c, 240, mid - 40, 23, 14, 3));
      c.save(); c.translate(252, mid - 40); c.rotate(-0.7); shape(c, '#f4f4ee', () => rr(c, -3, -70, 7, 70, 2)); c.restore();
      drip(c, 276, mid + 46, 1); drip(c, 262, mid + 74, 0.7);
      note(c, 118, 60, -0.08, ['CLAMP', 'UPGRADE', '- Marl']);
    } else if (id === 'lunch') {
      hose(c, [[130, -10], [150, 80], [120, 170], [140, 260]], 30);
      hose(c, [[390, -10], [370, 90], [400, 180], [380, 260]], 30);
      shape(c, '#b9bfc5', () => rr(c, 196, 20, 128, 40, 6)); shape(c, '#b9bfc5', () => rr(c, 196, 166, 128, 40, 6));
      shape(c, '#e3b877', () => rr(c, 176, 72, 168, 24, 10));                                             // bread, lettuce, tomato, cheese, bread
      shape(c, '#6fae4a', () => { c.moveTo(170, 98); for (let x = 170; x <= 350; x += 15) c.quadraticCurveTo(x + 7, 112, x + 15, 98); c.lineTo(350, 104); c.lineTo(170, 104); });
      shape(c, '#d8362b', () => rr(c, 182, 106, 156, 12, 5));
      shape(c, '#f2c230', () => { c.moveTo(176, 120); c.lineTo(344, 120); c.lineTo(330, 136); c.lineTo(300, 124); c.lineTo(176, 126); });
      shape(c, '#e3b877', () => rr(c, 176, 128, 168, 26, 10));
      shape(c, '#7f9a6b', () => c.arc(346, 96, 22, 0, 7));                                                 // a bite out of it
      note(c, 446, 196, 0.1, ['MINE.', 'do not eat', '- Marl']);
    } else if (id === 'wrench') {
      const gx = 230, gy = mid + 4;
      shape(c, '#8d949a', () => { for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? 78 : 62; c.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r); } });
      shape(c, '#5d646a', () => c.arc(gx, gy, 22, 0, 7));
      c.save(); c.translate(gx + 42, gy - 38); c.rotate(-0.55);
      shape(c, '#cfd4d9', () => rr(c, -10, -12, 210, 24, 8));
      shape(c, '#cfd4d9', () => { c.arc(-12, 0, 30, 0.6, Math.PI * 2 - 0.6); c.lineTo(-2, -10); c.lineTo(-2, 10); });
      shape(c, '#cfd4d9', () => c.arc(206, 0, 22, 0, 7)); shape(c, '#7f9a6b', () => c.arc(206, 0, 10, 0, 7));
      c.restore();
      c.strokeStyle = INK; c.lineWidth = 4; for (const a of [-2.2, -1.9, -1.6]) { c.beginPath(); c.moveTo(gx + Math.cos(a) * 92, gy + Math.sin(a) * 92); c.lineTo(gx + Math.cos(a) * 112, gy + Math.sin(a) * 112); c.stroke(); }
      note(c, 84, 196, -0.1, ['seen my', 'wrench?', '- Marl']);
    } else if (id === 'knot') {
      hose(c, [[-10, mid + 20], [120, mid + 30], [220, mid - 10], [300, mid - 70], [350, mid - 10], [290, mid + 50], [210, mid + 10], [260, mid - 50], [360, mid + 30], [530, mid + 20]], 28);
      c.strokeStyle = INK; c.lineWidth = 4; for (const [x, y, a] of [[300, mid - 100, -1.5], [380, mid - 60, -0.7], [200, mid + 70, 2.4]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); c.stroke(); }
      note(c, 448, 58, 0.09, ['too long.', 'shortened', '- Marl']);
    } else if (id === 'gum') {
      shape(c, '#aab1b7', () => rr(c, -10, mid - 18, 250, 36, 4));
      shape(c, '#aab1b7', () => rr(c, 300, mid - 18, 230, 36, 4));
      shape(c, '#d9c23a', () => { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5; c.lineTo(270 + Math.cos(a) * 54, mid + Math.sin(a) * 54); } });
      shape(c, '#f38fb4', () => { c.moveTo(232, mid + 26); c.bezierCurveTo(214, mid + 70, 262, mid + 92, 286, mid + 70); c.bezierCurveTo(322, mid + 78, 326, mid + 34, 300, mid + 26); c.bezierCurveTo(286, mid + 10, 246, mid + 8, 232, mid + 26); });
      c.strokeStyle = '#f38fb4'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(304, mid + 50); c.quadraticCurveTo(360, mid + 50, 372, mid + 96); c.stroke();
      c.strokeStyle = '#ffffff90'; c.lineWidth = 4; c.beginPath(); c.arc(256, mid + 44, 14, 3.6, 4.9); c.stroke();
      drip(c, 268, mid + 108, 0.9);
      note(c, 432, 60, -0.08, ['LEAK', 'SEALED', '- Marl']);
    } else {
      shape(c, '#d9dde0', () => rr(c, 60, 46, 150, 150, 12));                                              // the socket, the gap, and the plug on its lead
      shape(c, '#2a2f33', () => rr(c, 96, 84, 78, 74, 10));
      shape(c, '#0e1012', () => rr(c, 116, 102, 12, 38, 3)); shape(c, '#0e1012', () => rr(c, 142, 102, 12, 38, 3));
      hose(c, [[530, mid + 70], [440, mid + 84], [392, mid + 40], [360, mid + 10]], 14, '#e0362b');
      shape(c, '#e0362b', () => rr(c, 290, mid - 22, 76, 60, 10));
      shape(c, '#cfd4d9', () => rr(c, 262, mid - 12, 30, 10, 2)); shape(c, '#cfd4d9', () => rr(c, 262, mid + 16, 30, 10, 2));
      c.fillStyle = INK; c.font = '400 54px Bungee, "Arial Black", sans-serif'; c.textAlign = 'center'; c.fillText('?', 236, mid - 34);
      note(c, 436, 58, 0.08, ['saving', 'power', '- Marl']);
    }
  }

  return { init, reset, update, key, mask, arm, get busy() { return st === 'prompt' || st === 'look'; }, get active() { return st !== ''; }, get state() { return { st, t, plan }; },
    preview(id) { draw(E.cv, id); } };
})();
