'use strict';
/* Thumb-pad mode: what the player sees and touches. Two pads (PUSH on the left, SPIN on the right), a gauge beside
   each, a note card that says whose turn it is, a PUMP button that pops up when the casing is being driven, and a
   camera that follows the work by itself so the player can watch the rig instead of the panel. */
window.EASY = (() => {
  const FT = 0.3048, SLIDE_M = 0.85;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const $ = id => document.getElementById(id);
  let APP, on = false, ff = false, lookHold = 0, E = null;
  const watch = { id: '', t: 0 };
  const last = {};
  const set = (el, key, v) => { if (last[key] !== v) { last[key] = v; el.textContent = v; } };

  // ---- the pads: slide and leave. PUSH is more as you slide down, SPIN is more as you slide up ----
  function bindPad(el, key, upIsMore) {
    let id = null;
    const put = e => {
      const r = el.getBoundingClientRect(), m = Math.min(40, r.height * 0.2);
      let v = clamp((e.clientY - r.top - m) / Math.max(1, r.height - 2 * m), 0, 1);
      if (upIsMore) v = 1 - v;
      AUTO.pad[key] = v < 0.06 ? 0 : Math.round(v * 100) / 100;
    };
    el.addEventListener('pointerdown', e => {
      if (!AUTO.manual || APP.S.paused) return;
      id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* pointer already gone */ }
      AUDIO.init(); put(e); e.preventDefault();
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === id) put(e); });
    const up = e => { if (e.pointerId === id) id = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  function togglePump() {
    const S = APP.S; if (AUTO.manual !== 'casing') return;
    AUDIO.init(); S.ctl.pumpSet = 0.55; SIM.ACT.setPump(S, !S.ctl.pumpOn);
  }
  // ---- quick-time events at the connections: draw circles, or swipe side to side, before the time runs out ----
  const Q = { src: null, state: 'idle', t: 0, limit: 4.5, turns: 1.6, need: 7, keys: 8, hold: 0, prog: 0, turn: 0, strokes: 0, ext: 0, dir: 0, lp: null, lh: null, keyLast: '' };
  const CIRC = 2 * Math.PI * 52;
  function qStart(src, retry) {
    const tn = SHOP.tune(APP.S);                 // later holes: less time, more circles, more swipes (js/sites.js), eased by what you brought (js/shop.js)
    Q.limit = tn.spinTime; Q.turns = tn.turns; Q.need = tn.strokes; Q.keys = tn.keys;
    Q.src = src; Q.state = 'ready'; Q.hold = retry ? 0.5 : 0.7; Q.t = 0; Q.prog = 0; Q.turn = 0; Q.strokes = 0; Q.dir = 0; Q.lp = null; Q.lh = null; Q.keyLast = '';
    E.qte.hidden = false; E.root.dataset.qte = '1';
    E.qTitle.textContent = src.label;
    E.qHow.textContent = src.type === 'circle' ? 'Draw circles, clockwise' : 'Swipe side to side, fast';
    E.qIcon.textContent = src.type === 'circle' ? '↻' : '⇆'; E.qIcon.className = 'q-icon ' + src.type;
    if (!retry) APP.S.sfx.push('switch');
  }
  function qMove(e) {
    if (Q.state !== 'go') return;
    const p = { x: e.clientX, y: e.clientY };
    if (!Q.lp) { Q.lp = p; Q.ext = p.x; return; }
    const dx = p.x - Q.lp.x, dy = p.y - Q.lp.y;
    if (Q.src.type === 'circle') {
      if (dx * dx + dy * dy < 64) return;
      const h = Math.atan2(dy, dx);
      if (Q.lh != null) { const d = Math.atan2(Math.sin(h - Q.lh), Math.cos(h - Q.lh)); if (Math.abs(d) < 2.2) Q.turn = Math.max(0, Q.turn + d); }   // clockwise on screen counts up
      Q.lh = h; Q.lp = p;
      Q.prog = clamp(Q.turn / (2 * Math.PI * Q.turns), 0, 1);
    } else {
      const d = p.x - Q.ext;
      if (Q.dir === 0) { if (Math.abs(d) > 40) { Q.dir = Math.sign(d); Q.ext = p.x; Q.strokes = 1; } }
      else if (d * Q.dir > 0) Q.ext = p.x;                       // still going the same way: move the turning point
      else if (Math.abs(d) > 45) { Q.dir = -Q.dir; Q.ext = p.x; Q.strokes++; }
      Q.lp = p;
      Q.prog = clamp(Q.strokes / Q.need, 0, 1);
    }
  }
  function qKey(e) {      // on a keyboard: tap A and D (or left and right) in turn
    const k = e.code === 'KeyA' || e.code === 'ArrowLeft' ? 'L' : e.code === 'KeyD' || e.code === 'ArrowRight' ? 'R' : '';
    if (!k) return true;
    if (Q.state === 'go' && k !== Q.keyLast) { Q.keyLast = k; Q.prog = clamp(Q.prog + 1 / Q.keys, 0, 1); }
    return true;
  }
  function qUpdate(S, dt) {
    const want = AUTO.st.qte;
    if (!want) { if (Q.src) { Q.src = null; Q.state = 'idle'; E.qte.hidden = true; E.root.dataset.qte = ''; } return; }
    if (Q.src !== want) qStart(want, false);
    if (S.paused) return;
    if (Q.state === 'ready') { Q.hold -= dt; if (Q.hold <= 0) Q.state = 'go'; }
    else if (Q.state === 'go') {
      Q.t += dt;
      if (Q.prog >= 1) { Q.state = 'done'; Q.hold = 0.55; S.sfx.push('ok'); }
      else if (Q.t >= Q.limit) {                                // missed it: the pipe goes over and the helpers scatter
        Q.state = 'fail'; Q.hold = 2.8; Q.focus = AUTO.st.focus; AUTO.st.focus = 'panic'; lookHold = 0;
        if (!SHOP.lucky(S)) S.stats.fumbles = (S.stats.fumbles || 0) + 1;
        S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: 'Fumbled a connection. The pipe went over and everybody jumped clear.', lvl: 'warn' });
        S.crew[0].say = 'Look out!'; S.crew[0].sayT = 2.6; S.crew[1].say = 'Whoa, whoa, whoa!'; S.crew[1].sayT = 2.6;
        WORLD.panic(2.8, Q.src.pipe === 'casing' ? 0.085 : 0.045);
        S.sfx.push('alarm');
      }
    } else if (Q.state === 'fail') {
      if (WORLD.panicHit) S.sfx.push('clank');
      Q.hold -= dt; if (Q.hold <= 0) { AUTO.st.focus = Q.focus || 'head'; qStart(want, true); }
    } else if (Q.state === 'done') { Q.hold -= dt; if (Q.hold <= 0) AUTO.st.qte = null; }
    if (last.qs !== Q.state) {
      last.qs = Q.state; E.qte.dataset.state = Q.state;
      if (Q.state === 'fail') { E.qTitle.textContent = 'Dropped it!'; E.qHow.textContent = 'The crew is getting set to try again.'; }
      else if (Q.state === 'done') { E.qTitle.textContent = 'Nice one!'; E.qHow.textContent = ''; }
      else if (Q.state === 'ready') { E.qTitle.textContent = want.label; E.qHow.textContent = want.type === 'circle' ? 'Draw circles, clockwise' : 'Swipe side to side, fast'; }
    }
    E.qProg.style.strokeDashoffset = (CIRC * (1 - (Q.state === 'done' ? 1 : Q.prog))).toFixed(1);
    E.qTime.style.width = (clamp(1 - Q.t / Q.limit, 0, 1) * 100).toFixed(1) + '%';
  }

  function init(app) {
    APP = app;
    E = { root: $('easy'), title: $('ezTitle'), text: $('ezText'), bar: $('ezBar'), barTxt: $('ezBarTxt'), layer: $('ezLayer'), rate: $('ezRate'),
      status: $('ezStatus'), feed: $('ezFeed'), rot: $('ezRot'), pushM: $('ezPushM'), spinM: $('ezSpinM'), pump: $('ezPump'), pumpTxt: $('ezPumpTxt'), tank: $('ezTank'), ff: $('ezFF'),
      qte: $('ezQte'), qTitle: $('ezQTitle'), qHow: $('ezQHow'), qIcon: $('ezQIcon'), qProg: $('ezQProg'), qTime: $('ezQTime') };
    E.qte.addEventListener('pointerdown', e => { try { E.qte.setPointerCapture(e.pointerId); } catch (err) { /* gone */ } AUDIO.init(); Q.lp = null; Q.lh = null; qMove(e); e.preventDefault(); });
    E.qte.addEventListener('pointermove', e => { if (e.buttons || e.pointerType !== 'mouse') qMove(e); });
    E.qProg.style.strokeDasharray = CIRC.toFixed(1);
    bindPad(E.feed, 'feed', false); bindPad(E.rot, 'rot', true);
    E.pump.addEventListener('click', togglePump);
    E.ff.addEventListener('click', () => { ff = !ff; E.ff.setAttribute('aria-pressed', String(ff)); });
  }
  function show(v) { on = !!v; E.root.hidden = !on; ff = false; E.ff.setAttribute('aria-pressed', 'false'); }

  // ---- what to tell the player while they drill ----
  function coach(S, m, L) {
    const p = AUTO.pad, ratio = S.wob / L.wob, spin = Math.abs(S.rpm) / L.maxRpm;
    if (S.head.lock) return ['crit', 'Sonic head too hot. Let it cool.'];
    if (m === 'casing') {
      if (S.hoseBurst) return ['crit', 'Hose burst. The crew is swapping it.'];
      if (!S.ctl.pumpOn) return ['crit', 'Turn the PUMP on.'];
      if (S.water.truckAway) return ['warn', 'Tess is refilling the water truck.'];
      if (S.water.tank < 1) return ['crit', 'Water tank is empty.'];
      if (S.stuck > 0.35) return ['crit', p.feed > 0.05 ? 'Stuck! Take your thumb off PUSH.' : 'Working the string free. Hold off.'];
      if (p.feed < 0.05) return ['info', 'Slide PUSH down to drive the casing.'];
      if (p.rot < 0.05) return ['info', 'Add some SPIN.'];
      return ['good', 'Casing going down.'];
    }
    if (S.stuck > 0.35) return ['crit', p.feed > 0.05 ? 'Stuck! Take your thumb off PUSH.' : 'Working the string free. Hold off.'];
    if (S.inCobble) return [p.feed > 0.45 ? 'crit' : 'warn', 'Cobble! Ease the push, keep spinning.'];
    if (p.feed < 0.05) return ['info', 'Slide PUSH down to drill.'];
    if (spin > 1) return ['crit', 'Too much spin. It is twisting the core.'];
    if (ratio > 2.1) return ['crit', L.compress > 0.15 ? 'Too hard. You are squashing the core.' : L.k >= 0.5 ? 'Too hard. You are shaking the core apart.' : 'Too hard. The head has lost its hum.'];
    if (ratio > 1.4) return ['warn', 'Pushing hard. The head is losing its hum.'];
    if (S.res < 0.5 && S.head.hz > 8) return ['warn', 'New ground. The head is re-tuning: ease off.'];
    if (ratio < 0.6) return ['info', 'Light push. Slow going.'];
    return ['good', 'Sweet spot.'];
  }

  // ---- camera: follow the work, unless the player has just looked somewhere themselves ----
  function direct(S, dt, focus) {
    if (APP.away || APP.menu || APP.fly || WELL.active) return;      // the well install points the camera itself
    if (watch.t > 0) { watch.t -= dt; const h = WORLD.crewHead(watch.id); WORLD.aim(h.x, h.y - 0.75, h.z, 58); return; }
    if (lookHold > 0) { lookHold -= dt; return; }
    const hy = S.head.y * FT, hx = S.head.x * SLIDE_M;
    let p, fov = 72;
    switch (focus) {
      case 'drill': p = [0, clamp(hy * 0.6 + 0.1, 1.0, 3.0), 0]; fov = 76; break;
      case 'clamps': p = [0, 1.0, 0]; fov = 52; break;
      case 'rack': p = [0.9, 2.5, -0.5]; fov = 76; break;
      case 'horses': p = [-1.6, 0.8, 3.4]; fov = 70; break;
      case 'mast': p = [0, 4.8, 0]; fov = 82; break;
      case 'tess': p = [0.25, 2.5, 1.7]; fov = 80; break;
      case 'panic': p = [-0.9, 0.95, 0.9]; fov = 76; break;
      default: p = [hx, clamp(hy * 0.62, 1.0, 4.2), 0]; fov = 76;
    }
    WORLD.aim(p[0], p[1], p[2], fov);
  }

  function update(S, dt) {
    if (!on) return;
    const st = AUTO.st, m = AUTO.manual, pad = AUTO.pad;
    const mode = st.failed ? 'failed' : S.done ? 'done' : m || 'auto';
    if (last.mode !== mode) { last.mode = mode; E.root.dataset.mode = mode; if (m) ff = false; E.ff.setAttribute('aria-pressed', String(ff)); }
    direct(S, dt, st.focus);
    qUpdate(S, dt);

    // pads and gauges
    E.feed.style.setProperty('--p', pad.feed.toFixed(3)); E.rot.style.setProperty('--p', (1 - pad.rot).toFixed(3));
    E.feed.setAttribute('aria-valuenow', Math.round(pad.feed * 100)); E.rot.setAttribute('aria-valuenow', Math.round(pad.rot * 100));
    const depth = m === 'casing' ? S.casing.depth : Math.max(0, S.core.bit);
    const L = SIM.layerAt(depth + 0.05);
    const ratio = m ? S.wob / L.wob : 0, spin = m === 'casing' ? Math.abs(S.rpm) / 70 : m ? Math.abs(S.rpm) / L.maxRpm : 0;
    E.pushM.style.top = (clamp(ratio / 2.6, 0, 1) * 100).toFixed(1) + '%';
    E.spinM.style.top = ((1 - clamp(spin / 1.8, 0, 1)) * 100).toFixed(1) + '%';

    // the note card
    let title, text, p = 0, bar = '';
    if (st.failed) { title = 'The crew is stuck'; text = st.failed + ' Open the menu and start a new hole.'; }
    else if (S.done) { title = 'Hole finished'; text = S.site.job === 'well' ? `${S.site.well} is cored, cased and built.` : `${S.site.well} is cored and cased.`; p = 1; bar = 'Done'; }
    else if (m === 'core') {
      const tg = SIM.runTarget(S), d0 = tg - SIM.RUN_LEN;
      title = `Run ${S.run.n}: core ${d0.toFixed(0)} to ${tg.toFixed(0)} ft`; text = 'Your turn. PUSH and SPIN the rod down. Keep both needles in the green.';
      p = (S.core.bit - d0) / SIM.RUN_LEN; bar = `Rod down ${Math.max(0, S.core.bit - d0).toFixed(1)} of 10.0 ft`;
    } else if (m === 'casing') {
      title = `Run ${S.run.n}: drive the casing`; text = 'Your turn. PUMP on, then PUSH and SPIN the casing down over the rods.';
      const from = S.run.from || 0, need = Math.max(0.01, S.hole.depth - from);
      p = (S.casing.depth - from) / need; bar = `Casing ${S.casing.depth.toFixed(1)} of ${S.hole.depth.toFixed(1)} ft`;
    } else {
      title = 'Crew at work'; text = st.msg || 'Stand by.';
      if (S.phase === 'TRIP_OUT') { const b = Math.max(0, S.core.bit); p = S.hole.depth > 0 ? 1 - b / S.hole.depth : 1; bar = `Tripping out: ${SIM.rodsIn(S)} rod${SIM.rodsIn(S) === 1 ? '' : 's'} + barrel in the hole`; }
      else if (S.phase === 'TRIP_IN') { const b = SIM.btm(S); p = b > 0 ? Math.max(0, S.core.bit) / b : 1; bar = `Tripping in: barrel at ${Math.max(0, S.core.bit).toFixed(1)} ft`; }
      else if (S.phase === 'EXTRUDE') { p = SIM.taskProgress(S.crew[1]); bar = 'Shaking the core out'; }
      else if (S.phase === 'OVERRIDE') { const from = S.run.from || 0, need = Math.max(0.01, S.hole.depth - from); p = (S.casing.depth - from) / need; bar = `Casing ${S.casing.depth.toFixed(1)} of ${S.hole.depth.toFixed(1)} ft`; }
      else { p = 0; bar = 'Getting ready'; }
    }
    set(E.title, 'title', title); set(E.text, 'text', SIM.nm(S, text)); set(E.barTxt, 'bar', bar);
    E.bar.style.width = (clamp(p, 0, 1) * 100).toFixed(1) + '%';
    if (m) {
      set(E.layer, 'layer', L.name); if (last.lc !== L.color) { last.lc = L.color; E.layer.style.setProperty('--lc', L.color); }
      const next = SIM.LAYERS[SIM.LAYERS.indexOf(L) + 1], gap = L.bot - depth;
      set(E.rate, 'rate', `${(S.rop || 0).toFixed(1)} ft/min` + (m === 'core' && next && gap < 1.5 && gap > 0 ? ` · ${next.short} in ${gap.toFixed(1)} ft` : ''));
    }

    // the coaching line
    let lvl = 'info', msg = '';
    if (m) [lvl, msg] = coach(S, m, L);
    else if (S.alarms.length && S.alarms[0][0] === 'crit') { lvl = 'crit'; msg = S.alarms[0][1]; }
    set(E.status, 'status', SIM.nm(S, msg));
    if (last.lvl !== lvl) { last.lvl = lvl; E.status.className = 'ez-status ' + lvl; }
    E.status.hidden = !msg;

    // pop-up buttons
    const pumpShow = m === 'casing';
    if (E.pump.hidden === pumpShow) E.pump.hidden = !pumpShow;
    if (pumpShow) {
      set(E.pumpTxt, 'pump', S.ctl.pumpOn ? 'ON' : 'OFF');
      if (last.pumpOn !== S.ctl.pumpOn) { last.pumpOn = S.ctl.pumpOn; E.pump.classList.toggle('on', S.ctl.pumpOn); E.pump.setAttribute('aria-pressed', String(S.ctl.pumpOn)); }
      set(E.tank, 'tank', `${Math.round(S.water.tank)} gal`);
    }
    const ffShow = mode === 'auto' && !AUTO.st.qte;
    if (E.ff.hidden === ffShow) E.ff.hidden = !ffShow;
  }

  function key(e) {       // keyboard, for the same mode on a computer. Returns true if the key was used
    if (AUTO.st.qte) return qKey(e);
    const S = APP.S, pad = AUTO.pad, step = e.shiftKey ? 0.2 : 0.05;
    const nudge = (k, d) => { if (AUTO.manual) { const v = clamp(pad[k] + d, 0, 1); pad[k] = v < 0.06 && d < 0 ? 0 : Math.round(v * 100) / 100; } };
    switch (e.code) {
      case 'KeyS': case 'ArrowDown': nudge('feed', step); return true;
      case 'KeyW': case 'ArrowUp': nudge('feed', -step); return true;
      case 'KeyD': case 'ArrowRight': nudge('rot', step); return true;
      case 'KeyA': case 'ArrowLeft': nudge('rot', -step); return true;
      case 'Space': pad.feed = 0; pad.rot = 0; return true;
      case 'KeyP': togglePump(); return true;
      case 'KeyF': if (!AUTO.manual) { ff = !ff; E.ff.setAttribute('aria-pressed', String(ff)); } return true;
    }
    return false;
  }

  return { init, show, update, key, held() { lookHold = 5; }, watch(id, sec) { watch.id = id; watch.t = sec; }, get speed() { return AUTO.manual ? 0 : ff ? 12 : 4; } };
})();
