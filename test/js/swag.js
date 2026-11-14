'use strict';
/* Swag: the cosmetics. Fifty things to wear that change nothing but how the driller looks: 10 hard hats, 10 pairs of
   glasses, 10 pairs of gloves and 20 outfits. Finishing any hole with a grade of NEED or better earns one Swag Token,
   and every item costs one. One item can be worn in each of the four slots at once. What is owned and worn is kept in
   this browser (yhiog-swag).

   Each item is a few changes to the driller's look, the same parts kit js/crew.js describes, plus the extra parts the
   swag needs (patterns, hatKit, the new kinds of glasses, extras for an outfit), all built by makePerson in js/world.js.
   The driller keeps their own face, hair and build whatever they wear.
     hat      look = the hard hat's colour or pattern, or hatKit = a hat that is not a hard hat at all
     glasses  look = which glasses
     gloves   glove = colour on the driller's model; hands = the gloves you see on the levers (palm, cuff, fingers, thumb, size)
     outfit   look = torso / arms / pants colours or patterns and trimmings; wears = a hat or glasses that come with it,
              shown only while that slot is otherwise empty
   A colour written as a word ('camo', 'flames', 'gold' ...) is a pattern from PATS in js/world.js. */
window.SWAG = (() => {
  const KEY = 'yhiog-swag', NEED = 85, PRICE = 1;
  const SLOTS = [['hat', 'Hard hats'], ['glasses', 'Glasses'], ['gloves', 'Gloves'], ['outfit', 'Outfits']];
  const ITEMS = [
    // ---------- hard hats ----------
    { id: 'h-carbon', slot: 'hat', name: 'Carbon fibre', blurb: 'Weighs nothing. Costs everything.', look: { hat: 'carbon', hatTrim: 0x17181b, hatStyle: 'full' } },
    { id: 'h-gold', slot: 'hat', name: 'Gold plated', blurb: 'For the driller who has everything.', look: { hat: 'gold', hatTrim: 0xfff0a0 } },
    { id: 'h-chrome', slot: 'hat', name: 'Chrome dome', blurb: 'Blinds the helpers on a sunny day.', look: { hat: 'chrome', hatTrim: 0xffffff, hatStyle: 'full' } },
    { id: 'h-flames', slot: 'hat', name: 'Flame job', blurb: 'Makes the rig go faster.', look: { hat: 'hatFlames', hatTrim: 0xf47a1a } },
    { id: 'h-camo', slot: 'hat', name: 'Camo lid', blurb: 'Nobody can find you at break time.', look: { hat: 'camo', hatTrim: 0x3f4d2a, hatStyle: 'full' } },
    { id: 'h-cowboy', slot: 'hat', name: 'Cowboy hard hat', blurb: 'Yeehaw-rated to CSA standards.', look: { hat: 0xd9b47a, hatTrim: 0x6b4a26, hatStyle: 'cowboy', frameBack: 1.32 } },
    { id: 'h-viking', slot: 'hat', name: 'Viking helmet', blurb: 'For raiding the lunch truck.', look: { hatKit: 'viking', frameBack: 1.2 } },
    { id: 'h-propeller', slot: 'hat', name: 'Propeller beanie', blurb: 'The apprentice special.', look: { hatKit: 'propeller', frameBack: 1.1 } },
    { id: 'h-cone', slot: 'hat', name: 'Traffic cone', blurb: 'Found it on the way in.', look: { hatKit: 'cone', frameBack: 1.3 } },
    { id: 'h-crown', slot: 'hat', name: "King's crown", blurb: 'King of the hole.', look: { hatKit: 'crown', frameBack: 1.12 } },
    // ---------- glasses ----------
    { id: 'g-laser', slot: 'glasses', name: 'Laser goggles', blurb: 'Pew pew.', look: { glasses: 'laser' } },
    { id: 'g-swim', slot: 'glasses', name: 'Swimming goggles', blurb: 'For when the sand heaves.', look: { glasses: 'swim' } },
    { id: 'g-aviator', slot: 'glasses', name: 'Aviators', blurb: 'Top Gun, bottom of the hole.', look: { glasses: 'round', wire: true, lensClear: false, frame: 0xd9a51c, lens: ['#ffe9a8', '#c98a2a', '#4a2f14'] } },
    { id: 'g-3d', slot: 'glasses', name: '3D glasses', blurb: 'The core really pops.', look: { glasses: '3d' } },
    { id: 'g-monocle', slot: 'glasses', name: 'Monocle', blurb: 'Indubitably.', look: { glasses: 'monocle' } },
    { id: 'g-heart', slot: 'glasses', name: 'Heart shades', blurb: 'In love with the job.', look: { glasses: 'heart' } },
    { id: 'g-star', slot: 'glasses', name: 'Star shades', blurb: 'Employee of the month.', look: { glasses: 'star' } },
    { id: 'g-ski', slot: 'glasses', name: 'Ski goggles', blurb: 'Fresh powder. Well, bentonite.', look: { glasses: 'ski' } },
    { id: 'g-shutter', slot: 'glasses', name: 'Shutter shades', blurb: 'Cannot see a thing. Worth it.', look: { glasses: 'shutter' } },
    { id: 'g-googly', slot: 'glasses', name: 'Googly eyes', blurb: 'Safety glasses, technically.', look: { glasses: 'googly' } },
    // ---------- gloves ----------
    { id: 'v-pink', slot: 'gloves', name: 'Hot pink', blurb: 'Easy to find in the mud.', glove: 0xff5fa8, hands: { palm: 0xff5fa8, cuff: 0xc93a7f } },
    { id: 'v-nitrile', slot: 'gloves', name: 'Blue nitrile', blurb: 'The lab sends its regards.', glove: 0x3f8fe0, hands: { palm: 0x3f8fe0, cuff: 0x6fb0f0 } },
    { id: 'v-cartoon', slot: 'gloves', name: 'Cartoon whites', blurb: 'Four fingers would be more accurate.', glove: 0xffffff, hands: { palm: 0xffffff, cuff: 0xffffff } },
    { id: 'v-gold', slot: 'gloves', name: 'Golden touch', blurb: 'Everything you grab turns to overtime.', glove: 0xf2c230, hands: { palm: 0xf2c230, cuff: 0xb8860b } },
    { id: 'v-rainbow', slot: 'gloves', name: 'Rainbow fingers', blurb: 'One colour per lever.', glove: 0xf4f4ee, hands: { palm: 0xf4f4ee, cuff: 0x8a4fd6, fingers: [0xe0362b, 0xf2c230, 0x3aa856, 0x2c8ad6], thumb: 0xf47a1a } },
    { id: 'v-skeleton', slot: 'gloves', name: 'Skeleton hands', blurb: 'Worked to the bone.', glove: 0x17181b, hands: { palm: 0x17181b, cuff: 0x17181b, fingers: [0xf4f4ee, 0xf4f4ee, 0xf4f4ee, 0xf4f4ee], thumb: 0xf4f4ee } },
    { id: 'v-boxing', slot: 'gloves', name: 'Boxing gloves', blurb: 'For talking to the engineer.', glove: 0xd4271b, hands: { palm: 0xd4271b, cuff: 0xfdfdf8, size: 1.22 } },
    { id: 'v-camo', slot: 'gloves', name: 'Camo gloves', blurb: 'Where did my hands go?', glove: 0x5b6b3a, hands: { palm: 0x5b6b3a, cuff: 0x3d4a28, fingers: [0x7a8450, 0x3d4a28, 0x7a8450, 0x3d4a28], thumb: 0x7a8450 } },
    { id: 'v-robot', slot: 'gloves', name: 'Robot hands', blurb: 'Beep boop. Feed down.', glove: 0xc9d1d8, hands: { palm: 0xc9d1d8, cuff: 0x39424a, fingers: [0x9aa5ae, 0x9aa5ae, 0x9aa5ae, 0x9aa5ae], thumb: 0x9aa5ae } },
    { id: 'v-zombie', slot: 'gloves', name: 'Zombie hands', blurb: 'After a fourteen-hour shift.', glove: 0x7fae5a, hands: { palm: 0x7fae5a, cuff: 0x5a4632, fingers: [0x7fae5a, 0x6c9a4a, 0x7fae5a, 0x6c9a4a], thumb: 0x6c9a4a } },
    // ---------- outfits ----------
    { id: 'o-flavour', slot: 'outfit', name: 'The Flavour Guy', blurb: 'Flame shirt, frosted tips. This hole is money.', wears: { hat: { hatKit: 'frosted', frameBack: 1.12 }, glasses: { glasses: 'wrap', lens: ['#2a2a2e', '#111114', '#3a3a40'], frame: 0xf4f4ee } },
      look: { plain: true, torso: 'flames', yoke: 0x16161a, arms: 0x16161a, pants: 0x2f4a78, suitDark: 0x17181b, boot: 0xf4f4ee, cuff: 0x16161a, extras: ['chain'] } },
    { id: 'o-clown', slot: 'outfit', name: 'Clown', blurb: 'The whole site is a circus anyway.', wears: { hat: { hatKit: 'clownwig', frameBack: 1.15 } },
      look: { plain: true, torso: 'dots', arms: 'dots', pants: 'dots', suitDark: 0xe0362b, boot: 0xe0362b, cuff: 0xfdfdf8, noseBall: 0xe0362b, extras: ['ruff', 'poms'] } },
    { id: 'o-tux', slot: 'outfit', name: 'Tuxedo', blurb: 'Black tie drilling.', look: { plain: true, torso: 0x17181b, arms: 0x17181b, pants: 0x17181b, suitDark: 0x0e0f11, boot: 0x0e0f11, cuff: 0xfdfdf8, extras: ['bib', 'lapels', 'bowtie'] } },
    { id: 'o-prison', slot: 'outfit', name: 'Prison stripes', blurb: 'Ten to twenty feet.', look: { plain: true, torso: 'stripesBW', arms: 'stripesBW', pants: 'stripesBW', suitDark: 0x17181b, cuff: 0x17181b } },
    { id: 'o-ref', slot: 'outfit', name: 'Referee', blurb: 'Flag on the play: dropped pipe.', look: { plain: true, torso: 'stripesRef', arms: 'stripesRef', pants: 0x17181b, suitDark: 0x17181b, cuff: 0x17181b, extras: ['collar'], lapel: 0x17181b } },
    { id: 'o-camo', slot: 'outfit', name: 'Hunting camo', blurb: 'Orange vest so the helpers do not shoot.', look: { plain: true, torso: 'camo', arms: 'camo', pants: 'camo', suitDark: 0x3f4d2a, cuff: 0x3f4d2a, vest: 0xf47a1a } },
    { id: 'o-hero', slot: 'outfit', name: 'Captain Driller', blurb: 'Faster than a speeding core barrel.', look: { plain: true, torso: 0x2456c8, arms: 0x2456c8, pants: 0x2456c8, suitDark: 0xc8201a, boot: 0xc8201a, cuff: 0xc8201a, cape: 0xc8201a, belt: 0xf2c230, emblem: 'D', extras: ['cape', 'belt', 'emblem'] } },
    { id: 'o-astro', slot: 'outfit', name: 'Astronaut', blurb: 'One small hole for man.', look: { plain: true, torso: 0xf1f3f5, arms: 0xf1f3f5, pants: 0xf1f3f5, suitDark: 0x9aa5ae, boot: 0xc9d1d8, cuff: 0x2456c8, emblem: 'A', emblemBg: '#2456c8', emblemInk: '#ffffff', belt: 0x9aa5ae, extras: ['emblem', 'belt', 'hose'] } },
    { id: 'o-chef', slot: 'outfit', name: 'Chef', blurb: 'Core, medium rare.', wears: { hat: { hatKit: 'toque', frameBack: 1.18 } },
      look: { plain: true, torso: 0xfdfdf8, arms: 0xfdfdf8, pants: 'check', suitDark: 0xfdfdf8, boot: 0x17181b, cuff: 0xfdfdf8, extras: ['buttons2', 'bandana'], tie: 0xc0271f } },
    { id: 'o-hawaii', slot: 'outfit', name: 'Hawaiian shirt', blurb: 'On the clock, on vacation.', look: { plain: true, torso: 'floral', arms: 'floral', pants: 0xcdb68a, suitDark: 0x8a6a45, boot: 0x8a6a45, cuff: 0x12a59c, extras: ['collar'], lapel: 0x12a59c } },
    { id: 'o-lumber', slot: 'outfit', name: 'Lumberjack', blurb: 'Wrong kind of drilling, right kind of shirt.', look: { plain: true, torso: 'plaid', arms: 'plaid', pants: 0x2f4a78, suitDark: 0x4a2f1b, boot: 0x4a2f1b, cuff: 0x6f1611, extras: ['suspenders'], tie: 0x4a2f1b } },
    { id: 'o-disco', slot: 'outfit', name: 'Disco suit', blurb: 'Staying alive, staying on resonance.', look: { plain: true, torso: 0xfdfdf8, arms: 0xfdfdf8, pants: 0xfdfdf8, suitDark: 0xf1f3f5, boot: 0xfdfdf8, cuff: 0xfdfdf8, lapel: 0xfdfdf8, bib: 0x23262b, extras: ['bib', 'collar', 'chain'] } },
    { id: 'o-sheriff', slot: 'outfit', name: 'Sheriff', blurb: 'This hole ain\'t big enough for the two of us.', look: { plain: true, torso: 0xc9a56a, arms: 0xc9a56a, pants: 0x2f4a78, suitDark: 0x4a2f1b, boot: 0x4a2f1b, cuff: 0x6b4a26, vest: 0x6b4a26, vestPlain: true, tie: 0xc0271f, belt: 0x4a2f1b, extras: ['star', 'bandana', 'belt'] } },
    { id: 'o-pirate', slot: 'outfit', name: 'Pirate', blurb: 'Arr. Thar be shale.', look: { plain: true, torso: 'stripesRed', arms: 'stripesRed', pants: 0x23262b, suitDark: 0x17181b, boot: 0x17181b, cuff: 0xfdfdf8, belt: 0xc0271f, extras: ['sash'] } },
    { id: 'o-skeleton', slot: 'outfit', name: 'Skeleton suit', blurb: 'What the last helper looked like.', look: { plain: true, torso: 0x17181b, arms: 0x17181b, pants: 0x17181b, suitDark: 0x0e0f11, boot: 0x0e0f11, cuff: 0x17181b, extras: ['ribs', 'bones'] } },
    { id: 'o-santa', slot: 'outfit', name: 'Santa suit', blurb: 'He knows if your recovery was bad or good.', wears: { hat: { hatKit: 'santa', frameBack: 1.18 } },
      look: { plain: true, torso: 0xc8201a, arms: 0xc8201a, pants: 0xc8201a, suitDark: 0x17181b, boot: 0x17181b, cuff: 0xfdfdf8, belt: 0x17181b, extras: ['fur', 'belt'] } },
    { id: 'o-hazmat', slot: 'outfit', name: 'Hazmat suit', blurb: 'For the gas station hole.', look: { plain: true, torso: 0xf2d21a, arms: 0xf2d21a, pants: 0xf2d21a, suitDark: 0x17181b, boot: 0x17181b, cuff: 0x17181b, emblem: '!', emblemBg: '#17181b', emblemInk: '#f2d21a', extras: ['emblem', 'hose'] } },
    { id: 'o-office', slot: 'outfit', name: 'Head office', blurb: 'Never been on a site. Has opinions.', look: { plain: true, torso: 0x5a6470, arms: 0x5a6470, pants: 0x5a6470, suitDark: 0x39424a, boot: 0x17181b, cuff: 0xfdfdf8, lapel: 0x39424a, tie: 0xc0271f, extras: ['bib', 'lapels', 'tie'] } },
    { id: 'o-robe', slot: 'outfit', name: 'Bathrobe', blurb: 'Called in on a day off.', look: { plain: true, torso: 0x9fc4e8, arms: 0x9fc4e8, pants: 0x9fc4e8, suitDark: 0x9fc4e8, boot: 0xf4c9a8, cuff: 0xfdfdf8, lapel: 0xfdfdf8, extras: ['robe'] } },
    { id: 'o-track', slot: 'outfit', name: 'Tracksuit', blurb: 'Three stripes, zero cardio.', look: { plain: true, torso: 0xc0271f, arms: 0xc0271f, pants: 0xc0271f, suitDark: 0x8f1c16, boot: 0xfdfdf8, cuff: 0xfdfdf8, extras: ['sideStripes', 'chain'] } },
  ];
  const BY = {}; ITEMS.forEach(i => { BY[i.id] = i; });
  const st = { tokens: 0, own: {}, wear: { hat: '', glasses: '', gloves: '', outfit: '' } };

  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      if (o.tokens >= 0) st.tokens = Math.floor(+o.tokens) || 0;
      for (const i of ITEMS) if (o.own && o.own[i.id]) st.own[i.id] = true;
      for (const [slot] of SLOTS) { const id = o.wear && o.wear[slot]; if (BY[id] && BY[id].slot === slot && st.own[id]) st.wear[slot] = id; }
    } catch (e) { /* nothing saved, or storage is blocked */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage is blocked: it lasts until the page closes */ } }
  // a hole is finished: a grade of NEED or better earns a Swag Token. Returns how many were earned
  function earn(score) { if (score < NEED) return 0; st.tokens++; save(); return 1; }
  function buy(id) {
    const i = BY[id];
    if (!i || st.own[id] || st.tokens < PRICE) return false;
    st.tokens -= PRICE; st.own[id] = true; st.wear[i.slot] = id;      // new swag goes straight on
    save(); return true;
  }
  // put an owned item on (or take it off again)
  function wear(id) { const i = BY[id]; if (!i || !st.own[id]) return; st.wear[i.slot] = st.wear[i.slot] === id ? '' : id; save(); }
  const worn = slot => BY[st.wear[slot]] || null;

  // the look of someone wearing a set of items: their own face and build, the swag over the top
  const NO_HAT = { hatKit: null, hatStyle: null, hatFlag: null, lamp: false, liner: null, muffs: false, frameBack: 0 };
  const NO_SUIT = { vest: null, vestPlain: false, hood: null, shirt: null, belly: false, chain: false };
  function lookWith(base, set) {
    const o = Object.assign({}, base), fit = set.outfit, hat = set.hat, gl = set.glasses, gv = set.gloves;
    if (fit) { Object.assign(o, NO_SUIT, fit.look); if (fit.wears && fit.wears.hat && !hat) Object.assign(o, NO_HAT, fit.wears.hat); if (fit.wears && fit.wears.glasses && !gl) Object.assign(o, { hangGlasses: false }, fit.wears.glasses); }
    if (hat) Object.assign(o, NO_HAT, hat.look);
    if (gl) Object.assign(o, { hangGlasses: false, wire: false, lensClear: false }, gl.look);
    if (gv) o.glove = gv.glove;
    return o;
  }
  // the driller as dressed right now
  const dress = base => lookWith(base, { hat: worn('hat'), glasses: worn('glasses'), gloves: worn('gloves'), outfit: worn('outfit') });
  // for the shop's pictures: the driller in their own work clothes, wearing just this one item
  function tryOn(base, id) {
    const set = {};
    if (BY[id]) set[BY[id].slot] = BY[id];
    return lookWith(base, set);
  }
  // what the hands on the levers look like: the gloves, and the sleeve of the outfit
  function hands() {
    const gv = worn('gloves'), fit = worn('outfit');
    return { gloves: gv ? gv.hands : null, sleeve: fit ? fit.look.arms : null };
  }
  // for testing: give yourself Swag Tokens from the browser console
  function grant(n) { st.tokens += n || 1; save(); return st.tokens; }
  load();

  return { ITEMS, SLOTS, NEED, PRICE, get: id => BY[id] || null, state: st, earn, buy, wear, worn, dress, tryOn, hands, grant };
})();
