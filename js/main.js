'use strict';
/* Sonic Driller 3D: game loop, mouse and touch (look around + work the controls), keyboard, menus, phone layout. */
(() => {
  const APP = window.APP = { hole: SITES.career.last, nextHole: SITES.career.last, S: SIM.newGame(undefined, SITES.career.last), speed: 1, reportShown: false, seenRuns: 0, away: false, freeze: false, phone: false, menu: false, fly: false, briefed: false, easy: false };
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function setPaused(p) {
    APP.S.paused = p;
    $('btnPause').textContent = p ? 'Resume' : 'Pause';
    $('btnPause').setAttribute('aria-pressed', String(p));
    $('pausedTag').hidden = !p || (APP.S.done && !WELL.active);
    AUDIO.pause(p);
  }
  function setSpeed(n) {
    APP.speed = n;
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === n));
  }
  function openBrief(first) {
    $('briefGo').textContent = first ? 'Start the shift' : 'Back to the rig';
    $('brief').hidden = false;
    if (!APP.S.paused) { APP.resumeAfterBrief = true; setPaused(true); }
  }
  function closeBrief() {
    $('brief').hidden = true;
    AUDIO.init();
    if (APP.menu) { APP.briefed = true; leaveMenu(); return; }          // first briefing, read from the main menu: now fly down and start
    if (APP.S.paused && APP.resumeAfterBrief) setPaused(false);
    APP.resumeAfterBrief = false;
  }

  // ---------- main menu ----------
  // The drone circles the site behind the title. Start flies it down into the driller's head.
  function showMenu(instant) {
    APP.menu = true; APP.fly = false;
    document.body.classList.add('at-menu');
    dropPointers(); PANEL.setHover(null); HUD.tooltip(null); PANEL.setHands(false);
    if (!APP.S.paused) setPaused(true);
    const mid = APP.S.t > 0 && !APP.S.done;
    $('menuStart').textContent = mid ? 'Back to the shift' : `Start hole ${APP.S.done ? APP.nextHole : APP.hole}`;
    $('menuNew').hidden = !mid;
    showSite();
    WORLD.setDrone(true, instant);
  }
  function leaveMenu() {
    APP.menu = false; APP.fly = true;
    document.body.classList.remove('at-menu');
    $('pausedTag').hidden = true;                 // the clock starts when the drone has landed
    layout(false);
    if (APP.phone && !APP.easy) WORLD.preset('work');
    WORLD.setDrone(false, false, () => { APP.fly = false; PANEL.setHands(true); setPaused(false); });
  }

  // ---------- pick your crew: one driller and two helpers, from the roster in crew.js ----------
  const JOBS = [
    ['driller', 'Driller', 'That is you, at the console.'],
    ['lead', 'Helper 1', 'Lead hand: hooks the winch, runs the chain wrench, handles the rods.'],
    ['core', 'Helper 2', 'Core hand: catches the core and runs the water truck.'],
  ];
  const person = id => ROSTER.find(p => p.id === id) || ROSTER[0];
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  let pickJob = 'driller', pickAfter = null, faces = null, briefSrc = null;
  // put the chosen people into the game: their names in the drilling model, their models on the site
  function applyCrew() {
    const S = APP.S, d = person(settings.crew.driller), l = person(settings.crew.lead), c = person(settings.crew.core);
    S.driller = d.name;
    S.crew[0].name = l.name; S.crew[0].hat = hex(l.look.hat);
    S.crew[1].name = c.name; S.crew[1].hat = hex(c.look.hat);
    WORLD.setCrew({ driller: d.look, lead: l.look, core: c.look });
    if (!briefSrc) briefSrc = { briefEasy: $('briefEasy').innerHTML, briefFull: $('briefFull').innerHTML };
    for (const id in briefSrc) $(id).innerHTML = SIM.nm(S, briefSrc[id]).replace(/\{well\}/g, S.site.well).replace(/\{depth\}/g, S.site.depth);
    showSite();
  }
  // The rule: only a driller can take the driller's seat. A driller may fill a helper's spot. A helper never drills.
  const canDo = (p, job) => job !== 'driller' || p.trade === 'driller';
  let pickMsg = '';
  function choose(p) {
    const cr = settings.crew, had = JOBS.find(j => cr[j[0]] === p.id);
    pickMsg = '';
    if (!canDo(p, pickJob)) { pickMsg = `${p.name} is a helper. Only a driller can take the driller's seat.`; return; }
    if (had && had[0] === pickJob) return;
    if (had) {                                   // this person already has a job: the two swap, if the other one is allowed to
      const other = person(cr[pickJob]);
      if (canDo(other, had[0])) cr[had[0]] = other.id;
      else {                                     // a driller is stepping down to help, and the helper cannot take the seat
        const spare = ROSTER.find(q => q.trade === 'driller' && q.id !== p.id && !JOBS.some(j => cr[j[0]] === q.id));
        if (!spare) { pickMsg = `${p.name} is your only free driller. Somebody has to drill.`; return; }
        cr[had[0]] = spare.id;
        pickMsg = `${spare.name} takes the driller's seat.`;
      }
    }
    cr[pickJob] = p.id;
    const i = JOBS.findIndex(j => j[0] === pickJob); pickJob = JOBS[(i + 1) % JOBS.length][0];
  }
  function drawPick() {
    const face = id => (faces && faces[ROSTER.indexOf(person(id))]) || '';
    const slots = $('pickSlots'), grid = $('pickGrid');
    slots.innerHTML = ''; grid.innerHTML = '';
    for (const [key, label, what] of JOBS) {
      const p = person(settings.crew[key]);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'slot slot-' + key; b.setAttribute('aria-pressed', String(key === pickJob));
      b.innerHTML = `<img alt="" src="${face(p.id)}"><small>${label}</small><b></b><i>${what}</i>`;
      b.querySelector('b').textContent = p.name;
      b.addEventListener('click', () => { pickJob = key; pickMsg = ''; drawPick(); });
      slots.append(b);
    }
    for (const p of ROSTER) {
      const job = JOBS.find(j => settings.crew[j[0]] === p.id), ok = canDo(p, pickJob);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'card' + (job ? ' used' : '') + (ok ? '' : ' no');
      b.setAttribute('aria-disabled', String(!ok));
      b.innerHTML = `<img alt="" src="${face(p.id)}"><b></b><span class="trade ${p.trade}">${p.trade === 'driller' ? 'Driller' : 'Helper'}</span>${job ? `<em>${job[1]}</em>` : ''}`;
      b.querySelector('b').textContent = p.name;
      b.addEventListener('click', () => { choose(p); drawPick(); });
      grid.append(b);
    }
    $('pickMsg').textContent = pickMsg || (pickJob === 'driller' ? "Picking the driller. Only drillers can take this seat." : 'Picking a helper. Helpers and drillers can both help.');
    $('pickMsg').classList.toggle('warn', !!pickMsg && !/takes the/.test(pickMsg));
  }
  function openPick(after) {
    pickAfter = after; pickJob = 'driller'; pickMsg = '';
    if (!faces) faces = WORLD.portraits(ROSTER.map(p => p.look), 240, 270);
    drawPick();
    $('pick').hidden = false;
  }
  function closePick(go) {
    $('pick').hidden = true;
    const f = pickAfter; pickAfter = null;
    if (go) { applySettings(true); if (f) f(); }
  }

  // ---------- settings (kept in this browser) ----------
  const SET_KEY = 'yhiog-settings';
  const settings = { sound: true, volume: 100, sens: 100, shake: true, gfx: '', controls: '', crew: ROSTER.defaults() };
  function loadSettings() {
    try {
      const o = JSON.parse(localStorage.getItem(SET_KEY) || '{}') || {};
      if (typeof o.sound === 'boolean') settings.sound = o.sound;
      if (typeof o.shake === 'boolean') settings.shake = o.shake;
      if (o.volume >= 0 && o.volume <= 100) settings.volume = +o.volume;
      if (o.sens >= 40 && o.sens <= 200) settings.sens = +o.sens;
      if (['low', 'medium', 'high'].includes(o.gfx)) settings.gfx = o.gfx;
      if (['easy', 'full'].includes(o.controls)) settings.controls = o.controls;
      const cr = o.crew, ids = cr && [cr.driller, cr.lead, cr.core];
      if (ids && ids.every(id => ROSTER.some(p => p.id === id)) && new Set(ids).size === 3 && ROSTER.find(p => p.id === cr.driller).trade === 'driller') settings.crew = { driller: cr.driller, lead: cr.lead, core: cr.core };
    } catch (e) { /* no saved settings, or storage is blocked */ }
    if (!settings.gfx) settings.gfx = isPhone() ? 'medium' : 'high';
    if (!settings.controls) settings.controls = isPhone() || coarse ? 'easy' : 'full';
  }
  function applySettings(save) {
    AUDIO.setMuted(!settings.sound); AUDIO.setVolume(settings.volume / 100);
    WORLD.setOptions({ sens: settings.sens / 100, shake: settings.shake });
    $('setSound').setAttribute('aria-checked', String(settings.sound));
    $('setShake').setAttribute('aria-checked', String(settings.shake));
    $('setVol').value = settings.volume; $('setVolOut').textContent = settings.volume + '%';
    $('setSens').value = settings.sens; $('setSensOut').textContent = settings.sens + '%';
    document.querySelectorAll('[data-gfx]').forEach(b => { const on = b.dataset.gfx === settings.gfx; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    document.querySelectorAll('[data-ctl]').forEach(b => { const on = b.dataset.ctl === settings.controls; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const pending = (settings.controls === 'easy') !== APP.easy;
    $('setCtlNote').textContent = pending ? 'This hole carries on as it is. The change starts with the next hole.' : 'Thumb pads: you push and spin, the crew does the rest. Full rig: you run every lever.';
    if (save) { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* storage is blocked: the settings last until the page closes */ } }
  }
  function openSettings() {
    $('setQuit').hidden = APP.menu || APP.away || APP.fly;
    $('settings').hidden = false;
    if (!APP.menu && !APP.S.paused) { APP.resumeAfterSet = true; setPaused(true); }
  }
  function closeSettings() {
    $('settings').hidden = true;
    if (!APP.menu && APP.S.paused && APP.resumeAfterSet) setPaused(false);
    APP.resumeAfterSet = false;
  }
  function bindSettings() {
    $('setSound').addEventListener('click', () => { AUDIO.init(); settings.sound = !settings.sound; applySettings(true); });
    $('setShake').addEventListener('click', () => { settings.shake = !settings.shake; applySettings(true); });
    $('setVol').addEventListener('input', e => { AUDIO.init(); settings.volume = +e.target.value; applySettings(true); });
    $('setSens').addEventListener('input', e => { settings.sens = +e.target.value; applySettings(true); });
    document.querySelectorAll('[data-gfx]').forEach(b => b.addEventListener('click', () => { settings.gfx = b.dataset.gfx; WORLD.setOptions({ quality: settings.gfx }); applySettings(true); }));
    document.querySelectorAll('[data-ctl]').forEach(b => b.addEventListener('click', () => { settings.controls = b.dataset.ctl; if (APP.S.t === 0) setMode(); applySettings(true); }));
    $('setDone').addEventListener('click', closeSettings);
    $('setQuit').addEventListener('click', () => { APP.resumeAfterSet = false; closeSettings(); showMenu(false); });
    $('btnSettings').addEventListener('click', openSettings);
    $('menuSettings').addEventListener('click', openSettings);
    // Start on a fresh hole: pick the crew, then the briefing (first time), then fly down
    $('menuStart').addEventListener('click', () => {
      AUDIO.init();
      if (APP.S.t > 0 && !APP.S.done) leaveMenu();
      else if (APP.S.done) holeFromMenu(APP.nextHole);          // the last hole is finished: on to the next one (or the same again)
      else openPick(() => { applyCrew(); HUD.reset(); if (!APP.briefed) openBrief(true); else leaveMenu(); });
    });
    $('menuNew').addEventListener('click', () => { AUDIO.init(); holeFromMenu(APP.hole); });
    $('menuHoles').addEventListener('click', () => { AUDIO.init(); openHoles(); });
    $('holesBack').addEventListener('click', () => { $('holes').hidden = true; });
    $('pickGo').addEventListener('click', () => closePick(true));
    $('pickBack').addEventListener('click', () => closePick(false));
  }
  // ---------- install as an app ----------
  // The game can only be installed from its own web address. There, Android and computers get a one-tap install and an
  // iPhone gets the steps to follow in Safari. Anywhere else (the older claude.ai links), the same button sends
  // people to that address first. Either way it asks which device, and shows the steps for that one.
  let installEvt = null;
  function bindInstall() {
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) || navigator.standalone === true;
    const hosted = /(^|\.)github\.io$/.test(location.hostname) || location.hostname === 'localhost';
    const I = $('install'), btns = [$('menuInstall'), $('rotateInstall')], show = v => btns.forEach(b => { b.hidden = !v; });
    show(!standalone);
    if (standalone) return;
    const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const mine = ios ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
    const inApp = ios && !/CriOS|FxiOS|EdgiOS/.test(ua) && (!/Safari/.test(ua) || /FBAN|FBAV|Instagram|Line\/|Snapchat|GSA\//.test(ua));
    const ready = () => { const ok = hosted && !!installEvt; $('instNow').hidden = !ok; I.dataset.ready = ok ? '1' : ''; };
    const pick = os => {
      I.dataset.os = os;
      I.querySelectorAll('[data-os-pick]').forEach(b => { const on = b.dataset.osPick === os; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      $('instInApp').hidden = !(hosted && os === 'ios' && inApp);
    };
    const sheet = () => { I.dataset.away = hosted ? '' : '1'; pick(mine); ready(); I.hidden = false; };
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; ready(); });
    window.addEventListener('appinstalled', () => { installEvt = null; show(false); I.hidden = true; });
    btns.forEach(b => b.addEventListener('click', sheet));
    I.querySelectorAll('[data-os-pick]').forEach(b => b.addEventListener('click', () => pick(b.dataset.osPick)));
    $('instNow').addEventListener('click', () => { if (installEvt) installEvt.prompt(); });
    $('instCopy').addEventListener('click', () => {
      const url = $('instLink').href.replace(/#.*$/, ''), done = () => { $('instCopy').textContent = 'Copied'; setTimeout(() => { $('instCopy').textContent = 'Copy link'; }, 2000); };
      const byHand = () => { const r = document.createRange(); r.selectNodeContents($('instUrl')); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); try { if (document.execCommand('copy')) done(); } catch (e) { /* left selected, to copy by hand */ } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, byHand); else byHand();
    });
    $('instDone').addEventListener('click', () => { I.hidden = true; });
    if (hosted && /install/.test(location.hash)) setTimeout(sheet, 700);          // a link ending in #install opens straight onto the install help
  }
  function neutral() { const c = APP.S.ctl; c.feed = 0; c.rot = 0; c.winch = 0; c.slide = 0; c.arm = 0; c.brk = 0; }
  // walk to the core table for a close look at a sample. auto = straight after a run: shut the sonic down first
  function goInspect(i, auto) {
    if (APP.away || !APP.S.runs.length) return;
    APP.away = true; dropPointers(); PANEL.setHover(null); HUD.tooltip(null);
    if (APP.easy) APP.freeze = true;                 // the autopilot has the levers: just stop the clock while the driller is away
    else if (auto) { neutral(); if (APP.S.ctl.oscOn) SIM.ACT.setOsc(APP.S, false); }
    else APP.freeze = true;
    document.body.classList.add('inspecting');
    PANEL.setHands(false);
    INSPECT.prepare(APP.S, i);
    WORLD.walkTo(true, () => { APP.freeze = true; INSPECT.open(APP.S, i); $('inspBack').focus(); });
  }
  function leaveInspect() {
    if (!APP.away || WORLD.walking || !INSPECT.isOpen) return;
    INSPECT.close(); APP.freeze = false;
    WORLD.walkTo(false, () => { APP.away = false; PANEL.setHands(true); document.body.classList.remove('inspecting'); });
  }
  // ---------- the career: ten holes, each harder than the last (js/sites.js) ----------
  // the bits of the screen that name the hole
  function showSite() {
    const st = APP.S.site, at = APP.S.done && APP.menu ? SITES.get(APP.nextHole) : st;
    $('jobTag').textContent = `Hole ${st.n} of ${SITES.COUNT} · ${st.name} · ${st.depth} ft · pass mark ${SITES.PASS}`;
    $('holeChip').textContent = `${st.n}/${SITES.COUNT}`;
    $('holeChip').title = `Hole ${st.n} of ${SITES.COUNT}: ${st.name}`;
    $('bhTitle').textContent = `Borehole ${st.well} `;
    $('menuHole').textContent = `Hole ${at.n} of ${SITES.COUNT}: ${at.name} · ${at.depth} ft`;
    $('briefSub').textContent = `07:00 · Hole ${st.n} of ${SITES.COUNT} · ${st.name} · borehole ${st.well}`;
    $('briefSite').innerHTML = `<b>Today: ${st.name}.</b> ${st.depth} ft, water at ${st.wt} ft. ${st.blurb}`;
    $('reportSub').textContent = `Hole ${st.n} of ${SITES.COUNT} · ${st.name} · borehole ${st.well}`;
  }
  // The hole selection screen. It comes up after every hole (from the report's Continue button) and from the main
  // menu. Every hole is on it: the ones passed with their top score, the one to drill next, and the locked ones,
  // blacked out until the hole before them has been passed. Tap an open one to drill it.
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/></svg>';
  function openHoles() {
    const grid = $('holesGrid'), C = SITES.career, S = APP.S, after = S.done && !APP.menu;
    const next = S.done ? APP.nextHole : S.site.n;
    grid.innerHTML = '';
    for (let n = 1; n <= SITES.COUNT; n++) {
      const st = SITES.get(n), open = SITES.isOpen(n), best = C.best[n], passed = best >= SITES.PASS;
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'hole' + (open ? '' : ' locked') + (passed ? ' passed' : '') + (open && n === next ? ' cur' : '');
      b.disabled = !open;
      if (!open) {
        b.innerHTML = `<i>${LOCK}</i><b>Locked</b><span class="h-depth">Hole ${n}</span><span class="h-blurb">Complete hole ${n - 1} first.</span>`;
        b.setAttribute('aria-label', `Hole ${n}: locked. Complete hole ${n - 1} first.`);
      } else {
        const status = passed ? `Completed · top score ${best}` : best != null ? `Top score ${best} · ${SITES.PASS} to pass` : 'Not drilled yet';
        b.innerHTML = `<i>${n}</i><b></b><span class="h-depth">${st.depth} ft · water at ${st.wt} ft</span><span class="h-blurb"></span><span class="h-best">${status}</span>${n === next ? `<em>${after && passed ? 'Play again' : 'Up next'}</em>` : ''}`;
        b.querySelector('b').textContent = st.name;
        b.querySelector('.h-blurb').textContent = st.blurb;
        b.addEventListener('click', () => { $('holes').hidden = true; if (APP.menu) holeFromMenu(n); else newHole(n); });
      }
      grid.append(b);
    }
    const done = Object.keys(C.best).filter(k => C.best[k] >= SITES.PASS).length;
    $('holesTitle').textContent = after ? 'Pick your next hole' : 'Pick a hole';
    $('holesSub').textContent = `${done} of ${SITES.COUNT} completed · score ${SITES.PASS} or better to complete a hole and unlock the next`;
    $('holesBack').textContent = after ? 'Back to the report' : 'Back';
    $('holes').hidden = false;
    const cur = grid.querySelector('.cur'); if (cur) { cur.scrollIntoView({ block: 'nearest' }); cur.focus({ preventScroll: true }); }
  }
  // from the main menu: pick the crew, read the briefing the first time, then fly down to a fresh hole
  function holeFromMenu(n) {
    openPick(() => { newHole(n); setPaused(true); if (!APP.briefed) openBrief(true); else leaveMenu(); });
  }
  // the well is built and signed off: keep the grade, open the next hole on a pass, and show the report
  function endHole(S) {
    const n = S.site.n, res = SITES.record(n, S.report.score), more = n < SITES.COUNT && SITES.isOpen(n + 1);
    APP.nextHole = res.passed && more ? n + 1 : n;
    SITES.setLast(APP.nextHole);
    HUD.showReport(S, res);
    S.sfx.push(res.passed ? 'done' : 'stub');
  }
  function newHole(n) {
    if (n) APP.hole = n;
    APP.nextHole = APP.hole; SITES.setLast(APP.hole);
    APP.S = SIM.newGame(undefined, APP.hole);
    WELL.reset();
    TOSS.reset();
    NAG.reset();
    MARL.reset();
    AARON.reset();
    APP.reportShown = false; APP.seenRuns = 0;
    $('report').hidden = true;
    applyCrew();
    HUD.reset();
    setMode();
    setPaused(false);
  }

  // ---------- which controls: thumb pads with the crew on autopilot, or the full rig ----------
  // Chosen when a hole starts, because the autopilot has to run a hole from its beginning.
  function setMode() {
    APP.easy = settings.controls === 'easy' && APP.S.t === 0;
    document.body.classList.toggle('easy', APP.easy);
    EASY.show(APP.easy);
    WORLD.setOptions({ calm: APP.easy });
    if (APP.easy) AUTO.start(APP.S); else AUTO.stop();
    if (!APP.easy && !APP.away && !APP.menu) WORLD.preset('work');
  }

  // ---------- a smoke ----------
  const QUIPS = [['dale', 'Got a spare one, boss?'], ['dale', "Smoke 'em if you got 'em."], ['tess', 'Downwind of the core, please.'], ['tess', 'Those will kill you before the rig does.'], ['dale', 'Not near the fuel tank, eh.']];
  let smokeShown = false;
  function toggleSmoke() {
    AUDIO.init();
    const S = APP.S, on = WORLD.smoke(!WORLD.smoking);
    S.sfx.push(on ? 'lighter' : 'stub');
    if (on) {
      S.stats.smokes = (S.stats.smokes || 0) + 1;
      const [who, line] = QUIPS[Math.floor(Math.random() * QUIPS.length)];
      const m = S.crew.find(x => x.id === who);
      if (m && !m.hidden && !(m.sayT > 0) && Math.random() < 0.6) { m.say = line; m.sayT = 3.5; }
    }
  }
  function syncSmoke() {
    const on = WORLD.smoking; if (on === smokeShown) return;
    smokeShown = on;
    $('btnSmoke').textContent = on ? 'Put it out' : 'Light a smoke';
    $('btnSmoke').setAttribute('aria-pressed', String(on));
  }

  // ---------- berate a helper ----------
  // The driller lets one of the two helpers have it. {name} is swapped for whoever is on the receiving end.
  const BERATE = [
    'What the hell are you doing, {name}?',
    'Who the fuck taught you how to drill?',
    '{name}! Pull your head out of your ass!',
    'My grandmother trips rods faster than that, and she is dead!',
    'Are you working, {name}, or just standing there looking pretty?',
    'That is a chain wrench, not a fucking paperweight!',
    'Did you leave your brain in the truck again, {name}?',
    'I have seen cobbles with more hustle than you!',
    'Hey, {name}! The hole is over HERE, genius!',
    'You are about as useful as a screen door on a submarine.',
    "For fuck's sake, {name}, it is righty-tighty!",
    'If you were any slower you would be going backwards!',
    'Do I have to come down there and do it my damn self?',
    '{name}, you could not find the hole with a map and a flashlight!',
    'One job. You had ONE fucking job!',
    'Quit daydreaming and grab that pipe, {name}!',
    'I swear you get dumber every shift, {name}.',
    'Were you raised on a rig or dropped off one?',
    'Move it, {name}! We are burning daylight!',
    'Jesus Christ, {name}. Just... Jesus Christ.',
    'Did they hire you off Temu?',
    'You must be neither handed.',
    'The bus you rode to school on was a regular cab.',
  ];
  let berateBag = [], meTimer = null;
  function berate() {
    if (APP.menu || APP.fly || APP.away || APP.S.paused) return;
    AUDIO.init();
    const S = APP.S, there = S.crew.filter(m => !m.hidden);
    const m = there.length ? there[Math.floor(Math.random() * there.length)] : S.crew[0];
    if (!berateBag.length) { berateBag = BERATE.slice(); for (let i = berateBag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [berateBag[i], berateBag[j]] = [berateBag[j], berateBag[i]]; } }
    const bub = $('bubMe');
    bub.querySelector('span').textContent = berateBag.pop().replace(/\{name\}/g, m.name);
    bub.hidden = false;
    clearTimeout(meTimer); meTimer = setTimeout(() => { bub.hidden = true; }, 2800);
    WORLD.sadden(m.id, 2.2);
    if (APP.easy) EASY.watch(m.id, 2.3);
    S.sfx.push('yell');
    S.stats.berated = (S.stats.berated || 0) + 1;
  }

  // ---------- phone layout ----------
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  function isPhone() { const w = window.innerWidth, h = window.innerHeight; return Math.min(w, h) <= 560 || (coarse && Math.max(w, h) <= 1000); }
  function setCrewOpen(open) {
    document.body.classList.toggle('crew-open', open);
    $('crewTog').textContent = open ? 'show less' : 'show all';
  }
  function layout(first) {
    const p = isPhone(), changed = p !== APP.phone;
    if (changed || first) {
      APP.phone = p;
      document.body.classList.toggle('phone', p);
      WORLD.setPhone(p);
      if (p) { $('bhWrap').hidden = true; $('btnBore').setAttribute('aria-pressed', 'false'); setCrewOpen(false); }
      $('more').classList.remove('open'); $('btnMore').setAttribute('aria-expanded', 'false');
    }
    // the notes start just under the top bar, however many rows its buttons wrap onto
    const bar = document.querySelector('.topctl').getBoundingClientRect();
    if (bar.height) document.documentElement.style.setProperty('--hud-top', Math.round(bar.bottom + (p ? 7 : 12)) + 'px');
    if ((p || changed) && !APP.away && !APP.easy) WORLD.preset('work');      // the framed views depend on the screen shape
  }
  // the part of the screen the overlays leave free, for framing the panel on a phone
  function freeArea() {
    const W = window.innerWidth, H = window.innerHeight, box = q => document.querySelector(q).getBoundingClientRect();
    const t = box('.topctl'), b = box('#book'), v = box('.views'), c = box('.hud-right');
    let top = t.bottom + 4, bottom = 8, left = 8, right = 8;
    if (v.height) bottom = H - v.top + 4;
    if (b.height) { if (b.width > W * 0.6) top = b.bottom + 6; else left = b.right + 6; }
    if (c.height && W > H) right = W - c.left + 6;
    return { top, bottom, left, right };
  }

  // ---------- mouse / touch ----------
  // One finger (or the mouse) on a control works it; anywhere else it turns the driller's head.
  // A second finger always looks around, and two fingers together pinch to zoom.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pts = new Map();
  let ctlPtr = null, mouse = null, pinch = 0, lookMoved = 0, linger = null;
  const lookers = () => [...pts.values()].filter(p => p.role === 'look');
  function dropPointers() { for (const p of pts.values()) p.role = 'look'; ctlPtr = null; pinch = 0; PANEL.end(); }
  function pickAt(x, y, finger) {
    if (APP.away || APP.menu || APP.fly || APP.easy) return null;
    const r = WORLD.renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, WORLD.camera);
    return PANEL.hit(ray) || (finger ? PANEL.nearest(x - r.left, y - r.top, 30) : null);
  }
  function bindPointer(cv) {
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      if (APP.menu || APP.fly) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      const finger = e.pointerType !== 'mouse';
      const p = { x: e.clientX, y: e.clientY, role: 'look', finger, moved: 0, t0: performance.now(), d: null };
      const first = pts.size === 0;
      if (!first) {
        // a second finger: if the first one only just grabbed a control, that was the start of a pinch, so let go of it
        for (const o of pts.values()) {
          if (o.role === 'tap') o.role = 'look';
          else if (o.role === 'ctl' && o.finger && performance.now() - o.t0 < 280 && o.moved < 16) { PANEL.cancel(); o.role = 'look'; ctlPtr = null; }
        }
      } else if (e.button !== 2) {
        const d = pickAt(e.clientX, e.clientY, finger);
        if (d) {
          AUDIO.init(); p.d = d;
          if (d.type === 'lever' || d.type === 'knob') { PANEL.begin(d); p.role = 'ctl'; ctlPtr = e.pointerId; }
          else { p.role = 'tap'; if (!finger) PANEL.begin(d); }     // a finger flips the switch when it lifts, so a drag can still look around
        }
      }
      pts.set(e.pointerId, p); pinch = 0;
      if (p.role === 'look') cv.classList.add('looking');
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY };
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (p.role === 'ctl') PANEL.move(dx, dy);
      else if (p.role === 'tap') { if (p.finger && p.moved > 16) { p.role = 'look'; cv.classList.add('looking'); } }
      else {
        const L = lookers();
        if (L.length >= 2) {
          const d = Math.hypot(L[0].x - L[1].x, L[0].y - L[1].y);
          if (pinch > 0 && d > 0) WORLD.zoomBy(d / pinch);
          pinch = d;
          WORLD.lookDrag(dx / 2, dy / 2);
        } else WORLD.lookDrag(dx, dy);
        if (APP.easy) EASY.held();
        lookMoved += Math.abs(dx) + Math.abs(dy);
        if (lookMoved > 200) $('hintStrip').hidden = true;
      }
    });
    const up = e => {
      const p = pts.get(e.pointerId); if (!p) return;
      pts.delete(e.pointerId); pinch = 0;
      if (p.role === 'ctl') { PANEL.end(); ctlPtr = null; }
      else if (p.role === 'tap' && p.finger && e.type === 'pointerup') PANEL.begin(p.d);
      if (p.finger && p.d && p.role !== 'look') linger = { d: p.d, x: p.x, y: p.y, until: performance.now() + 1500 };
      if (!lookers().length) cv.classList.remove('looking');
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') mouse = null; });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (APP.menu || APP.fly) return;
      const d = pickAt(e.clientX, e.clientY), dir = e.deltaY < 0 ? 1 : -1;
      if (d) PANEL.wheel(d, dir * (e.shiftKey ? 5 : 1)); else WORLD.zoom(-dir * 4);
    }, { passive: false });
  }
  function updateHover() {
    let d = null, at = null, finger = false;
    const held = [...pts.values()].find(p => p.role === 'ctl' || p.role === 'tap');
    if (held) { d = held.d; at = held; finger = held.finger; }
    else if (!pts.size && mouse) { d = pickAt(mouse.x, mouse.y); at = mouse; }
    if (d) linger = null;
    else if (linger && performance.now() < linger.until && !pts.size && !APP.away) { d = linger.d; at = linger; finger = true; }
    PANEL.setHover(d);
    WORLD.renderer.domElement.style.cursor = d ? (d.type === 'lever' && d.axis === 'x' ? 'ew-resize' : d.type === 'lever' || d.type === 'knob' ? 'ns-resize' : 'pointer') : '';
    if (d && at) HUD.tooltip(PANEL.describe(d), at.x, at.y, finger); else HUD.tooltip(null);
  }

  function start(data) {
    if (/unlock/.test(location.hash)) SITES.openAll();          // for play testing: an address ending in #unlock opens every hole
    if (data && data.S && data.S.ctl && data.S.winch && data.S.tc) { APP.S = data.S; APP.speed = data.speed || 1; APP.S.site = SIM.useSite(APP.S.site ? APP.S.site.n : 4); APP.hole = APP.nextHole = APP.S.site.n; }
    if (coarse || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
    WORLD.init($('view'));
    PANEL.build(APP);
    loadSettings(); applyCrew();
    HUD.init(APP);
    INSPECT.init();
    EASY.init(APP);
    WELL.init(APP);
    TOSS.init(APP);
    NAG.init(APP);
    MARL.init(APP);
    AARON.init(APP);
    APP.seenRuns = APP.S.runs.length;
    WORLD.setInsets(freeArea);
    $('inspBack').addEventListener('click', leaveInspect);
    $('btnCore').addEventListener('click', () => goInspect(APP.S.runs.length - 1, false));
    bindPointer($('view'));
    setSpeed(APP.speed);
    $('btnPause').addEventListener('click', () => { AUDIO.init(); setPaused(!APP.S.paused); });
    $('btnSmoke').addEventListener('click', toggleSmoke);
    $('btnBerate').addEventListener('click', berate);
    $('btnHelp').addEventListener('click', () => openBrief(false));
    $('btnNotes').addEventListener('click', () => {
      const off = document.body.classList.toggle('notes-off');
      $('btnNotes').textContent = off ? 'Show notes' : 'Hide notes';
    });
    $('btnBore').addEventListener('click', () => { $('bhWrap').hidden = !$('bhWrap').hidden; $('btnBore').setAttribute('aria-pressed', String(!$('bhWrap').hidden)); });
    $('briefGo').addEventListener('click', closeBrief);
    $('holesBtn').addEventListener('click', openHoles);          // Continue: on to the hole selection screen
    $('reviewBtn').addEventListener('click', () => { $('report').hidden = true; });
    document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { if (!APP.away) WORLD.preset(b.dataset.view); }));
    // phone extras: the menu, the field book that folds to its title, the short crew list, all levers to neutral
    $('btnMore').addEventListener('click', () => { const o = $('more').classList.toggle('open'); $('btnMore').setAttribute('aria-expanded', String(o)); });
    $('more').addEventListener('click', () => { $('more').classList.remove('open'); $('btnMore').setAttribute('aria-expanded', 'false'); });
    $('book').addEventListener('click', () => { if (APP.phone) $('book').classList.toggle('min'); });
    $('crewH').addEventListener('click', () => { if (APP.phone) setCrewOpen(!document.body.classList.contains('crew-open')); });
    $('btnNeutral').addEventListener('click', neutral);
    $('rotateOk').addEventListener('click', () => document.body.classList.add('upright'));
    layout(true);
    bindSettings(); bindInstall(); WORLD.setOptions({ quality: settings.gfx }); setMode(); applySettings(false);
    window.addEventListener('resize', () => layout(false));
    setTimeout(() => { $('hintStrip').hidden = true; }, 60000);
    if (APP.S.t > 0) setPaused(APP.S.paused); else { APP.S.paused = true; showMenu(true); }
    requestAnimationFrame(frame);
  }

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const S = APP.S;
    const running = !S.paused && !S.done && !APP.freeze && !(APP.easy && AUTO.st.qte) && !TOSS.busy && !NAG.busy && !MARL.busy && !AARON.busy;
    if (running) {
      // thumb-pad mode: the player's own drilling runs at the chosen speed, the crew's pipe work runs faster
      const sdt = dt * (APP.easy ? EASY.speed || APP.speed : APP.speed), n = Math.max(1, Math.ceil(sdt / 0.02));
      for (let i = 0; i < n; i++) {
        const undo = MARL.mask(S);                 // a broken function: its control is cut off before the drilling model sees it
        SIM.step(S, sdt / n);
        if (undo) undo();
        if (APP.easy) { AUTO.tick(); if (AUTO.st.qte) break; }
      }
    }
    try {
      WORLD.update(S, dt, running);
      PANEL.update(S, dt);
      updateHover();
      WORLD.render();
    } catch (e) { console.error(e); }
    HUD.update(S, dt);
    EASY.update(S, dt);
    WELL.update(S, dt);
    TOSS.update(S, dt);
    NAG.update(S, dt);
    MARL.update(S, dt);
    AARON.update(S, dt);
    syncSmoke();
    if (AUDIO.ready()) AUDIO.update(S, dt); else S.sfx.length = 0;
    if (S.runs.length > APP.seenRuns && !APP.away && !APP.menu) { APP.seenRuns = S.runs.length; goInspect(S.runs.length - 1, true); }
    $('btnCore').disabled = !S.runs.length || APP.away;
    // the hole is finished: the engineer walks over and the crew builds the well. The shift report comes after that
    if (S.done && !APP.away && !APP.menu && !APP.fly) {
      if (!S.well) WELL.start(S);
      else if (WELL.finished && !APP.reportShown) { APP.reportShown = true; setTimeout(() => endHole(S), 700); }
    }
    requestAnimationFrame(frame);
  }

  // keyboard: W/S feed, A/D rotation, R/F winch, Space neutral, arrows frequency, O oscillator, P pump,
  // [ ] flow, C bottom clamp, X top clamp, , . break-out, J/L head slide, K side switch, U/Y casing arm, Q tilt,
  // T/G throttle, E engine, H horn, V look at panel, I inspect core, B light a smoke, Esc pause, 1/2/4 speed
  window.addEventListener('keydown', e => {
    if (!$('install').hidden) { if (e.key === 'Escape' || e.key === 'Enter') { $('install').hidden = true; e.preventDefault(); } return; }
    if (!$('settings').hidden) { if (e.key === 'Escape') { closeSettings(); e.preventDefault(); } return; }
    if (!$('holes').hidden) { if (e.key === 'Escape') { $('holes').hidden = true; e.preventDefault(); } return; }
    if (!$('pick').hidden) { if (e.key === 'Escape') { closePick(false); e.preventDefault(); } return; }
    if (!$('brief').hidden || !$('report').hidden) { if (e.key === 'Escape' && !$('brief').hidden) closeBrief(); else if (e.key === 'Enter' && $('brief').hidden) { openHoles(); e.preventDefault(); } return; }
    if (APP.menu || APP.fly) return;
    if (WELL.active && !APP.away) {       // building the well: Space pours, Enter calls it, the prompts take A / D or Space
      let hit = WELL.key(e);
      if (!hit) { hit = true; switch (e.code) { case 'KeyB': toggleSmoke(); break; case 'KeyN': berate(); break; case 'Escape': if ($('plan').hidden) setPaused(!APP.S.paused); break; default: hit = false; } }
      if (hit) e.preventDefault();
      return;
    }
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (APP.away) { if (e.key === 'Escape' || e.key === 'Enter') { leaveInspect(); e.preventDefault(); } return; }
    if (AARON.key(e)) { e.preventDefault(); return; }          // the phone is ringing: Enter answers it
    if (MARL.key(e)) { e.preventDefault(); return; }           // something has quit: M to investigate, M again to fix it
    if (TOSS.key(e)) { e.preventDefault(); return; }           // throwing a sonic: Z to throw, Space to let go
    const S = APP.S, c = S.ctl;
    if (APP.easy) {        // thumb-pad mode on a keyboard: W/S push, A/D spin, P pump, F fast forward
      let hit = EASY.key(e);
      if (!hit) {
        hit = true;
        switch (e.code) {
          case 'KeyI': goInspect(S.runs.length - 1, false); break;
          case 'KeyB': toggleSmoke(); break;
          case 'KeyN': berate(); break;
          case 'Escape': setPaused(!S.paused); break;
          case 'Digit1': setSpeed(1); break;
          case 'Digit2': setSpeed(2); break;
          case 'Digit4': setSpeed(4); break;
          default: hit = false;
        }
      }
      if (hit) e.preventDefault();
      return;
    }
    const step = e.shiftKey ? 0.25 : 0.1;
    const lev = (k, d) => { c[k] = Math.round(clamp(c[k] + d, -1, 1) * 100) / 100; if (Math.abs(c[k]) < 0.05) c[k] = 0; };
    const T = id => PANEL.touch(id);
    let used = true;
    switch (e.code) {
      case 'KeyW': lev('feed', -step); T('feed'); break;
      case 'KeyS': lev('feed', step); T('feed'); break;
      case 'KeyA': lev('rot', -step); T('rot'); break;
      case 'KeyD': lev('rot', step); T('rot'); break;
      case 'KeyR': lev('winch', step); T('winch'); break;
      case 'KeyF': lev('winch', -step); T('winch'); break;
      case 'Space': neutral(); break;
      case 'KeyJ': lev('slide', -step); T('slide'); break;
      case 'KeyL': lev('slide', step); T('slide'); break;
      case 'KeyK': SIM.ACT.setSide(S, !c.side); T('side'); break;
      case 'KeyU': lev('arm', step); T('arm'); break;
      case 'KeyY': lev('arm', -step); T('arm'); break;
      case 'KeyX': SIM.ACT.setClampT(S, !c.clampT); T('clampT'); break;
      case 'Comma': lev('brk', -step); T('brk'); break;
      case 'Period': lev('brk', step); T('brk'); break;
      case 'KeyQ': SIM.ACT.setTilt(S, !c.tilt); T('tilt'); break;
      case 'ArrowUp': c.oscSet = clamp(c.oscSet + (e.shiftKey ? 10 : 2), 0, 150); T('freq'); break;
      case 'ArrowDown': c.oscSet = clamp(c.oscSet - (e.shiftKey ? 10 : 2), 0, 150); T('freq'); break;
      case 'KeyO': AUDIO.init(); SIM.ACT.setOsc(S, !c.oscOn); T('osc'); break;
      case 'KeyP': AUDIO.init(); SIM.ACT.setPump(S, !c.pumpOn); T('pump'); break;
      case 'BracketLeft': c.pumpSet = clamp(Math.round((c.pumpSet - 0.04) * 50) / 50, 0, 1); T('flow'); break;
      case 'BracketRight': c.pumpSet = clamp(Math.round((c.pumpSet + 0.04) * 50) / 50, 0, 1); T('flow'); break;
      case 'KeyC': SIM.ACT.setClampB(S, !c.clampB); T('clampB'); break;
      case 'KeyT': c.throttle = clamp(Math.round((c.throttle + 0.1) * 20) / 20, 0, 1); T('throttle'); break;
      case 'KeyG': c.throttle = clamp(Math.round((c.throttle - 0.1) * 20) / 20, 0, 1); T('throttle'); break;
      case 'KeyE': AUDIO.init(); if (S.engine.on) { SIM.ACT.engineStop(S); T('stop'); } else { SIM.ACT.engineStart(S); T('start'); } break;
      case 'KeyH': AUDIO.init(); SIM.ACT.horn(S); T('horn'); break;
      case 'KeyV': WORLD.preset('panel'); break;
      case 'KeyI': goInspect(S.runs.length - 1, false); break;
      case 'KeyB': toggleSmoke(); break;
      case 'KeyN': berate(); break;
      case 'Escape': setPaused(!S.paused); break;
      case 'Digit1': setSpeed(1); break;
      case 'Digit2': setSpeed(2); break;
      case 'Digit4': setSpeed(4); break;
      default: used = false;
    }
    if (used) e.preventDefault();
  });

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) { try { hot.snapshot(() => ({ S: APP.S, speed: APP.speed })); } catch (e) { /* not available */ } }
  const boot = () => (hot && hot.ready ? hot.ready(start) : start((hot && hot.data) || {}));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot, boot); else boot();
})();
