'use strict';
/* Throw a Zonnic at a helper: a bit of fun while the driller is coring. Every minute or two of drilling a button pops up
   for 3 seconds. Tap it and the drilling holds still while a timing ring shrinks onto a target band: tap when they
   line up. A hit sticks it (a small white thing, the size of a chewed piece of gum) to the helper's hard hat (it stays there for the rest of the hole) and the
   driller points and laughs. A miss bounces off the helper and drops in the dirt. The shift report counts the hits.
   The 3D side (the lump in flight, the hat, the pointing hand) is throwSonic / laugh / annoy in js/world.js. */
window.TOSS = (() => {
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rand = (a, b) => a + Math.random() * (b - a);

  const OFFER = 3;               // seconds the button stays up
  const FIRST = [40, 70];        // seconds of drilling before the first one
  const EVERY = [60, 120];       // and between the rest
  const R0 = 3, R1 = 0.2;        // the shrinking ring: starting and finishing size, as a multiple of the target
  const SHRINK = 1.6;            // seconds it takes to shrink all the way on hole 1 (later holes are quicker: js/sites.js)
  const TOL = 0.15;              // how close to the target counts as a hit (the green band is this wide)

  const LAUGH = ['HA HA HA HA!', 'HAHAHAHA!', 'BAHAHAHA!', 'HA! HA HA HA!', 'AHAHAHAHA!'];           // the driller only laughs. He never says anything
  const SULK = ['Aw, come on.', 'What the hell, man?', "You're disgusting.", 'Aw, come on.', 'What the hell, man?', "You're disgusting.", 'That was in your mouth!', 'Gross, man.', 'Seriously?'];
  const DODGED = ['Aw, come on.', 'What the hell, man?', "You're disgusting.", 'Gross, man.'];

  let APP, E;
  const T = { state: '', next: 0, left: 0, t: 0, s: R0, id: '', name: '', hit: false, look: null, msgT: 0 };
  const last = {};

  // drilling, and nothing else going on: the only time the button may pop up
  function drilling() {
    const S = APP.S;
    if (S.done || S.paused || APP.away || APP.menu || APP.fly || APP.freeze || WELL.active || NAG.active || MARL.active || AARON.active) return false;
    if (APP.easy) return AUTO.manual === 'core' && !AUTO.st.qte && !AUTO.st.failed;
    return S.phase === 'CORE_RUN' && S.head.conn === 'core' && S.head.hz > 8;
  }
  const helpers = () => APP.S.crew.filter(m => !m.hidden);

  function init(app) {
    APP = app;
    E = { offer: $('tsOffer'), who: $('tsWho'), bar: $('tsBar'), aim: $('tsAim'), zone: $('tsZone'), ring: $('tsRing'), title: $('tsTitle'), how: $('tsHow'), me: $('bubMe') };
    E.offer.addEventListener('click', take);
    E.aim.addEventListener('pointerdown', e => { e.preventDefault(); AUDIO.init(); tap(); });
    E.aim.addEventListener('contextmenu', e => e.preventDefault());
    reset();
  }
  function reset() {
    T.state = ''; T.next = rand(FIRST[0], FIRST[1]);
    if (E) { E.offer.hidden = true; E.aim.hidden = true; }
    document.body.classList.remove('tossing');
  }

  function offer() {
    const there = helpers(); if (!there.length) { T.next = 10; return; }
    const cv = WORLD.renderer.domElement, seen = there.filter(c => { const p = WORLD.project(WORLD.crewHead(c.id)); return p.front && p.x > 0 && p.x < cv.clientWidth && p.y > 0 && p.y < cv.clientHeight; });
    const m = pick(seen.length ? seen : there);                 // someone the driller can see, if there is anyone
    T.state = 'offer'; T.left = OFFER; T.id = m.id; T.name = m.name;
    E.who.textContent = `at ${m.name}`;
    E.offer.hidden = false;
    APP.S.sfx.push('switch');
  }
  function take() {
    if (T.state !== 'offer' || APP.S.paused) return;
    AUDIO.init();
    const S = APP.S;
    T.state = 'aim'; T.t = 0; T.s = R0; T.hit = false; T.ready = false; T.wait = 0;
    E.zone.style.visibility = 'hidden'; E.ring.style.transform = `translate(-50%, -50%) scale(${R0})`;
    T.look = { yaw: WORLD.look.tYaw, pitch: WORLD.look.tPitch, fov: WORLD.look.tFov };
    E.offer.hidden = true; E.aim.hidden = false; E.aim.dataset.state = 'go';
    E.title.textContent = `Throw a Zonnic at ${T.name}`;
    E.how.textContent = document.body.classList.contains('touch') ? 'Tap when the white ring is on the green' : 'Click or press Space when the white ring is on the green';
    document.body.classList.add('tossing');
    S.stats.sonicThrows = (S.stats.sonicThrows || 0) + 1;
    S.sfx.push('ok');
  }
  function tap() {
    if (T.state !== 'aim' || APP.S.paused || !T.ready || T.t < 0.12) return;
    T.hit = Math.abs(T.s - 1) <= TOL;
    throwIt();
  }
  function throwIt() {
    T.state = 'throw'; T.t = 0;
    E.aim.dataset.state = T.hit ? 'hit' : 'miss';
    E.title.textContent = T.hit ? 'Right on!' : 'Off target!';
    E.how.textContent = '';
    WORLD.throwSonic(T.id, T.hit);
    APP.S.sfx.push('whoosh');
  }
  function react() {
    const S = APP.S, m = S.crew.find(c => c.id === T.id);
    T.state = 'react'; T.t = 0; E.aim.hidden = true;
    if (T.hit) {
      S.stats.sonicHits = (S.stats.sonicHits || 0) + 1;
      say(pick(LAUGH), 2.6);
      WORLD.laugh(2.6); PANEL.setHands(false);
      S.sfx.push('stub'); setTimeout(() => S.sfx.push('laugh'), 250);
      if (m) { m.say = pick(SULK); m.sayT = 2.6; }
      WORLD.annoy(T.id, 2.6);
      S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: `Stuck a Zonnic to ${T.name}'s hard hat.`, lvl: 'info' });
    } else {
      S.sfx.push('stub');
      if (m) { m.say = pick(DODGED); m.sayT = 2.2; }
      WORLD.annoy(T.id, 2.0);
    }
  }
  let meTimer = null;
  function say(line, sec) {
    E.me.querySelector('span').textContent = line; E.me.hidden = false;
    clearTimeout(meTimer); meTimer = setTimeout(() => { E.me.hidden = true; }, sec * 1000);
  }
  function done() {
    T.state = ''; T.next = rand(EVERY[0], EVERY[1]);
    document.body.classList.remove('tossing');
    if (!APP.away && !APP.menu) PANEL.setHands(true);
    if (!APP.easy && T.look) { WORLD.look.tYaw = T.look.yaw; WORLD.look.tPitch = T.look.pitch; WORLD.look.tFov = T.look.fov; }   // back to where the driller was looking
    T.look = null;
  }

  // every frame, after the thumb-pad camera, so the view can be pointed at the helper
  function update(S, dt) {
    if (APP.menu || APP.away) { if (T.state === 'offer') { T.state = ''; E.offer.hidden = true; } return; }
    if (T.state === 'aim' || T.state === 'throw') {             // the rings sit on his hard hat, wherever it is on screen
      const h = WORLD.crewHead(T.id), p = WORLD.project(h.setY(h.y - 0.3));
      E.zone.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    }
    if (S.paused) return;
    if (T.state === '') {
      if (drilling()) { T.next -= dt; if (T.next <= 0) offer(); }
      return;
    }
    if (T.state === 'offer') {
      if (!drilling()) { T.state = ''; T.next = rand(15, 30); E.offer.hidden = true; return; }
      T.left -= dt;
      E.bar.style.width = (clamp(T.left / OFFER, 0, 1) * 100).toFixed(1) + '%';
      if (T.left <= 0) { T.state = ''; T.next = rand(EVERY[0], EVERY[1]); E.offer.hidden = true; }
      return;
    }
    const h = WORLD.crewHead(T.id);
    if (T.state === 'react' && T.hit) WORLD.aim(h.x, h.y - 0.32, h.z, 30);        // in close, so the little white thing on his hat can be seen
    else WORLD.aim(h.x, h.y - 0.45, h.z, T.state === 'react' ? 46 : 52);
    T.t += dt;
    if (T.state === 'aim' && !T.ready) {                          // turn to face him first; the rings start once he is in view
      T.wait += dt; T.t = 0;
      const p = WORLD.project(h), cv = WORLD.renderer.domElement, w = cv.clientWidth, ht = cv.clientHeight;
      if ((p.front && Math.abs(p.x - w / 2) < w * 0.3 && Math.abs(p.y - ht / 2) < ht * 0.4) || T.wait > 1.4) { T.ready = true; E.zone.style.visibility = ''; }
    } else if (T.state === 'aim') {
      T.s = R0 - (R0 - R1) * (T.t / (S.site ? S.site.tune.ring : SHRINK));
      E.ring.style.transform = `translate(-50%, -50%) scale(${Math.max(R1, T.s).toFixed(3)})`;
      if (T.s <= R1) { T.hit = false; throwIt(); }       // never tapped
    } else if (T.state === 'throw') {
      if (!WORLD.tossing || T.t > 2) react();
    } else if (T.state === 'react') {
      if (T.t > (T.hit ? 2.7 : 2.1)) done();
    }
  }
  // Z throws when the button is up; Space, Enter or Z lets go during the timing ring. While the ring is up, other keys wait.
  function key(e) {
    if (T.state === 'offer' && e.code === 'KeyZ') { take(); return true; }
    if (T.state === 'aim') { if (!e.repeat && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ')) tap(); return e.code !== 'Escape'; }
    if (T.state === 'throw' || T.state === 'react') return e.code !== 'Escape';
    return false;
  }

  return { init, reset, update, key, get busy() { return T.state === 'aim' || T.state === 'throw' || T.state === 'react'; }, get state() { return T; } };
})();
