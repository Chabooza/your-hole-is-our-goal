'use strict';
/* Sonic Driller: synthesized rig sounds (no audio files). The sonic hum plays at the head's real frequency. */
window.AUDIO = (() => {
  let ctx = null, master = null, muted = false, vol = 1;
  let eng, eng2, engF, engG, son, son2, sonG, ratG, ratF, pumpG, pumpF, alarmG, alarmO, hornG, hornO1, hornO2;
  let alarmPhase = 0, hornT = 0;

  function noiseBuffer() {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function noiseSrc() { const n = ctx.createBufferSource(); n.buffer = noiseBuffer(); n.loop = true; n.start(); return n; }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55 * vol; master.connect(ctx.destination);
    // diesel engine
    eng = ctx.createOscillator(); eng.type = 'sawtooth';
    eng2 = ctx.createOscillator(); eng2.type = 'square';
    engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 250; engF.Q.value = 3;
    engG = ctx.createGain(); engG.gain.value = 0;
    const e2g = ctx.createGain(); e2g.gain.value = 0.35;
    eng.connect(engF); eng2.connect(e2g); e2g.connect(engF); engF.connect(engG); engG.connect(master);
    eng.start(); eng2.start();
    // sonic head hum at the real head frequency
    son = ctx.createOscillator(); son.type = 'sine';
    son2 = ctx.createOscillator(); son2.type = 'triangle';
    sonG = ctx.createGain(); sonG.gain.value = 0;
    const s2g = ctx.createGain(); s2g.gain.value = 0.4;
    son.connect(sonG); son2.connect(s2g); s2g.connect(sonG); sonG.connect(master);
    son.start(); son2.start();
    // chatter when off resonance
    const n1 = noiseSrc();
    ratF = ctx.createBiquadFilter(); ratF.type = 'bandpass'; ratF.frequency.value = 500; ratF.Q.value = 1.5;
    ratG = ctx.createGain(); ratG.gain.value = 0;
    n1.connect(ratF); ratF.connect(ratG); ratG.connect(master);
    // pump whine
    const n2 = noiseSrc();
    pumpF = ctx.createBiquadFilter(); pumpF.type = 'bandpass'; pumpF.frequency.value = 1400; pumpF.Q.value = 4;
    pumpG = ctx.createGain(); pumpG.gain.value = 0;
    n2.connect(pumpF); pumpF.connect(pumpG); pumpG.connect(master);
    // alarm beeper
    alarmO = ctx.createOscillator(); alarmO.type = 'square'; alarmO.frequency.value = 1150;
    alarmG = ctx.createGain(); alarmG.gain.value = 0;
    alarmO.connect(alarmG); alarmG.connect(master); alarmO.start();
    // horn
    hornO1 = ctx.createOscillator(); hornO1.type = 'sawtooth'; hornO1.frequency.value = 311;
    hornO2 = ctx.createOscillator(); hornO2.type = 'sawtooth'; hornO2.frequency.value = 392;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1600;
    hornG = ctx.createGain(); hornG.gain.value = 0;
    hornO1.connect(hf); hornO2.connect(hf); hf.connect(hornG); hornG.connect(master);
    hornO1.start(); hornO2.start();
  }

  function burst(freq, dur, gain, type) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer();
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + dur + 0.05);
  }
  function blip(freq, dur, gain) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  function sfx(name) {
    switch (name) {
      case 'clank': burst(2400, 0.25, 0.5); burst(700, 0.18, 0.4); break;
      case 'clamp': burst(900, 0.3, 0.6, 'lowpass'); break;
      case 'switch': burst(3500, 0.05, 0.4); break;
      case 'crank': burst(180, 1.2, 0.5, 'lowpass'); break;
      case 'burst': burst(1800, 1.4, 0.8, 'highpass'); break;
      case 'ok': blip(880, 0.12, 0.15); break;
      case 'done': blip(660, 0.12, 0.15); setTimeout(() => blip(990, 0.16, 0.15), 120); break;
      case 'alarm': blip(1200, 0.2, 0.2); setTimeout(() => blip(900, 0.25, 0.2), 200); break;
      case 'horn': hornT = 0.6; break;
      case 'lighter': burst(5200, 0.04, 0.5, 'highpass'); setTimeout(() => burst(520, 0.4, 0.22, 'lowpass'), 110); break;
      case 'stub': burst(1400, 0.12, 0.25, 'lowpass'); break;
      case 'pour': burst(2600 + Math.random() * 900, 0.24, 0.11); break;
      case 'whoosh': burst(1500, 0.32, 0.35, 'highpass'); break;
      case 'splat': burst(420, 0.3, 0.7, 'lowpass'); burst(1300, 0.12, 0.35); break;
      case 'thud': burst(180, 0.25, 0.7, 'lowpass'); break;
      case 'laugh': for (let i = 0; i < 4; i++) setTimeout(() => { blip(300 - i * 18, 0.11, 0.16); burst(950 - i * 40, 0.09, 0.18); }, i * 165); break;
      case 'cough': burst(150, 0.7, 0.7, 'lowpass'); for (let i = 0; i < 4; i++) setTimeout(() => blip(260 - i * 45, 0.16, 0.2), i * 150); break;
      case 'knock': blip(170, 0.09, 0.3); burst(650, 0.06, 0.45, 'lowpass'); break;
      case 'slap': burst(2100, 0.07, 0.8); burst(520, 0.11, 0.45, 'lowpass'); break;
      case 'yell': burst(320, 0.28, 0.55, 'lowpass'); blip(150, 0.3, 0.16); setTimeout(() => blip(120, 0.22, 0.14), 160); break;
    }
  }

  function update(S, dt) {
    if (!ctx) return;
    const t = ctx.currentTime, k = 0.06;
    const rpm = S.engine.rpm;
    const fire = Math.max(1, rpm / 60 * 2);
    eng.frequency.setTargetAtTime(fire, t, k);
    eng2.frequency.setTargetAtTime(fire * 0.5, t, k);
    engF.frequency.setTargetAtTime(160 + rpm * 0.25 + S.engine.load * 300, t, k);
    engG.gain.setTargetAtTime(rpm > 50 ? 0.16 + S.engine.load * 0.12 : 0, t, 0.1);
    const hz = S.head.hz;
    son.frequency.setTargetAtTime(Math.max(20, hz), t, 0.03);
    son2.frequency.setTargetAtTime(Math.max(20, hz * 2), t, 0.03);
    sonG.gain.setTargetAtTime(hz > 5 ? 0.12 + 0.18 * S.res : 0, t, 0.05);
    ratF.frequency.setTargetAtTime(300 + hz * 4, t, 0.05);
    ratG.gain.setTargetAtTime(Math.min(0.35, S.shake * 0.35), t, 0.05);
    pumpF.frequency.setTargetAtTime(900 + S.water.flow * 40, t, 0.1);
    pumpG.gain.setTargetAtTime(S.water.flow > 0.5 ? 0.04 + S.water.flow * 0.002 : 0, t, 0.1);
    const crit = S.alarms.some(a => a[0] === 'crit') && !S.paused && !S.done;
    alarmPhase += dt;
    alarmG.gain.setTargetAtTime(crit && (alarmPhase % 1.2) < 0.18 ? 0.05 : 0, t, 0.01);
    if (hornT > 0) hornT -= dt;
    hornG.gain.setTargetAtTime(hornT > 0 ? 0.18 : 0, t, 0.02);
    while (S.sfx.length) sfx(S.sfx.shift());
  }

  function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.55 * vol, ctx.currentTime, 0.05); }
  function setVolume(v) { vol = v; if (master && !muted) master.gain.setTargetAtTime(0.55 * vol, ctx.currentTime, 0.05); }
  function pause(p) { if (!ctx) return; if (p) ctx.suspend(); else ctx.resume(); }
  return { init, update, setMuted, setVolume, isMuted: () => muted, pause, ready: () => !!ctx };
})();
