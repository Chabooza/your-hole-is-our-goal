'use strict';
/* Aaron's call. From hole 3 on, at some point while the driller is coring, the cell phone rings. The drilling holds
   still, the driller answers, and Aaron says there is another job coming up: this hole has to be done in so many
   minutes. A countdown then runs until the well is built. Finish in time and nothing is lost. Run over and the grade
   drops on a sliding scale, never all at once: the first minute late costs 1 point, the second 2 more, the third 3
   more, and so on (1, 3, 6, 10, 15 ... points at 1, 2, 3, 4, 5 ... minutes), 30 at most. See penFor.

   The time allowed is worked out from what is left to do (par), times a slack that shrinks every hole: plenty of
   room for trouble on hole 3, next to none on hole 10. The clock counts game time: while the rig is working it runs at
   the game's speed (so fast-forward burns it faster), and during a prompt, a breakdown, a Zonnic throw or the well
   install it runs at one second a second. It stops while the game is paused and while the core is on the table.

   The other call: "you're on your last leg". Fail a hole (a grade under the pass mark) and, at the start of the next
   hole you play, before any drilling, Aaron phones to say so. A pass clears the count. It costs nothing: it is only a
   talking-to. The count is kept in this browser (yhiog-aaron), so closing the game does not get you out of it.

   Fail two in a row and he does not phone. He drives out to site (visit, below): walks up, says his piece, calls the
   driller over, bends him over and smacks him while he cries, then leaves. More fails in a row, more smacks. It is
   drawn in the 3D scene (setBoss in js/world.js) and watched from outside. It also costs nothing.

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
  const LINE = 3.0, READ = 0.062;      // each thing Aaron says stays up at least LINE seconds, longer for a long line (a tap moves it on)
  const LEG_KEY = 'yhiog-aaron'; // where the count of failed holes in a row is kept
  const LEG_WAIT = 1.6;          // seconds into the next hole before he rings about the last one
  // two fails in a row or more: he comes out to site instead of phoning. Times are seconds into the scene
  const VISIT_AT = 2;            // failed holes in a row that bring him out
  const V_IN = 3.0;              // his walk in
  const V_SAY2 = 3.3;            // his second line, once he has stopped
  const V_GO = 4.6, V_WALK = 1.4;      // the driller starts over to him, and how long that walk takes
  const V_BEND = 5.7;            // the driller bends over
  const V_T0 = 6.5, V_EVERY = 0.55;    // the first wind-up, and seconds per smack
  const V_SKIP = 1.0;            // seconds before the scene can be skipped
  const smacks = n => Math.min(10, 2 + 2 * n);      // 6 for two fails in a row, 8 for three, 10 for four or more
  const PEN_STEP = 60;           // late: the first PEN_STEP seconds cost 1 point, the next 2 more, the next 3 more, and so on
  const PEN_MAX = 30;            // ...and the most being late can cost
  const LATER = 180;             // seconds late at which Aaron texts again

  const HELLO = ["Hey, bud, how's it going?", 'Hey, bud. Got a second?', "Hey, bud. How's the hole?", "Bud! It's Aaron."];
  const NEWS = ["Just wanted to let you know you've got another job coming up.", 'So, the next job got moved up on us.', 'The client on the next one is already on site.', "I've booked you another hole after this one. Today."];
  const HURRY = ['Which means you got to get this hole done quick. You have {t}.', 'So get this one done quick. I need you rolling in {t}.', "So no messing around, eh? You've got {t} to finish up.", 'So wrap this hole up. {t}. Not a second more.'];
  const REPLY = ['Yeah, yeah. On it.', 'No problem, Aaron.', '...Great.', 'Sure. Why not.', 'You got it, boss.'];
  const HALF = ["How's that hole coming?", 'Half your time is gone.', 'Client just called again. No pressure.'];
  const TWO = ['Two minutes. Wrap it up.', 'You packing up yet? Two minutes.'];
  const LATE = ["You're late. Every minute costs you more than the last.", "That's time. The client is waiting, and it only gets worse from here."];
  const WORSE = ['Three minutes over. This is getting expensive.', 'Still not done? The client is counting every minute.'];
  const MADE = ['Nice work. Get rolling.', 'Good stuff. See you at the next one.'];
  const CLOSE = ["Cutting it close. I'll let that one go.", 'Right on the buzzer. Good enough.'];              // late, but not by enough to cost a point
  const MISSED = ['A bit late. The client noticed.', 'Late, but done. Get rolling.'];                         // a few points
  const BADLY = ["We'll talk about this later.", 'The client is not happy.'];                                   // 10 points or more
  // the last-leg call. {s} is the failed grade, {n} how many holes in a row have failed
  const LEG_HELLO = ['Hey, bud. We need to talk.', "Bud. It's Aaron. Got a minute? You do.", 'Hey, bud. Before you start that hole.', "Bud. Don't touch that throttle yet."];
  const LEG_SCORE = ['I got the report on your last hole. {s} out of 100.', 'You scored {s} on that last one. That is not a pass.', 'The client sent the last hole back. {s} out of 100.', '{s} out of 100 on the last hole. I had to read it twice.'];
  const LEG1 = ["You're on your last leg.", "I'll be straight with you: you're on your last leg here.", "One more like that and we have a problem. You're on your last leg.", "I went to bat for you on that one. You're on your last leg."];
  const LEG2 = ["That's two in a row. You were on your last leg. Now you're hopping.", 'Two sent back. I told you that you were on your last leg.', "Two in a row. That last leg of yours is getting wobbly."];
  const LEG3 = ["{n} in a row. I've run out of legs for you to stand on.", '{n} failed holes. Greg is asking about your truck.', "{n} in a row. I'm only still calling because nobody else wants the job.", '{n} in a row. The client knows your name now. Not in a good way.'];
  const LEG_BYE = ['So do this one right, eh?', "Get this one right. I'm watching the report.", "Don't make me call you again.", 'Slow down, read the ground, and get me a pass.'];
  const COME = ['Get over here.', 'Come here. Now.', 'Off the rig. Over here.', 'Right here. Bend over.'];
  const WAAH = ['OW!', 'WAAAH!', 'Ow! I am sorry, Aaron!', 'OW! It was the ground!', 'Waaah! Not in front of the helpers!', 'Ow! I will read the gauges!', 'WAAAAAH!', 'Ow! Never again!', 'I want my mom!', 'OW! That one hurt!', 'Waaah! I will pass the next one!', 'Ow! Tell the client I am sorry!'];
  const SNIFF = ['*sniff*', 'Yes, Aaron. *sniff*', '*sniff* ...It was the ground.', "*sniff* Won't happen again."];
  const LEG_REPLY = ['Yes, Aaron.', "Won't happen again.", '...Understood.', 'It was the ground, Aaron.', 'Tell the client I said sorry.', 'Last leg. Got it.'];
  const LOOK = { suit: 0x3a4658, suitDark: 0x2a3444, patch: 'Aaron', hat: 0xf6f6f1, hatTrim: 0xd9d9d2, skin: 0xe6b48c, nose: 0xd9a37b, vest: 0xf47a1f, shirt: 0xbcd3ee,
    brow: 0x2b1d14, eye: 0x3a2a1c, glasses: 'none', lensClear: true, wire: false, lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0x17171a, smile: true,
    build: 1.06, height: 1, hair: 0x2b1d14, stache: 0x2b1d14, stacheStyle: 'medium' };

  let APP, E = null, st = '', t = 0, at = 0, lines = [], li = 0, lastT = 0, face = '', toastT = 0, ringT = 0, meTimer = null;
  let X = null;                  // the site visit while it is on: { n, lines, hits, hop, said, end ... }
  let kind = 'job', hold = LINE, legT = 0;      // kind: which call is on the phone, 'job' (the deadline) or 'leg' (the talking-to)
  const last = {};
  // failed holes in a row, the last failed grade, and whether Aaron still has to phone about it
  const leg = { fails: 0, score: 0, owed: false };
  try { const v = JSON.parse(localStorage.getItem(LEG_KEY) || 'null'); if (v) { leg.fails = Math.max(0, v.fails | 0); leg.score = Math.max(0, v.score | 0); leg.owed = !!v.owed && leg.fails > 0; } } catch (e) {}
  const saveLeg = () => { try { localStorage.setItem(LEG_KEY, JSON.stringify(leg)); } catch (e) {} };
  // a hole has been graded (endHole in js/main.js): a fail is one more in a row and a call to come, a pass wipes the slate
  function result(passed, score) {
    if (passed) { leg.fails = 0; leg.owed = false; } else { leg.fails++; leg.score = Math.round(score); leg.owed = true; }
    saveLeg();
  }

  // ---------- how long the rest of the hole should take ----------
  const rotF = L => 1 + L.rotBen * Math.min(1.25, 0.75 * L.maxRpm / 80);
  function span(a, b, fn) { let s = 0; for (const L of SIM.LAYERS) { const lo = Math.max(a, L.top), hi = Math.min(b, L.bot); if (hi > lo) s += (hi - lo) * fn(L); } return s; }
  const cobFt = (S, a, b) => S.cobbles.reduce((s, c) => s + Math.max(0, Math.min(b, c.b) - Math.max(a, c.a)), 0);
  const coreT = (S, a, b) => span(a, b, L => 61 / (L.base * rotF(L))) + cobFt(S, a, b) * 6;
  const casT = (a, b) => span(a, b, L => 44 / L.base);
  // the crew's pipe handling for the run that starts at `from`: tripping out, and back in unless it is the last run
  const crewT = (from, final) => (final ? 165 + 51 * Math.max(0, Math.floor((from - 10) / 20)) : from === 0 ? 125 : 180 + 90 * Math.ceil(from / 20));
  // the same on a geotechnical hole, by the depth the 5 ft run ends at (5, 10, 15 ... 40 ft), from robot runs
  const CREW_GEO = [28, 89, 137, 195, 223, 258, 264, 324];
  function wellT(S) {
    const D = SIM.TARGET; let s = 20 + (D / 10 + 2) * 7;
    for (let d = 10; d <= D; d += 10) s += 22 + SITES.pourLag(d, S.site.n);
    return s;
  }
  // seconds of game time a good player needs from here: { drill, crew, well }
  function par(S) {
    const D = SIM.TARGET, R = SIM.RUN_LEN, from = Math.min(D - R, Math.max(0, Math.round((S.run.from || 0) / R) * R));
    const bit = clamp(Math.max(S.hole.depth, S.core.bit || 0), from, from + R);
    let drill = 0, crew = 0, spt = 0;
    for (let f = from; f < D; f += R) {
      const a = f === from ? bit : f, e = f + R;
      if (SIM.GEO) {                              // 5 ft runs: casing only when the run ends on a 10, and an SPT after every run
        drill += (f === from ? 0 : 5) + coreT(S, a, e) + (e % 10 === 0 ? casT(e - 10, e) : 0);
        crew += CREW_GEO[Math.min(CREW_GEO.length, Math.round(e / R)) - 1];
        spt += SPT.parTime(e);
      } else {
        drill += (f === from ? 0 : 5) + coreT(S, a, e) + casT(f, e);
        crew += crewT(f, e >= D);
      }
    }
    if (SIM.GEO) spt += GROUT.parTime();          // and the hole is grouted at the end
    return { drill, crew, well: S.site.job === 'well' ? wellT(S) : spt };          // the player's own work after the drilling: the well, or the SPTs
  }
  function allow(S) {
    const p = par(S), k = clamp((S.site.n - FIRST) / Math.max(1, SITES.COUNT - FIRST), 0, 1), s = lerp(SLACK[0], SLACK[1], k);
    const sec = APP.easy ? p.crew + (p.drill + p.well) * s : p.crew * FULL_CREW + p.drill * (s + FULL_EXTRA) + p.well * s;
    return Math.max(5, Math.round(sec / 60)) * 60;          // Aaron deals in whole minutes
  }
  // points off for finishing `late` seconds after the deadline. Each PEN_STEP of lateness costs one point more than the
  // one before it, charged evenly through that stretch, so a little late costs a little and a lot late costs a lot
  function penFor(late) {
    const m = Math.max(0, late) / PEN_STEP, n = Math.floor(m);
    return Math.min(PEN_MAX, Math.round(n * (n + 1) / 2 + (m - n) * (n + 1)));
  }
  const pts = n => n + (n === 1 ? ' point' : ' points');
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const minutes = s => { const m = Math.round(s / 60); return m + (m === 1 ? ' minute' : ' minutes'); };

  // ---------- the phone ----------
  // coring, and nothing else going on: the only time the phone rings
  // nothing else is going on that the phone would get in the way of
  function quiet() {
    const S = APP.S;
    return !(S.done || S.paused || APP.away || APP.menu || APP.fly || APP.freeze || WELL.active || TOSS.state.state || NAG.active || MARL.active);
  }
  // a hole that has only just begun: nothing drilled yet. This is when Aaron phones about the hole before it
  function fresh() {
    const S = APP.S;
    return quiet() && S.hole.depth < 0.5 && !S.runs.length && !SPT.busy && !(APP.easy && (AUTO.st.qte || AUTO.st.failed));
  }
  function drilling() {
    const S = APP.S;
    if (!quiet()) return false;
    if (APP.easy) return AUTO.manual === 'core' && !AUTO.st.qte && !AUTO.st.failed;
    return S.phase === 'CORE_RUN' && S.head.conn === 'core' && S.head.hz > 8;
  }
  function init(app) {
    APP = app;
    E = { root: $('aaron'), status: $('arStatus'), answer: $('arAnswer'), bubble: $('arBubble'), say: $('arSay'), face: $('arFace'),
      timer: $('arTimer'), time: $('arTime'), label: $('arLabel'), text: $('arText'), textSay: $('arTextSay'), me: $('bubMe') };
    E.answer.addEventListener('click', answer);
    E.root.addEventListener('pointerdown', e => { if (st === 'talk' && t > 0.35) { e.preventDefault(); next(); } });
    E.skip = $('arSkip');
    if (E.skip) E.skip.addEventListener('click', () => { if (st === 'visit' && t > V_SKIP) endVisit(true); });
    reset();
  }
  function reset() {
    if (st === 'visit') endVisit(false);
    st = ''; t = 0; toastT = 0; legT = 0; lastT = APP ? APP.S.t : 0;
    const S = APP && APP.S;
    // the phone rings somewhere in the first part of the hole
    at = S ? SIM.TARGET * (0.06 + Math.random() * 0.32) : 0;
    if (E) { E.root.hidden = true; E.timer.hidden = true; E.text.hidden = true; }
    document.body.classList.remove('on-call');
    for (const k in last) delete last[k];
  }
  function show(line) { E.say.textContent = line; hold = Math.max(LINE, line.length * READ); t = 0; }
  function ring(k) {
    const S = APP.S;
    kind = k || 'job';
    st = 'ring'; t = 0; ringT = 0;
    if (!face) { try { face = WORLD.portraits([LOOK], 160, 180)[0] || ''; } catch (e) { face = ''; } }
    E.face.style.backgroundImage = face ? `url(${face})` : ''; E.face.textContent = face ? '' : 'A';
    E.root.dataset.state = 'ring'; E.root.hidden = false; E.bubble.hidden = true;
    E.root.dataset.fav = kind === 'job' && S.item === 'favour' && !S.itemSpent ? '1' : '';
    E.status.textContent = 'calling…';
    document.body.classList.add('on-call');
    PANEL.setHands(false);
    if (kind === 'job') S.aaronCalled = true;
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: 'Your phone is ringing. It is Aaron.', lvl: 'warn' });
  }
  function answer() {
    if (st !== 'ring' || APP.S.paused) return;
    AUDIO.init();
    const S = APP.S;
    if (kind === 'leg') {                         // the talking-to: said once, then it is off his chest
      const n = leg.fails, fill = x => x.replace(/\{s\}/g, leg.score).replace(/\{n\}/g, n);
      lines = [pick(LEG_HELLO), pick(LEG_SCORE), pick(n >= 3 ? LEG3 : n === 2 ? LEG2 : LEG1), pick(LEG_BYE)].map(fill);
      leg.owed = false; saveLeg();
    } else {
      const fav = S.item === 'favour' && SHOP.use(S), limit = allow(S) + (fav ? 180 : 0);      // Aaron's favour from the shop: 3 more minutes
      S.aaron = { limit, left: limit, half: false, two: false, zero: false, worse: false, done: false, pen: 0 };
      lines = [pick(HELLO), pick(NEWS), pick(HURRY).replace('{t}', minutes(limit))];
      if (fav) lines.push('And since I owe you one, that includes three extra minutes.');
    }
    li = 0; st = 'talk';
    E.root.dataset.state = 'talk'; E.status.textContent = 'on the phone';
    show(lines[0]); E.bubble.hidden = false;
    S.sfx.push('ok');
  }
  function next() {
    if (st !== 'talk') return;
    li++; t = 0;
    if (li < lines.length) { show(lines[li]); return; }
    hangUp();
  }
  function hangUp() {
    const S = APP.S, A = S.aaron;
    st = ''; E.root.hidden = true; document.body.classList.remove('on-call');
    if (!APP.away && !APP.menu) PANEL.setHands(true);
    E.me.querySelector('span').textContent = pick(kind === 'leg' ? LEG_REPLY : REPLY); E.me.hidden = false;
    clearTimeout(meTimer); meTimer = setTimeout(() => { E.me.hidden = true; }, 2200);
    lastT = S.t;
    if (kind === 'leg') {
      S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: leg.fails > 1 ? `Aaron: ${leg.fails} holes in a row have not passed. You are on your last leg.` : `Aaron: the last hole did not pass (${leg.score} out of 100). You are on your last leg.`, lvl: 'warn' });
      S.sfx.push('switch');
      return;
    }
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: `Aaron: another job is waiting. ${minutes(A.limit)} to finish this hole${S.site.job === 'well' ? ', well and all' : ''}. Late costs points: a few at first, more with every minute.`, lvl: 'warn' });
    S.sfx.push('switch');
    E.timer.classList.remove('pop'); void E.timer.offsetWidth; E.timer.classList.add('pop');
  }
  // a text from Aaron: a banner that does not stop anything
  function text(line) {
    E.textSay.textContent = line; E.text.hidden = false; toastT = 4.5;
    APP.S.sfx.push('buzz');
  }

  // ---------- the site visit: two fails in a row ----------
  function say(line) { E.textSay.textContent = line; E.text.hidden = false; toastT = Math.max(3.2, line.length * READ + 0.6); X.talkT = Math.min(2.6, 0.8 + line.length * 0.035); }
  function me(line) { E.me.querySelector('span').textContent = line; E.me.hidden = false; clearTimeout(meTimer); }
  function visit() {
    const S = APP.S, n = leg.fails, fill = x => x.replace(/\{s\}/g, leg.score).replace(/\{n\}/g, n), hits = smacks(n);
    st = 'visit'; t = 0;
    const end = V_T0 + hits * V_EVERY + 0.3;      // the last smack has landed
    X = { n, hits, done: 0, hop: 0, said: 0, talkT: 0, end, back: end + 1.0, out: end + 1.5, over: end + 4.0, lines: [pick(LEG_SCORE), pick(n >= 3 ? LEG3 : LEG2), pick(COME), pick(LEG_BYE)].map(fill) };
    leg.owed = false; saveLeg();                  // said once, in person
    document.body.classList.add('boss-on');
    PANEL.setHands(false);
    if (E.skip) E.skip.hidden = true;
    S.sfx.push('horn');
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: 'A truck just pulled up. It is Aaron.', lvl: 'warn' });
  }
  const ease = k => k * k * (3 - 2 * k);
  function visitScene() {
    const out = t >= X.out, back = t >= X.back;
    WORLD.setBoss({ look: LOOK, cine: true, k: out ? 1 - ease(clamp((t - X.out) / (V_IN * 0.8), 0, 1)) : ease(clamp(t / V_IN, 0, 1)), out,
      talk: X.talkT > 0, point: t >= V_GO - 0.4 && t < V_T0,
      meK: back ? 1 - clamp((t - X.back) / (V_WALK * 1.5), 0, 1) : clamp((t - V_GO) / V_WALK, 0, 1), meBack: back,
      bendK: clamp((t - V_BEND) / 0.7, 0, 1) * clamp((X.end + 0.5 - t) / 0.4, 0, 1),
      spankT: t >= V_T0 && t < X.end ? t - V_T0 : -1, hop: X.hop, cry: t < V_T0 + V_EVERY ? 0 : t < X.end + 0.4 ? 1 : 0.45 });
  }
  function updateVisit(S, dt) {
    t += dt; X.hop = Math.max(0, X.hop - dt * 4.5); X.talkT -= dt;
    if (X.said < 1 && t >= 0.3) { X.said = 1; say(X.lines[0]); }
    if (X.said < 2 && t >= V_SAY2) { X.said = 2; say(X.lines[1]); }
    if (X.said < 3 && t >= V_GO - 0.4) { X.said = 3; say(X.lines[2]); }
    if (t >= V_T0 && t < X.end) {                 // each smack: the slap, a hop, and something wailed
      const hit = Math.min(X.hits, Math.floor((t - V_T0) / V_EVERY));
      if (hit > X.done) { X.done = hit; X.hop = 1; S.sfx.push('slap'); me(hit === 1 ? WAAH[0] : pick(WAAH.slice(1))); }
    }
    if (X.said < 4 && t >= X.end + 0.2) { X.said = 4; say(X.lines[3]); me(pick(SNIFF)); }
    if (E.skip && E.skip.hidden === (t > V_SKIP)) E.skip.hidden = !(t > V_SKIP);
    if (t >= X.over) endVisit(true); else visitScene();
  }
  // seen: the scene ran (or was skipped), as against the hole being thrown away under it
  function endVisit(seen) {
    const S = APP.S, n = X ? X.n : leg.fails;
    st = ''; X = null;
    WORLD.setBoss(null);
    document.body.classList.remove('boss-on');
    if (E.skip) E.skip.hidden = true;
    E.text.hidden = true; toastT = 0;
    clearTimeout(meTimer); meTimer = setTimeout(() => { E.me.hidden = true; }, seen ? 1500 : 0);
    if (!seen) return;
    if (!APP.away && !APP.menu) PANEL.setHands(true);
    lastT = S.t;
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: `Aaron came out to site: ${n} holes in a row have not passed. He made his point.`, lvl: 'warn' });
    S.sfx.push('switch');
  }

  // the well is built: stop the clock and say what it cost. Called by the well install as it works out the grade
  function settle(S) {
    const A = S.aaron;
    if (!A || A.done) return A || null;
    A.done = true;
    A.late = Math.max(0, -A.left);
    A.pen = penFor(A.late);
    A.spare = Math.max(0, A.left);
    text(pick(A.pen >= 10 ? BADLY : A.pen ? MISSED : A.late > 0 ? CLOSE : MADE));
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: A.pen ? `Aaron's deadline missed by ${mmss(A.late)}. ${pts(A.pen)} off the grade.` : A.late > 0 ? `Aaron's deadline missed by ${mmss(A.late)}. Close enough: nothing off the grade.` : `Aaron's deadline made with ${mmss(A.spare)} to spare.`, lvl: A.pen >= 10 ? 'crit' : A.pen ? 'warn' : 'good' });
    return A;
  }

  function update(S, dt) {
    if (!E) return;
    const off = APP.menu || APP.away || APP.fly;
    if (toastT > 0 && !S.paused) { toastT -= dt; if (toastT <= 0) E.text.hidden = true; }
    if (st === 'ring' || st === 'talk') E.root.hidden = off;
    // the call
    if (!S.paused && !off) {
      if (st === '') {
        if (leg.owed && fresh()) { legT += dt; if (legT >= LEG_WAIT) { if (leg.fails >= VISIT_AT) visit(); else ring('leg'); } }      // the last hole failed: he phones before this one starts, or comes out himself
        else if (!S.aaron && !S.aaronCalled && S.site.n >= FIRST && S.hole.depth >= at && drilling()) ring('job');
      } else if (st === 'ring') {
        t += dt; ringT -= dt;
        if (ringT <= 0) { ringT = 1.7; S.sfx.push('ring'); }
        if (t >= RING_MAX) answer();
      } else if (st === 'talk') { t += dt; if (t >= hold) next(); }
      else if (st === 'visit') updateVisit(S, dt);
    }
    // the countdown
    const A = S.aaron, dS = Math.max(0, S.t - lastT); lastT = S.t;
    const show = !!A && !off && st === '' && !(A.done && toastT <= 0);
    if (E.timer.hidden === show) E.timer.hidden = !show;
    if (!A || A.done) return;
    let d = dS;                                   // game time that went by on the rig
    if (!d && !S.paused && !off && !st) {         // the rig is held still: a prompt, a breakdown, a throw, or the well install
      if (S.done) { const W = S.well; if (W && WELL.active && $('plan').hidden && /^(pour|pull|wreck|pvc|result)$/.test(W.phase)) d = dt; }
      else if ((APP.easy && AUTO.st.qte) || TOSS.busy || NAG.busy || MARL.busy || (SPT.testing && !GROUT.gagging)) d = dt;
    }
    A.left -= d;
    if (!A.half && A.left <= A.limit / 2 && A.left > 150) { A.half = true; text(pick(HALF)); }
    if (!A.two && A.left <= 120 && A.left > 0) { A.two = true; text(pick(TWO)); }
    if (!A.zero && A.left <= 0) { A.zero = true; text(pick(LATE)); S.sfx.push('alarm'); }
    if (!A.worse && A.left <= -LATER) { A.worse = true; text(pick(WORSE)); }
    A.pen = penFor(-A.left);                      // what it has cost so far: shown on the clock, and settled when the hole is done
    const txt = A.left >= 0 ? mmss(A.left) : '+' + mmss(-A.left), lvl = A.left <= 0 ? 'late' : A.left <= 120 ? 'low' : A.left <= A.limit * 0.25 ? 'warn' : 'ok';
    const lab = lvl !== 'late' ? "Aaron's deadline" : A.pen ? `Late: ${pts(A.pen)} off` : 'Late for Aaron';
    if (last.txt !== txt) { last.txt = txt; E.time.textContent = txt; }
    if (last.lvl !== lvl) { last.lvl = lvl; E.timer.dataset.lvl = lvl; }
    if (last.lab !== lab) { last.lab = lab; E.label.textContent = lab; }
  }
  // Enter, Space or A answers the phone and moves the talk on. While the phone is up, other keys wait.
  function key(e) {
    if (st === 'visit') {                         // Aaron is on site: Enter or Space skips the scene, everything else waits
      if (e.code === 'Escape') return false;
      if (!e.repeat && t > V_SKIP && (e.code === 'Enter' || e.code === 'Space')) endVisit(true);
      return true;
    }
    if (st !== 'ring' && st !== 'talk') return false;
    if (e.code === 'Escape') return false;
    if (!e.repeat && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyA')) { if (st === 'ring') answer(); else if (t > 0.35) next(); }
    return true;
  }

  return { init, reset, update, key, settle, result, par, allow, penFor, PEN_MAX, get busy() { return st === 'ring' || st === 'talk' || st === 'visit'; }, get active() { return st !== ''; },
    call() { at = 0; APP.S.aaronCalled = false; APP.S.aaron = null; },          // for testing: ring on the next moment of drilling
    lastLeg(n, score) { leg.fails = Math.max(1, n || 1); leg.score = score == null ? 62 : score; leg.owed = true; legT = 0; saveLeg(); },      // for testing: he phones at the start of the next hole, as if n holes in a row had failed
    get state() { return { st, t, at, kind, lines, visit: X, leg: Object.assign({}, leg), aaron: APP.S.aaron }; } };
})();
