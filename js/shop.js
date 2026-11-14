'use strict';
/* The shop: things the driller can bring to a hole. Finishing any hole with a grade of NEED or better earns one Safety
   Buck, and everything in the shop costs one. Gear is kept for good. A one-time item is used up by the hole it does
   something on (bring it and never need it, and you still have it). Only one item comes along per hole: whichever is
   picked in the shop when the hole starts. What is owned is kept in this browser (yhiog-shop).

   What each item does is spread through the game, at the place it applies. S.item is the item on this hole:
     gloves, shades, mug, energy, dart ... tune() below, read by every prompt (js/easy.js, js/well.js, js/toss.js)
     tape, donuts, beer, kit .............. the well install (js/well.js)
     bit .................................. cobbles in the drilling model (js/sim.js, coreAdvance)
     padlock, duct ........................ Marl's breakdown (js/marl.js)
     hat .................................. lucky() below, asked at every fumble
     favour ............................... Aaron's call (js/aaron.js)
   What the player sees of it (the chip in the top bar, the card on the console, gloves, tint and so on) is packItem in js/main.js. */
window.SHOP = (() => {
  const KEY = 'yhiog-shop', NEED = 95, PRICE = 1;
  const ITEMS = [
    { id: 'gloves', icon: '🧤', name: 'Grippy gloves', keep: true, what: 'Circle and swipe prompts ask for less: shorter circles, two fewer swipes.', see: 'Your gloves turn orange.' },
    { id: 'shades', icon: '🕶️', name: 'Mirrored shades', keep: true, what: 'The green zone on the timing marker is half as wide again, and the Zonnic ring is more forgiving.', see: 'The view takes on a tint.' },
    { id: 'mug', icon: '☕', name: 'Coffee mug', keep: true, what: 'Tap-fast prompts need about a third fewer taps.', see: 'A card on the console.' },
    { id: 'tape', icon: '📏', name: 'The good tape', keep: true, what: 'The pour shows on the tape a quarter sooner.', see: 'The tape reading turns yellow.' },
    { id: 'bit', icon: '⛏️', name: 'Carbide bit', keep: true, what: 'Cobbles and boulders break far less of your core.', see: 'A card on the console.' },
    { id: 'padlock', icon: '🔒', name: 'Padlock on the toolbox', keep: true, what: 'Marl cannot get at the rig. Nothing breaks down.', see: 'A card on the console.' },
    { id: 'hat', icon: '⛑️', name: 'Lucky hard hat', keep: true, what: 'The first two fumbles of the hole do not count against your grade.', see: 'A card on the console.' },
    { id: 'dart', icon: '🚬', name: 'Special cigarette', keep: false, what: 'Light it when you want. While it burns (about two minutes) every prompt runs slow.', see: 'A gold cigarette with green smoke.' },
    { id: 'favour', icon: '⭐', name: "Aaron's favour", keep: false, what: 'Aaron owes you one: 3 extra minutes on his countdown. (He calls from hole 3 on.)', see: 'A star by his name when he calls.' },
    { id: 'donuts', icon: '🍩', name: 'Box of donuts', keep: false, what: 'The engineer goes easy on the well: within 1 ft of the drawing counts as bang on.', see: 'The engineer mentions them.' },
    { id: 'beer', icon: '🍺', name: 'Case of beer for the helpers', keep: false, what: 'The helper pouring calls out the moment you have poured enough, every pour.', see: 'He shouts "That is good, boss!"' },
    { id: 'duct', icon: '🩹', name: 'Roll of duct tape', keep: false, what: 'If Marl has broken something, you tape it up on the spot. No stopping to look.', see: 'A card on the console.' },
    { id: 'kit', icon: '🧰', name: 'Spare well kit', keep: false, what: 'One wrecked install is forgiven: it costs no points.', see: 'A card on the console.' },
    { id: 'energy', icon: '🥤', name: 'Energy drink', keep: false, what: 'One extra second on every prompt, all hole.', see: 'Your view has the jitters.' },
  ];
  const BY = {}; ITEMS.forEach(i => { BY[i.id] = i; });
  const st = { bucks: 0, own: {}, stock: {}, equip: '' };

  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      if (o.bucks >= 0) st.bucks = Math.floor(+o.bucks) || 0;
      for (const i of ITEMS) {
        if (i.keep) { if (o.own && o.own[i.id]) st.own[i.id] = true; }
        else if (o.stock && o.stock[i.id] > 0) st.stock[i.id] = Math.floor(+o.stock[i.id]) || 0;
      }
      if (BY[o.equip] && has(o.equip)) st.equip = o.equip;
    } catch (e) { /* nothing saved, or storage is blocked */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage is blocked: it lasts until the page closes */ } }
  const has = id => (BY[id] ? (BY[id].keep ? !!st.own[id] : (st.stock[id] || 0) > 0) : false);
  const count = id => (BY[id] && !BY[id].keep ? st.stock[id] || 0 : has(id) ? 1 : 0);

  // a hole is finished: a grade of NEED or better earns a Safety Buck. Returns how many were earned
  function earn(score) { if (score < NEED) return 0; st.bucks++; save(); return 1; }
  function buy(id) {
    const i = BY[id];
    if (!i || st.bucks < PRICE || (i.keep && st.own[id])) return false;
    st.bucks -= PRICE;
    if (i.keep) st.own[id] = true; else st.stock[id] = (st.stock[id] || 0) + 1;
    if (!st.equip) st.equip = id;                 // nothing picked yet: bring the new thing
    save(); return true;
  }
  // pick the one item to bring (or pick it again to leave it behind)
  function equip(id) { st.equip = st.equip === id || !has(id) ? '' : id; save(); }
  // a hole is starting: what comes along
  function take() { return has(st.equip) ? st.equip : ''; }
  // a one-time item has just done its job on this hole: it is gone. Gear is never used up. Returns true the first time
  function use(S) {
    const i = BY[S.item];
    if (!i || i.keep || S.itemSpent) return false;
    S.itemSpent = true;
    st.stock[i.id] = Math.max(0, (st.stock[i.id] || 0) - 1);
    if (!st.stock[i.id] && st.equip === i.id) st.equip = '';
    save(); return true;
  }
  // the special cigarette is burning
  const dartOn = S => !!S.dartLit && typeof WORLD !== 'undefined' && WORLD.smoking;
  // how fast the prompts are on this hole, with whatever the driller brought
  function tune(S) {
    const t = Object.assign({ ringTol: 1 }, S.site.tune), it = S.item;
    if (it === 'gloves') { t.turns *= 0.8; t.strokes = Math.max(4, t.strokes - 2); t.keys = Math.max(5, t.keys - 2); }
    if (it === 'shades') { t.zone *= 1.5; t.ringTol = 1.6; }
    if (it === 'mug') t.taps = Math.max(6, Math.round(t.taps * 0.68));
    if (it === 'energy') { t.spinTime += 1; t.mashTime += 1; t.aimTime += 1; }
    if (dartOn(S)) { t.spinTime *= 1.6; t.mashTime *= 1.6; t.aimTime *= 1.4; t.sweep *= 0.6; t.ring *= 1.5; }
    return t;
  }
  // a fumble: with the lucky hat the first two are let off. Returns true if this one does not count
  function lucky(S) {
    if (S.item !== 'hat' || (S.luck || 0) >= 2) return false;
    S.luck = (S.luck || 0) + 1;
    S.log.unshift({ t: S.t, clock: SIM.clockStr(S), msg: `Lucky hard hat: that fumble does not count (${2 - S.luck} left).`, lvl: 'good' });
    return true;
  }
  // for testing: give yourself Safety Bucks from the browser console
  function grant(n) { st.bucks += n || 1; save(); return st.bucks; }
  load();

  return { ITEMS, NEED, PRICE, get: id => BY[id] || null, state: st, has, count, earn, buy, equip, take, use, tune, lucky, dartOn, grant };
})();
