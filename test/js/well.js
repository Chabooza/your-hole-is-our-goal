'use strict';
/* The well install: the job that follows the drilling. Once the hole is cored and cased, the engineer walks over with
   an installation drawing and the crew builds a 2 in. PVC monitoring well in it, pulling the casing back as they go:
     1. bentonite poured up from the bottom of the hole to 1 ft under where the well will sit   (skipped if the well sits on bottom)
     2. 1 ft of sand for the well to sit on                                                    (skipped the same way)
     3. the PVC itself, screen first then riser, with a prompt to answer at every joint
     4. sand up to 1 ft over the top of the screen
     5. bentonite to the top of the hole
   The rule that runs through all of it: never fill more than about 6 in. up inside the casing. Pour to that mark, pull a
   10 ft joint of casing and put it on the rack (two prompts), pour again, and so on to the top. Too much in the casing
   and it packs solid: the next pull, with the vibes on, rips the well in half. The driller then spanks the helper who
   was pouring, and the crew goes back to the last joint they pulled and tries again.
   The player pours by drawing circles. The tape that shows how full the hole is reads late, and later the deeper it is.
   Depths are feet below ground. Heights are feet above ground. */
window.WELL = (() => {
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const depthTxt = d => (d < -0.05 ? `${f1(-d)} ft above ground` : `${f1(Math.max(0, d))} ft`);

  const STICK = 2.3;             // the casing stands this far out of the ground
  const STUB = 3.6;              // the top of the PVC is held at this height while the next length goes on
  const STICKUP = 3.0;           // the finished well stands this far out of the ground
  const JOINT = 10;              // one joint of casing
  const INSIDE = 0.5;            // how far up inside the casing the fill should come: 6 in.
  const LIMIT = 1.5;             // more than this inside the casing and it packs solid when the casing is pulled
  const OPEN_MAX = 2;            // the crew will not pull with more open hole than this under the casing: it would cave
  const PARK = 9, HIGH = 16.2;   // where the sonic head waits while the crew pours, and while the PVC goes together
  const FT_PER_BAG = 3;          // roughly how much hole one bag fills
  const FT_PER_TURN = 1.1;       // how much one circle on the screen pours
  const MAX_RATE = 3.2;          // the fastest a bag can go down the hole, ft of hole per second
  const lagAt = depth => SITES.pourLag(depth, S.site.n);        // seconds for a pour to land and show on the tape: longer the deeper, and on later holes
  const COL = { bent: '#8f9189', sand: '#e3c765' };
  const WORD = { bent: 'bentonite', sand: 'sand' };
  const CIRC = 2 * Math.PI * 52;

  let APP, E = null, S = null, W = null;
  let turnBuf = 0, lp = null, lh = null, keyPour = false, keySlow = false, pourTick = 0;
  const last = {};
  const set = (el, key, v) => { if (last[key] !== v) { last[key] = v; el.textContent = v; } };
  const touch = () => document.body.classList.contains('touch');
  function log(msg, lvl) { S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg, lvl: lvl || 'info' }); if (S.log.length > 80) S.log.pop(); }
  const note = (msg, lvl, sec) => { W.msg = msg; W.lvl = lvl || 'info'; W.noteT = sec || 2.6; };
  const crewSay = (i, line, sec) => { S.crew[i].say = line; S.crew[i].sayT = sec || 2.2; };

  // ---------- the drawing: where the engineer wants everything ----------
  function makePlan(S) {
    const D = Math.round(S.hole.depth * 10) / 10;
    const up = pick([0, 20, 40].filter(u => D - u >= 18));       // the well sits on bottom, or 20 or 40 ft up
    const B = up ? Math.round(D) - up : D;
    const L = pick([5, 10, 15].filter(l => B - l - 1 >= 6));     // how much of it is screen
    return { D, up, B, L, sandTop: B - L - 1, sandBot: up ? B + 1 : D };
  }
  function makeStages(p) {
    const s = [];
    if (p.up) {
      s.push({ id: 'plug', kind: 'bent', target: p.B + 1, name: 'Bentonite plug', text: `Bentonite up from the bottom of the hole to ${f1(p.B + 1)} ft, 1 ft under where the well will sit.` });
      s.push({ id: 'bed', kind: 'sand', target: p.B, name: 'Sand for the well to sit on', text: `1 ft of sand, up to ${f1(p.B)} ft. The well will sit on whatever you leave.` });
    }
    s.push({ id: 'pvc', name: 'Build the well' });
    s.push({ id: 'pack', kind: 'sand', target: p.sandTop, name: 'Sand round the screen', text: `Sand round the screen, up to ${f1(p.sandTop)} ft, 1 ft over the top of the screen.` });
    s.push({ id: 'seal', kind: 'bent', target: 0, name: 'Bentonite seal', text: 'Bentonite the rest of the way, to ground level, 0 ft.' });
    return s;
  }
  // a different engineer every hole. Always the white hard hat.
  const NAMES = ['Sam', 'Alex', 'Jordan', 'Casey', 'Morgan', 'Riley', 'Jamie', 'Robin', 'Avery', 'Quinn'];
  function makeEngineer() {
    const [skin, nose] = pick([[0xf2c9ae, 0xe6b496], [0xe6b48c, 0xd9a37b], [0xcd9868, 0xbf885a], [0xa9744a, 0x9a663e], [0x7a5034, 0x6c452c]]);
    const hair = pick([0x17120f, 0x2b1d14, 0x5a3d26, 0x8a6236, 0xc9a86a, 0x9c9c9a, 0xa8482a]);
    const name = pick(NAMES), style = pick(['', '', 'curly', 'long', 'mullet', 'bald']);
    const look = { suit: 0x8a8468, suitDark: 0x6c674f, patch: name, hat: 0xf6f6f1, hatTrim: 0xd9d9d2, skin, nose, vest: 0xf47a1f, shirt: pick([0xffffff, 0xbcd3ee, 0xd9e6c8]),
      brow: hair, eye: pick([0x3a2a1c, 0x5a3a1c, 0x4a6a8a, 0x5d7a4a]), glasses: pick(['clear', 'round', 'none', 'none']), lensClear: true, wire: Math.random() < 0.5,
      lens: ['#ffffff', '#ffffff', '#ffffff'], frame: pick([0x17171a, 0x6a4a2a, 0xb9a36a]), smile: pick([true, 'closed', 'closed']),
      build: 0.92 + Math.random() * 0.2, height: 0.94 + Math.random() * 0.12 };
    if (style !== 'bald') look.hair = hair;
    if (style) look.hairStyle = style;
    const face = Math.random();
    if (face < 0.2) { look.beard = hair; look.beardStyle = 'full'; look.stache = hair; look.stacheStyle = 'medium'; }
    else if (face < 0.35) { look.stache = hair; look.stacheStyle = pick(['thin', 'medium']); }
    else if (face < 0.5) { look.stubble = hair; }
    if (Math.random() < 0.3) look.lines = true;
    return { name, look };
  }

  // one engineer per hole: the one who drops by during the drilling is the one who brings the drawing
  function engineer(S) { return S.eng || (S.eng = makeEngineer()); }

  // ---------- starting and stopping ----------
  function init(app) {
    APP = app;
    E = { root: $('well'), pad: $('wlPad'), title: $('wlTitle'), text: $('wlText'), bags: $('wlBags'), hole: $('wlHole'), msg: $('wlMsg'), call: $('wlCall'), draw: $('wlDraw'),
      box: $('wlBox'), ring: $('wlRing'), prog: $('wlProg'), icon: $('wlIcon'), qTitle: $('wlQTitle'), qHow: $('wlQHow'), tape: $('wlTape'), bar: $('wlBar'), zone: $('wlZone'), mark: $('wlMark'), time: $('wlTime'), timeI: $('wlTimeI'),
      bub: $('bubEng'), me: $('bubMe'), plan: $('plan'), planCv: $('planCanvas'), planSteps: $('planSteps'), planFrom: $('planFrom'), planFace: $('planFace'), planGo: $('planGo') };
    E.prog.style.strokeDasharray = CIRC.toFixed(1);
    E.pad.addEventListener('pointerdown', e => { try { E.pad.setPointerCapture(e.pointerId); } catch (err) { /* gone */ } AUDIO.init(); lp = null; lh = null; padDown(e); e.preventDefault(); });
    E.pad.addEventListener('pointermove', e => { if (e.buttons || e.pointerType !== 'mouse') padMove(e); });
    E.pad.addEventListener('contextmenu', e => e.preventDefault());
    E.call.addEventListener('click', callIt);
    E.draw.addEventListener('click', openPlan);
    E.planGo.addEventListener('click', closePlan);
    window.addEventListener('keyup', e => { if (e.code === 'Space') keyPour = false; if (e.code === 'KeyS' || e.code === 'ArrowDown') keySlow = false; });
    window.addEventListener('blur', () => { keyPour = false; keySlow = false; });
  }
  function start(S_) {
    S = S_;
    const plan = makePlan(S), who = engineer(S);
    W = S.well = { phase: 'walk', t: 0, pt: 0, plan, stages: makeStages(plan), si: -1, fill: plan.D, C: plan.D, air: [], layers: [], bags: { bent: 0, sand: 0 }, spill: 0,
      results: [], fumbles: 0, pulls: 0, pullLog: [], wrecks: 0, pour: null, pull: null, wreck: null, pvc: null, q: null, save: '',
      name: who.name, look: who.look, engK: 0, paper: true, watch: false, say: '', sayT: 0, msg: '', lvl: 'info', noteT: 0, burst: 0, seenPlan: false, finished: false };
    keyPour = keySlow = false; turnBuf = 0;
    document.body.classList.add('well-job');
    E.root.hidden = false; E.plan.hidden = true;
    for (const k in last) delete last[k];
    crewSay(0, 'Here comes the engineer.', 2.6);
    log(`${W.name}, the engineer, is walking over with the drawing for the well.`);
  }
  function reset() {
    W = null;
    document.body.classList.remove('well-job');
    if (E) { E.root.hidden = true; E.plan.hidden = true; E.bub.hidden = true; }
    WORLD.setWell(null);
  }
  // The rig as the well job needs it: barrel laid down, head free and parked over the hole, casing on bottom.
  // Done while the drawing covers the screen, so nothing is seen to jump.
  function prepRig() {
    const h = S.head;
    S.core.len = 0; S.hang = null; S.loose = null; S.jt = null;
    h.conn = null; h.eng = 1; h.tilt = 0; h.x = 0; h.hz = 0; h.y = PARK;
    S.arm.ang = 0; S.arm.holds = false; S.ctl.clampB = false; S.ctl.clampT = false;
    setCasing();
  }
  function setCasing() { S.casing.depth = W.C; S.casing.len = W.C > 0 ? W.C + STICK : 0; }
  // what the crew goes back to after a wrecked install: the hole as it was when the last joint came out
  function snap() { W.save = JSON.stringify({ si: W.si, fill: W.fill, layers: W.layers, results: W.results, pvc: W.pvc, C: W.C, pulls: W.pulls, pullLog: W.pullLog, rack: S.rack.casing }); }
  function restore() {
    const o = JSON.parse(W.save);
    W.si = o.si; W.fill = o.fill; W.layers = o.layers; W.results = o.results; W.pvc = o.pvc; W.C = o.C; W.pulls = o.pulls; W.pullLog = o.pullLog;
    S.rack.casing = o.rack; W.air = []; W.q = null; W.pull = null; W.wreck = null; W.pt = 0;
    prepRig();
    PANEL.setHands(true); E.me.hidden = true;
    enterStage();
    note('Back to the last joint. About 6 in. in the casing, and no more.', 'warn', 4);
    crewSay(1, 'Okay. From the last joint.', 2.4);
  }

  // ---------- the drawing sheet ----------
  function openPlan() {
    if (!W || W.phase === 'over' || W.phase === 'wreck' || W.phase === 'pull') return;
    AUDIO.init();
    const p = W.plan;
    E.planFrom.textContent = `From ${W.name}, the engineer`;
    if (!W.face) W.face = WORLD.portraits([W.look], 200, 225)[0] || '';
    E.planFace.src = W.face; E.planFace.hidden = !W.face;
    const steps = [];
    if (p.up) {
      steps.push(`<b>Bentonite plug.</b> Fill from the bottom of the hole (${f1(p.D)} ft) up to <b>${f1(p.B + 1)} ft</b>.`);
      steps.push(`<b>Sand.</b> 1 ft of it, up to <b>${f1(p.B)} ft</b>, for the well to sit on.`);
    }
    steps.push(`<b>The well.</b> 2 in. PVC in 10 ft lengths: <b>${p.L} ft of screen</b> on the bottom, then riser to surface. ${p.up ? `Bottom of the well at <b>${f1(p.B)} ft</b>.` : `It sits on the <b>bottom of the hole</b>, ${f1(p.B)} ft.`}`);
    steps.push(`<b>Sand.</b> Round the screen and up to <b>${f1(p.sandTop)} ft</b>, 1 ft over the top of the screen.`);
    steps.push('<b>Bentonite seal.</b> From the sand to the top of the hole, <b>0 ft</b>.');
    steps.push(`<b>Mind the delay.</b> At the bottom of this hole a pour takes about <b>${Math.round(lagAt(p.D))} seconds</b> to fall through the water and show on the tape. It gets quicker as the hole fills.`);
    E.planSteps.innerHTML = steps.map(s => `<li>${s}</li>`).join('');
    E.planGo.textContent = W.seenPlan ? 'Back to the hole' : 'Got it. Build the well';
    E.plan.hidden = false;
    drawPlan();
    if (!W.seenPlan) prepRig();
    E.planGo.focus();
  }
  function closePlan() {
    if (!W || E.plan.hidden) return;
    E.plan.hidden = true;
    if (!W.seenPlan) {
      W.seenPlan = true; W.paper = false; W.watch = true; S.sfx.push('ok');
      log('Drawing in hand. Time to build the well.');
      W.si = 0; snap(); enterStage();
    }
  }
  function drawPlan() {
    const cv = E.planCv, c = cv.getContext('2d'), Wd = 600, Hd = 430, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Wd * dpr; cv.height = Hd * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = W.plan, INK = '#eaf2ff';
    c.fillStyle = '#1d4f9c'; c.fillRect(0, 0, Wd, Hd);
    c.strokeStyle = '#ffffff16'; c.lineWidth = 1; c.beginPath();
    for (let x = 20; x < Wd; x += 20) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, Hd); }
    for (let y = 20; y < Hd; y += 20) { c.moveTo(0, y + 0.5); c.lineTo(Wd, y + 0.5); }
    c.stroke();
    c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(8, 8, Wd - 16, Hd - 16);
    c.fillStyle = INK; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = '400 20px Bungee, "Arial Black", sans-serif'; c.fillText(`${S.site.well} WELL INSTALLATION`, 22, 38);
    c.font = '600 13px "Barlow Condensed", "Arial Narrow", sans-serif'; c.fillText('2 in. PVC monitoring well · depths in feet below ground · not to scale', 22, 55);
    const top = 78, bot = Hd - 30, d0 = -5, d1 = p.D + 1.5, y = d => top + (d - d0) / (d1 - d0) * (bot - top);
    const hx = 78, hw = 84, cx = hx + hw / 2;
    // the ground, and the depth scale
    c.lineWidth = 2; c.beginPath(); c.moveTo(hx - 6, y(0)); c.lineTo(hx + hw + 44, y(0)); c.stroke();
    c.lineWidth = 1; c.beginPath();
    for (let x = hx + hw + 8; x < hx + hw + 44; x += 9) { c.moveTo(x, y(0)); c.lineTo(x - 6, y(0) + 6); }
    c.stroke();
    c.font = '400 11px "B612 Mono", monospace'; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let d = 0; d <= p.D; d += 10) { c.fillText(String(d), hx - 12, y(d)); c.beginPath(); c.moveTo(hx - 8, y(d)); c.lineTo(hx, y(d)); c.stroke(); }
    // what goes in the hole, bottom up
    const zones = [['bent', 0, p.sandTop], ['sand', p.sandTop, p.sandBot]];
    if (p.up) zones.push(['bent', p.sandBot, p.D]);
    for (const [kind, a, b] of zones) {
      const ya = y(a), yb = y(b);
      c.save(); c.beginPath(); c.rect(hx, ya, hw, yb - ya); c.clip();
      c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = 1;
      if (kind === 'bent') { c.beginPath(); for (let k = -hw; k < hw + (yb - ya); k += 7) { c.moveTo(hx + k, ya); c.lineTo(hx + k - (yb - ya), yb); } c.globalAlpha = 0.55; c.stroke(); }
      else { c.globalAlpha = 0.9; for (let yy = ya + 3; yy < yb; yy += 5) for (let xx = hx + 3 + ((Math.round(yy) % 2) ? 3 : 0); xx < hx + hw; xx += 7) c.fillRect(xx, yy, 1.6, 1.6); }
      c.restore();
      c.lineWidth = 1; c.beginPath(); c.moveTo(hx, ya); c.lineTo(hx + hw, ya); c.stroke();
    }
    c.lineWidth = 2; c.strokeRect(hx, y(0), hw, y(p.D) - y(0));
    // the well: riser, screen, cap
    const pw = 16, px = cx - pw / 2;
    c.fillStyle = '#1d4f9c'; c.fillRect(px, y(-STICKUP), pw, y(p.B) - y(-STICKUP));
    c.strokeRect(px, y(-STICKUP), pw, y(p.B) - y(-STICKUP));
    c.lineWidth = 1.2; c.beginPath();
    for (let yy = y(p.B - p.L) + 3; yy < y(p.B) - 2; yy += 4) { c.moveTo(px + 3, yy); c.lineTo(px + pw - 3, yy); }
    c.stroke();
    c.fillStyle = INK; c.fillRect(px - 2, y(-STICKUP) - 4, pw + 4, 4); c.fillRect(px - 1, y(p.B) - 3, pw + 2, 3);
    // call-outs down the right-hand side
    const notes = [[-STICKUP / 2, 'STICK-UP', '3 ft above ground, with a cap'],
      [p.sandTop / 2, 'BENTONITE SEAL', `ground to ${f1(p.sandTop)} ft`],
      [p.sandTop + 0.5, 'FILTER SAND', `${f1(p.sandTop)} to ${f1(p.sandBot)} ft · 1 ft over the screen`],
      [p.B - p.L / 2, 'SCREEN', `${f1(p.B - p.L)} to ${f1(p.B)} ft · ${p.L} ft slotted`],
      [p.B, 'BOTTOM OF WELL', `${f1(p.B)} ft${p.up ? '' : ' · on the bottom of the hole'}`]];
    if (p.up) notes.push([(p.sandBot + p.D) / 2, 'BENTONITE PLUG', `${f1(p.sandBot)} to ${f1(p.D)} ft`]);
    notes.push([p.D, 'BOTTOM OF HOLE', `${f1(p.D)} ft`]);
    const tx = 258, rowH = (bot - top + 6) / notes.length;
    c.textAlign = 'left';
    notes.forEach(([d, head, det], i) => {
      const ty = top + 8 + i * rowH, fy = y(d), ex = d === p.B || d === -STICKUP / 2 ? cx + pw / 2 + 2 : hx + hw - 10;
      c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.moveTo(tx - 8, ty); c.lineTo(tx - 34, ty); c.lineTo(hx + hw + 4, fy); c.lineTo(ex, fy); c.stroke();
      c.fillStyle = INK; c.beginPath(); c.arc(ex, fy, 2.4, 0, 7); c.fill();
      c.font = '800 15px "Barlow Condensed", "Arial Narrow", sans-serif'; c.textBaseline = 'middle'; c.fillText(head, tx, ty - 1);
      c.font = '500 14px "Barlow Condensed", "Arial Narrow", sans-serif'; c.fillText(det, tx, ty + 15);
    });
  }

  // ---------- the stages ----------
  const stage = () => W.stages[W.si];
  function nextStage() { W.si++; enterStage(); }
  function enterStage() {
    W.pt = 0; W.q = null; W.pour = null;
    const st = stage();
    if (!st) { finish(); return; }
    if (st.kind) { newLeg(); crewSay(0, st.kind === 'bent' ? 'Bentonite coming up.' : 'Sand coming up.'); }
    else { W.phase = 'pvc'; if (!W.pvc) startPvc(); }
    S.sfx.push('switch');
  }
  // One pour. It stops at whichever comes first on the way up: the level on the drawing, or 6 in. inside the casing.
  function newLeg() {
    const st = stage(), pull = st.target < W.C - INSIDE - 0.001;
    W.phase = 'pour';
    W.pour = { rate: 0, spin: 0, called: false, from: W.fill, bags: 0, pull, mark: pull ? W.C - INSIDE : st.target };
  }
  function addLayer(kind, bot, top) {
    const l = W.layers[W.layers.length - 1];
    if (l && l.kind === kind) l.top = top; else W.layers.push({ kind, bot, top });
  }
  function land() {
    const lid = W.C > 0 ? -STICK : 0;             // the top of the casing, or the ground once the casing is out
    while (W.air.length && W.air[0].at <= W.t) {
      const a = W.air.shift();
      let top = W.fill - a.ft;
      if (top < lid) { W.spill += lid - top; top = lid; }
      if (top < W.fill) addLayer(a.kind, W.fill, top);
      W.fill = top;
    }
  }
  function callIt() {
    if (!W || W.phase !== 'pour' || W.pour.called || !E.plan.hidden) return;
    AUDIO.init(); W.pour.called = true; W.noteT = 0; S.sfx.push('switch');
  }
  const judge = err => { const a = Math.abs(err); return a <= 0.5 ? ['good', 'Bang on.'] : a <= 1.5 ? ['warn', err > 0 ? 'A bit short.' : 'A bit too much.'] : ['crit', err > 0 ? 'Well short.' : 'Far too much.']; };
  function updatePour(dt) {
    const P = W.pour, st = stage();
    const inst = turnBuf / Math.max(dt, 0.001); turnBuf = 0;
    P.spin += (inst - P.spin) * (1 - Math.exp(-dt * 6));
    let rate = clamp(P.spin / (2 * Math.PI) * FT_PER_TURN, 0, MAX_RATE);
    if (keyPour) rate = Math.max(rate, 1.6); else if (keySlow) rate = Math.max(rate, 0.4);
    if (P.called || rate < 0.06) rate = 0;
    P.rate = rate;
    if (rate > 0) {
      const ft = rate * dt;
      W.air.push({ at: W.t + lagAt(W.fill), ft, kind: st.kind });
      W.bags[st.kind] += ft / FT_PER_BAG; P.bags += ft / FT_PER_BAG; W.noteT = 0;
      pourTick -= dt; if (pourTick <= 0) { pourTick = 0.2; S.sfx.push('pour'); }
    }
    land();
    if (!P.called && W.spill > 0.4 && !P.spilled) { P.spilled = true; if (!P.pull) P.called = true; crewSay(1, 'It is coming out the top!', 2.4); S.sfx.push('alarm'); }
    const inside = W.C - W.fill;                  // + = fill up inside the casing, - = open hole under it
    if (P.called && !W.air.length) {             // everything has landed
      if (P.pull) {                               // pulling a joint
        if (inside < -OPEN_MAX) {
          P.called = false;
          note(`Not yet. There is ${f1(-inside)} ft of open hole under the casing and it will cave. Pour more.`, 'warn', 3.2);
          crewSay(0, 'Not yet, boss.'); S.sfx.push('stub');
        } else startPull(inside);
        return;
      }
      const err = W.fill - st.target, [lvl, word] = judge(err);      // or measuring a level against the drawing
      W.results.push({ id: st.id, name: st.name, kind: st.kind, target: st.target, got: W.fill, err });
      W.msg = `${st.name}: top at ${depthTxt(W.fill)}. The drawing says ${depthTxt(st.target)}. ${word}`; W.lvl = lvl;
      log(W.msg, lvl === 'crit' ? 'warn' : lvl);
      S.sfx.push(lvl === 'good' ? 'done' : lvl === 'warn' ? 'ok' : 'stub');
      W.phase = 'result'; W.pt = 0; return;
    }
    const gap = W.fill - P.mark, hint = touch() ? 'Draw circles anywhere to pour. Faster circles pour faster.' : 'Hold the mouse button and draw circles to pour. Or hold Space (S for a trickle).';
    if (P.called) { W.msg = 'Waiting for the last of it to land.'; W.lvl = 'info'; }
    else if (rate > 0) { W.msg = `Pouring ${WORD[st.kind]}. ${Math.max(1, Math.ceil(P.bags))} bag${Math.ceil(P.bags) > 1 ? 's' : ''} in.`; W.lvl = 'info'; }
    else if (W.air.length) { W.msg = 'Still falling. Watch the tape.'; W.lvl = 'info'; }
    else if (W.noteT > 0) { /* a note is showing */ }
    else if (P.pull) {
      if (inside > LIMIT) { W.msg = `${f1(inside)} ft up inside the casing. That is far too much.`; W.lvl = 'crit'; }
      else if (inside > 1) { W.msg = 'That is plenty in the casing. Pull the joint.'; W.lvl = 'warn'; }
      else if (inside >= 0.2) { W.msg = 'About 6 in. in the casing. Pull the joint.'; W.lvl = 'good'; }
      else if (inside > -0.2) { W.msg = !W.pulls && P.bags < 0.05 ? 'The casing is on bottom. Pour a little, about 6 in., then pull the first joint.' : 'Right at the bottom of the casing. A touch more, or pull the joint.'; W.lvl = 'info'; }
      else if (inside >= -OPEN_MAX) { W.msg = `Nearly there: ${f1(-inside)} ft of open hole under the casing.`; W.lvl = 'info'; }
      else { W.msg = P.bags < 0.05 && W.pulls < 2 ? hint : `${f1(gap)} ft to go.`; W.lvl = 'info'; }
    }
    else if (Math.abs(gap) <= 0.5) { W.msg = 'On the mark. Call it.'; W.lvl = 'good'; }
    else if (gap < 0) { W.msg = 'Past the mark. Nothing for it now: call it.'; W.lvl = 'crit'; }
    else { W.msg = `${f1(gap)} ft to go.`; W.lvl = 'info'; }
  }

  // ---------- the prompts ----------
  const QT = {
    circle: { how: 'Draw circles, clockwise', keys: 'or tap A and D in turn', icon: '↻' },
    swipe: { how: 'Swipe side to side, fast', keys: 'or tap A and D in turn', icon: '⇆' },
    mash: { how: 'Tap as fast as you can', keys: 'or hammer the Space bar', icon: '⇊' },
    timing: { how: 'Tap when the marker is in the green', keys: 'or press Space', icon: '◎' },
  };
  // How long a prompt allows and how much it asks for comes from the hole (js/sites.js): later holes are faster.
  function qNew(type, label, retry) {
    const tn = S.site.tune, limit = type === 'mash' ? tn.mashTime : type === 'timing' ? tn.aimTime : tn.spinTime;
    return { type, label, state: 'ready', hold: retry ? 0.5 : 0.8, t: 0, prog: 0, turn: 0, strokes: 0, dir: 0, ext: 0, keyLast: '', taps: 0,
      limit, turns: tn.turns, need: tn.strokes, keys: tn.keys, tapsNeed: tn.taps, sweep: tn.sweep,
      zc: 0.22 + Math.random() * 0.56, zw: tn.zone, pos: 0, ph: Math.random() * 2, why: '' };
  }
  function fumble(why) {
    const q = W.q, casing = W.phase === 'pull';
    q.state = 'fail'; q.hold = 2.8; q.why = why || 'Dropped it!';
    W.fumbles++;
    log(casing ? 'Fumbled a joint of casing. It went over and everybody jumped clear.' : 'Fumbled a length of PVC. It went over and everybody jumped clear.', 'warn');
    crewSay(0, 'Look out!', 2.6); crewSay(1, 'Whoa, whoa, whoa!', 2.6);
    WORLD.panic(2.8, casing ? 0.085 : 0.034, casing ? 0 : 0xf4f4ee);
    S.sfx.push('alarm');
  }
  function updateQ(dt, onDone) {
    const q = W.q;
    if (q.state === 'ready') { q.hold -= dt; if (q.hold <= 0) q.state = 'go'; }
    else if (q.state === 'go') {
      q.t += dt;
      if (q.type === 'timing') { const u = (q.ph + q.t * q.sweep) % 2; q.pos = u < 1 ? u : 2 - u; }
      if (q.prog >= 1) { q.state = 'done'; q.hold = 0.5; S.sfx.push('ok'); }
      else if (q.t >= q.limit) fumble();
    } else if (q.state === 'fail') {
      if (WORLD.panicHit) S.sfx.push('clank');
      q.hold -= dt; if (q.hold <= 0) W.q = qNew(q.type, q.label, true);
    } else if (q.state === 'done') { q.hold -= dt; if (q.hold <= 0) { W.q = null; onDone(); } }
  }

  // ---------- pulling a joint of casing: vibes on and up 10 ft, then break it off and put it on the rack ----------
  function startPull(inside) {
    W.phase = 'pull'; W.pt = 0; W.pour.rate = 0;
    W.pull = { state: 'down', t: 0, inside, bad: inside > LIMIT, a: pick(['mash', 'circle', 'timing']), b: pick(['swipe', 'timing', 'circle']) };
    crewSay(0, 'Stand clear. Pulling casing.', 2);
  }
  function updatePull(dt) {
    const U = W.pull, h = S.head, top = () => SIM.casTop(S);
    const newC = W.C - JOINT < 1 ? 0 : W.C - JOINT;
    U.t += dt;
    if (U.state === 'down') {                    // the head comes down onto the casing
      h.x = 0; h.y = Math.max(top(), h.y - dt * 16);
      if (h.y <= top() + 0.001) { h.conn = 'casing'; h.eng = 1; U.state = 'q1'; W.q = qNew(U.a, 'Vibes on! Pull the casing', false); S.sfx.push('clank'); }
    } else if (U.state === 'q1') {
      updateQ(dt, () => { if (U.bad) startWreck(); else { U.state = 'up'; U.t = 0; h.hz = 85; } });
    } else if (U.state === 'up') {               // 10 ft of casing comes out of the ground
      const e = Math.min(1, U.t / 1.5);
      S.casing.depth = W.C - (W.C - newC) * e; h.y = top() + (Math.random() - 0.5) * 0.05;
      if (e >= 1) { h.hz = 0; h.y = top(); U.state = 'q2'; W.q = qNew(U.b, 'Break the joint and rack it', false); S.sfx.push('switch'); }
    } else if (U.state === 'q2') {
      updateQ(dt, () => {                        // the joint is off: the head carries it across to the arm
        U.state = 'rack'; U.t = 0; W.C = newC; setCasing();
        h.conn = null; S.hang = { type: 'casing', len: JOINT, eng: 1, onArm: false }; S.sfx.push('clank');
      });
    } else if (U.state === 'rack') {
      const a = Math.min(1, U.t / 0.6), b = clamp((U.t - 0.6) / 0.6, 0, 1);
      if (S.hang) { h.y += (SIM.PRES_TOP + SIM.TH - h.y) * Math.min(1, dt * 9); h.x = a; S.arm.ang = a; if (a >= 1) { S.hang = null; S.arm.holds = true; S.sfx.push('clamp'); } }
      else { S.arm.ang = 1 - b; h.x = 1 - b; if (b >= 1) { S.arm.holds = false; S.rack.casing++; S.sfx.push('clank'); U.state = 'park'; } }
    } else if (U.state === 'park') {
      h.x = 0; h.y = Math.max(PARK, h.y - dt * 14);
      if (h.y <= PARK + 0.001) {
        W.pulls++; W.pullLog.push(U.inside); W.pull = null;
        const left = Math.round(W.C / JOINT);
        log(`Casing joint ${W.pulls} is out and on the rack. The shoe is at ${f1(W.C)} ft.`, 'good');
        snap(); newLeg();
        note(U.inside > 1 ? 'Joint out. That was close: a lot of material in the casing.' : left ? `Joint out and on the rack. ${left} to go.` : 'That is the last of the casing out.', U.inside > 1 ? 'warn' : 'good', 2.6);
        S.sfx.push('done');
      }
    }
    if (W.phase === 'pull' && !W.q) { W.msg = U.state === 'up' ? 'Vibes on. Up she comes.' : U.state === 'rack' ? 'On the rack.' : ''; W.lvl = 'info'; }
  }

  // ---------- too much in the casing: it packs solid, and the pull rips the install apart ----------
  const OUCH = ['Ow!', 'Sorry, boss!', 'Ow! It was the bag!', 'I am sorry!', 'Ow! Never again!', 'Not the face!'];
  function startWreck() {
    W.phase = 'wreck'; W.q = null; W.wrecks++; S.head.hz = 85;
    W.wreck = { t: 0, snapped: false, hits: 0, hop: 0, rise: 0, pvc: !!(W.pvc && W.pvc.T > 0), kind: stage().kind };
    PANEL.setHands(false);
    S.sfx.push('alarm');
  }
  function updateWreck(dt) {
    const X = W.wreck, h = S.head, who = S.crew[0].name;
    X.t += dt; X.hop = Math.max(0, X.hop - dt * 4.5);
    if (X.t < 1.1) {                             // the casing fights, and takes the well up with it
      X.rise = 1.8 * X.t / 1.1;
      S.casing.depth = W.C - X.rise; h.y = SIM.casTop(S) + (Math.random() - 0.5) * 0.14;
      W.msg = 'It is not coming. It is packed solid!'; W.lvl = 'crit';
    } else if (!X.snapped) {                      // SNAP
      X.snapped = true; h.hz = 0; h.y = SIM.casTop(S); W.burst++;
      S.sfx.push('burst'); S.sfx.push('clank');
      WORLD.panic(2.4, X.pvc ? 0.034 : 0.085, X.pvc ? 0xf4f4ee : 0);
      crewSay(0, 'It is packed solid!', 2.2); crewSay(1, X.pvc ? 'It snapped the well in half!' : 'The whole lot came up with it!', 2.2);
      W.say = pick(['No. No. NO!', 'That was my well!', 'Oh, come ON!']); W.sayT = 2.4;
      W.msg = X.pvc ? 'The casing was packed. It ripped the well in half.' : 'The casing was packed. Everything came up with it.'; W.lvl = 'crit';
      log(`Too much ${WORD[X.kind]} in the casing. It packed solid, and pulling it wrecked the install.`, 'crit');
    }
    if (X.t >= 4.7 && X.t < 7.7) {               // the driller has a word with whoever was pouring
      if (E.me.hidden) { E.me.querySelector('span').textContent = "Bad helper! Look what you've done!"; E.me.hidden = false; }
      const hit = Math.floor((X.t - 4.7) / 0.55);
      if (hit > X.hits) { X.hits = hit; X.hop = 1; S.sfx.push('slap'); crewSay(0, OUCH[(hit - 1) % OUCH.length], 0.5); }
      W.msg = `${who} is getting what is coming.`; W.lvl = 'warn';
    } else if (X.t >= 7.7 && !E.me.hidden) E.me.hidden = true;
    if (X.t >= 8.4) restore();
  }

  // ---------- the PVC: one prompt for every length that goes on ----------
  function startPvc() {
    const p = W.plan, wb = W.fill, pieces = [];
    let scr = p.L;
    if (scr % 10) { pieces.push({ len: 5, slot: true }); scr -= 5; }
    while (scr > 0) { pieces.push({ len: 10, slot: true }); scr -= 10; }
    let need = wb + STICKUP - p.L;
    while (need > 0.01) { const len = need > 5 ? 10 : 5; pieces.push({ len, slot: false }); need -= len; }
    const mix = ['timing', 'mash', 'swipe', 'circle'];
    for (let i = mix.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mix[i], mix[j]] = [mix[j], mix[i]]; }
    pieces.forEach((pc, i) => {
      pc.type = i === 0 ? 'circle' : mix[(i - 1) % mix.length];
      pc.label = i === 0 ? 'Screw the bottom cap on' : { circle: 'Thread the next length on', swipe: 'Wipe the mud off the threads', mash: 'It is floating! Push it down', timing: 'Line up the threads' }[pc.type];
    });
    W.pvc = { pieces, i: 0, state: 'present', t: 0, T: 0, H: 0, wb, gap: 0.5, cap: false, sawn: false, topSlot: false };
    crewSay(1, 'PVC coming up.');
  }
  function updatePvc(dt) {
    const V = W.pvc, pc = V.pieces[V.i];
    V.t += dt;
    if (V.state === 'present') {                 // the helpers stand the next length up over the hole
      V.gap = 0.5;
      if (V.t > 0.9) { V.state = 'qte'; W.q = qNew(pc.type, pc.label, false); S.sfx.push('switch'); }
    } else if (V.state === 'qte') {
      updateQ(dt, () => { V.state = 'join'; V.t = 0; });
    } else if (V.state === 'join') {             // it goes on: the gap closes
      V.gap = Math.max(0, 0.5 - V.t * 2.4);
      if (V.gap <= 0) { V.H = (V.T ? V.H : STICK + 0.4) + pc.len; V.T += pc.len; V.topSlot = pc.slot; V.state = 'lower'; V.t = 0; S.sfx.push('clank'); }
    } else if (V.state === 'lower') {            // and the string goes down the hole
      const to = Math.max(V.i === V.pieces.length - 1 ? 0 : STUB, V.T - V.wb);
      V.H = Math.max(to, V.H - dt * 9);
      if (V.H <= to + 0.001) {
        if (V.i < V.pieces.length - 1) { V.i++; V.state = 'present'; V.t = 0; }
        else { V.state = 'saw'; V.t = 0; W.q = qNew('swipe', 'Saw the stick-up off square', false); S.sfx.push('switch'); }
      }
    } else if (V.state === 'saw') {
      updateQ(dt, () => {
        V.T = V.wb + STICKUP; V.H = STICKUP; V.cap = true; V.sawn = true; V.state = 'in';
        const p = W.plan, err = V.wb - p.B, [lvl, word] = judge(err);
        W.results.push({ id: 'well', name: 'Bottom of the well', target: p.B, got: V.wb, err, info: true });
        W.msg = p.up ? `The well is sitting at ${f1(V.wb)} ft. The drawing says ${f1(p.B)} ft. ${word}` : `The well is on the bottom of the hole, ${f1(V.wb)} ft. Cap on.`;
        W.lvl = p.up ? lvl : 'good';
        log(W.msg, W.lvl === 'crit' ? 'warn' : W.lvl);
        S.sfx.push('done'); W.phase = 'result'; W.pt = 0;
      });
    }
    if (W.phase === 'pvc') {
      const n = V.pieces.length;
      W.msg = W.q ? '' : V.state === 'lower' ? 'Down she goes.' : `Length ${Math.min(n, V.i + 1)} of ${n}: ${pc.len} ft of ${pc.slot ? 'screen' : 'riser'}.`; W.lvl = 'info';
    }
  }

  // ---------- the end: the engineer has a look, and the well goes on the shift report ----------
  function finish() {
    let s = 100;
    for (const r of W.results) { r.pen = r.info ? 0 : Math.min(35, Math.max(0, Math.abs(r.err) - 0.5) * 10); s -= r.pen; }
    const open = W.pullLog.filter(v => v < -1).length;       // joints pulled with more than a foot of open hole left under them
    s -= W.fumbles * 4 + W.wrecks * 12 + open * 2;
    if (W.spill > 0.3) s -= 5;
    s = Math.round(clamp(s, 0, 100));
    const R = S.report;
    R.drill = R.score;
    R.well = { score: s, engineer: W.name, plan: W.plan, results: W.results, bags: W.bags, fumbles: W.fumbles, spill: W.spill, pulls: W.pulls, clean: W.pullLog.filter(v => v >= -1 && v <= 1).length, wrecks: W.wrecks };
    R.score = Math.round(R.drill * 0.65 + s * 0.35);
    const A = AARON.settle(S);                   // Aaron's deadline, from hole 3 on: late costs points off the combined grade
    if (A) { R.aaron = { limit: A.limit, late: A.late, spare: A.spare, pen: A.pen }; R.score = Math.max(0, R.score - A.pen); }
    R.grade = R.score >= 90 ? 'A' : R.score >= 80 ? 'B' : R.score >= 70 ? 'C' : R.score >= 60 ? 'D' : 'F';
    W.say = s >= 90 ? 'Textbook. I will sign that one off.' : s >= 75 ? 'Good enough for me. Nice work.' : s >= 55 ? 'Hmm. It will do, I suppose.' : 'We may be drilling this one again.';
    W.sayT = 3.2; W.phase = 'verdict'; W.pt = 0; W.msg = '';
    log(`Well ${S.site.well} is built. ${W.name}: "${W.say}"`, s >= 75 ? 'good' : 'warn');
    S.sfx.push('done');
  }

  // ---------- touch, mouse and keys ----------
  function padDown(e) {
    if (!W || S.paused) return;
    const q = W.q;
    if (q && q.state === 'go') {
      if (q.type === 'mash') { q.taps++; q.prog = clamp(q.taps / q.tapsNeed, 0, 1); }
      else if (q.type === 'timing') { if (Math.abs(q.pos - q.zc) <= q.zw / 2) q.prog = 1; else fumble(W.phase === 'pull' ? 'Missed it!' : 'Cross-threaded it!'); }
    }
  }
  function padMove(e) {
    if (!W || S.paused) return;
    const p = { x: e.clientX, y: e.clientY }, q = W.q;
    if (!lp) { lp = p; if (q) q.ext = p.x; return; }
    const dx = p.x - lp.x, dy = p.y - lp.y;
    if (W.phase === 'pour' || (q && q.state === 'go' && q.type === 'circle')) {
      if (dx * dx + dy * dy < 64) return;
      const h = Math.atan2(dy, dx);
      if (lh != null) {
        const d = Math.atan2(Math.sin(h - lh), Math.cos(h - lh));
        if (Math.abs(d) < 2.2) {
          if (W.phase === 'pour') turnBuf += Math.abs(d);                      // either way round pours
          else { q.turn = Math.max(0, q.turn + d); q.prog = clamp(q.turn / (2 * Math.PI * q.turns), 0, 1); }   // clockwise on screen counts up
        }
      }
      lh = h; lp = p;
    } else if (q && q.state === 'go' && q.type === 'swipe') {
      const d = p.x - q.ext;
      if (q.dir === 0) { if (Math.abs(d) > 40) { q.dir = Math.sign(d); q.ext = p.x; q.strokes = 1; } }
      else if (d * q.dir > 0) q.ext = p.x;
      else if (Math.abs(d) > 45) { q.dir = -q.dir; q.ext = p.x; q.strokes++; }
      lp = p;
      q.prog = clamp(q.strokes / q.need, 0, 1);
    } else lp = p;
  }
  // Returns true if the key was used. Space pours (S for a trickle), Enter pulls or calls it, the prompts take A / D or Space.
  function key(e) {
    if (!W || W.phase === 'over') return false;
    if (!E.plan.hidden) { if (e.code === 'Enter' || e.code === 'Escape') { closePlan(); return true; } return false; }
    const foc = document.activeElement;
    if ((e.code === 'Space' || e.code === 'Enter') && foc && foc.tagName === 'BUTTON' && foc.blur) foc.blur();
    const q = W.q;
    if (q) {
      if (q.state !== 'go') return e.code === 'Space' || e.code === 'Enter';
      if (q.type === 'circle' || q.type === 'swipe') {
        const k = e.code === 'KeyA' || e.code === 'ArrowLeft' ? 'L' : e.code === 'KeyD' || e.code === 'ArrowRight' ? 'R' : '';
        if (!k) return false;
        if (k !== q.keyLast) { q.keyLast = k; q.prog = clamp(q.prog + 1 / q.keys, 0, 1); }
        return true;
      }
      if (e.code === 'Space' || e.code === 'Enter') { if (!e.repeat) padDown(e); return true; }
      return false;
    }
    if (W.phase === 'pour') {
      if (e.code === 'Space') { keyPour = true; return true; }
      if (e.code === 'KeyS' || e.code === 'ArrowDown') { keySlow = true; return true; }
      if (e.code === 'Enter') { callIt(); return true; }
    }
    return W.phase === 'wreck' || W.phase === 'pull' ? e.code === 'Space' || e.code === 'Enter' : false;
  }

  // ---------- every frame ----------
  function update(S_, dt) {
    S = S_;
    if (!S.done) return;
    if (!S.paused) for (const m of S.crew) if (m.sayT > 0) m.sayT -= dt;      // the drilling model has stopped, so talk is timed here
    W = S.well || null;
    if (!W) return;
    const busy = W.phase !== 'over';
    if (S.paused || APP.away || APP.menu || APP.fly || !E.plan.hidden) { turnBuf = 0; keyPour = keySlow = false; show(); return; }
    if (busy) { W.t += dt; W.pt += dt; S.t += dt * 0.5; }
    if (W.sayT > 0) W.sayT -= dt;
    if (W.noteT > 0) W.noteT -= dt;
    let look = null;
    switch (W.phase) {
      case 'walk':
        W.engK = Math.min(1, W.engK + dt / 3.4); W.msg = `Here comes ${W.name}, the engineer.`; W.lvl = 'info'; look = 'eng';
        if (W.engK >= 1) { W.phase = 'talk'; W.pt = 0; W.say = pick(['Nice hole. Here is the drawing for the well.', 'Good, you are at depth. Here is what I want in it.', 'Got the install drawing for you. Have a look.']); W.sayT = 2.6; S.sfx.push('ok'); }
        break;
      case 'talk':
        look = 'eng'; W.msg = '';
        if (W.pt > 2.0) { W.phase = 'plan'; openPlan(); }
        break;
      case 'plan': look = 'eng'; break;
      case 'pour': updatePour(dt); look = 'hole'; break;
      case 'pull': updatePull(dt); look = W.q && W.q.state === 'fail' ? 'panic' : 'pull'; break;
      case 'wreck': updateWreck(dt); look = 'snap'; break;
      case 'pvc': updatePvc(dt); look = W.q && W.q.state === 'fail' ? 'panic' : 'pipe'; break;
      case 'result':
        land(); look = W.pvc && !W.pvc.sawn ? 'pipe' : 'hole';
        if (W.pt > 2.6) nextStage();
        break;
      case 'verdict':
        look = 'eng';
        if (W.pt > 3.4) { W.phase = 'over'; W.finished = true; document.body.classList.remove('well-job'); E.root.hidden = true; }
        break;
    }
    // the sonic head: up out of the way for the PVC, parked over the hole while the crew pours
    if (W.seenPlan && (W.phase === 'pour' || W.phase === 'pvc' || W.phase === 'result' || W.phase === 'verdict')) {
      const st = stage(), to = W.phase === 'pvc' || (W.phase === 'result' && st && !st.kind) ? HIGH : PARK, h = S.head;
      h.y += clamp(to - h.y, -dt * 9, dt * 9);
    }
    if (look === 'eng') { const h = WORLD.engHead(); WORLD.aim(h.x, h.y - 0.45, h.z, 56); }
    else if (look === 'hole') WORLD.aim(-0.05, 0.95, 0.2, 58);
    else if (look === 'pipe') WORLD.aim(0, 2.1, 0.1, 82);
    else if (look === 'pull') WORLD.aim(0.25, 2.3, 0, 84);
    else if (look === 'snap') WORLD.aim(0, 1.2, 0.1, 62);
    else if (look === 'panic') WORLD.aim(-0.9, 0.95, 0.9, 76);
    show();
  }

  // tell the 3D scene what to draw, and bring the overlay up to date
  function show() {
    const V = W.pvc, P = W.pour, q = W.q, st = stage(), X = W.phase === 'wreck' ? W.wreck : null;
    const o = { look: W.look, engK: W.engK, paper: W.paper && W.engK >= 1 && W.phase !== 'walk', carry: W.paper, talk: W.sayT > 0, watch: W.watch,
      pour: W.phase === 'pour' ? st.kind : '', rate: P && W.phase === 'pour' && !S.paused ? P.rate : 0, pvcTop: 0, pvcLen: 0, strSlot: false, piece: null, cap: false, hold: false, work: false,
      cine: false, meK: 0, bendK: 0, spankT: -1, hop: 0, freak: false, burst: W.burst, burstCol: X && X.kind === 'sand' ? 0xe2c462 : 0xa49c8a };
    if (V) {
      const pc = V.pieces[V.i];
      o.pvcTop = V.H; o.pvcLen = V.T; o.cap = V.cap;
      o.strSlot = !!V.topSlot;                    // the length showing above the casing is screen
      if (V.state === 'present' || V.state === 'qte' || V.state === 'join') o.piece = { bot: (V.T ? V.H : STICK + 0.4) + (V.T ? V.gap : 0), len: pc.len, slot: pc.slot };
      o.hold = W.phase === 'pvc'; o.work = !!q && q.state === 'go';
    }
    if (X) {                                      // a wrecked install: the well comes up with the casing, snaps, and the driller walks over
      if (X.pvc) { o.pvcTop = X.snapped ? SIM.casTop(S) + 0.35 : V.H + X.rise; o.cap = !X.snapped; }
      o.cine = X.snapped && X.t < 7.7; o.freak = X.snapped && X.t < 3.6;
      o.meK = clamp((X.t - 3.5) / 1.2, 0, 1); o.bendK = clamp((X.t - 3.5) / 0.8, 0, 1) * clamp((8.2 - X.t) / 0.4, 0, 1);
      o.spankT = X.t >= 4.7 && X.t < 7.7 ? X.t - 4.7 : -1; o.hop = X.hop;
    }
    WORLD.setWell(o);

    // the engineer's speech bubble
    const say = W.sayT > 0 && W.say && !APP.menu && !APP.away;
    if (say) {
      const p = WORLD.project(WORLD.engHead());
      if (p.front) { set(E.bub.firstChild, 'say', W.say); E.bub.hidden = false; E.bub.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`; }
      else E.bub.hidden = true;
    } else if (!E.bub.hidden) E.bub.hidden = true;
    if (W.phase === 'over') return;

    // the note card
    const n = W.stages.length, mode = q ? 'qte' : W.phase === 'pour' ? 'pour' : 'idle';
    if (last.mode !== mode) { last.mode = mode; E.root.dataset.mode = mode; }
    const scene = o.cine ? '1' : '';             // the wreck is watched from outside: clear the note card out of the way
    if (last.scene !== scene) { last.scene = scene; E.root.dataset.scene = scene; }
    let title = 'Well install', text = `${W.name} has the drawing.`;
    if (W.phase === 'verdict') { title = 'Well built'; text = `${W.name} is having a look.`; }
    else if (st && W.seenPlan) {
      title = `Step ${W.si + 1} of ${n}: ${st.name}`;
      if (!st.kind) text = `${V ? V.pieces.length : ''} lengths of 2 in. PVC, screen first. Answer each prompt before the bar runs out.`;
      else if (W.phase === 'wreck') text = 'Too much in the casing. It packed solid.';
      else if (W.phase === 'pull' || (P && P.pull)) text = `${st.text} First: pour until it is 6 in. up inside the casing, then pull a joint.${APP.phone ? '' : ' Too much in the casing wrecks the well.'}`;
      else text = `${st.text} Stop on the red line and call it.`;
    }
    set(E.title, 'title', title); set(E.text, 'text', text);
    set(E.bags, 'bags', `${W.C > 0 ? 'Casing shoe ' + f1(S.casing.depth) + ' ft' : 'Casing out'} · bags ${W.bags.bent.toFixed(1)} bent. ${W.bags.sand.toFixed(1)} sand`);
    drawHole();

    // the line of coaching, the Pull / Call it button, the Drawing button
    const msg = W.phase === 'verdict' || q ? '' : W.msg;
    set(E.msg, 'msg', msg);
    if (last.lvl !== W.lvl) { last.lvl = W.lvl; E.msg.className = 'wl-msg ' + W.lvl; }
    if (E.msg.hidden !== !msg) E.msg.hidden = !msg;
    const canCall = W.phase === 'pour' && !P.called;
    if (E.call.hidden === canCall) E.call.hidden = !canCall;
    if (canCall) set(E.call, 'call', P.pull ? 'Pull a joint' : 'Call it');
    const canDraw = W.seenPlan && (W.phase === 'pour' || W.phase === 'pvc' || W.phase === 'result');
    if (E.draw.hidden === canDraw) E.draw.hidden = !canDraw;

    // the ring: a pour, or a prompt
    if (mode === 'pour') {
      set(E.qTitle, 'qt', `Pour ${WORD[st.kind]}`);
      set(E.qHow, 'qh', `Stop at ${depthTxt(P.mark)}${P.pull ? ', 6 in. in the casing' : ''}. The tape reads:`);
      set(E.tape, 'tape', `${W.fill < -0.05 ? '+' + f1(-W.fill) : f1(Math.max(0, W.fill))} ft`);
      set(E.icon, 'icon', '↻');
      if (last.qs !== 'pour') { last.qs = 'pour'; E.box.dataset.state = 'pour'; E.box.dataset.type = 'pour'; E.icon.className = 'q-icon'; }
      last.rot = (last.rot || 0) + (P.rate || 0) * 3.2;
      E.icon.style.transform = `rotate(${(last.rot % 360).toFixed(0)}deg)`;
      const span = Math.max(0.01, P.from - P.mark);
      E.prog.style.strokeDashoffset = (CIRC * (1 - clamp((P.from - W.fill) / span, 0, 1))).toFixed(1);
    } else if (mode === 'qte') {
      const T = QT[q.type], key = q.type + q.state;
      if (last.qs !== key) {
        last.qs = key; E.box.dataset.state = q.state; E.box.dataset.type = q.type; E.icon.style.transform = '';
        E.icon.className = 'q-icon ' + (q.state === 'go' || q.state === 'ready' ? (q.type === 'circle' ? 'circle' : q.type === 'swipe' ? 'swipe' : q.type === 'mash' ? 'mash' : '') : '');
        E.zone.style.left = ((q.zc - q.zw / 2) * 100).toFixed(1) + '%'; E.zone.style.width = (q.zw * 100).toFixed(1) + '%';
      }
      set(E.icon, 'icon', T.icon);
      set(E.qTitle, 'qt', q.state === 'fail' ? q.why : q.state === 'done' ? 'Nice one!' : q.label);
      set(E.qHow, 'qh', q.state === 'fail' ? 'The crew is getting set to try again.' : q.state === 'done' ? '' : touch() ? T.how : `${T.how}, ${T.keys}`);
      set(E.tape, 'tape', '');
      E.prog.style.strokeDashoffset = (CIRC * (1 - (q.state === 'done' ? 1 : q.prog))).toFixed(1);
      E.timeI.style.width = (clamp(1 - q.t / q.limit, 0, 1) * 100).toFixed(1) + '%';
      E.mark.style.left = (q.pos * 100).toFixed(1) + '%';
    } else last.qs = '';
  }

  // the gauge on the note card: the drawing on the left, what is really down the hole on the right
  function drawHole() {
    const cv = E.hole, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const p = W.plan, st = stage(), top = 17, bot = 6, d0 = -4.5, d1 = p.D + 1.2;
    const y = d => top + (d - d0) / (d1 - d0) * (h - top - bot);
    const ax = 30, gap = 8, rm = 40, cw = Math.max(16, (w - ax - gap - rm) / 2), x1 = ax, x2 = ax + cw + gap, INK = '#2c2618';
    c.font = '800 10px "Barlow Condensed", "Arial Narrow", sans-serif'; c.fillStyle = '#7a6a2e'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillText('DRAWING', x1 + cw / 2, 10); c.fillText('THE HOLE', x2 + cw / 2, 10);
    // the drawing
    c.fillStyle = COL.bent; c.fillRect(x1, y(0), cw, y(p.sandTop) - y(0));
    c.fillStyle = COL.sand; c.fillRect(x1, y(p.sandTop), cw, y(p.sandBot) - y(p.sandTop));
    if (p.up) { c.fillStyle = COL.bent; c.fillRect(x1, y(p.sandBot), cw, y(p.D) - y(p.sandBot)); }
    pipe(c, x1 + cw / 2, y(-STICKUP), y(p.B), y(p.B - p.L));
    c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(x1, y(0), cw, y(p.D) - y(0));
    // the hole as it is: water, whatever has landed, the well, and the casing down to its shoe
    const cased = S.casing.len > 0, shoe = cased ? S.casing.depth : 0, ctop = cased ? Math.max(-4.4, -SIM.casTop(S)) : 0;
    c.fillStyle = '#2a363d'; c.fillRect(x2, y(ctop), cw, y(p.D) - y(ctop));
    c.fillStyle = '#2f5568'; c.fillRect(x2, y(Math.min(p.D, SIM.WT)), cw, y(p.D) - y(Math.min(p.D, SIM.WT)));
    for (const l of W.layers) { c.fillStyle = COL[l.kind]; c.fillRect(x2, y(l.top), cw, y(l.bot) - y(l.top)); }
    const V = W.pvc;
    if (V && V.T > 0) { const b = V.T - V.H; if (b > -STICK) pipe(c, x2 + cw / 2, y(Math.max(-4.3, -V.H)), y(b), y(b - (V.pieces[0].slot ? p.L : 0))); }
    c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(x2, y(0), cw, y(p.D) - y(0));
    if (cased) {                                    // casing walls, with a foot at the shoe
      c.strokeStyle = '#4d6f96'; c.lineWidth = 4; c.beginPath();
      c.moveTo(x2 + 1, y(ctop)); c.lineTo(x2 + 1, y(shoe)); c.moveTo(x2 + cw - 1, y(ctop)); c.lineTo(x2 + cw - 1, y(shoe));
      c.moveTo(x2 - 3, y(shoe)); c.lineTo(x2 + 6, y(shoe)); c.moveTo(x2 + cw - 6, y(shoe)); c.lineTo(x2 + cw + 3, y(shoe)); c.stroke();
    }
    // ground line and the depth scale
    c.strokeStyle = '#3d7a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x1 - 4, y(0)); c.lineTo(x2 + cw + 4, y(0)); c.stroke();
    const tgt = W.phase === 'pour' ? W.pour.mark : W.phase === 'result' && st && st.kind ? st.target : null;
    c.font = '400 9.5px "B612 Mono", monospace'; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = INK;
    for (let d = 0; d <= p.D; d += 10) if (tgt == null || Math.abs(d - tgt) > 3.5) c.fillText(String(d), ax - 5, y(d));
    if (tgt != null) {                                // where this pour has to stop
      c.strokeStyle = '#c0261b'; c.lineWidth = 2; c.setLineDash([5, 3]); c.beginPath(); c.moveTo(x1 - 3, y(tgt)); c.lineTo(x2 + cw + 3, y(tgt)); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#c0261b'; c.font = '700 10.5px "B612 Mono", monospace'; c.fillText(f1(tgt), ax - 4, y(tgt));
    }
    // the tape: the top of what has landed
    const ty = y(W.fill), tx = x2 + cw + 3;
    c.fillStyle = INK; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + 7, ty - 5); c.lineTo(tx + 7, ty + 5); c.closePath(); c.fill();
    c.font = '700 10.5px "B612 Mono", monospace'; c.textAlign = 'left'; c.fillText(W.fill < -0.05 ? '+' + f1(-W.fill) : f1(Math.max(0, W.fill)), tx + 9, ty);
  }
  function pipe(c, x, yTop, yBot, yScr) {
    c.fillStyle = '#fbfbf6'; c.fillRect(x - 3.5, yTop, 7, yBot - yTop);
    c.strokeStyle = '#2c2618'; c.lineWidth = 1; c.strokeRect(x - 3.5, yTop, 7, yBot - yTop);
    c.beginPath(); for (let yy = Math.max(yTop, yScr) + 2; yy < yBot - 1; yy += 3) { c.moveTo(x - 2.5, yy); c.lineTo(x + 2.5, yy); } c.stroke();
  }

  return { init, start, reset, update, key, engineer, get active() { return !!W && W.phase !== 'over'; }, get finished() { return !!W && W.finished; }, get state() { return W; } };
})();
