'use strict';
/* Sonic Driller: simulation core.
   Units: depth and heights in feet, hydraulic gauges in psi, forces in lbf, water in gal / gpm,
   temperatures in °F, sonic head in Hz, rotation in rpm. Time is in seconds.
   Pipe handling is fully manual: head slide, casing presenter arm, two clamps, threads, winch, barrel tilt. */
window.SIM = (() => {
  // ---------- rig and site constants ----------
  const MAST_TOP = 16.5, MAST_BOT = 2.2;           // head travel on the mast (ft above ground)
  const TH = 0.3;                                  // thread length: how far the head travels making up a joint
  const CLAMP_B = 2.0, CLAMP_T = 3.2;              // heights of the bottom (holding) and top (break-out) clamps
  const ZONE_LO = 2.45, ZONE_HI = 2.95;             // a joint between the clamps can be broken
  const BARREL = 14, JT = 10, CAS_STUB = 2.3;    // casing top always ends below the break-out zone;                      // core barrel with its top sub, and one rod / casing joint
  const PRES_TOP = 14.9;                           // top of a casing joint standing on the presenter arm
  const HOOK_TOP = 31, HOOK_CLEAR = 6;           // winch hook travel, and how far it must stay above the head
  // Core run length. Environmental holes core 10 ft at a time: one rod a run. Geotechnical holes (GEO) core 5 ft at a
  // time with the same 10 ft tooling, and stop after every run for an SPT (js/spt.js). So every second run stops
  // half way down a rod (a "half run", at 5, 15, 25 ft): no casing goes on after it, and the bottom 5 ft is open hole.
  let RUN_LEN = 10, GEO = false;
  let TARGET = 60, WT = 12;                        // total depth and water table: set by the site (useSite)
  const GEO_MIN_FT = 13;                           // shift minutes a foot a geotechnical hole is allowed before the clock costs points
  const BARREL_CAP = 10.8;                         // the barrel holds a little more than a run, for slough
  const GAL_PER_FT = 1.23, TANK_CAP = 200;         // 6" casing holds ~1.23 gal per ft
  const AREA = 3.0;                                // feed cylinder area, in² (2,500 psi ≈ 7,500 lbf)
  const HEAD_W = 1800;                             // sonic head + carriage weight, lbf
  const CORE_WPF = 9, CASING_WPF = 17;             // string weight, lb/ft
  const PD_MAX = 2500, HB_MAX = 1500, PULL_MAX = 3000;
  const ROT_RELIEF = 2800, OSC_RELIEF = 4400, PUMP_RELIEF = 1200;
  const CLOCK_RATE = 8;                            // shift-clock seconds per sim second
  // crew positions along their walking paths (the 3D world maps these numbers to places on site)
  const POS = { rotary: 600, dale: 612, rack: 792, tess: 905, table: 880, katch: 700, truckHome: 30, truckAway: -380, hoseFix: 430, cab: 110 };

  // The materials, and how each one drills. A site (js/sites.js) stacks them up in its own order and thicknesses.
  const MATS = [
    { id: 'topsoil', name: 'Topsoil & fill', short: 'Topsoil', color: '#6e4a2a', pat: 'roots',
      base: 14, fRes: 84, torque: 0.35, oscLoad: 0.3, maxRpm: 40, rotBen: 0, k: 0.05, heave: 0, wob: 1200, compress: 0.8, wash: 0.3,
      tip: 'Loose and soft. The head weight alone will sink you, so dial in some holdback or you will squash the core.' },
    { id: 'clay', name: 'Silty clay', short: 'Silty clay', color: '#8f7f66', pat: 'dash',
      base: 8, fRes: 72, torque: 0.9, oscLoad: 0.8, maxRpm: 25, rotBen: 0.05, k: 0.01, heave: 0, wob: 2500, compress: 1, wash: 0.15,
      tip: 'Sticky. Keep rotation slow (under 25 rpm) and let the sonic do the cutting. Shoving it compresses the core.' },
    { id: 'sand', name: 'Fine sand, saturated', short: 'Fine sand', color: '#d8b465', pat: 'dots',
      base: 12, fRes: 112, torque: 0.5, oscLoad: 0.45, maxRpm: 50, rotBen: 0.1, k: 0.8, heave: 1, wob: 1500, compress: 0.2, wash: 0.85,
      tip: 'Heaving sand. No water during the core run or you will wash the core out. Keep the casing full and trip out slow.' },
    { id: 'gravel', name: 'Sand & gravel, cobbles', short: 'Sand & gravel', color: '#b49466', pat: 'pebbles',
      base: 6, fRes: 96, torque: 1.2, oscLoad: 0.7, maxRpm: 80, rotBen: 0.4, k: 1.2, heave: 0.5, wob: 3500, compress: 0, wash: 0.5, cob: [1.6, 4.2, 0.5, 1.2],
      tip: 'Cobbles. When the rotation pressure jumps, ease off the feed and keep it turning. Flush hard on the override.' },
    { id: 'till', name: 'Glacial till', short: 'Till', color: '#7b7a6e', pat: 'clasts',
      base: 5, fRes: 64, torque: 1.4, oscLoad: 1.0, maxRpm: 70, rotBen: 0.5, k: 0.02, heave: 0, wob: 5000, compress: 0.1, wash: 0.2,
      tip: 'Dense and stubborn. It needs feed and rotation. You will be on bottom a long time, so watch the head temperature.' },
    { id: 'shale', name: 'Weathered shale', short: 'Shale', color: '#59606a', pat: 'lam',
      base: 3.4, fRes: 130, torque: 1.6, oscLoad: 1.1, maxRpm: 110, rotBen: 0.8, k: 0.05, heave: 0, wob: 6000, compress: 0, wash: 0.1,
      tip: 'Rock. High frequency, real rotation, steady feed.' },
  ];
  const MAT = {}; MATS.forEach(m => { MAT[m.id] = m; });
  let LAYERS = [];
  // Lay the ground out for one of the career's sites. Only one hole is drilled at a time, so this is module state:
  // the layers, the target depth and the water table are whatever the current hole's site says.
  function useSite(n) {
    const st = SITES.get(n);
    let top = 0;
    LAYERS = st.layers.map(([id, bot, ch]) => { const L = Object.assign({}, MAT[id], ch || {}, { top, bot }); top = bot; return L; });
    TARGET = st.depth; WT = st.wt;
    GEO = st.job === 'spt'; RUN_LEN = GEO ? 5 : 10;
    return { n: st.n, type: st.type, kind: st.kind, job: st.job, of: st.of, build: st.build, name: st.name, well: st.well, depth: st.depth, wt: st.wt, hard: st.hard, tune: st.tune, blurb: st.blurb };
  }
  const layerAt = d => LAYERS.find(L => d < L.bot) || LAYERS[LAYERS.length - 1];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newRun(n, from) {
    return { n, from, to: from, fill: 0, drilled: 0, rec: 0, recNet: 0, slough: 0, tripLoss: 0, recovery: 0, segs: [], notes: {}, done: false,
      tel: { n: 0, res: 0, push: 0, rpm: 0 } };   // how it was drilled, weighted by footage: resonance, feed, rotation
  }

  // site: which hole of the current mission type this is (1 to 10). It decides the depth, the water table and the ground.
  function newGame(seed, site) {
    seed = seed || (Date.now() % 1e9);
    const st = useSite(site || 1);
    const r = rng(seed);
    const fOff = {};
    LAYERS.forEach(L => { if (fOff[L.id] == null) fOff[L.id] = Math.round((r() * 2 - 1) * 6); });
    const cobbles = [];                           // cobbles and boulders, in every layer that has them
    for (const L of LAYERS) {
      if (!L.cob || L.top >= TARGET) continue;
      const [g0, g1, l0, l1] = L.cob, end = Math.min(L.bot, TARGET + 2) - 1;
      let d = L.top + 0.6 + r() * 1.5;
      while (d < end) { const len = l0 + r() * (l1 - l0); cobbles.push({ a: d, b: d + len }); d += len + g0 + r() * (g1 - g0); }
    }
    const S = {
      seed, site: st, t: 0, clock0: 7 * 3600, paused: true, done: false,
      fOff, cobbles,
      ctl: { throttle: 0, feed: 0, feedSet: 0.3, holdback: 0, rot: 0, oscOn: false, oscSet: 60, pumpOn: false, pumpSet: 0.5,
        clampB: false, clampT: false, brk: 0, slide: 0, side: false, arm: 0, tilt: false, winch: 0 },
      engine: { on: false, crank: 0, rpm: 0, load: 0 },
      // head: y = height of its spindle thread, x = slide (-1 full left, 0 centre of mast, +1 over the presenter arm)
      head: { y: BARREL, x: 0, conn: 'core', eng: 1, tilt: 0, hz: 0, temp: 72, lock: false },
      core: { bit: 0, len: BARREL, snug: true },   // len 0 = nothing in the hole
      casing: { depth: 0, len: CAS_STUB },         // a short starter casing is already set at the collar
      hang: null,                                  // a single joint threaded to the head: { type, len, eng, onArm }
      loose: null,                                 // a single joint standing in the top clamp: { type, len, bot, dale }
      stand: null,                                 // a 20 ft stand on the winch: { len, bot, lay, mode, rest, free }
      jt: null,                                    // the rod joint being worked at the table: { above, tight, eng }
      tc: { ang: 0 },                              // top clamp rotation, 0 (break end) .. 1 (make end)
      winch: { y: HOOK_TOP - 1, conn: null },
      arm: { ang: 0, holds: false },
      rack: { casing: Math.floor(TARGET / JT + 0.01) },
      yard: { stands: 0, singles: 0 },
      work: 'core', contact: null,
      hole: { depth: 0, heave: 0 },
      water: { tank: TANK_CAP, level: 0, used: 0, spilled: 0, flow: 0, truckAway: false },
      truckX: POS.truckHome,
      hyd: { temp: 78 },
      g: { feed: 0, hold: 0, rot: 0, osc: 0, pump: 0, feedDir: 0 },
      rpm: 0, rop: 0, res: 0, fr: 80, shake: 0, wob: 0, winchV: 0,
      cuttings: 0, plug: 0, stuck: 0, inCobble: false, headBottomed: false,
      hoseBurst: false, pumpHigh: 0, heaving: false, overflow: false,
      phase: 'CORE_RUN', tagged: true,
      run: newRun(1, 0), runs: [],
      openGap: false,
      crew: [
        { id: 'dale', name: 'Dale', role: 'Lead hand', task: null, queue: [], x: POS.dale, face: -1, say: '', sayT: 0, hidden: false },
        { id: 'tess', name: 'Tess', role: 'Core hand', task: null, queue: [], x: POS.tess, face: -1, say: '', sayT: 0, hidden: false },
      ],
      log: [], alarms: [], incidents: 0, nearMissT: 0,
      dmg: { head: 0, pump: 0, bit: 0, hyd: 0, clamp: 0, threads: 0 },
      stats: { onBottom: 0, heave: 0, overflowGal: 0, loose: 0, drops: 0 },
      flags: {}, tipT: {}, sfx: [], report: null,
    };
    log(S, `Rig set up over ${st.well}. The core barrel is threaded on the head and sitting at the collar.`);
    log(S, `Hole ${st.n} of ${SITES.COUNT}: ${st.name}. ${st.depth} ft, water at ${st.wt} ft. ${st.blurb}`);
    return S;
  }

  function clockStr(S, t) {
    const s = S.clock0 + (t == null ? S.t : t) * CLOCK_RATE;
    const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  // The text in this file calls the two helpers Dale and Tess. nm() swaps in whoever the player picked for those jobs.
  const nm = (S, t) => (typeof t === 'string' ? t.replace(/\b(Dale|Tess)\b/g, w => S.crew[w === 'Dale' ? 0 : 1].name) : t);
  function log(S, msg, lvl) { S.log.unshift({ t: S.t, clock: clockStr(S), msg: nm(S, msg), lvl: lvl || 'info' }); if (S.log.length > 80) S.log.pop(); }
  // a hint that repeats at most every `gap` seconds
  function tip(S, key, msg, lvl, gap) {
    if (S.tipT[key] != null && S.t - S.tipT[key] < (gap || 8)) return;
    S.tipT[key] = S.t; log(S, msg, lvl || 'warn');
  }
  function say(m, text, dur) { m.say = text; m.sayT = dur || 4; }
  const crewMember = (S, id) => S.crew.find(m => m.id === id);

  // ---------- pipe geometry helpers ----------
  const coreTop = S => S.core.len - S.core.bit;
  const casTop = S => S.casing.len - S.casing.depth;
  const btm = S => S.hole.depth - S.hole.heave;
  const rodsIn = S => Math.max(0, Math.round((S.core.len - BARREL) / JT));
  const topOf = (S, w) => (w === 'core' ? (S.core.len > 0 ? coreTop(S) : -99) : casTop(S));
  const hangBot = S => S.head.y - TH * (1 - S.head.eng) - S.hang.len;
  const centred = S => Math.abs(S.head.x) < 0.02;
  const attached = S => (S.head.conn === 'core' || S.head.conn === 'casing') && S.head.eng >= 1 && !(S.head.conn === 'core' && S.jt && S.jt.eng < 1);
  // what each clamp has hold of when it is closed
  function gripB(S) {
    if (!S.ctl.clampB) return null;
    return topOf(S, S.work) > CLAMP_B + 0.1 ? S.work : null;
  }
  function gripT(S) {
    if (!S.ctl.clampT) return null;
    if (S.hang && !S.hang.onArm && centred(S)) { const b = hangBot(S); if (b < CLAMP_T - 0.1 && b + S.hang.len > CLAMP_T + 0.1) return 'hang'; }
    if (S.loose) return 'loose';
    if (S.stand && S.stand.lay === 0 && S.stand.bot < CLAMP_T - 0.1) return 'stand';
    return topOf(S, S.work) > CLAMP_T + 0.1 ? S.work : null;
  }
  const held = (S, w) => gripB(S) === w || gripT(S) === w;
  // which rod joint (counted down from the top of the string) is between the clamps; 0 = none
  function zoneJoint(S) {
    const r = rodsIn(S); if (!r) return 0;
    const top = coreTop(S);
    for (let k = 1; k <= r; k++) { const y = top - JT * k; if (y >= ZONE_LO - 0.001 && y <= ZONE_HI + 0.001) return k; }
    return 0;
  }
  const jointY = S => coreTop(S) - JT * (S.jt ? S.jt.above : 1);
  // a run is one rod: it is done when the rod is down to the table. A geotechnical run is 5 ft: it is done at its mark
  const runTarget = S => (GEO ? Math.min(S.core.len - (BARREL - JT), RUN_LEN * S.run.n) : S.core.len - (BARREL - RUN_LEN));
  // rods on top of the barrel once n runs are finished: one more every run, or every second run on 5 ft runs
  const needRods = n => (GEO ? Math.floor(Math.max(0, n) / 2) : Math.max(0, n));
  const halfRun = S => GEO && S.run.n % 2 === 1;
  // ft of the open hole between a and b that will run in when nothing holds it back: loose ground below the water table
  function wetRun(a, b) {
    let s = 0;
    for (const L of LAYERS) { const lo = Math.max(a, L.top, WT), hi = Math.min(b, L.bot); if (hi > lo && L.k >= 0.5) s += (hi - lo) * clamp(0.45 + 0.4 * L.heave, 0, 1); }
    return s;
  }
  const rodDown = S => S.core.len > 0 && S.core.bit >= runTarget(S) - 0.03;
  const onBottomCore = S => S.core.len > 0 && S.core.bit >= btm(S) - 0.03;
  // is anything stopping the core string from falling down the hole?
  function coreSupported(S) {
    return S.core.len === 0 || onBottomCore(S) || held(S, 'core') || (S.head.conn === 'core' && S.head.eng > 0) || S.winch.conn === 'core';
  }
  function checkDrop(S) {
    if (coreSupported(S)) return;
    const fall = btm(S) - S.core.bit;
    S.core.bit = btm(S); S.incidents++; S.stats.drops++;
    S.dmg.bit = Math.min(1, S.dmg.bit + 0.12); S.dmg.threads = Math.min(1, S.dmg.threads + 0.08);
    S.run.tripLoss += 0.5; S.run.notes.tripLoss = S.run.tripLoss;
    log(S, `DROPPED THE STRING! Nothing was holding the rods and they fell ${fall.toFixed(1)} ft to bottom.`, 'crit');
    S.sfx.push('clank'); S.sfx.push('alarm');
  }

  // ---------- crew jobs ----------
  function leversNeutral(S, allow) {
    const c = S.ctl;
    return Math.abs(c.feed) < 0.04 && Math.abs(c.rot) < 0.04 && Math.abs(c.slide) < 0.04 && Math.abs(c.brk) < 0.04 && Math.abs(c.arm) < 0.04
      && (allow === 'winch' || Math.abs(c.winch) < 0.04) && (allow === 'osc' || !c.oscOn);
  }
  const NEUTRAL_MSG = 'Neutral everything first, boss: levers centred, sonic off.';
  const headClearOf = (S, top) => Math.abs(S.head.x) > 0.5 || S.head.y >= top + 0.8;

  const TASKS = {
    HOOK_STRING: {
      who: 'dale', label: 'Hook up winch',
      stages: [{ x: POS.rotary, work: 5, atRotary: true }],
      done(S, m) {
        S.winch.conn = 'core'; S.winch.y = coreTop(S);
        if (S.phase === 'OVERRIDE') startTrip(S);
        say(m, 'Hoist plug is in. Open the clamp and take it up.', 4);
        log(S, 'Winch is hooked to the rods. Open the clamps and winch up one 20 ft stand.');
      },
    },
    UNHOOK: {
      who: 'dale', label: 'Unhook winch',
      stages: [{ x: POS.rotary, work: 3, atRotary: true }],
      done(S, m) { S.winch.conn = null; S.winch.y = Math.min(HOOK_TOP, S.winch.y + 0.8); say(m, 'Unhooked.', 2.5); log(S, 'Winch unhooked from the rods.'); },
    },
    HOOK_STAND: {
      who: 'dale', label: 'Hook a stand',
      stages: [{ x: POS.rack, work: 4, atRotary: true }],
      done(S, m) {
        S.yard.stands--; S.stand = { len: 2 * JT, bot: 0, lay: 1, mode: 'in', free: true };
        S.winch.conn = 'stand';
        say(m, 'Hooked on. Take it up, I will walk the bottom in.', 4);
        log(S, 'A 20 ft stand is on the winch. Winch UP to stand it in the mast.');
      },
    },
    SPIN_OUT: {
      who: 'dale', label: 'Chain wrench',
      stages: [
        { x: POS.rotary, work: 5, atRotary: true,
          after(S, m) {
            const y = jointY(S);
            S.core.len -= 2 * JT; S.jt = null;
            S.stand = { len: 2 * JT, bot: y, rest: y, lay: 0, mode: 'out', free: false };
            S.winch.conn = 'stand';
            say(m, 'She is loose. Pick it up a touch, then lower away and I will walk it out.', 5);
            log(S, 'Stand is spun out. Winch UP a touch to lift it clear, then winch DOWN to lay it on the sawhorses.');
            S.sfx.push('clank');
          } },
        { x: POS.rotary, until: S => !S.stand, atRotary: true, allow: 'winch', follow: true },
      ],
      done(S, m) { say(m, 'Stand is on the horses.', 2.5); },
    },
    SPIN_IN: {
      who: 'dale', label: 'Chain wrench',
      stages: [{ x: POS.rotary, work: 5, atRotary: true }],
      done(S, m) {
        S.core.len += 2 * JT; S.stand = null;
        S.winch.conn = 'core'; S.winch.y = coreTop(S);
        S.jt = { above: 2, tight: 0, eng: 1 };
        say(m, 'Spun in hand tight. Torque it up with the top clamp.', 4.5);
        log(S, 'Stand is spun in hand tight. Close the TOP CLAMP and push BREAK-OUT to MAKE to torque the joint.');
      },
    },
    GRAB: {
      who: 'dale', label: 'Grab the pipe',
      stages: [
        { x: POS.rotary, work: 1.5, atRotary: true, ready: S => (S.loose ? null : 'abort'),
          after(S, m) { if (S.loose) { S.loose.dale = true; say(m, 'Got it. Open the top clamp.', 5); } } },
        { x: POS.rotary, until: S => !S.loose },
        { x: POS.rack, work: 1, carry: 'rod' },
      ],
      done(S, m) { storeSingle(S, m.task0 && m.task0.type); },
    },
    PICKUP: {
      who: 'dale', auto: true, label: 'Pick up dropped pipe',
      stages: [{ x: POS.rotary, work: 3 }, { x: POS.rack, work: 1, carry: 'rod' }],
      done(S, m) { storeSingle(S, m.task0 && m.task0.type); },
    },
    STAB: {
      who: 'dale', label: 'Stab a rod',
      stages: [
        { x: POS.rack, work: 1.5 },
        { x: POS.rotary, work: 4, atRotary: true, carry: 'rod', ready: S => stabBlock(S) },
      ],
      done(S, m) {
        if (S.yard.singles > 0) S.yard.singles--;
        S.core.len += JT; S.core.snug = false; S.jt = null;
        say(m, 'Rod is stabbed. Bring the head down easy and make it up.', 4.5);
        log(S, `A rod is stabbed on the string (top now at ${coreTop(S).toFixed(1)} ft). Ease the head down and thread on.`);
      },
    },
    REPAIR: {
      who: 'any', label: 'Repair hose',
      stages: [{ x: POS.hoseFix, work: 18 }],
      done(S) { S.hoseBurst = false; S.pumpHigh = 0; log(S, 'Hose replaced. The pump is back in service.', 'good'); },
    },
    REFILL: {
      who: 'tess', label: 'Refill water tank',
      stages: [{ x: POS.cab, work: 0.5 }, { x: POS.cab, work: 45, truck: true }],
      done(S, m) {
        S.water.tank = TANK_CAP; S.water.truckAway = false; m.waitTruck = true;
        log(S, `Water truck is back with a full tank (${TANK_CAP} gal).`, 'good');
      },
    },
    CATCH: {
      who: 'tess', auto: true, label: 'Catch the core',
      stages: [{ x: POS.katch, work: 10, atRotary: true, allow: 'osc', vibe: true }],
      done(S) { finishRun(S); },
    },
  };

  function storeSingle(S, type) {
    if (type === 'casing') { S.rack.casing++; return; }
    S.yard.singles++;
  }
  function stabBlock(S) {
    const top = coreTop(S);
    if (S.head.conn) return 'The head has to be free and out of the way.';
    if (top > 6) return 'The rod top is too high for me. Lower the string to the table first.';
    if (top + JT + TH > MAST_TOP - 0.05) return 'No room under the head for a rod: the string is sitting high. Drill it down first.';
    if (Math.abs(S.head.x) < 0.5 && S.head.y < top + JT + TH + 0.15) return `Get the head up above ${(top + JT + TH + 0.2).toFixed(1)} ft so I can stand a rod under it.`;
    if (!held(S, 'core') && !onBottomCore(S)) return 'Close the bottom clamp first.';
    return null;
  }

  // turn a crew-order button into a job, or a reason why not
  function resolve(S, id) {
    const c = S.ctl, h = S.head, wn = S.winch;
    const no = r => ({ reason: r }), go = (task, data) => ({ task, data });
    switch (id) {
      case 'HOOK': {
        if (wn.conn === 'stand') return no('It is already hooked to a stand, boss.');
        if (!leversNeutral(S)) return no(NEUTRAL_MSG);
        if (wn.conn === 'core') {
          if (!held(S, 'core') && !onBottomCore(S)) return no('Close the bottom clamp first or the string will drop.');
          return go('UNHOOK');
        }
        if (h.x > -0.95) return no('Slide the head over to the left first so the winch line can come down.');
        if (S.phase === 'TRIP_IN' && S.yard.stands > 0) {
          if (!S.core.len) return no('Get the barrel back in the hole and set it in the bottom clamp first.');
          if (!held(S, 'core') && !onBottomCore(S)) return no('Close the bottom clamp on the string first.');
          if (coreTop(S) > 6) return no('The top of the string is too high. Lower it to the table.');
          if (wn.y > 6) return no(`Lower the hook down to me. It is at ${wn.y.toFixed(0)} ft.`);
          return go('HOOK_STAND');
        }
        if (!S.core.len || S.core.bit <= 0) return no('There is nothing in the hole to hook on to.');
        if (h.conn === 'core') return no('Unscrew the head from the rods first.');
        if (!held(S, 'core') && !onBottomCore(S)) return no('Close the bottom clamp first.');
        const top = coreTop(S);
        if (wn.y < top + 0.05 || wn.y > top + 1.6) return no(`Bring the hook to the top of the rods. Hook is at ${wn.y.toFixed(1)} ft, rod top is ${top.toFixed(1)} ft.`);
        if (S.phase === 'OVERRIDE' && S.casing.depth < S.hole.depth - 0.5 && !S.flags.warnShort) {
          S.flags.warnShort = 1;
          return no(`Casing is only at ${S.casing.depth.toFixed(1)} ft and the core is at ${S.hole.depth.toFixed(1)} ft. Pull now and that open hole may cave. Ask again if you are sure.`);
        }
        return go('HOOK_STRING');
      }
      case 'WRENCH': {
        if (!leversNeutral(S)) return no(NEUTRAL_MSG);
        if (wn.conn === 'stand' && S.stand.mode === 'in') {
          if (S.stand.lay > 0 || S.stand.bot > coreTop(S) + TH + 0.04) return no('Set the stand down in the box first. Easy does it.');
          if (gripB(S) !== 'core') return no('Close the bottom clamp so the string cannot turn.');
          return go('SPIN_IN');
        }
        if (wn.conn === 'core') {
          const j = S.jt;
          if (!j || j.tight > 0) return no('That joint is still tight. Break it with the top clamp first, I cannot crack it with a chain wrench.');
          if (zoneJoint(S) !== j.above) return no('Bring the broken joint back between the clamps.');
          if (j.above !== 2) return no('That is not a 20 footer, boss. We only lay out 20 ft stands. Torque it back up.');
          if (c.clampT) return no('Open the top clamp so I can spin it.');
          if (gripB(S) !== 'core') return no('Close the bottom clamp to hold the rods below.');
          return go('SPIN_OUT');
        }
        return no('Nothing to put the wrench on. Hook the winch up and break a joint with the clamps first.');
      }
      case 'GRAB': {
        if (!S.loose) return no('There is no loose pipe in the clamp, boss.');
        if (!leversNeutral(S)) return no(NEUTRAL_MSG);
        if (!headClearOf(S, S.loose.bot + S.loose.len)) return no('Get the head up out of my way first.');
        return go('GRAB', { type: S.loose.type });
      }
      case 'STAB': {
        if (!S.core.len) return no('There is no string in the hole to stab on to.');
        if (S.winch.conn) return no('Not while the winch is hooked up.');
        const r = rodsIn(S);
        if (S.yard.singles === 0) {
          if (S.yard.stands > 0) return no('There are still stands on the sawhorses. Winch those in first.');
          if (r >= needRods(S.runs.length)) return no('The string is already made up for this run.');
          if (S.phase !== 'TRIP_IN') return no('Not now. A new rod goes on once the barrel is back on bottom.');
        }
        if (!leversNeutral(S)) return no(NEUTRAL_MSG);
        const b = stabBlock(S);
        return b ? no(b) : go('STAB');
      }
      case 'REPAIR': return S.hoseBurst ? go('REPAIR') : no('The hose looks fine, boss.');
      case 'REFILL': return S.water.tank > TANK_CAP - 10 ? no('The tank is already full.') : go('REFILL');
    }
    return no('?');
  }

  function queueTask(S, who, id, data) {
    const m = crewMember(S, who);
    const t = { id, stage: 0, t: 0, blocked: false };
    if (!m.task) { m.task = t; m.task0 = data || null; } else m.queue.push([id, data]);
  }

  function order(S, id) {
    if (S.done) return false;
    const who = id === 'REFILL' ? 'tess' : id === 'REPAIR' ? null : 'dale';
    const m = who ? crewMember(S, who) : (S.crew.find(x => !x.task && !x.waitTruck && !x.hidden) || crewMember(S, 'dale'));
    if (m.task || m.waitTruck) {
      const cur = m.task ? TASKS[m.task.id].label.toLowerCase() : 'driving the truck back';
      say(m, `Hang on, I am busy (${cur}).`);
      return false;
    }
    const r = resolve(S, id);
    if (r.reason) { say(m, r.reason, 5.5); return false; }
    m.task = { id: r.task, stage: 0, t: 0, blocked: false }; m.task0 = r.data || null;
    const acks = { HOOK_STRING: 'Hooking her up.', UNHOOK: 'Unhooking.', HOOK_STAND: 'Hooking a stand.', SPIN_OUT: 'Chain wrench coming.', SPIN_IN: 'Spinning it in.',
      GRAB: 'Coming for it.', STAB: 'Grabbing a rod.', REPAIR: 'Swapping that hose.', REFILL: 'Taking the truck to the hydrant.' };
    say(m, acks[r.task] || 'On it.', 2.5);
    S.sfx.push('ok');
    return true;
  }

  function walkTo(m, x, dt) {
    const d = x - m.x;
    if (Math.abs(d) < 2) { m.x = x; return true; }
    m.face = Math.sign(d);
    m.x += Math.sign(d) * Math.min(140 * dt, Math.abs(d));
    m.walking = true;
    return false;
  }

  function nearMiss(S, m) {
    if (S.nearMissT > 0) return;
    S.nearMissT = 6; S.incidents++;
    log(S, `Near miss! You moved the controls while ${m.name} had hands on the pipe.`, 'crit');
    say(m, 'WHOA! Hands off the controls, boss!', 3.5);
    S.sfx.push('alarm');
  }
  const crewAtPipe = S => S.crew.find(m => m.task && m.atWork && TASKS[m.task.id].stages[m.task.stage].atRotary);

  function crewStep(S, dt) {
    const tgtX = S.water.truckAway ? POS.truckAway : POS.truckHome;
    S.truckX += clamp(tgtX - S.truckX, -160 * dt, 160 * dt);
    for (const m of S.crew) {
      if (m.sayT > 0) m.sayT -= dt;
      m.walking = false; m.atWork = false; m.carry = null;
      if (m.waitTruck) {
        m.hidden = S.truckX < POS.truckHome - 3;
        if (!m.hidden) { m.waitTruck = false; m.x = POS.cab; }
        continue;
      }
      m.hidden = false;
      if (!m.task && m.queue.length) { const [id, data] = m.queue.shift(); m.task = { id, stage: 0, t: 0, blocked: false }; m.task0 = data || null; }
      if (!m.task) { walkTo(m, m.id === 'dale' ? POS.dale : POS.tess, dt); continue; }
      const T = TASKS[m.task.id], st = T.stages[m.task.stage];
      m.carry = st.carry || null;
      if (st.truck) {
        S.water.truckAway = true; m.hidden = true; m.x = S.truckX + 60;
        if (S.truckX > POS.truckAway + 5) continue;
      } else if (st.follow && S.stand) { m.x = lerp(POS.rotary, POS.rack, S.stand.lay); m.walking = S.winchV !== 0; }
      else if (!walkTo(m, st.x, dt)) continue;
      m.atWork = true;
      if (st.ready) {
        const why = st.ready(S);
        if (why === 'abort') { m.task = null; continue; }
        if (why) { if (!m.task.blocked) { m.task.blocked = true; say(m, why, 4.5); } continue; }
      }
      if (st.atRotary && !leversNeutral(S, st.allow)) {
        if (!m.task.blocked) {
          m.task.blocked = true;
          if (m.task.t > 0.05) nearMiss(S, m); else say(m, 'Waiting on you, boss. Neutral the controls.', 3.5);
        }
        continue;
      }
      m.task.blocked = false;
      let done;
      if (st.until) { done = st.until(S); m.task.t += dt; }
      else {
        let rate = 1;
        if (st.vibe) {
          rate = S.head.hz > 20 ? clamp(S.head.hz / 55, 0.4, 1.3) : 0;
          if (!rate && (!m.sayT || m.sayT <= 0)) say(m, 'Ready with the sleeve. Give it some vibration, boss.', 4);
        }
        m.task.t += dt * rate;
        done = m.task.t >= st.work;
      }
      if (done) {
        if (st.after) st.after(S, m);
        m.task.stage++; m.task.t = 0;
        if (m.task.stage >= T.stages.length) {
          const id = m.task.id; m.task = null;
          T.done(S, m);
          S.sfx.push(id === 'SPIN_IN' || id === 'HOOK_STRING' ? 'clank' : 'done');
        }
      }
    }
  }

  function taskProgress(m) {
    if (!m.task) return 0;
    const T = TASKS[m.task.id];
    const total = T.stages.reduce((a, s) => a + (s.work || 0), 0) || 1;
    let done = 0;
    for (let i = 0; i < m.task.stage; i++) done += T.stages[i].work || 0;
    return clamp((done + Math.min(m.task.t, T.stages[m.task.stage].work || 0)) / total, 0, 1);
  }
  // ---------- core bookkeeping ----------
  // one stretch of core: depth a..b, what it is, how much of it survived (q), and what damaged it (why)
  function addSeg(r, a, b, layer, color, q, slough, why) {
    why = why || '';                             // (so that stretches with no damage, slough above all, join up into one)
    const last = r.segs[r.segs.length - 1];
    if (last && last.layer === layer && last.slough === slough && last.why === why && Math.abs(last.q - q) < 0.12 && Math.abs(last.b - a) < 0.02) {
      const la = last.b - last.a, lb = b - a;
      last.q = (last.q * la + q * lb) / (la + lb); last.b = b;
    } else r.segs.push({ a, b, layer, color, q, slough, why: why || '' });
  }

  function coreAdvance(S, a, b, k) {
    const r = S.run, hd = S.hole.depth;
    const sl = Math.max(0, Math.min(b, hd) - a);
    if (sl > 0) {
      r.slough += sl; r.fill += sl;
      S.hole.heave = Math.max(0, hd - b);
      addSeg(r, a, a + sl, 'slough', '#c9b98f', 0, true);
    }
    const nat = Math.max(0, b - Math.max(a, hd));
    if (nat > 0) {
      const L = k.L, n = r.notes;
      let q = 1, why = '', worst = 0;
      const hit = (key, pen) => { if (pen <= 0) return; q -= pen; n[key] = (n[key] || 0) + nat; if (pen > worst) { worst = pen; why = key; } };
      if (k.flow > 1) hit('washed', L.wash * clamp(k.flow / 12, 0, 1));
      if (L.compress > 0 && k.res < 0.35 && k.WOB > L.wob * 1.4) hit('compressed', 0.35 * L.compress);
      if (Math.abs(k.rpm) > L.maxRpm) hit('spun', Math.min(0.5, (Math.abs(k.rpm) - L.maxRpm) / 70));
      if (k.res < 0.25 && k.hz > 95 && L.compress >= 0.8) hit('heated', 0.12);
      if (k.hz > 8 && k.res < 0.3 && L.k >= 0.5) hit('rattled', 0.14 * (1 - k.res / 0.3));   // loose ground shaken up off resonance
      if (S.inCobble) { q *= S.item === 'bit' ? 0.93 : 0.75;      // the carbide bit from the shop (js/shop.js) hardly notices them
        n.cobble = (n.cobble || 0) + nat; if (worst < 0.25) why = 'cobble'; }
      if (r.fill >= BARREL_CAP) { q = 0; n.overrun = (n.overrun || 0) + nat; why = 'overrun'; }
      const t = r.tel; t.n += nat; t.res += nat * k.res; t.push += nat * clamp(k.WOB / L.wob, 0, 3); t.rpm += nat * Math.abs(k.rpm) / L.maxRpm;
      q = clamp(q, 0, 1);
      r.fill += nat; r.drilled += nat; r.rec += nat * q;
      S.hole.depth = b;
      addSeg(r, b - nat, b, L.id, L.color, q, false, why);
    }
  }

  function casingAdvance(S, a, b, k) {
    const hd = S.hole.depth;
    if (b > hd) {
      const extra = b - Math.max(a, hd);
      S.hole.depth = b; S.hole.heave += extra;
      if (!S.flags.aheadMsg) { S.flags.aheadMsg = 1; log(S, 'Casing is now ahead of the core barrel. That ground inside the casing is disturbed and will come up as slough.', 'warn'); }
    }
    const dirty = (k.L.id === 'gravel' || k.L.id === 'till') ? 0.17 : 0.1;
    S.cuttings = clamp(S.cuttings + (b - a) * dirty * (1 - k.lube), 0, 1);
    if ((k.L.id === 'clay' || k.L.id === 'till') && k.flow < 4) S.plug = clamp(S.plug + (b - a) * 0.1, 0, 1);
    // dry casing: the "water level" follows the shoe down
    if (S.water.level >= a - 0.01) S.water.level = b;
  }

  // Sand coming up into the casing while the rods are out. It bridges off after a while, so one trip only brings in
  // so much (more in ground that runs harder). Without that limit a deep hole with shallow water would fill by the yard.
  function tripHeave(S, hv, Ls) {
    hv = Math.min(hv, 0.6 * Ls.heave - (S.tripHv || 0));
    if (hv <= 0) return 0;
    S.tripHv = (S.tripHv || 0) + hv;
    S.hole.heave = Math.min(S.hole.depth, S.hole.heave + hv); S.stats.heave += hv;
    return hv;
  }
  // the core string moved in the hole (moved > 0 = deeper), by the head or by the winch
  function tripMove(S, moved, dt) {
    const w = S.water;
    if (moved === 0) return;
    if (S.casing.depth > 0.5 && S.core.bit > w.level) {
      w.level = Math.min(S.casing.depth, w.level - moved * 0.45);
      if (w.level < 0) { const sp = -w.level * GAL_PER_FT; w.spilled += sp; S.stats.overflowGal += sp; w.level = 0; S.overflow = true; }
    }
    if (moved > 0 || S.phase === 'CORE_RUN' || S.phase === 'TRIP_IN') return;
    const vUp = -moved / dt;
    const Ls = layerAt(S.casing.depth - 0.05);
    if (vUp > 0.7 && S.core.bit > WT && Ls.heave > 0 && S.casing.depth > WT) {
      tripHeave(S, (vUp - 0.7) * 0.06 * dt * Ls.heave, Ls);
      if (!S.flags.swabMsg) { S.flags.swabMsg = 1; log(S, 'Pulling fast in sand swabs the hole. Sand is being sucked up into the casing.', 'warn'); }
    }
    const sandy = S.run.segs.some(s => s.layer === 'sand' || s.layer === 'gravel');
    if (vUp > 1.1 && sandy && !S.run.done) { S.run.tripLoss += (vUp - 1.1) * 0.09 * dt; S.run.notes.tripLoss = S.run.tripLoss; }
    if (S.openGap && S.core.bit < S.casing.depth - 0.2) {
      S.openGap = false;
      const gap = S.hole.depth - S.casing.depth;
      const Lg = layerAt(S.casing.depth + 0.1);
      const cave = GEO ? wetRun(S.casing.depth, S.hole.depth) : gap > 0.5 && Lg.k >= 0.5 && S.casing.depth + gap > WT ? gap * 0.85 : 0;
      if (cave > 0.2) {
        S.hole.heave = Math.min(S.hole.depth, S.hole.heave + cave); S.stats.heave += cave;
        log(S, GEO ? `The open hole sloughed in as the barrel came out. About ${cave.toFixed(1)} ft of wet sand is sitting on bottom.` : `The open hole below the casing caved in. About ${cave.toFixed(1)} ft of sand is now in the hole.`, GEO ? 'warn' : 'crit');
        S.sfx.push(GEO ? 'buzz' : 'alarm');
      }
    }
  }

  function startTrip(S) {
    S.phase = 'TRIP_OUT'; S.tripHv = 0;
    S.openGap = S.hole.depth - S.casing.depth > 0.5;
    if (S.openGap && GEO) log(S, `No casing on this run: ${(S.hole.depth - S.casing.depth).toFixed(1)} ft of open hole under the shoe. Wet sand will slough in when the barrel comes out.`, wetRun(S.casing.depth, S.hole.depth) > 0.2 ? 'warn' : 'info');
    else if (S.openGap) log(S, `Casing is only at ${S.casing.depth.toFixed(1)} ft with the core at ${S.hole.depth.toFixed(1)} ft. The open hole may cave when you pull.`, 'warn');
    const r = rodsIn(S);
    if (r === 0) log(S, 'Head is on the barrel. Open the clamps and pull the barrel out of the hole.');
    else if (r % 2) log(S, `Tripping out ${r} rod${r > 1 ? 's' : ''} and the barrel. Odd number: take the top single off with the head first.`);
    else log(S, `Tripping out ${r} rods and the barrel: ${r / 2} stand${r > 2 ? 's' : ''} on the winch. Raise the rods 2 ft first so the barrel is up inside the casing.`);
  }

  const NOTE_TEXT = {
    washed: 'washed by pump water', compressed: 'compressed (pushed without sonic)', spun: 'spun by high rpm',
    heated: 'cooked by over-vibrating', rattled: 'shaken loose off resonance', cobble: 'broken by cobbles', overrun: 'barrel overrun', tripLoss: 'core lost on the trip out',
  };
  function noteKeys(r) { return Object.keys(r.notes).filter(k => r.notes[k] >= (k === 'overrun' || k === 'tripLoss' ? 0.05 : 0.2)); }
  function notesText(r) { const k = noteKeys(r); return k.length ? ' Core ' + k.map(x => NOTE_TEXT[x]).join(', ') + '.' : ''; }

  function finishRun(S) {
    const r = S.run;
    r.done = true;
    if (!r.to || r.to < r.from) r.to = r.from + r.fill;
    const lost = Math.min(r.rec, r.tripLoss);
    r.recNet = r.rec - lost;
    r.recovery = r.drilled > 0.05 ? r.recNet / r.drilled : 0;
    r.endClock = clockStr(S);
    S.runs.push(r);
    const pct = Math.round(r.recovery * 100);
    log(S, `Run ${r.n} is in the sleeve: ${r.from.toFixed(1)} to ${r.to.toFixed(1)} ft, ${pct}% recovery.${notesText(r)}`, pct >= 90 ? 'good' : pct >= 70 ? 'warn' : 'crit');
    if (GEO) {                                    // rods are out: the SPT goes down the hole before anything else (js/spt.js)
      S.phase = 'SPT';
      S.spt = { depth: Math.round(S.hole.depth / RUN_LEN) * RUN_LEN, n: r.n, last: S.hole.depth >= TARGET - 0.3 };
      log(S, `Barrel is empty. Sonic off. Time for the SPT at ${S.spt.depth} ft.`);
      return;
    }
    if (S.hole.depth >= TARGET - 0.3) { finish(S); return; }
    nextRun(S);
  }
  function nextRun(S) {
    S.phase = 'TRIP_IN'; S.tagged = false;
    S.flags.warnShort = 0; S.flags.fullMsg = 0;
    S.run = newRun(S.runs.length + 1, S.hole.depth - S.hole.heave);
    log(S, GEO ? 'The SPT is done. Tilt the barrel back IN and run it back in the hole.' : 'Barrel is empty. Sonic off, tilt the barrel back IN and run it back in the hole.');
  }
  // the SPT at this depth is finished (called by js/spt.js): back in the hole, or the hole is done
  function sptDone(S) {
    const last = S.spt && S.spt.last;
    S.spt = null;
    if (last) finish(S); else nextRun(S);
  }

  function finish(S) {
    S.done = true; S.phase = 'DONE';
    S.report = report(S);
    log(S, GEO ? `Hole complete at ${S.hole.depth.toFixed(1)} ft. Every SPT is on the log.` : `Hole complete at ${S.hole.depth.toFixed(1)} ft, cored and cased. Next: the well.`, 'good');
    S.sfx.push('done');
  }

  function report(S) {
    const runs = S.runs;
    const drilled = runs.reduce((a, r) => a + r.drilled, 0);
    const rec = runs.reduce((a, r) => a + r.recNet, 0);
    const recovery = drilled > 0 ? rec / drilled : 0;
    const shiftMin = S.t * CLOCK_RATE / 60;
    const wear = S.dmg.head + S.dmg.pump + S.dmg.bit + S.dmg.hyd + S.dmg.clamp + S.dmg.threads;
    let score = 100;
    score -= Math.max(0, (0.95 - recovery) * 100) * 0.9;
    score -= S.incidents * 8;
    score -= wear * 30;
    score -= S.stats.loose * 2;
    score -= (S.stats.fumbles || 0) * 2;
    score -= Math.max(0, shiftMin - TARGET * (GEO ? GEO_MIN_FT : 10)) / 15;      // ten minutes of shift a foot before the clock costs anything (more on 5 ft runs: twice the trips)
    if (S.casing.depth < Math.floor(TARGET / JT + 0.01) * JT - 0.5) score -= 5;
    score = Math.round(clamp(score, 0, 100));
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
    return { drilled, rec, recovery, shiftMin, score, grade, wear, casing: S.casing.depth, waterUsed: S.water.used, spilled: S.water.spilled,
      incidents: S.incidents, heave: S.stats.heave, loose: S.stats.loose, drops: S.stats.drops, fumbles: S.stats.fumbles || 0 };
  }
  // ---------- threads: making up and breaking out with the head's rotation ----------
  // Returns the extra rotation pressure, and whether the rotation is stalled against a made-up joint.
  function threadStep(S, rpm, dt) {
    const h = S.head, hang = S.hang, fwd = rpm > 0;
    const d = Math.abs(rpm) * 0.013 * dt;
    const out = { load: 0, stall: false, busy: false };
    const rough = () => { if (Math.abs(rpm) > 70) { S.dmg.threads = Math.min(1, S.dmg.threads + dt * 0.02); tip(S, 'fastThread', 'Too fast on the threads. Make up and break out at a slow rotation or you will gall them.'); } };
    const turn = (obj, sign) => {           // screw a joint in (+1) or out (-1); the head rides the thread
      const e0 = obj.eng; obj.eng = clamp(obj.eng + sign * d, 0, 1);
      h.y = clamp(h.y - TH * (obj.eng - e0), MAST_BOT, MAST_TOP);
      out.busy = true; out.load = 250 + 450 * obj.eng; rough();
      return obj.eng;
    };
    const spinning = () => { tip(S, 'nohold', 'The pipe is just turning with the head. Something has to hold it: close a clamp on it.', 'info', 10); };

    // 1) free head sitting in a box
    if (!h.conn) {
      const ct = S.contact;
      if (!fwd || !ct || ct === 'hang') return out;
      const ok = ct === 'arm' ? true : ct === 'loose' ? gripT(S) === 'loose' : held(S, ct);
      if (!ok) { spinning(); return out; }
      if (ct === 'arm') { S.hang = { type: 'casing', len: JT, eng: 0, onArm: true }; h.conn = 'pipe'; }
      else if (ct === 'loose') { S.hang = { type: S.loose.type, len: S.loose.len, eng: 0, onArm: false }; S.loose = null; h.conn = 'pipe'; }
      else h.conn = ct;
      h.eng = 0; turn(h, 1);
      return out;
    }
    // 2) head joint part way in (threading on, or backing off)
    if (h.eng < 1) {
      const ok = h.conn === 'pipe' ? (hang.onArm || gripT(S) === 'hang') : held(S, h.conn);
      if (!ok) { spinning(); return out; }
      const e = turn(h, fwd ? 1 : -1);
      if (e >= 1) {
        S.sfx.push('clank');
        if (h.conn === 'pipe' && hang.onArm) { hang.onArm = false; S.arm.holds = false; log(S, 'Casing joint is made up to the head and the arm has let go. Raise it clear and slide back to centre of mast.'); }
        else if (h.conn === 'core') { S.core.snug = true; }
      } else if (e <= 0) {
        if (h.conn === 'pipe') {
          if (!hang.onArm) { S.loose = { type: hang.type, len: hang.len, bot: h.y - TH - hang.len, dale: false }; log(S, 'Head is off the pipe. It is standing in the top clamp: call Dale to grab it.'); }
          S.hang = null;
        } else log(S, `Head is unscrewed from the ${h.conn === 'core' ? 'rods' : 'casing'}.`);
        h.conn = null; S.sfx.push('clank');
      }
      return out;
    }
    // 3) carrying a single joint on the head
    if (h.conn === 'pipe') {
      const st = hang.type === 'casing' ? 'casing' : 'core';
      const landed = hang.eng > 0 || S.contact === 'hang';
      if (fwd && landed) {
        if (!held(S, st)) { spinning(); return out; }
        if (turn(hang, 1) >= 1) {
          S[st].len += hang.len; h.conn = st; h.eng = 1; S.hang = null; S.sfx.push('clank');
          if (st === 'core') { S.jt = { above: 1, tight: 1, eng: 1 }; log(S, 'Rod is made up to the string.'); }
          else log(S, `Casing joint is made up. Open the clamps and override the casing down to ${S.hole.depth.toFixed(1)} ft with water.`);
        }
      } else if (!fwd) {
        if (gripT(S) === 'hang' && hang.eng === 0) turn(h, -1);
        else if (hang.eng > 0 && held(S, st)) turn(hang, -1);
        else spinning();
      }
      return out;
    }
    // 4) head made up to a string in the hole
    const j = S.jt, core = h.conn === 'core';
    if (core && j && j.eng < 1) {                    // top rod part way out of the string
      if (gripB(S) !== 'core' || gripT(S) === 'core') { spinning(); return out; }
      const e = turn(j, fwd ? 1 : -1);
      if (e >= 1) j.tight = 1;
      else if (e <= 0) {
        S.core.len -= JT; S.jt = null;
        S.hang = { type: 'rod', len: JT, eng: 0, onArm: false }; h.conn = 'pipe'; S.sfx.push('clank');
        log(S, 'The rod is spun out of the string and hanging on the head. Set it just above the lower rod, close the TOP CLAMP on it and unscrew the head.');
      }
      return out;
    }
    if (!fwd) {
      if (core && j && j.tight <= 0 && j.above === 1 && gripB(S) === 'core' && gripT(S) !== 'core') turn(j, -1);
      else if (held(S, h.conn)) turn(h, -1);
      else if (core && j && j.tight > 0 && zoneJoint(S) && gripB(S) !== 'core') spinning();
    } else if (held(S, h.conn)) out.stall = true;     // already tight and the clamp is holding
    return out;
  }

  // lowest the free head (or the joint it carries) can go right now, and what it would land on
  function lowLimit(S) {
    const h = S.head;
    if (S.hang) {
      if (centred(S)) {
        const T = topOf(S, S.hang.type === 'casing' ? 'casing' : 'core');
        if (T > -50) return { y: T + TH + S.hang.len, tgt: 'hang' };
      }
      return { y: Math.max(MAST_BOT, S.hang.len + 1), tgt: null };
    }
    if (h.x > 0.98 && S.arm.ang > 0.98 && S.arm.holds) return { y: PRES_TOP + TH, tgt: 'arm' };
    if (centred(S)) {
      let best = null;
      const cand = [['core', topOf(S, 'core')], ['casing', casTop(S)]];
      if (S.loose) cand.push(['loose', S.loose.bot + S.loose.len]);
      for (const [tgt, T] of cand) if (T > -50 && T + TH <= h.y + 0.03 && (!best || T > best.T)) best = { tgt, T };
      // rods standing just inside the casing: the spindle still reaches down to the rods,
      // unless you are in the middle of overriding and need to get back on the casing
      const ct = topOf(S, 'core');
      const needCasing = S.phase === 'OVERRIDE' && S.casing.depth < S.hole.depth - 0.25;
      if (best && best.tgt === 'casing' && !needCasing && ct > best.T - 1 && ct + TH >= MAST_BOT - 0.001) best = { tgt: 'core', T: ct };
      if (best) return { y: Math.max(MAST_BOT, best.T + TH), tgt: best.T + TH >= MAST_BOT - 0.001 ? best.tgt : null };
    }
    return { y: MAST_BOT, tgt: null };
  }

  // head slide with the side-select switch: LEFT works far-left..centre, RIGHT works centre..far-right
  function slideStep(S, dt, flowK) {
    const c = S.ctl, h = S.head;
    S.slideBlock = null;
    if (Math.abs(c.slide) < 0.03 || flowK <= 0) return;
    const free = !h.conn || (h.conn === 'pipe' && h.eng >= 1 && S.hang.eng === 0 && !S.hang.onArm);
    if (!free) { S.slideBlock = 'Head is threaded on'; tip(S, 'slideConn', 'The head cannot slide while it is threaded to pipe in the hole or on the arm.'); return; }
    if (h.tilt > 0.01) { S.slideBlock = 'Head is tilted out'; return; }
    const lo = c.side ? 0 : -1, hi = c.side ? 1 : 0;
    const dx = c.slide * 0.5 * flowK * dt;
    let nx = h.x + dx;
    if (dx > 0) nx = Math.min(nx, Math.max(h.x, hi)); else nx = Math.max(nx, Math.min(h.x, lo));
    // things in the way
    const tops = Math.max(topOf(S, 'core'), casTop(S), S.loose ? S.loose.bot + S.loose.len : -99, S.stand && S.stand.lay === 0 ? 99 : -99);
    const low = S.hang ? hangBot(S) : h.y - TH;
    const enteringCentre = (h.x > 0.25 && nx <= 0.25) || (h.x < -0.25 && nx >= -0.25);
    if (enteringCentre && low < tops + 0.02) {
      nx = h.x > 0 ? 0.25 : -0.25; S.slideBlock = 'Pipe in the way: raise the head';
      tip(S, 'slidePipe', `Raise the head first: ${S.hang ? 'the joint it is carrying' : 'it'} would hit the pipe standing in the table (top at ${tops > 90 ? 'the stand' : tops.toFixed(1) + ' ft'}).`);
    }
    if (h.x < -0.75 && nx >= -0.75 && (S.winch.conn || S.winch.y < h.y + HOOK_CLEAR)) {
      nx = -0.75; S.slideBlock = 'Winch line in the way';
      tip(S, 'slideWinch', S.winch.conn ? 'The winch is hooked up. The head stays left until it is unhooked.' : `Winch the hook up out of the way first (above ${(h.y + HOOK_CLEAR).toFixed(0)} ft).`);
    }
    if (!S.hang && h.x < 0.7 && nx >= 0.7 && S.arm.ang > 0.05 && S.arm.holds && h.y < PRES_TOP + TH - 0.02) {
      nx = 0.7; S.slideBlock = 'Casing in the way: raise the head';
      tip(S, 'slideArm', `Raise the head above the presented casing first (above ${(PRES_TOP + TH).toFixed(1)} ft).`);
    }
    if (Math.abs(nx) < 0.004 && Math.abs(h.x) >= 0.004) S.sfx.push('clamp');
    h.x = Math.abs(nx) < 0.004 ? 0 : nx;
  }

  // casing presenter arm: 0 = lying on the rack, 1 = standing the joint vertical beside the mast
  function armStep(S, dt, flowK) {
    const c = S.ctl, a = S.arm, h = S.head;
    if (a.ang < 0.02 && !a.holds && S.rack.casing > 0) { a.holds = true; S.rack.casing--; S.sfx.push('clank'); }
    if (Math.abs(c.arm) < 0.03 || flowK <= 0) return;
    if (S.hang && S.hang.onArm) { tip(S, 'armThread', 'The head is part way threaded into the casing on the arm. Finish making it up, or spin it back out.'); return; }
    let na = clamp(a.ang + c.arm * 0.25 * flowK * dt, 0, 1);
    if (c.arm > 0 && h.x > 0.4 && (S.hang ? hangBot(S) : h.y) < PRES_TOP + TH - 0.02 && na > 0.6) { na = Math.max(a.ang, 0.6); tip(S, 'armHead', 'The head is in the way of the arm. Raise the head or slide it back to centre.'); }
    a.ang = na;
  }

  // top clamp rotation: break (toward 0) and make (toward 1)
  function breakStep(S, dt, flowK) {
    const c = S.ctl, tc = S.tc;
    S.brkLoad = 0;
    const k = zoneJoint(S);
    if (k && (!S.jt || S.jt.above !== k) && !(S.jt && S.jt.eng < 1)) S.jt = { above: k, tight: 1, eng: 1 };
    if (Math.abs(c.brk) < 0.03 || flowK <= 0) return;
    const a0 = tc.ang; tc.ang = clamp(tc.ang + c.brk * 0.6 * flowK * dt, 0, 1);
    const da = tc.ang - a0;
    if (da === 0 || !c.clampT) return;
    const j = S.jt;
    if (gripT(S) !== 'core' || !k || !j || j.above !== k || j.eng < 1) return;
    if (gripB(S) !== 'core') { tip(S, 'brkHold', 'The top clamp is turning the whole string. Close the BOTTOM CLAMP to hold the lower rod.', 'info'); return; }
    if (da < 0 && j.tight > 0) {
      j.tight += da * 0.6; S.brkLoad = 1;
      if (j.tight <= 0) { j.tight = 0; S.sfx.push('clank'); log(S, 'CRACK. The joint is broken. Open the top clamp and spin it out.', 'good'); }
    } else if (da > 0 && j.tight < 1) {
      j.tight = Math.min(1, j.tight + da * 1.25); S.brkLoad = 1;
      if (j.tight >= 1) { S.sfx.push('clank'); log(S, 'Joint is torqued up tight.', 'good'); }
    }
  }

  // winch: free hook, hooked to the rods, or carrying a 20 ft stand
  function winchStep(S, dt, flowK) {
    const c = S.ctl, wn = S.winch, h = S.head;
    S.winchV = 0; S.winchBlock = null;
    if (Math.abs(c.winch) < 0.03 || flowK <= 0) return;
    let dy = c.winch * 2.0 * flowK * dt;                        // + = up
    if (wn.conn === 'core') {
      if (held(S, 'core')) { S.winchBlock = 'Clamp is closed on the rods'; if (dy > 0) S.dmg.clamp = Math.min(1, S.dmg.clamp + dt * 0.004); return; }
      const b0 = S.core.bit;
      let nb = clamp(b0 - dy, S.core.len - HOOK_TOP, btm(S));
      if (nb > b0 && nb >= btm(S) - 1e-6 && S.phase === 'TRIP_IN' && !S.tagged) tagged(S);
      S.core.bit = nb; wn.y = coreTop(S);
      S.winchV = (b0 - nb) / dt;
      tripMove(S, nb - b0, dt);
      const j = S.jt;
      if (j && j.tight < 1 && nb > b0 && jointY(S) < CLAMP_B - 0.5) { S.stats.loose++; S.jt = null; log(S, 'You ran a joint in the hole that was only hand tight. It should have been torqued with the top clamp.', 'warn'); }
    } else if (wn.conn === 'stand') {
      const st = S.stand;
      if (st.mode === 'out') {
        if (st.lay <= 0 && (dy > 0 || !st.free)) {
          const nb = clamp(st.bot + dy, st.rest, st.rest + 4);
          S.winchV = (nb - st.bot) / dt; st.bot = nb;
          if (st.bot >= st.rest + 0.3 && !st.free) { st.free = true; say(crewMember(S, 'dale'), 'Clear. Lower away.', 3); }
        } else {
          const l0 = st.lay; st.lay = clamp(st.lay - dy / 18, 0, 1); S.winchV = (l0 - st.lay) * -18 / dt;
          if (st.lay >= 1) {
            S.yard.stands++; S.stand = null; wn.conn = null; wn.y = 3.5; S.sfx.push('clank');
            log(S, `A 20 ft stand is laid out on the sawhorses (${S.yard.stands} out).`, 'good');
          }
        }
      } else {
        if (st.lay > 0) { const l0 = st.lay; st.lay = clamp(st.lay - dy / 18, 0, 1); S.winchV = (l0 - st.lay) * 18 / dt; if (st.lay <= 0) st.bot = coreTop(S) + 1.5; }
        else {
          const lo = coreTop(S) + TH, nb = clamp(st.bot + dy, lo, HOOK_TOP - st.len);
          const v = (st.bot - nb) / dt;
          if (nb <= lo + 1e-6 && st.bot > lo + 1e-6) {
            S.sfx.push('clank');
            if (v > 0.7) { S.dmg.threads = Math.min(1, S.dmg.threads + 0.04); log(S, 'You dropped the stand into the box. Lower it gently or you will wreck the threads.', 'warn'); }
          }
          S.winchV = -v; st.bot = nb;
        }
      }
      if (S.stand) wn.y = lerp(S.stand.bot + S.stand.len, 3.5, S.stand.lay);
    } else {
      let lo = 2.0;
      if (h.x > -0.9) lo = h.y + HOOK_CLEAR;
      else if (S.core.len) lo = Math.max(lo, coreTop(S) + 0.15);
      const ny = clamp(wn.y + dy, Math.min(lo, wn.y), HOOK_TOP);
      if (dy < 0 && ny >= wn.y - 1e-9 && h.x > -0.9) { S.winchBlock = 'Hook is down on the head'; tip(S, 'hookHead', 'The winch hook is sitting on top of the head. Slide the head LEFT to bring the winch down the middle of the mast.'); }
      S.winchV = (ny - wn.y) / dt; wn.y = ny;
    }
  }

  function tagged(S) {
    S.tagged = true; S.sfx.push('clank');
    const b = btm(S);
    S.run.from = b;
    if (S.hole.heave > 0.25) log(S, `Tagged high at ${b.toFixed(1)} ft: ${S.hole.heave.toFixed(1)} ft of heave in the casing. The next run starts in slough.`, 'warn');
    else log(S, `Tagged bottom at ${b.toFixed(1)} ft.`, 'good');
  }

  // ---------- one physics step ----------
  function step(S, dt) {
    if (S.paused || S.done) return;
    S.t += dt;
    const c = S.ctl, e = S.engine, h = S.head, w = S.water;
    if (S.nearMissT > 0) S.nearMissT -= dt;

    // engine
    if (e.crank > 0) {
      e.crank -= dt;
      e.rpm += (380 - e.rpm) * Math.min(1, dt * 6);
      if (e.crank <= 0) { e.on = true; e.crank = 0; e.rpm = Math.max(e.rpm, 920); log(S, 'Engine running. Bring the throttle up before you load the head.'); }
    }
    const avail = 0.35 + 0.65 * c.throttle;
    const lug = e.on ? Math.max(0, e.load - avail) : 0;
    const tgt = e.on ? 900 + 1300 * c.throttle - 1400 * lug : (e.crank > 0 ? 380 : 0);
    e.rpm += (tgt - e.rpm) * Math.min(1, dt * (e.on ? 2.2 : 1.5));
    if (e.on && e.rpm < 640) {
      e.on = false; c.oscOn = false;
      log(S, 'Engine stalled. You lugged it down: throttle up before you run the sonic head.', 'crit');
      S.sfx.push('alarm');
    }
    const ff = e.on ? clamp((e.rpm - 800) / 1300, 0, 1) : 0;   // share of full hydraulic flow
    const flowK = e.on ? 0.12 + 0.88 * ff : 0;

    // pipe handling functions
    slideStep(S, dt, flowK);
    armStep(S, dt, flowK);
    breakStep(S, dt, flowK);
    winchStep(S, dt, flowK);
    const canTilt = h.conn === 'core' && h.eng >= 1 && S.core.len === BARREL && S.core.bit <= -0.5;
    if (c.tilt && !canTilt && h.tilt <= 0) c.tilt = false;
    if (e.on) h.tilt = clamp(h.tilt + (c.tilt ? 1 : -1) * 0.35 * flowK * dt, 0, 1);
    const tiltLock = h.tilt > 0.01;

    // the string that moves with the head (if any)
    const conn = attached(S) ? h.conn : null, driving = !!conn;
    const heldStr = driving && (held(S, conn) || tiltLock);
    const bit = conn === 'casing' ? S.casing.depth : S.core.bit;
    const bottom = conn === 'core' ? btm(S) : Infinity;
    const onBottom = driving && (conn === 'casing' ? true : bit >= bottom - 0.02);
    const cutDepth = Math.max(0, bit) + 0.05;
    const L = layerAt(cutDepth);
    const stringLen = driving ? S[conn].len : 0;
    const stringW = conn === 'core' ? CORE_WPF * stringLen : conn === 'casing' ? CASING_WPF * stringLen : S.hang ? CASING_WPF * S.hang.len : 0;
    const feedDown = c.feed > 0.02, feedUp = c.feed < -0.02;
    const nativeCut = conn === 'core' ? bit >= S.hole.depth - 0.05 : true;
    const cobStr = conn === 'casing' && S.casing.depth < S.hole.depth ? 0.5 : 1;
    S.inCobble = driving && onBottom && nativeCut && S.cobbles.some(cb => cutDepth >= cb.a && cutDepth <= cb.b);

    // sonic head
    if (h.lock && h.temp < 200) { h.lock = false; log(S, 'Sonic head has cooled. The oscillator can be restarted.', 'good'); }
    const hzMax = e.on ? 150 * Math.pow(ff, 0.55) : 0;
    const hzTgt = c.oscOn ? Math.min(c.oscSet, hzMax) : 0;
    h.hz += clamp(hzTgt - h.hz, -70 * dt, 32 * dt);
    if (hzTgt === 0 && h.hz < 0.5) h.hz = 0;
    const shift = conn === 'casing' ? -0.06 * stringLen : -0.11 * Math.max(0, stringLen - 12);
    let fr = clamp(L.fRes + S.fOff[L.id] + shift, 45, 146);
    if (S.inCobble) fr = Math.min(148, fr + 14);
    // off bottom (free head, or shaking the core out of the barrel) there is no ground to tune against
    const res = h.hz > 8 ? (driving && onBottom ? Math.exp(-Math.pow((h.hz - fr) / 9, 2)) : 0.55) : 0;
    const sonic = h.hz > 8 ? 0.3 * clamp(h.hz / 80, 0, 1) + 1.3 * res : 0;
    S.res = res; S.fr = fr;

    // weight on bit
    const hb = c.holdback * HB_MAX, pdSet = c.feedSet * PD_MAX;
    let WOB = 0;
    if (driving && feedDown && onBottom && !heldStr && e.on) WOB = Math.max(0, pdSet * c.feed * AREA + HEAD_W + stringW - hb * AREA);
    S.wob = WOB;

    // water pump (flow first; pressure later)
    const truckHere = !w.truckAway && S.truckX > POS.truckHome - 3;
    let flow = 0, pumpDry = false;
    if (c.pumpOn && e.on && truckHere && !S.hoseBurst) {
      if (w.tank > 0.5) flow = c.pumpSet * 30 * (0.25 + 0.75 * ff);
      else pumpDry = true;
    }
    const lube = clamp(flow / 18, 0, 1);
    const throughRods = conn === 'core' && S.core.bit > S.casing.depth + 0.1;

    // rotation and threads
    let rpm = c.rot * 120 * flowK, pRot = 0, rotStall = false, threading = false;
    if (Math.abs(c.rot) > 0.02 && e.on) {
      pRot = 160 + Math.abs(rpm) * 2.2;
      const th = threadStep(S, rpm, dt);
      threading = th.busy; pRot += th.load;
      if (th.stall) pRot = ROT_RELIEF + 1;
      else if (driving && !threading) {
        if (onBottom) pRot += L.torque * (400 + WOB * 0.22) * (1 - 0.4 * res) * (conn === 'casing' ? 0.6 : 1);
        if (conn === 'casing') pRot += S.casing.depth * 9 * (1 - 0.5 * lube) + S.cuttings * 1400;
        else pRot += Math.max(0, S.core.bit) * 3;
        if (S.inCobble) pRot += cobStr * (700 + 380 * Math.sin(S.t * 23) * Math.sin(S.t * 7.3));
        pRot += S.stuck * 2000;
      }
      if (pRot >= ROT_RELIEF) { pRot = ROT_RELIEF; rpm = 0; rotStall = true; }
    } else rpm = 0;
    S.rpm = rpm;
    S.threading = threading;

    // oscillation pressure
    let pOsc = 0, oscRelief = false;
    if (h.hz > 2 && e.on) {
      pOsc = 450 + h.hz * 14;
      if (driving) {
        if (onBottom && conn === 'core') pOsc += L.oscLoad * (900 + WOB * 0.12) * (1 - 0.45 * res);
        if (conn === 'casing') pOsc += (L.oscLoad * (500 + WOB * 0.1) + S.casing.depth * 6 + S.cuttings * 1500) * (1 - 0.4 * res);
        if (heldStr && !tiltLock) pOsc += 900;
        pOsc += S.stuck * 1500;
      }
      if (pOsc > OSC_RELIEF) { pOsc = OSC_RELIEF; oscRelief = true; h.hz = Math.max(0, h.hz - 45 * dt); }
    }

    // feed: drilling a string, or moving the free head
    const cobF = S.inCobble ? (1 - cobStr) + cobStr * (0.18 + 0.6 * res) : 1;
    const base = conn === 'core' && bit < S.hole.depth - 0.02 ? 10 : L.base;
    const casF = conn === 'casing' ? (S.casing.depth < S.hole.depth ? 0.95 : 0.5) * (1 - 0.65 * S.cuttings) : 1;
    const overF = conn === 'core' && S.run.fill >= BARREL_CAP ? 0.35 : 1;
    const wobF = 1 - Math.exp(-WOB / L.wob);
    const rotF = 1 + L.rotBen * clamp(Math.abs(rpm) / 80, 0, 1.25);
    const ropPot = base * (sonic > 0 ? sonic : 0.12) * wobF * rotF * casF * cobF * overF * (0.3 + 0.7 * ff) * (1 - S.stuck);
    let vDown = 0, pFeed = 0, pHold = 0;
    S.headBottomed = false;
    const partial = (h.conn && h.eng < 1) || (S.hang && (S.hang.eng > 0 || S.hang.onArm)) || (h.conn === 'core' && S.jt && S.jt.eng < 1);
    if (driving && e.on) {
      if (feedDown) {
        const vCmd = c.feed * 1.0 * flowK;
        pHold = hb;
        if (heldStr) { vDown = 0; pFeed = pdSet * c.feed; }
        else if (onBottom) {
          const r = ropPot / 60;
          vDown = Math.min(vCmd, r);
          pFeed = r < vCmd ? pdSet * c.feed : Math.max(140, pdSet * c.feed * Math.sqrt(vCmd / Math.max(r, 1e-6)));
        } else { vDown = Math.min(vCmd, (bottom - bit) / dt); pFeed = 140 + 180 * c.feed; }
        const room = h.y - MAST_BOT;
        if (room <= 0.001) { vDown = 0; pFeed = pdSet * c.feed; S.headBottomed = true; }
        else if (vDown * dt > room) vDown = room / dt;
        if (GEO && conn === 'core' && S.phase === 'CORE_RUN') {          // 5 ft runs: the driller stops at the mark on the rod
          const mark = runTarget(S) - S.core.bit;
          if (mark <= 0.001) { vDown = 0; pFeed = 140; } else if (vDown * dt > mark) vDown = mark / dt;
        }
      } else if (feedUp) {
        const grip = (stringW + HEAD_W) / AREA + (conn === 'casing' ? S.casing.depth * 6 * (1 - 0.5 * lube) + S.cuttings * 900 : 0) + S.stuck * 2600 * (1 - 0.6 * res);
        const vCmd = -c.feed * 1.2 * flowK;
        const room = MAST_TOP - h.y;
        if (heldStr || grip > PULL_MAX) { pFeed = PULL_MAX; vDown = 0; }
        else { pFeed = grip + 120 * -c.feed; vDown = -Math.min(vCmd, room / dt, conn === 'casing' ? S.casing.depth / dt : 99); }
      }
      if (vDown !== 0) {
        const dx = vDown * dt;
        h.y = clamp(h.y - dx, MAST_BOT, MAST_TOP);
        if (conn === 'core') {
          const before = S.core.bit, after = before + dx;
          S.core.bit = after;
          if (dx > 0 && onBottom) coreAdvance(S, before, after, { L, flow: throughRods ? flow : 0, res, WOB, rpm, hz: h.hz });
          else tripMove(S, dx, dt);
          if (dx > 0 && !onBottom && after >= bottom - 0.021 && S.phase === 'TRIP_IN' && !S.tagged) tagged(S);
        } else {
          const before = S.casing.depth, after = Math.max(0, before + dx);
          S.casing.depth = after;
          if (dx > 0) casingAdvance(S, before, after, { L, flow, lube });
        }
      }
      S.contact = null;
    } else if (e.on && !partial && !tiltLock) {
      const lim = lowLimit(S);
      const v = feedDown ? c.feed * 1.0 * flowK : feedUp ? c.feed * 1.2 * flowK : 0;   // + = down
      if (v !== 0) {
        let ny = h.y - v * dt;
        if (v > 0 && ny <= lim.y) {
          if (h.y > lim.y + 1e-6 && lim.tgt) {
            S.sfx.push('clank');
            if (v > 0.45) { S.dmg.threads = Math.min(1, S.dmg.threads + 0.03 + 0.05 * (v - 0.45)); log(S, 'You came down hard on the threads. Ease the head down gently when you land on a joint.', 'warn'); }
          }
          ny = Math.min(h.y, lim.y);
        }
        h.y = clamp(ny, MAST_BOT, MAST_TOP);
        pFeed = feedDown ? 140 + 180 * c.feed : (HEAD_W + stringW) / AREA + 120 * -c.feed;
      }
      S.contact = lim.tgt && Math.abs(h.y - lim.y) < 0.025 ? lim.tgt : null;
    } else if (partial) {
      if (feedDown && e.on) { pFeed = pdSet * c.feed; if (c.feed > 0.6) { S.dmg.threads = Math.min(1, S.dmg.threads + dt * 0.01); tip(S, 'pushThread', 'Do not push down on a joint while you thread it. Let the head float.'); } }
      else if (feedUp && e.on) { pFeed = 900; tip(S, 'pullThread', 'The threads are part way engaged. Finish making up the joint, or spin it out, before you lift.', 'info'); }
    }
    // the clamps resize to whichever string the head is working on
    let want = null;
    if (S.contact === 'core' || S.contact === 'casing') want = S.contact;
    else if (S.contact === 'hang') want = S.hang.type === 'casing' ? 'casing' : 'core';
    else if (driving) want = conn;
    // ...but never let go of rods that only the clamps are holding up
    const clampOnly = S.work === 'core' && S.core.len > 0 && held(S, 'core') && !onBottomCore(S) && !(h.conn === 'core' && h.eng > 0) && S.winch.conn !== 'core';
    if (want && want !== S.work && !clampOnly) S.work = want;
    S.g.feedDir = feedDown ? 1 : feedUp ? -1 : 0;
    if (onBottom && vDown > 0) S.stats.onBottom += dt;
    S.rop += ((onBottom && vDown > 0 ? vDown * 60 : 0) - S.rop) * Math.min(1, dt * 4);
    checkDrop(S);

    // job phases follow what the driller actually does
    const nowOn = attached(S) ? h.conn : null;
    if (S.phase === 'CORE_RUN' && halfRun(S) && rodDown(S) && S.run.fill >= 0.5 && (!h.conn || feedUp || (!c.oscOn && h.hz < 1 && Math.abs(c.feed) < 0.04))) {
      S.run.to = S.core.bit; startTrip(S);       // a half run: no casing, straight to pulling the rods
    } else if (S.phase === 'CORE_RUN' && !h.conn && S.run.fill >= 0.5 && (!GEO || rodDown(S))) {
      S.run.to = S.core.bit; S.phase = 'OVERRIDE';
      log(S, `Run ${S.run.n} cored to ${S.core.bit.toFixed(1)} ft. Now override the casing down to the same depth.`);
    } else if (S.phase === 'OVERRIDE' && nowOn === 'core') startTrip(S);
    else if (S.phase === 'TRIP_OUT' && h.conn === 'casing') S.phase = 'OVERRIDE';
    else if (S.phase === 'TRIP_OUT' && h.tilt >= 0.99 && !S.run.done) {
      S.phase = 'EXTRUDE'; queueTask(S, 'tess', 'CATCH');
      log(S, 'Barrel is tilted out. Switch the sonic on to vibrate the core out for Tess.');
    } else if (S.phase === 'TRIP_IN') {
      if (!S.tagged && onBottomCore(S) && S.core.bit > 0) tagged(S);
      if (nowOn === 'core' && rodsIn(S) >= needRods(S.runs.length) && onBottomCore(S)) {
        S.phase = 'CORE_RUN'; S.run.from = btm(S); S.run.to = S.run.from;
        log(S, `${needRods(S.runs.length) > needRods(S.runs.length - 1) ? 'New rod is on' : 'Back on bottom'}. Run ${S.run.n} is ready to core from ${S.run.from.toFixed(1)} ft. Open the clamps.`, 'good');
      }
    }

    // flushing, plugs, sticking
    if (flow > 0 && S.casing.depth > 0.5) S.cuttings = Math.max(0, S.cuttings - dt * 0.07 * lube);
    if (conn === 'casing' && flow > 6) S.plug = Math.max(0, S.plug - dt * 0.05 * (flow / 30) * (1 + 2 * res));
    const sticking = driving && feedDown && !threading && (rotStall || (conn === 'casing' && S.cuttings > 0.75) || oscRelief) && !heldStr;
    if (sticking) S.stuck = Math.min(1, S.stuck + dt * 0.06);
    else if (S.stuck > 0) {
      const free = (feedUp ? 1 : 0.3) * (0.3 + 0.7 * (h.hz > 8 ? Math.max(res, 0.3) : 0)) * (0.5 + 0.5 * lube);
      S.stuck = Math.max(0, S.stuck - dt * 0.07 * free);
    }
    if (S.stuck >= 0.99 && !S.flags.stuckMsg) { S.flags.stuckMsg = 1; log(S, 'STUCK! The string will not go down. Back off with the oscillator on and flush water.', 'crit'); S.sfx.push('alarm'); }
    if (S.stuck < 0.3) S.flags.stuckMsg = 0;

    // pump pressure
    let pPump = 0;
    const intoString = conn === 'core' || conn === 'casing';
    if (c.pumpOn && e.on && truckHere && !S.hoseBurst) {
      if (pumpDry) { pPump = 10 + 30 * Math.abs(Math.sin(S.t * 9)); S.dmg.pump = Math.min(1, S.dmg.pump + dt * 0.003); }
      else {
        let r;
        if (throughRods) r = 0.9 + ((L.id === 'clay' || L.id === 'till') && onBottom ? 0.9 : 0);
        else if (conn === 'casing') r = 0.25 + S.cuttings * 1.2 + S.plug * 1.8;
        else r = 0.08;
        pPump = 30 + flow * flow * 0.25 * (1 + r * 3);
        if (pPump >= PUMP_RELIEF) { pPump = PUMP_RELIEF; flow *= 0.45; }
      }
    }
    if (pPump >= PUMP_RELIEF - 50) {
      S.pumpHigh += dt;
      if (S.pumpHigh > 4) {
        S.hoseBurst = true; S.pumpHigh = 0; flow = 0; S.dmg.pump = Math.min(1, S.dmg.pump + 0.05);
        log(S, 'Hose burst! The pump was dead-heading against a plug. Order a hose repair.', 'crit');
        S.sfx.push('burst');
      }
    } else S.pumpHigh = Math.max(0, S.pumpHigh - dt * 2);
    w.flow = flow;

    // where the water goes
    S.overflow = false;
    if (flow > 0) {
      const gal = flow / 60 * dt;
      w.tank = Math.max(0, w.tank - gal); w.used += gal;
      if (!intoString) { w.spilled += gal; tip(S, 'pumpAir', 'The pump is on with the head not threaded to anything. That water is going on the ground.', 'warn', 12); }
      else if (S.casing.depth > 0.5) w.level -= (throughRods ? gal * 0.3 : gal) / GAL_PER_FT;
      else if (!throughRods) w.spilled += gal;
    }
    // casing water vs the ground water at the shoe
    S.heaving = false;
    if (S.casing.depth > 0.5) {
      const Ls = layerAt(S.casing.depth - 0.05);
      const open = !(S.core.len > 0 && S.core.bit >= S.casing.depth - 0.3);
      const k = Ls.k * (open ? 1 : 0.12);
      const shoeBelowWT = S.casing.depth > WT;
      if (shoeBelowWT && w.level > WT + 0.01) {
        const q = k * (w.level - WT);
        w.level -= q / 60 * dt / GAL_PER_FT;
        if (Ls.heave > 0 && open) {
          S.heaving = tripHeave(S, q / 60 * dt * 0.08 * Ls.heave, Ls) > 0 && q > 0.3;
        }
      } else {
        const headAbove = (shoeBelowWT ? WT : S.casing.depth) - w.level;
        if (headAbove > 0) w.level += (k * headAbove * 0.3 + 0.02) / 60 * dt / GAL_PER_FT;
      }
      w.level = Math.min(w.level, S.casing.depth);
      if (w.level < 0) { const sp = -w.level * GAL_PER_FT; w.spilled += sp; S.stats.overflowGal += sp; w.level = 0; S.overflow = true; }
    } else w.level = 0;

    // temperatures, wear, engine load
    let heat = 0;
    if (h.hz > 5) heat = (h.hz / 150) * (0.45 + 1.7 * (1 - res)) * (driving && onBottom ? 1 : 1.5) * (pOsc / 3000);
    h.temp += (heat * 2.4 - (h.temp - 75) * 0.011) * dt;
    if (h.temp > 230) S.dmg.head = Math.min(1, S.dmg.head + dt * 0.004);
    if (h.temp > 265 && !h.lock) {
      h.lock = true; c.oscOn = false;
      log(S, 'Sonic head thermal cut-out! It will not restart until it cools below 200°F.', 'crit');
      S.sfx.push('alarm');
    }
    const clampFight = heldStr && !tiltLock && c.oscOn && h.hz > 8;
    if (clampFight) S.dmg.clamp = Math.min(1, S.dmg.clamp + dt * 0.004);
    if (S.inCobble && WOB > 6000 && Math.abs(rpm) < 15) {
      S.dmg.bit = Math.min(1, S.dmg.bit + dt * 0.01);
      if (!S.flags.bitMsg) { S.flags.bitMsg = 1; log(S, 'You are hammering a cobble without rotation. That is chewing up the bit.', 'warn'); }
    }
    const aux = (Math.abs(c.slide) > 0.03 ? 0.04 : 0) + (Math.abs(c.arm) > 0.03 ? 0.05 : 0) + (S.brkLoad ? 0.12 : Math.abs(c.brk) > 0.03 ? 0.03 : 0) + (S.winchV ? 0.08 : 0);
    e.load = (pOsc / OSC_RELIEF) * 0.5 + (pRot / ROT_RELIEF) * 0.25 + (pPump / PUMP_RELIEF) * clamp(flow / 30, 0, 1) * 0.15
      + (Math.abs(c.feed) > 0.02 ? 0.05 + (pFeed / 3000) * 0.08 : 0) + aux;
    const eq = 105 + 120 * e.load;
    S.hyd.temp += (eq - S.hyd.temp) * dt / 40;
    if (S.hyd.temp > 215) S.dmg.hyd = Math.min(1, S.dmg.hyd + dt * 0.002);

    S.shake = h.hz > 8 ? clamp((h.hz / 150) * (1 - res) * (driving && onBottom ? 1 : 1.3) + (clampFight ? 0.5 : 0), 0, 1.3) : 0;
    if (rotStall && !threading) S.shake = Math.max(S.shake, 0.25);

    S.g.feed = pFeed; S.g.hold = pHold; S.g.rot = pRot; S.g.osc = pOsc; S.g.pump = pPump;

    // run full message
    if (S.phase === 'CORE_RUN' && rodDown(S) && !S.flags.fullMsg) {
      S.flags.fullMsg = 1;
      log(S, halfRun(S) ? `At the mark: ${S.core.bit.toFixed(1)} ft. That is the 5 ft run. Sonic off. No casing this time: pull the rods for the SPT.` : `Rod is down: ${S.core.bit.toFixed(1)} ft. That is the run. Stop and break the head off the rods.`, 'warn');
      S.sfx.push('ok');
    }

    // alarms
    const al = [];
    if (h.lock) al.push(['crit', 'Head thermal cut-out']);
    else if (h.temp > 230) al.push(['crit', 'Sonic head over 230°F']);
    else if (h.temp > 200) al.push(['warn', 'Sonic head getting hot']);
    if (S.hyd.temp > 200) al.push(['crit', 'Hydraulic oil over 200°F']);
    if (rotStall && driving && !held(S, conn)) al.push(['crit', 'Rotation stalled at relief']);
    else if (rotStall) al.push(['info', 'Joint is tight: rotation at relief']);
    if (oscRelief) al.push(['warn', 'Sonic at relief, frequency sagging']);
    if (S.hoseBurst) al.push(['crit', 'Hose burst: pump out of service']);
    else if (pPump > 950) al.push(['crit', 'Pump pressure high: plugged?']);
    if (pumpDry) al.push(['crit', 'Pump running dry']);
    else if (w.tank < 30 && !w.truckAway) al.push(['warn', `Water tank low (${Math.round(w.tank)} gal)`]);
    if (w.truckAway) al.push(['info', 'Water truck away at the hydrant']);
    if (S.heaving) al.push(['crit', 'Sand heaving into the casing']);
    if (S.stuck > 0.5) al.push(['crit', S.stuck >= 0.99 ? 'String STUCK' : 'String sticking']);
    if (S.phase === 'CORE_RUN' && rodDown(S)) al.push(['warn', S.run.fill >= BARREL_CAP ? 'Core barrel overfull' : halfRun(S) ? 'At the 5 ft mark: stop the run' : 'Rod is down: stop the run']);
    if (driving && held(S, conn) && (feedDown || feedUp || c.oscOn)) al.push(['crit', 'A clamp is closed on the string']);
    if (S.winchBlock) al.push(['crit', S.winchBlock]);
    if (S.slideBlock) al.push(['warn', S.slideBlock]);
    if (S.headBottomed && feedDown) al.push(['info', 'Head at the bottom of its stroke']);
    if (S.inCobble) al.push(['warn', 'Cobble! Ease the feed, keep rotating']);
    if (e.on && e.rpm < 1150 && (h.hz > 8 || Math.abs(c.rot) > 0.02)) al.push(['warn', 'Engine lugging: throttle up']);
    if (S.overflow && S.phase !== 'OVERRIDE') al.push(['info', 'Casing overflowing: wasting water']);
    if (S.loose && !S.loose.dale) al.push(['info', 'Loose pipe in the top clamp']);
    S.alarms = al.map(a => [a[0], nm(S, a[1])]);

    crewStep(S, dt);
  }
  // ---------- driller actions from the console ----------
  const ACT = {
    engineStart(S) {
      if (S.engine.on || S.engine.crank > 0) return;
      S.engine.crank = 1.3; S.sfx.push('crank');
    },
    engineStop(S) {
      S.engine.on = false; S.engine.crank = 0; S.ctl.oscOn = false;
      log(S, 'Engine shut down.');
    },
    estop(S) {
      const c = S.ctl;
      S.engine.on = false; S.engine.crank = 0;
      c.feed = 0; c.rot = 0; c.winch = 0; c.slide = 0; c.arm = 0; c.brk = 0; c.oscOn = false; c.pumpOn = false;
      log(S, 'E-STOP pressed. Engine killed and all functions stopped.', 'crit');
      S.sfx.push('alarm');
    },
    setOsc(S, on) {
      if (on && S.head.lock) { log(S, 'The sonic head is in thermal cut-out. Let it cool below 200°F.', 'warn'); return false; }
      if (on && !S.engine.on) { log(S, 'Start the engine before switching on the oscillator.', 'warn'); }
      S.ctl.oscOn = !!on; S.sfx.push('switch'); return true;
    },
    setPump(S, on) { S.ctl.pumpOn = !!on; S.sfx.push('switch'); },
    setClampB(S, closed) {
      if (!closed) { const m = crewAtPipe(S); if (m) nearMiss(S, m); }
      S.ctl.clampB = !!closed; S.sfx.push('clamp');
      checkDrop(S);
    },
    setClampT(S, closed) {
      const lp = S.loose;
      if (!closed && lp) {
        if (lp.dale) { S.loose = null; S.ctl.clampT = false; S.sfx.push('clamp'); return; }
        S.loose = null; S.incidents++; S.stats.drops++;
        const dale = crewMember(S, 'dale');
        if (dale.task && dale.task.id === 'GRAB') dale.task = null;
        queueTask(S, 'dale', 'PICKUP', { type: lp.type });
        log(S, 'You opened the top clamp with nobody holding the pipe and it fell over. Call the helper to grab it first.', 'crit');
        S.sfx.push('clank'); S.sfx.push('alarm');
      } else if (!closed) { const m = crewAtPipe(S); if (m) nearMiss(S, m); }
      S.ctl.clampT = !!closed; S.sfx.push('clamp');
      checkDrop(S);
    },
    setSide(S, right) { S.ctl.side = !!right; S.sfx.push('switch'); },
    setTilt(S, out) {
      const h = S.head;
      if (out && !(h.conn === 'core' && h.eng >= 1 && S.core.len === BARREL && S.core.bit <= -0.5)) {
        log(S, 'Tilt only works with the core barrel alone on the head and pulled clear of the table.', 'warn'); return false;
      }
      const m = crewAtPipe(S); if (m) nearMiss(S, m);
      S.ctl.tilt = !!out; S.sfx.push('switch'); return true;
    },
    horn(S) { S.sfx.push('horn'); },
  };

  // ---------- what the driller should do next ----------
  const BREAK_HOW = 'TOP CLAMP open, push BREAK-OUT to MAKE to wind the clamp round, close the TOP CLAMP, then pull BREAK-OUT to BREAK. It takes two bites.';
  function guidance(S) {
    const c = S.ctl, e = S.engine, r = S.run, h = S.head, wn = S.winch;
    const L = layerAt(Math.max(0, (h.conn === 'casing' ? S.casing.depth : S.core.bit)) + 0.05);
    const f = v => v.toFixed(1);
    const on = attached(S) ? h.conn : null;
    const rods = rodsIn(S), top = S.core.len ? coreTop(S) : 0;
    const dale = crewMember(S, 'dale'), dTask = dale.task && dale.task.id;
    let title = '', text = '', ord = null;
    const partial = (h.conn && h.eng < 1) || (S.hang && (S.hang.eng > 0 || S.hang.onArm)) || (h.conn === 'core' && S.jt && S.jt.eng < 1);
    const breakSteps = k => {
      const j = S.jt && S.jt.above === k ? S.jt : null;
      if (gripB(S) !== 'core') return 'The joint is between the clamps. Close the BOTTOM CLAMP on the lower rod.';
      return `Break the joint (${Math.round((j ? Math.max(0, j.tight) : 1) * 100)}% tight): ${BREAK_HOW}`;
    };
    const headToCentre = what => {
      if (h.x < -0.02) {
        if (wn.conn || wn.y < h.y + HOOK_CLEAR) return `Winch the hook up out of the way (above ${(h.y + HOOK_CLEAR).toFixed(0)} ft), then slide the head back to CENTRE.`;
        return 'Slide the head RIGHT. With the switch on LEFT it stops at centre of mast.';
      }
      if (h.x > 0.02) return 'Slide the head LEFT. With the switch on RIGHT it stops at centre of mast.';
      return what;
    };
    const threadOn = (name, t) => {
      if (S.contact === 'core') return gripB(S) === 'core' ? `Sitting on the ${name}. Rotate FORWARD slowly to thread on. When the rotation pressure jumps, it is tight.` : `Sitting on the ${name}. Close the BOTTOM CLAMP to hold it, then rotate FORWARD slowly.`;
      if (h.y < t + TH - 0.05) return `Raise the head above the ${name} (top at ${f(t)} ft), then ease back down onto it.`;
      return `Ease the head DOWN onto the ${name} (top at ${f(t)} ft). Gently.`;
    };

    if (!e.on && e.crank <= 0 && S.phase !== 'DONE') text = 'Press START to fire up the engine, then bring the THROTTLE up to full.';
    else if (c.throttle < 0.8 && S.phase !== 'DONE') text = 'Throttle up. Every function needs hydraulic flow.';
    switch (S.phase) {
      case 'CORE_RUN':
        title = `Run ${r.n}: core ${f(r.from)} to ${f(runTarget(S))} ft`;
        if (text) break;
        if (on !== 'core') text = h.conn === 'core' ? 'Keep turning until the joint is tight.' : headToCentre(threadOn('rods', top));
        else if (rodDown(S) && halfRun(S)) text = 'At the mark, that is the 5 ft run. Centre the levers and switch the sonic OFF. No casing on this one: the rods come straight out for the SPT.';
        else if (rodDown(S)) text = 'Rod is down, that is the run. Centre the levers, sonic OFF. Close the BOTTOM CLAMP, then run ROTATION in REVERSE to unscrew the head from the rods.';
        else if (held(S, 'core')) text = 'Open the clamps so the string can move.';
        else if (!c.oscOn) text = 'Switch the OSCILLATOR on and set a frequency. Then ease the FEED lever down.';
        else text = 'Feed down and tune the FREQUENCY until the penetration rate jumps, the rig settles and the oscillation pressure dips. That is resonance.';
        if (c.pumpOn && !rodDown(S)) text += ' Pump is ON: that water goes down the rods and washes the core.';
        break;
      case 'OVERRIDE': {
        const short = S.casing.depth < S.hole.depth - 0.25;
        title = `Override casing to ${f(S.hole.depth)} ft`;
        if (text) break;
        if (on === 'casing') {
          if (!short) text = 'Casing is at depth. Sonic and pump OFF, levers centred. Close the BOTTOM CLAMP and run ROTATION in REVERSE to unscrew the head from the casing.';
          else if (h.y <= MAST_BOT + 0.05) text = 'Out of stroke on this joint. Close the BOTTOM CLAMP, reverse the head off and add another casing joint.';
          else if (held(S, 'casing')) text = 'Open the clamps, then drive the casing down.';
          else text = `Casing at ${f(S.casing.depth)} ft. PUMP on (about 12 to 20 gpm) to flush cuttings, sonic on, feed down. Stop when it reaches ${f(S.hole.depth)} ft.`;
        } else if (partial) text = 'Keep turning FORWARD slowly until the rotation pressure jumps. That is a tight joint. (Reverse spins it back out.)';
        else if (S.hang) {
          if (h.x > 0.02) text = hangBot(S) < Math.max(top, casTop(S)) + 0.1 ? `Raise the joint so its bottom clears the pipe in the table (${f(Math.max(top, casTop(S)))} ft).` : 'Slide the head LEFT. With the switch on RIGHT it stops at centre of mast.';
          else if (S.contact === 'hang') text = gripB(S) === 'casing' ? 'Landed on the casing. Rotate FORWARD slowly to make up the joint.' : 'Landed on the casing. Close the BOTTOM CLAMP to hold the casing, then rotate FORWARD slowly.';
          else text = 'Ease the joint DOWN over the rods and onto the casing. Gently.';
        } else if (!short) text = headToCentre(threadOn('rods', top));
        else if (S.arm.ang < 0.98) text = S.arm.holds || S.rack.casing ? 'Push the CASING ARM lever to RAISE: it stands a joint of casing up beside the mast.' : 'The casing rack is empty.';
        else if (!S.arm.holds) text = 'The arm is empty. Lower it to the rack to pick up another joint.';
        else if (h.x < 0.98) text = h.y < PRES_TOP + TH ? `Raise the head above ${f(PRES_TOP + TH)} ft so it clears the casing.` : (c.side ? 'Slide the head RIGHT to the stop, over the casing.' : 'Flip HEAD SIDE to RIGHT, then slide the head RIGHT to the stop.');
        else if (S.contact === 'arm') text = 'Sitting on the casing. Rotate FORWARD slowly to thread in. The arm holds the joint for you.';
        else text = 'Ease the head DOWN onto the casing. Gently.';
        if (S.arm.ang > 0.05 && !S.arm.holds && !partial) text += ' Bring the CASING ARM back down onto the rack.';
        break;
      }
      case 'TRIP_OUT': {
        title = S.core.bit > 0 ? `Trip out: barrel at ${f(S.core.bit)} ft` : 'Trip out: barrel at surface';
        if (text) break;
        const k = zoneJoint(S), j = S.jt;
        if (S.loose) {
          if (S.loose.dale) text = 'Dale has the rod. Open the TOP CLAMP.';
          else if (dTask === 'GRAB') text = 'Dale is coming for the rod. Hands off.';
          else if (!headClearOf(S, S.loose.bot + S.loose.len)) text = 'Raise the head clear of the rod, then call Dale.';
          else { text = 'The rod is standing in the top clamp. Call Dale: GRAB THE PIPE.'; ord = 'GRAB'; }
        } else if (wn.conn === 'stand') {
          text = !S.stand.free ? 'Dale has spun the stand out. Winch UP a touch to lift it clear of the lower rod.' : 'Winch DOWN to lay the stand out on the sawhorses as Dale walks the bottom out.';
        } else if (wn.conn === 'core') {
          if (dTask === 'SPIN_OUT') text = 'Hands off: Dale is on the joint with the chain wrench.';
          else if (rods < 2) { text = 'Only the barrel is left. Set its top between the clamps, close the BOTTOM CLAMP and have Dale unhook the winch.'; if (held(S, 'core')) ord = 'HOOK'; }
          else if (k === 2 && j && j.tight <= 0) { if (c.clampT) text = 'Joint is broken. Open the TOP CLAMP so Dale can spin it out.'; else { text = 'Joint is broken. Call Dale: CHAIN WRENCH.'; ord = 'WRENCH'; } }
          else if (k === 2) text = breakSteps(2);
          else if (held(S, 'core')) text = 'Open both clamps, then winch up.';
          else text = `Winch UP one 20 ft stand: stop with the second joint between the clamps (hook at about ${f(2 * JT + 2.6)} ft, now ${f(wn.y)}). Pull slow in sand and keep the casing full of water.`;
        } else if (S.hang) {
          const b = hangBot(S);
          if (partial) text = 'Keep REVERSING to finish unscrewing.';
          else if (gripT(S) === 'hang') text = 'The top clamp has the rod. Run ROTATION in REVERSE to unscrew the head from it.';
          else if (b > CLAMP_T - 0.1) text = `Lower the rod so it sits just above the lower rod (bottom below ${f(CLAMP_T - 0.1)} ft) where the top clamp can reach it.`;
          else text = 'Close the TOP CLAMP on the rod.';
        } else if (on === 'core') {
          if (rods === 0) {
            if (h.tilt > 0.01) text = 'Tilting out...';
            else if (S.core.bit > -0.5) text = held(S, 'core') ? 'Open the clamps, then pull the barrel out of the hole.' : 'Feed UP to pull the barrel out of the hole and clear of the table. Go slow in sand.';
            else text = 'The barrel is clear. Flip TILT to OUT to swing it out 45 degrees.';
          } else if (rods % 2) {
            if (j && j.above === 1 && j.tight <= 0) text = c.clampT ? 'Joint is broken. Open the TOP CLAMP.' : (gripB(S) === 'core' ? 'Run ROTATION in REVERSE to spin the top rod out of the string.' : 'Close the BOTTOM CLAMP, then reverse.');
            else if (k === 1) text = breakSteps(1);
            else if (held(S, 'core')) text = 'Open the clamps, then feed up.';
            else text = `Odd number of rods (${rods}): take the top single off with the head. Feed UP until the first joint is between the clamps (head at about ${f(JT + 2.6)} ft).`;
          } else if (S.core.bit > S.hole.depth - 1.5 && !held(S, 'core')) text = 'Raise the rods about 2 ft so the barrel is up inside the casing.';
          else text = 'Close the BOTTOM CLAMP and run ROTATION in REVERSE to unscrew the head from the rods.';
        } else if (partial) text = 'Keep turning until the joint is tight (forward) or free (reverse).';
        else if (rods === 0 || rods % 2) text = headToCentre(threadOn(rods ? 'rods' : 'barrel', top));
        else if (h.x > -0.98) text = h.y < top + TH + 0.3 && centred(S) ? 'Raise the head off the rods a little.' : (c.side ? 'Flip HEAD SIDE to LEFT, then slide the head LEFT to the stop.' : 'Slide the head LEFT to the stop to make room for the winch.');
        else if (wn.y < top + 0.05 || wn.y > top + 1.6) text = `Bring the WINCH hook to the top of the rods (hook at ${f(wn.y)} ft, rod top at ${f(top)} ft).`;
        else { text = 'Hook is at the rods. Call Dale: HOOK UP / UNHOOK WINCH.'; ord = 'HOOK'; }
        break;
      }
      case 'EXTRUDE':
        title = 'Vibrate the core out';
        if (text) break;
        text = crewMember(S, 'tess').hidden ? 'Waiting for Tess to get back with the water truck.' : (h.hz > 20 ? 'Tess is catching the core in a sleeve. Keep it vibrating.' : 'Switch the OSCILLATOR on (about 60 Hz) to shake the core out for Tess. Do not move the head.');
        break;
      case 'TRIP_IN': {
        title = S.tagged ? `Barrel on bottom at ${f(btm(S))} ft` : 'Trip in';
        if (text) break;
        const prev = needRods(S.runs.length - 1), now = needRods(S.runs.length), j = S.jt;                 // rods that came out and have to go back, and rods the next run needs
        if (h.tilt > 0.01 || c.tilt) text = c.oscOn ? 'Switch the OSCILLATOR off.' : 'Flip TILT to IN to bring the barrel back to vertical.';
        else if (wn.conn === 'stand') {
          if (dTask === 'SPIN_IN') text = 'Hands off: Dale is spinning the stand in.';
          else if (S.stand.lay > 0) text = 'Winch UP to stand the 20 footer up in the mast.';
          else if (S.stand.bot > top + TH + 0.04) text = 'Winch DOWN gently to set the stand in the box of the rod below.';
          else if (gripB(S) !== 'core') text = 'Close the BOTTOM CLAMP so the string cannot turn.';
          else { text = 'The stand is sitting in the box. Call Dale: CHAIN WRENCH.'; ord = 'WRENCH'; }
        } else if (wn.conn === 'core') {
          const k = zoneJoint(S);
          if (j && j.tight < 1) {
            if (k !== j.above) text = 'Bring the hand-tight joint between the clamps to torque it.';
            else if (gripB(S) !== 'core') text = 'Close the BOTTOM CLAMP.';
            else if (S.tc.ang >= 0.99) text = c.clampT ? 'The clamp is at the end of its swing. Open the TOP CLAMP and pull BREAK-OUT to BREAK to swing it back for another bite.' : 'Pull BREAK-OUT to BREAK to swing the open clamp back, then close it and MAKE again.';
            else if (!c.clampT && S.tc.ang > 0.3) text = 'Pull BREAK-OUT to BREAK to swing the open top clamp all the way back first.';
            else text = c.clampT ? `Push BREAK-OUT to MAKE to torque the joint (${Math.round(j.tight * 100)}%).` : 'Close the TOP CLAMP, then push BREAK-OUT to MAKE to torque the joint.';
          } else if (onBottomCore(S)) { text = 'On bottom. Centre the winch lever and call Dale to UNHOOK.'; ord = 'HOOK'; }
          else if (rods < prev && S.yard.stands > 0 && top <= ZONE_HI + 0.05) { text = held(S, 'core') ? 'Call Dale to UNHOOK, then hook the next stand.' : 'Close the BOTTOM CLAMP, then call Dale to UNHOOK.'; if (held(S, 'core')) ord = 'HOOK'; }
          else if (rods < prev && S.yard.singles > 0 && top <= ZONE_HI + 0.05) { text = held(S, 'core') ? 'Call Dale to UNHOOK. The last single goes on with the head.' : 'Close the BOTTOM CLAMP, then call Dale to UNHOOK.'; if (held(S, 'core')) ord = 'HOOK'; }
          else if (held(S, 'core')) text = 'Open both clamps, then winch down.';
          else text = rods >= prev ? 'Winch DOWN until the barrel tags bottom.' : 'Winch DOWN 20 ft: stop with the top of the stand between the clamps (hook at about 2.6 ft).';
        } else if (on === 'core') {
          if (rods >= prev && !onBottomCore(S)) text = held(S, 'core') ? 'Open the clamps and feed down.' : 'Feed DOWN to run the string to bottom.';
          else if (rods >= prev) text = 'On bottom. Close the BOTTOM CLAMP and REVERSE the head off. A new rod goes on next.';
          else if (top > ZONE_HI + 0.05) text = held(S, 'core') ? 'Open the clamps and feed down.' : `Feed DOWN until the top of the ${rods ? 'string' : 'barrel'} is between the clamps (head at about 2.6 ft).`;
          else text = 'Close the BOTTOM CLAMP and run ROTATION in REVERSE to unscrew the head.';
        } else if (partial) text = 'Keep turning FORWARD slowly until the rotation pressure jumps.';
        else if (dTask === 'STAB') text = 'Dale is bringing a rod. Hands off the controls.';
        else if (rods < prev && S.yard.stands > 0) {
          if (!held(S, 'core') && !onBottomCore(S)) text = 'Close the BOTTOM CLAMP.';
          else if (h.x > -0.98) text = c.side ? 'Flip HEAD SIDE to LEFT, then slide the head LEFT to the stop.' : 'Raise the head off the string and slide it LEFT to the stop.';
          else if (wn.y > 6) text = `Winch the hook DOWN to Dale at the sawhorses (below 6 ft, now ${f(wn.y)}).`;
          else { text = `${S.yard.stands} stand${S.yard.stands > 1 ? 's' : ''} on the sawhorses. Call Dale: HOOK UP.`; ord = 'HOOK'; }
        } else if (rods < prev || (rods < now && onBottomCore(S))) {
          const b = stabBlock(S), what = rods < prev ? 'the single' : 'a new rod';
          if (h.x < -0.02 || (centred(S) && h.y < top + JT + TH + 0.15)) text = h.x < -0.02 ? headToCentre('') : `Raise the head above ${f(top + JT + TH + 0.2)} ft to make room for ${what}.`;
          else if (b) text = b;
          else { text = `Call Dale: STAB A ROD (${what}).`; ord = 'STAB'; }
        } else text = headToCentre(threadOn('rods', top));
        break;
      }
      case 'SPT':
        title = `SPT at ${S.spt ? S.spt.depth : 0} ft`; text = 'The rods are out. The crew runs the SPT down the hole: AW rods, the anvil, then the hammer. Count the blows.';
        break;
      case 'DONE':
        title = 'Hole complete'; text = GEO ? 'Nice work. The hole is cored and every SPT is on the log.' : 'Nice work. The hole is cored and cased.';
        break;
    }
    return { title: nm(S, title), text: nm(S, text), layer: L, order: ord };
  }

  useSite(1);
  return {
    MAST_TOP, MAST_BOT, get RUN_LEN() { return RUN_LEN; }, get GEO() { return GEO; }, needRods, halfRun, sptDone, wetRun, TANK_CAP, PD_MAX, HB_MAX, AREA, HEAD_W, CORE_WPF, POS, MATS, TASKS, CLOCK_RATE,
    get TARGET() { return TARGET; }, get WT() { return WT; }, get LAYERS() { return LAYERS; }, useSite,
    TH, CLAMP_B, CLAMP_T, ZONE_LO, ZONE_HI, BARREL, JT, PRES_TOP, HOOK_TOP, HOOK_CLEAR,
    layerAt, newGame, step, order, ACT, guidance, nm, clockStr, taskProgress, notesText, noteKeys, NOTE_TEXT,
    coreTop, casTop, btm, rodsIn, runTarget, rodDown, BARREL_CAP, hangBot, gripB, gripT, held, zoneJoint, jointY, attached, onBottomCore,
  };
})();
