'use strict';
/* Sonic Driller 3D: on-screen overlays. Driller's field book, alarms, crew orders, shift log,
   a borehole section of the whole hole, control tooltips, crew speech bubbles and the shift report. */
window.HUD = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let APP;
  const S = () => APP.S;
  const $ = id => document.getElementById(id);
  const side = {};

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  }

  function buildCrew() {
    const host = $('crew'); host.innerHTML = '';
    const orders = {
      dale: [['HOOK', 'Hook up / unhook winch'], ['WRENCH', 'Chain wrench'], ['GRAB', 'Grab the pipe'], ['STAB', 'Stab a rod'], ['REPAIR', 'Repair hose']],
      tess: [['REFILL', 'Refill water tank'], ['REPAIR', 'Repair hose']],
    };
    side.crew = {};
    for (const m of S().crew) {
      const status = el('span', { class: 'cw-status' }), bar = el('div', { class: 'cw-bar' }, el('i'));
      const btns = el('div', { class: 'cw-btns' });
      const map = {};
      for (const [id, label] of orders[m.id]) {
        const b = el('button', { type: 'button', class: 'order', text: label });
        b.addEventListener('click', () => { AUDIO.init(); SIM.order(S(), id); });
        btns.append(b); map[id] = b;
      }
      host.append(el('div', { class: 'cw cw-' + m.id },
        el('div', { class: 'cw-head' }, el('span', m.hat ? { class: 'cw-hat', style: 'background:' + m.hat } : { class: 'cw-hat' }), el('b', { text: m.name }), el('span', { class: 'cw-role', text: m.role }), status),
        bar, btns));
      side.crew[m.id] = { status, bar: bar.firstChild, map, last: '' };
    }
  }

  function suggested(s, gd) {
    const set = new Set();
    if (gd.order) set.add(gd.order);
    if (s.hoseBurst) set.add('REPAIR');
    if (s.water.tank < 50 && !s.water.truckAway) set.add('REFILL');
    return set;
  }

  // ---------- borehole section ----------
  let bh, bhc, pats = {};
  function buildSection() {
    bh = $('section'); bhc = bh.getContext('2d');
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const L of SIM.MATS) {
      const p = document.createElement('canvas'); p.width = 40; p.height = 40; const g = p.getContext('2d');
      g.fillStyle = L.color; g.fillRect(0, 0, 40, 40); g.fillStyle = 'rgba(0,0,0,0.25)'; g.strokeStyle = 'rgba(0,0,0,0.28)';
      if (L.pat === 'dots') for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(rnd() * 40, rnd() * 40, 0.9, 0, 7); g.fill(); }
      else if (L.pat === 'dash') for (let i = 0; i < 7; i++) { const x = rnd() * 34, y = rnd() * 38 + 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y); g.stroke(); }
      else if (L.pat === 'pebbles') for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(rnd() * 40, rnd() * 40, 2.5, 1.8, rnd() * 3, 0, 7); g.fillStyle = 'rgba(120,110,95,0.9)'; g.fill(); g.stroke(); }
      else if (L.pat === 'clasts') for (let i = 0; i < 16; i++) g.fillRect(rnd() * 40, rnd() * 40, 2, 2);
      else if (L.pat === 'lam') for (let y = 3; y < 40; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(40, y + 1); g.stroke(); }
      else for (let i = 0; i < 5; i++) { g.beginPath(); const x = rnd() * 40, y = rnd() * 40; g.moveTo(x, y); g.quadraticCurveTo(x + 5, y + 3, x + 2, y + 8); g.stroke(); }
      pats[L.id] = bhc.createPattern(p, 'repeat');
    }
  }
  function drawSection(s) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 200, Hh = 330;
    if (bh.width !== W * dpr) { bh.width = W * dpr; bh.height = Hh * dpr; }
    const c = bhc; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, Hh);
    const top = 14, bot = Hh - 8, TD = SIM.TARGET, maxD = TD + 6, k = (bot - top) / maxD, Y = d => top + d * k;
    const x0 = 30, cw = 112, hx = 100;
    for (const L of SIM.LAYERS) {
      const a = Y(L.top), b = Y(Math.min(L.bot, maxD)); if (a >= bot) break;
      c.fillStyle = pats[L.id]; c.fillRect(x0, a, cw, b - a);
      c.font = '700 10px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = L.id === 'sand' || L.id === 'gravel' ? 'rgba(40,30,20,0.85)' : 'rgba(255,255,255,0.92)';
      if (b - a >= 9) c.fillText(L.short.toUpperCase(), x0 + 3, (a + b) / 2);
    }
    c.strokeStyle = '#111'; c.lineWidth = 1.5; c.strokeRect(x0, top, cw, bot - top);
    c.fillStyle = '#c9cdbf'; c.font = '600 10px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'right';
    for (let d = 0; d <= TD; d += 10) { c.fillRect(x0 - 6, Y(d), 6, 1); c.fillText(String(d), x0 - 8, Y(d)); }
    const hd = s.hole.depth, cd = s.casing.depth;
    if (hd > 0.01) { c.fillStyle = '#2d2622'; c.fillRect(hx - 8, top, 16, Y(hd) - top); }
    if (cd > 0.01) {
      const wl = s.water.level;
      if (wl < cd) { c.fillStyle = 'rgba(62,166,230,0.9)'; c.fillRect(hx - 7, Y(wl), 14, Y(cd) - Y(wl)); }
      c.fillStyle = '#9aa3aa'; c.fillRect(hx - 10, top, 2.5, Y(cd) - top); c.fillRect(hx + 7.5, top, 2.5, Y(cd) - top);
    }
    if (s.hole.heave > 0.02) { c.fillStyle = pats.sand; c.fillRect(hx - 7, Y(hd - s.hole.heave), 14, Y(hd) - Y(hd - s.hole.heave)); c.strokeStyle = '#ff5a48'; c.strokeRect(hx - 7, Y(hd - s.hole.heave), 14, Y(hd) - Y(hd - s.hole.heave)); }
    const conn = s.head.conn;
    if (s.core.len > 0 && s.core.bit > 0.05) {
      const b = s.core.bit, bt = Math.max(0, b - SIM.BARREL);
      c.fillStyle = '#d2d6da'; if (bt > 0) c.fillRect(hx - 1, top, 2, Y(bt) - top);
      c.fillStyle = '#c9cfd4'; c.fillRect(hx - 4, Y(bt), 8, Y(b) - Y(bt));
      c.fillStyle = '#f07d1a'; c.fillRect(hx - 5, Y(b) - 2, 10, 2);
    }
    c.setLineDash([4, 3]); c.strokeStyle = '#3ea6e6'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x0, Y(SIM.WT)); c.lineTo(x0 + cw, Y(SIM.WT)); c.stroke();
    c.strokeStyle = '#ff5a48'; c.beginPath(); c.moveTo(x0, Y(SIM.TARGET)); c.lineTo(x0 + cw, Y(SIM.TARGET)); c.stroke(); c.setLineDash([]);
    c.textAlign = 'right'; c.textBaseline = 'bottom'; c.font = '800 10px "Barlow Condensed", Arial Narrow, sans-serif';
    c.fillStyle = '#7cc8f5'; c.fillText(`WT ${SIM.WT}'`, x0 + cw - 3, Y(SIM.WT) - 1);
    c.fillStyle = '#ff8a7a'; c.fillText('TD ' + TD, x0 + cw - 3, Y(SIM.TARGET) - 1);
    const bd = conn === 'casing' ? cd : Math.max(0, s.core.bit);
    c.fillStyle = '#f2b630'; c.beginPath(); c.moveTo(x0 + cw + 2, Y(bd)); c.lineTo(x0 + cw + 9, Y(bd) - 4); c.lineTo(x0 + cw + 9, Y(bd) + 4); c.closePath(); c.fill();
    c.font = '700 10px "B612 Mono", Consolas, monospace'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#f2e7b4';
    c.fillText(bd.toFixed(1) + "'", x0 + cw + 11, clamp(Y(bd), top + 5, bot - 5));
    for (const r of s.runs) {
      const pct = Math.round(r.recovery * 100), col = pct >= 90 ? '#5cc24a' : pct >= 70 ? '#f2b630' : '#ff5a48';
      c.fillStyle = col; c.fillRect(6, Y(r.from), 6, Math.max(2, Y(r.to) - Y(r.from)));
    }
  }

  // ---------- per frame ----------
  let t = 0, lastLog = '', lastAlarm = '', lastBubble = {};
  function update(s, dt) {
    t += dt;
    updateBubbles(s);
    if (t < 0.12) return; t = 0;
    const gd = SIM.guidance(s);
    if (side.title.textContent !== gd.title) side.title.textContent = gd.title;
    if (side.text.textContent !== gd.text) side.text.textContent = gd.text;
    let p = 0, txt = '';
    if (s.phase === 'CORE_RUN') { const tg = SIM.runTarget(s), d0 = tg - SIM.RUN_LEN; p = (s.core.bit - d0) / SIM.RUN_LEN; txt = `Rod down ${Math.max(0, s.core.bit - d0).toFixed(1)} of 10.0 ft`; }
    else if (s.phase === 'OVERRIDE') { const need = Math.max(0.01, s.hole.depth - (s.run.from || 0)); p = (s.casing.depth - s.run.from) / need; txt = `Casing ${s.casing.depth.toFixed(1)} of ${s.hole.depth.toFixed(1)} ft`; }
    else if (s.phase === 'TRIP_OUT') { const b = Math.max(0, s.core.bit); p = s.hole.depth > 0 ? 1 - b / s.hole.depth : 1; txt = `${SIM.rodsIn(s)} rod${SIM.rodsIn(s) === 1 ? '' : 's'} + barrel in the hole`; }
    else if (s.phase === 'TRIP_IN') { const b = SIM.btm(s); p = b > 0 ? Math.max(0, s.core.bit) / b : 1; txt = `${SIM.rodsIn(s)} of ${s.runs.length} rods on, barrel at ${Math.max(0, s.core.bit).toFixed(1)} ft`; }
    else if (s.phase === 'EXTRUDE') { p = SIM.taskProgress(s.crew[1]); txt = 'Shaking the core out'; }
    else { p = 1; txt = 'Done'; }
    side.bar.style.width = (clamp(p, 0, 1) * 100).toFixed(1) + '%';
    side.bar.classList.toggle('over', s.phase === 'CORE_RUN' && s.run.fill >= SIM.BARREL_CAP);
    if (side.barTxt.textContent !== txt) side.barTxt.textContent = txt;
    const L = gd.layer, lt = `${L.name} · ${L.top} to ${L.bot > SIM.TARGET ? 'TD' : L.bot} ft`;
    if (side.layer.textContent !== lt) { side.layer.textContent = lt; side.tip.textContent = L.tip; side.layer.style.setProperty('--lc', L.color); }
    const ak = s.alarms.map(a => a.join(':')).join('|');
    if (ak !== lastAlarm) {
      lastAlarm = ak; side.alarms.innerHTML = '';
      for (const [lvl, msg] of s.alarms) side.alarms.append(el('span', { class: 'chip ' + lvl, text: msg }));
    }
    const sug = suggested(s, gd);
    for (const m of s.crew) {
      const c = side.crew[m.id];
      let st = 'Standing by';
      if (m.hidden && (m.task || m.waitTruck)) st = 'Driving the water truck';
      else if (m.task) { const T = SIM.TASKS[m.task.id]; st = m.task.blocked ? `${T.label}: waiting on you` : (m.walking ? `${T.label}: on the way` : T.label); }
      if (m.queue.length) st += ` (+${m.queue.length})`;
      if (c.last !== st) { c.status.textContent = st; c.last = st; }
      c.bar.style.width = (SIM.taskProgress(m) * 100).toFixed(0) + '%';
      for (const id in c.map) c.map[id].classList.toggle('hint', sug.has(id));
    }
    const lk = s.log.length + ':' + (s.log[0] ? s.log[0].t : 0);
    if (lk !== lastLog) {
      lastLog = lk; side.log.innerHTML = '';
      for (const e of s.log.slice(0, 30)) side.log.append(el('li', { class: e.lvl }, el('time', { text: e.clock }), el('span', { text: e.msg })));
      if (s.log[0]) { side.latest.textContent = s.log[0].msg; side.latest.className = 'latest ' + s.log[0].lvl; }
    }
    if (!$('bhWrap').hidden) drawSection(s);
    const clk = SIM.clockStr(s); if ($('clock').textContent !== clk) $('clock').textContent = clk;
  }

  function updateBubbles(s) {
    for (const m of s.crew) {
      const b = side.bubbles[m.id];
      const show = !m.hidden && m.sayT > 0 && m.say;
      if (!show) { b.hidden = true; continue; }
      const p = WORLD.project(WORLD.crewHead(m.id));
      if (!p.front) { b.hidden = true; continue; }
      if (lastBubble[m.id] !== m.say) { b.querySelector('span').textContent = SIM.nm(s, m.say); lastBubble[m.id] = m.say; }
      b.hidden = false;
      b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    }
  }

  function tooltip(info, x, y, finger) {
    const tip = $('tip');
    if (!info) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.firstChild.textContent = info.title; tip.lastChild.textContent = info.tip;
    if (finger) {      // above the finger, not under it
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.transform = `translate(${Math.round(clamp(x - w / 2, 6, window.innerWidth - w - 6))}px, ${Math.round(Math.max(6, y - h - 46))}px)`;
    } else tip.style.transform = `translate(${Math.round(x + 16)}px, ${Math.round(y + 18)}px)`;
  }

  // ---------- shift report ----------
  // res: what the career made of it (js/sites.js record): passed, whether that opened the next hole, the best grade so far
  function showReport(s, res) {
    const r = s.report, box = $('reportBody'), st = s.site;
    let verdict = '';
    if (res) {
      const nxt = st.n < SITES.COUNT ? SITES.get(st.n + 1) : null;
      const tail = !res.passed ? `You need ${SITES.PASS} or better, drilling and well together, to open the next hole.`
        : res.last ? 'That was the last hole. You have drilled the lot.'
        : res.opened ? `Hole ${nxt.n}, ${nxt.name}, is now open.` : `Hole ${nxt.n}, ${nxt.name}, is open.`;
      verdict = `<div class="rp-pass ${res.passed ? 'ok' : 'no'}"><b>${res.passed ? 'Passed' : 'Not passed'}</b><span>Hole ${st.n} of ${SITES.COUNT} · ${st.name} · pass mark ${SITES.PASS}. ${tail}${res.record ? ' A new best for this hole.' : res.best > r.score ? ` Your best here is ${res.best}.` : ''}${res.tokens ? ` <b class="rp-buck tok">+${res.tokens} Swag Token</b> for scoring ${SWAG.NEED} or better.` : ''}${res.bucks ? ` <b class="rp-buck">+${res.bucks} Safety Buck</b> for scoring ${SHOP.NEED} or better.` : ''}${res.tokens || res.bucks ? ' Spend them in the shop.' : ''}</span></div>`;
    }
    const pct = v => `${Math.round(v * 100)}%`, ms = v => { v = Math.max(0, Math.round(v)); return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'); };
    const rows = s.runs.map(x => `<tr><td>${x.n}</td><td>${x.from.toFixed(1)}–${x.to.toFixed(1)}</td><td>${x.segs.filter(g => !g.slough).map(g => SIM.LAYERS.find(L => L.id === g.layer).short).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'slough'}</td><td>${x.drilled.toFixed(1)}</td><td>${x.recNet.toFixed(1)}</td><td class="${x.recovery >= 0.9 ? 'g' : x.recovery >= 0.7 ? 'a' : 'r'}">${pct(x.recovery)}</td><td>${SIM.noteKeys(x).map(k => SIM.NOTE_TEXT[k]).join('; ') || '—'}${x.slough > 0.05 ? `; ${x.slough.toFixed(1)} ft slough` : ''}</td></tr>`).join('');
    const w = r.well, f1 = v => (Math.round(v * 10) / 10).toFixed(1), dep = d => (d < -0.05 ? `${f1(-d)} ft above ground` : `${f1(Math.max(0, d))} ft`);
    const wellRows = !w ? '' : w.results.map(x => `
        <div><dt>${x.id === 'well' ? x.name : x.name + ', top'}</dt><dd class="${Math.abs(x.err) <= 0.5 ? 'g' : Math.abs(x.err) <= 1.5 ? 'a' : 'r'}">${dep(x.got)} (drawing: ${dep(x.target)})</dd></div>`).join('');
    const wear = Object.entries(s.dmg).filter(([, v]) => v > 0.005).map(([k, v]) => `${({ head: 'Sonic head', pump: 'Pump', bit: 'Bit', hyd: 'Hydraulics', clamp: 'Clamps', threads: 'Threads' })[k]} ${pct(v)}`).join(', ') || 'None';
    box.innerHTML = `${verdict}
      <div class="rp-grade"><span class="rp-letter g-${r.grade}">${r.grade}</span><div><b>${r.score} / 100</b><br>Borehole ${st.well} cored to ${s.hole.depth.toFixed(1)} ft${w ? ` and built as a monitoring well<br><small>Drilling ${r.drill} / 100 · Well install ${w.score} / 100${r.aaron && r.aaron.pen ? ` · Late for Aaron −${r.aaron.pen}` : ''}</small>` : ''}</div></div>
      <dl class="rp-stats">
        <div><dt>Crew</dt><dd>${s.driller ? s.driller + ' drilling, with ' : ''}${s.crew[0].name} and ${s.crew[1].name}</dd></div>
        <div><dt>Core recovery</dt><dd>${pct(r.recovery)} (${r.rec.toFixed(1)} of ${r.drilled.toFixed(1)} ft)</dd></div>
        <div><dt>Casing set to</dt><dd>${r.casing.toFixed(1)} ft</dd></div>
${r.aaron ? `<div><dt>Aaron's deadline</dt><dd class="${r.aaron.pen ? 'r' : 'g'}">${r.aaron.pen ? `${ms(r.aaron.late)} late, ${r.aaron.pen} points off` : `made it with ${ms(r.aaron.spare)} to spare`} (he gave you ${Math.round(r.aaron.limit / 60)} min)</dd></div>
        ` : ''}<div><dt>Shift time</dt><dd>${Math.floor(r.shiftMin / 60)} h ${Math.round(r.shiftMin % 60)} min</dd></div>
        <div><dt>Water used</dt><dd>${Math.round(r.waterUsed)} gal (${Math.round(r.spilled)} gal came back up the casing)</dd></div>
        <div><dt>Heave</dt><dd>${r.heave.toFixed(1)} ft of sand into the casing</dd></div>
        <div><dt>Near misses and drops</dt><dd>${r.incidents}${r.drops ? ` (${r.drops} dropped pipe)` : ''}</dd></div>
        <div><dt>Joints run in loose</dt><dd>${r.loose}</dd></div>${r.fumbles ? `
        <div><dt>Connections fumbled</dt><dd>${r.fumbles}</dd></div>` : ''}
        <div><dt>Equipment wear</dt><dd>${wear}</dd></div>${SHOP.get(s.item) ? `
        <div><dt>Brought from the shop</dt><dd>${SHOP.get(s.item).icon} ${SHOP.get(s.item).name}</dd></div>` : ''}${s.stats.smokes ? `
        <div><dt>Smoke breaks</dt><dd>${s.stats.smokes}</dd></div>` : ''}
${s.stats.marl ? `<div><dt>Marl's handiwork</dt><dd>${s.stats.marl}</dd></div>
        ` : ''}${s.stats.nags ? `<div><dt>Earfuls from the engineer</dt><dd>${s.stats.nags}</dd></div>
        ` : ''}<div><dt>Zonnics stuck to helpers</dt><dd>${s.stats.sonicHits || 0}${s.stats.sonicThrows ? ` of ${s.stats.sonicThrows} thrown` : ''}</dd></div>${s.stats.berated ? `
        <div><dt>Helpers yelled at</dt><dd>${s.stats.berated} time${s.stats.berated === 1 ? '' : 's'}</dd></div>` : ''}
      </dl>
${w ? `
      <h3>The well</h3>
      <dl class="rp-stats">
        <div><dt>Engineer's drawing</dt><dd>${w.plan.L} ft of screen, bottom at ${f1(w.plan.B)} ft</dd></div>${wellRows}
${w.pulls ? `
        <div><dt>Casing pulled</dt><dd>${w.pulls} joint${w.pulls === 1 ? '' : 's'}, ${w.clean} with the fill right</dd></div>` : ''}${w.wrecks ? `
        <div><dt>Installs wrecked</dt><dd class="r">${w.wrecks} (too much in the casing${w.forgiven ? ', 1 forgiven by the spare well kit' : ''})</dd></div>` : ''}
        <div><dt>Bags down the hole</dt><dd>${w.bags.bent.toFixed(1)} bentonite, ${w.bags.sand.toFixed(1)} sand</dd></div>${w.fumbles ? `
        <div><dt>Pipe fumbled</dt><dd>${w.fumbles}</dd></div>` : ''}${w.spill > 0.3 ? `
        <div><dt>Bentonite spilled out the top</dt><dd class="a">about ${Math.max(1, Math.round(w.spill / 3))} bag${Math.round(w.spill / 3) > 1 ? 's' : ''}</dd></div>` : ''}
      </dl>` : ''}
      <h3>Boring log</h3>
      <div class="rp-table"><table><thead><tr><th>Run</th><th>Depth (ft)</th><th>Material</th><th>Cored</th><th>Recovered</th><th>Rec.</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    $('report').hidden = false;
  }

  function init(app) {
    APP = app;
    Object.assign(side, {
      title: $('nbTitle'), text: $('nbText'), bar: $('nbBar'), barTxt: $('nbBarTxt'), layer: $('nbLayer'), tip: $('nbTip'),
      alarms: $('alarms'), log: $('log'), latest: $('latest'),
      bubbles: { dale: $('bubDale'), tess: $('bubTess') },
    });
    buildCrew(); buildSection();
  }
  function reset() { buildCrew(); lastLog = ''; lastAlarm = ''; }

  return { init, update, tooltip, showReport, reset };
})();
