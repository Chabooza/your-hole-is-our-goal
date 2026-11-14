'use strict';
/* Aaron's call. From hole 3 on, at some point while the driller is coring, the cell phone rings. The drilling holds
   still, the driller answers, and Aaron says there is another job coming up: this hole has to be done in so many
   minutes. A countdown then runs until the well is built. Finish in time and nothing is lost. Run over and the grade
   drops: 5 points at the buzzer, then 1 more for every 30 seconds late, 15 at most.

   The time allowed is worked out from what is left to do (par), times a slack that shrinks every hole: plenty of
   room for trouble on hole 3, next to none on hole 10. The clock counts game time: while the rig is working it runs at
   the game's speed (so fast-forward burns it faster), and during a prompt, a breakdown, a Zonnic throw or the well
   install it runs at one second a second. It stops while the game is paused and while the core is on the table.

   Par was measured with a robot player on every site (the numbers in par() are fitted to those runs):
   the crew's pipe handling per run by depth, coring and casing per foot by material, and the well by depth. */
window.AARON = (() => {
  const $ = id => document.getElementById(id);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const FIRST = 3;               // the first hole Aaron calls on
  const SLACK = [1.6, 1.2];      // time allowed over par for the player's own work: on the first hole he calls, and on the last
  const FULL_CREW = 2.0;         // full rig: the player does the pipe handling too, so that part of par is doubled
  const FULL_EXTRA = 0.3;        // ...and gets this much more slack on the drilling
  const RING_MAX = 8;            // seconds it rings before the driller picks up anyway
  const LINE = 3.0;              // seconds each thing Aaron says stays up (a tap moves it on)
  const PEN0 = 5, PEN_EVERY = 30, PEN_MAX = 15;      // late: points off at the buzzer, seconds per further point, the most it can cost

  const HELLO = ["Hey, bud, how's it going?", 'Hey, bud. Got a second?', "Hey, bud. How's the hole?", "Bud! It's Aaron."];
  const NEWS = ["Just wanted to let you know you've got another job coming up.", 'So, the next job got moved up on us.', 'The client on the next one is already on site.', "I've booked you another hole after this one. Today."];
  const HURRY = ['Which means you got to get this hole done quick. You have {t}.', 'So get this one done quick. I need you rolling in {t}.', "So no messing around, eh? You've got {t} to finish up.", 'So wrap this hole up. {t}, bud. Not a second more.'];
  const REPLY = ['Yeah, yeah. On it.', 'No problem, Aaron.', '...Great.', 'Sure. Why not.', 'You got it, boss.'];
  const HALF = ["How's that hole coming, bud?", 'Half your time is gone, bud.', 'Client just called again. No pressure.'];
  const TWO = ['Two minutes, bud. Wrap it up.', 'You packing up yet? Two minutes.'];
  const LATE = ["You're late, bud. The clock is still running.", "That's time. The client is waiting, bud."];
  const MADE = ['Nice work, bud. Get rolling.', 'Good stuff. See you at the next one.'];
  const MISSED = ["We'll talk about this later.", 'The client is not happy, bud.'];
  const LOOK = { suit: 0x3a4658, suitDark: 0x2a3444, patch: 'Aaron', hat: 0xf6f6f1, hatTrim: 0xd9d9d2, skin: 0xe6b48c, nose: 0xd9a37b, vest: 0xf47a1f, shirt: 0xbcd3ee,
    brow: 0x2b1d14, eye: 0x3a2a1c, glasses: 'none', lensClear: true, wire: false, lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0x17171a, smile: true,
    build: 1.06, height: 1, hair: 0x2b1d14, stache: 0x2b1d14, stacheStyle: 'medium' };

  let APP, E = null, st = '', t = 0, at = 0, lines = [], li = 0, lastT = 0, face = '', toastT = 0, ringT = 0, meTimer = null;
  const last = {};

  // ---------- how long the rest of the hole should take ----------
  const rotF = L => 1 + L.rotBen * Math.min(1.25, 0.75 * L.maxRpm / 80);
  function span(a, b, fn) { let s = 0; for (const L of SIM.LAYERS) { const lo = Math.max(a, L.top), hi = Math.min(b, L.bot); if (hi > lo) s += (hi - lo) * fn(L); } return s; }
  const cobFt = (S, a, b) => S.cobbles.reduce((s, c) => s + Math.max(0, Math.min(b, c.b) - Math.max(a, c.a)), 0);
  const coreT = (S, a, b) => span(a, b, L => 61 / (L.base * rotF(L))) + cobFt(S, a, b) * 6;
  const casT = (a, b) => span(a, b, L => 44 / L.base);
  // the crew's pipe handling for the run that starts at `from`: tripping out, and back in unless it is the last run
  const crewT = (from, final) => (final ? 165 + 51 * Math.max(0, Math.floor((from - 10) / 20)) : from === 0 ? 125 : 180 + 90 * Math.ceil(from / 20));
  function wellT(S) {
    const D = SIM.TARGET; let s = 20 + (D / 10 + 2) * 7;
    for (let d = 10; d <= D; d += 10) s += 22 + SITES.pourLag(d, S.site.n);
    return s;
  }
  // seconds of game time a good player needs from here: { drill, crew, well }
  function par(S) {
    const D = SIM.TARGET, R = SIM.RUN_LEN, from = Math.min(D - R, Math.max(0, Math.round((S.run.from || 0) / R) * R));
    const bit = clamp(Math.max(S.hole.depth, S.core.bit || 0), from, from + R);
    let drill = 0, crew = 0;
    for (let f = from; f < D; f += R) {
      const a = f === from ? bit : f;
      drill += (f === from ? 0 : 5) + coreT(S, a, f + R) + casT(f, f + R);
      crew += crewT(f, f + R >= D);
    }
    return { drill, crew, well: wellT(S) };
  }
  function allow(S) {
    const p = par(S), k = clamp((S.site.n - FIRST) / Math.max(1, SITES.COUNT - FIRST), 0, 1), s = lerp(SLACK[0], SLACK[1], k);
    const sec = APP.easy ? p.crew + (p.drill + p.well) * s : p.crew * FULL_CREW + p.drill * (s + FULL_EXTRA) + p.well * s;
    return Math.max(5, Math.round(sec / 60)) * 60;          // Aaron deals in whole minutes
  }
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const minutes = s => { const m = Math.round(s / 60); return m + (m === 1 ? ' minute' : ' minutes'); };

  // ---------- the phone ----------
  // coring, and nothing else going on: the only time the phone rings
  function drilling() {
    const S = APP.S;
    if (S.done || S.paused || APP.away || APP.menu || APP.fly || APP.freeze || WELL.active || TOSS.state.state || NAG.active || MARL.active) return false;
    if (APP.easy) return AUTO.manual === 'core' && !AUTO.st.qte && !AUTO.st.failed;
    return S.phase === 'CORE_RUN' && S.head.conn === 'core' && S.head.hz > 8;
  }
  function init(app) {
    APP = app;
    E = { root: $('aaron'), status: $('arStatus'), answer: $('arAnswer'), bubble: $('arBubble'), say: $('arSay'), face: $('arFace'),
      timer: $('arTimer'), time: $('arTime'), label: $('arLabel'), text: $('arText'), textSay: $('arTextSay'), me: $('bubMe') };
    E.answer.addEventListener('click', answer);
    E.root.addEventListener('pointerdown', e => { if (st === 'talk' && t > 0.35) { e.preventDefault(); next(); } });
    reset();
  }
  function reset() {
    st = ''; t = 0; toastT = 0; lastT = APP ? APP.S.t : 0;
    const S = APP && APP.S;
    // the phone rings somewhere in the first part of the hole
    at = S ? SIM.TARGET * (0.06 + Math.random() * 0.32) : 0;
    if (E) { E.root.hidden = true; E.timer.hidden = true; E.text.hidden = true; }
    document.body.classList.remove('on-call');
    for (const k in last) delete last[k];
  }
  function ring() {
    const S = APP.S;
    st = 'ring'; t = 0; ringT = 0;
    if (!face) { try { face = WORLD.portraits([LOOK], 160, 180)[0] || ''; } catch (e) { face = ''; } }
    E.face.style.backgroundImage = face ? `url(${face})` : ''; E.face.textContent = face ? '' : 'A';
    E.root.dataset.state = 'ring'; E.root.hidden = false; E.bubble.hidden = true;
    E.status.textContent = 'calling…';
    document.body.classList.add('on-call');
    PANEL.setHands(false);
    S.aaronCalled = true;
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: 'Your phone is ringing. It is Aaron.', lvl: 'warn' });
  }
  function answer() {
    if (st !== 'ring' || APP.S.paused) return;
    AUDIO.init();
    const S = APP.S, limit = allow(S);
    S.aaron = { limit, left: limit, half: false, two: false, zero: false, done: false, pen: 0 };
    lines = [pick(HELLO), pick(NEWS), pick(HURRY).replace('{t}', minutes(limit))]; li = 0;
    st = 'talk'; t = 0;
    E.root.dataset.state = 'talk'; E.status.textContent = 'on the phone';
    E.say.textContent = lines[0]; E.bubble.hidden = false;
    S.sfx.push('ok');
  }
  function next() {
    if (st !== 'talk') return;
    li++; t = 0;
    if (li < lines.length) { E.say.textContent = lines[li]; return; }
    hangUp();
  }
  function hangUp() {
    const S = APP.S, A = S.aaron;
    st = ''; E.root.hidden = true; document.body.classList.remove('on-call');
    if (!APP.away && !APP.menu) PANEL.setHands(true);
    E.me.querySelector('span').textContent = pick(REPLY); E.me.hidden = false;
    clearTimeout(meTimer); meTimer = setTimeout(() => { E.me.hidden = true; }, 2200);
    lastT = S.t;
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: `Aaron: another job is waiting. ${minutes(A.limit)} to finish this hole, well and all.`, lvl: 'warn' });
    S.sfx.push('switch');
    E.timer.classList.remove('pop'); void E.timer.offsetWidth; E.timer.classList.add('pop');
  }
  // a text from Aaron: a banner that does not stop anything
  function text(line) {
    E.textSay.textContent = line; E.text.hidden = false; toastT = 4.5;
    APP.S.sfx.push('buzz');
  }

  // the well is built: stop the clock and say what it cost. Called by the well install as it works out the grade
  function settle(S) {
    const A = S.aaron;
    if (!A || A.done) return A || null;
    A.done = true;
    A.late = Math.max(0, -A.left);
    A.pen = A.late > 0 ? Math.min(PEN_MAX, PEN0 + Math.floor(A.late / PEN_EVERY)) : 0;
    A.spare = Math.max(0, A.left);
    text(pick(A.pen ? MISSED : MADE));
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: A.pen ? `Aaron's deadline missed by ${mmss(A.late)}. ${A.pen} points off the grade.` : `Aaron's deadline made with ${mmss(A.spare)} to spare.`, lvl: A.pen ? 'crit' : 'good' });
    return A;
  }

  function update(S, dt) {
    if (!E) return;
    const off = APP.menu || APP.away || APP.fly;
    if (toastT > 0 && !S.paused) { toastT -= dt; if (toastT <= 0) E.text.hidden = true; }
    if (st) E.root.hidden = off;
    // the call
    if (!S.paused && !off) {
      if (st === '' && !S.aaron && !S.aaronCalled && S.site.n >= FIRST && S.hole.depth >= at && drilling()) ring();
      else if (st === 'ring') {
        t += dt; ringT -= dt;
        if (ringT <= 0) { ringT = 1.7; S.sfx.push('ring'); }
        if (t >= RING_MAX) answer();
      } else if (st === 'talk') { t += dt; if (t >= LINE) next(); }
    }
    // the countdown
    const A = S.aaron, dS = Math.max(0, S.t - lastT); lastT = S.t;
    const show = !!A && !off && st === '' && !(A.done && toastT <= 0);
    if (E.timer.hidden === show) E.timer.hidden = !show;
    if (!A || A.done) return;
    let d = dS;                                   // game time that went by on the rig
    if (!d && !S.paused && !off && !st) {         // the rig is held still: a prompt, a breakdown, a throw, or the well install
      if (S.done) { const W = S.well; if (W && WELL.active && $('plan').hidden && /^(pour|pull|wreck|pvc|result)$/.test(W.phase)) d = dt; }
      else if ((APP.easy && AUTO.st.qte) || TOSS.busy || NAG.busy || MARL.busy) d = dt;
    }
    A.left -= d;
    if (!A.half && A.left <= A.limit / 2 && A.left > 150) { A.half = true; text(pick(HALF)); }
    if (!A.two && A.left <= 120 && A.left > 0) { A.two = true; text(pick(TWO)); }
    if (!A.zero && A.left <= 0) { A.zero = true; text(pick(LATE)); S.sfx.push('alarm'); }
    const txt = A.left >= 0 ? mmss(A.left) : '+' + mmss(-A.left), lvl = A.left <= 0 ? 'late' : A.left <= 120 ? 'low' : A.left <= A.limit * 0.25 ? 'warn' : 'ok';
    if (last.txt !== txt) { last.txt = txt; E.time.textContent = txt; }
    if (last.lvl !== lvl) { last.lvl = lvl; E.timer.dataset.lvl = lvl; E.label.textContent = lvl === 'late' ? 'Late for Aaron' : "Aaron's deadline"; }
  }
  // Enter, Space or A answers the phone and moves the talk on. While the phone is up, other keys wait.
  function key(e) {
    if (st !== 'ring' && st !== 'talk') return false;
    if (e.code === 'Escape') return false;
    if (!e.repeat && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyA')) { if (st === 'ring') answer(); else if (t > 0.35) next(); }
    return true;
  }

  return { init, reset, update, key, settle, par, allow, get busy() { return st === 'ring' || st === 'talk'; }, get active() { return st !== ''; },
    call() { at = 0; APP.S.aaronCalled = false; APP.S.aaron = null; },          // for testing: ring on the next moment of drilling
    get state() { return { st, t, at, aaron: APP.S.aaron }; } };
})();
