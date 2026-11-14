'use strict';
/* The ten holes of the career, easiest first. Each one is a site with its own depth, water table and ground, and a
   difficulty from 0 (hole 1) to 1 (hole 10) that speeds up the quick-time prompts and stretches the pour delay.
   A hole is passed with a combined grade (drilling and well install together) of PASS or better, which opens the next.
   Progress is kept in this browser (yhiog-career): the highest hole opened, the best grade on each, and the last one played.

   A layer is [material, bottom depth in ft, changes]. The materials themselves (how they drill) are MATS in js/sim.js.
   Hole 1 is the game's original hole, as it was before there was a career.
   Changes can rename a layer or alter how it drills: heave (how hard the sand runs), base (how fast it cuts),
   cob: [gapMin, gapMax, lenMin, lenMax] in ft (how many cobbles or boulders, and how big). Depths are in whole tens of
   feet, 40 to 80: the rig carries enough casing and rods for 80. */
window.SITES = (() => {
  const PASS = 80, KEY = 'yhiog-career';
  const LIST = [
    { name: 'Old gas station', depth: 60, wt: 12,
      blurb: 'The first job. A bit of everything: clay, running sand, cobbles, till and rock.',
      layers: [['topsoil', 3], ['clay', 14], ['sand', 28], ['gravel', 40], ['till', 52], ['shale', 70]] },
    { name: 'Gravel pit road', depth: 50, wt: 10,
      blurb: 'Cobbles from 2 ft down, then clay, then sand that runs.',
      layers: [['topsoil', 2], ['gravel', 16, { cob: [1.5, 3.8, 0.5, 1.2] }], ['clay', 26], ['sand', 40, { heave: 1.1 }], ['till', 60]] },
    { name: 'Riverbank', depth: 40, wt: 6,
      blurb: 'A short hole, but the water is nearly at surface and the sand runs hard.',
      layers: [['topsoil', 3], ['sand', 20, { heave: 1.3 }], ['gravel', 32, { cob: [1.4, 3.6, 0.5, 1.2] }], ['clay', 50]] },
    { name: 'Highway cut', depth: 60, wt: 9,
      blurb: 'Cobbles early, running sand under them, and stiff till over the rock.',
      layers: [['topsoil', 2], ['clay', 10], ['gravel', 26, { cob: [1.4, 3.4, 0.5, 1.2] }], ['sand', 40, { heave: 1.2 }], ['till', 52, { base: 4.6 }], ['shale', 70]] },
    { name: 'Railway yard', depth: 70, wt: 10,
      blurb: 'Deeper. A long stretch of sand, then a thick bed of cobbles.',
      layers: [['topsoil', 5, { name: 'Cinder fill', short: 'Cinders' }], ['clay', 15], ['sand', 32, { heave: 1.1 }], ['gravel', 46, { cob: [1.3, 3.4, 0.5, 1.2] }], ['till', 60], ['shale', 80]] },
    { name: 'Landfill edge', depth: 50, wt: 8,
      blurb: 'Loose fill, running sand and a lot of cobbles packed into 50 ft.',
      layers: [['topsoil', 6, { name: 'Garbage & fill', short: 'Fill' }], ['sand', 20, { heave: 1.3 }], ['clay', 26], ['gravel', 40, { cob: [1.1, 2.8, 0.6, 1.4] }], ['till', 60, { base: 4.2 }]] },
    { name: 'Lakeshore', depth: 70, wt: 4,
      blurb: 'Water at 4 ft and two thick beds of running sand. Trip out slowly.',
      layers: [['topsoil', 2], ['sand', 28, { heave: 1.4 }], ['clay', 36], ['sand', 50, { heave: 1.4 }], ['gravel', 60, { cob: [1.2, 3, 0.5, 1.2] }], ['shale', 80]] },
    { name: 'Quarry floor', depth: 60, wt: 35,
      blurb: 'Dry, but hard all the way: blast rock, bouldery till and solid shale.',
      layers: [['gravel', 12, { name: 'Blast rock & gravel', short: 'Blast rock', cob: [1, 2.4, 0.7, 1.5] }], ['till', 34, { name: 'Bouldery till', base: 4.2, cob: [2.6, 5, 0.6, 1.2] }], ['shale', 70, { name: 'Hard shale', base: 2.7 }]] },
    { name: 'Tailings pond', depth: 80, wt: 3,
      blurb: 'The deep one. 80 ft, water at 3 ft, and sand that never stops running.',
      layers: [['topsoil', 3, { name: 'Tailings crust', short: 'Crust' }], ['sand', 26, { name: 'Tailings sand, running', heave: 1.5 }], ['clay', 36], ['sand', 52, { name: 'Tailings sand, running', heave: 1.5 }], ['gravel', 66, { cob: [1, 2.6, 0.6, 1.3] }], ['till', 90]] },
    { name: "Marl's back forty", depth: 80, wt: 5,
      blurb: 'Marl picked the spot. Everything that can be in the ground is in this ground.',
      layers: [['topsoil', 3], ['sand', 18, { heave: 1.6 }], ['gravel', 34, { cob: [0.9, 2.2, 0.7, 1.6] }], ['clay', 42], ['sand', 54, { heave: 1.6 }], ['till', 68, { name: 'Bouldery till', base: 4, cob: [2.2, 4.5, 0.6, 1.2] }], ['shale', 90, { name: 'Hard shale', base: 2.6 }]] },
  ];
  const COUNT = LIST.length;
  const lerp = (a, b, k) => a + (b - a) * k;
  const clampN = n => Math.max(1, Math.min(COUNT, Math.round(+n) || 1));
  const hard = n => (clampN(n) - 1) / (COUNT - 1);

  // What the difficulty does to the prompts. Hole 1 is the easy end of every range, hole 10 the hard end.
  function tune(n) {
    const k = hard(n);
    return {
      k,
      spinTime: lerp(4.5, 2.6, k),             // circles and swipes: seconds allowed
      turns: lerp(1.6, 2.4, k),                // circles to draw
      strokes: Math.round(lerp(7, 9, k)),      // swipes to make
      keys: Math.round(lerp(8, 11, k)),        // the same two on a keyboard: A / D taps
      mashTime: lerp(4, 3, k), taps: Math.round(lerp(12, 16, k)),
      aimTime: lerp(6.5, 4.5, k), sweep: lerp(0.55, 1.1, k), zone: lerp(0.24, 0.18, k),     // the moving marker: time, speed, width of the green
      ring: lerp(1.6, 0.95, k),                // the Zonnic ring: seconds to shrink
      lag: lerp(1, 1.45, k),                   // the pour delay, on top of what the depth does
    };
  }
  // seconds for a pour to land and show on the tape: longer the deeper it has to fall, and longer still past 60 ft
  const pourLag = (depth, n) => { const d = Math.max(0, depth); return (0.5 + d * 0.045 + 0.0025 * Math.pow(Math.max(0, d - 60), 2)) * tune(n).lag; };

  function get(n) {
    n = clampN(n);
    const s = LIST[n - 1];
    return { n, name: s.name, blurb: s.blurb, depth: s.depth, wt: s.wt, layers: s.layers, well: 'MW-' + String(n).padStart(2, '0'), hard: hard(n), tune: tune(n), lagBottom: pourLag(s.depth, n) };
  }

  // ---------- progress ----------
  const career = { open: 1, last: 1, best: {} };
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      if (o.open >= 1) career.open = clampN(o.open);
      if (o.last >= 1) career.last = Math.min(clampN(o.last), career.open);
      if (o.best && typeof o.best === 'object') for (const k in o.best) { const v = +o.best[k]; if (v >= 0 && v <= 100) career.best[clampN(k)] = Math.round(v); }
    } catch (e) { /* nothing saved, or storage is blocked */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(career)); } catch (e) { /* storage is blocked: progress lasts until the page closes */ } }
  // a hole is finished: keep the grade, and open the next hole if it was a pass
  function record(n, score) {
    n = clampN(n);
    const before = career.best[n], passed = score >= PASS;
    if (before == null || score > before) career.best[n] = score;
    const opened = passed && n === career.open && n < COUNT;
    if (opened) career.open = n + 1;
    save();
    return { passed, opened, best: career.best[n], record: before != null && score > before, last: n === COUNT };
  }
  function setLast(n) { career.last = Math.min(clampN(n), career.open); save(); }
  function openAll() { career.open = COUNT; save(); }
  load();

  return { LIST, COUNT, PASS, get, hard, tune, pourLag, career, record, setLast, openAll, isOpen: n => clampN(n) <= career.open };
})();
