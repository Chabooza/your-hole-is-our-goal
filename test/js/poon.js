'use strict';
/* Poon Daddy: the secret helper. He worked with the crew for over 15 years, and he only shows up when it all goes wrong.

   How he is unlocked. Every mess-up on the list for the hole's mission type has to happen in ONE hole:
     Environmental: the engineer has a word (a run under 90%), a missed Zonnic, a dropped length of pipe, a wrecked well.
     Geotechnical:  the engineer has a word, the SPT rods down the hole, a cross-threaded PVC fitting, the drum run over
                    (the slap), a clumped pump (up the tower), grout out the top (the deer).
   A new hole starts the list again. The other files call POON.mark(S, 'key') when one of them happens.

   When the last one has played out, his truck pulls up, the two helpers walk off the job, and he walks in: "Sup
   faggots." "Daddy's home." POON DADDY. He is the only helper for the rest of that hole. When the hole is finished, and
   before the report, the camera finds him: hands on his hips, chest out, a spotlight, and "Poon Daddy unlocked". From
   then on he is on the crew list.

   He never fumbles. With him on the crew (or after he has turned up), every prompt that is a helper's job does itself:
   the PVC on the well, the SPT rods and anvil, the fitting and the bentonite on the grouting. His SPT counts are always
   right, and when it is his turn to pour the grout it goes in perfect. The driller's own prompts are still the driller's.

   What is seen is acted out by js/world.js (setPoon); the times are WORLD.POON. Saved in the browser as yhiog-poon. */
window.POON = (() => {
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const KEY = 'yhiog-poon';
  const ID = 'poon', NAME = 'Poon Daddy';
  const HINT = 'Only shows up when it all goes wrong.';
  // the mess-ups, by mission type (js/sites.js). The words are only for this file and the README: the game never lists them
  const LISTS = {
    env: [['nag', 'The engineer has a word'], ['zmiss', 'Miss a Zonnic'], ['pipe', 'Drop a length of pipe'], ['wreck', 'Wreck the well']],
    geo: [['nag', 'The engineer has a word'], ['rods', 'Drop the SPT rods'], ['fit', 'Cross-thread the fitting'], ['slap', 'Run the drum over'], ['clump', 'Clump the pump'], ['deer', 'Grout out the top']],
  };
  // his arrival: who says what, and when (seconds from the start; the acting goes by the same times, WORLD.POON)
  const LEAD_SEE = ['Oh no. Is that...?', 'Wait. I know that truck.', 'Is that who I think it is?'];
  const CORE_GO = ['It is him. We are out of here.', 'That is our cue, boys. Let us go.', 'Nope. I am not working with him again.'];
  const ME_HUH = ['Where are you two going?!', 'Hey! Get back here!', 'You cannot just leave!'];
  const SUP = 'Sup faggots.', HOME = "Daddy's home.", ME = 'Poon Daddy.';
  const SKIP_AFTER = 1.0;        // seconds before his arrival can be skipped
  const SHOT_MIN = 1.6, SHOT_MAX = 12;      // the unlock shot: how long before it can be closed, and when it closes by itself

  let APP, E = null, st = { unlocked: false, best: { env: 0, geo: 0 } };
  let A = null, U = null, toastT = 0, face = '';

  function load() {
    try { const o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; st.unlocked = !!o.unlocked; if (o.best) for (const k in LISTS) st.best[k] = Math.max(0, Math.min(LISTS[k].length, +o.best[k] || 0)); } catch (e) { /* storage blocked */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage blocked: it lasts until the page closes */ } }
  const look = () => (window.ROSTER.find(p => p.id === ID) || {}).look;
  const listOf = S => LISTS[S.site.type] || null;

  function init(app) {
    APP = app; load();
    E = { root: $('poon'), title: $('poonTitle'), say: $('poonSay'), face: $('poonFace'), who: $('poonWho'), line: $('poonLine'), skip: $('poonSkip'),
      unlock: $('poonUnlock'), go: $('poonGo'), ticks: $('poonTicks'), boxes: $('poonBoxes') };
    E.skip.addEventListener('click', () => { if (A && A.t > SKIP_AFTER) endArrival(); });
    E.go.addEventListener('click', () => { if (U && U.t > SHOT_MIN) endShot(); });
    E.unlock.addEventListener('click', e => { if (e.target === E.unlock && U && U.t > SHOT_MIN) endShot(); });
  }
  // a new hole: the list starts again
  function reset() {
    A = null; U = null; toastT = 0;
    if (E) { E.root.hidden = true; E.ticks.hidden = true; E.root.dataset.mode = ''; }
    WORLD.setPoon(null); WORLD.setSolo(false);
    document.body.classList.remove('poon-on');
  }

  // ---------- the list ----------
  function mark(S, key) {
    if (st.unlocked || !S || !S.site) return;
    const L = listOf(S);
    if (!L || !L.some(x => x[0] === key)) return;
    S.shame = S.shame || [];
    if (S.shame.includes(key)) return;
    S.shame.push(key);
    const n = S.shame.length;
    if (n > (st.best[S.site.type] || 0)) { st.best[S.site.type] = n; save(); }
    if (n >= L.length) S.poonDue = true;
    showTicks(S);
  }
  // a little row of boxes at the top of the screen: one more filled in. It never says what they are
  function showTicks(S) {
    const L = listOf(S), n = (S.shame || []).length;
    E.boxes.innerHTML = L.map((x, i) => `<b class="${i < n ? 'on' : ''}"></b>`).join('');
    E.ticks.hidden = false; E.ticks.classList.remove('pop'); void E.ticks.offsetWidth; E.ticks.classList.add('pop');
    toastT = 3.2;
  }
  // he is on the crew, or he has turned up: the helper's prompts do themselves
  function helps(S) { return !!S && (!!S.poonHere || S.crew.some(m => m.name === NAME)); }
  // the job is somewhere he can walk in without cutting anything off: no prompt up, no scene playing
  function calm(S) {
    if (S.site.type === 'geo') return GROUT.calm;
    return WELL.calm;
  }

  // ---------- his arrival ----------
  function arrive(S) {
    const P = WORLD.POON, L = [];
    const add = (at, who, text, dur, sfx) => L.push({ at, who, text, dur, sfx });
    const pick = a => a[Math.floor(Math.random() * a.length)];
    add(P.TRUCK_IN + 0.2, '', '', 0, 'whoosh');
    add(P.HONK, '', '', 0, 'horn');
    add(P.HONK + 0.45, '', '', 0, 'horn');
    add(P.DOOR, '', '', 0, 'clamp');
    add(P.SEE, 'lead', pick(LEAD_SEE), 1.6);
    add(P.GO, 'core', pick(CORE_GO), 1.9);
    add(P.HUH, 'me', pick(ME_HUH), 1.6);
    add(P.SUP, 'poon', SUP, 2.0, 'ok');
    add(P.HOME, 'poon', HOME, 2.0);
    add(P.NAME, 'poon', ME, 2.6, 'fanfare');
    A = { t: 0, i: 0, lines: L.sort((a, b) => a.at - b.at), S, sayT: 0, talk: '' };
    if (!face) { try { face = WORLD.portraits([look()], 160, 180)[0] || ''; } catch (e) { face = ''; } }
    E.root.hidden = false; E.root.dataset.mode = 'arrive'; E.title.hidden = true; E.unlock.hidden = true; E.say.hidden = true; E.skip.hidden = true;
    document.body.classList.add('poon-on');
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: 'A truck has pulled onto the site. The helpers know that truck.', lvl: 'warn' });
  }
  function nameOf(who) {
    const S = A.S;
    return who === 'poon' ? NAME : who === 'lead' ? S.crew[0].name : who === 'core' ? S.crew[1].name : who === 'me' ? (S.driller || 'The driller') : who;
  }
  function updateArrival(dt) {
    const P = WORLD.POON;
    A.t += dt;
    while (A.i < A.lines.length && A.t >= A.lines[A.i].at) {
      const L = A.lines[A.i++];
      if (L.text) { E.who.textContent = nameOf(L.who); E.line.textContent = L.text; E.face.src = L.who === 'poon' ? face : ''; E.face.hidden = L.who !== 'poon' || !face; E.say.hidden = false; A.sayT = L.dur; A.talk = L.who; }
      if (L.sfx) A.S.sfx.push(L.sfx);
    }
    if (A.sayT > 0) { A.sayT -= dt; if (A.sayT <= 0) { E.say.hidden = true; A.talk = ''; } }
    E.title.hidden = A.t < P.NAME;
    E.skip.hidden = A.t < SKIP_AFTER;
    WORLD.setPoon({ kind: 'arrive', t: A.t, talk: A.talk, look: look() });
    if (A.t >= P.END) endArrival();
  }
  // he is here: the two helpers are gone, and he does both their jobs for the rest of the hole
  function endArrival() {
    const S = A.S;
    A = null;
    E.root.hidden = true; E.root.dataset.mode = ''; document.body.classList.remove('poon-on');
    S.poonHere = true;
    for (const m of S.crew) m.name = NAME;
    const L = look();
    if (APP.looks) { APP.looks.lead = L; APP.looks.core = L; }
    WORLD.setPoon(null);
    WORLD.poonTakeOver(L);
    if (S.site.type === 'geo') GROUT.recrew();
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: 'Poon Daddy is on site. Both helpers walked off the job. He is the crew now.', lvl: 'good' });
  }

  // ---------- the end of the hole: the unlock ----------
  // Called instead of going straight to the report. If he turned up this hole, the camera finds him first.
  function finale(S, then) {
    if (!S.poonHere || st.unlocked) { then(); return; }
    st.unlocked = true; save();
    U = { t: 0, then, S };
    E.root.hidden = false; E.root.dataset.mode = 'shot'; E.title.hidden = true; E.say.hidden = true; E.skip.hidden = true; E.unlock.hidden = true;
    document.body.classList.add('poon-on');
    S.sfx.push('fanfare');
  }
  function updateShot(dt) {
    U.t += dt;
    E.unlock.hidden = U.t < 0.9;
    E.go.hidden = U.t < SHOT_MIN;
    if (U.t > 0.9 && U.t - dt <= 0.9) U.S.sfx.push('done');
    WORLD.setPoon({ kind: 'pose', t: U.t, look: look() });
    if (U.t >= SHOT_MAX) endShot();
  }
  function endShot() {
    const f = U.then;
    U = null;
    E.root.hidden = true; E.root.dataset.mode = ''; document.body.classList.remove('poon-on');
    WORLD.setPoon(null);
    f();
  }

  // ---------- every frame ----------
  function update(S, dt) {
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) E.ticks.hidden = true; }
    const off = APP.away || APP.menu || APP.fly;
    E.root.classList.toggle('away', !!off);
    if (U) { if (!off) updateShot(dt); return; }
    if (A) { if (!off && !S.paused) updateArrival(dt); return; }
    if (S.poonDue && !S.poonHere && !st.unlocked && !off && !S.paused && calm(S)) arrive(S);
  }
  // Enter or Space: skips his arrival, or closes the unlock shot. Returns true if the key was used
  function key(e) {
    if (!A && !U) return false;
    if (e.code !== 'Enter' && e.code !== 'Space') return true;
    if (A && A.t > SKIP_AFTER) endArrival();
    else if (U && U.t > SHOT_MIN) endShot();
    return true;
  }

  // ---------- for testing, in the browser console ----------
  // POON.test(): everything on this hole's list but one is already done. POON.test(true): all of it (he comes next)
  function test(all) {
    const S = APP.S, L = listOf(S);
    if (!L) return 'This mission type has no list.';
    st.unlocked = false;
    S.shame = L.slice(0, all ? L.length : L.length - 1).map(x => x[0]);
    if (all) S.poonDue = true;
    showTicks(S);
    return all ? 'Poon Daddy is due.' : `Still needed: ${L[L.length - 1][1]}`;
  }
  // POON.seek(8): jump his arrival (or the unlock shot) to that many seconds in
  function seek(t) { if (A) { A.t = t; A.i = A.lines.findIndex(L => L.at > t); if (A.i < 0) A.i = A.lines.length; } else if (U) U.t = t; return t; }
  function relock() { st.unlocked = false; st.best = { env: 0, geo: 0 }; save(); return 'Poon Daddy is locked again.'; }

  load();
  return { init, reset, mark, helps, update, key, finale, test, seek, relock, LISTS, HINT, ID, NAME,
    get unlocked() { return st.unlocked; }, get best() { return st.best; }, get busy() { return !!A || !!U; }, get arriving() { return !!A; } };
})();
