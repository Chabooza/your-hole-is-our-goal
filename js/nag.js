'use strict';
/* The engineer has a word. When a run comes up with less than 90% recovery, the engineer walks over a couple of seconds
   into the next core run, taps the driller on the shoulder and says something cutting. The driller turns to look,
   the drilling holds still for those few seconds, then he turns back and carries on. It is the same engineer who brings
   the well drawing at the end of the hole. The 3D side is setVisit / updateVisit in js/world.js. */
window.NAG = (() => {
  const $ = id => document.getElementById(id);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  const POOR = 0.9;              // a run under this recovery earns a visit
  const AFTER = 2.5;             // seconds of drilling into the next run before the engineer sets off
  const WALK = 1.6, TAP = 0.6, TALK = 3.4;

  const LINES = [
    'First time drilling? What was that last run?',
    '{pct}% recovery? Did you drill it or just scare it?',
    'I am paying for core, not for holes.',
    'Where is the rest of my core?',
    'My kid gets better recovery in the sandbox.',
    'Was that a real run, or a practice one?',
    'You do know the core goes IN the barrel, right?',
    '{pct}%. I have seen better from a post-hole digger.',
    'Do I need to find another driller?',
    'Were you drilling with your eyes closed?',
  ];

  let APP, E, seen = 0, pending = null, st = '', t = 0, drillT = 0, look = null, bag = [], who = null;
  const last = {};

  // coring, and nothing else going on
  function drilling() {
    const S = APP.S;
    if (S.done || S.paused || APP.away || APP.menu || APP.fly || APP.freeze || WELL.active || TOSS.state.state || MARL.active || AARON.active) return false;
    if (APP.easy) return AUTO.manual === 'core' && !AUTO.st.qte && !AUTO.st.failed;
    return S.phase === 'CORE_RUN' && S.head.conn === 'core' && S.head.hz > 8;
  }
  function init(app) { APP = app; E = { bub: $('bubEng') }; reset(); }
  function reset() {
    seen = APP.S.runs.length; pending = null; st = ''; t = 0; drillT = 0; look = null;
    if (E) E.bub.hidden = true;
    WORLD.setVisit(null);
  }
  function end() {
    st = ''; E.bub.hidden = true; WORLD.setVisit(null);
    if (!APP.easy && look) { WORLD.look.tYaw = look.yaw; WORLD.look.tPitch = look.pitch; WORLD.look.tFov = look.fov; }
    look = null;
  }

  function update(S, dt) {
    if (S.runs.length > seen) {                   // a run has just been logged: was it a poor one?
      seen = S.runs.length;
      const r = S.runs[seen - 1];
      if (r && r.recovery < POOR && !S.done) { pending = { n: r.n, pct: Math.round(r.recovery * 100) }; drillT = 0; }
    } else if (S.runs.length < seen) seen = S.runs.length;
    if (S.paused && (st === 'tap' || st === 'talk') && !APP.menu) { const h = WORLD.engHead(); WORLD.aim(h.x, h.y - 0.3, h.z, 50); }      // paused mid-word: keep looking at them
    if (S.paused || APP.menu) return;
    if (st === '') {
      if (pending && drilling()) { drillT += dt; if (drillT >= AFTER) { st = 'come'; t = 0; who = WELL.engineer(S); } }
      return;
    }
    if (APP.away || S.done || WELL.active) { end(); return; }
    t += dt;
    if (st === 'come') {                          // walking up behind the driller, who has not noticed yet
      if (!drilling()) { st = ''; drillT = 0; WORLD.setVisit(null); return; }       // something else came up: try again in a bit
      WORLD.setVisit({ look: who.look, k: Math.min(1, t / WALK), out: false, tap: false, talk: false });
      if (t >= WALK) {
        st = 'tap'; t = 0;
        look = { yaw: WORLD.look.tYaw, pitch: WORLD.look.tPitch, fov: WORLD.look.tFov };
        S.sfx.push('knock'); setTimeout(() => S.sfx.push('knock'), 190);
      }
    } else if (st === 'tap' || st === 'talk') {  // a tap on the shoulder, the driller turns, and gets an earful
      if (st === 'tap' && t >= TAP) {
        st = 'talk'; t = 0;
        if (!bag.length) { bag = LINES.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
        const line = bag.pop().replace(/\{pct\}/g, pending.pct);
        E.bub.firstChild.textContent = line;
        S.stats.nags = (S.stats.nags || 0) + 1;
        S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: `${who.name}, the engineer, on run ${pending.n} (${pending.pct}% recovery): "${line}"`, lvl: 'warn' });
        pending = null;
      }
      WORLD.setVisit({ look: who.look, k: 1, out: false, tap: st === 'tap', talk: st === 'talk' });
      const h = WORLD.engHead();
      WORLD.aim(h.x, h.y - 0.3, h.z, 50);
      if (st === 'talk') {
        const p = WORLD.project(h);
        if (p.front) { E.bub.hidden = false; E.bub.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`; } else E.bub.hidden = true;
        if (t >= TALK) {                          // back to work
          st = 'leave'; t = 0; E.bub.hidden = true;
          if (!APP.easy && look) { WORLD.look.tYaw = look.yaw; WORLD.look.tPitch = look.pitch; WORLD.look.tFov = look.fov; }
          look = null;
        }
      }
    } else if (st === 'leave') {
      WORLD.setVisit({ look: who.look, k: Math.max(0, 1 - t / WALK), out: true, tap: false, talk: false });
      if (t >= WALK) end();
    }
  }

  return { init, reset, update, get busy() { return st === 'tap' || st === 'talk'; }, get active() { return st !== ''; },
    poke(pct, n) { pending = { n: n || 1, pct: pct || 70 }; drillT = 0; }, get state() { return { st, t, pending, drillT }; } };
})();
