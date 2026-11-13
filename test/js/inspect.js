'use strict';
/* Sonic Driller 3D: core inspection. After every run the driller walks to the core table and gets a close,
   detailed look at the sample: what the ground looks like, where core was lost and why, and how the run was drilled.
   The picture is painted from the run's record in the drilling model (js/sim.js: run.segs, run.notes, run.tel). */
window.INSPECT = (() => {
  const PPF = 240, SH = 200;                 // strip pixels per foot of core, strip height in pixels
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function rng(seed) { let s = Math.abs(Math.floor(seed)) % 2147483646 + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }

  const CAUSE = {
    washed: { label: 'WASHED', col: '#1f7fc4', tip: 'Pump water was on. Core runs are drilled dry: water is for overriding the casing.' },
    compressed: { label: 'COMPRESSED', col: '#7a4a1e', tip: 'Pushed hard with the sonic out of tune. Ease the feed and find resonance first.' },
    spun: { label: 'SPUN', col: '#a24a1e', tip: 'Too much rotation for this ground. Slow it down and let the sonic do the cutting.' },
    heated: { label: 'COOKED', col: '#c8302a', tip: 'High frequency off resonance baked the clay. Bring the frequency down to the sweet spot.' },
    rattled: { label: 'SHAKEN LOOSE', col: '#a36f05', tip: 'Loose ground vibrated off resonance. Tune the frequency before you lean on the feed.' },
    cobble: { label: 'COBBLES', col: '#4f5661', tip: 'Cobbles broke the core up. Ease the feed and keep it turning through them.' },
    overrun: { label: 'OVERRUN', col: '#b3261b', tip: 'The barrel was already full. Anything drilled after that had nowhere to go.' },
    slough: { label: 'SLOUGH', col: '#6d5c1f', tip: 'Loose material that fell or heaved into the hole before the run. Keep the casing full of water and trip slowly.' },
    tripLoss: { label: 'LOST ON TRIP', col: '#b3261b', tip: 'Core slid out of the barrel on the way up. Pull slower in sand and gravel.' },
  };

  // ---------- painting ground ----------
  const fill = (c, a, b, col) => { c.fillStyle = col; c.fillRect(a, 0, b - a, SH); };
  function dots(c, a, b, n, r, cols, R) {
    for (let i = 0; i < n; i++) { c.fillStyle = cols[(R() * cols.length) | 0]; c.beginPath(); c.arc(a + R() * (b - a), R() * SH, r * (0.5 + R()), 0, 7); c.fill(); }
  }
  function blobs(c, a, b, n, rx, ry, cols, R, hard) {
    for (let i = 0; i < n; i++) {
      const x = a + R() * (b - a), y = R() * SH, sx = rx * (0.5 + R()), sy = ry * (0.5 + R());
      c.fillStyle = cols[(R() * cols.length) | 0];
      c.beginPath(); c.ellipse(x, y, sx, sy, R() * 3.14, 0, 7); c.fill();
      if (hard) {
        c.strokeStyle = 'rgba(28,24,20,0.6)'; c.lineWidth = 1.6; c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.ellipse(x - sx * 0.25, y - sy * 0.3, sx * 0.35, sy * 0.25, 0, 0, 7); c.fill();
      }
    }
  }
  function wavy(c, x, R, amp) {              // a line across the core (a bedding plane seen side-on)
    c.beginPath(); c.moveTo(x, -2);
    for (let y = 0; y <= SH + 10; y += 20) c.lineTo(x + (R() - 0.5) * amp, y);
    c.stroke();
  }
  const TEX = {
    topsoil(c, a, b, R) {
      const w = b - a; fill(c, a, b, '#5b3d24');
      blobs(c, a, b, w / 14, 26, 14, ['rgba(38,24,12,0.35)', 'rgba(124,88,52,0.3)'], R);
      dots(c, a, b, w * 1.3, 1.6, ['#3a2414', '#8a6238', '#2c1a0c', '#a57c4c'], R);
      for (let i = 0; i < w / 40; i++) {
        const x = a + R() * w, y = R() * SH;
        c.strokeStyle = '#cdb48a'; c.lineWidth = 0.8 + R() * 1.6; c.beginPath(); c.moveTo(x, y);
        c.bezierCurveTo(x + 14 - R() * 28, y + 12, x + 20 - R() * 40, y + 26, x + 30 - R() * 60, y + 30 + R() * 26); c.stroke();
      }
      blobs(c, a, b, w / 70, 6, 5, ['#8d8f93', '#b8b0a0'], R, true);
    },
    clay(c, a, b, R) {
      const w = b - a; fill(c, a, b, '#8c7c65');
      blobs(c, a, b, w / 9, 42, 22, ['rgba(108,94,76,0.35)', 'rgba(162,148,124,0.3)', 'rgba(118,112,104,0.25)'], R);
      c.lineWidth = 1.4;
      for (let i = 0; i < w / 24; i++) { c.strokeStyle = R() < 0.6 ? 'rgba(66,56,44,0.24)' : 'rgba(190,178,150,0.25)'; wavy(c, a + R() * w, R, 9); }
      dots(c, a, b, w * 0.25, 1.4, ['#6a5c48', '#a6977c'], R);
    },
    sand(c, a, b, R) {
      const w = b - a; fill(c, a, b, '#d8b566');
      for (let x = a; x < b; x += 30 + R() * 60) { c.fillStyle = R() < 0.5 ? 'rgba(168,128,58,0.2)' : 'rgba(246,228,170,0.22)'; c.fillRect(x, 0, 8 + R() * 22, SH); }
      dots(c, a, b, w * 3.4, 1.25, ['#b58f43', '#f1dc9c', '#8f6f33', '#e8c97a', '#c9a455'], R);
    },
    gravel(c, a, b, R) {
      const w = b - a; fill(c, a, b, '#b89660');
      dots(c, a, b, w * 1.7, 1.4, ['#8f7242', '#e0c88f', '#6d5632'], R);
      blobs(c, a, b, w / 10, 13, 9, ['#8d8f93', '#6f6a63', '#c9c2b4', '#a0764d', '#55585e', '#d9d4c8'], R, true);
    },
    till(c, a, b, R) {
      const w = b - a; fill(c, a, b, '#74736a');
      blobs(c, a, b, w / 12, 36, 20, ['rgba(88,87,80,0.4)', 'rgba(132,130,120,0.3)'], R);
      dots(c, a, b, w * 1.5, 1.3, ['#4f4e48', '#9a998e', '#62615a'], R);
      for (let i = 0; i < w / 15; i++) {
        const x = a + R() * w, y = R() * SH, r = 5 + R() * 10, n = 4 + ((R() * 3) | 0);
        c.fillStyle = ['#5a5d63', '#8f9197', '#a39a8a', '#3f4146'][(R() * 4) | 0];
        c.beginPath();
        for (let k = 0; k < n; k++) { const t = k / n * 6.283 + R() * 0.5, rr = r * (0.6 + R() * 0.5); c[k ? 'lineTo' : 'moveTo'](x + Math.cos(t) * rr, y + Math.sin(t) * rr); }
        c.closePath(); c.fill(); c.strokeStyle = 'rgba(25,25,25,0.55)'; c.lineWidth = 1.4; c.stroke();
      }
    },
    shale(c, a, b, R) {
      const w = b - a; fill(c, a, b, '#555c66');
      for (let x = a; x < b; x += 3 + R() * 7) { c.strokeStyle = R() < 0.55 ? 'rgba(24,27,33,0.45)' : 'rgba(152,160,172,0.3)'; c.lineWidth = 0.8 + R() * 1.8; wavy(c, x, R, 3); }
      c.strokeStyle = '#191c22'; c.lineWidth = 2.6;
      for (let i = 0; i < w / 130; i++) { const x = a + R() * w; c.beginPath(); c.moveTo(x, -2); let xx = x; for (let y = 0; y <= SH + 12; y += 16) { xx += (R() - 0.45) * 10; c.lineTo(xx, y); } c.stroke(); }
    },
    slough(c, a, b, R) {
      const w = b - a; fill(c, a, b, '#c7b488');
      dots(c, a, b, w * 2.2, 1.8, ['#8f7a4c', '#e6d7ae', '#6f5d38', '#a8936a'], R);
      blobs(c, a, b, w / 28, 9, 7, ['#8d8f93', '#b8b0a0', '#6f6a63'], R, true);
      c.strokeStyle = 'rgba(92,72,30,0.33)'; c.lineWidth = 2;
      for (let x = a - SH; x < b; x += 16) { c.beginPath(); c.moveTo(x, SH); c.lineTo(x + SH, 0); c.stroke(); }
    },
  };

  // an empty stretch of sleeve, with ragged ends and a few crumbs lying in the bottom
  function voidPatch(c, x0, x1, R, ragged) {
    if (x1 - x0 < 1.5) return;
    c.save(); c.beginPath();
    const j = ragged ? Math.min(14, (x1 - x0) * 0.4) : 0;
    c.moveTo(x0, -2);
    for (let y = 0; y <= SH; y += 14) c.lineTo(x0 + (R() - 0.5) * j, y);
    c.lineTo(x0, SH + 2); c.lineTo(x1, SH + 2);
    for (let y = SH; y >= 0; y -= 14) c.lineTo(x1 + (R() - 0.5) * j, y);
    c.lineTo(x1, -2); c.closePath(); c.clip();
    c.fillStyle = '#d6e2e5'; c.fillRect(x0 - 16, 0, x1 - x0 + 32, SH);
    c.fillStyle = 'rgba(150,118,76,0.2)'; c.fillRect(x0 - 16, 0, x1 - x0 + 32, SH);
    for (let i = 0; i < (x1 - x0) / 5; i++) { c.fillStyle = ['#8f7a4c', '#6f5d38', '#a8936a', '#77766b'][(R() * 4) | 0]; c.beginPath(); c.arc(x0 + R() * (x1 - x0), SH * (0.74 + R() * 0.24), 1 + R() * 2.6, 0, 7); c.fill(); }
    c.restore();
  }

  // what the damage looks like, then the gaps where core is missing
  function damage(c, a, b, s, R, cobbleN) {
    const w = b - a, lost = clamp(1 - s.q, 0, 1), why = s.why;
    if (why === 'washed') {
      c.fillStyle = 'rgba(232,240,242,0.36)'; c.fillRect(a, 0, w, SH);
      c.strokeStyle = 'rgba(240,246,248,0.5)'; c.lineWidth = 3;
      for (let i = 0; i < 7; i++) { const y = R() * SH; c.beginPath(); c.moveTo(a, y); c.bezierCurveTo(a + w * 0.3, y + 10 - R() * 20, a + w * 0.6, y + 10 - R() * 20, b, y + 8 - R() * 16); c.stroke(); }
    } else if (why === 'compressed') {
      c.fillStyle = 'rgba(38,26,14,0.3)'; c.fillRect(a, 0, w, SH);
      c.strokeStyle = 'rgba(28,18,8,0.38)'; c.lineWidth = 1.5;
      for (let x = a; x < b; x += 5) { c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + 5, SH / 2, x, SH); c.stroke(); }
    } else if (why === 'spun') {
      c.strokeStyle = 'rgba(36,26,16,0.42)'; c.lineWidth = 3.5;
      for (let x = a - 70; x < b; x += 15) { c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 46, SH * 0.3, x + 20, SH * 0.7, x + 66, SH); c.stroke(); }
    } else if (why === 'heated') {
      c.fillStyle = 'rgba(250,232,196,0.36)'; c.fillRect(a, 0, w, SH);
      c.strokeStyle = '#3a2a1c'; c.lineWidth = 1.6;
      for (let i = 0; i < w / 22; i++) { let x = a + R() * w, y = R() * SH; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 26; y += (R() - 0.5) * 34; c.lineTo(x, y); } c.stroke(); }
    } else if (why === 'cobble') {
      for (let i = 0; i < cobbleN; i++) {
        const x = a + w * (i + 0.5) / cobbleN + (R() - 0.5) * 20, y = SH * (0.35 + R() * 0.3), rx = 26 + R() * 22, ry = 22 + R() * 16;
        c.fillStyle = ['#8a8d92', '#a59f93', '#6c7078'][(R() * 3) | 0];
        c.beginPath(); c.ellipse(x, y, rx, ry, R() * 3, 0, 7); c.fill(); c.strokeStyle = '#22201d'; c.lineWidth = 2.4; c.stroke();
        c.lineWidth = 1.8; c.beginPath(); c.moveTo(x - rx * 0.7, y - ry * 0.2); c.lineTo(x - rx * 0.1, y + ry * 0.1); c.lineTo(x + rx * 0.2, y - ry * 0.35); c.lineTo(x + rx * 0.75, y + ry * 0.2); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.ellipse(x - rx * 0.3, y - ry * 0.4, rx * 0.35, ry * 0.2, 0, 0, 7); c.fill();
      }
    }
    const gap = lost * w;
    if (gap < 2) return;
    if (why === 'compressed' || why === 'overrun' || s.q <= 0.02) voidPatch(c, b - gap, b, R, s.q > 0.02);
    else if (why === 'rattled') {                        // loose material slumped to the bottom of the sleeve
      const h = clamp(lost * SH * 1.6, 8, SH * 0.8);
      c.save(); c.beginPath(); c.moveTo(a, -2); c.lineTo(b, -2); c.lineTo(b, h * 0.7);
      for (let x = b; x >= a; x -= 18) c.lineTo(x, h * (0.6 + R() * 0.6));
      c.closePath(); c.clip(); c.fillStyle = '#d6e2e5'; c.fillRect(a, 0, w, SH); c.fillStyle = 'rgba(150,118,76,0.2)'; c.fillRect(a, 0, w, SH); c.restore();
    } else {
      const n = Math.max(1, Math.round(w / 120));
      for (let i = 0; i < n; i++) { const gw = gap / n * (0.7 + R() * 0.6), x = a + (w / n) * (i + 0.2 + R() * 0.6); voidPatch(c, clamp(x - gw / 2, a, b - gw), clamp(x + gw / 2, a + gw, b), R, true); }
    }
  }

  // ---------- the core strip: one long picture of the run, top of the run on the left ----------
  const cache = new Map();
  function strip(r) {
    if (cache.has(r)) return cache.get(r);
    const Lft = clamp(Math.max(SIM.RUN_LEN, r.fill), SIM.RUN_LEN, 11), W = Math.round(Lft * PPF);
    const raw = document.createElement('canvas'); raw.width = W; raw.height = SH;
    const c = raw.getContext('2d'), R = rng(r.n * 977 + Math.round(r.from * 31) + 13);
    c.fillStyle = '#d6e2e5'; c.fillRect(0, 0, W, SH);
    c.fillStyle = 'rgba(150,118,76,0.16)'; c.fillRect(0, 0, W, SH);
    const X = d => (d - r.from) * PPF;
    const end = r.from + r.fill, lostFrom = end - Math.min(r.fill, r.tripLoss || 0);
    for (const s of r.segs) {
      const a = X(s.a), b = X(Math.min(s.b, lostFrom));
      if (b - a < 0.5) continue;
      c.save(); c.beginPath(); c.rect(a, 0, b - a, SH); c.clip();
      (TEX[s.slough ? 'slough' : s.layer] || TEX.clay)(c, a, b, R);
      if (!s.slough) damage(c, a, b, s, R, Math.max(1, Math.round((b - a) / 150)));
      c.restore();
    }
    if (r.tripLoss > 0.02) voidPatch(c, X(lostFrom), X(end), R, true);
    // lit copy for the flat close-up: round shading and the shine of the plastic sleeve
    const lit = document.createElement('canvas'); lit.width = W; lit.height = SH;
    const l = lit.getContext('2d'); l.drawImage(raw, 0, 0);
    const g = l.createLinearGradient(0, 0, 0, SH);
    g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(0.13, 'rgba(255,255,255,0.2)'); g.addColorStop(0.32, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.58)');
    l.fillStyle = g; l.fillRect(0, 0, W, SH);
    l.fillStyle = 'rgba(255,255,255,0.3)'; l.fillRect(0, SH * 0.165, W, 3);
    l.fillStyle = 'rgba(255,255,255,0.12)'; l.fillRect(0, SH * 0.2, W, 8);
    const out = { raw, lit, Lft };
    cache.set(r, out); return out;
  }

  // stretches of the run to call out: [from, to, cause]
  function spans(r) {
    const end = r.from + r.fill, lostFrom = end - Math.min(r.fill, r.tripLoss || 0), out = [];
    for (const s of r.segs) {
      const key = s.slough ? 'slough' : (s.why && s.q < 0.97 ? s.why : '');
      const a = s.a, b = Math.min(s.b, lostFrom);
      if (!key || b - a < 0.04) continue;
      const last = out[out.length - 1];
      if (last && last[2] === key && a - last[1] < 0.08) last[1] = b; else out.push([a, b, key]);
    }
    if (r.tripLoss > 0.05) out.push([lostFrom, end, 'tripLoss']);
    return out;
  }

  // ---------- the close-up: the run laid out in two rows like a core box ----------
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawView(cv, r) {
    const st = strip(r), half = st.Lft / 2;
    const W = 1320, ML = 30, MR = 30, rowW = W - ML - MR, RH = 150, AN = 46, RU = 36, GAP = 10, k = rowW / (half * PPF);
    const H = 2 * (AN + RH + RU) + GAP + 6;
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d'); c.clearRect(0, 0, W, H);
    const sp = spans(r);
    for (let row = 0; row < 2; row++) {
      const y0 = 4 + row * (AN + RH + RU + GAP) + AN, d0 = r.from + row * half, d1 = d0 + half;
      const X = d => ML + (d - d0) * PPF * k;
      c.fillStyle = '#b08a58'; rr(c, ML - 14, y0 - 10, rowW + 28, RH + 20, 12); c.fill();
      c.strokeStyle = '#2a2418'; c.lineWidth = 3; c.stroke();
      c.fillStyle = 'rgba(0,0,0,0.22)'; rr(c, ML - 4, y0 - 3, rowW + 8, RH + 10, 8); c.fill();
      c.save(); rr(c, ML, y0, rowW, RH, 10); c.clip();
      c.drawImage(st.lit, row * half * PPF, 0, half * PPF, SH, ML, y0, rowW, RH);
      c.restore();
      c.strokeStyle = '#1f1b16'; c.lineWidth = 3; rr(c, ML, y0, rowW, RH, 10); c.stroke();
      // depth ruler
      c.fillStyle = '#2a2418'; c.textBaseline = 'top'; c.textAlign = 'center';
      for (let d = Math.ceil(d0 * 2 - 1e-6) / 2; d <= d1 + 1e-6; d += 0.5) {
        const whole = Math.abs(d - Math.round(d)) < 1e-6, x = X(d);
        c.fillRect(x - (whole ? 1.5 : 0.75), y0 + RH + 12, whole ? 3 : 1.5, whole ? 9 : 5);
        if (whole) { c.font = '700 15px "B612 Mono", Consolas, monospace'; c.fillText(d.toFixed(0) + ' ft', clamp(x, ML + 16, W - MR - 16), y0 + RH + 22); }
      }
      // call-outs above the row
      let lastR = [-1e9, -1e9];
      for (const [a, b, key] of sp) {
        const xa = Math.max(a, d0), xb = Math.min(b, d1);
        if (xb - xa < 0.02) continue;
        const C = CAUSE[key], x0 = X(xa), x1 = Math.max(X(xb), x0 + 4);
        c.strokeStyle = C.col; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x0, y0 - 13); c.lineTo(x0, y0 - 19); c.lineTo(x1, y0 - 19); c.lineTo(x1, y0 - 13); c.stroke();
        c.font = '800 15px "Barlow Condensed", Arial Narrow, sans-serif'; c.textBaseline = 'bottom';
        const txt = C.label + (b - a >= 0.5 ? `  ${(b - a).toFixed(1)} ft` : ''), tw = c.measureText(txt).width;
        const cx = clamp((x0 + x1) / 2, ML + tw / 2, W - MR - tw / 2);
        const lvl = cx - tw / 2 < lastR[0] + 8 ? (cx - tw / 2 < lastR[1] + 8 ? 0 : 1) : 0;
        lastR[lvl] = cx + tw / 2;
        c.fillStyle = C.col; c.textAlign = 'center'; c.fillText(txt, cx, y0 - 22 - lvl * 16);
      }
    }
  }

  // in thumb-pad mode there is no frequency knob or pump to blame, so the advice is about the two pads
  const EASY_TIP = {
    compressed: 'Pushed too hard and the head lost its hum. Keep the PUSH needle in the green.',
    heated: 'Pushed too hard in clay and the head ran hot off its hum. Back the PUSH off.',
    rattled: 'Loose ground shaken apart while the head was off its hum. Ease the PUSH when the ground changes.',
    spun: 'Too much SPIN for this ground. Keep the SPIN needle under the red.',
    cobble: 'Cobbles broke the core up. Ease the PUSH and keep it spinning through them.',
  };
  const easy = () => !!(window.APP && window.APP.easy);
  // ---------- the write-up beside the picture ----------
  function meter(name, val, frac, zone, note) {
    return `<div class="meter"><div class="m-top"><b>${name}</b><span>${val}</span></div><div class="m-track"><i class="m-zone" style="left:${zone[0] * 100}%;width:${(zone[1] - zone[0]) * 100}%"></i><i class="m-mark" style="left:${clamp(frac, 0, 1) * 100}%"></i></div><small>${note}</small></div>`;
  }
  let cur = 0, S0 = null;
  function show(i) {
    const runs = S0.runs; cur = clamp(i, 0, runs.length - 1);
    const r = runs[cur], pct = Math.round(r.recovery * 100), none = r.drilled < 0.05;
    $('inspTitle').textContent = `Run ${r.n} · ${r.from.toFixed(1)} to ${(r.to || r.from + r.fill).toFixed(1)} ft`;
    const stars = none ? 0 : pct >= 98 ? 3 : pct >= 90 ? 2 : pct >= 75 ? 1 : 0;
    $('inspPct').textContent = none ? '—' : pct + '%';
    $('inspPct').className = 'insp-pct ' + (pct >= 90 ? 'g' : pct >= 75 ? 'a' : 'r');
    $('inspStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('inspVerdict').textContent = none ? 'No new ground cored' : ['Poor core', 'Fair core', 'Good core', 'Textbook core'][stars];
    const mats = r.segs.filter(s => !s.slough).map(s => SIM.LAYERS.find(L => L.id === s.layer).name).filter((v, k, a) => a.indexOf(v) === k).join(', ') || 'slough only';
    $('inspSum').textContent = `Recovered ${r.recNet.toFixed(1)} ft of ${r.drilled.toFixed(1)} ft cored · ${mats}`;
    drawView($('inspCanvas'), r);
    const t = r.tel || { n: 0 };
    let drill = '<h3>How you drilled it</h3>';
    if (t.n > 0.05) {
      const res = t.res / t.n, push = t.push / t.n, rot = t.rpm / t.n, wet = (r.notes.washed || 0);
      if (easy()) drill += meter('Sonic hum', `${Math.round(res * 100)}% in tune`, res, [0.75, 1], res >= 0.75 ? 'The head kept its hum.' : 'The head kept losing its hum. Push lighter, and ease off when the ground changes.');
      else drill += meter('Resonance', `${Math.round(res * 100)}% in tune`, res, [0.75, 1], res >= 0.75 ? 'Right in the sweet spot.' : res >= 0.5 ? 'In tune part of the time. Watch for the penetration rate to jump and the oscillation pressure to dip.' : 'Mostly off resonance. Sweep the frequency until the rig settles down.');
      drill += meter(easy() ? 'Push' : 'Feed', push < 0.5 ? 'light' : push <= 1.6 ? 'about right' : 'heavy', push / 3, [0.17, 0.53], push < 0.5 ? 'Easy on the feed: slow going, but kind to the core.' : push <= 1.6 ? 'Firm and steady.' : 'Leaning on it. Too much weight squashes soft core and chews the bit.');
      drill += meter(easy() ? 'Spin' : 'Rotation', rot <= 1 ? `${Math.round(rot * 100)}% of the limit` : 'over the limit', rot / 2, [0, 0.5], rot <= 0.6 ? 'Easy rotation.' : rot <= 1 ? 'Close to the limit for this ground.' : 'Fast rotation twists the core up. Slow it down.');
      if (!easy()) drill += meter('Water', wet > 0.2 ? `on for ${wet.toFixed(1)} ft` : 'dry', wet > 0.2 ? clamp(wet / r.drilled, 0.12, 1) : 0, [0, 0.06], wet > 0.2 ? 'Pump water washes the core away.' : 'Dry run, as it should be.');
    } else drill += '<p>Nothing new was cored on this run.</p>';
    $('inspDrill').innerHTML = drill;
    const keys = SIM.noteKeys(r);
    let loss = '<h3>What cost you core</h3>';
    if (!keys.length && r.slough <= 0.05) loss += '<p class="clean">Nothing. Clean core from top to bottom. That is how it is done.</p>';
    else {
      loss += '<ul>';
      for (const key of keys) { const C = CAUSE[key]; if (C) loss += `<li><b style="color:${C.col}">${C.label}</b> ${r.notes[key].toFixed(1)} ft<small>${(easy() && EASY_TIP[key]) || C.tip}</small></li>`; }
      if (r.slough > 0.05) loss += `<li><b style="color:${CAUSE.slough.col}">SLOUGH</b> ${r.slough.toFixed(1)} ft<small>${CAUSE.slough.tip}</small></li>`;
      loss += '</ul>';
    }
    $('inspLoss').innerHTML = loss;
    $('inspPrev').disabled = cur <= 0; $('inspNext').disabled = cur >= runs.length - 1;
    $('inspCount').textContent = `${cur + 1} / ${runs.length}`;
    if (window.WORLD) WORLD.setInspectCore(strip(r).raw);
  }
  function open(S, i) { S0 = S; $('inspect').hidden = false; show(i == null ? S.runs.length - 1 : i); }
  function close() { $('inspect').hidden = true; }
  function prepare(S, i) { const r = S.runs[i == null ? S.runs.length - 1 : i]; if (r && window.WORLD) WORLD.setInspectCore(strip(r).raw); }
  function init() {
    $('inspPrev').addEventListener('click', () => show(cur - 1));
    $('inspNext').addEventListener('click', () => show(cur + 1));
  }
  return { init, open, close, prepare, strip, get isOpen() { return !$('inspect').hidden; } };
})();
