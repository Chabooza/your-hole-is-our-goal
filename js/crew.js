'use strict';
/* The people you can put on your crew. At the start of a hole the player picks one driller and two helpers from
   this list. To add someone, copy a line and change the name, the trade and the look. Everyone wears the blue coveralls.

   trade: 'driller' or 'helper'. Only a driller can take the driller's seat. A driller can also fill a helper's spot,
          but a helper can never drill.

   look, the parts kit (everything is optional except hat, hatTrim, skin, lens and frame):
     hat, hatTrim   hard hat colour and its ridge.   hatStyle: 'full' = brim all the way round, 'cowboy' = a western
                    hard hat with a tall crown and curled brim (default: front peak).
     hatFlag        'israel' = that flag as a sticker on the front of the hat.
     lamp: true     a headlamp on the front of the hat.   liner = colour of a winter liner under the hat.
     muffs          true = ear muffs clipped to the hat, swung up.   'down' = worn over the ears.   muffCol = their colour.
     skin, nose     face colours.   face: { w, len, jaw, nose } = face width, length, jaw width, nose size (1 = normal).
     hair           hair colour (leave out for bald).   hairStyle: 'curly' = curls showing below the hat,
                    'mullet' = long at the back, 'long' = down to the shoulders, 'braid' = a long braid over one shoulder, 'dreads' = short dreadlocks.   sideburns: true.
     tail: true     ponytail.
     glasses        'wrap' = mirrored wrap-around shades (default), 'clear' = clear safety glasses (eyes show),
                    'up' = shades pushed up onto the hat (eyes show),   hangGlasses: true = glasses on a cord at the chest,
                    'round' = round glasses, 'square' = chunky rectangular glasses, 'none' = no glasses (eyes show).
     lens, frame    the three colours of mirrored lenses, and the frame colour.   lensClear: true = see-through round glasses.   wire: true = thin wire rims.
     brow, browT    eyebrow colour and thickness (not seen behind wrap shades).   eye = eye colour.
                    eyeStyle: 'happy' = eyes squeezed shut in a laugh, 'wide' = wide open.   chain: true = a silver neck chain.
     stache         moustache colour.   stacheStyle: 'thin', 'medium' or 'horseshoe' (default: the big one).
                    stacheSize: above 1 = a thicker medium moustache.   stacheFlat: true = a thin one straight across.   stubble = stubble colour (stubbleA = how heavy, 0.2 light to 0.45 heavy).
     beard          beard colour.   beardStyle: 'full' = round the whole jaw (default: a goatee on the chin).
                    beardSize: above 1 = a bushier full beard.   cheeks = colour of rosy cheeks.
     smile: true    a grin with teeth (tongue: true = tongue out).   smile: 'closed' = lips pressed in a smile.   smirk: true = a lopsided closed mouth.
     moles          a list of moles, each [x, y, z, size] on the head.
     lines: true    an older face (crow's feet, bags under the eyes).   vest = colour of a hi-vis vest worn over the top.
     hood           colour of a hoodie worn under the coveralls (the hood hangs behind the neck).   shirt = colour of a shirt showing at the neck.
     plugs          colour of foam ear plugs.   glove = glove colour (default tan leather).
     build          0.9 slim to 1.2 stocky.   belly: true.   height: 1 = normal, 0.9 = short, 1.08 = tall (the head stays the same size).
   The name patch on the chest is filled in from the person's name.

   These are the real crew. Their looks are random stand-ins until each one is redone from reference pictures.
   The two helpers called Tyler go by their last names, Wareham and Habdas. There are two Jeremys: one is a driller
   and one is a helper, and the trade on the card tells them apart. */
window.ROSTER = (() => {
  const SUIT = 0x2c62b0, DARK = 0x1f4a8a;
  const P = (id, name, trade, look) => ({ id, name, trade, look: Object.assign({ suit: SUIT, suitDark: DARK, patch: name }, look) });
  return [
    // ---- drillers ----
    // Herb: done from reference pictures. Round mirrored glasses, thin moustache, tan skin, black curly hair,
    // a mud-grey full-brim hard hat with ear muffs swung up.
    P('herb', 'Herb', 'driller', { hat: 0x8a8f8c, hatTrim: 0x6a6f6c, hatStyle: 'full', muffs: true, skin: 0xcd9868, nose: 0xbf885a, hair: 0x14110f, hairStyle: 'curly',
      brow: 0x14110f, browT: 1.25, stache: 0x1a1512, stacheStyle: 'thin', stubble: 0x1a1512, smile: true, glasses: 'round', lens: ['#3550ff', '#7a3cff', '#c44cff'], frame: 0x17171a, build: 0.98 }),
    // Tristan: done from reference pictures and a video. Black wrap-around shades, a dark moustache and a smirk, tan skin,
    // a round face and a solid build, a dark grey full-brim hard hat with ear muffs swung up, a maroon shirt underneath.
    P('tristan', 'Tristan', 'driller', { hat: 0x5c6165, hatTrim: 0x44494d, hatStyle: 'full', muffs: true, skin: 0xc48a5e, nose: 0xb67c52, face: { w: 1.06, len: 0.98, jaw: 1.08, nose: 1.04 }, hair: 0x15110f,
      stache: 0x1a1512, stacheStyle: 'medium', stubble: 0x1a1512, smirk: true, shirt: 0x6e2338, lens: ['#101214', '#30353b', '#101214'], frame: 0x0e0f11, build: 1.1 }),
    // Kevin: done from reference pictures (both taken from a distance). A buzz cut, a short sandy beard and moustache,
    // black wrap-around shades, a dusty blue full-brim hard hat, very tall with a strong build, a teal shirt underneath.
    P('kevin', 'Kevin', 'driller', { hat: 0x6f8db3, hatTrim: 0x4f6a8c, hatStyle: 'full', skin: 0xe2b08a, nose: 0xd69f7a, face: { w: 1.03, len: 1.0, jaw: 1.06, nose: 1.02 }, hairStyle: 'bald',
      stache: 0x9a7448, stacheStyle: 'medium', beard: 0x9a7448, beardStyle: 'full', shirt: 0x2f8f86, lens: ['#15171a', '#3b4046', '#15171a'], frame: 0x101113, build: 1.12, height: 1.12 }),
    // Daniel: done from a reference picture. A cream full-brim hard hat, dark wavy hair out at the sides,
    // no glasses, clean shaven, dark eyes, a pressed-lips smile.
    P('daniel', 'Daniel', 'driller', { hat: 0xefe9d6, hatTrim: 0xcfc7aa, hatStyle: 'full', skin: 0xe6b48c, nose: 0xd9a37b, cheeks: 0xe59a86, face: { w: 1.05, len: 0.98, jaw: 1.06, nose: 1.05 }, hair: 0x17120f, hairStyle: 'curly',
      glasses: 'none', eye: 0x241a14, brow: 0x17120f, browT: 1.1, smile: 'closed', lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0xdfe8ee, build: 1.0 }),
    // Jeremy the driller: done from reference pictures. Thick dark eyebrows, brown eyes, no glasses, clean shaven with a
    // faint shadow, dark curly hair, a grin, an athletic build, a green full-brim hard hat.
    P('jeremy', 'Jeremy', 'driller', { hat: 0x3fae5a, hatTrim: 0x2e8a44, hatStyle: 'full', skin: 0xf2c9ae, nose: 0xe6b496, face: { w: 1.02, len: 1.0, jaw: 1.04, nose: 1.04 }, hair: 0x1f1712, hairStyle: 'curly',
      glasses: 'none', eye: 0x5a3a1c, brow: 0x1a130e, browT: 1.75, stubble: 0x2b2118, stubbleA: 0.16, smile: true, lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0xdfe8ee, build: 1.12, height: 1.03 }),
    // Kyler: done from a reference picture. Short and stocky, a big bushy dark beard, round face with rosy cheeks,
    // clear safety glasses, the same dark blue full-brim hard hat as Matthew.
    P('kyler', 'Kyler', 'driller', { hat: 0x4c5a70, hatTrim: 0x39455a, hatStyle: 'full', skin: 0xf2c3a6, nose: 0xe8ad90, cheeks: 0xe57f7f, face: { w: 1.08, len: 0.98, jaw: 1.12, nose: 1.06 }, hair: 0x5a3d26,
      glasses: 'clear', eye: 0x6f6a4a, brow: 0x5a3d26, browT: 1.15, stache: 0x4a3222, stacheStyle: 'medium', beard: 0x4a3222, beardStyle: 'full', beardSize: 1.12,
      lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0xdfe8ee, build: 1.2, belly: true, height: 0.9 }),
    // David: done from reference pictures. Black dreadlocks out below the hat, a short dark beard and moustache, big
    // rainbow-mirrored shield shades with a white frame, tan skin, a grey hoodie, a mud-grey hard hat with grey ear muffs swung up.
    P('david', 'David', 'driller', { hat: 0xa3a39c, hatTrim: 0x84847d, hatStyle: 'full', muffs: true, muffCol: 0x8d9296, skin: 0xc48f66, nose: 0xb68058, face: { w: 0.98, len: 1.03, jaw: 0.98, nose: 1.04 }, hair: 0x14110f, hairStyle: 'dreads',
      stache: 0x1c1512, stacheStyle: 'medium', beard: 0x1c1512, beardStyle: 'full', smile: true, hood: 0x9a968e, lens: ['#4fe08f', '#f4e36a', '#b867ff'], frame: 0xf4f4f4, build: 0.96, height: 1.02 }),
    // Leighton: done from reference pictures. A full ginger beard and horseshoe moustache, a big laugh with his eyes squeezed shut,
    // no glasses, a big build, a near-black full-brim hard hat, a silver chain.
    P('leighton', 'Leighton', 'driller', { hat: 0x2f3644, hatTrim: 0x222835, hatStyle: 'full', skin: 0xf0bfa0, nose: 0xe6a98a, cheeks: 0xe8847c, face: { w: 1.06, len: 1, jaw: 1.1, nose: 1.1 }, hair: 0x6b4a32,
      glasses: 'none', eyeStyle: 'happy', brow: 0x8a5a34, browT: 1.1, stache: 0x9a5a2c, stacheStyle: 'horseshoe', beard: 0x9a5a2c, beardStyle: 'full', smile: true, chain: true,
      lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0xdfe8ee, build: 1.15, belly: true }),
    // Zach: done from a reference picture. A big build, black wrap-around shades, a full dark beard and moustache,
    // red cheeks, an orange full-brim hard hat.
    P('zach', 'Zach', 'driller', { hat: 0xf07d1a, hatTrim: 0xc9610c, hatStyle: 'full', skin: 0xf0c2a2, nose: 0xe6a48c, cheeks: 0xe0625a, face: { w: 1.08, len: 1.0, jaw: 1.12, nose: 1.05 }, hair: 0x3a2a1c, sideburns: true,
      stache: 0x3a2a1c, stacheStyle: 'medium', stacheSize: 1.15, beard: 0x3a2a1c, beardStyle: 'full',
      lens: ['#0b0c0e', '#2c3037', '#0b0c0e'], frame: 0x0b0c0e, build: 1.2, belly: true }),
    // Jon: done from a picture taken from behind, plus a description: late fifties, bald, a salt-and-pepper beard. A navy
    // full-brim hard hat with a blue winter liner, an orange hi-vis vest, a brown hoodie, red gloves.
    P('jon', 'Jon', 'driller', { hat: 0x34425c, hatTrim: 0x263248, hatStyle: 'full', liner: 0x4f6e92, skin: 0xe6b898, nose: 0xd9a384, lines: true, face: { w: 1.02, len: 1.02, jaw: 1.04, nose: 1.08 }, hairStyle: 'bald',
      glasses: 'none', eye: 0x5f7080, brow: 0x8d8d88, browT: 1.2, stache: 0x8a8a85, stacheStyle: 'medium', beard: 0x6f6f6b, beardStyle: 'full', vest: 0xf07d1a, hood: 0x5a4336, glove: 0xc8362e,
      lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0xdfe8ee, build: 1.08 }),
    // ---- helpers ----
    // Wareham: done from a reference picture. Slim, with a long narrow face, thin gold wire-rimmed round glasses, wavy dark
    // brown hair to his jaw, a faint moustache and light stubble, a yellow full-brim hard hat.
    P('wareham', 'Wareham', 'helper', { hat: 0xf2c230, hatTrim: 0xd4a31c, hatStyle: 'full', skin: 0xeec4a2, nose: 0xe2b08c, face: { w: 0.94, len: 1.07, jaw: 0.92, nose: 1.05 }, hair: 0x3a2a1e, hairStyle: 'mullet',
      glasses: 'round', lensClear: true, wire: true, eye: 0x3a2a1c, brow: 0x3a2a1e, stache: 0x6b4f3a, stacheStyle: 'thin', stacheFlat: true, stubble: 0x3a2a1e, lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0xb89a5a, build: 0.9, height: 1.03 }),
    // Jeremy the helper: done from reference pictures. A big grin with his tongue out, wide dark eyes, black shades pushed
    // up on his hard hat, shaggy dark hair, clean shaven, a black hoodie, a slim build, a black full-brim hard hat.
    P('jeremy2', 'Jeremy', 'helper', { hat: 0x26272b, hatTrim: 0x3a3c41, hatStyle: 'full', skin: 0xd09a6c, nose: 0xc28a5e, face: { w: 1.0, len: 1.0, jaw: 0.98, nose: 1.04 }, hair: 0x17120f, hairStyle: 'curly',
      glasses: 'up', eye: 0x241a14, eyeStyle: 'wide', brow: 0x17120f, browT: 1.1, smile: true, tongue: true, hood: 0x1c1d20, lens: ['#101214', '#353a40', '#101214'], frame: 0x0e0f11, build: 0.94, height: 1.03 }),
    // Thomas: done from one reference picture. Pale skin with a reddish tone, a thick dark moustache and stubble, short dark
    // hair, clear safety glasses, a grey hoodie, a dark mud-caked full-brim hard hat with ear muffs swung up.
    P('thomas', 'Thomas', 'helper', { hat: 0x45463f, hatTrim: 0x33342e, hatStyle: 'full', muffs: true, skin: 0xf5d0bd, nose: 0xeea898, cheeks: 0xe2645e, face: { w: 1.02, len: 1.02, jaw: 1.04, nose: 1.02 }, hair: 0x2b2118,
      glasses: 'clear', eye: 0x4a3524, brow: 0x2b2118, browT: 1.15, stache: 0x2b2118, stacheStyle: 'medium', stacheSize: 1.45, stubble: 0x2b2118, hood: 0x7b8088,
      lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0xdfe8ee, build: 1.08 }),
    // Andrew: done from reference pictures. Dark smoked safety glasses, bright yellow-green ear plugs, a thin moustache and
    // stubble, sunburnt skin, short brown hair, a mud-khaki full-brim hard hat with a navy ridge, yellow hi-vis gloves.
    P('andrew', 'Andrew', 'helper', { hat: 0xb9aa7c, hatTrim: 0x2f3b55, hatStyle: 'full', skin: 0xe8b292, nose: 0xdc9078, cheeks: 0xdf6f5f, face: { w: 1.03, len: 1.0, jaw: 1.05, nose: 1.04 }, hair: 0x5a4030,
      stache: 0x7a5a3c, stacheStyle: 'thin', stubble: 0x5a4030, smirk: true, plugs: 0xd6f02a, glove: 0xd8e63a, lens: ['#33383e', '#5d646d', '#33383e'], frame: 0x15171a, build: 1.08 }),
    // Griffin: done from reference pictures (body from one, face from the other). A big build, a full sandy beard and
    // moustache with a wide grin, black shield shades with an orange frame, a sage green hoodie, a dark grey full-brim
    // hard hat with a headlamp.
    P('griffin', 'Griffin', 'helper', { hat: 0x5a5e5f, hatTrim: 0x44484a, hatStyle: 'full', lamp: true, skin: 0xf2c2a4, nose: 0xe6a88c, cheeks: 0xe57e72, face: { w: 1.06, len: 1.0, jaw: 1.1, nose: 1.04 }, hair: 0xa9834f,
      stache: 0xc79a5a, stacheStyle: 'medium', stacheSize: 1.15, beard: 0xb0864c, beardStyle: 'full', smile: true, hood: 0x8fae9e, lens: ['#101114', '#2e3238', '#101114'], frame: 0xf2632a, build: 1.2, belly: true, height: 1.02 }),
    // Matthew: done from reference pictures. Chin goatee and thin moustache, clear safety glasses, brown hair long at
    // the back, a dark blue full-brim hard hat, a grey hoodie under the coveralls.
    P('matthew', 'Matthew', 'helper', { hat: 0x4c5a70, hatTrim: 0x39455a, hatStyle: 'full', skin: 0xeec1a0, nose: 0xe2ad8b, face: { w: 0.98, len: 1.04, jaw: 0.96, nose: 0.9 }, hair: 0x5a3d26, hairStyle: 'mullet',
      glasses: 'clear', eye: 0x5f8097, brow: 0x5a3d26, stache: 0x6b4a30, stacheStyle: 'thin', beard: 0x6b4a30, stubble: 0x6b4a30, smirk: true, hood: 0x66707f, lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0xdfe8ee, build: 1.0 }),
    // Nazar: done from one black-and-white picture with the lower half of his face hidden. Shaved sides (nothing shows
    // below the hat), a mole low on the forehead and two by the ear, a calm closed smile, a red full-brim hard hat.
    // A little stubble. Colours and the hat are guesses.
    P('nazar', 'Nazar', 'helper', { hat: 0xd8362b, hatTrim: 0xa8261d, hatStyle: 'full', hatFlag: 'israel', skin: 0xf0c6a8, nose: 0xe4b092, face: { w: 0.99, len: 1.02, jaw: 0.98, nose: 1.0 }, hairStyle: 'bald',
      glasses: 'none', eye: 0x6a6a58, brow: 0x5a4632, browT: 1.05, stubble: 0x4a3a2a, stubbleA: 0.24, smile: 'closed', moles: [[0.03, 0.052, 0.157, 0.0075], [0.118, -0.03, 0.105, 0.0065], [0.128, 0.0, 0.088, 0.005]],
      lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0xdfe8ee, build: 0.98 }),
    // Habdas: done from reference pictures. Shaved head, full brown beard and moustache, round grey-framed glasses,
    // a mud-grey full-brim hard hat with the ear muffs down over his ears.
    P('habdas', 'Habdas', 'helper', { hat: 0x9a968a, hatTrim: 0x7c786d, hatStyle: 'full', muffs: 'down', muffCol: 0xb5ab93, skin: 0xf0c4a4, nose: 0xe6b08e, face: { w: 1, len: 1.02, jaw: 1.02, nose: 1.08 }, hairStyle: 'bald',
      glasses: 'round', lensClear: true, eye: 0x5a4028, brow: 0x4a3524, browT: 1.1, stache: 0x5a3f2a, stacheStyle: 'medium', beard: 0x5a3f2a, beardStyle: 'full', lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0x5c6670, build: 1.0 }),
    // Brett: done from reference pictures. Long brown hair to the shoulders, a thin moustache and light stubble, chunky
    // clear-framed glasses, blue-grey eyes, a closed smile, a black full-brim hard hat with a headlamp.
    P('brett', 'Brett', 'helper', { hat: 0x202124, hatTrim: 0x34363b, hatStyle: 'full', lamp: true, skin: 0xf2c8ac, nose: 0xe8b294, face: { w: 1.0, len: 1.02, jaw: 1.0, nose: 1.0 }, hair: 0x6b4a30, hairStyle: 'long',
      glasses: 'square', eye: 0x6a8496, brow: 0x5a3d26, stache: 0x5a3d26, stacheStyle: 'thin', stubble: 0x5a3d26, smile: 'closed', shirt: 0x9aa0a6, lens: ['#ffffff', '#ffffff', '#ffffff'], frame: 0xcfd8dd, build: 0.98 }),
  ];
})();
// who is on the crew before the player has picked: the first driller, and the first two people who are not drilling
window.ROSTER.defaults = () => {
  const R = window.ROSTER, d = R.find(p => p.trade === 'driller') || R[0];
  const rest = R.filter(p => p !== d), help = rest.filter(p => p.trade === 'helper').concat(rest.filter(p => p.trade !== 'helper'));
  return { driller: d.id, lead: help[0].id, core: help[1].id };
};
