// Sound cues. Success/failure are synthesized (no files). The dice roll uses an
// audio file at public/dice.mp3 so we can match the on-screen roll animation to
// its length. If you swap the file, update DICE_MS to its duration in ms.
let ctx = null;
let muted = false;

// Length of dice.mp3 in ms. The roll animation (point-crawl AND downtime) is
// pinned to this so the die settles exactly when the sound ends.
export const DICE_MS = 6700;

export function setMuted(m) {
  muted = m;
  if (m) stopDice();
}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = "sine", gain = 0.18) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g); g.connect(c.destination);
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.03);
}

// ---- dice roll (audio file) ----
let diceAudio = null;
function diceEl() {
  if (!diceAudio) {
    diceAudio = new Audio("/dice.mp3");
    diceAudio.preload = "auto";
  }
  return diceAudio;
}
export function playDice() {
  if (muted) return;
  try {
    const a = diceEl();
    a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  } catch { /* ignore */ }
}
export function stopDice() {
  try { if (diceAudio) { diceAudio.pause(); diceAudio.currentTime = 0; } } catch { /* ignore */ }
}

// kept for compatibility; the dice roll now uses playDice()
export function playRattle() { playDice(); }

export function playSuccess() {
  if (muted) return;
  tone(523, 0, 0.12, "sine", 0.16);
  tone(659, 0.1, 0.14, "sine", 0.16);
  tone(784, 0.22, 0.24, "sine", 0.16);
}
export function playFailure() {
  if (muted) return;
  tone(190, 0, 0.18, "sawtooth", 0.16);
  tone(95, 0.12, 0.32, "sawtooth", 0.15);
}

// Bright rising chime for a natural 20 (ship combat crit).
export function playChime() {
  if (muted) return;
  tone(784, 0, 0.12, "triangle", 0.16);
  tone(1047, 0.09, 0.16, "triangle", 0.16);
  tone(1568, 0.2, 0.5, "triangle", 0.13);
}
// Low dull thud for a natural 1 (ship combat fumble).
export function playThud() {
  if (muted) return;
  tone(110, 0, 0.16, "sine", 0.2);
  tone(70, 0.05, 0.34, "sine", 0.18);
}
// Mechanical power-down when a vehicle system is knocked out.
export function playDisable() {
  if (muted) return;
  tone(330, 0, 0.14, "sawtooth", 0.14);
  tone(220, 0.12, 0.18, "sawtooth", 0.13);
  tone(140, 0.28, 0.3, "sawtooth", 0.12);
}
