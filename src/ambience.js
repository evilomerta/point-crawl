// Subtle synthesized ambience for the main dash: a breathing sea under clear
// skies, granular rain (a pink-noise gust bed plus individually scheduled
// droplets), a low tempest floor, and thunder rolls under the lightning.
// Everything sits under a quiet master (~5.5%) so it never fights the voice
// call. Audio wakes on the first pointer input (autoplay rules) and fades in.

let AC = null, master = null, calmG = null, rainBedG = null, rumbG = null, thunderBus = null;
let pinkBuf = null, brownBuf = null, whiteBuf = null, dropBuf = null;
let soundOn = true, dropRate = 0, lastWeather = 0;

function fillPink(d) {
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + 0.029591 * w;
    b1 = 0.985 * b1 + 0.032534 * w;
    b2 = 0.95 * b2 + 0.048056 * w;
    d[i] = (b0 + b1 + b2 + w * 0.05) * 2.0;
  }
}
function fillBrown(d) {
  let v = 0;
  for (let i = 0; i < d.length; i++) {
    v = (v + (Math.random() * 2 - 1) * 0.02) * 0.996;
    d[i] = v * 3.5;
  }
}
function fillWhite(d) { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
function makeBuf(sec, fill) {
  const buf = AC.createBuffer(1, Math.floor(AC.sampleRate * sec), AC.sampleRate);
  fill(buf.getChannelData(0));
  return buf;
}
function loopSrc(buf, rate) {
  const s = AC.createBufferSource();
  s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
  s.start(0, Math.random() * buf.duration);
  return s;
}

export function initAmbience() {
  if (AC) { if (AC.state === "suspended") AC.resume(); return; }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  AC = new Ctor();
  master = AC.createGain();
  master.gain.value = 0;
  master.connect(AC.destination);
  if (soundOn) master.gain.setTargetAtTime(0.055, AC.currentTime + 0.1, 0.7);
  pinkBuf = makeBuf(8, fillPink);
  brownBuf = makeBuf(8, fillBrown);
  whiteBuf = makeBuf(8, fillWhite);
  dropBuf = makeBuf(0.2, fillWhite);
  // the sea, breathing
  const seaF = AC.createBiquadFilter(); seaF.type = "lowpass"; seaF.frequency.value = 360; seaF.Q.value = 0.6;
  calmG = AC.createGain(); calmG.gain.value = 0.5;
  loopSrc(whiteBuf, 1).connect(seaF).connect(calmG).connect(master);
  const lfo = AC.createOscillator(); lfo.frequency.value = 0.07;
  const lfoG = AC.createGain(); lfoG.gain.value = 140;
  lfo.connect(lfoG).connect(seaF.frequency);
  lfo.start();
  // the rain bed: a pink wash with wandering gusts, never a steady hiss
  const rHp = AC.createBiquadFilter(); rHp.type = "highpass"; rHp.frequency.value = 480;
  const rLp = AC.createBiquadFilter(); rLp.type = "lowpass"; rLp.frequency.value = 4200;
  const gust = AC.createGain(); gust.gain.value = 1;
  rainBedG = AC.createGain(); rainBedG.gain.value = 0;
  loopSrc(pinkBuf, 1).connect(rHp).connect(rLp).connect(gust).connect(rainBedG).connect(master);
  const g1 = AC.createOscillator(); g1.frequency.value = 0.13;
  const g1g = AC.createGain(); g1g.gain.value = 0.22;
  g1.connect(g1g).connect(gust.gain); g1.start();
  const g2 = AC.createOscillator(); g2.frequency.value = 0.071;
  const g2g = AC.createGain(); g2g.gain.value = 0.16;
  g2.connect(g2g).connect(gust.gain); g2.start();
  const g3 = AC.createOscillator(); g3.frequency.value = 0.047;
  const g3g = AC.createGain(); g3g.gain.value = 520;
  g3.connect(g3g).connect(rLp.frequency); g3.start();
  // the storm's low floor
  const rf = AC.createBiquadFilter(); rf.type = "lowpass"; rf.frequency.value = 110;
  rumbG = AC.createGain(); rumbG.gain.value = 0;
  loopSrc(brownBuf, 0.6).connect(rf).connect(rumbG).connect(master);
  thunderBus = AC.createGain(); thunderBus.gain.value = 1;
  thunderBus.connect(master);
  // individual raindrops, scheduled forever
  setInterval(() => {
    if (!soundOn || dropRate <= 0 || AC.state !== "running") return;
    const expect = dropRate * 0.05;
    let n = Math.floor(expect) + (Math.random() < expect % 1 ? 1 : 0);
    while (n-- > 0) drop();
  }, 50);
  setWeatherSound(lastWeather);
}

function drop() {
  const t0 = AC.currentTime + Math.random() * 0.05;
  const s = AC.createBufferSource(); s.buffer = dropBuf; s.playbackRate.value = 0.8 + Math.random() * 0.9;
  const f = AC.createBiquadFilter(); f.type = "bandpass";
  f.frequency.value = 700 + Math.random() * 3600;
  f.Q.value = 5 + Math.random() * 9;
  const g = AC.createGain();
  const peak = 0.04 + Math.random() * 0.17;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025 + Math.random() * 0.08);
  let tail = g;
  if (AC.createStereoPanner) {
    const p = AC.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    g.connect(p);
    tail = p;
  }
  s.connect(f).connect(g);
  tail.connect(master);
  s.start(t0);
  s.stop(t0 + 0.18);
}

function ramp(g, v) { if (!AC || !g) return; g.gain.cancelScheduledValues(AC.currentTime); g.gain.setTargetAtTime(v, AC.currentTime, 1.2); }

export function setWeatherSound(s) {
  lastWeather = s;
  dropRate = s === 0 ? 0 : s === 1 ? 26 : 72;
  if (!AC) return;
  ramp(calmG, s === 0 ? 0.5 : 0.28);
  ramp(rainBedG, s === 0 ? 0 : s === 1 ? 0.22 : 0.4);
  ramp(rumbG, s === 2 ? 0.3 : 0);
}

export function setAmbienceMuted(m) {
  soundOn = !m;
  if (!AC || !master) return;
  master.gain.cancelScheduledValues(AC.currentTime);
  master.gain.setTargetAtTime(soundOn ? 0.055 : 0, AC.currentTime, 0.4);
}

export function thunderSoon() {
  if (!AC || !soundOn) return;
  setTimeout(() => {
    if (!AC) return;
    const t0 = AC.currentTime;
    // the crack, so small speakers hear it land
    const c = AC.createBufferSource(); c.buffer = dropBuf; c.playbackRate.value = 0.5;
    const cf = AC.createBiquadFilter(); cf.type = "bandpass"; cf.frequency.value = 950; cf.Q.value = 0.9;
    const cg = AC.createGain();
    cg.gain.setValueAtTime(0.0001, t0);
    cg.gain.exponentialRampToValueAtTime(0.85, t0 + 0.02);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    c.connect(cf).connect(cg).connect(thunderBus);
    c.start(t0);
    c.stop(t0 + 0.4);
    // the roll, in two swells
    const b = AC.createBufferSource(); b.buffer = brownBuf; b.playbackRate.value = 0.28 + Math.random() * 0.14;
    const f = AC.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(240, t0);
    f.frequency.exponentialRampToValueAtTime(50, t0 + 3.6);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(1.15, t0 + 0.14);
    g.gain.exponentialRampToValueAtTime(0.3, t0 + 1.1);
    g.gain.exponentialRampToValueAtTime(0.62, t0 + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.0);
    b.connect(f).connect(g).connect(thunderBus);
    b.start(t0);
    b.stop(t0 + 4.2);
  }, 150 + Math.random() * 600);
}
