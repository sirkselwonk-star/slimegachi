/**
 * SLIMEgachi widget — vanilla JS, zero dependencies.
 *
 * Usage:
 *   const game = SLIMEgachi.mount(container, options);
 *
 * See README.md for the full options/events contract.
 *
 * Browser support: any browser with ES2019 features (Safari 13+, Chrome 75+, Firefox 70+).
 */
(function (global) {
  'use strict';

  /* ===================================================================
     Embedded pet art (data URIs). Override via options.petArt.
     This block is replaced at build time by build.js.
     =================================================================== */
  const EMBEDDED_PET_ART = /*__EMBEDDED_PET_ART__*/ {};

  /* ===================================================================
     AudioCore — one shared Web Audio context for the whole widget.
     Created lazily and resumed on the first user gesture (autoplay
     policy). Two gain buses hang off the master so SFX and music can be
     levelled / muted / ducked independently:
        destination ← master ← sfxBus   (one-shot cues)
                              ← musicBus (looping background tracks)
     Everything degrades silently to "no audio" if the context is blocked.
     =================================================================== */
  const AudioCore = (function () {
    let ctx = null, master = null, sfxBus = null, musicBus = null;
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
  const Sound = (function () {
    const MUTE_KEY = 'slimegachi:muted';
    let muted = false;
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

    function ensureCtx() { return AudioCore.ensure(); }
    function resume() { AudioCore.resume(); }

    /* One enveloped oscillator note. Exponential ramps can't hit 0, so we
       floor at 0.0001 and treat that as silence. */
    function tone(o) {
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
    function arp(freqs, o) {
      o = o || {};
      const stagger = o.stagger != null ? o.stagger : 0.07;
      freqs.forEach((f, i) => tone(Object.assign({}, o, { f0: f, delay: (o.delay || 0) + i * stagger })));
    }

    /* Named cues. Kept short and bright — this is a toy pet, not a DAW. */
    const FX = {
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

    function play(name) {
      if (muted) return;
      const fn = FX[name];
      if (!fn) return;
      try { resume(); fn(); } catch (e) {}
    }
    function isMuted() { return muted; }
    function setMuted(m) {
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
  const Music = (function () {
    const MUTE_KEY = 'slimegachi:music-muted';
    let muted = false;
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

    const LOOKAHEAD = 0.12;   // seconds of notes scheduled ahead of the clock
    const TICK = 25;          // ms between scheduler wake-ups
    const STEPS = 16;         // eighth-notes per loop (2 bars of 4/4)
    const ACTIVE_GAIN = 0.32; // music bus level while playing (sits well under SFX)

    const QUAL = { maj: [0, 4, 7], min: [0, 3, 7], sus: [0, 5, 7], dom: [0, 4, 7, 10] };

    /* Each theme: bpm, root (tonic Hz, ~octave 3), per-voice waveforms,
       a 4-chord progression (r = semitone offset of chord root, q = quality),
       arpOct (octave lift for the arpeggio), density (0–1 arp note chance). */
    const THEMES = {
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

    let timer = null, step = 0, nextTime = 0;
    let current = null, currentKey = null, swapToken = 0;

    function hz(base, semi) { return base * Math.pow(2, semi / 12); }
    function stepDur() { return (60 / current.bpm) / 2; }

    /* A single sustained music note on the music bus. */
    function mnote(freq, t, o) {
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
    function playStep(s, t) {
      const th = current;
      const chord = th.prog[Math.floor(s / 4) % th.prog.length];
      const triad = QUAL[chord.q];
      const base = chord.r;
      const sd = stepDur();

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
        playStep(step, nextTime);
        nextTime += stepDur();
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

    function fadeBus(target, dur) {
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
    function setScene(view, variant) {
      let key;
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

    function setMuted(m) {
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

  /* ===================================================================
     Pet definitions — gameplay metadata. Decay rates, sleep windows,
     favorite foods/games, accent colors. Driven by the "Head" trait
     value in the NFT metadata.
     =================================================================== */
  const PET_DEFS = {
    Kitten: {
      id: 'Kitten', label: 'Kitten', status: 'available',
      accent: '#f28c38',
      decay: { hunger: 14, happy: 10, energy: 8, clean: 12 },
      favoriteFood: 'cake',
      favoriteGame: 'bubblepop',
      bouncyness: 0.6,
      sleepWindow: [22, 6],
      skyDay:  ['#fcd9b6', '#f4a880'],
      skyDusk: ['#3d2659', '#1a1428']
    },
    Monkey: {
      id: 'Monkey', label: 'Monkey', status: 'available',
      accent: '#8b4513',
      decay: { hunger: 18, happy: 16, energy: 14, clean: 9 },
      favoriteFood: 'banana',
      favoriteGame: 'bananacatch',
      bouncyness: 1.2,
      sleepWindow: [22, 7],
      skyDay:  ['#d4e8a8', '#88b85c'],
      skyDusk: ['#2a2238', '#1a1428']
    },
    Owl: {
      id: 'Owl', label: 'Owl', status: 'locked',
      accent: '#e8b53a',
      sublabel: 'Mint 2',
      decay: { hunger: 8, happy: 8, energy: 6, clean: 6 },
      favoriteFood: 'banana',
      favoriteGame: 'bubblepop',
      bouncyness: 0.3,
      sleepWindow: [8, 16],   // nocturnal
      skyDay:  ['#1a1438', '#0a0820'],
      skyDusk: ['#fcd9b6', '#f4a880']
    },
    Dragon: {
      id: 'Dragon', label: 'Dragon', status: 'locked',
      accent: '#fed600',
      sublabel: 'Mint 2',
      decay: { hunger: 22, happy: 12, energy: 18, clean: 16 },
      favoriteFood: 'burger',
      favoriteGame: 'bubblepop',
      bouncyness: 0.9,
      sleepWindow: [3, 5],
      skyDay:  ['#3d1a1a', '#5c2828'],
      skyDusk: ['#1a0e0e', '#0a0606']
    }
  };
  const PET_ORDER = ['Kitten', 'Monkey', 'Owl', 'Dragon'];

  /* Colored content icons — flat fills + a dark kawaii outline, matching the
     pets' sticker look. Used for foods and achievements, which stay colourful
     (unlike the monochrome line ICONS used for UI chrome). */
  function svgC(body) {
    return '<svg class="slimegachi-ico" viewBox="0 0 24 24" fill="none" stroke="#1a1428" ' +
      'stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + body + '</svg>';
  }
  const FOOD_ICONS = {
    snack:    svgC('<circle cx="12" cy="12" r="8" fill="#d6a15c"/><circle cx="9.2" cy="9.5" r="1.1" fill="#5a3a22" stroke="none"/><circle cx="14.6" cy="10" r="1" fill="#5a3a22" stroke="none"/><circle cx="10.4" cy="14.4" r="1.1" fill="#5a3a22" stroke="none"/><circle cx="14.9" cy="14.4" r="0.9" fill="#5a3a22" stroke="none"/><circle cx="12.2" cy="12" r="0.7" fill="#5a3a22" stroke="none"/>'),
    burger:   svgC('<path d="M4.5 11a7.5 4 0 0 1 15 0z" fill="#e8a64f"/><circle cx="9" cy="9.2" r="0.5" fill="#fff7e6" stroke="none"/><circle cx="12" cy="8.5" r="0.5" fill="#fff7e6" stroke="none"/><circle cx="15" cy="9.2" r="0.5" fill="#fff7e6" stroke="none"/><path d="M4.3 11h15.4l-.4 1.9H4.7z" fill="#82c34a"/><rect x="4.6" y="12.7" width="14.8" height="2.3" rx="1.1" fill="#8a5a30"/><path d="M5 15h14a2.2 2.2 0 0 1-2.2 2.3H7.2A2.2 2.2 0 0 1 5 15z" fill="#e8a64f"/>'),
    banana:   svgC('<path d="M5.6 7.4c1 6.4 6 9.9 12.4 9.1.9-.1 1.2-1.1.4-1.5C12.6 12.9 9 9.7 8.3 6.7 8 5.6 6.4 5.9 5.6 7.4z" fill="#f2d23e"/><path d="M18 16.2l1.2.4"/>'),
    cake:     svgC('<path d="M6 18.5l6-11 6 11z" fill="#f5e0a6"/><path d="M9.2 12.4 12 7.6l2.8 4.8z" fill="#f49ab8"/><circle cx="12" cy="8" r="1.3" fill="#e0464e"/><path d="M8.7 15h6.6"/>'),
    medicine: svgC('<rect x="3.8" y="9" width="16.4" height="6" rx="3" fill="#f1e7d4"/><path d="M6.8 9.05H12v5.9H6.8a2.95 2.95 0 0 1 0-5.9z" fill="#e8534e"/>'),
    toyball:  svgC('<circle cx="12" cy="12" r="8" fill="#bfe05a"/><path d="M6.2 6.4c3.2 3 3.2 8.2 0 11.2" stroke="#ffffff" stroke-width="1.3"/><path d="M17.8 6.4c-3.2 3-3.2 8.2 0 11.2" stroke="#ffffff" stroke-width="1.3"/>')
  };
  const FOODS = {
    snack:    { id: 'snack',    name: 'Snack',     icon: FOOD_ICONS.snack,    cost: 0,  hunger: 20, happy: 0,  clean: 0,  desc: 'Free, basic' },
    burger:   { id: 'burger',   name: 'Burger',    icon: FOOD_ICONS.burger,   cost: 15, hunger: 35, happy: 0,  clean: -3, desc: 'Filling, messy' },
    banana:   { id: 'banana',   name: 'Banana',    icon: FOOD_ICONS.banana,   cost: 8,  hunger: 25, happy: 5,  clean: 0,  desc: 'Sweet & happy' },
    cake:     { id: 'cake',     name: 'Cake',      icon: FOOD_ICONS.cake,     cost: 25, hunger: 40, happy: 10, clean: -8, desc: 'Treat yourself' },
    medicine: { id: 'medicine', name: 'Medicine',  icon: FOOD_ICONS.medicine, cost: 30, hunger: 0,  happy: -2, clean: 0,  desc: 'Cures sickness', healsSick: true },
    toyball:  { id: 'toyball',  name: 'Toy Ball',  icon: FOOD_ICONS.toyball,  cost: 20, hunger: 0,  happy: 8,  clean: 0,  desc: 'Buffs next play', isToy: true }
  };

  const ACH_ICONS = {
    paw:     svgC('<path d="M7.5 15.2c0-2.2 2-3.4 4.5-3.4s4.5 1.2 4.5 3.4-2 3.7-4.5 3.7S7.5 17.4 7.5 15.2z" fill="#f2a6bc"/><ellipse cx="8" cy="10.6" rx="1.3" ry="1.7" fill="#f2a6bc"/><ellipse cx="11" cy="9.1" rx="1.3" ry="1.8" fill="#f2a6bc"/><ellipse cx="13.9" cy="9.1" rx="1.3" ry="1.8" fill="#f2a6bc"/><ellipse cx="16.8" cy="10.6" rx="1.3" ry="1.7" fill="#f2a6bc"/>'),
    star:    svgC('<path d="M12 3.6l2.5 5.1 5.6.8-4.1 4 1 5.6L12 16.4 6.9 19l1-5.6-4-4 5.6-.8z" fill="#ffd23f"/>'),
    sparkle: svgC('<path d="M12 3l1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7z" fill="#8fe0ff"/>'),
    diamond: svgC('<path d="M7.5 6.5h9l2.6 3.3L12 19 4.4 9.8z" fill="#5cd0e8"/><path d="M4.4 9.8h15.2" stroke-width="1.1"/><path d="M9.2 6.5 7.7 9.8 12 19M14.8 6.5l1.5 3.3L12 19" stroke-width="1"/>'),
    bubbles: svgC('<circle cx="10" cy="13.2" r="4.6" fill="#7fc8e8"/><circle cx="16.2" cy="9" r="2.8" fill="#a8dcf0"/><circle cx="15.6" cy="15.6" r="2" fill="#a8dcf0"/><circle cx="8.4" cy="11.4" r="1" fill="#eafaff" stroke="none"/>'),
    glowstar:svgC('<path d="M12 4.2l2.3 4.7 5.2.7-3.8 3.7.9 5.2L12 16l-4.6 2.5.9-5.2-3.8-3.7 5.2-.7z" fill="#ffd23f"/><path d="M19 5l.5 1.4 1.4.5-1.4.5L19 9.3l-.5-1.4-1.4-.5 1.4-.5z" fill="#fff3b0" stroke="none"/>')
  };
  const ACHIEVEMENTS = {
    firstSteps:   { id: 'firstSteps',   name: 'First Steps',       desc: 'Cared for a pet for the first time',   mintable: false, icon: ACH_ICONS.paw },
    pickyEater:   { id: 'pickyEater',   name: 'Picky Eater',       desc: 'Fed a pet its favorite food',          mintable: false, icon: ACH_ICONS.star },
    squeakyClean: { id: 'squeakyClean', name: 'Squeaky Clean',     desc: 'All four stats above 80 at once',      mintable: false, icon: ACH_ICONS.sparkle },
    devoted:      { id: 'devoted',      name: 'Devoted Caretaker', desc: '7-day care streak',                    mintable: true,  icon: ACH_ICONS.diamond },
    bubbleMaster: { id: 'bubbleMaster', name: 'Bubble Master',     desc: 'Score 100+ in Bubble Pop',             mintable: false, icon: ACH_ICONS.bubbles },
    bananaMaster: { id: 'bananaMaster', name: 'Banana Master',     desc: 'Score 100+ in Banana Catch',           mintable: false, icon: FOOD_ICONS.banana },
    whisperer:    { id: 'whisperer',    name: 'Slime Whisperer',   desc: 'Kept pet Thriving for 24 hours',       mintable: true,  icon: ACH_ICONS.glowstar }
  };

  /* Colored icons for the floating care emotes (keyed by the legacy emoji so the
     spawnEmote call sites don't change) and for the events / stats rows. */
  const EMOTE_ICONS = {
    '💖': svgC('<path d="M12 20s-7-4.4-7-9.4a3.8 3.8 0 0 1 7-2.2 3.8 3.8 0 0 1 7 2.2c0 5-7 9.4-7 9.4z" fill="#ff6fa5"/>'),
    '✨': ACH_ICONS.sparkle,
    '⭐': ACH_ICONS.star,
    '🌟': ACH_ICONS.glowstar,
    '🫧': ACH_ICONS.bubbles,
    '🎵': svgC('<path d="M9 17V5l9-2v11.5"/><circle cx="6.5" cy="17" r="2.4" fill="#9b6cf0"/><circle cx="15.5" cy="14.5" r="2.4" fill="#9b6cf0"/>'),
    '💤': svgC('<path d="M6.5 8h5l-5 5.5h5" stroke="#74a9ff"/><path d="M13 13h4.5l-4.5 4h4.5" stroke="#74a9ff"/>'),
    '💧': svgC('<path d="M12 3.6c3.3 4.3 5.4 7.1 5.4 9.9a5.4 5.4 0 0 1-10.8 0c0-2.8 2.1-5.6 5.4-9.9z" fill="#5fb8e8"/>'),
    '🎉': svgC('<path d="M4 20l4.6-12 7.4 7.4z" fill="#f0a83c"/><circle cx="16" cy="6" r="1" fill="#ff6fa5" stroke="none"/><circle cx="19.2" cy="9.4" r="1" fill="#5cd0e8" stroke="none"/><circle cx="18" cy="4.2" r="0.8" fill="#7ec850" stroke="none"/>'),
    '🎁': svgC('<rect x="4.5" y="10" width="15" height="9" rx="1" fill="#e8534e"/><rect x="3.8" y="7.8" width="16.4" height="3.2" rx="1" fill="#ff8174"/><path d="M12 7.8V19" stroke="#ffd23f" stroke-width="1.4"/><path d="M12 7.8C10.5 5 6.5 5.5 8 7.8zM12 7.8C13.5 5 17.5 5.5 16 7.8z" fill="#ffd23f"/>'),
    '⬆️': svgC('<path d="M12 19V6" stroke="#5ad17a" stroke-width="2.2"/><path d="M7 11l5-5 5 5" stroke="#5ad17a" stroke-width="2.2"/>')
  };
  const MISC_ICONS = {
    coin:     svgC('<circle cx="12" cy="12" r="8" fill="#ffd23f"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="#c9a528" stroke-width="1.1"/>'),
    sick:     svgC('<circle cx="12" cy="12" r="8" fill="#a3cf63"/><path d="M9 11.5h.01M15 11.5h.01" stroke-width="2.2"/><path d="M9.2 16c1.6-1.4 4-1.4 5.6 0"/><path d="M16.4 8.4c1.2-.6 2.4-.2 2.8 1"/>'),
    bolt:     svgC('<path d="M13 2.5 5 13h6l-1 8.5L19 11h-6l1-8.5z" fill="#ffd23f"/>'),
    trophy:   svgC('<path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0V4z" fill="#ffd23f"/><path d="M7.5 5.5H4.5V7a3 3 0 0 0 3 3.2"/><path d="M16.5 5.5h3V7a3 3 0 0 1-3 3.2"/><path d="M9.5 18.7h5"/><path d="M12 13.4v5.3"/>'),
    plate:    svgC('<circle cx="13" cy="12.5" r="5.6" fill="#e7ddc9"/><circle cx="13" cy="12.5" r="3.1" fill="none" stroke="#c4ba9f" stroke-width="1"/><path d="M5 5.5v13M3.7 5.5v3.4a1.3 1.3 0 0 0 2.6 0V5.5"/>'),
    gamepad:  svgC('<rect x="3" y="9" width="18" height="8" rx="4" fill="#6c7bf0"/><path d="M6.8 11.3v3M5.3 12.8h3" stroke="#fff" stroke-width="1.3"/><circle cx="15.5" cy="12" r="1" fill="#fff" stroke="none"/><circle cx="17.6" cy="14" r="1" fill="#fff" stroke="none"/>'),
    trending: svgC('<path d="M4 16l5-5 3 3 7-7" stroke="#5ad17a" stroke-width="2"/><path d="M15.5 7H19v3.5" stroke="#5ad17a" stroke-width="2"/>'),
    flame:    svgC('<path d="M12 3c3 4 5 6.2 5 9.2a5 5 0 0 1-10 0c0-1.5.5-2.7 1.4-3.9.3 1 .8 1.6 1.6 2C11.2 7.7 11.6 5.6 12 3z" fill="#ff7a3c"/><path d="M12 19a2.4 2.4 0 0 0 2.4-2.4c0-1.3-1-2.1-2.4-3.8-1.4 1.7-2.4 2.5-2.4 3.8A2.4 2.4 0 0 0 12 19z" fill="#ffd23f"/>')
  };

  /* Rasterize an inline icon to an <img> so the canvas mini-games can draw the
     same kawaii sprites the rest of the UI uses (a data-URI SVG needs an explicit
     xmlns, which the inline-HTML icons omit). */
  function spriteImg(svgMarkup) {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(svgMarkup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
    return img;
  }
  const CATCH_SPRITES = {
    golden: spriteImg(ACH_ICONS.star),
    rotten: spriteImg(MISC_ICONS.sick),
    banana: spriteImg(FOOD_ICONS.banana)
  };

  const SPEECH = {
    Kitten: {
      happy:  ['purr...', 'play with me!', 'got treats?', 'love you ' + EMOTE_ICONS['💖'], 'mrow!'],
      okay:   ['mrrp?', '*licks paw*', 'meow.', 'hmm...'],
      sad:    ['mew...', 'need food', 'so lonely...', 'please pay attention'],
      sleepy: ['*yawn*', 'zzz...', 'tired', 'so sleepy...']
    },
    Monkey: {
      happy:  ['ook ook!', 'BANANA!', 'fun time!', FOOD_ICONS.banana + FOOD_ICONS.banana + FOOD_ICONS.banana, 'wheeee'],
      okay:   ['hmm', '*scratches*', 'where banana', 'eh.'],
      sad:    ['ook... :(', 'hungry monkey', 'sad ook', 'where banana :('],
      sleepy: ['too tired to ook', 'zzz', 'need nap', '*yawns*']
    },
    Owl: {
      happy:  ['Hoot!', 'big moon tonight', 'hoo ' + ACH_ICONS.sparkle, 'wise and happy'],
      okay:   ['hoo.', '*blinks slowly*', 'observing'],
      sad:    ['hoo... :(', 'cold night', 'so quiet'],
      sleepy: ['day means sleep', '*nestles*', 'zzz hoot']
    },
    Dragon: {
      happy:  [MISC_ICONS.flame + MISC_ICONS.flame + MISC_ICONS.flame, 'RAWR!', 'feeling spicy', 'breath strong'],
      okay:   ['rumble.', '*sniffs air*', 'hmm.'],
      sad:    ['flame... low...', 'need bath', 'scales itchy'],
      sleepy: ['dragons rarely sleep', '*tail twitch*', 'zzz...']
    }
  };

  /* Constants */
  const PASSIVE_DECAY_MULTIPLIER = 0.4;
  const TICK_INTERVAL_MS = 15000;
  const SAVE_DEBOUNCE_MS = 800;
  const SPEECH_INTERVAL_MS = 22000;
  const EVENT_CHECK_INTERVAL_MS = 60000;
  const SLEEP_BONUS_MULT = 1.5;
  const WRONG_TIME_PENALTY = 0.5;
  /* A care action only counts toward leveling when it meets a genuine need —
     the relevant stat is below its threshold beforehand. Topping up an already
     satisfied pet still applies the stat boost but earns no care credit, so the
     free Clean / Sleep / Snack buttons can't be spammed for easy levels. */
  const CLEAN_CARE_THRESHOLD = 60;  // clean
  const SLEEP_CARE_THRESHOLD = 60;  // energy
  const FEED_CARE_THRESHOLD  = 60;  // hunger

  const DEFAULT_MIRROR_NODES = [
    'https://mainnet-public.mirrornode.hedera.com/api/v1',
    'https://mainnet.mirrornode.hedera.com/api/v1',
    'https://mainnet.hashio.io/api/v1'
  ];
  const DEFAULT_IPFS_GATEWAYS = [
    'https://ipfs.io/ipfs/',
    'https://nftstorage.link/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://dweb.link/ipfs/'
  ];
  const DEFAULT_TOKEN_ID = '0.0.9474754';

  /* Custom line icons — rounded stroke linework to match the pets' outlines.
     stroke="currentColor" so each icon inherits its container's text colour,
     which means they flip with the adaptive HUD and tint per button like the
     labels do (something emoji can't do). Sized to 1em via .slimegachi-ico. */
  function svgIcon(body) {
    return '<svg class="slimegachi-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  const ICONS = {
    // Care actions
    feed:  svgIcon('<path d="M3 12h18"/><path d="M4.5 12a7.5 6 0 0 0 15 0"/><path d="M7.5 12a4.5 3.5 0 0 1 9 0"/>'),
    play:  svgIcon('<circle cx="12" cy="12" r="8.5"/><path d="M5.5 6.5c2.8 3.6 2.8 7.4 0 11"/><path d="M18.5 6.5c-2.8 3.6-2.8 7.4 0 11"/>'),
    sleep: svgIcon('<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5 6.7 6.7 0 0 0 20.5 13.2z"/><path d="M15 4.5h3.5L15 8h3.5"/>'),
    clean: svgIcon('<path d="M12 3.2c3.6 4.6 6 7.7 6 10.6a6 6 0 0 1-12 0c0-2.9 2.4-6 6-10.6z"/><path d="M9.4 13.8a2.6 2.6 0 0 0 2.1 2.4"/>'),
    // Vitals
    hunger: svgIcon('<path d="M12 8c-1-2-3.6-2-4.8-.3-1.3 1.9-.7 6.4 1.1 8.1 1 1 1.8 1.2 2.7 1.2s1.7-.2 2.7-1.2c1.8-1.7 2.4-6.2 1.1-8.1C15.6 6 13 6 12 8z"/><path d="M12 8c.2-1.7 1.3-2.7 2.9-2.9"/>'),
    happy:  svgIcon('<path d="M12 20s-7-4.4-7-9.4a3.8 3.8 0 0 1 7-2.2 3.8 3.8 0 0 1 7 2.2c0 5-7 9.4-7 9.4z"/>'),
    energy: svgIcon('<path d="M13 2.5 5 13h6l-1 8.5L19 11h-6l1-8.5z"/>'),
    // Shelf nav
    quests: svgIcon('<path d="M9.5 6.5h10"/><path d="M9.5 12h10"/><path d="M9.5 17.5h10"/><path d="M4 6l1.2 1.2L7.5 5"/><path d="M4 11.5l1.2 1.2 2.3-2.2"/><path d="M4 17l1.2 1.2 2.3-2.2"/>'),
    shop:   svgIcon('<path d="M5 8h14l-1.2 12.5H6.2L5 8z"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8"/>'),
    badges: svgIcon('<path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0V4z"/><path d="M7.5 5.5H4.5V7a3 3 0 0 0 3 3"/><path d="M16.5 5.5h3V7a3 3 0 0 1-3 3"/><path d="M9.5 18.5h5"/><path d="M12 13.2v5.3"/>'),
    stats:  svgIcon('<path d="M4 20h16"/><path d="M6.5 20v-6.5"/><path d="M12 20V5"/><path d="M17.5 20v-9.5"/>'),
    // Topbar
    coin:     svgIcon('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.3"/>'),
    sound:    svgIcon('<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
    soundOff: svgIcon('<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M16.5 9.5l5 5"/><path d="M21.5 9.5l-5 5"/>'),
    music:    svgIcon('<path d="M9 17V5l10-2v12"/><circle cx="6.5" cy="17" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>'),
    musicOff: svgIcon('<path d="M9 17V5l10-2v12"/><circle cx="6.5" cy="17" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/><path d="M4 4.5l16 16"/>'),
    check:    svgIcon('<path d="M5 12.5l4.5 4.5L19 7"/>')
  };

  /* HTML template injected into the host container */
  function widgetHTML(showDev) {
    return [
      '<canvas class="slimegachi-bg-canvas"></canvas>',
      '<div class="slimegachi-topbar">',
      '  <div class="slimegachi-brand">SLIME<span class="slimegachi-brand-accent">gachi</span></div>',
      '  <div class="slimegachi-coins"><span class="slimegachi-coins-ico">' + ICONS.coin + '</span><span data-sg="coins-val">0</span></div>',
      '  <button class="slimegachi-sound-btn" data-sg="sound-toggle" aria-label="Toggle sound effects" aria-pressed="false">' + ICONS.sound + '</button>',
      '  <button class="slimegachi-sound-btn slimegachi-music-btn" data-sg="music-toggle" aria-label="Toggle music" aria-pressed="false">' + ICONS.music + '</button>',
      '  <div class="slimegachi-acct" data-sg="acct">— not connected —</div>',
      '</div>',
      '<button class="slimegachi-back" data-sg="back" aria-label="Back to shelf">←</button>',
      '<div class="slimegachi-stage" data-sg="stage">',
      '  <div class="slimegachi-floor" data-sg="floor"></div>',
      '  <div class="slimegachi-carestage" data-sg="carestage"><div class="slimegachi-petimg slimegachi-anim" data-sg="petimg" aria-hidden="true"></div></div>',
      '  <div class="slimegachi-speech" data-sg="speech"></div>',
      '  <div class="slimegachi-event-icon" data-sg="event-icon">!</div>',
      '  <div class="slimegachi-stats" data-sg="stats">',
      '    <div class="slimegachi-gauge"><div class="slimegachi-gauge-ring" data-sg="bar-hunger" title="Hunger"><span class="slimegachi-gauge-ico">' + ICONS.hunger + '</span></div><div class="slimegachi-gauge-val" data-sg="val-hunger">100</div></div>',
      '    <div class="slimegachi-gauge"><div class="slimegachi-gauge-ring" data-sg="bar-happy" title="Happy"><span class="slimegachi-gauge-ico">' + ICONS.happy + '</span></div><div class="slimegachi-gauge-val" data-sg="val-happy">100</div></div>',
      '    <div class="slimegachi-gauge"><div class="slimegachi-gauge-ring" data-sg="bar-energy" title="Energy"><span class="slimegachi-gauge-ico">' + ICONS.energy + '</span></div><div class="slimegachi-gauge-val" data-sg="val-energy">100</div></div>',
      '    <div class="slimegachi-gauge"><div class="slimegachi-gauge-ring" data-sg="bar-clean" title="Clean"><span class="slimegachi-gauge-ico">' + ICONS.clean + '</span></div><div class="slimegachi-gauge-val" data-sg="val-clean">100</div></div>',
      '  </div>',
      '  <div class="slimegachi-petheader" data-sg="petheader">',
      '    <div class="slimegachi-petname" data-sg="petname">—</div>',
      '    <div class="slimegachi-petmood" data-sg="petmood">—</div>',
      '    <div class="slimegachi-petlevel" data-sg="petlevel"></div>',
      '  </div>',
      '  <div class="slimegachi-shelf" data-sg="shelf">',
      '    <div class="slimegachi-shelf-title">Your Pets</div>',
      '    <div class="slimegachi-shelf-sub">Tap a SLIME to care for it</div>',
      '    <div class="slimegachi-status" data-sg="status"></div>',
      '    <div class="slimegachi-shelf-grid" data-sg="shelf-grid"></div>',
      '    <div class="slimegachi-shelf-actions">',
      '      <div class="slimegachi-shelf-actions-inner">',
      '        <button class="slimegachi-shelf-btn" data-sg="open-quests"><span class="slimegachi-shelf-btn-ico">' + ICONS.quests + '</span>Quests<span class="slimegachi-shelf-btn-dot" data-sg="quests-dot"></span></button>',
      '        <button class="slimegachi-shelf-btn" data-sg="open-shop"><span class="slimegachi-shelf-btn-ico">' + ICONS.shop + '</span>Shop</button>',
      '        <button class="slimegachi-shelf-btn" data-sg="open-achievements"><span class="slimegachi-shelf-btn-ico">' + ICONS.badges + '</span>Badges</button>',
      '        <button class="slimegachi-shelf-btn" data-sg="open-collection"><span class="slimegachi-shelf-btn-ico">' + ICONS.stats + '</span>Stats</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="slimegachi-minigame" data-sg="minigame">',
      '    <div class="slimegachi-minigame-header">',
      '      <div class="slimegachi-minigame-title" data-sg="minigame-title">Bubble Pop</div>',
      '      <div class="slimegachi-minigame-timer" data-sg="minigame-timer">0:30</div>',
      '      <div class="slimegachi-minigame-score">Score: <span data-sg="minigame-score">0</span></div>',
      '      <button class="slimegachi-minigame-exit" data-sg="minigame-exit">Exit</button>',
      '    </div>',
      '    <div class="slimegachi-minigame-stage" data-sg="minigame-stage"><canvas data-sg="minigame-canvas"></canvas></div>',
      '    <div class="slimegachi-miniresult" data-sg="miniresult">',
      '      <h3>Round Complete!</h3>',
      '      <div class="slimegachi-miniresult-big" data-sg="miniresult-score">0</div>',
      '      <div class="slimegachi-miniresult-stats">',
      '        <div>Happy <strong data-sg="miniresult-happy">+0</strong></div>',
      '        <div>Coins <strong data-sg="miniresult-coins">+0</strong></div>',
      '      </div>',
      '      <button class="slimegachi-modal-btn" data-sg="miniresult-close">Back to Pet</button>',
      '    </div>',
      '  </div>',
      '</div>',
      '<div class="slimegachi-bottombar" data-sg="bottombar">',
      '  <button class="slimegachi-actbtn" data-action="feed"><span class="slimegachi-actbtn-icon">' + ICONS.feed + '</span>Feed</button>',
      '  <button class="slimegachi-actbtn" data-action="play"><span class="slimegachi-actbtn-icon">' + ICONS.play + '</span>Play</button>',
      '  <button class="slimegachi-actbtn" data-action="sleep"><span class="slimegachi-actbtn-icon">' + ICONS.sleep + '</span>Sleep</button>',
      '  <button class="slimegachi-actbtn" data-action="clean"><span class="slimegachi-actbtn-icon">' + ICONS.clean + '</span>Clean</button>',
      '</div>',
      showDev ? (
        '<div class="slimegachi-dev" data-sg="dev">' +
        '  <span data-sg="dev-mode">stub</span>' +
        '  <button data-sg="dev-toggle">switch</button>' +
        '  <button data-sg="dev-skip">+1h</button>' +
        '  <button data-sg="dev-time">time</button>' +
        '  <button data-sg="dev-reset">reset</button>' +
        '</div>'
      ) : '',
      '<div class="slimegachi-ach-notif" data-sg="ach-notif">',
      '  <div class="slimegachi-ach-notif-ico">' + MISC_ICONS.trophy + '</div>',
      '  <div class="slimegachi-ach-notif-body">',
      '    <div class="slimegachi-ach-notif-title">Achievement Unlocked</div>',
      '    <div class="slimegachi-ach-notif-name" data-sg="ach-notif-name"></div>',
      '  </div>',
      '</div>',
      '<div class="slimegachi-modal" data-sg="connect-modal"><div class="slimegachi-modal-panel" style="max-width:380px;text-align:center">',
      '  <h2 data-sg="connect-title">Load Account</h2>',
      '  <p data-sg="connect-body">Paste a Hedera account ID to load real pets via Mirror Node.</p>',
      '  <input data-sg="connect-input" placeholder="0.0.xxxxxx" autocomplete="off">',
      '  <div class="slimegachi-modal-row">',
      '    <button class="slimegachi-modal-btn" data-sg="connect-ok">Load</button>',
      '    <button class="slimegachi-modal-btn slimegachi-alt" data-sg="connect-cancel">Cancel</button>',
      '  </div>',
      '</div></div>',
      '<div class="slimegachi-modal" data-sg="shop-modal"><div class="slimegachi-modal-panel">',
      '  <h2>' + ICONS.shop + ' SLIME Shop</h2>',
      '  <p style="text-align:center;font-size:11px">Your coins: <strong style="color:var(--slimegachi-coin);font-family:monospace" data-sg="shop-coins">0</strong></p>',
      '  <div class="slimegachi-shop-grid" data-sg="shop-grid"></div>',
      '  <p style="text-align:center;font-size:10px;color:var(--slimegachi-dim);margin-top:8px">' + ACH_ICONS.star + ' = your pet\'s favorite (1.5× boost)</p>',
      '  <div class="slimegachi-modal-row"><button class="slimegachi-modal-btn slimegachi-alt" data-sg="shop-close">Close</button></div>',
      '</div></div>',
      '<div class="slimegachi-modal" data-sg="ach-modal"><div class="slimegachi-modal-panel">',
      '  <h2>' + ICONS.badges + ' Badges</h2>',
      '  <p style="text-align:center;font-size:11px;color:var(--slimegachi-dim)">Unlocked <strong data-sg="ach-count" style="color:var(--slimegachi-coin);font-family:monospace">0/0</strong></p>',
      '  <div class="slimegachi-ach-list" data-sg="ach-list"></div>',
      '  <div class="slimegachi-modal-row"><button class="slimegachi-modal-btn slimegachi-alt" data-sg="ach-close">Close</button></div>',
      '</div></div>',
      '<div class="slimegachi-modal" data-sg="feed-modal"><div class="slimegachi-modal-panel">',
      '  <h2>' + ICONS.feed + ' Choose Food</h2>',
      '  <p style="text-align:center;font-size:11px">Your coins: <strong style="color:var(--slimegachi-coin);font-family:monospace" data-sg="feed-coins">0</strong></p>',
      '  <div class="slimegachi-shop-grid" data-sg="feed-grid"></div>',
      '  <div class="slimegachi-modal-row"><button class="slimegachi-modal-btn slimegachi-alt" data-sg="feed-close">Cancel</button></div>',
      '</div></div>',
      '<div class="slimegachi-modal" data-sg="quests-modal"><div class="slimegachi-modal-panel">',
      '  <h2>' + ICONS.quests + ' Daily Quests</h2>',
      '  <p style="text-align:center;font-size:10px;color:var(--slimegachi-dim);margin-bottom:8px">Refreshes every day · <span data-sg="quests-date">—</span></p>',
      '  <div class="slimegachi-quest-list" data-sg="quest-list"></div>',
      '  <div class="slimegachi-modal-row"><button class="slimegachi-modal-btn slimegachi-alt" data-sg="quests-close">Close</button></div>',
      '</div></div>',
      '<div class="slimegachi-modal" data-sg="collection-modal"><div class="slimegachi-modal-panel">',
      '  <h2>' + ICONS.stats + ' Collection</h2>',
      '  <div class="slimegachi-collection" data-sg="collection-body"></div>',
      '  <div class="slimegachi-modal-row"><button class="slimegachi-modal-btn slimegachi-alt" data-sg="collection-close">Close</button></div>',
      '</div></div>'
    ].join('');
  }

  /* Helpers */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hexToRgb(h) {
    const s = h.replace('#', '');
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
  }
  function rgbToHex(c) {
    const h = (n) => n.toString(16).padStart(2, '0');
    return '#' + h(c.r) + h(c.g) + h(c.b);
  }
  function mixHex(a, b) {
    const pa = hexToRgb(a), pb = hexToRgb(b);
    return rgbToHex({
      r: Math.round((pa.r + pb.r) / 2),
      g: Math.round((pa.g + pb.g) / 2),
      b: Math.round((pa.b + pb.b) / 2)
    });
  }

  /* Default storage adapter — localStorage */
  function makeLocalStorageAdapter(namespace) {
    return {
      async load(key) {
        try {
          const raw = localStorage.getItem(namespace + ':' + key);
          return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
      },
      async save(key, data) {
        try {
          localStorage.setItem(namespace + ':' + key, JSON.stringify(data));
          return true;
        } catch (e) { return false; }
      },
      async remove(key) {
        try { localStorage.removeItem(namespace + ':' + key); return true; }
        catch (e) { return false; }
      }
    };
  }

  /* Default getOwnedPets — Mirror Node + IPFS gateways */
  function makeDefaultGetOwnedPets(opts) {
    return async function (accountId) {
      if (!accountId) return [];
      const tokenId = opts.tokenId;
      const path = '/accounts/' + accountId + '/nfts?token.id=' + tokenId + '&limit=100';
      let data = null;
      let lastErr = null;
      for (const base of opts.mirrorNodes) {
        try {
          const res = await fetch(base + path);
          if (res.status === 404) {
            opts.onError({ code: 'account_not_found', message: 'Account ' + accountId + ' not found on mainnet.' });
            return [];
          }
          if (!res.ok) { lastErr = new Error(base + ' → HTTP ' + res.status); continue; }
          data = await res.json();
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!data) {
        opts.onError({
          code: 'mirror_unreachable',
          message: 'All mirror nodes unreachable. ' + (lastErr ? lastErr.message : '') + ' (Tip: open over http://, not file://)'
        });
        return [];
      }
      const nfts = (data && data.nfts) || [];
      if (nfts.length === 0) {
        opts.onError({ code: 'no_nfts', message: 'Account ' + accountId + ' holds no SLIME NFTs.' });
        return [];
      }
      const owned = [];
      for (const nft of nfts) {
        const meta = await fetchMetadata(nft, opts.ipfsGateways);
        if (!meta) continue;
        const headTrait = (meta.attributes || []).find((a) => a.trait_type === 'Head');
        const headValue = headTrait && headTrait.value;
        if (!headValue) continue;
        if (PET_DEFS[headValue] && PET_DEFS[headValue].status === 'available') {
          owned.push({
            pet: headValue,
            serial: nft.serial_number,
            name: meta.name || 'SLIME #' + nft.serial_number,
            image: meta.image || null,
            traits: Object.fromEntries((meta.attributes || []).map((a) => [a.trait_type, a.value]))
          });
        }
      }
      if (owned.length === 0) {
        opts.onError({ code: 'no_playable_pets', message: 'Account has SLIME NFTs but none with Kitten or Monkey heads.' });
      }
      return owned;
    };
  }
  async function fetchMetadata(nft, gateways) {
    const b64 = nft.metadata;
    if (!b64) return null;
    let uri;
    try { uri = atob(b64); } catch (e) { return null; }
    if (!uri.startsWith('ipfs://')) return null;
    const path = uri.replace('ipfs://', '');
    for (const gw of gateways) {
      try {
        const r = await fetch(gw + path, { cache: 'force-cache' });
        if (r.ok) return await r.json();
      } catch (e) {}
    }
    return null;
  }

  /* =====================================================================
     The widget instance — created once per mount() call.
     ===================================================================== */
  function createInstance(container, userOptions) {
    /* ----- Resolve options with defaults ----- */
    const events = userOptions.events || {};
    const noop = function () {};
    const safeEmit = function (name, payload) {
      try {
        const fn = events[name];
        if (typeof fn === 'function') fn(payload);
      } catch (e) {
        console.error('SLIMEgachi event handler threw:', name, e);
      }
    };
    const onError = function (errPayload) {
      safeEmit('onError', errPayload);
      setStatus(errPayload.message, 'error');
    };

    const options = {
      tokenId: userOptions.tokenId || DEFAULT_TOKEN_ID,
      accountId: userOptions.accountId || null,
      mirrorNodes: userOptions.mirrorNodes || DEFAULT_MIRROR_NODES.slice(),
      ipfsGateways: userOptions.ipfsGateways || DEFAULT_IPFS_GATEWAYS.slice(),
      petArt: Object.assign({}, EMBEDDED_PET_ART, userOptions.petArt || {}),
      theme: userOptions.theme || {},
      storage: userOptions.storage || makeLocalStorageAdapter('slimegachi'),
      getOwnedPets: userOptions.getOwnedPets || null,   // resolved below
      showDevPanel: !!userOptions.showDevPanel,
      onError: onError
    };
    if (!options.getOwnedPets) {
      options.getOwnedPets = makeDefaultGetOwnedPets(options);
    }

    /* ----- DOM setup ----- */
    container.classList.add('slimegachi-root');
    container.innerHTML = widgetHTML(options.showDevPanel);

    /* Apply theme overrides */
    Object.keys(options.theme).forEach((k) => {
      container.style.setProperty('--slimegachi-' + k, options.theme[k]);
    });

    const $ = (sel) => container.querySelector('[data-sg="' + sel + '"]');
    const $all = (sel) => container.querySelectorAll('[data-sg="' + sel + '"]');

    /* ----- State ----- */
    const State = {
      account: null,
      ownedPets: [],
      view: 'shelf',
      activeKey: null,
      pets: {},
      coins: 0,
      achievements: {},
      lastLoginDay: null,
      loginStreak: 0,
      thrivingStartTime: null,
      saveTimer: null,
      activeEvent: null,
      toyBuff: false,
      activeGame: null,
      devTimeOffset: 0,
      quests: { day: null, slate: [] },         /* daily quest slate, refreshed at local midnight */
      collection: {                              /* career-long collection stats */
        totalActions: 0,
        foodsTried: {},
        gamesPlayed: {},
        milestonesReached: 0
      },
      stubMode: !userOptions.accountId && !userOptions.getOwnedPets  /* default to stub if no wallet info */
    };

    /* ----- Internal event bus -----
       Used by quests, leveling, collection. Distinct from the public
       `safeEmit`, which is for the host site's analytics/integration. */
    const internalListeners = {};
    function onInternal(name, fn) {
      if (!internalListeners[name]) internalListeners[name] = [];
      internalListeners[name].push(fn);
    }
    function emitInternal(name, payload) {
      const ls = internalListeners[name];
      if (!ls) return;
      for (const fn of ls) {
        try { fn(payload); } catch (e) { console.error('SLIMEgachi internal listener threw:', name, e); }
      }
    }

    /* ----- Sound wiring -----
       Care SFX and the mini-game end jingle ride the internal event bus so
       action handlers stay sound-agnostic. Per-event cues (achievement,
       coin, mini-game hits) are fired inline at their source. */
    const CARE_SFX = { feed: 'feed', clean: 'clean', sleep: 'sleep' };
    onInternal('care_action', (ev) => { Sound.play(CARE_SFX[ev.action] || 'click'); });
    onInternal('milestone', () => { Sound.play('levelup'); });
    onInternal('minigame_complete', (ev) => { if (!ev.forfeit) Sound.play('gameover'); });

    function now() { return Date.now() + State.devTimeOffset; }

    /* Storage keys. Per-pet gameplay state is keyed by {tokenId, serial} so it
       survives NFT trades and syncs across devices (a pet's care history follows
       the NFT, not the wallet). Player-level state — coins, login streak,
       achievements, quests, collection — is inherently per-person, so it stays
       keyed by account. */
    function petStorageKey(serial) {
      /* Demo/stub play is a throwaway sandbox — keep it out of the real
         {tokenId, serial} namespace so it never collides with a live holder's
         pet record for the same serial. */
      return (State.stubMode ? 'demo:' : '') + 'pet:' + options.tokenId + ':' + serial;
    }
    function playerStorageKey() { return 'player:' + (State.account || 'stub'); }

    /* ----- Persistence ----- */
    async function persist() {
      if (State.saveTimer) clearTimeout(State.saveTimer);
      State.saveTimer = setTimeout(async () => {
        try {
          /* Player record (per account) */
          await options.storage.save(playerStorageKey(), {
            coins: State.coins,
            achievements: State.achievements,
            lastLoginDay: State.lastLoginDay,
            loginStreak: State.loginStreak,
            thrivingStartTime: State.thrivingStartTime,
            quests: State.quests,
            collection: State.collection
          });
          /* Per-pet records (per {tokenId, serial}) */
          for (const k of Object.keys(State.pets)) {
            const p = State.pets[k];
            await options.storage.save(petStorageKey(p.serial), {
              stats: p.stats,
              lastTick: p.lastTick,
              sick: p.sick,
              care_count: p.care_count,
              name: p.name
            });
          }
        } catch (e) { /* silent */ }
      }, SAVE_DEBOUNCE_MS);
    }

    /* ----- Currency ----- */
    const Currency = {
      getBalance: () => State.coins,
      spend(amt, reason) {
        if (State.coins < amt) return false;
        State.coins -= amt;
        renderCoins();
        safeEmit('onCoinsChanged', { balance: State.coins, delta: -amt, reason: reason });
        persist();
        return true;
      },
      earn(amt, reason) {
        State.coins += amt;
        renderCoins();
        if (amt > 0) Sound.play('coin');
        safeEmit('onCoinsChanged', { balance: State.coins, delta: amt, reason: reason });
        persist();
      }
    };
    function renderCoins() {
      $('coins-val').textContent = State.coins;
      const sc = $('shop-coins'), fc = $('feed-coins');
      if (sc) sc.textContent = State.coins;
      if (fc) fc.textContent = State.coins;
    }

    /* ----- Status banner ----- */
    function setStatus(msg, tone) {
      const b = $('status');
      if (!b) return;
      b.classList.remove('slimegachi-info', 'slimegachi-error');
      if (msg) {
        b.textContent = msg;
        b.classList.add('slimegachi-show', tone === 'info' ? 'slimegachi-info' : 'slimegachi-error');
      } else {
        b.classList.remove('slimegachi-show');
        b.textContent = '';
      }
    }

    /* ----- Time / day-night ----- */
    function gameHour() {
      const d = new Date(now());
      return d.getHours() + d.getMinutes() / 60;
    }
    function isPetSleeping(petId) {
      const def = PET_DEFS[petId];
      if (!def || !def.sleepWindow) return false;
      const s = def.sleepWindow[0], e = def.sleepWindow[1];
      const h = gameHour();
      if (s < e) return h >= s && h < e;
      return h >= s || h < e;
    }
    function timePhase() {
      const h = gameHour();
      if (h >= 6  && h < 8)  return 'dawn';
      if (h >= 8  && h < 18) return 'day';
      if (h >= 18 && h < 21) return 'dusk';
      return 'night';
    }
    function applyTimeTint() {
      const phase = timePhase();
      const p = activePet();
      let top = '#2a1f3f', bot = '#1a1428';
      if (p) {
        const def = PET_DEFS[p.pet];
        if (phase === 'day')        { top = def.skyDay[0];  bot = def.skyDay[1]; }
        else if (phase === 'dusk')  { top = mixHex(def.skyDay[0], def.skyDusk[0]); bot = mixHex(def.skyDay[1], def.skyDusk[1]); }
        else if (phase === 'night') { top = def.skyDusk[0]; bot = def.skyDusk[1]; }
        else if (phase === 'dawn')  { top = mixHex(def.skyDusk[0], def.skyDay[0]); bot = mixHex(def.skyDusk[1], def.skyDay[1]); }
      } else {
        if (phase === 'day')  { top = '#3a3055'; bot = '#1a1428'; }
        else if (phase === 'dusk') { top = '#3d2645'; bot = '#1a1428'; }
        else if (phase === 'dawn') { top = '#3d3045'; bot = '#1a1428'; }
      }
      container.style.setProperty('--slimegachi-bg-top', top);
      container.style.setProperty('--slimegachi-bg-bot', bot);
      /* Adaptive HUD ink: the care name/mood/vitals are light-on-dark by default,
         but bright daytime skies (Kitten/Monkey) wash them out. Flip the HUD to
         dark-on-light when the sky is light. Weight the top colour higher since
         the HUD hugs the top edge. */
      const skyLuma = relLuma(top) * 0.6 + relLuma(bot) * 0.4;
      container.classList.toggle('slimegachi-lightsky', skyLuma > 0.6);
    }
    /* Perceived luminance (0–1) of a #rrggbb colour. */
    function relLuma(hex) {
      const c = hexToRgb(hex);
      return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    }

    /* ----- Pet state helpers ----- */
    function freshStats() { return { hunger: 80, happy: 80, energy: 80, clean: 90 }; }
    /* In-memory key for State.pets. Account-independent (keyed by serial within
       the token) so a pet's state is the same object regardless of who holds it. */
    function petKey(owned) { return options.tokenId + '-' + owned.serial; }
    function activePet() { return State.activeKey ? State.pets[State.activeKey] : null; }
    async function ensurePetState(owned) {
      const k = petKey(owned);
      if (!State.pets[k]) {
        /* Load this pet's own record (by {tokenId, serial}); fall back to fresh. */
        const rec = await options.storage.load(petStorageKey(owned.serial));
        State.pets[k] = {
          stats: (rec && rec.stats) || freshStats(),
          lastTick: (rec && rec.lastTick) || now(),
          name: owned.name, pet: owned.pet, serial: owned.serial,
          traits: owned.traits || {},
          sick: (rec && rec.sick) || false,
          care_count: (rec && rec.care_count) || 0
        };
      } else {
        State.pets[k].name = owned.name;
        State.pets[k].traits = owned.traits || State.pets[k].traits;
        if (State.pets[k].sick === undefined) State.pets[k].sick = false;
        if (State.pets[k].care_count === undefined) State.pets[k].care_count = 0;
      }
      return State.pets[k];
    }
    function addStat(stat, amt) {
      const p = activePet();
      if (!p) return;
      p.stats[stat] = clamp((p.stats[stat] || 0) + amt, 0, 100);
    }
    function setSick(v) { const p = activePet(); if (p) p.sick = v; }
    function currentMood(stats) {
      const avg = (stats.hunger + stats.happy + stats.energy + stats.clean) / 4;
      if (stats.energy < 18) return 'sleepy';
      if (avg < 30) return 'sad';
      if (avg > 75) return 'happy';
      return 'okay';
    }

    /* ----- Decay tick ----- */
    function applyDecay() {
      const t = now();
      for (const k of Object.keys(State.pets)) {
        const p = State.pets[k];
        const dtMs = t - p.lastTick;
        if (dtMs <= 0) continue;
        const dtHours = dtMs / 3600000;
        const def = PET_DEFS[p.pet];
        if (!def || !def.decay) { p.lastTick = t; continue; }
        const mult = (k === State.activeKey) ? 1.0 : PASSIVE_DECAY_MULTIPLIER;
        const sickMult = p.sick ? 1.4 : 1.0;
        const lvlMult = petDecayMultiplier(k);
        for (const stat of ['hunger', 'happy', 'energy', 'clean']) {
          const rate = def.decay[stat] || 0;
          p.stats[stat] = clamp(p.stats[stat] - rate * dtHours * mult * sickMult * lvlMult, 0, 100);
        }
        p.lastTick = t;
      }
      checkPassiveAchievements();
    }

    /* ----- Actions ----- */
    function applyAction(action) {
      if (State.view !== 'care' || !State.activeKey) return;
      const p = activePet();
      if (!p) return;
      applyDecay();
      if (action === 'feed') { openFeedModal(); return; }
      if (action === 'play') { launchMiniGame(); return; }

      const sleeping = isPetSleeping(p.pet);
      let multiplier = 1.0;
      let suffix = '';
      if (action === 'sleep' && sleeping)        { multiplier = SLEEP_BONUS_MULT; suffix = ' (bonus!)'; }
      else if (sleeping && action !== 'sleep')   { multiplier = WRONG_TIME_PENALTY; suffix = ' (sleepy)'; addStat('happy', -3); }

      const boosts = action === 'sleep' ? { energy: 40 } : action === 'clean' ? { clean: 40 } : {};
      const sideEffects = action === 'clean' ? { happy: -2 } : {};

      /* Anti-spam: clean/sleep only earn care credit (and thus level progress)
         when the relevant stat was below its threshold beforehand. */
      const rewardsCare = action === 'clean' ? (p.stats.clean  < CLEAN_CARE_THRESHOLD)
                        : action === 'sleep' ? (p.stats.energy < SLEEP_CARE_THRESHOLD)
                        : true;

      for (const [stat, amt] of Object.entries(boosts)) {
        p.stats[stat] = clamp(p.stats[stat] + amt * multiplier, 0, 100);
      }
      for (const [stat, amt] of Object.entries(sideEffects)) {
        p.stats[stat] = clamp(p.stats[stat] + amt, 0, 100);
      }

      const label = action === 'sleep' ? 'Zzz' : 'Squeaky!';
      spawnActionFeedback(label + suffix, false);
      triggerCareAnimation(action);
      /* Per-action emote */
      if (action === 'sleep') spawnEmote('💤');
      else if (action === 'clean') { spawnEmote('🫧'); setTimeout(() => spawnEmote('💧'), 200); }
      renderStats();
      fireAchievement('firstSteps');
      if (action === 'sleep' && sleeping) Currency.earn(3, 'tucked_in');
      checkPassiveAchievements();
      safeEmit('onCareAction', { action: action, petSerial: p.serial, petType: p.pet, stats: Object.assign({}, p.stats) });
      emitInternal('care_action', { action: action, petSerial: p.serial, petType: p.pet, petKey: State.activeKey, rewardsCare: rewardsCare });
      scheduleBlink();
      persist();
    }
    function applyFood(foodId) {
      const food = FOODS[foodId];
      if (!food) return;
      const p = activePet();
      if (!p) return;
      if (food.cost > 0 && !Currency.spend(food.cost, 'food:' + foodId)) return;
      applyDecay();
      const wasSick = p.sick;                 // capture before a remedy clears it
      const hungryBefore = p.stats.hunger;    // capture before the hunger boost
      const def = PET_DEFS[p.pet];
      const isFav = def.favoriteFood === foodId;
      const mult = isFav ? 1.5 : 1.0;
      const sleeping = isPetSleeping(p.pet);
      const timeMult = sleeping ? WRONG_TIME_PENALTY : 1.0;
      if (food.healsSick) p.sick = false;
      if (food.isToy) {
        State.toyBuff = true;
        spawnActionFeedback('Toy ready!', false);
        triggerCareAnimation('play');
        persist();
        closeFeedModal();
        return;
      }
      p.stats.hunger = clamp(p.stats.hunger + food.hunger * mult * timeMult, 0, 100);
      p.stats.happy  = clamp(p.stats.happy  + food.happy  * mult * timeMult, 0, 100);
      p.stats.clean  = clamp(p.stats.clean  + food.clean, 0, 100);
      spawnActionFeedback(food.name + (isFav ? ' ' + EMOTE_ICONS['💖'] : '') + (sleeping ? ' (sleepy)' : ''), isFav);
      triggerCareAnimation('feed');
      triggerMouthChew();
      if (isFav) { spawnEmote('💖'); setTimeout(() => spawnEmote('⭐'), 220); }
      renderStats();
      fireAchievement('firstSteps');
      if (isFav) fireAchievement('pickyEater');
      checkPassiveAchievements();
      safeEmit('onCareAction', { action: 'feed', food: foodId, petSerial: p.serial, petType: p.pet, stats: Object.assign({}, p.stats) });
      /* Anti-spam: feeding only earns care credit when the pet was actually
         hungry, or when a remedy (medicine) cured a genuinely sick pet. */
      const rewardsCare = Boolean((hungryBefore < FEED_CARE_THRESHOLD) || (food.healsSick && wasSick));
      emitInternal('care_action', { action: 'feed', food: foodId, isFavoriteFood: isFav, petSerial: p.serial, petType: p.pet, petKey: State.activeKey, rewardsCare: rewardsCare });
      persist();
      closeFeedModal();
    }

    /* ----- Achievements ----- */
    function fireAchievement(id) {
      if (!ACHIEVEMENTS[id]) return;
      if (State.achievements[id] && State.achievements[id].unlockedAt) return;
      State.achievements[id] = { unlockedAt: now(), claimed: false };
      showAchNotif(id);
      Sound.play('achievement');
      /* Sparkle burst on achievement */
      if (State.view === 'care') {
        spawnEmote('✨');
        setTimeout(() => spawnEmote('🌟'), 180);
        setTimeout(() => spawnEmote('✨'), 360);
      }
      safeEmit('onAchievement', { id: id, name: ACHIEVEMENTS[id].name, mintable: ACHIEVEMENTS[id].mintable });
      persist();
    }
    function checkPassiveAchievements() {
      const p = activePet();
      if (p) {
        const s = p.stats;
        if (s.hunger > 80 && s.happy > 80 && s.energy > 80 && s.clean > 80) fireAchievement('squeakyClean');
        const thriving = currentMood(s) === 'happy';
        if (thriving) {
          if (!State.thrivingStartTime) State.thrivingStartTime = now();
          else if (now() - State.thrivingStartTime >= 24 * 3600 * 1000) fireAchievement('whisperer');
        } else {
          State.thrivingStartTime = null;
        }
      }
      if (State.loginStreak >= 7) fireAchievement('devoted');
    }
    function showAchNotif(id) {
      const a = ACHIEVEMENTS[id];
      if (!a) return;
      const n = $('ach-notif');
      $('ach-notif-name').innerHTML = a.icon + ' ' + a.name;
      n.classList.add('slimegachi-show');
      setTimeout(() => n.classList.remove('slimegachi-show'), 3800);
    }

    /* ----- Login streak ----- */
    function checkLoginStreak() {
      const today = new Date(now()).toISOString().slice(0, 10);
      if (State.lastLoginDay === today) return;
      if (State.lastLoginDay) {
        const last = new Date(State.lastLoginDay).getTime();
        const t = new Date(today).getTime();
        const days = Math.round((t - last) / (24 * 3600 * 1000));
        State.loginStreak = days === 1 ? (State.loginStreak || 0) + 1 : 1;
      } else {
        State.loginStreak = 1;
      }
      State.lastLoginDay = today;
      if (State.loginStreak === 1) Currency.earn(10, 'daily_login');
      else if (State.loginStreak >= 2) Currency.earn(10 + Math.min(State.loginStreak * 2, 30), 'streak_login');
      if (State.loginStreak === 5) setTimeout(() => triggerEvent('treasure'), 2000);
      persist();
    }

    /* ----- Speech & events ----- */
    let bubbleTimer = null;
    function scheduleNextBubble() {
      if (bubbleTimer) clearTimeout(bubbleTimer);
      if (State.view !== 'care') return;
      const delay = SPEECH_INTERVAL_MS + (Math.random() - 0.5) * 12000;
      bubbleTimer = setTimeout(showBubble, delay);
    }
    function showBubble() {
      if (State.view !== 'care') return;
      const p = activePet();
      if (!p) return;
      const sleeping = isPetSleeping(p.pet);
      const mood = sleeping ? 'sleepy' : currentMood(p.stats);
      const lines = (SPEECH[p.pet] && SPEECH[p.pet][mood]) || [];
      if (lines.length === 0) { scheduleNextBubble(); return; }
      const line = lines[Math.floor(Math.random() * lines.length)];
      const bub = $('speech');
      bub.innerHTML = line;
      bub.style.display = 'block';
      const img = $('petimg'), stage = $('stage');
      const imgR = img.getBoundingClientRect();
      const stageR = stage.getBoundingClientRect();
      bub.style.left = clamp(imgR.left - stageR.left + imgR.width * 0.5 - 80, 12, stageR.width - 172) + 'px';
      bub.style.top  = clamp(imgR.top - stageR.top - 50, 60, stageR.height - 80) + 'px';
      requestAnimationFrame(() => bub.classList.add('slimegachi-show'));
      if (mood !== 'sleepy') triggerMouthTalk();
      setTimeout(() => {
        bub.classList.remove('slimegachi-show');
        setTimeout(() => { bub.style.display = 'none'; }, 350);
      }, 3800);
      scheduleNextBubble();
    }

    const EVENTS = {
      foundCoin: {
        icon: MISC_ICONS.coin, autoResolve: true,
        apply() { State.coins += 5; addStat('happy', 2); renderCoins(); return '+5 ' + MISC_ICONS.coin; }
      },
      petSick: {
        icon: MISC_ICONS.sick, autoResolve: false,
        apply() { setSick(true); return 'Buy Medicine in the shop'; }
      },
      treasure: {
        icon: ACH_ICONS.diamond, autoResolve: true,
        apply() { State.coins += 30; addStat('happy', 8); renderCoins(); return '+30 ' + MISC_ICONS.coin + ' +8 ' + EMOTE_ICONS['💖']; }
      }
    };
    let eventCheckTimer = null;
    function scheduleEventCheck() {
      if (eventCheckTimer) clearTimeout(eventCheckTimer);
      if (State.view !== 'care') return;
      eventCheckTimer = setTimeout(maybeTriggerEvent, EVENT_CHECK_INTERVAL_MS);
    }
    function maybeTriggerEvent() {
      if (State.view !== 'care' || State.activeEvent) { scheduleEventCheck(); return; }
      const p = activePet();
      if (!p) { scheduleEventCheck(); return; }
      if (p.stats.clean < 25 && !p.sick && Math.random() < 0.5) { triggerEvent('petSick'); return; }
      const phase = timePhase();
      if ((phase === 'day' || phase === 'dusk') && Math.random() < 0.25) { triggerEvent('foundCoin'); return; }
      scheduleEventCheck();
    }
    function triggerEvent(eventId) {
      const ev = EVENTS[eventId];
      if (!ev) return;
      State.activeEvent = { eventId: eventId, expiresAt: now() + 30000 };
      const icon = $('event-icon');
      icon.innerHTML = ev.icon;
      icon.classList.add('slimegachi-show');
      const img = $('petimg'), stage = $('stage');
      const imgR = img.getBoundingClientRect(), stageR = stage.getBoundingClientRect();
      icon.style.left = (imgR.right - stageR.left - 30) + 'px';
      icon.style.top  = (imgR.top - stageR.top + 20) + 'px';
      icon.onclick = () => resolveEvent();
      if (ev.autoResolve) setTimeout(() => { if (State.activeEvent && State.activeEvent.eventId === eventId) resolveEvent(); }, 8000);
      scheduleEventCheck();
    }
    function resolveEvent() {
      if (!State.activeEvent) return;
      const ev = EVENTS[State.activeEvent.eventId];
      if (!ev) return;
      const result = ev.apply();
      $('event-icon').classList.remove('slimegachi-show');
      State.activeEvent = null;
      if (result) spawnActionFeedback(result, true);
      renderStats();
      persist();
    }

    /* ----- Background canvas ----- */
    const bgCanvas = container.querySelector('.slimegachi-bg-canvas');
    const bgCtx = bgCanvas.getContext('2d');
    let dpr = window.devicePixelRatio || 1;
    let bgParticles = [];

    function resize() {
      const ar = container.getBoundingClientRect();
      bgCanvas.width = ar.width * dpr;
      bgCanvas.height = ar.height * dpr;
      bgCanvas.style.width = ar.width + 'px';
      bgCanvas.style.height = ar.height + 'px';
      try { bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {}
      const mc = $('minigame-canvas');
      if (mc) {
        const ms = $('minigame-stage').getBoundingClientRect();
        mc.width = ms.width * dpr;
        mc.height = ms.height * dpr;
        mc.style.width = ms.width + 'px';
        mc.style.height = ms.height + 'px';
      }
    }
    function initBgParticles() {
      bgParticles = [];
      const ar = container.getBoundingClientRect();
      for (let i = 0; i < 22; i++) {
        bgParticles.push({ x: Math.random() * ar.width, y: Math.random() * ar.height, r: 1 + Math.random() * 2, vy: 0.06 + Math.random() * 0.15, alpha: 0.1 + Math.random() * 0.25 });
      }
    }
    function drawBackground() {
      if (!bgCtx) return;
      const ar = container.getBoundingClientRect();
      bgCtx.clearRect(0, 0, ar.width, ar.height);
      const phase = timePhase();
      const particleColor = (phase === 'night') ? '255,255,255' : '169,142,212';
      for (const p of bgParticles) {
        p.y -= p.vy;
        if (p.y < -10) { p.y = ar.height + 10; p.x = Math.random() * ar.width; }
        bgCtx.fillStyle = 'rgba(' + particleColor + ',' + p.alpha + ')';
        bgCtx.beginPath();
        bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        bgCtx.fill();
      }
    }

    /* ----- Pet animation ----- */
    let petAnim = { startTime: 0, action: null, actionStart: 0 };
    function triggerCareAnimation(action) {
      petAnim.action = action;
      petAnim.actionStart = performance.now();
    }
    function updatePetAnimation() {
      if (State.view !== 'care' || !State.activeKey) return;
      const p = activePet();
      if (!p) return;
      const def = PET_DEFS[p.pet];
      const sleeping = isPetSleeping(p.pet);
      const t = (performance.now() - petAnim.startTime) / 1000;
      const breathRate = sleeping ? 1.0 : 2.0;
      let bounce = 0;
      let squish = 1 + Math.sin(t * breathRate) * 0.025 * (def.bouncyness || 1);
      let wobble = 0;
      if (petAnim.action) {
        const elapsed = (performance.now() - petAnim.actionStart) / 1000;
        const dur = 0.9;
        if (elapsed > dur) petAnim.action = null;
        else {
          const x = elapsed / dur;
          if (petAnim.action === 'play')       { const j = Math.sin(x * Math.PI); bounce = -j * 70 * (def.bouncyness || 1); squish = 1 + Math.sin(x * Math.PI * 2) * 0.08; }
          else if (petAnim.action === 'feed')  { squish = 1 + Math.sin(x * Math.PI * 4) * 0.07; }
          else if (petAnim.action === 'sleep') { bounce = Math.sin(x * Math.PI) * -6; }
          else if (petAnim.action === 'clean') { wobble = Math.sin(x * Math.PI * 6) * 5; }
        }
      }
      /* Happy idle: gentle sway when pet's been happy for a few seconds */
      if (happyBob.startTime && !petAnim.action) {
        const happyT = (performance.now() - happyBob.startTime) / 1000;
        if (happyT > 1.5) { /* warm-up */
          wobble += Math.sin(t * 1.6) * 3.0;
          bounce += Math.sin(t * 1.6 + Math.PI / 2) * -2.5;
        }
      }
      const petImgEl = $('petimg');
      petImgEl.style.setProperty('--slimegachi-bounce', bounce.toFixed(2) + 'px');
      petImgEl.style.setProperty('--slimegachi-squish', squish.toFixed(3));
      petImgEl.style.setProperty('--slimegachi-wobble', wobble.toFixed(2) + 'deg');
      const mood = currentMood(p.stats);
      petImgEl.classList.toggle('slimegachi-sleeping', mood === 'sleepy' || sleeping || petAnim.action === 'sleep');
      petImgEl.classList.toggle('slimegachi-sad', mood === 'sad' && !sleeping);
      petImgEl.classList.toggle('slimegachi-happy', mood === 'happy' && !sleeping);
      petImgEl.classList.toggle('slimegachi-sick', !!p.sick);
    }

    /* ----- Shelf ----- */
    function renderShelf() {
      const grid = $('shelf-grid');
      grid.innerHTML = '';
      const ownedByPet = {};
      for (const o of State.ownedPets) if (!ownedByPet[o.pet]) ownedByPet[o.pet] = o;

      for (const petId of PET_ORDER) {
        const def = PET_DEFS[petId];
        const slot = document.createElement('div');
        slot.className = 'slimegachi-slot';
        const owned = ownedByPet[petId];
        const isLocked = def.status === 'locked';
        const artUrl = options.petArt[petId] || '';

        if (isLocked) {
          slot.classList.add('slimegachi-locked');
          slot.innerHTML = '<img class="slimegachi-slot-art" src="' + artUrl + '" alt=""><div class="slimegachi-slot-sublabel">' + (def.sublabel || '') + '</div><div class="slimegachi-slot-label">' + def.label + '</div><div class="slimegachi-slot-badge">Locked</div>';
        } else if (owned) {
          slot.classList.add('slimegachi-owned');
          slot.innerHTML = '<img class="slimegachi-slot-art" src="' + artUrl + '" alt=""><div class="slimegachi-slot-sublabel">#' + owned.serial + '</div><div class="slimegachi-slot-label">' + def.label + '</div>';
          slot.addEventListener('click', () => enterCare(owned));
        } else {
          slot.classList.add('slimegachi-unowned');
          slot.innerHTML = '<img class="slimegachi-slot-art" src="' + artUrl + '" alt=""><div class="slimegachi-slot-sublabel">Not Owned</div><div class="slimegachi-slot-label">' + def.label + '</div><div class="slimegachi-slot-badge">Hold to Play</div>';
        }
        grid.appendChild(slot);
      }
    }
    function animateShelf() {
      if (State.view !== 'shelf') return;
      const slots = container.querySelectorAll('.slimegachi-slot');
      const t = performance.now() / 1000;
      slots.forEach((s, i) => {
        const arts = s.querySelectorAll('.slimegachi-slot-art');
        const breath = 1 + Math.sin(t * 1.4 + i * 0.7) * 0.025;
        arts.forEach((a) => {
          a.style.transform = 'translate(-50%, -50%) scaleY(' + breath.toFixed(3) + ') scaleX(' + (2 - breath).toFixed(3) + ')';
        });
      });
    }

    /* ----- Stats UI ----- */
    const STAT_COLOR = { hunger: '#ff9966', happy: '#ffd966', energy: '#66c4ff', clean: '#7fffd4' };
    function renderStats() {
      if (!State.activeKey) return;
      const p = activePet();
      if (!p) return;
      for (const stat of ['hunger', 'happy', 'energy', 'clean']) {
        const v = Math.round(p.stats[stat]);
        $('val-' + stat).textContent = v;
        const ring = $('bar-' + stat);
        ring.style.setProperty('--pct', v);
        ring.style.setProperty('--col', v < 25 ? '#ff5577' : STAT_COLOR[stat]);
      }
      $('petname').textContent = p.name;
      const sleeping = isPetSleeping(p.pet);
      let moodLabel;
      if (p.sick) moodLabel = 'Sick';
      else if (sleeping) moodLabel = 'Sleeping';
      else moodLabel = ({ happy: 'Thriving', okay: 'Content', sad: 'Needs Attention', sleepy: 'Sleepy' })[currentMood(p.stats)] || '';
      $('petmood').textContent = moodLabel;
      /* Level badge with progress dots */
      const lvlEl = $('petlevel');
      if (lvlEl) {
        const prog = progressToNextLevel(p.care_count || 0);
        let badge = 'Lv ' + prog.lvl;
        if (prog.lvl < MAX_LEVEL) {
          /* 5-dot progress indicator. Round up so any progress shows >=1 dot. */
          const raw = prog.frac * 5;
          const filled = raw > 0 && raw < 1 ? 1 : Math.round(raw);
          badge += ' ' + '●'.repeat(filled) + '○'.repeat(5 - filled);
        } else {
          badge += ' ' + ACH_ICONS.star + ' MAX';
        }
        lvlEl.innerHTML = badge;
      }
    }
    function spawnActionFeedback(label, isFav) {
      const stage = $('stage');
      const f = document.createElement('div');
      f.className = 'slimegachi-feedback';
      f.innerHTML = label;
      const rect = stage.getBoundingClientRect();
      f.style.left = (rect.width / 2) + 'px';
      f.style.top  = (rect.height * 0.42) + 'px';
      f.style.color = isFav ? '#ffb3d9' : '#00a1d4';
      stage.appendChild(f);
      setTimeout(() => f.remove(), 1300);
    }

    /* Decode petArt entry (data URI or raw SVG string) to raw SVG markup.
       Falls back to <img> embedding for non-SVG / unknown formats. */
    function decodePetArt(entry) {
      if (!entry) return '';
      if (typeof entry !== 'string') return '';
      if (entry.indexOf('<svg') !== -1) return entry;
      if (entry.indexOf('data:image/svg+xml;base64,') === 0) {
        try {
          const b64 = entry.split(',')[1];
          return atob(b64);
        } catch (e) { return ''; }
      }
      if (entry.indexOf('data:image/svg+xml;utf8,') === 0 || entry.indexOf('data:image/svg+xml,') === 0) {
        try { return decodeURIComponent(entry.split(',')[1]); } catch (e) { return ''; }
      }
      /* It's a URL or some other image format — fall back to <img> */
      return '<img src="' + entry.replace(/"/g, '&quot;') + '" alt="" style="width:100%;height:100%;object-fit:contain">';
    }

    function setPetArt(petType) {
      const wrapper = $('petimg');
      const raw = decodePetArt(options.petArt[petType] || '');
      wrapper.innerHTML = raw;
      const svg = wrapper.querySelector('svg');
      if (svg) {
        /* Ensure SVG scales to wrapper */
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }
    }

    /* ----- View transitions ----- */
    /* Pick the background track for whatever scene we're now in. Safe to
       call after any view change (reads State.view + active pet/game). */
    function musicForCurrentView() {
      const p = State.activeKey ? State.pets[State.activeKey] : null;
      if (State.view === 'minigame' && p) {
        const def = PET_DEFS[p.pet];
        Music.setScene('minigame', def && def.favoriteGame === 'bananacatch' ? 'bananacatch' : 'bubblepop');
      } else if (State.view === 'care' && p) {
        Music.setScene('care', p.pet);
      } else {
        Music.setScene('shelf');
      }
    }

    function enterCare(owned) {
      ensurePetState(owned);
      State.activeKey = petKey(owned);
      State.view = 'care';
      setPetArt(owned.pet);
      musicForCurrentView();
      $('shelf').classList.add('slimegachi-hide');
      $('stats').classList.add('slimegachi-show');
      $('petheader').classList.add('slimegachi-show');
      $('carestage').classList.add('slimegachi-show');
      $('floor').classList.add('slimegachi-show');
      $('bottombar').classList.add('slimegachi-show');
      $('back').classList.add('slimegachi-show');
      petAnim.startTime = performance.now();
      petAnim.action = null;
      applyDecay();
      renderStats();
      applyTimeTint();
      scheduleNextBubble();
      scheduleEventCheck();
      scheduleBlink();
      safeEmit('onPetOpen', { petSerial: owned.serial, petType: owned.pet });
      persist();
    }
    function backToShelf() {
      State.view = 'shelf';
      State.activeKey = null;
      musicForCurrentView();
      $('shelf').classList.remove('slimegachi-hide');
      $('stats').classList.remove('slimegachi-show');
      $('petheader').classList.remove('slimegachi-show');
      $('carestage').classList.remove('slimegachi-show');
      $('floor').classList.remove('slimegachi-show');
      $('bottombar').classList.remove('slimegachi-show');
      $('back').classList.remove('slimegachi-show');
      const img = $('petimg');
      img.classList.remove('slimegachi-sleeping', 'slimegachi-sad', 'slimegachi-happy', 'slimegachi-sick');
      if (bubbleTimer) clearTimeout(bubbleTimer);
      if (eventCheckTimer) clearTimeout(eventCheckTimer);
      if (blinkTimer) clearTimeout(blinkTimer);
      $('speech').style.display = 'none';
      $('event-icon').classList.remove('slimegachi-show');
      State.activeEvent = null;
      applyTimeTint();
      safeEmit('onShelfReturn', {});
      persist();
    }

    /* ----- Eye blinking & pupil tracking ----- */
    let blinkTimer = null;
    const pupilState = { tx: 0, ty: 0 }; /* current pupil offset in viewBox units */
    const pupilTarget = { tx: 0, ty: 0 }; /* eased toward this */
    const PUPIL_MAX_OFFSET = 0.8; /* viewBox units — keep pupils inside socket */

    /* Mouth animation: 'idle' | 'chew' | 'talk'. Chew is short-lived; talk
       runs while a speech bubble is up; idle is a flat 1.0 scale. */
    const mouthAnim = { state: 'idle', startTime: 0, duration: 900 };

    /* Happy head bob — kicks in when pet has been happy continuously > 5s */
    const happyBob = { startTime: 0 };

    /* Emote floaters queue */
    const emoteQueue = [];

    function spawnEmote(emoji) {
      if (State.view !== 'care') return;
      const stage = $('stage');
      const wrapper = $('petimg');
      if (!stage || !wrapper) return;
      const wRect = wrapper.getBoundingClientRect();
      const sRect = stage.getBoundingClientRect();
      const el = document.createElement('div');
      el.className = 'slimegachi-emote';
      if (EMOTE_ICONS[emoji]) el.innerHTML = EMOTE_ICONS[emoji];
      else el.textContent = emoji;
      /* Position above the pet, with some randomness so multiple don't stack */
      const drift = (Math.random() - 0.5) * 60;
      el.style.left = (wRect.left - sRect.left + wRect.width * 0.5 + drift) + 'px';
      el.style.top  = (wRect.top - sRect.top + wRect.height * 0.18) + 'px';
      stage.appendChild(el);
      setTimeout(() => el.remove(), 1600);
    }

    function triggerMouthChew() { mouthAnim.state = 'chew'; mouthAnim.startTime = performance.now(); mouthAnim.duration = 900; }
    function triggerMouthTalk() { mouthAnim.state = 'talk'; mouthAnim.startTime = performance.now(); mouthAnim.duration = 3500; }

    function updateMouthAndBob() {
      if (State.view !== 'care' || !State.activeKey) return;
      const wrapper = $('petimg');
      if (!wrapper) return;
      const p = activePet();
      const sleeping = isPetSleeping(p.pet);

      /* --- Mouth --- */
      const mouth = wrapper.querySelector('.sg-mouth');
      if (mouth) {
        let scaleY = 1;
        let translateY = 0;
        if (mouthAnim.state !== 'idle') {
          const elapsed = performance.now() - mouthAnim.startTime;
          if (elapsed > mouthAnim.duration) {
            mouthAnim.state = 'idle';
          } else if (mouthAnim.state === 'chew') {
            /* Fast munching: 3 cycles over the duration */
            const phase = (elapsed / mouthAnim.duration) * Math.PI * 6;
            scaleY = 1 + Math.abs(Math.sin(phase)) * 1.2;
            translateY = Math.abs(Math.sin(phase)) * 0.3;
          } else if (mouthAnim.state === 'talk') {
            /* Gentler opening: 1 small wiggle */
            const phase = (elapsed / mouthAnim.duration) * Math.PI * 4;
            scaleY = 1 + Math.abs(Math.sin(phase)) * 0.5;
          }
        }
        if (sleeping) scaleY = 0.4; /* mouth tiny during sleep */
        mouth.style.transform = 'translateY(' + translateY.toFixed(2) + 'px) scaleY(' + scaleY.toFixed(3) + ')';
      }

      /* --- Happy bob (subtle head-tilt sway when pet is happy) --- */
      const mood = currentMood(p.stats);
      const isHappy = mood === 'happy' && !sleeping && !p.sick;
      if (isHappy) {
        if (!happyBob.startTime) happyBob.startTime = performance.now();
      } else {
        happyBob.startTime = 0;
      }
    }

    /* Probabilistic emote on long-happy idle */
    let lastEmoteCheck = 0;
    function maybeSpawnIdleEmote() {
      if (State.view !== 'care' || !State.activeKey) return;
      const tNow = performance.now();
      if (tNow - lastEmoteCheck < 8000) return; /* check every 8s */
      lastEmoteCheck = tNow;
      const p = activePet();
      if (!p) return;
      const sleeping = isPetSleeping(p.pet);
      if (sleeping || p.sick) return;
      if (happyBob.startTime && tNow - happyBob.startTime > 5000) {
        /* Been happy for 5s+ — small chance to spawn musical note */
        if (Math.random() < 0.4) spawnEmote(Math.random() < 0.5 ? '🎵' : '✨');
      }
    }

    function scheduleBlink() {
      if (blinkTimer) clearTimeout(blinkTimer);
      if (State.view !== 'care') return;
      const p = activePet();
      if (!p) return;
      /* Sleeping pets stay closed; sick pets blink slowly; happy pets normally */
      const sleeping = isPetSleeping(p.pet);
      if (sleeping || (p.stats.energy < 15)) {
        setEyesClosed(true);
        blinkTimer = setTimeout(scheduleBlink, 4000);
        return;
      }
      setEyesClosed(false);
      const interval = 3000 + Math.random() * 4500; /* 3–7.5 sec */
      blinkTimer = setTimeout(() => {
        if (State.view !== 'care') return;
        setEyesClosed(true);
        setTimeout(() => {
          setEyesClosed(false);
          /* 25% chance of a double-blink */
          if (Math.random() < 0.25) {
            setTimeout(() => {
              setEyesClosed(true);
              setTimeout(() => { setEyesClosed(false); scheduleBlink(); }, 130);
            }, 180);
          } else {
            scheduleBlink();
          }
        }, 140);
      }, interval);
    }

    function setEyesClosed(closed) {
      const wrapper = $('petimg');
      if (!wrapper) return;
      const opens = wrapper.querySelectorAll('.sg-eye-open');
      const shuts = wrapper.querySelectorAll('.sg-eye-closed');
      opens.forEach((g) => { g.style.display = closed ? 'none' : ''; });
      shuts.forEach((g) => { g.style.display = closed ? '' : 'none'; });
      /* Hide pupils when eyes are closed (otherwise they'd float over the closed line) */
      const pupils = wrapper.querySelectorAll('.sg-pupil');
      pupils.forEach((g) => { g.style.display = closed ? 'none' : ''; });
    }

    /* Pupil tracking — translate pupils toward the pointer */
    function onPointerMoveForPupils(e) {
      if (State.view !== 'care') return;
      const wrapper = $('petimg');
      if (!wrapper) return;
      const r = wrapper.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / (r.width / 2);  /* -1..1 */
      const dy = (e.clientY - cy) / (r.height / 2);
      const mag = Math.sqrt(dx * dx + dy * dy);
      const cap = Math.min(1, mag);
      const nx = mag > 0.001 ? (dx / mag) * cap : 0;
      const ny = mag > 0.001 ? (dy / mag) * cap : 0;
      pupilTarget.tx = nx * PUPIL_MAX_OFFSET;
      pupilTarget.ty = ny * PUPIL_MAX_OFFSET;
    }

    function updatePupils() {
      /* Easing */
      pupilState.tx += (pupilTarget.tx - pupilState.tx) * 0.12;
      pupilState.ty += (pupilTarget.ty - pupilState.ty) * 0.12;
      if (Math.abs(pupilState.tx) < 0.005 && Math.abs(pupilState.ty) < 0.005 &&
          Math.abs(pupilTarget.tx) < 0.005 && Math.abs(pupilTarget.ty) < 0.005) return;
      const wrapper = $('petimg');
      if (!wrapper) return;
      const pupils = wrapper.querySelectorAll('.sg-pupil');
      const t = 'translate(' + pupilState.tx.toFixed(3) + 'px,' + pupilState.ty.toFixed(3) + 'px)';
      pupils.forEach((g) => { g.style.transform = t; });
    }

    /* =====================================================================
       PROGRESSION SYSTEMS — levels, quests, collection
       ===================================================================== */

    /* ----- Pet leveling -----
       Care actions increment per-pet `care_count`. Reaching a threshold
       triggers a milestone: coin reward + decay-rate reduction (cumulative,
       capped). Levels are derived, not stored separately. */

    const LEVEL_THRESHOLDS = [0, 5, 12, 22, 35, 50, 70, 100, 140, 200, 280];
    const MAX_LEVEL = LEVEL_THRESHOLDS.length - 1;
    const MILESTONE_COIN_REWARDS = [0, 8, 12, 18, 25, 35, 50, 70, 100, 140, 200];

    function levelForCount(c) {
      for (let i = MAX_LEVEL; i >= 0; i--) {
        if (c >= LEVEL_THRESHOLDS[i]) return i;
      }
      return 0;
    }
    function progressToNextLevel(c) {
      const lvl = levelForCount(c);
      if (lvl >= MAX_LEVEL) return { lvl: lvl, frac: 1, current: c, next: c };
      const base = LEVEL_THRESHOLDS[lvl];
      const next = LEVEL_THRESHOLDS[lvl + 1];
      return { lvl: lvl, frac: (c - base) / (next - base), current: c - base, next: next - base };
    }

    /* Decay reduction from levels — 1% per level, applied as a multiplier in applyDecay */
    function petDecayMultiplier(petKey) {
      const p = State.pets[petKey];
      if (!p) return 1.0;
      const lvl = levelForCount(p.care_count || 0);
      return Math.max(0.9, 1 - lvl * 0.01);
    }

    onInternal('care_action', (ev) => {
      const p = State.pets[ev.petKey];
      if (!p) return;
      /* A bath on an already-clean pet earns no level progress (anti-spam). */
      if (ev.rewardsCare === false) return;
      const before = p.care_count || 0;
      p.care_count = before + 1;
      const oldLvl = levelForCount(before);
      const newLvl = levelForCount(p.care_count);
      if (newLvl > oldLvl) {
        /* Milestone! */
        State.collection.milestonesReached = (State.collection.milestonesReached || 0) + 1;
        const reward = MILESTONE_COIN_REWARDS[newLvl] || 0;
        if (reward > 0) Currency.earn(reward, 'level_up:' + newLvl);
        if (State.view === 'care') {
          spawnEmote('🎉');
          setTimeout(() => spawnEmote('⬆️'), 220);
          setTimeout(() => spawnActionFeedback('Lv ' + newLvl + '!', true), 100);
        }
        emitInternal('milestone', { petKey: ev.petKey, level: newLvl, reward: reward });
      }
    });

    /* ----- Quests -----
       Each day generates a slate of 3 from a template pool. Progress ticks
       on relevant internal events. Player claims rewards from the Quests
       modal once a quest's target is met. */

    const QUEST_POOL = [
      {
        id: 'feed_any_3',
        label: 'Feed pets 3 times today',
        target: 3, reward: 10,
        track(ev) { return ev.type === 'care_action' && ev.action === 'feed' ? 1 : 0; }
      },
      {
        id: 'feed_any_6',
        label: 'Feed pets 6 times today',
        target: 6, reward: 16,
        track(ev) { return ev.type === 'care_action' && ev.action === 'feed' ? 1 : 0; }
      },
      {
        id: 'feed_favorite',
        label: 'Feed a pet its favorite food',
        target: 1, reward: 12,
        track(ev) { return ev.type === 'care_action' && ev.action === 'feed' && ev.isFavoriteFood ? 1 : 0; }
      },
      {
        id: 'play_mini',
        label: 'Complete a mini-game',
        target: 1, reward: 8,
        track(ev) { return ev.type === 'minigame_complete' && !ev.forfeit ? 1 : 0; }
      },
      {
        id: 'mini_score_30',
        label: 'Score 30+ in a mini-game',
        target: 1, reward: 12,
        track(ev) { return ev.type === 'minigame_complete' && ev.score >= 30 ? 1 : 0; }
      },
      {
        id: 'mini_score_60',
        label: 'Score 60+ in a mini-game',
        target: 1, reward: 20,
        track(ev) { return ev.type === 'minigame_complete' && ev.score >= 60 ? 1 : 0; }
      },
      {
        id: 'clean_3',
        label: 'Clean pets 3 times today',
        target: 3, reward: 10,
        track(ev) { return ev.type === 'care_action' && ev.action === 'clean' ? 1 : 0; }
      },
      {
        id: 'sleep_2',
        label: 'Put pets to sleep 2 times',
        target: 2, reward: 10,
        track(ev) { return ev.type === 'care_action' && ev.action === 'sleep' ? 1 : 0; }
      },
      {
        id: 'play_action_3',
        label: 'Take 5 care actions today',
        target: 5, reward: 8,
        track(ev) { return ev.type === 'care_action' ? 1 : 0; }
      }
    ];

    function todayKey() { return new Date(now()).toISOString().slice(0, 10); }

    function refreshQuestsIfNewDay() {
      const today = todayKey();
      if (State.quests.day === today && State.quests.slate.length > 0) return false;
      /* Generate a new slate of 3 random quests */
      const shuffled = QUEST_POOL.slice().sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, 3);
      State.quests = {
        day: today,
        slate: picked.map((q) => ({ id: q.id, progress: 0, claimed: false }))
      };
      persist();
      return true;
    }

    function tickQuests(eventName, payload) {
      if (!State.quests.slate || State.quests.slate.length === 0) return;
      const ev = Object.assign({ type: eventName }, payload);
      let anyChanged = false;
      for (const q of State.quests.slate) {
        if (q.claimed) continue;
        const def = QUEST_POOL.find((d) => d.id === q.id);
        if (!def) continue;
        const inc = def.track(ev);
        if (inc > 0 && q.progress < def.target) {
          q.progress = Math.min(def.target, q.progress + inc);
          anyChanged = true;
          if (q.progress >= def.target) {
            /* Quest just completed — small notification */
            if (State.view === 'care' || State.view === 'shelf') {
              spawnActionFeedbackOnRoot('Quest ready: ' + def.label);
            }
          }
        }
      }
      if (anyChanged) persist();
    }

    /* Stage-agnostic feedback (used when shelf is open and there's no stage) */
    function spawnActionFeedbackOnRoot(label) {
      const root = container;
      const f = document.createElement('div');
      f.className = 'slimegachi-feedback';
      f.innerHTML = label;
      f.style.left = '50%';
      f.style.top = '50%';
      f.style.color = '#ffd966';
      f.style.fontSize = '13px';
      root.appendChild(f);
      setTimeout(() => f.remove(), 1300);
    }

    function claimQuest(id) {
      const q = (State.quests.slate || []).find((x) => x.id === id);
      if (!q || q.claimed) return false;
      const def = QUEST_POOL.find((d) => d.id === id);
      if (!def || q.progress < def.target) return false;
      q.claimed = true;
      Currency.earn(def.reward, 'quest:' + id);
      if (State.view === 'care') {
        spawnEmote('🎁');
      }
      persist();
      return true;
    }

    onInternal('care_action', (ev) => { tickQuests('care_action', ev); updateQuestsDot(); });
    onInternal('minigame_complete', (ev) => { tickQuests('minigame_complete', ev); updateQuestsDot(); });

    /* ----- Collection -----
       Career-long stats. Counters tick on internal events; displayed in
       a Collection modal launched from the shelf. */

    onInternal('care_action', (ev) => {
      State.collection.totalActions = (State.collection.totalActions || 0) + 1;
      if (ev.food) State.collection.foodsTried[ev.food] = true;
    });
    onInternal('minigame_complete', (ev) => {
      if (!ev.forfeit) {
        State.collection.gamesPlayed[ev.game] = (State.collection.gamesPlayed[ev.game] || 0) + 1;
      }
    });

    /* ----- Mini-game: Bubble Pop ----- */
    const BubblePop = {
      active: false, bubbles: [], score: 0, startedAt: 0, duration: 30000,
      rafId: null, ctx: null, canvas: null, width: 0, height: 0, spawnTimer: 0, _tapHandler: null,

      start() {
        this.canvas = $('minigame-canvas');
        this.ctx = this.canvas.getContext('2d');
        const r = $('minigame-stage').getBoundingClientRect();
        this.canvas.width = r.width * dpr;
        this.canvas.height = r.height * dpr;
        this.canvas.style.width = r.width + 'px';
        this.canvas.style.height = r.height + 'px';
        try { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {}
        this.width = r.width; this.height = r.height;
        this.bubbles = []; this.score = 0; this.spawnTimer = 0;
        this.startedAt = performance.now();
        this.active = true;
        $('minigame-score').textContent = '0';
        $('minigame-title').textContent = 'Bubble Pop';
        const self = this;
        this._tapHandler = function (e) {
          if (e.preventDefault) e.preventDefault();
          const t = (e.touches && e.touches[0]) || e;
          self.handleTap(t.clientX, t.clientY);
        };
        this.canvas.addEventListener('pointerdown', this._tapHandler, { passive: false });
        this.canvas.addEventListener('touchstart',  this._tapHandler, { passive: false });
        this.loop();
      },
      stop(forfeit) {
        this.active = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        if (this._tapHandler) {
          this.canvas.removeEventListener('pointerdown', this._tapHandler);
          this.canvas.removeEventListener('touchstart',  this._tapHandler);
          this._tapHandler = null;
        }
        const happy = Math.min(35, Math.max(forfeit ? 5 : 10, Math.floor(this.score * 0.4)));
        const coinMult = State.toyBuff ? 1.5 : 1.0;
        const coins = Math.floor(this.score * 0.25 * coinMult);
        if (State.toyBuff) State.toyBuff = false;
        if (State.activeKey) {
          const p = State.pets[State.activeKey];
          const def = PET_DEFS[p.pet];
          const favBonus = def && def.favoriteGame === 'bubblepop' ? 1.5 : 1.0;
          addStat('happy', happy * favBonus);
          addStat('energy', -8);
        }
        if (coins > 0) Currency.earn(coins, 'bubblepop');
        if (this.score >= 100) fireAchievement('bubbleMaster');
        $('miniresult-score').textContent = this.score;
        $('miniresult-happy').textContent = '+' + Math.round(happy);
        $('miniresult-coins').textContent = '+' + coins;
        $('miniresult').classList.add('slimegachi-show');
        renderStats();
        safeEmit('onMiniGameComplete', { game: 'bubblepop', score: this.score, coins: coins, happy: Math.round(happy), forfeit: !!forfeit });
        emitInternal('minigame_complete', { game: 'bubblepop', score: this.score, forfeit: !!forfeit });
        persist();
      },
      handleTap(clientX, clientY) {
        if (!this.active) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
          const b = this.bubbles[i];
          if (b.particle) continue;
          const dx = x - b.x, dy = y - b.y;
          if (dx * dx + dy * dy < b.r * b.r) {
            this.score += b.points;
            Sound.play(b.points >= 15 ? 'golden' : 'pop');
            $('minigame-score').textContent = this.score;
            this.bubbles.splice(i, 1);
            for (let k = 0; k < 6; k++) {
              this.bubbles.push({ x: b.x, y: b.y, r: 3 + Math.random() * 3, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, points: 0, color: b.color, particle: true, life: 0.5 });
            }
            return;
          }
        }
        Sound.play('miss');   // tapped empty water — whiff
      },
      loop() {
        if (!this.active) return;
        const tNow = performance.now();
        const elapsed = tNow - this.startedAt;
        const remaining = Math.max(0, this.duration - elapsed);
        $('minigame-timer').textContent = '0:' + Math.ceil(remaining / 1000).toString().padStart(2, '0');
        if (remaining <= 0) { this.stop(false); return; }
        this.spawnTimer -= 16;
        if (this.spawnTimer <= 0) {
          const rare = Math.random() < 0.15;
          const huge = Math.random() < 0.05;
          const r = huge ? 42 : (rare ? 22 : 28 + Math.random() * 8);
          const points = huge ? 25 : (rare ? 15 : 5);
          const colors = rare ? ['#fed600', '#ff7fb8', '#7fffd4'] : ['#00a1d4', '#6ec5e9', '#a7d8ee'];
          this.bubbles.push({
            x: 30 + Math.random() * (this.width - 60),
            y: this.height + r,
            r: r, vx: (Math.random() - 0.5) * 0.8, vy: -1.4 - Math.random() * 1.6,
            points: points, color: colors[Math.floor(Math.random() * colors.length)]
          });
          this.spawnTimer = 380 + Math.random() * 320;
        }
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        const g = ctx.createLinearGradient(0, 0, 0, this.height);
        g.addColorStop(0, 'rgba(0,161,212,0.10)');
        g.addColorStop(1, 'rgba(0,161,212,0.02)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.width, this.height);
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
          const b = this.bubbles[i];
          b.x += b.vx; b.y += b.vy;
          if (b.particle) {
            b.life -= 0.05;
            if (b.life <= 0) { this.bubbles.splice(i, 1); continue; }
            ctx.globalAlpha = b.life;
            ctx.fillStyle = b.color;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            continue;
          }
          if (b.y < -b.r - 10) { this.bubbles.splice(i, 1); continue; }
          ctx.fillStyle = b.color; ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
          if (b.points > 5) {
            ctx.fillStyle = '#1a1428';
            ctx.font = 'bold ' + Math.round(b.r * 0.5) + 'px system-ui';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(b.points, b.x, b.y);
          }
        }
        this.rafId = requestAnimationFrame(() => this.loop());
      }
    };

    /* ----- Mini-game: Banana Catch (Monkey's favorite) -----
       Basket drags left/right at the bottom. Bananas fall from the top —
       catch them for points. Occasional rotten bananas (penalty) and
       golden bananas (bonus). Same 30s duration / reward model as Bubble Pop. */
    const BananaCatch = {
      active: false, items: [], score: 0, startedAt: 0, duration: 30000,
      rafId: null, ctx: null, canvas: null, width: 0, height: 0,
      basketX: 0, basketW: 80, basketY: 0, spawnTimer: 0,
      _downHandler: null, _moveHandler: null, _upHandler: null, dragging: false,

      start() {
        this.canvas = $('minigame-canvas');
        this.ctx = this.canvas.getContext('2d');
        const r = $('minigame-stage').getBoundingClientRect();
        this.canvas.width = r.width * dpr;
        this.canvas.height = r.height * dpr;
        this.canvas.style.width = r.width + 'px';
        this.canvas.style.height = r.height + 'px';
        try { this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {}
        this.width = r.width; this.height = r.height;
        this.basketX = r.width / 2 - this.basketW / 2;
        this.basketY = r.height - 60;
        this.items = []; this.score = 0; this.spawnTimer = 0;
        this.startedAt = performance.now();
        this.active = true;
        $('minigame-score').textContent = '0';
        $('minigame-title').textContent = 'Banana Catch';

        const self = this;
        this._downHandler = function (e) {
          if (e.preventDefault) e.preventDefault();
          self.dragging = true;
          const t = (e.touches && e.touches[0]) || e;
          self.updateBasket(t.clientX);
        };
        this._moveHandler = function (e) {
          if (!self.dragging) return;
          if (e.preventDefault) e.preventDefault();
          const t = (e.touches && e.touches[0]) || e;
          self.updateBasket(t.clientX);
        };
        this._upHandler = function () { self.dragging = false; };

        this.canvas.addEventListener('pointerdown', this._downHandler, { passive: false });
        this.canvas.addEventListener('pointermove', this._moveHandler, { passive: false });
        this.canvas.addEventListener('pointerup', this._upHandler);
        this.canvas.addEventListener('pointercancel', this._upHandler);
        this.canvas.addEventListener('touchstart', this._downHandler, { passive: false });
        this.canvas.addEventListener('touchmove', this._moveHandler, { passive: false });
        this.canvas.addEventListener('touchend', this._upHandler);

        this.loop();
      },
      updateBasket(clientX) {
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        this.basketX = clamp(x - this.basketW / 2, 0, this.width - this.basketW);
      },
      stop(forfeit) {
        this.active = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        if (this._downHandler) {
          this.canvas.removeEventListener('pointerdown', this._downHandler);
          this.canvas.removeEventListener('pointermove', this._moveHandler);
          this.canvas.removeEventListener('pointerup', this._upHandler);
          this.canvas.removeEventListener('pointercancel', this._upHandler);
          this.canvas.removeEventListener('touchstart', this._downHandler);
          this.canvas.removeEventListener('touchmove', this._moveHandler);
          this.canvas.removeEventListener('touchend', this._upHandler);
          this._downHandler = this._moveHandler = this._upHandler = null;
        }
        const safeScore = Math.max(0, this.score);
        const happy = Math.min(35, Math.max(forfeit ? 5 : 10, Math.floor(safeScore * 0.4)));
        const coinMult = State.toyBuff ? 1.5 : 1.0;
        const coins = Math.floor(safeScore * 0.25 * coinMult);
        if (State.toyBuff) State.toyBuff = false;
        if (State.activeKey) {
          const p = State.pets[State.activeKey];
          const def = PET_DEFS[p.pet];
          const favBonus = def && def.favoriteGame === 'bananacatch' ? 1.5 : 1.0;
          addStat('happy', happy * favBonus);
          addStat('energy', -8);
        }
        if (coins > 0) Currency.earn(coins, 'bananacatch');
        if (safeScore >= 100) fireAchievement('bananaMaster');
        $('miniresult-score').textContent = safeScore;
        $('miniresult-happy').textContent = '+' + Math.round(happy);
        $('miniresult-coins').textContent = '+' + coins;
        $('miniresult').classList.add('slimegachi-show');
        renderStats();
        safeEmit('onMiniGameComplete', { game: 'bananacatch', score: safeScore, coins: coins, happy: Math.round(happy), forfeit: !!forfeit });
        emitInternal('minigame_complete', { game: 'bananacatch', score: safeScore, forfeit: !!forfeit });
        persist();
      },
      loop() {
        if (!this.active) return;
        const tNow = performance.now();
        const elapsed = tNow - this.startedAt;
        const remaining = Math.max(0, this.duration - elapsed);
        $('minigame-timer').textContent = '0:' + Math.ceil(remaining / 1000).toString().padStart(2, '0');
        if (remaining <= 0) { this.stop(false); return; }

        /* Spawn items: 80% banana, 15% rotten (penalty), 5% golden */
        this.spawnTimer -= 16;
        if (this.spawnTimer <= 0) {
          const roll = Math.random();
          let item;
          if (roll < 0.05) {
            item = { kind: 'golden', x: 20 + Math.random() * (this.width - 40), y: -20, vy: 2.5 + Math.random() * 1.0, points: 15, radius: 18 };
          } else if (roll < 0.20) {
            item = { kind: 'rotten', x: 20 + Math.random() * (this.width - 40), y: -20, vy: 3.0 + Math.random() * 1.5, points: -8, radius: 16 };
          } else {
            item = { kind: 'banana', x: 20 + Math.random() * (this.width - 40), y: -20, vy: 2.0 + Math.random() * 1.8, points: 5, radius: 18 };
          }
          this.items.push(item);
          this.spawnTimer = 460 + Math.random() * 240;
        }

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        const g = ctx.createLinearGradient(0, 0, 0, this.height);
        g.addColorStop(0, 'rgba(136, 184, 92, 0.12)');
        g.addColorStop(1, 'rgba(60, 100, 40, 0.04)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.width, this.height);

        for (let i = this.items.length - 1; i >= 0; i--) {
          const it = this.items[i];
          it.y += it.vy;
          const basketTop = this.basketY;
          if (it.y >= basketTop && it.y <= basketTop + 30 && it.x >= this.basketX && it.x <= this.basketX + this.basketW) {
            this.score += it.points;
            Sound.play(it.kind === 'golden' ? 'golden' : it.kind === 'rotten' ? 'miss' : 'catch');
            $('minigame-score').textContent = this.score;
            this.items.splice(i, 1);
            continue;
          }
          if (it.y > this.height + 30) { this.items.splice(i, 1); continue; }
          const sprite = CATCH_SPRITES[it.kind];
          const sz = it.radius * 2;
          if (sprite && sprite.complete && sprite.naturalWidth) {
            ctx.drawImage(sprite, it.x - it.radius, it.y - it.radius, sz, sz);
          } else {
            ctx.fillStyle = it.kind === 'golden' ? '#ffd23f' : it.kind === 'rotten' ? '#a3cf63' : '#f2d23e';
            ctx.beginPath();
            ctx.arc(it.x, it.y, it.radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        /* Draw basket */
        ctx.fillStyle = '#8b4513';
        ctx.strokeStyle = '#5a2d0a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(this.basketX, this.basketY, this.basketW, 26, 6);
        else ctx.rect(this.basketX, this.basketY, this.basketW, 26);
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        for (let x = this.basketX + 8; x < this.basketX + this.basketW; x += 10) {
          ctx.beginPath();
          ctx.moveTo(x, this.basketY + 3);
          ctx.lineTo(x, this.basketY + 23);
          ctx.stroke();
        }
        ctx.strokeStyle = '#5a2d0a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.basketX + this.basketW / 2, this.basketY, this.basketW / 2 - 4, Math.PI, 0, false);
        ctx.stroke();

        this.rafId = requestAnimationFrame(() => this.loop());
      }
    };

    /* Picks the right mini-game for a pet, falling back to BubblePop */
    function pickGameForPet(pet) {
      const def = PET_DEFS[pet];
      if (def && def.favoriteGame === 'bananacatch') return BananaCatch;
      return BubblePop;
    }

    function launchMiniGame() {
      if (!State.activeKey) return;
      const p = State.pets[State.activeKey];
      if (!p) return;
      State.view = 'minigame';
      State.activeGame = pickGameForPet(p.pet);
      musicForCurrentView();
      $('minigame').classList.add('slimegachi-show');
      $('miniresult').classList.remove('slimegachi-show');
      if (bubbleTimer) clearTimeout(bubbleTimer);
      if (eventCheckTimer) clearTimeout(eventCheckTimer);
      $('speech').style.display = 'none';
      State.activeGame.start();
    }
    function closeMiniGame() {
      $('minigame').classList.remove('slimegachi-show');
      $('miniresult').classList.remove('slimegachi-show');
      State.view = 'care';
      musicForCurrentView();
      scheduleNextBubble();
      scheduleEventCheck();
    }

    /* ----- Shop / Feed modals ----- */
    function buildShopGrid(target, includeAll) {
      const c = $(target);
      c.innerHTML = '';
      const items = (includeAll ? Object.values(FOODS) : Object.values(FOODS).filter((f) => !f.isToy));
      items.sort((a, b) => a.cost - b.cost);
      const p = activePet();
      const favId = p ? PET_DEFS[p.pet].favoriteFood : null;
      for (const food of items) {
        const isFav = food.id === favId;
        const canAfford = State.coins >= food.cost;
        const div = document.createElement('div');
        div.className = 'slimegachi-shop-item' + (isFav ? ' slimegachi-fav' : '') + (canAfford ? '' : ' slimegachi-disabled');
        div.innerHTML =
          (isFav ? '<div class="slimegachi-shop-fav-tag">' + ACH_ICONS.star + '</div>' : '') +
          '<div class="slimegachi-shop-item-ico">' + food.icon + '</div>' +
          '<div class="slimegachi-shop-item-name">' + food.name + '</div>' +
          '<div class="slimegachi-shop-item-desc">' + food.desc + '</div>' +
          '<div class="slimegachi-shop-item-price' + (food.cost === 0 ? ' slimegachi-free' : '') + '">' + (food.cost === 0 ? 'Free' : food.cost + ' ' + MISC_ICONS.coin) + '</div>';
        if (canAfford) {
          div.addEventListener('click', () => {
            if (target === 'feed-grid') { applyFood(food.id); }
            else if (food.isToy) {
              if (Currency.spend(food.cost, 'toy:' + food.id)) {
                State.toyBuff = true;
                spawnActionFeedback(food.name + ' ready!', false);
                buildShopGrid('shop-grid', true);
              }
            }
          });
        }
        c.appendChild(div);
      }
    }
    function openShopModal() { buildShopGrid('shop-grid', true); $('shop-modal').classList.add('slimegachi-show'); renderCoins(); }
    function closeShopModal() { $('shop-modal').classList.remove('slimegachi-show'); }
    function openFeedModal() { buildShopGrid('feed-grid', false); $('feed-modal').classList.add('slimegachi-show'); renderCoins(); }
    function closeFeedModal() { $('feed-modal').classList.remove('slimegachi-show'); }

    function openAchievementsModal() {
      const list = $('ach-list');
      list.innerHTML = '';
      const ids = Object.keys(ACHIEVEMENTS);
      let unlocked = 0;
      for (const id of ids) {
        const a = ACHIEVEMENTS[id];
        const st = State.achievements[id];
        const isU = !!(st && st.unlockedAt);
        if (isU) unlocked++;
        const row = document.createElement('div');
        row.className = 'slimegachi-ach-row' + (isU ? ' slimegachi-unlocked' : '');
        row.innerHTML =
          '<div class="slimegachi-ach-row-ico">' + a.icon + '</div>' +
          '<div class="slimegachi-ach-row-info">' +
            '<div class="slimegachi-ach-row-name">' + a.name + (a.mintable ? '<span class="slimegachi-ach-row-mint-badge">Mintable</span>' : '') + '</div>' +
            '<div class="slimegachi-ach-row-desc">' + a.desc + '</div>' +
          '</div>' +
          (a.mintable && isU ? '<button class="slimegachi-ach-row-claim" disabled title="Wallet integration coming soon">Claim</button>' : '');
        list.appendChild(row);
      }
      $('ach-count').textContent = unlocked + '/' + ids.length;
      $('ach-modal').classList.add('slimegachi-show');
    }
    function closeAchievementsModal() { $('ach-modal').classList.remove('slimegachi-show'); }

    /* ----- Quests modal ----- */
    function openQuestsModal() {
      refreshQuestsIfNewDay();
      renderQuestList();
      $('quests-modal').classList.add('slimegachi-show');
    }
    function closeQuestsModal() { $('quests-modal').classList.remove('slimegachi-show'); }
    function renderQuestList() {
      const list = $('quest-list');
      list.innerHTML = '';
      $('quests-date').textContent = State.quests.day || '';
      const slate = State.quests.slate || [];
      for (const q of slate) {
        const def = QUEST_POOL.find((d) => d.id === q.id);
        if (!def) continue;
        const isReady = q.progress >= def.target && !q.claimed;
        const isClaimed = !!q.claimed;
        const frac = Math.min(1, q.progress / def.target);
        const row = document.createElement('div');
        row.className = 'slimegachi-quest-row' + (isReady ? ' slimegachi-ready' : '') + (isClaimed ? ' slimegachi-claimed' : '');
        row.innerHTML =
          '<div class="slimegachi-quest-info">' +
            '<div class="slimegachi-quest-label">' + def.label + '</div>' +
            '<div class="slimegachi-quest-barwrap"><div class="slimegachi-quest-bar" style="width:' + (frac * 100).toFixed(1) + '%"></div></div>' +
            '<div class="slimegachi-quest-progress">' + q.progress + '/' + def.target + '</div>' +
          '</div>' +
          '<div class="slimegachi-quest-actions">' +
            '<div class="slimegachi-quest-reward">+' + def.reward + ' ' + MISC_ICONS.coin + '</div>' +
            (isClaimed ?
              '<div class="slimegachi-quest-status">Claimed ' + ICONS.check + '</div>' :
              isReady ?
                '<button class="slimegachi-quest-claim" data-quest="' + def.id + '">Claim</button>' :
                '<div class="slimegachi-quest-status">In Progress</div>'
            ) +
          '</div>';
        list.appendChild(row);
      }
      list.querySelectorAll('.slimegachi-quest-claim').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (claimQuest(btn.dataset.quest)) {
            renderQuestList();
            updateQuestsDot();
          }
        });
      });
    }
    function updateQuestsDot() {
      const dot = $('quests-dot');
      if (!dot) return;
      const slate = State.quests.slate || [];
      const def = QUEST_POOL;
      const hasReady = slate.some((q) => {
        const d = def.find((x) => x.id === q.id);
        return d && q.progress >= d.target && !q.claimed;
      });
      dot.classList.toggle('slimegachi-show', hasReady);
    }

    /* ----- Collection modal ----- */
    function openCollectionModal() {
      renderCollection();
      $('collection-modal').classList.add('slimegachi-show');
    }
    function closeCollectionModal() { $('collection-modal').classList.remove('slimegachi-show'); }
    function renderCollection() {
      const body = $('collection-body');
      body.innerHTML = '';
      const c = State.collection || { totalActions: 0, foodsTried: {}, gamesPlayed: {}, milestonesReached: 0 };
      const foodsCount = Object.keys(c.foodsTried || {}).length;
      const totalFoods = Object.keys(FOODS).length;
      const gamesPlayedTotal = Object.values(c.gamesPlayed || {}).reduce((s, n) => s + n, 0);
      const gameKinds = Object.keys(c.gamesPlayed || {}).length;
      const ownedTypes = {};
      for (const o of State.ownedPets) ownedTypes[o.pet] = true;
      const careTypes = {};
      for (const k of Object.keys(State.pets)) {
        const p = State.pets[k];
        if ((p.care_count || 0) > 0) careTypes[p.pet] = true;
      }
      const achKeys = Object.keys(ACHIEVEMENTS);
      const achU = achKeys.filter((id) => State.achievements[id] && State.achievements[id].unlockedAt).length;

      /* Highest level across all pets */
      let highLvl = 0;
      let totalCare = 0;
      for (const k of Object.keys(State.pets)) {
        const cc = State.pets[k].care_count || 0;
        totalCare += cc;
        const l = levelForCount(cc);
        if (l > highLvl) highLvl = l;
      }

      const stats = [
        { ico: MISC_ICONS.bolt, label: 'Career care actions', value: c.totalActions || 0 },
        { ico: ACH_ICONS.star, label: 'Pet milestones reached', value: c.milestonesReached || 0 },
        { ico: MISC_ICONS.trophy, label: 'Achievements unlocked', value: achU + ' / ' + achKeys.length },
        { ico: MISC_ICONS.plate, label: 'Foods tried', value: foodsCount + ' / ' + totalFoods },
        { ico: MISC_ICONS.gamepad, label: 'Mini-games played', value: gamesPlayedTotal + ' (' + gameKinds + ' kind' + (gameKinds === 1 ? '' : 's') + ')' },
        { ico: ACH_ICONS.paw, label: 'Pet types cared for', value: Object.keys(careTypes).length + ' / 4' },
        { ico: MISC_ICONS.trending, label: 'Highest pet level', value: 'Lv ' + highLvl },
        { ico: MISC_ICONS.flame, label: 'Login streak (best)', value: State.loginStreak + ' day' + (State.loginStreak === 1 ? '' : 's') }
      ];
      for (const s of stats) {
        const row = document.createElement('div');
        row.className = 'slimegachi-collection-row';
        row.innerHTML =
          '<div class="slimegachi-collection-ico">' + s.ico + '</div>' +
          '<div class="slimegachi-collection-label">' + s.label + '</div>' +
          '<div class="slimegachi-collection-value">' + s.value + '</div>';
        body.appendChild(row);
      }
    }

    /* ----- Animation loop ----- */
    let lastTickDecay = performance.now();
    let lastTintUpdate = 0;
    let rafHandle = null;
    let destroyed = false;
    function frame() {
      if (destroyed) return;
      const tNow = performance.now();
      if (tNow - lastTickDecay > TICK_INTERVAL_MS) {
        applyDecay();
        if (State.view === 'care') renderStats();
        lastTickDecay = tNow;
        persist();
      }
      if (tNow - lastTintUpdate > 30000) { applyTimeTint(); lastTintUpdate = tNow; }
      drawBackground();
      if (State.view === 'care')       { updatePetAnimation(); updatePupils(); updateMouthAndBob(); maybeSpawnIdleEmote(); }
      else if (State.view === 'shelf') animateShelf();
      rafHandle = requestAnimationFrame(frame);
    }

    /* ----- Load account flow ----- */
    async function loadAccount(accountId) {
      State.account = accountId;
      $('acct').textContent = State.stubMode ? 'demo' : (accountId || '— not connected —');
      const devMode = $('dev-mode');
      if (devMode) devMode.textContent = State.stubMode ? 'demo' : 'mirror';
      setStatus(!State.stubMode && accountId ? 'Loading from mirror node…' : null, 'info');

      const saved = await options.storage.load(playerStorageKey());
      if (saved) {
        State.coins = saved.coins || 0;
        State.achievements = saved.achievements || {};
        State.lastLoginDay = saved.lastLoginDay || null;
        State.loginStreak = saved.loginStreak || 0;
        State.thrivingStartTime = saved.thrivingStartTime || null;
        State.quests = saved.quests || { day: null, slate: [] };
        State.collection = saved.collection || { totalActions: 0, foodsTried: {}, gamesPlayed: {}, milestonesReached: 0 };
      } else {
        State.coins = 0; State.achievements = {};
        State.lastLoginDay = null; State.loginStreak = 0; State.thrivingStartTime = null;
        State.quests = { day: null, slate: [] };
        State.collection = { totalActions: 0, foodsTried: {}, gamesPlayed: {}, milestonesReached: 0 };
      }
      /* Per-pet records are loaded individually (by {tokenId, serial}) in the
         ensurePetState loop below, so a traded-in pet brings its own history. */
      State.pets = {};

      if (State.stubMode || !accountId) {
        State.ownedPets = [
          { pet: 'Kitten', serial: 274, name: 'SLIME #274', image: null, traits: { Color: 'Purple', Background: 'Salmon' } },
          { pet: 'Monkey', serial: 101, name: 'SLIME #101', image: null, traits: { Color: 'Green', Background: 'Sky' } }
        ];
        setStatus(null);
      } else {
        try {
          State.ownedPets = await options.getOwnedPets(accountId);
          if (State.ownedPets.length > 0) setStatus(null);
        } catch (e) {
          onError({ code: 'getOwnedPets_threw', message: 'getOwnedPets failed: ' + (e && e.message) });
          State.ownedPets = [];
        }
      }

      for (const o of State.ownedPets) await ensurePetState(o);
      applyDecay();
      checkLoginStreak();
      refreshQuestsIfNewDay();
      renderShelf();
      renderCoins();
      updateQuestsDot();
      applyTimeTint();
    }

    /* ----- Event wiring ----- */
    /* Warm up the AudioContext on the first user gesture so the first cue
       isn't swallowed by autoplay policy, and start the scene's music. */
    container.addEventListener('pointerdown', () => { Sound.ensureCtx(); Sound.resume(); musicForCurrentView(); }, { once: true });

    /* Delegated UI click cue (capture phase, so it survives stopPropagation).
       Excludes the care action bar (has its own per-action SFX) and the food
       picker (fires the feed cue on selection) to avoid doubling up. */
    container.addEventListener('click', (e) => {
      const el = e.target.closest('button, .slimegachi-slot');
      if (!el) return;
      if (el.classList.contains('slimegachi-actbtn')) return;
      if (el.closest('[data-sg="feed-grid"]')) return;
      Sound.play('click');
    }, true);

    container.querySelectorAll('.slimegachi-actbtn').forEach((b) => {
      b.addEventListener('click', () => applyAction(b.dataset.action));
    });
    function renderSoundBtn() {
      const btn = $('sound-toggle');
      if (!btn) return;
      const m = Sound.isMuted();
      btn.innerHTML = m ? ICONS.soundOff : ICONS.sound;
      btn.setAttribute('aria-pressed', m ? 'true' : 'false');
      btn.classList.toggle('slimegachi-muted', m);
    }
    $('sound-toggle').addEventListener('click', () => { Sound.toggle(); renderSoundBtn(); });
    renderSoundBtn();

    function renderMusicBtn() {
      const btn = $('music-toggle');
      if (!btn) return;
      const m = Music.isMuted();
      btn.innerHTML = m ? ICONS.musicOff : ICONS.music;
      btn.setAttribute('aria-pressed', m ? 'true' : 'false');
      btn.classList.toggle('slimegachi-muted', m);
    }
    $('music-toggle').addEventListener('click', () => { Music.toggle(); renderMusicBtn(); });
    renderMusicBtn();

    $('back').addEventListener('click', backToShelf);
    $('open-shop').addEventListener('click', openShopModal);
    $('open-achievements').addEventListener('click', openAchievementsModal);
    $('open-quests').addEventListener('click', openQuestsModal);
    $('open-collection').addEventListener('click', openCollectionModal);
    $('shop-close').addEventListener('click', closeShopModal);
    $('ach-close').addEventListener('click', closeAchievementsModal);
    $('quests-close').addEventListener('click', closeQuestsModal);
    $('collection-close').addEventListener('click', closeCollectionModal);
    $('feed-close').addEventListener('click', closeFeedModal);
    $('minigame-exit').addEventListener('click', () => { if (State.activeGame) State.activeGame.stop(true); });
    $('miniresult-close').addEventListener('click', closeMiniGame);
    $('connect-cancel').addEventListener('click', () => $('connect-modal').classList.remove('slimegachi-show'));
    $('connect-ok').addEventListener('click', async () => {
      const id = $('connect-input').value.trim();
      if (!/^\d+\.\d+\.\d+$/.test(id)) { alert('Format: 0.0.xxxxxx'); return; }
      $('connect-modal').classList.remove('slimegachi-show');
      State.stubMode = false;
      await loadAccount(id);
    });

    /* Dev panel (only if showDevPanel) */
    if (options.showDevPanel) {
      $('dev-toggle').addEventListener('click', () => {
        if (State.stubMode) {
          $('connect-input').value = '';
          $('connect-modal').classList.add('slimegachi-show');
        } else {
          State.stubMode = true;
          loadAccount('stub');
        }
      });
      $('dev-skip').addEventListener('click', () => {
        for (const k of Object.keys(State.pets)) State.pets[k].lastTick -= 3600000;
        applyDecay();
        if (State.view === 'care') renderStats();
      });
      $('dev-time').addEventListener('click', () => {
        State.devTimeOffset = (State.devTimeOffset + 4 * 3600 * 1000) % (24 * 3600 * 1000);
        applyTimeTint();
        if (State.view === 'care') renderStats();
      });
      $('dev-reset').addEventListener('click', async () => {
        if (!confirm('Reset all state for this account?')) return;
        await options.storage.remove(playerStorageKey());
        for (const o of State.ownedPets) await options.storage.remove(petStorageKey(o.serial));
        State.pets = {}; State.coins = 0; State.achievements = {};
        State.loginStreak = 0; State.lastLoginDay = null; State.thrivingStartTime = null;
        State.quests = { day: null, slate: [] };
        State.collection = { totalActions: 0, foodsTried: {}, gamesPlayed: {}, milestonesReached: 0 };
        for (const o of State.ownedPets) await ensurePetState(o);
        renderCoins();
        if (State.view === 'care') renderStats();
      });
    }

    /* Window resize */
    function onResize() { resize(); }
    window.addEventListener('resize', onResize);

    /* Pupil tracking — listen on container, both mouse and touch */
    container.addEventListener('pointermove', onPointerMoveForPupils);

    /* ----- Boot ----- */
    resize();
    initBgParticles();
    if (options.accountId) {
      State.stubMode = false;
      loadAccount(options.accountId);
    } else {
      State.stubMode = true;
      loadAccount('stub');
    }
    rafHandle = requestAnimationFrame(frame);

    /* ----- Public instance API ----- */
    return {
      async setAccountId(accountId) {
        if (!accountId) { State.stubMode = true; await loadAccount('stub'); return; }
        State.stubMode = false;
        await loadAccount(accountId);
      },
      async disconnect() {
        State.stubMode = true;
        await loadAccount('stub');
      },
      openPet(serial) {
        const o = State.ownedPets.find((p) => p.serial === serial);
        if (o) enterCare(o);
      },
      getState() {
        return {
          account: State.account,
          view: State.view,
          activeKey: State.activeKey,
          ownedPets: State.ownedPets.slice(),
          coins: State.coins,
          loginStreak: State.loginStreak,
          achievements: Object.assign({}, State.achievements),
          pets: Object.assign({}, State.pets),
          quests: Object.assign({}, State.quests),
          collection: Object.assign({}, State.collection)
        };
      },
      destroy() {
        destroyed = true;
        if (rafHandle) cancelAnimationFrame(rafHandle);
        if (bubbleTimer) clearTimeout(bubbleTimer);
        if (eventCheckTimer) clearTimeout(eventCheckTimer);
        if (State.saveTimer) clearTimeout(State.saveTimer);
        window.removeEventListener('resize', onResize);
        container.removeEventListener('pointermove', onPointerMoveForPupils);
        if (blinkTimer) clearTimeout(blinkTimer);
        container.innerHTML = '';
        container.classList.remove('slimegachi-root');
      }
    };
  }

  /* Public namespace */
  global.SLIMEgachi = {
    version: '1.8.0',
    mount(container, options) {
      if (!container) throw new Error('SLIMEgachi.mount: container is required');
      return createInstance(container, options || {});
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
