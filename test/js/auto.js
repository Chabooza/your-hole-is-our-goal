'use strict';
/* Thumb-pad mode: the autopilot. The crew and the rig do every bit of pipe handling by themselves, working the same
   controls a player would in the full game. The player is handed two jobs: coring the run (push and spin) and
   driving the casing (push, spin and the pump). The script is a generator: it is moved on one drilling-model
   step at a time, so it runs inside the normal game loop. */
window.AUTO = (() => {
  const A = SIM.ACT;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let S = null, c = null, gen = null;
  const st = { manual: '', msg: '', focus: 'head', stage: '', failed: '', qte: null };
  const pad = { feed: 0, rot: 0 };            // the two thumb pads, 0..1
  const dale = () => S.crew[0];

  function say(msg, focus) { st.msg = msg; if (focus) st.focus = focus; }
  function* until(label, fn, max) {
    st.stage = label;
    const t0 = S.t; max = (max || 400) * 2;
    while (!fn()) {
      if (S.done) throw new Error('DONE');
      if (S.t - t0 > max) throw new Error(`The crew got stuck at "${label}".`);
      yield;
    }
  }
  // A quick-time event: the game holds still until the player has made the gesture. A miss is handled by the screen
  // (the pipe drops, the helpers panic, the player tries again); the script only carries on once it is done.
  function* qte(type, label, pipe) { st.qte = { type, label, pipe }; yield; while (st.qte) yield; }
  function* wait(s) { const t0 = S.t; while (S.t - t0 < s) yield; }
  function* order(id) {
    yield* until('dale free for ' + id, () => !dale().task, 200);
    for (let n = 0; !SIM.order(S, id); n++) {
      if (n > 20) throw new Error(`Dale would not take the call "${id}".`);
      yield* wait(1.5);
    }
  }
  const neutral = () => { c.feed = 0; c.rot = 0; c.winch = 0; c.slide = 0; c.arm = 0; c.brk = 0; };

  function* headTo(y) {
    c.feed = S.head.y > y ? 0.8 : -1;
    yield* until('head to ' + y, () => Math.abs(S.head.y - y) < 0.04 || (c.feed > 0 && S.head.y <= y) || (c.feed < 0 && S.head.y >= y), 60);
    c.feed = 0;
  }
  function* land(what) { c.feed = 0.3; yield* until('land on ' + what, () => S.contact === what, 90); c.feed = 0; }
  function* slideTo(x) {
    A.setSide(S, x > 0 || (x === 0 && S.head.x > 0));
    c.slide = x > S.head.x ? 1 : -1;
    yield* until('slide to ' + x, () => Math.abs(S.head.x - x) < 0.005, 30);
    c.slide = 0;
  }
  function* spin(dir, label, fn) { c.rot = dir * 0.3; yield* until(label, fn, 40); c.rot = 0; }
  function* headOff() { A.setClampB(S, true); yield* spin(-1, 'head off', () => !S.head.conn); }
  function* sonicOff() { A.setOsc(S, false); yield* until('sonic spin down', () => S.head.hz < 1, 20); }

  function* breakJoint() {
    say('Breaking the joint with the clamps.', 'clamps');
    A.setClampB(S, true);
    let n = 0;
    while (!(S.jt && S.jt.tight <= 0)) {
      if (++n > 5) throw new Error('A joint would not break.');
      A.setClampT(S, false);
      c.brk = 1; yield* until('wind clamp', () => S.tc.ang >= 0.999, 20);
      A.setClampT(S, true);
      c.brk = -1; yield* until('break stroke', () => S.tc.ang <= 0.001 || (S.jt && S.jt.tight <= 0), 20);
    }
    c.brk = 0; A.setClampT(S, false);
  }

  // ---- the player's two jobs ----
  // While the player drills, the rig looks after itself: the engine, the holdback (so the pad is pure push) and the
  // sonic frequency. The head stays in tune unless the player leans on it too hard, then it slides off resonance.
  function tend(kind) {
    if (!S.engine.on) A.engineStart(S);
    const L = SIM.layerAt((kind === 'core' ? Math.max(0, S.core.bit) : S.casing.depth) + 0.05);
    let detune = 0;
    if (kind === 'core') {
      c.holdback = clamp((SIM.HEAD_W + SIM.CORE_WPF * S.core.len) / SIM.AREA / SIM.HB_MAX, 0, 1);
      detune = 12 * Math.max(0, S.wob / L.wob - 1.4);
    }
    c.oscSet = clamp(S.fr + detune, 0, 150);
    if (!c.oscOn && !S.head.lock && S.engine.on) A.setOsc(S, true);
    c.feed = pad.feed > 0.04 ? pad.feed : 0;
    c.rot = pad.rot > 0.04 ? pad.rot : 0;
    // stuck, and the player has let go of PUSH: ease the string back up so the sonic can work it free
    if (S.stuck > 0.05 && c.feed === 0 && S.head.y < SIM.MAST_TOP - 0.5) c.feed = -0.25;
  }
  function* coreRun() {
    A.setClampB(S, false); A.setClampT(S, false);
    c.feedSet = 1; pad.feed = 0; pad.rot = 0;
    A.setOsc(S, true);
    st.manual = 'core'; say('Your turn: core the run.', 'drill');
    yield* until('core run', () => { tend('core'); return SIM.rodDown(S); }, 1e9);
    st.manual = ''; neutral(); c.holdback = 0; c.feedSet = 0.6; pad.feed = 0; pad.rot = 0;
    say('Rod is down. Sonic off.', 'head');
    yield* sonicOff();
  }

  function* casing() {
    say('Unscrewing the head from the rods.', 'head');
    yield* headOff();
    while (S.casing.depth < S.hole.depth - 0.25) {
      say('Head up to the top of the mast.', 'head');
      yield* headTo(16.3);
      say('The arm stands a casing joint up beside the mast.', 'rack');
      c.arm = 1; yield* until('arm up', () => S.arm.ang >= 0.999, 30); c.arm = 0;
      yield* slideTo(1);
      say('Threading the head into the casing joint.', 'head');
      yield* land('arm');
      yield* spin(1, 'thread into casing', () => S.head.conn === 'pipe' && S.head.eng >= 1);
      yield* headTo(15.5);
      say('Bringing the joint back over the hole.', 'head');
      yield* slideTo(0);
      c.arm = -1; yield* land('hang'); yield* until('arm down', () => S.arm.ang <= 0.001, 30); c.arm = 0;
      say('Making up the casing joint.', 'clamps');
      A.setClampB(S, true);
      yield* qte('circle', 'Make up the casing joint', 'casing');
      yield* spin(1, 'make up casing', () => S.head.conn === 'casing');
      A.setClampB(S, false);
      c.feedSet = 0.6; c.pumpSet = 0.55; pad.feed = 0; pad.rot = 0;
      A.setOsc(S, true);
      st.manual = 'casing'; say('Your turn: drive the casing down.', 'drill');
      yield* until('override', () => { tend('casing'); return S.casing.depth >= S.hole.depth - 0.03 || S.head.y <= SIM.MAST_BOT + 0.02; }, 1e9);
      st.manual = ''; neutral(); pad.feed = 0; pad.rot = 0;
      A.setPump(S, false);
      say('Casing is down. Pump and sonic off.', 'head');
      yield* sonicOff();
      yield* headOff();
    }
    say('Head back onto the rods.', 'head');
    yield* headTo(SIM.coreTop(S) + 1);
    yield* land('core');
    yield* spin(1, 'thread onto rods', () => SIM.attached(S));
  }

  function* barrelOnHead() {
    say('Head back to centre and onto the barrel.', 'head');
    c.winch = 1; yield* until('hook clear', () => S.winch.y >= S.head.y + SIM.HOOK_CLEAR + 0.2, 60); c.winch = 0;
    if (S.head.x !== 0) yield* slideTo(0);
    yield* land('core'); A.setClampB(S, true);
    yield* spin(1, 'thread onto barrel', () => SIM.attached(S));
  }

  function* tripOut() {
    if (S.water.tank < SIM.TANK_CAP * 0.6 && !S.water.truckAway) SIM.order(S, 'REFILL');     // Tess tops the tank up while the rods come out
    if (SIM.rodsIn(S) % 2) {                        // odd: take a single off with the head
      say('Pulling the top rod up to the clamps.', 'head');
      A.setClampB(S, false);
      c.feed = -0.7; yield* until('joint to clamps', () => SIM.coreTop(S) >= 12.6, 60); c.feed = 0;
      yield* breakJoint();
      say('Spinning the rod out.', 'clamps');
      yield* spin(-1, 'spin rod out', () => !!S.hang);
      A.setClampT(S, true);
      yield* spin(-1, 'head off rod', () => !!S.loose);
      yield* headTo(Math.min(16.4, S.loose.bot + S.loose.len + 1.2));
      say('Dale carries the single to the sawhorses.', 'clamps');
      yield* order('GRAB'); yield* until('dale has it', () => S.loose && S.loose.dale, 60);
      A.setClampT(S, false);
      yield* until('dale done', () => !dale().task, 60);
      say('Head back onto the rods.', 'head');
      yield* land('core'); yield* spin(1, 'back on string', () => SIM.attached(S));
    }
    if (SIM.rodsIn(S) >= 2) {
      A.setClampB(S, false);
      const tgt = S.core.bit - 2;
      if (S.core.bit > S.hole.depth - 1.5) { say('Raising the rods 2 ft.', 'head'); c.feed = -0.5; yield* until('raise 2 ft', () => S.core.bit <= tgt, 30); c.feed = 0; }
      say('Head off the rods and slid to the left.', 'head');
      yield* headOff();
      yield* headTo(S.head.y + 1);
      yield* slideTo(-1);
      say('Winch hook down. Dale hooks up.', 'clamps');
      c.winch = -1; yield* until('hook down', () => S.winch.y <= SIM.coreTop(S) + 0.8, 60); c.winch = 0;
      yield* order('HOOK'); yield* until('hooked', () => S.winch.conn === 'core', 60);
      while (SIM.rodsIn(S) >= 2) {
        say('Pulling a 20 ft stand on the winch.', 'mast');
        A.setClampB(S, false);
        c.winch = 0.45; yield* until('pull stand', () => SIM.coreTop(S) >= 22.6, 120); c.winch = 0;
        yield* breakJoint();
        say('Dale spins the stand out with the chain wrench.', 'clamps');
        yield* order('WRENCH'); yield* until('spun out', () => !!S.stand, 60);
        say('Laying the stand on the sawhorses.', 'horses');
        c.winch = 0.3; yield* until('lift clear', () => S.stand.free, 20);
        c.winch = -1; yield* until('lay out', () => !S.stand, 60); c.winch = 0;
        yield* until('dale done', () => !dale().task, 60);
        if (SIM.rodsIn(S) >= 2) { say('Dale hooks up the next stand.', 'clamps'); yield* order('HOOK'); yield* until('hooked', () => S.winch.conn === 'core', 60); }
      }
      yield* barrelOnHead();
    }
    say('Pulling the core barrel out of the hole.', 'head');
    A.setClampB(S, false);
    c.feed = -0.6; yield* until('barrel out', () => S.head.y >= 16.45, 80); c.feed = 0;
    say('Tilting the barrel out. Tess catches the core.', 'tess');
    A.setTilt(S, true); yield* until('tilt out', () => S.phase === 'EXTRUDE', 30);
    c.oscSet = 60; A.setOsc(S, true);
    yield* until('extrude', () => S.phase !== 'EXTRUDE', 240);
    yield* sonicOff();
  }

  function* stab() {
    const len = S.core.len;
    yield* headTo(16.4);
    say('Dale stabs a rod.', 'clamps');
    yield* order('STAB'); yield* until('rod stabbed', () => S.core.len > len, 90);
    yield* until('dale clear', () => !dale().task, 30);
    say('Threading the head onto the rod.', 'head');
    yield* land('core'); A.setClampB(S, true);
    yield* qte('circle', 'Thread the head onto the rod', 'rod');
    yield* spin(1, 'thread onto rod', () => SIM.attached(S));
  }

  // prev: the rods that came out and go back. now: the rods the next run needs (one more, except after a 5 ft half run)
  function* tripIn() {
    const prev = SIM.needRods(S.runs.length - 1), now = SIM.needRods(S.runs.length);
    say('Barrel back in the hole.', 'head');
    A.setTilt(S, false); yield* until('tilt in', () => S.head.tilt <= 0, 30);
    c.feed = 1;
    yield* until('barrel in', () => SIM.onBottomCore(S) || (prev > 0 && SIM.coreTop(S) <= 2.62), 90); c.feed = 0;
    if (prev === 0 && now === 0) return;            // the barrel alone, and it is all the next run needs: ready to core
    yield* headOff();
    if (S.yard.stands > 0) {
      yield* headTo(S.head.y + 1); yield* slideTo(-1);
      while (S.yard.stands > 0) {
        say('Winch down to pick up a stand.', 'horses');
        c.winch = -1; yield* until('hook to dale', () => S.winch.y <= 5, 60); c.winch = 0;
        yield* order('HOOK'); yield* until('stand hooked', () => S.winch.conn === 'stand', 60);
        say('Standing the rods up over the hole.', 'mast');
        c.winch = 1; yield* until('stand up', () => S.stand.lay <= 0, 60);
        c.winch = -0.2; yield* until('stand landed', () => S.stand.bot <= SIM.coreTop(S) + SIM.TH + 0.01, 60); c.winch = 0;
        say('Dale spins the stand in. Clamps torque it up.', 'clamps');
        yield* qte('swipe', 'Chain wrench: spin the stand in', 'rod');
        yield* order('WRENCH'); yield* until('spun in', () => S.winch.conn === 'core', 60);
        for (let n = 0; S.jt && S.jt.tight < 1; n++) {
          if (n > 4) throw new Error('A joint would not torque up.');
          A.setClampT(S, false); c.brk = -1; yield* until('rewind clamp', () => S.tc.ang <= 0.001, 20);
          A.setClampT(S, true); c.brk = 1; yield* until('torque', () => S.tc.ang >= 0.999 || (S.jt && S.jt.tight >= 1), 20);
        }
        c.brk = 0; A.setClampT(S, false);
        say('Running the stand into the hole.', 'mast');
        A.setClampB(S, false);
        c.winch = -1; yield* until('stand in', () => SIM.onBottomCore(S) || (SIM.rodsIn(S) < prev && SIM.coreTop(S) <= 2.62), 120); c.winch = 0;
        if (!SIM.onBottomCore(S)) A.setClampB(S, true);
        yield* order('HOOK'); yield* until('unhooked', () => !S.winch.conn, 60);
      }
      say('Head back to centre.', 'head');
      yield* headTo(16.4);
      c.winch = 1; yield* until('hook clear', () => S.winch.y >= S.head.y + SIM.HOOK_CLEAR + 0.2, 60); c.winch = 0;
      yield* slideTo(0);
    }
    let headOn = false;
    if (SIM.rodsIn(S) < prev) {                     // the odd single goes back with the head
      yield* stab();
      say('Running the rods to the bottom.', 'head');
      A.setClampB(S, false);
      c.feed = 1; yield* until('to bottom', () => SIM.onBottomCore(S), 90); c.feed = 0;
      headOn = true;
      if (now > SIM.rodsIn(S)) { yield* headOff(); headOn = false; }
    }
    if (now > SIM.rodsIn(S)) yield* stab();         // the new rod for the next run
    else if (!headOn) {                             // no new rod this time: the head goes back on the string as it stands
      say('Head back onto the rods.', 'head');
      yield* land('core'); A.setClampB(S, true);
      yield* spin(1, 'thread onto rods', () => SIM.attached(S));
    }
  }

  function* script() {
    say('Firing up the rig.', 'head');
    A.engineStart(S); yield* until('engine', () => S.engine.on, 20);
    c.throttle = 1; yield* wait(2.5);
    while (!S.done) {
      yield* coreRun();
      // a geotechnical half run (5, 15, 25 ft) gets no casing: the rods come straight out
      if (SIM.halfRun(S)) yield* until('run over', () => S.phase === 'TRIP_OUT', 20); else yield* casing();
      yield* tripOut();
      if (S.phase === 'SPT') { say('Rods are out. Time for the SPT.', 'clamps'); yield* until('spt', () => S.phase !== 'SPT', 1e9); }
      if (!S.done) yield* tripIn();
    }
  }

  // housekeeping the driller would otherwise call for
  let chores = 0;
  function tendCrew() {
    if (S.t - chores < 3) return; chores = S.t;
    if (!S.engine.on) A.engineStart(S);
    if (S.hoseBurst) SIM.order(S, 'REPAIR');
    else if (st.manual === 'casing' && S.water.tank < 6 && !S.water.truckAway) SIM.order(S, 'REFILL');
  }

  function start(state) {
    S = state; c = S.ctl; gen = script(); chores = 0;
    st.manual = ''; st.msg = ''; st.focus = 'head'; st.stage = ''; st.failed = ''; st.qte = null; pad.feed = 0; pad.rot = 0;
  }
  function stop() { gen = null; S = null; st.manual = ''; }
  // call once after every step of the drilling model
  function tick() {
    if (!gen || !S || st.failed) return;
    try {
      tendCrew();
      if (gen.next().done) { gen = null; st.manual = ''; st.msg = ''; }
    } catch (e) {
      gen = null; st.manual = ''; neutral();
      if (e.message !== 'DONE') { st.failed = e.message; console.error(e); }
    }
  }
  return { start, stop, tick, pad, st, get on() { return !!gen; }, get manual() { return st.manual; } };
})();
