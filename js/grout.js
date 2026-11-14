'use strict';
/* Grouting a geotechnical hole. It comes after the last SPT and before the building goes up (js/spt.js starts it and
   is told when it is done). It happens beside the rig, in the 3D scene, watched from outside so the driller can be
   seen (js/world.js, setJob draws the drum, the pump, the hoses, the bag and whoever is up the tower from what this
   says). It uses the SPT's boxes for its words, and the same small drawing of the hole on the left.

     1. 1 in. PVC goes down the hole in 10 ft lengths until it sits on bottom with 5 ft of stick-up. A fitting goes on
        top: tap in the green.
     2. The pump fills the blue drum from the water truck. The player says when: about 80% full, to leave room for the
        cement and the gel. The pump runs on a moment after the call.
     3. The suction hose goes into the drum and a 1 in. hose with a nozzle goes on the pump, so the water goes round
        and round under pressure. One helper holds the nozzle.
     4. The other helper pours: cement first, then bentonite gel. Hold to tip the bag. The longer it is held the faster
        it pours, and the pump can only mix so much: pour too fast and it clumps in the pump.
        A clump while the helper pours: the driller hooks the helper to the winch, sends them to the top of the tower
        (crying, arms and legs going) and takes over the pouring. A clump while the driller pours: the helper comes
        back down, the driller eats his words, and the helper pours again.
     5. The hose goes on the PVC and the grout is pumped to the bottom of the hole. It fills from the bottom up. The
        player stops the pump when it reaches the top. One drum fills 60 ft of hole.
     6. The PVC comes out and the hole is topped off with bentonite. A helper still up the tower is let down.

   S.grout keeps how it went, with a grade out of 100 that is W_GROUT of the hole's grade (js/main.js, closeOut). */
window.GROUT = (() => {
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = k => k * k * (3 - 2 * k);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const css = n => (typeof n === 'number' ? '#' + n.toString(16).padStart(6, '0') : null);
  const INK = '#1b1710';

  const W_GROUT = 0.10;          // grouting's share of the hole's grade
  const AIM = 0.80, AIM_TOL = 0.04;      // how full the drum should be, and how close counts as right
  const FILL_PEN = 200, FILL_MAX = 25;   // points off for every 100% the drum is out, and the most that can cost
  const CLUMP_PEN = 12;          // points off each time the pump clumps up
  const FUMBLE_PEN = 4;          // points off for cross-threading the fitting
  const PUMP_MAX = 12;           // the most a bad stop on the grout pump can cost (spilled over the top, or left short)
  const BATCH_FT = 60;           // ft of hole one drum of grout fills
  const STICK = 5;               // ft of PVC left above the ground
  const POUR = 0.25;             // a bag tipped right over empties in 1 / POUR seconds
  const CLUMP_IN = { cement: 6, gel: 9 };      // how fast each one builds toward a clump: the gel is the touchy one
  const SAFE = 0.4;              // the share of a full pour the pump can keep mixing for ever, on hole 1
  const UP_YOU_GO = ['That is it. You plugged my pump. Up you go.', 'Clumped. Right. You are going up the tower.', 'Look at my pump. LOOK AT IT. Hook on.', 'How hard is it to pour slow? Up the tower with you.'];
  const WAAH = ['WAAAH!', 'Let me down!', 'I am sorry!', 'I can see my house from here!', 'It was the bag!', 'I want my mom!', 'WAAAAAH!', 'Never again, boss!'];
  const EAT_IT = ['Well. I guess you were not that useless after all. Come down.', 'Fine. It is harder than it looks. Come down.', 'Not a word. Get down here and pour.', 'Okay. Maybe the bag is the problem. Come down.'];
  const BACK = ['Not so easy, is it, boss?', 'Told you it was the bag.', 'Slow and steady, boss. Watch.', 'I am never forgiving you for that.'];
  const DOWN = ['Job is done. Lower away.', 'Alright. You can come down now.', 'Grout is in. Let them down.'];

  let APP, E = null, S = null, G = null, g = null, cw = 0, ch = 0, hold = false, onDone = null;
  const faces = new Map(), last = {};

  function log(msg, lvl) { S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg, lvl: lvl || 'info' }); if (S.log.length > 80) S.log.pop(); }
  function init(app) {
    APP = app;
    E = { root: $('spt'), cv: $('sptCv'), title: $('sptTitle'), step: $('sptStep'), q: $('sptQ'), qTitle: $('sptQTitle'), qHow: $('sptQHow'), zone: $('sptZone'), mark: $('sptMark'), time: $('sptTime'),
      talk: $('sptTalk'), face: $('sptFace'), who: $('sptWho'), say: $('sptSay'), ask: $('sptAsk'), go: $('sptGo'), chat: $('sptChat'), cap: $('sptCap') };
    g = E.cv.getContext('2d');
    E.root.addEventListener('pointerdown', e => { if (!G || e.target.closest('button')) return; AUDIO.init(); hold = true; tap(); });
    for (const ev of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(ev, () => { hold = false; });
    window.addEventListener('keyup', e => { if (e.code === 'Space') hold = false; });
    E.go.addEventListener('click', () => { if (G) { AUDIO.init(); call(); } });
  }
  function reset() { G = null; hold = false; onDone = null; if (E) E.go.textContent = 'Start the hammer'; }
  function faceOf(look, key) {
    if (!look) return '';
    if (!faces.has(key)) { let src = ''; try { src = WORLD.portraits([look], 160, 180)[0] || ''; } catch (e) { src = ''; } faces.set(key, src); }
    return faces.get(key);
  }
  // the three people, in the colours they wear in the game
  function people() {
    const L = APP.looks || {}, c = (look, d) => css(look && look.suit) || css(look && look.torso) || d, h = (look, d) => css(look && look.hat) || d;
    return { helper: { name: S.crew[0].name, suit: c(L.lead, '#1f4f8a'), hat: h(L.lead, '#f2c230'), skin: css(L.lead && L.lead.skin) || '#e6b48c', look: L.lead },
      nozzle: { name: S.crew[1].name, suit: c(L.core, '#1f4f8a'), hat: h(L.core, '#f4f4ee'), skin: css(L.core && L.core.skin) || '#cd9868', look: L.core },
      driller: { name: S.driller || 'The driller', suit: c(L.driller, '#2a5aa0'), hat: h(L.driller, '#f6f6f1'), skin: css(L.driller && L.driller.skin) || '#e6b48c', look: L.driller } };
  }
  function start(S_, cb) {
    S = S_; onDone = cb;
    const k = S.site.hard || 0, D = SIM.TARGET;
    G = { phase: 'pvc', t: 0, k, D, T: 0, who: people(), pvc: 0, fit: false, q: null, fumbles: 0,
      water: 0, fillRate: lerp(1 / 6.5, 1 / 4.2, k), lag: 0, called: false, over: false, hose: '', jet: false,
      A: 0, U: 0, rate: 0, pourer: 'helper', clumps: 0, mixed: 0, mixRate: POUR * SAFE * lerp(1, 0.75, k), ramp: lerp(1.3, 2.1, k),
      cut: null, up: 0, meK: 0, level: D, pumping: false, spilled: 0, short: 0, cap: 0, sayT: 0, cry: '', cryT: 0.5, splash: 0 };
    hold = false;
    for (const key in last) delete last[key];
    document.body.classList.add('spt-job');
    E.root.hidden = false; E.root.dataset.fin = ''; E.root.dataset.sub = '';
    E.ask.hidden = true; E.chat.hidden = true; E.cap.hidden = true; E.talk.hidden = true; E.q.hidden = true; E.go.hidden = true;
    E.title.textContent = `Grout the hole: ${D} ft`;
    PANEL.setHands(false);
    log(`All the tests are done. Time to grout ${S.site.well}: 1 in. PVC to the bottom, then mix a drum of grout.`);
    S.sfx.push('ok');
  }
  function say(who, text, dur) { G.sayWho = who; G.sayText = text; G.sayT = dur || 3; }

  // ---------- the prompts: the fitting (tap in the green), the bentonite (tap fast) ----------
  function newQ(type, label, retry) {
    const tn = SHOP.tune(S);
    return { type, label, state: 'ready', hold: retry ? 0.5 : 0.7, t: 0, prog: 0, taps: 0, limit: type === 'mash' ? tn.mashTime : tn.aimTime, need: tn.taps, sweep: tn.sweep, zc: 0.22 + Math.random() * 0.56, zw: tn.zone, pos: 0, ph: Math.random() * 2, why: '' };
  }
  function failQ() {
    const q = G.q;
    q.state = 'fail'; q.hold = 1.3; S.sfx.push('clank');
    if (q.type === 'timing') { q.why = 'Cross-threaded it!'; if (!SHOP.lucky(S)) G.fumbles++; } else q.why = 'Again!';
  }
  function tap() {
    if (!G || S.paused) return;
    const q = G.q;
    if (!q || q.state !== 'go') return;
    if (q.type === 'mash') { q.taps++; q.prog = clamp(q.taps / q.need, 0, 1); S.sfx.push('switch'); }
    else if (Math.abs(q.pos - q.zc) <= q.zw / 2) q.prog = 1; else failQ();
  }
  function updateQ(dt) {
    const q = G.q;
    if (q.state === 'ready') { q.hold -= dt; if (q.hold <= 0) q.state = 'go'; }
    else if (q.state === 'go') {
      q.t += dt;
      if (q.type === 'timing') { const u = (q.ph + q.t * q.sweep) % 2; q.pos = u < 1 ? u : 2 - u; }
      if (q.prog >= 1) { q.state = 'done'; q.hold = 0.35; S.sfx.push('ok'); }
      else if (q.t >= q.limit) failQ();
    } else if (q.state === 'fail') { q.hold -= dt; if (q.hold <= 0) G.q = newQ(q.type, q.label, true); }
    else if (q.state === 'done') { q.hold -= dt; if (q.hold <= 0) { G.q = null; return true; } }
    return false;
  }

  // ---------- the steps ----------
  function enter(phase) {
    G.phase = phase; G.t = 0;
    if (phase === 'fit') G.q = newQ('timing', 'Screw the fitting on the PVC');
    else if (phase === 'hose') { G.hose = 'truck'; say(G.who.nozzle.name, 'Pump is hooked to the water truck. Say when, boss.', 3.2); S.sfx.push('clank'); }
    else if (phase === 'swap') { G.hose = 'drum'; S.sfx.push('clank'); }
    else if (phase === 'cement' || phase === 'gel') { G.A = 0; G.U = 0; G.rate = 0; hold = false; say(G.who[G.pourer].name, phase === 'cement' ? 'Cement first. Nice and slow.' : 'Now the gel. Slower still: it clumps if you look at it wrong.', 3); }
    else if (phase === 'mixed') { say(G.who.nozzle.name, 'That is grout. Hose is going on the PVC.', 2.6); S.sfx.push('done'); }
    else if (phase === 'pump') { G.hose = 'pvc'; G.jet = false; G.called = false; }
    else if (phase === 'top') G.q = newQ('mash', 'Top it off with bentonite');
    else if (phase === 'done') { G.cap = 1; S.sfx.push('done'); if (G.up > 0.01) { G.cut = { kind: 'down', t: 0 }; say(G.who.driller.name, pick(DOWN), 2.6); } }
  }
  // the player says "that is full" (the drum) or "stop the pump" (the grout)
  function call() {
    if (!G || S.paused || G.called || G.cut) return;
    if (G.phase === 'fill' && G.t > 0.8) { G.called = true; G.lag = 0.16 + 0.14 * G.k; S.sfx.push('switch'); }
    else if (G.phase === 'pump' && G.pumping) { G.called = true; G.lag = 0.2 + 0.12 * G.k; S.sfx.push('switch'); }
  }
  function clumped() {
    G.clumps++; G.rate = 0; G.U = 0; hold = false; G.jet = false;
    S.sfx.push('alarm'); S.sfx.push('clank');
    log(`${G.who[G.pourer].name} poured the ${G.phase === 'gel' ? 'gel' : 'cement'} too fast and it clumped up in the pump.`, 'crit');
    if (G.pourer === 'helper') { G.cut = { kind: 'hoist', t: 0 }; say(G.who.driller.name, pick(UP_YOU_GO), 3.4); }
    else { G.cut = { kind: 'lower', t: 0 }; say(G.who.driller.name, pick(EAT_IT), 3.6); }
  }
  // the bits with nobody at the controls: up the tower, back down, and down at the end
  function updateCut(dt) {
    const c = G.cut; c.t += dt;
    if (c.kind === 'hoist') {
      G.meK = clamp(c.t / 1.4, 0, 1);               // the driller walks round to the drum
      if (c.t > 1.5) G.up = clamp((c.t - 1.5) / 2.2, 0, 1);
      if (c.t > 1.5 && c.t - dt <= 1.5) S.sfx.push('clank');
      if (c.t > 4.4) { G.cut = null; G.pourer = 'driller'; G.jet = true; say(G.who.driller.name, 'Give me that bag. This is how it is done.', 2.6); }
    } else if (c.kind === 'lower') {
      if (c.t > 1.4) G.up = clamp(1 - (c.t - 1.4) / 2.0, 0, 1);
      if (c.t > 2.5) G.meK = clamp(1 - (c.t - 2.5) / 1.5, 0, 1);      // ...and back to the console
      if (c.t > 4.2) { G.cut = null; G.pourer = 'helper'; G.jet = true; G.up = 0; say(G.who.helper.name, pick(BACK), 2.6); }
    } else if (c.kind === 'down') {
      if (c.t > 0.8) G.up = clamp(1 - (c.t - 0.8) / 2.0, 0, 1);
      if (c.t > 3.0) { G.cut = null; G.up = 0; }
    }
  }
  function updateJob(dt) {
    G.t += dt; G.T += dt;
    if (G.sayT > 0) G.sayT -= dt;
    if (G.splash > 0) G.splash -= dt;
    // a helper up the tower has things to say about it
    if (G.up > 0.5) { G.cryT -= dt; if (G.cryT <= 0) { G.cry = pick(WAAH); G.cryT = 1.6 + Math.random() * 1.4; } } else G.cry = '';
    if (G.cut) { updateCut(dt); return; }
    switch (G.phase) {
      case 'pvc':
        G.pvc = Math.min(G.D, G.pvc + dt * Math.max(8, G.D / 2.4));
        if (G.pvc >= G.D && G.t > 1.2) enter('fit');
        break;
      case 'fit': if (updateQ(dt)) { G.fit = true; enter('hose'); } break;
      case 'hose': if (G.t > 1.6) enter('fill'); break;
      case 'fill':
        if (G.t > 0.6) G.water = Math.min(1, G.water + G.fillRate * dt);
        if (G.called) G.lag -= dt;
        if (G.water >= 1 || (G.called && G.lag <= 0)) {
          G.over = G.water >= 1; G.called = false;
          const w = G.water;
          say(G.who.nozzle.name, G.over ? 'It is running over, boss! Shutting it off.' : w < AIM - 0.1 ? 'That is a bit shy, boss. It will be thick.' : w > AIM + 0.08 ? 'That is a lot of water, boss. Not much room left.' : 'About 80. That will do nicely.', 2.8);
          if (G.over) { S.sfx.push('alarm'); G.splash = 1.2; }
          log(`The drum was filled to ${Math.round(w * 100)}%${G.over ? ': it ran over' : ''}. The aim is about ${Math.round(AIM * 100)}%.`, Math.abs(w - AIM) <= AIM_TOL ? 'good' : 'warn');
          enter('swap');
        }
        break;
      case 'swap': if (G.t > 1.3) G.jet = true; if (G.t > 2.6) enter('cement'); break;
      case 'cement': case 'gel': {
        const amt = G.phase === 'gel' ? 0.45 : 1;                 // the gel is a smaller bag
        G.rate = hold && G.A < amt ? Math.min(1, G.rate + G.ramp * dt) : Math.max(0, G.rate - 3.2 * dt);
        const dA = Math.min(amt - G.A, G.rate * POUR * dt);       // what went in the drum this moment
        G.A += dA;
        G.U = Math.max(0, G.U + dA * CLUMP_IN[G.phase] - G.mixRate * CLUMP_IN.cement * dt);
        G.mixed = (G.phase === 'gel' ? 1 : 0) * 0.7 + (G.A / amt) * (G.phase === 'gel' ? 0.3 : 0.7);
        if (G.U >= 1) { clumped(); break; }
        if (G.A >= amt - 1e-6 && G.rate <= 0.02) { if (G.phase === 'cement') enter('gel'); else enter('mixed'); }
        break;
      }
      case 'mixed': if (G.t > 2.2) enter('pump'); break;
      case 'pump':
        if (G.t > 1.0 && !G.pumping && G.level >= G.D) { G.pumping = true; S.sfx.push('ok'); }
        if (G.pumping) {
          G.level -= (G.D / 9) * dt;
          if (G.called) G.lag -= dt;
          if (G.level <= 0) { G.spilled += dt; G.level = 0; G.splash = 0.4; }
          if ((G.called && G.lag <= 0) || G.spilled > 1.1) {
            G.pumping = false; G.called = false; G.short = Math.max(0, G.level);
            say(G.who.nozzle.name, G.spilled > 0.05 ? 'It is coming out the top! Shut it off!' : G.short > 2.5 ? `That is ${G.short.toFixed(0)} ft short, boss. The bentonite will have to make it up.` : 'Grout at surface. Good.', 2.8);
            if (G.spilled > 0.05) S.sfx.push('alarm');
            enter('pull');
          }
        }
        break;
      case 'pull':
        if (G.t > 0.9) { G.fit = false; G.hose = ''; G.pvc = Math.max(0, G.pvc - dt * Math.max(10, G.D / 1.6)); }
        if (G.pvc <= 0 && G.t > 1.4) enter('top');
        break;
      case 'top': if (updateQ(dt)) enter('done'); break;
      case 'done': if (G.t > 1.8 && !G.cut) finish(); break;
    }
  }
  function score(o) {
    const fill = Math.min(FILL_MAX, Math.max(0, Math.abs(o.fill - AIM) - AIM_TOL) * FILL_PEN) + (o.over ? 5 : 0);
    const pump = o.spilled > 0.05 ? PUMP_MAX : Math.min(PUMP_MAX, Math.max(0, o.short - 2.5) * 2);
    return Math.round(clamp(100 - fill - o.clumps * CLUMP_PEN - o.fumbles * FUMBLE_PEN - pump, 0, 100));
  }
  function finish() {
    const o = { fill: G.water, over: G.over, clumps: G.clumps, fumbles: G.fumbles, spilled: G.spilled, short: G.short, pourer: G.pourer, helper: G.who.helper.name, driller: G.who.driller.name, depth: G.D, drums: Math.ceil(G.D / BATCH_FT) };
    o.score = score(o);
    S.grout = o;
    log(`${S.site.well} is grouted to surface and topped off with bentonite.`, 'good');
    const cb = onDone;
    G = null; onDone = null; hold = false;
    E.chat.hidden = true; WORLD.setJob(null);
    E.go.textContent = 'Start the hammer'; E.go.hidden = true; E.q.hidden = true; E.talk.hidden = true;
    if (cb) cb();
  }
  const parTime = () => 75;      // rough seconds the grouting takes a player, for Aaron's deadline

  // ---------- every frame ----------
  function update(S_, dt) {
    if (!G) return;
    S = S_;
    const off = APP.away || APP.menu || APP.fly;
    E.root.hidden = off;
    if (off) { hold = false; return; }
    if (!S.paused) updateJob(dt);
    if (G) show();
  }
  // Space holds the bag tipped, taps the prompts, and makes the calls (Enter too)
  function key(e) {
    if (!G) return false;
    if (e.code === 'Escape') return false;
    if (e.code === 'Space') { hold = true; if (!e.repeat) { tap(); call(); } return true; }
    if (e.code === 'Enter' && !e.repeat) { tap(); call(); }
    return true;
  }

  // ---------- the picture ----------
  const set = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };
  const STEPS = { pvc: '1 in. PVC goes down in 10 ft lengths until it sits on bottom, with 5 ft of stick-up.', fit: 'Tap when the marker is in the green to screw the fitting on.', hose: 'The pump is hooked to the water truck.',
    fill: 'Fill the drum to about 80%. Leave room for the cement and the gel. The pump runs on a moment after you call it.', swap: 'Suction hose into the drum, nozzle on the pump: now the water goes round under pressure.',
    cement: 'Hold to tip the bag. The longer you hold, the faster it pours. Too fast and it clumps in the pump.', gel: 'Hold to tip the bag. The gel clumps much sooner than the cement: short pours.', mixed: 'Mixed. One drum fills 60 ft of hole.',
    pump: 'The grout goes down the PVC and fills the hole from the bottom. Stop the pump when it reaches the top.', pull: 'The PVC comes out.', top: 'Tap fast to top the hole off with bentonite.', done: 'The hole is grouted.' };
  function show() {
    const q = G.q, pour = (G.phase === 'cement' || G.phase === 'gel') && !G.cut;
    set('step', G.cut ? (G.cut.kind === 'hoist' ? 'The pump is clumped solid. Somebody is going up the tower.' : G.cut.kind === 'lower' ? 'Clumped again. This time it was the driller.' : 'Down they come.') : STEPS[G.phase] || '', v => { E.step.textContent = v; });
    set('q', pour ? 'pour' + G.phase + G.pourer : q ? q.type + q.label + q.state : '', () => {
      E.q.hidden = !(q || pour);
      if (pour) {
        E.q.dataset.type = 'pour'; E.q.dataset.state = 'go';
        E.qTitle.textContent = `${G.who[G.pourer].name} pours the ${G.phase === 'gel' ? 'gel' : 'cement'}`;
        E.qHow.textContent = APP.phone ? 'Hold to pour. Keep the marker out of the red.' : 'Hold the mouse button or Space to pour. Keep the marker out of the red.';
        E.zone.style.left = '0'; E.zone.style.width = '62%';
      } else if (q) {
        E.q.dataset.type = q.type; E.q.dataset.state = q.state;
        E.qTitle.textContent = q.state === 'fail' ? q.why : q.state === 'done' ? 'Got it!' : q.label;
        E.qHow.textContent = q.state === 'ready' ? 'Get ready…' : q.type === 'mash' ? (APP.phone ? 'Tap as fast as you can' : 'Tap, or hammer the Space bar') : (APP.phone ? 'Tap when the marker is in the green' : 'Tap, or press Space, when the marker is in the green');
        if (q.type === 'timing') { E.zone.style.left = ((q.zc - q.zw / 2) * 100).toFixed(1) + '%'; E.zone.style.width = (q.zw * 100).toFixed(1) + '%'; }
      }
    });
    if (pour) {
      E.mark.style.left = (clamp(G.U, 0, 1) * 100).toFixed(1) + '%';
      E.time.style.width = (G.A / (G.phase === 'gel' ? 0.45 : 1) * 100).toFixed(1) + '%';
    } else if (q) {
      if (q.type === 'timing') E.mark.style.left = (q.pos * 100).toFixed(1) + '%';
      else { E.zone.style.left = '0'; E.zone.style.width = (q.prog * 100).toFixed(1) + '%'; E.mark.style.left = '-20px'; }
      E.time.style.width = (q.state === 'go' ? clamp(1 - q.t / q.limit, 0, 1) * 100 : 100).toFixed(1) + '%';
    }
    const talk = G.sayT > 0;
    set('talk', talk ? G.sayWho + '|' + G.sayText : '', () => {
      E.talk.hidden = !talk;
      if (!talk) return;
      const who = Object.values(G.who).find(p => p.name === G.sayWho), src = who ? faceOf(who.look, 'g:' + who.name) : '';
      E.face.hidden = !src; if (src) E.face.src = src;
      E.who.textContent = G.sayWho; E.say.textContent = G.sayText;
    });
    set('chat', G.cry || '', v => { E.chat.hidden = !v; if (v) E.chat.textContent = `${G.who.helper.name}, up the tower: "${v}"`; });
    const btn = G.cut ? '' : G.phase === 'fill' && G.t > 0.8 && !G.called ? 'That is full' : G.phase === 'pump' && G.pumping && !G.called ? 'Stop the pump' : '';
    set('go', btn, v => { E.go.hidden = !v; if (v) E.go.textContent = v; });
    scene3d();
    draw();
  }
  function size() {
    const w = E.cv.clientWidth, h = E.cv.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return false;
    if (w !== cw || h !== ch || E.cv.width !== Math.round(w * d)) { cw = w; ch = h; E.cv.width = Math.round(w * d); E.cv.height = Math.round(h * d); }
    g.setTransform(d, 0, 0, d, 0, 0);
    g.lineJoin = 'round'; g.lineCap = 'butt';
    return true;
  }
  function box(x, y, w, h, fill, lw) { g.fillStyle = fill; g.fillRect(x, y, w, h); g.lineWidth = lw || 3; g.strokeStyle = INK; g.strokeRect(x, y, w, h); }
  function label(t, x, y, px, col, align, weight) { g.font = `${weight || 700} ${px}px 'Barlow Condensed', 'Arial Narrow', sans-serif`; g.fillStyle = col || INK; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(t, x, y); }
  // tell the 3D scene what there is to see (js/world.js, setJob)
  function scene3d() {
    const c = G.cut, ph = G.phase, pourPh = ph === 'cement' || ph === 'gel';
    const station = ph === 'hose' || ph === 'fill' || ph === 'swap' || pourPh || ph === 'mixed';
    const topFt = G.pvc > 0.05 ? (ph === 'pvc' || ph === 'pull' ? STICK + (1 - G.pvc / G.D) * 9 : STICK) : -99;
    const drained = ph === 'pump' || ph === 'pull' || ph === 'top' || ph === 'done' ? clamp((G.D - G.level) / BATCH_FT, 0, 1) : 0;
    WORLD.setJob({ kind: 'grout', cine: true, far: G.up > 0.02 || (!!c && c.kind === 'hoist' && c.t > 1.0), station,
      pvcTop: topFt, fit: G.fit, water: G.water + 0.08 * G.mixed, mixed: G.mixed, drained, hose: G.hose, jet: G.jet && G.hose === 'drum', splash: G.splash > 0 && station,
      pour: pourPh && !c ? ph : '', rate: G.rate, pourer: G.pourer, up: G.up, meK: G.meK, meArm: !!c && (c.kind === 'hoist' ? c.t > 1.3 && c.t < 3.9 : c.t > 0.3 && c.t < 3.2),
      cap: G.cap > 0, spill: ph === 'done' ? 0 : G.spilled, hold: ph === 'pvc' || ph === 'fit' || ph === 'pull' || ph === 'top', work: !!G.q && G.q.state === 'go',
      talk: G.sayT > 0 ? (G.sayWho === G.who.driller.name ? 'me' : G.sayWho === G.who.helper.name ? 'lead' : 'core') : '' });
  }

  // the hole from the side: the ground, the PVC, the grout coming up from the bottom, the bentonite on top
  function drawStrip(x0, w) {
    const top = 14, bot = ch - 14, D = SIM.TARGET + 3, up = 7;
    const s = (bot - top - 22) / (D + up), gy = top + 22 + up * s, cx = x0 + w * 0.6, hw = clamp(w * 0.13, 12, 22);
    g.fillStyle = '#cfe6ef'; g.fillRect(x0, top, w, gy - top);
    for (const L of SIM.LAYERS) {
      const y1 = gy + L.top * s, y2 = gy + Math.min(L.bot, D) * s;
      if (y2 <= y1) continue;
      g.fillStyle = L.color; g.fillRect(x0, y1, w, y2 - y1);
      g.strokeStyle = '#0005'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0 + w, y1); g.stroke();
      if (y2 - y1 > 13) label(L.short, x0 + 5, (y1 + y2) / 2, 12, '#fffdf4', 'left', 800);
    }
    g.fillStyle = '#241d18'; g.fillRect(cx - hw / 2, gy, hw, G.D * s);
    if (G.level < G.D) { g.fillStyle = '#9a9c94'; g.fillRect(cx - hw / 2, gy + G.level * s, hw, (G.D - G.level) * s); }
    if (G.cap > 0) { g.fillStyle = '#c9b79a'; g.fillRect(cx - hw / 2, gy, hw, Math.max(4, 1.5 * s)); }
    if (G.pvc > 0.05) { g.strokeStyle = '#f4f4ee'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, gy + (G.pvc - G.D - STICK) * s); g.lineTo(cx, gy + G.pvc * s); g.stroke(); }
    for (let d = 0; d <= SIM.TARGET; d += 5) { const y = gy + d * s; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + w - 8, y); g.lineTo(x0 + w, y); g.stroke(); if (d % 10 === 0 || SIM.TARGET <= 25) label(String(d), x0 + w - 11, y, 11, '#fffdf4', 'right', 800); }
    g.fillStyle = '#5a8a3a'; g.fillRect(x0, gy - 3, w, 4);
    g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(x0, top, w, bot - top);
    label('THE HOLE', x0 + 6, top + 12, 12, INK, 'left', 800);
  }

  function draw() {
    if (!size()) return;
    g.clearRect(0, 0, cw, ch);
    drawStrip(Math.max(10, cw * 0.012), clamp(cw * 0.2, 118, 230));
    if (S.paused) { g.fillStyle = '#0b0f0d99'; g.fillRect(0, 0, cw, ch); label('PAUSED', cw / 2, ch / 2, 44, '#fffdf4', 'center', 800); }
  }

  return { init, reset, start, update, key, parTime, W_GROUT, AIM, get busy() { return !!G; }, get state() { return G; } };
})();
