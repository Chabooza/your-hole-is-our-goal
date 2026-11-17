'use strict';
/* The SPT (the hammer test) on a geotechnical hole. Every 5 ft, once the core barrel is out, the drilling model stops
   in the phase 'SPT' (js/sim.js) and this runs the test. It happens on the rig, in the 3D scene (js/world.js, setJob
   draws the rods, the anvil, the hammer and the chalk marks from what this says). On top of that are the words down
   the right of the screen and, on the left, a small drawing of the hole from the side:

     1. AW rods go down the hole in 5 ft lengths with the sampler (the "pen") on the bottom, leaving 5 ft of stick-up.
        Each joint is a prompt: tap when the marker is in the green. Miss, and the rods drop down the hole, the crew
        fishes them out, the trip starts again and it costs points.
     2. The anvil is spun onto the top of the rods (tap fast), and the auto hammer is winched up and set on it.
     3. The helper chalks three marks on the rod, 6 in. apart, above the top clamp. The picture zooms in.
     4. The hammer runs. Each mark that reaches the top of the clamp is 6 in. driven. The player counts the blows for
        each 6 in. in their head: nothing on screen keeps count.
     5. The helper tells the engineer the three numbers. Sometimes he is wrong. The player says he is right, or says
        no and gives the numbers. Whatever is agreed goes on the log. Agreeing with a wrong count is the lie.
     6. Hammer off, anvil off, rods winched out.

   After the last test the hole is grouted (js/grout.js), on this same screen.

   If the bottom of the hole has sloughed in (wet sand in the 5 ft of open hole under the casing: the model works that
   out), the pen lands on the slough and the first blows hardly count for anything: not a good pen, and not the
   player's fault, but the numbers still have to be right.

   After the last test the thing the hole was drilled for gets built (the site's `build`). If every number on the log
   added up is 20% or more away from the real blows, it falls down, and the hole is not passed.

   S.sptLog keeps every test: { depth, real, said, rec, bad, slough, drops, agreed }. grade(S) turns it into the SPT
   half of the grade for the report. */
window.SPT = (() => {
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = k => k * k * (3 - 2 * k);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  const STICK = 5;               // ft of rod left standing above the ground
  const CLAMP_Y = 3.2;           // the top of the top clamp, ft above the ground: the marks are measured from here
  const SLOUGH_BAD = 0.5;        // this much slough on bottom, in ft, and the pen lands on it: not a good test
  const COLLAPSE = 0.20;         // the log this far out (all the wrong blows over all the real blows) and it falls down
  const W_SPT = 0.35;            // the SPT's share of the grade; grouting has its own (js/grout.js), the drilling is the rest
  const ERR_PEN = 300;           // points off the SPT grade for a log that is 100% out (so 10% out costs 30)
  const DROP_PEN = 6;            // points off the SPT grade each time the rods are dropped down the hole
  const FAIL_CAP = 69;           // the best grade a hole can get when the building falls down
  const RATE = [1.5, 2.6];       // hammer blows a second: on the first hole, and on the last
  const HELPER_OK = [0.55, 0.35];     // how often the helper has the count right: on the first hole, and on the last
  const LOST = 0.35;             // of the times he is wrong, how often he has lost count altogether
  // blows for 6 in. in each kind of ground, lowest to highest
  const N6 = { topsoil: [2, 3], clay: [3, 6], sand: [4, 9], gravel: [7, 13], till: [9, 15], shale: [12, 18] };
  // what the other helper says while the hammer is running, on the harder holes. The numbers are the point
  const CHAT = ['Did I tell you I got 14 walleye on Saturday?', 'My truck has 23 on the clock. Thousand.', 'Lunch at 12, or what?', 'There were 9 of us in that hot tub once.', 'That is the 17th time Marl has called.',
    'I had 6 coffees today. Six.', 'My kid turns 8 on Friday.', 'Only 11 more years till I retire.', 'I paid 19 bucks for this sandwich.', 'Was that 13? I think that was 13.', 'Rent went up to 21 hundred.', 'Aaron wants us on site at 5. In the morning.'];
  const THANKS = ['Thanks. That goes on the log.', 'Good. On the log it goes.', 'Perfect. Written down.', 'Got it. Thank you.'];
  const BUILD_NAME = { hottub: 'the hot tub deck', bin: 'the grain bin', tower: 'the cell tower', rink: 'the hockey rink', watertower: 'the water tower', overpass: 'the overpass', garage: 'the parking garage',
    condo: 'the condo tower', bridge: 'the bridge', mansion: "Marl's dream home" };
  const INK = '#1b1710';

  let APP, E = null, S = null, P = null, F = null, g = null, cw = 0, ch = 0, camK = 0;
  const faces = new Map();

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function log(msg, lvl) { S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg, lvl: lvl || 'info' }); if (S.log.length > 80) S.log.pop(); }

  // ---------- the numbers ----------
  // the real blows for the three 6 in. of a test at this depth. With slough on bottom the pen starts that much higher
  function truth(depth, slough, r) {
    const top = depth - slough, out = [];
    for (let i = 0; i < 3; i++) {
      const at = top + 0.25 + i * 0.5;
      if (at < depth) { out.push(1 + Math.floor(r() * 3)); continue; }           // still in the slough: it goes in like butter
      const L = SIM.layerAt(at), [a, b] = N6[L.id] || [4, 8];
      const dry = L.id === 'sand' && at < SIM.WT ? 1.2 : 1;
      out.push(clamp(Math.round((a + r() * (b - a)) * [0.75, 1, 1.15][i] * (1 + at / 200) * dry), 1, 20));
    }
    return out;
  }
  // what the helper says he counted
  function helperSays(real, k, r) {
    const ok = lerp(HELPER_OK[0], HELPER_OK[1], k), u = r();
    if (u < ok || POON.helps(S)) return real.slice();      // Poon Daddy never loses count
    let out;
    if (u < ok + (1 - ok) * (1 - LOST)) {          // he slipped on one or two of them
      out = real.slice();
      const n = r() < 0.6 ? 1 : 2, first = Math.floor(r() * 3);
      for (let i = 0; i < n; i++) { const j = (first + i) % 3, d = Math.max(1, Math.round(real[j] * (0.18 + r() * 0.3))); out[j] = real[j] + (r() < 0.5 && real[j] - d >= 1 ? -d : d); }
    } else out = real.map(v => Math.max(1, Math.round(v * (0.5 + r() * 1.1))));      // he lost count and is guessing
    if (out.every((v, i) => v === real[i])) out[1] += 1;
    return out;
  }
  // every blow of the test: which 6 in. it is in, and how far it drives the rod (they are not all the same)
  function blowPlan(real, r) {
    const seq = [];
    real.forEach((n, i) => {
      const w = []; let sum = 0;
      for (let j = 0; j < n; j++) { const x = 0.6 + r() * 0.8; w.push(x); sum += x; }
      w.forEach((x, j) => seq.push({ i, adv: 6 * x / sum, last: j === n - 1, gap: 0.9 + r() * 0.2 }));
    });
    return seq;
  }
  // rough seconds one test takes a player, for Aaron's deadline (js/aaron.js)
  const parTime = depth => 40 + depth * 0.5;

  // ---------- start, stop ----------
  function init(app) {
    APP = app;
    E = { root: $('spt'), cv: $('sptCv'), title: $('sptTitle'), step: $('sptStep'), q: $('sptQ'), qTitle: $('sptQTitle'), qHow: $('sptQHow'), bar: $('sptBar'), zone: $('sptZone'), mark: $('sptMark'), time: $('sptTime'),
      talk: $('sptTalk'), face: $('sptFace'), who: $('sptWho'), say: $('sptSay'), ask: $('sptAsk'), go: $('sptGo'), chat: $('sptChat'), cap: $('sptCap') };
    g = E.cv.getContext('2d');
    E.root.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; AUDIO.init(); tap(); });
    E.go.addEventListener('click', () => { AUDIO.init(); go(); });
    E.ask.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { AUDIO.init(); answer(b.dataset.a); } });
    GROUT.init(app);
    reset();
  }
  function reset() {
    P = null; F = null; camK = 0;
    GROUT.reset();
    if (window.WORLD && WORLD.setJob) WORLD.setJob(null);
    document.body.classList.remove('spt-job', 'spt-fin');
    if (E) E.root.hidden = true;
  }
  function faceOf(look, key) {
    if (!look) return '';
    if (!faces.has(key)) { let src = ''; try { src = WORLD.portraits([look], 160, 180)[0] || ''; } catch (e) { src = ''; } faces.set(key, src); }
    return faces.get(key);
  }
  function start() {
    const T = S.spt, slough = Math.max(0, S.hole.heave), bad = slough >= SLOUGH_BAD, k = S.site.hard || 0;
    const r = rng((S.seed % 100000) * 37 + T.depth * 1009 + 5);
    const land = T.depth - (bad ? slough : 0);
    const L = Math.ceil((land + STICK - 0.01) / 5) * 5, pieces = Math.floor(L / 20) + (L % 20) / 5;
    const real = truth(T.depth, bad ? slough : 0, r), who = WELL.engineer(S);
    P = { depth: T.depth, last: T.last, slough, bad, land, L, joints: clamp(pieces - 1, 1, 3), joint: 0, real, said: helperSays(real, k, r), rec: null, agreed: null,
      plan: blowPlan(real, r), bi: 0, bt: 0, pen: 0, rate: lerp(RATE[0], RATE[1], k), lift: 0, hit: 0, flash: [0, 0, 0], marks: 0, k,
      phase: 'in', t: 0, up: 0, piece: false, low: 0, lowTo: 0, q: null, drops: 0, hamK: 0, anvil: false, sub: '', vals: null, sel: 0, chatT: 2.5 + Math.random() * 3, chat: '', chatHold: 0,
      eng: who.name, engLook: who.look, helper: S.crew[0].name, other: S.crew[1].name, sayT: 0 };
    S.sptLog = S.sptLog || [];
    camK = 0;
    for (const k in last) delete last[k];
    document.body.classList.add('spt-job');
    E.root.hidden = false; E.root.dataset.fin = '';
    E.title.textContent = `SPT at ${P.depth} ft`;
    PANEL.setHands(false);
    enter('in');
    log(`The AW rods go down for the SPT at ${P.depth} ft${P.bad ? `. The hole has sloughed: bottom is at ${P.land.toFixed(1)} ft` : ''}.`, P.bad ? 'warn' : 'info');
  }

  // ---------- the prompts: tap in the green (rod joints), tap fast (the anvil) ----------
  function newQ(type, label, retry) {
    const tn = SHOP.tune(S);
    const auto = POON.helps(S);                  // the rods and the anvil are a helper's job: with Poon Daddy on it, they do themselves
    return { type, label: auto ? 'Poon Daddy has got it' : label, auto, state: 'ready', hold: retry ? 0.5 : 0.75, t: 0, prog: 0, taps: 0, limit: type === 'mash' ? tn.mashTime : tn.aimTime, need: tn.taps, sweep: tn.sweep, zc: 0.22 + Math.random() * 0.56, zw: tn.zone, pos: 0, ph: Math.random() * 2 };
  }
  function failQ() {
    const q = P.q;
    if (q.auto) return;
    if (q.type === 'mash') { q.state = 'fail'; q.hold = 1.3; q.why = 'It slid off. Again!'; S.sfx.push('clank'); return; }
    // a rod joint missed: the whole string goes down the hole
    POON.mark(S, 'rods');
    P.q = null; P.phase = 'drop'; P.t = 0; P.piece = false; P.low = 1; P.lowTo = 1; P.up = -STICK;
    if (!SHOP.lucky(S)) P.drops++;
    say(P.helper, pick(['Look out! There they go!', 'Dropped them! Sorry, boss!', 'Whoa! Rods are down the hole!']), 2.6, 'lead');
    log('Missed the joint. The AW rods dropped down the hole and have to be fished out.', 'crit');
    S.sfx.push('clank'); S.sfx.push('alarm');
  }
  function tap() {
    if (F) { if (F.t > F.capT + 0.4) endFinale(); return; }
    if (!P || S.paused) return;
    const q = P.q;
    if (!q || q.state !== 'go' || q.auto) return;
    if (q.type === 'mash') { q.taps++; q.prog = clamp(q.taps / q.need, 0, 1); S.sfx.push('switch'); }
    else if (Math.abs(q.pos - q.zc) <= q.zw / 2) q.prog = 1; else failQ();
  }
  // true once the prompt has been done
  function updateQ(dt) {
    const q = P.q;
    if (q.state === 'ready') { q.hold -= dt; if (q.hold <= 0) q.state = 'go'; }
    else if (q.state === 'go') {
      q.t += dt;
      if (q.type === 'timing') { const u = (q.ph + q.t * q.sweep) % 2; q.pos = u < 1 ? u : 2 - u; }
      if (q.auto) { q.prog = Math.min(1, q.prog + dt * 2.4); if (q.type === 'timing') q.pos = q.zc; }      // Poon Daddy's job: it does itself (js/poon.js)
      if (q.prog >= 1) { q.state = 'done'; q.hold = 0.35; S.sfx.push('ok'); }
      else if (q.t >= q.limit) failQ();
    } else if (q.state === 'fail') { q.hold -= dt; if (q.hold <= 0) P.q = newQ(q.type, q.label, true); }
    else if (q.state === 'done') { q.hold -= dt; if (q.hold <= 0) { P.q = null; return true; } }
    return false;
  }

  // ---------- the steps of one test ----------
  function say(who, text, dur, face) {
    P.sayWho = who; P.sayText = text; P.sayT = dur || 3; P.sayFace = face || 'lead';
  }
  function enter(phase) {
    P.phase = phase; P.t = 0;
    if (phase === 'in') { P.piece = true; P.q = newQ('timing', P.joints > 1 ? `Thread on rod ${P.joint + 1} of ${P.joints}` : 'Thread the rods together'); }
    else if (phase === 'anvil') { P.piece = false; P.q = newQ('mash', 'Spin the anvil on'); }
    else if (phase === 'rig') { P.anvil = true; S.sfx.push('clank'); }
    else if (phase === 'ready') say(P.helper, P.bad ? `We tagged ${P.slough.toFixed(1)} ft high, boss. Slough. It will not be a good pen.` : 'Marked up: three times 6 inches. Ready when you are.', 4, 'lead');
    else if (phase === 'count') { P.bi = 0; P.bt = 0.5; P.sayT = 0; }
    else if (phase === 'report') { P.sub = 'ask'; say(P.helper, `I counted ${P.said[0]}, ${P.said[1]} and ${P.said[2]}.`, 1e9, 'lead'); S.sfx.push('ok'); }
    else if (phase === 'out') { S.sfx.push('clank'); }
  }
  function go() { if (P && P.phase === 'ready' && !S.paused) enter('count'); }
  // the player's answer to "is that right?"
  function answer(a) {
    if (!P || P.phase !== 'report' || S.paused) return;
    if (P.sub === 'ask') {
      if (a === 'yes') { P.rec = P.said.slice(); P.agreed = true; thanks(); }
      else if (a === 'no') { P.sub = 'fix'; P.vals = P.said.slice(); P.sel = 0; say(P.eng, 'No? What was it, then?', 1e9, 'eng'); S.sfx.push('switch'); }
    } else if (P.sub === 'fix') {
      const m = /^([+-])(\d)$/.exec(a || '');
      if (m) { const i = +m[2]; P.sel = i; P.vals[i] = clamp(P.vals[i] + (m[1] === '+' ? 1 : -1), 0, 60); S.sfx.push('switch'); }
      else if (a === 'ok') { P.rec = P.vals.slice(); P.agreed = false; thanks(); }
    }
  }
  function thanks() {
    P.sub = 'thanks'; P.t = 0;
    say(P.eng, `${P.rec.join(', ')}. ${pick(THANKS)}`, 1e9, 'eng');
    S.sfx.push('done');
  }
  function finishTest() {
    const t = { depth: P.depth, real: P.real, said: P.said, rec: P.rec, bad: P.bad, slough: P.slough, drops: P.drops, agreed: P.agreed };
    S.sptLog.push(t);
    log(`SPT at ${P.depth} ft: ${t.rec.join(', ')} went on the log (N = ${t.rec[1] + t.rec[2]})${P.bad ? ', on slough' : ''}.`, 'good');
    const last = P.last;
    P = null;
    if (last) { close(); S.spt.grout = true; GROUT.start(S, startFinale); return; }      // the hole gets grouted before anything is built on it
    close();
    SIM.sptDone(S);
  }
  function close() {
    document.body.classList.remove('spt-job', 'spt-fin');
    E.root.hidden = true;
    WORLD.setJob(null); WORLD.preset('work');
    if (!APP.away && !APP.menu) PANEL.setHands(true);
  }

  function updateTest(dt) {
    P.t += dt;
    if (P.sayT > 0 && P.sayT < 1e8) P.sayT -= dt;
    for (let i = 0; i < 3; i++) if (P.flash[i] > 0) P.flash[i] -= dt;
    if (P.hit > 0) P.hit -= dt;
    P.low += clamp(P.lowTo - P.low, -dt * 0.9, dt * 0.9);
    const wantCam = P.phase === 'ready' || P.phase === 'count' || P.phase === 'counted' || P.phase === 'report' || (P.phase === 'rig' && P.t > 1.3) ? 1 : 0;
    camK = clamp(camK + (wantCam - camK > 0 ? 1 : -1) * dt / 0.9, 0, 1);
    if (Math.abs(wantCam - camK) < 0.02) camK = wantCam;
    switch (P.phase) {
      case 'in':
        if (P.up > 0) { P.up = Math.max(0, P.up - dt * 7); break; }           // the last joint is still running down
        if (updateQ(dt)) {
          P.joint++; P.up = 5; P.lowTo = P.joint / P.joints; S.sfx.push('clank');
          if (P.joint >= P.joints) { P.piece = false; P.phase = 'landed'; P.t = 0; } else enter('in');
        }
        break;
      case 'landed':                               // the last length runs down and the pen sits on bottom
        P.up = Math.max(0, P.up - dt * 7);
        if (P.up <= 0 && P.low >= 0.999) enter('anvil');
        break;
      case 'drop':
        if (P.t > 2.8) { P.joint = 0; P.low = 0; P.lowTo = 0; P.up = 0; say(P.helper, 'Fished them out. From the top.', 2, 'lead'); enter('in'); }
        break;
      case 'anvil': if (updateQ(dt)) enter('rig'); break;
      case 'rig':
        P.hamK = clamp(P.t / 1.3, 0, 1);
        { const m = P.t > 2.2 ? 3 : P.t > 1.9 ? 2 : P.t > 1.6 ? 1 : 0; if (m > P.marks) { P.marks = m; S.sfx.push('switch'); } }
        if (P.t > 2.6) enter('ready');
        break;
      case 'count': {
        P.bt -= dt;
        const b = P.plan[P.bi], T = 1 / P.rate;
        P.lift = b ? clamp(1 - P.bt / (T * 0.8), 0, 1) : 0;        // the hammer climbs, then drops
        if (b && P.bt <= 0) {
          P.pen += b.adv; P.hit = 0.12; P.lift = 0;
          S.sfx.push('blow');
          if (b.last) { P.flash[b.i] = 0.5; P.pen = (b.i + 1) * 6; }
          P.bi++; P.bt = T * (P.plan[P.bi] ? P.plan[P.bi].gap : 1);
          if (P.bi >= P.plan.length) { P.phase = 'counted'; P.t = 0; P.lift = 0; }
        }
        // the other helper will not shut up, on the harder holes
        if (P.k > 0.25) {
          P.chatT -= dt;
          if (P.chatHold > 0) { P.chatHold -= dt; if (P.chatHold <= 0) P.chat = ''; }
          if (P.chatT <= 0) { P.chat = pick(CHAT); P.chatHold = 2.6; P.chatT = lerp(9, 4.5, P.k) * (0.7 + Math.random() * 0.6); }
        }
        break;
      }
      case 'counted': P.chat = ''; if (P.t > 1.0) enter('report'); break;
      case 'report': if (P.sub === 'thanks' && P.t > 1.9) { P.sayT = 0; enter('out'); } break;
      case 'out':
        P.hamK = clamp(1 - P.t / 0.9, 0, 1);
        if (P.t > 0.9) P.anvil = false;
        if (P.t > 1.1) P.lowTo = 0;
        if (P.t > 2.7) finishTest();
        break;
    }
  }

  // ---------- the end of the hole: it gets built ----------
  function grade(S_) {
    const tests = S_.sptLog || [];
    let real = 0, off = 0, drops = 0;
    for (const t of tests) { t.real.forEach((v, i) => { real += v; off += Math.abs(v - t.rec[i]); }); drops += t.drops; }
    const err = real ? off / real : 0;
    return { score: Math.round(clamp(100 - err * ERR_PEN - drops * DROP_PEN, 0, 100)), err, collapsed: err >= COLLAPSE, drops, tests, build: S_.site.build, name: BUILD_NAME[S_.site.build] || 'it' };
  }
  // The buildings, as stacks of pieces: [shape, x, y, w, h, colour]. x is from the middle, y up from the ground,
  // in units of about a storey. Shapes: r rectangle, t triangle (a roof), e ellipse.
  const A = '#9aa7b0', WIN = '#bfe3f5', WOOD = '#b98a4e', CONC = '#c9c5b8';
  const win = (x0, y0, nx, ny, dx, dy, w, h) => { const o = []; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) o.push(['r', x0 + i * dx, y0 + j * dy, w, h, WIN]); return o; };
  const BUILDS = {
    hottub: [['r', -1.5, 0, 0.18, 0.5, WOOD], ['r', 1.32, 0, 0.18, 0.5, WOOD], ['r', -0.1, 0, 0.18, 0.5, WOOD], ['r', -1.7, 0.5, 3.4, 0.22, '#c99a5a'], ['r', -0.95, 0.72, 1.9, 0.62, '#2f8fa3'], ['e', -0.85, 1.22, 1.7, 0.24, '#8fd8ea'],
      ['e', -0.5, 1.3, 0.3, 0.34, '#e6b48c'], ['e', 0.25, 1.3, 0.3, 0.34, '#cd9868'], ['r', 1.15, 0.72, 0.1, 0.9, WOOD], ['t', 0.75, 1.62, 0.9, 0.3, '#e0362b']],
    bin: [['r', -1, 0, 2, 0.16, CONC], ['r', -0.85, 0.16, 1.7, 0.5, A], ['r', -0.85, 0.66, 1.7, 0.5, '#aab6be'], ['r', -0.85, 1.16, 1.7, 0.5, A], ['r', -0.85, 1.66, 1.7, 0.5, '#aab6be'], ['t', -0.95, 2.16, 1.9, 0.7, '#8b98a1'],
      ['r', -0.12, 2.8, 0.24, 0.14, '#6a757f'], ['r', 0.9, 0.16, 0.12, 2.1, '#6a757f']],
    tower: [['r', -0.8, 0, 1.6, 0.14, CONC], ['r', -0.42, 0.14, 0.84, 0.75, '#c8201a'], ['r', -0.34, 0.89, 0.68, 0.75, '#f4f4ee'], ['r', -0.27, 1.64, 0.54, 0.75, '#c8201a'], ['r', -0.2, 2.39, 0.4, 0.75, '#f4f4ee'],
      ['r', -0.13, 3.14, 0.26, 0.7, '#c8201a'], ['r', -0.5, 3.4, 0.2, 0.42, '#dfe5e8'], ['r', 0.3, 3.4, 0.2, 0.42, '#dfe5e8'], ['r', -0.03, 3.84, 0.06, 0.5, '#39424a'], ['e', -0.09, 4.3, 0.18, 0.18, '#e0362b']],
    rink: [['r', -2, 0, 4, 1.0, '#dfe5e8'], ['r', -2, 0.72, 4, 0.2, '#0b3d91'], ['e', -2.05, 0.6, 4.1, 1.5, '#8b98a1'], ['r', -0.35, 0, 0.7, 0.62, '#39424a'], ['r', -1.7, 0.2, 0.6, 0.36, WIN], ['r', 1.1, 0.2, 0.6, 0.36, WIN],
      ['r', -0.6, 0.66, 1.2, 0.3, '#f26a1b']],
    watertower: [['r', -0.9, 0, 0.14, 2.0, '#6a757f'], ['r', 0.76, 0, 0.14, 2.0, '#6a757f'], ['r', -0.07, 0, 0.14, 2.0, '#6a757f'], ['r', -0.9, 0.9, 1.8, 0.1, '#6a757f'], ['e', -1.25, 1.85, 2.5, 1.5, '#7fc4e8'],
      ['r', -1.25, 2.5, 2.5, 0.2, '#f4f4ee'], ['t', -0.5, 3.3, 1.0, 0.36, '#5f6a72']],
    overpass: [['r', -1.6, 0, 0.4, 1.3, CONC], ['r', 1.2, 0, 0.4, 1.3, CONC], ['r', -1.75, 1.3, 0.7, 0.16, '#b3ae9f'], ['r', 1.05, 1.3, 0.7, 0.16, '#b3ae9f'], ['r', -2.4, 1.46, 4.8, 0.3, '#8d897c'],
      ['r', -2.4, 1.76, 4.8, 0.08, '#39424a'], ['r', -0.9, 1.84, 1.1, 0.5, '#e0362b'], ['r', 0.2, 1.84, 0.4, 0.36, '#f4f4ee'], ['e', -0.75, 1.76, 0.24, 0.24, INK], ['e', 0.25, 1.76, 0.24, 0.24, INK]],
    garage: [['r', -1.9, 0, 3.8, 0.14, CONC], ['r', -1.8, 0.14, 0.22, 0.56, '#b3ae9f'], ['r', 1.58, 0.14, 0.22, 0.56, '#b3ae9f'], ['r', -0.11, 0.14, 0.22, 0.56, '#b3ae9f'], ['r', -1.9, 0.7, 3.8, 0.18, CONC],
      ['r', -1.8, 0.88, 0.22, 0.56, '#b3ae9f'], ['r', 1.58, 0.88, 0.22, 0.56, '#b3ae9f'], ['r', -0.11, 0.88, 0.22, 0.56, '#b3ae9f'], ['r', -1.9, 1.44, 3.8, 0.18, CONC], ['r', -1.8, 1.62, 0.22, 0.56, '#b3ae9f'],
      ['r', 1.58, 1.62, 0.22, 0.56, '#b3ae9f'], ['r', -0.11, 1.62, 0.22, 0.56, '#b3ae9f'], ['r', -1.9, 2.18, 3.8, 0.18, CONC], ['r', -1.3, 0.14, 0.7, 0.3, '#1f8fd6'], ['r', 0.5, 0.88, 0.7, 0.3, '#e0362b'], ['r', -1.2, 1.62, 0.7, 0.3, '#ffd23f']],
    condo: [['r', -1.05, 0, 2.1, 0.16, CONC], ['r', -0.85, 0.16, 1.7, 3.9, '#d9d4c4'], ...win(-0.68, 0.5, 4, 6, 0.36, 0.58, 0.24, 0.34), ['r', -0.2, 0.16, 0.4, 0.3, '#39424a'], ['r', -0.95, 4.06, 1.9, 0.14, '#8d897c'],
      ['r', -0.3, 4.2, 0.6, 0.3, '#6a757f']],
    bridge: [['r', -1.5, 0, 0.3, 2.6, CONC], ['r', 1.2, 0, 0.3, 2.6, CONC], ['r', -2.6, 1.0, 5.2, 0.22, '#8d897c'], ['r', -2.6, 1.22, 5.2, 0.07, '#39424a'], ['t', -2.5, 1.29, 1.1, 1.25, '#c8201a'], ['t', -1.3, 1.29, 2.6, 1.25, '#c8201a'],
      ['t', 1.4, 1.29, 1.1, 1.25, '#c8201a'], ['r', -0.4, 1.29, 0.6, 0.28, '#1f8fd6'], ['e', -0.3, 1.22, 0.18, 0.18, INK], ['e', 0.02, 1.22, 0.18, 0.18, INK]],
    mansion: [['r', -1.9, 0, 3.8, 0.14, CONC], ['r', -1.7, 0.14, 3.4, 1.5, '#f1e6c8'], ['t', -1.9, 1.64, 3.8, 0.9, '#7a3b2a'], ['r', -1.45, 0.14, 0.16, 1.5, '#fdfdf8'], ['r', -0.75, 0.14, 0.16, 1.5, '#fdfdf8'],
      ['r', 0.59, 0.14, 0.16, 1.5, '#fdfdf8'], ['r', 1.29, 0.14, 0.16, 1.5, '#fdfdf8'], ['r', -0.25, 0.14, 0.5, 0.85, '#5a3d1a'], ...win(-1.2, 0.95, 2, 1, 2.0, 0, 0.36, 0.42), ['r', 1.0, 2.0, 0.28, 0.75, '#8a5a3a'],
      ['t', -0.5, 2.3, 1.0, 0.5, '#7a3b2a']],
  };
  function startFinale() {
    const G = grade(S), kind = BUILDS[S.site.build] ? S.site.build : 'condo';
    for (const k in last) delete last[k];
    F = { t: 0, G, kind, falls: G.collapsed, fallT: 3.6, capT: G.collapsed ? 4.9 : 3.2, parts: BUILDS[kind].map((p, i) => ({ s: p[0], x: p[1], y: p[2], w: p[3], h: p[4], c: p[5], i, dx: 0, dy: 0, a: 0, vx: 0, vy: 0, va: 0, loose: false, rest: false,
      t0: 0.15 + Math.random() * 0.75 })), dust: [], bits: [], said: false };
    WORLD.setJob(null);
    document.body.classList.add('spt-job', 'spt-fin');
    E.root.hidden = false; E.root.dataset.fin = '1';
    E.q.hidden = true; E.talk.hidden = true; E.ask.hidden = true; E.go.hidden = true; E.chat.hidden = true;
    E.title.textContent = `Six months later, at ${S.site.name}`;
    E.step.textContent = `They built ${G.name} on your numbers.`;
    E.cap.hidden = true;
    S.sfx.push('ok');
  }
  function endFinale() {
    F = null;
    close();
    SIM.sptDone(S);
  }
  function updateFinale(dt) {
    F.t += dt;
    const t = F.t;
    if (F.falls && t > F.fallT) {
      for (const p of F.parts) {
        if (!p.loose && t > F.fallT + p.t0) { p.loose = true; p.vx = (Math.random() - 0.5) * 2.4 + 0.5; p.vy = Math.random() * 1.6; p.va = (Math.random() - 0.5) * 5; }
        if (p.loose && !p.rest) {
          p.vy -= 9 * dt; p.dx += p.vx * dt; p.dy += p.vy * dt; p.a += p.va * dt;
          if (p.y + p.dy <= 0.02) {
            p.dy = 0.02 - p.y;
            if (Math.abs(p.vy) > 1.2) { p.vy = -p.vy * 0.28; p.vx *= 0.5; p.va *= 0.5; F.dust.push({ x: p.x + p.dx + p.w / 2, y: 0.1, r: 0.2, a: 0.7 }); } else { p.rest = true; p.a = Math.round(p.a / (Math.PI / 2)) * (Math.PI / 2) + (Math.random() - 0.5) * 0.3; }
          }
        }
      }
      if (!F.said) { F.said = true; S.sfx.push('alarm'); S.sfx.push('clank'); }
      if (Math.random() < dt * 9 && t < F.fallT + 2.4) { F.dust.push({ x: (Math.random() - 0.5) * 3.4, y: Math.random() * 0.5, r: 0.25, a: 0.75 }); if (Math.random() < 0.3) S.sfx.push('clank'); }
    } else if (!F.falls && t > 3.0) {
      if (!F.said) { F.said = true; S.sfx.push('done'); }
      if (Math.random() < dt * 26 && t < 6.5) F.bits.push({ x: (Math.random() - 0.5) * 6, y: 5.2, vx: (Math.random() - 0.5) * 0.8, vy: -1 - Math.random(), c: pick(['#e0362b', '#ffd23f', '#1f8fd6', '#37c04a', '#ff4f9a']), a: Math.random() * 6 });
    }
    for (const d of F.dust) { d.r += dt * 0.7; d.y += dt * 0.25; d.a -= dt * 0.42; }
    F.dust = F.dust.filter(d => d.a > 0);
    for (const b of F.bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.a += dt * 6; }
    F.bits = F.bits.filter(b => b.y > -0.2);
    if (t > F.capT && E.cap.hidden) {
      const pct = Math.round(F.G.err * 100);
      E.cap.innerHTML = F.falls ? `<b>It fell down.</b><span>The log was ${pct}% out. The ground was not what the numbers said.</span><small>tap to carry on</small>`
        : `<b>It stands.</b><span>${pct === 0 ? 'Every blow on the log was right.' : `The log was ${pct}% out: close enough to build on.`}</span><small>tap to carry on</small>`;
      E.cap.dataset.bad = F.falls ? '1' : ''; E.cap.hidden = false;
    }
    if (t > (F.falls ? 11 : 9.5)) endFinale();
  }

  // ---------- every frame ----------
  function update(S_, dt) {
    S = S_;
    if (!E) return;
    if (GROUT.busy) { GROUT.update(S, dt); return; }
    if (!P && !F) {
      if (S.phase === 'SPT' && S.spt && !S.spt.grout && !S.done && !S.paused && !APP.away && !APP.menu && !APP.fly && APP.seenRuns >= S.runs.length && $('report').hidden) start();      // (the core table comes first)
      else return;
    }
    const off = APP.away || APP.menu || APP.fly;
    E.root.hidden = off;
    if (off) return;
    if (!S.paused) { if (F) updateFinale(dt); else updateTest(dt); }
    if (P || F) show();
  }
  // Space and Enter tap; on the report Y and N answer, the arrows change a number
  function key(e) {
    if (GROUT.busy) return GROUT.key(e);
    if (!P && !F) return false;
    if (e.code === 'Escape') return false;
    if (e.repeat) return true;
    if (F) { if (e.code === 'Space' || e.code === 'Enter') tap(); return true; }
    if (P.phase === 'ready') { if (e.code === 'Space' || e.code === 'Enter') go(); return true; }
    if (P.phase === 'report') {
      if (P.sub === 'ask') { if (e.code === 'KeyY' || e.code === 'Enter') answer('yes'); else if (e.code === 'KeyN') answer('no'); }
      else if (P.sub === 'fix') {
        if (e.code === 'ArrowLeft') P.sel = (P.sel + 2) % 3; else if (e.code === 'ArrowRight') P.sel = (P.sel + 1) % 3;
        else if (e.code === 'ArrowUp') answer('+' + P.sel); else if (e.code === 'ArrowDown') answer('-' + P.sel);
        else if (e.code === 'Enter') answer('ok');
      }
      return true;
    }
    if (e.code === 'Space' || e.code === 'Enter') tap();
    return true;
  }

  // ---------- the picture ----------
  const last = {};
  const set = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };
  const STEPS = { in: 'Rods in: tap when the marker is in the green to thread each joint.', landed: 'The pen is running down to bottom.', drop: 'The rods are down the hole. The crew is fishing them out.', anvil: 'Tap fast to spin the anvil on.',
    rig: 'The hammer goes on, and the rod is marked: three times 6 inches.', ready: 'Count the blows for each 6 inches. Nothing is written down: remember all three.', count: 'Count. A mark at the clamp is 6 inches.',
    counted: 'That is 18 inches.', report: 'Is the helper right? What you agree to goes on the log.', out: 'Hammer off, anvil off, rods out.' };
  function show() {
    if (F) { drawFinale(); return; }
    const q = P.q;
    set('step', STEPS[P.phase] || '', v => { E.step.textContent = v; });
    // the prompt
    set('q', q ? q.type + q.label + q.state : '', () => {
      E.q.hidden = !q;
      if (!q) return;
      E.q.dataset.type = q.type; E.q.dataset.state = q.state;
      E.qTitle.textContent = q.state === 'fail' ? q.why : q.state === 'done' ? 'Got it!' : q.label;
      E.qHow.textContent = q.auto ? 'Sit back. He never misses.' : q.state === 'ready' ? 'Get ready…' : q.type === 'mash' ? (APP.phone ? 'Tap as fast as you can' : 'Tap, or hammer the Space bar') : (APP.phone ? 'Tap when the marker is in the green' : 'Tap, or press Space, when the marker is in the green');
      if (q.type === 'timing') { E.zone.style.left = ((q.zc - q.zw / 2) * 100).toFixed(1) + '%'; E.zone.style.width = (q.zw * 100).toFixed(1) + '%'; }
    });
    if (q) {
      if (q.type === 'timing') E.mark.style.left = (q.pos * 100).toFixed(1) + '%';
      else { E.zone.style.left = '0'; E.zone.style.width = (q.prog * 100).toFixed(1) + '%'; E.mark.style.left = '-20px'; }
      E.time.style.width = (q.state === 'go' ? clamp(1 - q.t / q.limit, 0, 1) * 100 : 100).toFixed(1) + '%';
    }
    // who is talking
    const talk = P.sayT > 0;
    set('talk', talk ? P.sayWho + '|' + P.sayText : '', () => {
      E.talk.hidden = !talk;
      if (!talk) return;
      const src = P.sayFace === 'eng' ? faceOf(P.engLook, 'eng:' + P.eng) : faceOf(APP.looks && APP.looks.lead, 'lead:' + P.helper);
      E.face.hidden = !src; if (src) E.face.src = src;
      E.who.textContent = P.sayFace === 'eng' ? `${P.sayWho}, the engineer` : P.sayWho; E.say.textContent = P.sayText;
    });
    // the answer buttons
    const ask = P.phase === 'report' ? P.sub + (P.sub === 'fix' ? P.vals.join(',') + P.sel : '') : '';
    set('ask', ask, () => {
      E.ask.hidden = !(P.phase === 'report' && P.sub !== 'thanks');
      if (E.ask.hidden) return;
      if (P.sub === 'ask') E.ask.innerHTML = `<p>${P.eng} has the pencil ready: "${P.said.join(', ')}. That right, driller?"</p><div class="spt-btns"><button type="button" class="btn-big" data-a="yes">That is right</button><button type="button" class="btn-big alt" data-a="no">No. It was…</button></div>`;
      else E.ask.innerHTML = `<p>Set the blows you counted for each 6 inches.</p><div class="spt-nums">${P.vals.map((v, i) => `<div class="spt-num"${i === P.sel ? ' data-sel="1"' : ''}><small>${['First', 'Second', 'Third'][i]} 6 in.</small><div><button type="button" data-a="+${i}" aria-label="One more">+</button><b>${v}</b><button type="button" data-a="-${i}" aria-label="One less">−</button></div></div>`).join('')}</div><div class="spt-btns"><button type="button" class="btn-big" data-a="ok">That is the count</button></div>`;
    });
    set('go', P.phase === 'ready', v => { E.go.hidden = !v; });
    set('sub', P.phase === 'report' ? P.sub : '', v => { E.root.dataset.sub = v; });
    set('chat', P.chat || '', v => { E.chat.hidden = !v; if (v) E.chat.textContent = `${P.other}: "${v}"`; });
    set('cap', 'off', () => { E.cap.hidden = true; });
    scene3d();
    draw();
  }
  function size() {
    const w = E.cv.clientWidth, h = E.cv.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return false;
    if (w !== cw || h !== ch || E.cv.width !== Math.round(w * d)) { cw = w; ch = h; E.cv.width = Math.round(w * d); E.cv.height = Math.round(h * d); }
    g.setTransform(d, 0, 0, d, 0, 0);
    g.lineJoin = 'round';
    return true;
  }
  function box(x, y, w, h, fill, lw) { g.fillStyle = fill; g.fillRect(x, y, w, h); g.lineWidth = lw || 3; g.strokeStyle = INK; g.strokeRect(x, y, w, h); }
  function label(t, x, y, px, col, align, weight) { g.font = `${weight || 700} ${px}px 'Barlow Condensed', 'Arial Narrow', sans-serif`; g.fillStyle = col || INK; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(t, x, y); }

  // the hole from the side, all of it: the ground, the casing, the open hole, the slough and the rods
  function drawStrip(x0, w) {
    const top = 14, bot = ch - 14, D = SIM.TARGET + 3, up = 7;
    const ppf = (bot - top - 22) / (D + up), gy = top + 22 + up * ppf, cx = x0 + w * 0.6, hw = clamp(w * 0.13, 12, 22);
    g.fillStyle = '#cfe6ef'; g.fillRect(x0, top, w, gy - top);
    for (const L of SIM.LAYERS) {
      const y1 = gy + L.top * ppf, y2 = gy + Math.min(L.bot, D) * ppf;
      if (y2 <= y1) continue;
      g.fillStyle = L.color; g.fillRect(x0, y1, w, y2 - y1);
      g.strokeStyle = '#0005'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0 + w, y1); g.stroke();
      if (y2 - y1 > 13) label(L.short, x0 + 5, (y1 + y2) / 2, 12, '#fffdf4', 'left', 800);
    }
    if (SIM.WT < D) { const y = gy + SIM.WT * ppf; g.strokeStyle = '#1f6fd1'; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); g.setLineDash([]); label('water', x0 + w - 4, y - 7, 11, '#0b3d91', 'right', 800); }
    // the hole, the slough on bottom, the casing
    const hd = S.hole.depth, sl = Math.max(0, S.hole.heave);
    g.fillStyle = '#241d18'; g.fillRect(cx - hw / 2, gy, hw, hd * ppf);
    if (sl > 0.05) { g.fillStyle = '#e9cf8a'; g.fillRect(cx - hw / 2, gy + (hd - sl) * ppf, hw, sl * ppf); g.strokeStyle = '#6b5226'; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.strokeRect(cx - hw / 2, gy + (hd - sl) * ppf, hw, sl * ppf); g.setLineDash([]); }
    g.strokeStyle = '#aab3ba'; g.lineWidth = 3;
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(cx + sx * (hw / 2 + 1.5), gy - 2.3 * ppf); g.lineTo(cx + sx * (hw / 2 + 1.5), gy + S.casing.depth * ppf); g.stroke(); }
    // the rods, with the pen on the bottom
    const rb = (P.phase === 'drop' ? 1 : P.low) * P.land + P.pen / 12;
    if (rb > 0.05 || P.phase !== 'out') {
      const rt = Math.max(-up + 0.5, rb - P.L);
      g.strokeStyle = '#e3e8ec'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, gy + rt * ppf); g.lineTo(cx, gy + rb * ppf); g.stroke();
      g.strokeStyle = '#c9a24a'; g.lineWidth = Math.max(6, hw * 0.55); g.beginPath(); g.moveTo(cx, gy + Math.max(rt, rb - 2) * ppf); g.lineTo(cx, gy + rb * ppf); g.stroke();
    }
    // depths down the side, and where this test is
    for (let d = 0; d <= SIM.TARGET; d += 5) { const y = gy + d * ppf; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + w - 8, y); g.lineTo(x0 + w, y); g.stroke(); if (d % 10 === 0 || SIM.TARGET <= 25) label(String(d), x0 + w - 11, y, 11, '#fffdf4', 'right', 800); }
    const ty = gy + P.depth * ppf;
    g.fillStyle = '#e0362b'; g.beginPath(); g.moveTo(cx + hw / 2 + 5, ty); g.lineTo(cx + hw / 2 + 17, ty - 7); g.lineTo(cx + hw / 2 + 17, ty + 7); g.closePath(); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#5a8a3a'; g.fillRect(x0, gy - 3, w, 4);
    g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(x0, top, w, bot - top);
    label('THE HOLE', x0 + 6, top + 12, 12, INK, 'left', 800);
  }

  // tell the 3D scene what there is to see (js/world.js, setJob), and point the driller's eyes at it
  function scene3d() {
    const q = P.q, top = STICK - P.pen / 12 + Math.max(0, P.up) - (P.phase === 'drop' ? clamp(P.t / 0.5, 0, 1) * 9 : 0);
    WORLD.setJob({ kind: 'spt', rodTop: top, piece: P.piece && P.phase === 'in' && P.up <= 0 ? { bot: top + (q && q.state === 'done' ? 0 : 0.5 + 0.08 * Math.sin(P.t * 5)), len: 5 } : null,
      anvil: P.anvil ? 1 : P.phase === 'anvil' ? 'hover' : 0, hamK: P.hamK, lift: P.lift, hits: P.bi, marks: P.marks, sink: P.pen / 12, flash: Math.max(P.flash[0], P.flash[1], P.flash[2]),
      hold: P.phase === 'in' || P.phase === 'landed' || P.phase === 'anvil' || P.phase === 'rig' || P.phase === 'out', work: !!q && q.state === 'go', back: P.phase === 'ready' || P.phase === 'count' || P.phase === 'counted' || P.phase === 'report', eng: P.engLook, talk: P.sayT > 0 ? P.sayFace : '' });
    if (P.phase === 'ready' || P.phase === 'count' || P.phase === 'counted') WORLD.aim(0, 1.26, 0, 26);       // in close on the marks
    else if (P.phase === 'report') WORLD.aim(-1.0, 1.5, 0.6, 50);       // the helper and the engineer
    else WORLD.aim(0, 1.5, 0, 62);
  }
  function draw() {
    if (!size()) return;
    g.clearRect(0, 0, cw, ch);
    drawStrip(Math.max(10, cw * 0.012), clamp(cw * 0.2, 118, 230));
    const big = (text, col) => { const px = clamp(ch * 0.085, 26, 58); g.font = `800 ${px}px 'Barlow Condensed', 'Arial Narrow', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = INK; g.strokeText(text, cw * 0.44, ch * 0.2); g.fillStyle = col; g.fillText(text, cw * 0.44, ch * 0.2); };
    if (P.phase === 'drop') big('DROPPED!', '#ff6a55');
    else if (Math.max(P.flash[0], P.flash[1], P.flash[2]) > 0) big('6 in. driven', '#6fe07f');
    if (S.paused) { g.fillStyle = '#0b0f0d99'; g.fillRect(0, 0, cw, ch); label('PAUSED', cw / 2, ch / 2, 44, '#fffdf4', 'center', 800); }
  }
  function drawFinale() {
    if (!size()) return;
    const t = F.t, u = Math.min(cw / 8, ch / 8.2), gx = cw / 2, gy = ch * 0.7;
    const sky = g.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, '#9fd3f0'); sky.addColorStop(1, '#e8f4ee');
    g.fillStyle = sky; g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#fffdf4'; for (const [x, y, r] of [[0.16, 0.2, 0.6], [0.24, 0.17, 0.8], [0.74, 0.26, 0.7], [0.82, 0.23, 0.5]]) { g.beginPath(); g.ellipse(cw * x, ch * y, u * r, u * r * 0.42, 0, 0, 7); g.fill(); }
    g.fillStyle = '#6aa24a'; g.fillRect(0, gy, cw, ch - gy); g.fillStyle = '#4f8236'; g.fillRect(0, gy, cw, 6);
    // it leans before it goes
    const lean = F.falls ? clamp((t - (F.fallT - 1.1)) / 1.1, 0, 1) : 0, wob = F.falls && t > F.fallT - 1.1 && t < F.fallT ? Math.sin(t * 40) * 2 * lean : 0;
    for (const p of F.parts) {
      const grow = clamp((t - 0.3 - p.i * (1.9 / F.parts.length)) / 0.35, 0, 1);
      if (grow <= 0) continue;
      const w = p.w * u, h = p.h * u * (p.loose ? 1 : ease(grow));
      g.save();
      g.translate(gx + wob, gy);
      if (!p.loose) g.rotate(lean * 0.09);
      g.translate((p.x + p.dx + p.w / 2) * u, -(p.y + p.dy) * u - h / 2);
      g.rotate(p.a);
      g.fillStyle = p.c; g.strokeStyle = INK; g.lineWidth = 3;
      g.beginPath();
      if (p.s === 't') { g.moveTo(-w / 2, h / 2); g.lineTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.closePath(); }
      else if (p.s === 'e') g.ellipse(0, 0, w / 2, h / 2, 0, 0, 7);
      else g.rect(-w / 2, -h / 2, w, h);
      g.fill(); g.stroke();
      g.restore();
    }
    for (const d of F.dust) { g.fillStyle = `rgba(214, 200, 170, ${clamp(d.a, 0, 1)})`; g.beginPath(); g.arc(gx + d.x * u, gy - d.y * u, d.r * u, 0, 7); g.fill(); }
    for (const b of F.bits) { g.save(); g.translate(gx + b.x * u, gy - b.y * u); g.rotate(b.a); g.fillStyle = b.c; g.fillRect(-5, -3, 10, 6); g.restore(); }
  }

  return { init, reset, update, key, grade, parTime, W_SPT, FAIL_CAP, COLLAPSE, get busy() { return !!(P || F) || GROUT.busy; }, get testing() { return !!P || GROUT.busy; }, get active() { return !!(P || F) || (S && S.phase === 'SPT'); },
    get state() { return { P, F }; } };
})();
