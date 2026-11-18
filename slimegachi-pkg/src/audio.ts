/**
 * SLIMEgachi — audio. Everything is synthesized live with the Web Audio API;
 * there are no audio asset files.
 */

declare global {
  interface Window { webkitAudioContext?: typeof AudioContext; }
}

export type SfxName =
  | 'feed' | 'clean' | 'sleep' | 'coin' | 'achievement' | 'levelup'
  | 'pop' | 'catch' | 'golden' | 'miss' | 'gameover' | 'click';

interface ToneOpts {
  f0: number;
  f1?: number;
  dur?: number;
  gain?: number;
  delay?: number;
  type?: OscillatorType;
}
interface ArpOpts extends Omit<ToneOpts, 'f0'> { stagger?: number; }
interface NoteOpts { type?: OscillatorType; dur?: number; gain?: number; atk?: number; }

type ChordQuality = 'maj' | 'min' | 'sus' | 'dom';
interface Theme {
  bpm: number;
  /** Tonic in Hz, around octave 3. */
  root: number;
  waves: { bass: OscillatorType; arp: OscillatorType; lead: OscillatorType };
  /** r = semitone offset of the chord root, q = quality. */
  prog: { r: number; q: ChordQuality }[];
  arpOct: number;
  /** 0–1 chance of an arp note on each step. */
  density: number;
}
export type MusicView = 'shelf' | 'care' | 'minigame';

/* ===================================================================
   AudioCore — one shared Web Audio context for the whole widget.
   Created lazily and resumed on the first user gesture (autoplay
   policy). Two gain buses hang off the master so SFX and music can be
   levelled / muted / ducked independently:
      destination ← master ← sfxBus   (one-shot cues)
                            ← musicBus (looping background tracks)
   Everything degrades silently to "no audio" if the context is blocked.
   =================================================================== */
export const AudioCore = (function () {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null, sfxBus: GainNode | null = null, musicBus: GainNode | null = null;
  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.25; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.0001; musicBus.connect(master);
    } catch (e) { ctx = null; }
    return ctx;
  }
  function resume() { try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) {} }
  return {
    ensure: ensure, resume: resume,
    get ctx() { return ctx; },
    get sfx() { return sfxBus; },
    get music() { return musicBus; }
  };
})();

/* ===================================================================
   Sound — synthesized chiptune SFX. Zero asset files: every cue is
   built from oscillators on the fly, routed through AudioCore.sfx.
   Mute is a global device-level pref in localStorage (independent of
   the per-account storage adapter, and of the music mute).
   =================================================================== */
export const Sound = (function () {
  const MUTE_KEY = 'slimegachi:muted';
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

  function ensureCtx() { return AudioCore.ensure(); }
  function resume() { AudioCore.resume(); }

  /* One enveloped oscillator note. Exponential ramps can't hit 0, so we
     floor at 0.0001 and treat that as silence. */
  function tone(o: ToneOpts) {
    const c = AudioCore.ensure();
    if (!c || !AudioCore.sfx) return;
    const t0 = c.currentTime + (o.delay || 0);
    const dur = o.dur || 0.12;
    const peak = o.gain != null ? o.gain : 0.5;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(AudioCore.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }
  /* A staggered arpeggio of `tone`s. */
  function arp(freqs: number[], o: ArpOpts = {}) {
    const stagger = o.stagger != null ? o.stagger : 0.07;
    freqs.forEach((f, i) => tone(Object.assign({}, o, { f0: f, delay: (o.delay || 0) + i * stagger })));
  }

  /* Named cues. Kept short and bright — this is a toy pet, not a DAW. */
  const FX: Record<SfxName, () => void> = {
    feed:    () => { tone({ type: 'triangle', f0: 520, f1: 760, dur: 0.11, gain: 0.45 });
                     tone({ type: 'triangle', f0: 700, f1: 940, dur: 0.10, gain: 0.4, delay: 0.10 }); },
    clean:   () => { tone({ type: 'sine', f0: 900, f1: 1750, dur: 0.24, gain: 0.32 }); },     // sparkle sweep
    sleep:   () => { tone({ type: 'sine', f0: 420, f1: 180, dur: 0.55, gain: 0.3 }); },        // descending yawn
    coin:    () => { tone({ type: 'square', f0: 880, dur: 0.05, gain: 0.28 });
                     tone({ type: 'square', f0: 1320, dur: 0.10, gain: 0.28, delay: 0.05 }); },
    achievement: () => arp([523, 659, 784, 1047], { type: 'triangle', dur: 0.26, gain: 0.3, stagger: 0.075 }),
    levelup: () => { arp([523, 659, 784], { type: 'square', dur: 0.16, gain: 0.28, stagger: 0.08 });
                     tone({ type: 'square', f0: 1047, dur: 0.32, gain: 0.3, delay: 0.24 }); },
    pop:     () => tone({ type: 'sine', f0: 660, f1: 1180, dur: 0.07, gain: 0.3 }),
    catch:   () => tone({ type: 'triangle', f0: 600, f1: 900, dur: 0.08, gain: 0.32 }),
    golden:  () => { tone({ type: 'square', f0: 988, dur: 0.05, gain: 0.3 });
                     tone({ type: 'square', f0: 1319, dur: 0.12, gain: 0.3, delay: 0.05 }); },
    miss:    () => tone({ type: 'sawtooth', f0: 200, f1: 80, dur: 0.18, gain: 0.28 }),
    gameover:() => arp([392, 330, 262], { type: 'triangle', dur: 0.22, gain: 0.3, stagger: 0.12 }),
    click:   () => tone({ type: 'square', f0: 320, dur: 0.03, gain: 0.16 })
  };

  function play(name: SfxName) {
    if (muted) return;
    const fn = FX[name];
    if (!fn) return;
    try { resume(); fn(); } catch (e) {}
  }
  function isMuted() { return muted; }
  function setMuted(m: boolean) {
    muted = !!m;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    if (!muted) { ensureCtx(); resume(); }   // warm up so the next cue is instant
  }
  function toggle() { setMuted(!muted); return muted; }

  return { play, toggle, isMuted, setMuted, ensureCtx, resume };
})();

/* ===================================================================
   Music — procedural chiptune background loops, one per scene.
   A lookahead step-sequencer (Web Audio clock) schedules notes ahead
   of time on AudioCore.music. Each theme is a tiny spec — tempo, tonic,
   a 4-chord progression, and per-voice waveforms — from which bass /
   arp / lead lines are generated on the fly. No audio files, no stored
   melodies. Scene changes crossfade (duck → swap → rise). Music has its
   own mute pref, separate from SFX.

   Scenes: shelf · care_<Pet> (per pet) · minigame_<game> (per game).
   =================================================================== */
export const Music = (function () {
  const MUTE_KEY = 'slimegachi:music-muted';
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

  const LOOKAHEAD = 0.12;   // seconds of notes scheduled ahead of the clock
  const TICK = 25;          // ms between scheduler wake-ups
  const STEPS = 16;         // eighth-notes per loop (2 bars of 4/4)
  const ACTIVE_GAIN = 0.32; // music bus level while playing (sits well under SFX)

  const QUAL: Record<ChordQuality, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], sus: [0, 5, 7], dom: [0, 4, 7, 10] };

  /* Each theme: bpm, root (tonic Hz, ~octave 3), per-voice waveforms,
     a 4-chord progression (r = semitone offset of chord root, q = quality),
     arpOct (octave lift for the arpeggio), density (0–1 arp note chance). */
  const THEMES: Record<string, Theme> = {
    shelf: {
      bpm: 92, root: 130.81, waves: { bass: 'triangle', arp: 'triangle', lead: 'sine' },
      prog: [{ r: 0, q: 'maj' }, { r: 5, q: 'maj' }, { r: 9, q: 'min' }, { r: 7, q: 'maj' }],
      arpOct: 2, density: 0.7
    },
    care_Kitten: {
      bpm: 104, root: 146.83, waves: { bass: 'triangle', arp: 'square', lead: 'sine' },
      prog: [{ r: 0, q: 'maj' }, { r: 7, q: 'maj' }, { r: 9, q: 'min' }, { r: 5, q: 'maj' }],
      arpOct: 2, density: 0.85
    },
    care_Monkey: {
      bpm: 116, root: 130.81, waves: { bass: 'square', arp: 'square', lead: 'square' },
      prog: [{ r: 0, q: 'min' }, { r: 5, q: 'min' }, { r: 8, q: 'maj' }, { r: 7, q: 'maj' }],
      arpOct: 2, density: 1.0
    },
    care_Owl: {
      bpm: 78, root: 116.54, waves: { bass: 'sine', arp: 'triangle', lead: 'sine' },
      prog: [{ r: 0, q: 'maj' }, { r: 9, q: 'min' }, { r: 5, q: 'maj' }, { r: 7, q: 'maj' }],
      arpOct: 2, density: 0.55
    },
    care_Dragon: {
      bpm: 86, root: 98.0, waves: { bass: 'sawtooth', arp: 'square', lead: 'square' },
      prog: [{ r: 0, q: 'min' }, { r: 8, q: 'maj' }, { r: 3, q: 'maj' }, { r: 7, q: 'maj' }],
      arpOct: 2, density: 0.7
    },
    minigame_bubblepop: {
      bpm: 130, root: 164.81, waves: { bass: 'square', arp: 'square', lead: 'square' },
      prog: [{ r: 0, q: 'maj' }, { r: 7, q: 'maj' }, { r: 5, q: 'maj' }, { r: 7, q: 'dom' }],
      arpOct: 2, density: 1.0
    },
    minigame_bananacatch: {
      bpm: 138, root: 146.83, waves: { bass: 'square', arp: 'square', lead: 'square' },
      prog: [{ r: 0, q: 'min' }, { r: 5, q: 'min' }, { r: 3, q: 'maj' }, { r: 7, q: 'maj' }],
      arpOct: 2, density: 1.0
    }
  };

  let timer: ReturnType<typeof setInterval> | null = null, step = 0, nextTime = 0;
  let current: Theme | null = null, currentKey: string | null = null, swapToken = 0;

  function hz(base: number, semi: number) { return base * Math.pow(2, semi / 12); }
  function stepDur(th: Theme) { return (60 / th.bpm) / 2; }

  /* A single sustained music note on the music bus. */
  function mnote(freq: number, t: number, o: NoteOpts) {
    const c = AudioCore.ctx;
    if (!c || !AudioCore.music) return;
    const dur = o.dur || 0.25;
    const peak = o.gain != null ? o.gain : 0.18;
    const atk = o.atk != null ? o.atk : 0.012;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(AudioCore.music);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /* Generate + schedule one step. Chord changes every 4 steps (1 beat). */
  function playStep(th: Theme, s: number, t: number) {
    const chord = th.prog[Math.floor(s / 4) % th.prog.length];
    const triad = QUAL[chord.q];
    const base = chord.r;
    const sd = stepDur(th);

    // Bass: root on the beat, a fifth as a passing note halfway through.
    if (s % 4 === 0) {
      mnote(hz(th.root, base - 12), t, { type: th.waves.bass, dur: sd * 3.4, gain: 0.26, atk: 0.02 });
    } else if (s % 4 === 2) {
      mnote(hz(th.root, base - 12 + 7), t, { type: th.waves.bass, dur: sd * 1.4, gain: 0.15 });
    }

    // Arp: walk the chord tones, one per step, lifted an octave or two.
    if (Math.random() < th.density) {
      const tone = triad[s % triad.length];
      mnote(hz(th.root, base + tone + 12 * th.arpOct), t, { type: th.waves.arp, dur: sd * 0.9, gain: 0.12, atk: 0.006 });
    }

    // Lead: sparse high motif on bar downbeats so a melody peeks through.
    if (s === 0) {
      mnote(hz(th.root, base + triad[0] + 12 * (th.arpOct + 1)), t, { type: th.waves.lead, dur: sd * 2.5, gain: 0.1, atk: 0.02 });
    } else if (s === 10) {
      mnote(hz(th.root, base + triad[Math.min(2, triad.length - 1)] + 12 * th.arpOct), t, { type: th.waves.lead, dur: sd * 1.6, gain: 0.09, atk: 0.02 });
    }
  }

  function scheduler() {
    const c = AudioCore.ctx;
    if (!c || !current) return;
    while (nextTime < c.currentTime + LOOKAHEAD) {
      playStep(current, step, nextTime);
      nextTime += stepDur(current);
      step = (step + 1) % STEPS;
    }
  }

  function ensureRunning() {
    if (timer) return;
    const c = AudioCore.ensure();
    if (!c) return;
    AudioCore.resume();
    nextTime = c.currentTime + 0.06;
    timer = setInterval(scheduler, TICK);
  }
  function stopRunning() { if (timer) { clearInterval(timer); timer = null; } }

  function fadeBus(target: number, dur: number) {
    const c = AudioCore.ctx;
    if (!c || !AudioCore.music) return;
    const g = AudioCore.music.gain;
    const t = c.currentTime;
    const from = Math.max(0.0001, g.value);
    g.cancelScheduledValues(t);
    g.setValueAtTime(from, t);
    g.exponentialRampToValueAtTime(Math.max(0.0001, target), t + dur);
  }

  /* Switch background track. view ∈ shelf|care|minigame; variant is the
     pet type (care) or game id (minigame). No-op if already on it. */
  function setScene(view: MusicView, variant?: string) {
    let key: string;
    if (view === 'shelf') key = 'shelf';
    else if (view === 'minigame') key = THEMES['minigame_' + variant] ? 'minigame_' + variant : 'minigame_bubblepop';
    else key = THEMES['care_' + variant] ? 'care_' + variant : 'care_Kitten';

    if (key === currentKey && current) { if (!muted) ensureRunning(); return; }
    currentKey = key;
    const theme = THEMES[key];
    const my = ++swapToken;

    if (muted) { current = theme; step = 0; return; }   // stage; starts on unmute

    ensureRunning();
    if (!current) {                                      // first start: fade in
      current = theme; step = 0;
      const c = AudioCore.ctx;
      if (c) nextTime = c.currentTime + 0.06;
      fadeBus(ACTIVE_GAIN, 0.6);
      return;
    }
    fadeBus(0.0001, 0.3);                                // crossfade: duck…
    setTimeout(function () {
      if (my !== swapToken) return;                     // newer scene change won
      current = theme; step = 0;
      const c = AudioCore.ctx;
      if (c) nextTime = c.currentTime + 0.04;
      fadeBus(ACTIVE_GAIN, 0.5);                         // …swap + rise
    }, 320);
  }

  function setMuted(m: boolean) {
    muted = !!m;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    if (muted) {
      fadeBus(0.0001, 0.3);
      setTimeout(function () { if (muted) stopRunning(); }, 340);
    } else {
      AudioCore.ensure(); AudioCore.resume();
      if (current) { ensureRunning(); fadeBus(ACTIVE_GAIN, 0.5); }
    }
  }
  function isMuted() { return muted; }
  function toggle() { setMuted(!muted); return muted; }

  return { setScene, setMuted, isMuted, toggle };
})();
