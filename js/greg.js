'use strict';
/* Greg's call. Greg is an old driller who has seen it all and was better at all of it. Finish a hole with a passing
   grade that is not a great one (80 to 89) and, a moment after the report comes up, the phone rings. It is Greg. He
   tells you what he thinks of your hole, how they did it in his day, and hangs up. It costs nothing and changes
   nothing: it is only there to rub it in.

   He uses the same phone on the screen as Aaron (the #aaron element in index.html), with his own name, face and
   colours. A lower grade (80 to 84) gets a longer lecture than a higher one (85 to 89). The lines are dealt like a
   deck of cards, so none comes round again until the others have been used. */
window.GREG = (() => {
  const $ = id => document.getElementById(id);

  const LO = 80, HI = 89;        // the grades Greg calls about: a pass, but under 90
  const LONG = 84;               // at this grade or lower he has two stories to tell, not one
  const WAIT = 2.0;              // seconds the report is up before the phone rings
  const RING_MAX = 8;            // seconds it rings before the driller picks up anyway
  const READ = 0.065, LINE_MIN = 3.2;      // each line stays up this long per letter, and at least this long (a tap moves it on)
  const BYE_T = 2.0;             // seconds the driller's answer stays up after Greg hangs up

  const HELLO = ["It's Greg. I heard about your hole.", 'Greg here. Word travels fast, kid.', "Yeah, it's Greg. Aaron showed me your report.", "Kid. It's Greg. Sit down for this one.", "It's Greg. Don't hang up."];
  const GRADE = ['An {s}? Back in my day an {s} got you put on the shovel.', "An {s} out of 100. I've seen better holes dug by a dog.", "An {s}. I'd have been embarrassed to sign that in 1984.", "An {s}. My wife's tomato stakes go in straighter than that.", 'An {s}, eh? Well. It is a hole. I will give you that.',
    "An {s}. You know what we called an {s} in my day? Monday."];
  const JAB = ["I would've drilled a better hole back in the '80s with a rig made out of wood.",
    "Back in my day we'd have had this hole drilled in half the time, with half as much technology on the rig.",
    "We didn't have screens and gauges. We had a hammer and a bad attitude.",
    'My first rig ran on diesel, spit and swearing. Never missed a foot.',
    "In '83 I drilled {d} feet before lunch. Uphill. In the snow.",
    "You've got a computer telling you what to do and you still got an {s}.",
    "We didn't have a crew that did the pipe for us. We had Dale. And Dale had eight fingers.",
    "I once cased a hole with stovepipe. It's still standing.",
    'Back then, if the bit got stuck, you went down the hole after it.',
    "I've spilled better sand packs than the one you just poured.",
    'We measured depth with a rope and a rock. Dead on, every time.',
    'Hydraulics. Pff. We turned the rods by hand and we liked it.',
    "My rig didn't have a seat. Or a roof. Or brakes.",
    'You kids and your sonic. We just yelled at the ground until it moved.',
    'We had one gauge. It was broken. We drilled better holes than this.',
    "{d} feet. I used to do {d} feet with a hangover and a borrowed wrench.",
    'My rig was older than me and I was older than the client. Still came in under budget.',
    'You know what our fast-forward button was? Working faster.'];
  const BYE = ["Anyway. Do better. My show's on.", "That's all. Don't call me back.", "Keep at it, kid. You'll get there. Maybe.", "Alright. I've got soup on.", 'Tell Aaron he owes me twenty bucks.', "Anyway. I'm going back to my nap."];
  const REPLY = ['Thanks, Greg.', '...Okay, Greg.', 'Who gave him my number?', 'Good talk, Greg.', 'Love you too, Greg.', 'Say hi to Dale.', 'It was a PASS, Greg.'];
  // an old hand: faded hard hat, white hair and moustache, heavy brows, square glasses, a plaid work shirt
  const LOOK = { plain: true, torso: 'plaid', arms: 'plaid', pants: 0x4a4f58, suitDark: 0x3a2f24, patch: '', hat: 0xd8c26a, hatTrim: 0x9a8642, skin: 0xe0a98a, nose: 0xcf8d74,
    brow: 0xf2f2ec, browT: 1.9, eye: 0x3a2a1c, glasses: 'square', lensClear: true, wire: false, lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0x4a3a2a, smile: false,
    build: 1.1, height: 0.96, hair: 0xf2f2ec, sideburns: true, stache: 0xf2f2ec };

  let APP, E = null, st = '', t = 0, ringT = 0, lines = [], li = 0, face = '', score = 0, hold = LINE_MIN;
  const decks = new Map();
  // the next card off a shuffled deck: no line repeats until the whole list has been used
  function draw(list) {
    let d = decks.get(list);
    if (!d || !d.length) { d = list.slice(); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } decks.set(list, d); }
    return d.pop();
  }
  const fill = s => s.replace(/\{s\}/g, score).replace(/\{d\}/g, SIM.TARGET);

  function init(app) {
    APP = app;
    E = { root: $('aaron'), name: $('arName'), status: $('arStatus'), answer: $('arAnswer'), bubble: $('arBubble'), say: $('arSay'), face: $('arFace') };
    E.answer.addEventListener('click', answer);
    E.root.addEventListener('pointerdown', e => { if ((st === 'talk' || st === 'bye') && t > 0.35) { e.preventDefault(); next(); } });
  }
  // put the phone back the way Aaron expects to find it
  function clear() {
    if (!E) return;
    E.root.hidden = true; E.root.dataset.who = ''; E.name.textContent = 'Aaron'; E.bubble.dataset.me = '';
  }
  function reset() {
    if (st && st !== 'wait') clear();
    st = ''; t = 0;
  }
  // the hole is graded and the report is up: does Greg have something to say about it?
  function grade(n) {
    reset();
    if (!E || !(n >= LO && n <= HI)) return false;
    score = Math.round(n); st = 'wait'; t = 0;
    return true;
  }
  function ring() {
    st = 'ring'; t = 0; ringT = 0;
    if (!face) { try { face = WORLD.portraits([LOOK], 160, 180)[0] || ''; } catch (e) { face = ''; } }
    E.face.style.backgroundImage = face ? `url(${face})` : ''; E.face.textContent = face ? '' : 'G';
    E.name.textContent = 'Greg'; E.status.textContent = 'calling…';
    E.root.dataset.who = 'greg'; E.root.dataset.state = 'ring'; E.root.dataset.fav = '';
    E.bubble.hidden = true; E.bubble.dataset.me = '';
    E.root.hidden = false;
  }
  function show(line) { E.say.textContent = line; hold = Math.max(LINE_MIN, line.length * READ); t = 0; }
  function answer() {
    if (st !== 'ring') return;
    AUDIO.init();
    lines = [draw(HELLO), draw(GRADE), draw(JAB)];
    if (score <= LONG) lines.push(draw(JAB));
    lines.push(draw(BYE));
    lines = lines.map(fill); li = 0;
    st = 'talk';
    E.root.dataset.state = 'talk'; E.status.textContent = 'on the phone';
    show(lines[0]); E.bubble.hidden = false;
    APP.S.sfx.push('ok');
  }
  function next() {
    if (st === 'bye') { reset(); return; }
    if (st !== 'talk') return;
    li++;
    if (li < lines.length) { show(lines[li]); return; }
    // Greg hangs up. The driller gets the last word, to nobody
    st = 'bye'; t = 0; hold = BYE_T;
    E.status.textContent = 'call ended';
    E.bubble.dataset.me = '1'; E.say.textContent = draw(REPLY);
    APP.S.sfx.push('switch');
    APP.S.log.unshift({ t: APP.S.t, clock: SIM.clockStr(APP.S), msg: `Greg called about your ${score}. He was not impressed.`, lvl: 'warn' });
  }
  function update(dt) {
    if (!st) return;
    if (APP.menu) { reset(); return; }             // back at the main menu: Greg gives up
    t += dt;
    if (st === 'wait') { if (t >= WAIT) ring(); }
    else if (st === 'ring') {
      ringT -= dt;
      if (ringT <= 0) { ringT = 1.7; APP.S.sfx.push('ring'); }
      if (t >= RING_MAX) answer();
    } else if (t >= hold) next();
  }
  // Enter, Space or A answers the phone and moves the talk on. While the phone is up, other keys wait.
  function key(e) {
    if (!st || st === 'wait') return false;
    if (!e.repeat && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyA')) { if (st === 'ring') answer(); else if (t > 0.35) next(); }
    return true;
  }

  return { init, reset, grade, update, key, LO, HI, get busy() { return st !== '' && st !== 'wait'; },
    call(n) { return grade(n == null ? 84 : n); },          // for testing: Greg rings in two seconds, as if the grade was n
    get state() { return { st, t, li, lines, score }; } };
})();
