/**
 * SLIMEgachi — the widget instance. One is created per mount() call; all game
 * state lives in this closure.
 */
import type {
  AchievementId, CareAction, CollectionState, EventPayloads, FoodId, GameId,
  InternalEvents, MiniGame, Mood, MountOptions, OwnedPet, PetId, PetRecord,
  PetState, PlayerRecord, QuestEvent, QuestState, SlimegachiError,
  SlimegachiInstance, StatName, Stats, StorageAdapter, TimePhase, View,
  AchievementState, GetOwnedPets
} from './types';
import { Music, Sound } from './audio';
import type { SfxName } from './audio';
import {
  ACHIEVEMENTS, CLEAN_CARE_THRESHOLD, DEFAULT_IPFS_GATEWAYS, DEFAULT_MIRROR_NODES,
  DEFAULT_TOKEN_ID, EVENT_CHECK_INTERVAL_MS, FEED_CARE_THRESHOLD, FOODS,
  PASSIVE_DECAY_MULTIPLIER, PET_DEFS, PET_ORDER, SAVE_DEBOUNCE_MS,
  SLEEP_BONUS_MULT, SLEEP_CARE_THRESHOLD, SPEECH, SPEECH_INTERVAL_MS,
  TICK_INTERVAL_MS, WRONG_TIME_PENALTY
} from './data';
import { makeDefaultGetOwnedPets } from './hedera';
import { ACH_ICONS, EMOTE_ICONS, ICONS, MISC_ICONS } from './icons';
import { MAX_LEVEL, MILESTONE_COIN_REWARDS, levelForCount, progressToNextLevel } from './leveling';
import { createBananaCatch, createBubblePop } from './minigames';
import type { GameHost } from './minigames';
import { EMBEDDED_PET_ART } from './pet-art';
import { QUEST_POOL } from './quests';
import { makeLocalStorageAdapter } from './storage';
import { widgetHTML } from './template';
import { clamp, hexToRgb, mixHex } from './util';

type Timer = ReturnType<typeof setTimeout>;
type RandomEventId = 'foundCoin' | 'petSick' | 'treasure';
const STAT_NAMES: StatName[] = ['hunger', 'happy', 'energy', 'clean'];

interface ResolvedOptions {
  tokenId: string;
  accountId: string | null;
  mirrorNodes: string[];
  ipfsGateways: string[];
  petArt: Partial<Record<PetId, string>>;
  theme: Record<string, string>;
  storage: StorageAdapter;
  getOwnedPets: GetOwnedPets;
  showDevPanel: boolean;
}

interface GameState {
  account: string | null;
  ownedPets: OwnedPet[];
  view: View;
  activeKey: string | null;
  pets: Record<string, PetState>;
  coins: number;
  achievements: Partial<Record<AchievementId, AchievementState>>;
  lastLoginDay: string | null;
  loginStreak: number;
  thrivingStartTime: number | null;
  saveTimer: Timer | null;
  activeEvent: { eventId: RandomEventId; expiresAt: number } | null;
  /** Toy Ball bought: next mini-game pays 1.5x coins. */
  toyBuff: boolean;
  activeGame: MiniGame | null;
  /** Dev panel time travel, added to Date.now(). */
  devTimeOffset: number;
  /** Daily quest slate, refreshed at midnight (UTC date). */
  quests: QuestState;
  /** Career-long collection stats. */
  collection: CollectionState;
  /** Demo mode: two mock pets, sandboxed storage keys. */
  stubMode: boolean;
}

function emptyCollection(): CollectionState {
  return { totalActions: 0, foodsTried: {}, gamesPlayed: {}, milestonesReached: 0 };
}

export function createInstance(container: HTMLElement, userOptions: MountOptions): SlimegachiInstance {
  /* ----- Resolve options with defaults ----- */
  const events = userOptions.events || {};
  function safeEmit<K extends keyof EventPayloads>(name: K, payload: EventPayloads[K]) {
    try {
      const fn = events[name];
      if (typeof fn === 'function') fn(payload);
    } catch (e) {
      console.error('SLIMEgachi event handler threw:', name, e);
    }
  }
  const onError = function (errPayload: SlimegachiError) {
    safeEmit('onError', errPayload);
    setStatus(errPayload.message, 'error');
  };

  const tokenId = userOptions.tokenId || DEFAULT_TOKEN_ID;
  const mirrorNodes = userOptions.mirrorNodes || DEFAULT_MIRROR_NODES.slice();
  const ipfsGateways = userOptions.ipfsGateways || DEFAULT_IPFS_GATEWAYS.slice();
  const options: ResolvedOptions = {
    tokenId: tokenId,
    accountId: userOptions.accountId || null,
    mirrorNodes: mirrorNodes,
    ipfsGateways: ipfsGateways,
    petArt: Object.assign({}, EMBEDDED_PET_ART, userOptions.petArt || {}),
    theme: userOptions.theme || {},
    storage: userOptions.storage || makeLocalStorageAdapter('slimegachi'),
    getOwnedPets: userOptions.getOwnedPets ||
      makeDefaultGetOwnedPets({ tokenId: tokenId, mirrorNodes: mirrorNodes, ipfsGateways: ipfsGateways, onError: onError }),
    showDevPanel: !!userOptions.showDevPanel
  };

  /* ----- DOM setup ----- */
  container.classList.add('slimegachi-root');
  container.innerHTML = widgetHTML(options.showDevPanel);

  /* Apply theme overrides */
  Object.keys(options.theme).forEach((k) => {
    container.style.setProperty('--slimegachi-' + k, options.theme[k]);
  });

  /* Element lookup by data-sg name. `$` is for elements the template always
     renders; `$opt` is for ones that may be absent (the dev panel). */
  function $opt<T extends HTMLElement = HTMLElement>(sel: string): T | null {
    return container.querySelector<T>('[data-sg="' + sel + '"]');
  }
  function $<T extends HTMLElement = HTMLElement>(sel: string): T {
    return $opt<T>(sel) as T;
  }
  /* Elements addressed by class rather than data-sg. */
  function byClass<T extends HTMLElement = HTMLElement>(cls: string): T {
    return container.querySelector<T>('.' + cls) as T;
  }

  /* ----- State ----- */
  const State: GameState = {
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
    quests: { day: null, slate: [] },
    collection: emptyCollection(),
    stubMode: !userOptions.accountId && !userOptions.getOwnedPets  /* default to demo if no wallet info */
  };

  /* ----- Internal event bus -----
     Used by quests, leveling, collection. Distinct from the public
     `safeEmit`, which is for the host site's analytics/integration. */
  const internalListeners: { [K in keyof InternalEvents]?: Array<(payload: InternalEvents[K]) => void> } = {};
  function onInternal<K extends keyof InternalEvents>(name: K, fn: (payload: InternalEvents[K]) => void) {
    const list = (internalListeners[name] || (internalListeners[name] = [])) as Array<(payload: InternalEvents[K]) => void>;
    list.push(fn);
  }
  function emitInternal<K extends keyof InternalEvents>(name: K, payload: InternalEvents[K]) {
    const ls = internalListeners[name] as Array<(payload: InternalEvents[K]) => void> | undefined;
    if (!ls) return;
    for (const fn of ls) {
      try { fn(payload); } catch (e) { console.error('SLIMEgachi internal listener threw:', name, e); }
    }
  }

  /* ----- Sound wiring -----
     Care SFX and the mini-game end jingle ride the internal event bus so
     action handlers stay sound-agnostic. Per-event cues (achievement,
     coin, mini-game hits) are fired inline at their source. */
  const CARE_SFX: Partial<Record<CareAction, SfxName>> = { feed: 'feed', clean: 'clean', sleep: 'sleep' };
  onInternal('care_action', (ev) => { Sound.play(CARE_SFX[ev.action] || 'click'); });
  onInternal('milestone', () => { Sound.play('levelup'); });
  onInternal('minigame_complete', (ev) => { if (!ev.forfeit) Sound.play('gameover'); });

  function now() { return Date.now() + State.devTimeOffset; }

  /* Storage keys. Per-pet gameplay state is keyed by {tokenId, serial} so it
     survives NFT trades and syncs across devices (a pet's care history follows
     the NFT, not the wallet). Player-level state — coins, login streak,
     achievements, quests, collection — is inherently per-person, so it stays
     keyed by account. */
  function petStorageKey(serial: number) {
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
        const player: PlayerRecord = {
          coins: State.coins,
          achievements: State.achievements,
          lastLoginDay: State.lastLoginDay,
          loginStreak: State.loginStreak,
          thrivingStartTime: State.thrivingStartTime,
          quests: State.quests,
          collection: State.collection
        };
        await options.storage.save(playerStorageKey(), player);
        /* Per-pet records (per {tokenId, serial}) */
        for (const k of Object.keys(State.pets)) {
          const p = State.pets[k];
          const rec: PetRecord = {
            stats: p.stats,
            lastTick: p.lastTick,
            sick: p.sick,
            care_count: p.care_count,
            awakeUntil: p.awakeUntil || 0,
            name: p.name
          };
          await options.storage.save(petStorageKey(p.serial), rec);
        }
      } catch (e) { /* silent */ }
    }, SAVE_DEBOUNCE_MS);
  }

  /* ----- Currency ----- */
  const Currency = {
    getBalance: () => State.coins,
    spend(amt: number, reason: string) {
      if (State.coins < amt) return false;
      State.coins -= amt;
      renderCoins();
      safeEmit('onCoinsChanged', { balance: State.coins, delta: -amt, reason: reason });
      persist();
      return true;
    },
    earn(amt: number, reason: string) {
      State.coins += amt;
      renderCoins();
      if (amt > 0) Sound.play('coin');
      safeEmit('onCoinsChanged', { balance: State.coins, delta: amt, reason: reason });
      persist();
    }
  };
  function renderCoins() {
    $('coins-val').textContent = String(State.coins);
    $('shop-coins').textContent = String(State.coins);
    $('feed-coins').textContent = String(State.coins);
  }

  /* ----- Status banner ----- */
  function setStatus(msg: string | null, tone?: 'info' | 'error') {
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
  function isPetSleeping(petId: PetId) {
    const def = PET_DEFS[petId];
    if (!def || !def.sleepWindow) return false;
    const s = def.sleepWindow[0], e = def.sleepWindow[1];
    const h = gameHour();
    if (s < e) return h >= s && h < e;
    return h >= s || h < e;
  }
  /* Whether a specific pet is asleep — the time-of-day schedule, unless it was
     tapped awake (see wakePet), which overrides until its next bedtime. Use
     this per-pet form everywhere instead of the raw schedule. */
  function petSleeping(p: PetState | null | undefined) {
    if (!p || !p.pet) return false;
    if (p.awakeUntil && now() < p.awakeUntil) return false;
    return isPetSleeping(p.pet);
  }
  /* Tap-to-wake: keep the pet awake until the next time it would head to bed
     (the next occurrence of its sleep-window start hour). */
  function wakePet(p: PetState) {
    const def = p && PET_DEFS[p.pet];
    if (!def || !def.sleepWindow) return;
    const startHour = def.sleepWindow[0];
    const d = new Date(now());
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), startHour, 0, 0, 0);
    if (next.getTime() <= d.getTime()) next.setDate(next.getDate() + 1);
    p.awakeUntil = next.getTime();
  }
  function timePhase(): TimePhase {
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
  function relLuma(hex: string) {
    const c = hexToRgb(hex);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  }

  /* ----- Pet state helpers ----- */
  function freshStats(): Stats { return { hunger: 80, happy: 80, energy: 80, clean: 90 }; }
  /* In-memory key for State.pets. Account-independent (keyed by serial within
     the token) so a pet's state is the same object regardless of who holds it. */
  function petKey(owned: OwnedPet) { return options.tokenId + '-' + owned.serial; }
  function activePet() { return State.activeKey ? State.pets[State.activeKey] : null; }
  async function ensurePetState(owned: OwnedPet) {
    const k = petKey(owned);
    if (!State.pets[k]) {
      /* Load this pet's own record (by {tokenId, serial}); fall back to fresh. */
      const rec = (await options.storage.load(petStorageKey(owned.serial))) as Partial<PetRecord> | null;
      State.pets[k] = {
        stats: (rec && rec.stats) || freshStats(),
        lastTick: (rec && rec.lastTick) || now(),
        name: owned.name, pet: owned.pet, serial: owned.serial,
        traits: owned.traits || {},
        sick: (rec && rec.sick) || false,
        care_count: (rec && rec.care_count) || 0,
        awakeUntil: (rec && rec.awakeUntil) || 0
      };
    } else {
      State.pets[k].name = owned.name;
      State.pets[k].traits = owned.traits || State.pets[k].traits;
      if (State.pets[k].sick === undefined) State.pets[k].sick = false;
      if (State.pets[k].care_count === undefined) State.pets[k].care_count = 0;
    }
    return State.pets[k];
  }
  function addStat(stat: StatName, amt: number) {
    const p = activePet();
    if (!p) return;
    p.stats[stat] = clamp((p.stats[stat] || 0) + amt, 0, 100);
  }
  function setSick(v: boolean) { const p = activePet(); if (p) p.sick = v; }
  function currentMood(stats: Stats): Mood {
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
      for (const stat of STAT_NAMES) {
        const rate = def.decay[stat] || 0;
        p.stats[stat] = clamp(p.stats[stat] - rate * dtHours * mult * sickMult * lvlMult, 0, 100);
      }
      p.lastTick = t;
    }
    checkPassiveAchievements();
  }

  /* ----- Actions ----- */
  function applyAction(action: CareAction) {
    if (State.view !== 'care' || !State.activeKey) return;
    const p = activePet();
    if (!p) return;
    applyDecay();
    if (action === 'feed') { openFeedModal(); return; }
    if (action === 'play') { launchMiniGame(); return; }

    const sleeping = petSleeping(p);
    let multiplier = 1.0;
    let suffix = '';
    if (action === 'sleep' && sleeping)        { multiplier = SLEEP_BONUS_MULT; suffix = ' (bonus!)'; }
    else if (sleeping && action !== 'sleep')   { multiplier = WRONG_TIME_PENALTY; suffix = ' (sleepy)'; addStat('happy', -3); }

    const boosts: Partial<Stats> = action === 'sleep' ? { energy: 40 } : action === 'clean' ? { clean: 40 } : {};
    const sideEffects: Partial<Stats> = action === 'clean' ? { happy: -2 } : {};

    /* Anti-spam: clean/sleep only earn care credit (and thus level progress)
       when the relevant stat was below its threshold beforehand. */
    const rewardsCare = action === 'clean' ? (p.stats.clean  < CLEAN_CARE_THRESHOLD)
                      : action === 'sleep' ? (p.stats.energy < SLEEP_CARE_THRESHOLD)
                      : true;

    for (const stat of STAT_NAMES) {
      const amt = boosts[stat];
      if (amt !== undefined) p.stats[stat] = clamp(p.stats[stat] + amt * multiplier, 0, 100);
    }
    for (const stat of STAT_NAMES) {
      const amt = sideEffects[stat];
      if (amt !== undefined) p.stats[stat] = clamp(p.stats[stat] + amt, 0, 100);
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
  function applyFood(foodId: FoodId) {
    const food = FOODS[foodId];
    if (!food) return;
    const p = activePet();
    const activeKey = State.activeKey;
    if (!p || !activeKey) return;
    if (food.cost > 0 && !Currency.spend(food.cost, 'food:' + foodId)) return;
    applyDecay();
    const wasSick = p.sick;                 // capture before a remedy clears it
    const hungryBefore = p.stats.hunger;    // capture before the hunger boost
    const def = PET_DEFS[p.pet];
    const isFav = def.favoriteFood === foodId;
    const mult = isFav ? 1.5 : 1.0;
    const sleeping = petSleeping(p);
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
    emitInternal('care_action', { action: 'feed', food: foodId, isFavoriteFood: isFav, petSerial: p.serial, petType: p.pet, petKey: activeKey, rewardsCare: rewardsCare });
    persist();
    closeFeedModal();
  }

  /* ----- Achievements ----- */
  function fireAchievement(id: AchievementId) {
    if (!ACHIEVEMENTS[id]) return;
    const existing = State.achievements[id];
    if (existing && existing.unlockedAt) return;
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
  function showAchNotif(id: AchievementId) {
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
  let bubbleTimer: Timer | null = null;
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
    const sleeping = petSleeping(p);
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

  const EVENTS: Record<RandomEventId, { icon: string; autoResolve: boolean; apply(): string }> = {
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
  let eventCheckTimer: Timer | null = null;
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
  function triggerEvent(eventId: RandomEventId) {
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
  const bgCanvas = byClass<HTMLCanvasElement>('slimegachi-bg-canvas');
  const bgCtx = bgCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  let bgParticles: { x: number; y: number; r: number; vy: number; alpha: number }[] = [];

  function resize() {
    const ar = container.getBoundingClientRect();
    bgCanvas.width = ar.width * dpr;
    bgCanvas.height = ar.height * dpr;
    bgCanvas.style.width = ar.width + 'px';
    bgCanvas.style.height = ar.height + 'px';
    try { if (bgCtx) bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {}
    const mc = $opt<HTMLCanvasElement>('minigame-canvas');
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
  const petAnim: { startTime: number; action: CareAction | null; actionStart: number } = { startTime: 0, action: null, actionStart: 0 };
  function triggerCareAnimation(action: CareAction) {
    petAnim.action = action;
    petAnim.actionStart = performance.now();
  }
  function updatePetAnimation() {
    if (State.view !== 'care' || !State.activeKey) return;
    const p = activePet();
    if (!p) return;
    const def = PET_DEFS[p.pet];
    const sleeping = petSleeping(p);
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
    const ownedByPet: Partial<Record<PetId, OwnedPet>> = {};
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
    const slots = container.querySelectorAll<HTMLElement>('.slimegachi-slot');
    const t = performance.now() / 1000;
    slots.forEach((s, i) => {
      const arts = s.querySelectorAll<HTMLElement>('.slimegachi-slot-art');
      const breath = 1 + Math.sin(t * 1.4 + i * 0.7) * 0.025;
      arts.forEach((a) => {
        a.style.transform = 'translate(-50%, -50%) scaleY(' + breath.toFixed(3) + ') scaleX(' + (2 - breath).toFixed(3) + ')';
      });
    });
  }

  /* ----- Stats UI ----- */
  const STAT_COLOR: Record<StatName, string> = { hunger: '#ff9966', happy: '#ffd966', energy: '#66c4ff', clean: '#7fffd4' };
  function renderStats() {
    if (!State.activeKey) return;
    const p = activePet();
    if (!p) return;
    for (const stat of STAT_NAMES) {
      const v = Math.round(p.stats[stat]);
      $('val-' + stat).textContent = String(v);
      const ring = $('bar-' + stat);
      ring.style.setProperty('--pct', String(v));
      ring.style.setProperty('--col', v < 25 ? '#ff5577' : STAT_COLOR[stat]);
    }
    $('petname').textContent = p.name;
    const sleeping = petSleeping(p);
    let moodLabel: string;
    if (p.sick) moodLabel = 'Sick';
    else if (sleeping) moodLabel = 'Sleeping';
    else moodLabel = ({ happy: 'Thriving', okay: 'Content', sad: 'Needs Attention', sleepy: 'Sleepy' })[currentMood(p.stats)] || '';
    $('petmood').textContent = moodLabel ? 'STATUS: ' + moodLabel : '';
    /* Level badge with progress dots */
    const lvlEl = $('petlevel');
    if (lvlEl) {
      const prog = progressToNextLevel(p.care_count || 0);
      let badge = 'Lv ' + prog.lvl;
      if (prog.lvl < MAX_LEVEL) {
        /* 5-dot progress indicator. Round up so any progress shows >=1 dot. */
        const raw = prog.frac * 5;
        const filled = raw > 0 && raw < 1 ? 1 : Math.round(raw);
        badge += ' <span class="slimegachi-lvl-dots">' + '●'.repeat(filled) + '○'.repeat(5 - filled) + '</span>';
      } else {
        badge += ' ' + ACH_ICONS.star + ' MAX';
      }
      lvlEl.innerHTML = badge;
    }
  }
  function spawnActionFeedback(label: string, isFav: boolean) {
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
  function decodePetArt(entry: string): string {
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

  function setPetArt(petType: PetId) {
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

  function enterCare(owned: OwnedPet) {
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
    /* On the care screen the coin count lives in the info column, under the
       level; on the shelf it sits in the topbar (see backToShelf). */
    container.classList.add('slimegachi-care');
    $('petheader').appendChild(byClass('slimegachi-coins'));
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
    /* Return the coin count to the topbar (before the sound button). */
    container.classList.remove('slimegachi-care');
    const coinsEl = byClass('slimegachi-coins');
    const soundBtn = byClass('slimegachi-sound-btn');
    if (soundBtn.parentElement) soundBtn.parentElement.insertBefore(coinsEl, soundBtn);
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
  let blinkTimer: Timer | null = null;
  const pupilState = { tx: 0, ty: 0 }; /* current pupil offset in viewBox units */
  const pupilTarget = { tx: 0, ty: 0 }; /* eased toward this */
  const PUPIL_MAX_OFFSET = 0.8; /* viewBox units — keep pupils inside socket */

  /* Mouth animation: 'idle' | 'chew' | 'talk'. Chew is short-lived; talk
     runs while a speech bubble is up; idle is a flat 1.0 scale. */
  const mouthAnim: { state: 'idle' | 'chew' | 'talk'; startTime: number; duration: number } = { state: 'idle', startTime: 0, duration: 900 };

  /* Happy head bob — kicks in when pet has been happy continuously > 5s */
  const happyBob = { startTime: 0 };

  function spawnEmote(emoji: string) {
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
    if (!p) return;
    const sleeping = petSleeping(p);

    /* --- Mouth --- */
    const mouth = wrapper.querySelector<SVGElement>('.sg-mouth');
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
    const sleeping = petSleeping(p);
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
    const sleeping = petSleeping(p);
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

  function setEyesClosed(closed: boolean) {
    const wrapper = $('petimg');
    if (!wrapper) return;
    const opens = wrapper.querySelectorAll<SVGElement>('.sg-eye-open');
    const shuts = wrapper.querySelectorAll<SVGElement>('.sg-eye-closed');
    opens.forEach((g) => { g.style.display = closed ? 'none' : ''; });
    shuts.forEach((g) => { g.style.display = closed ? '' : 'none'; });
    /* Hide pupils when eyes are closed (otherwise they'd float over the closed line) */
    const pupils = wrapper.querySelectorAll<SVGElement>('.sg-pupil');
    pupils.forEach((g) => { g.style.display = closed ? 'none' : ''; });
  }

  /* Pupil tracking — translate pupils toward the pointer */
  function onPointerMoveForPupils(e: PointerEvent) {
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
    const pupils = wrapper.querySelectorAll<SVGElement>('.sg-pupil');
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

  /* Decay reduction from levels — 1% per level, applied as a multiplier in applyDecay */
  function petDecayMultiplier(petKey: string) {
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

  function tickQuests(ev: QuestEvent) {
    if (!State.quests.slate || State.quests.slate.length === 0) return;
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
  function spawnActionFeedbackOnRoot(label: string) {
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

  function claimQuest(id: string) {
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

  onInternal('care_action', (ev) => { tickQuests(Object.assign({ type: 'care_action' as const }, ev)); updateQuestsDot(); });
  onInternal('minigame_complete', (ev) => { tickQuests(Object.assign({ type: 'minigame_complete' as const }, ev)); updateQuestsDot(); });

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

  /* ----- Mini-games -----
     The games themselves live in minigames.ts; this is the reward side.
     happy = min(35, max(forfeit ? 5 : 10, floor(score * 0.4))), with a 1.5x
     bonus for the pet's favourite game; coins = floor(score * 0.25), 1.5x with
     the Toy Ball buff. */
  const GAME_MASTER_BADGE: Record<GameId, AchievementId> = { bubblepop: 'bubbleMaster', bananacatch: 'bananaMaster' };
  function completeMiniGame(game: GameId, rawScore: number, forfeit: boolean) {
    const score = Math.max(0, rawScore);
    const happy = Math.min(35, Math.max(forfeit ? 5 : 10, Math.floor(score * 0.4)));
    const coinMult = State.toyBuff ? 1.5 : 1.0;
    const coins = Math.floor(score * 0.25 * coinMult);
    if (State.toyBuff) State.toyBuff = false;
    if (State.activeKey) {
      const p = State.pets[State.activeKey];
      const def = PET_DEFS[p.pet];
      const favBonus = def && def.favoriteGame === game ? 1.5 : 1.0;
      addStat('happy', happy * favBonus);
      addStat('energy', -8);
    }
    if (coins > 0) Currency.earn(coins, game);
    if (score >= 100) fireAchievement(GAME_MASTER_BADGE[game]);
    $('miniresult-score').textContent = String(score);
    $('miniresult-happy').textContent = '+' + Math.round(happy);
    $('miniresult-coins').textContent = '+' + coins;
    $('miniresult').classList.add('slimegachi-show');
    renderStats();
    safeEmit('onMiniGameComplete', { game: game, score: score, coins: coins, happy: Math.round(happy), forfeit: !!forfeit });
    emitInternal('minigame_complete', { game: game, score: score, forfeit: !!forfeit });
    persist();
  }
  const gameHost: GameHost = { $: $, dpr: () => dpr, complete: completeMiniGame };
  const BubblePop = createBubblePop(gameHost);
  const BananaCatch = createBananaCatch(gameHost);
  /* Picks the right mini-game for a pet, falling back to BubblePop */
  function pickGameForPet(pet: PetId): MiniGame {
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
    /* Hide the topbar back button during the game + results — navigation is
       via the in-game Exit and the results' "Back to Pet" buttons only. */
    $('back').classList.remove('slimegachi-show');
    if (bubbleTimer) clearTimeout(bubbleTimer);
    if (eventCheckTimer) clearTimeout(eventCheckTimer);
    $('speech').style.display = 'none';
    State.activeGame.start();
  }
  function closeMiniGame() {
    $('minigame').classList.remove('slimegachi-show');
    $('miniresult').classList.remove('slimegachi-show');
    $('back').classList.add('slimegachi-show');
    State.view = 'care';
    musicForCurrentView();
    scheduleNextBubble();
    scheduleEventCheck();
  }

  /* ----- Shop / Feed modals ----- */
  function buildShopGrid(target: 'shop-grid' | 'feed-grid', includeAll: boolean) {
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
    const ids = Object.keys(ACHIEVEMENTS) as AchievementId[];
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
    list.querySelectorAll<HTMLElement>('.slimegachi-quest-claim').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (claimQuest(btn.dataset.quest || '')) {
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
    const c = State.collection || emptyCollection();
    const foodsCount = Object.keys(c.foodsTried || {}).length;
    const totalFoods = Object.keys(FOODS).length;
    const gamesPlayedTotal = Object.values(c.gamesPlayed || {}).reduce((s: number, n) => s + (n || 0), 0);
    const gameKinds = Object.keys(c.gamesPlayed || {}).length;
          const careTypes: Partial<Record<PetId, boolean>> = {};
    for (const k of Object.keys(State.pets)) {
      const p = State.pets[k];
      if ((p.care_count || 0) > 0) careTypes[p.pet] = true;
    }
    const achKeys = Object.keys(ACHIEVEMENTS) as AchievementId[];
    const achU = achKeys.filter((id) => { const a = State.achievements[id]; return !!(a && a.unlockedAt); }).length;

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
  let rafHandle: number | null = null;
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
  async function loadAccount(accountId: string) {
    State.account = accountId;
    $('acct').textContent = State.stubMode ? 'demo' : (accountId || '— not connected —');
    const devMode = $opt('dev-mode');
    if (devMode) devMode.textContent = State.stubMode ? 'demo' : 'mirror';
    setStatus(!State.stubMode && accountId ? 'Loading from mirror node…' : null, 'info');

    const saved = (await options.storage.load(playerStorageKey())) as Partial<PlayerRecord> | null;
    if (saved) {
      State.coins = saved.coins || 0;
      State.achievements = saved.achievements || {};
      State.lastLoginDay = saved.lastLoginDay || null;
      State.loginStreak = saved.loginStreak || 0;
      State.thrivingStartTime = saved.thrivingStartTime || null;
      State.quests = saved.quests || { day: null, slate: [] };
      State.collection = saved.collection || emptyCollection();
    } else {
      State.coins = 0; State.achievements = {};
      State.lastLoginDay = null; State.loginStreak = 0; State.thrivingStartTime = null;
      State.quests = { day: null, slate: [] };
      State.collection = emptyCollection();
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
        onError({ code: 'getOwnedPets_threw', message: 'getOwnedPets failed: ' + (e instanceof Error ? e.message : String(e)) });
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
    const el = e.target instanceof Element ? e.target.closest('button, .slimegachi-slot') : null;
    if (!el) return;
    if (el.classList.contains('slimegachi-actbtn')) return;
    if (el.closest('[data-sg="feed-grid"]')) return;
    Sound.play('click');
  }, true);

  container.querySelectorAll<HTMLElement>('.slimegachi-actbtn').forEach((b) => {
    b.addEventListener('click', () => applyAction(b.dataset.action as CareAction));
  });
  function renderSoundBtn() {
    const btn = $('sound-toggle');
    const m = Sound.isMuted();
    btn.innerHTML = m ? ICONS.soundOff : ICONS.sound;
    btn.setAttribute('aria-pressed', m ? 'true' : 'false');
    btn.classList.toggle('slimegachi-muted', m);
  }
  $('sound-toggle').addEventListener('click', () => { Sound.toggle(); renderSoundBtn(); });
  renderSoundBtn();

  function renderMusicBtn() {
    const btn = $('music-toggle');
    const m = Music.isMuted();
    btn.innerHTML = m ? ICONS.musicOff : ICONS.music;
    btn.setAttribute('aria-pressed', m ? 'true' : 'false');
    btn.classList.toggle('slimegachi-muted', m);
  }
  $('music-toggle').addEventListener('click', () => { Music.toggle(); renderMusicBtn(); });
  renderMusicBtn();

  /* Tap a sleeping pet to wake it (stays up until its next bedtime). */
  $('petimg').addEventListener('click', () => {
    const p = activePet();
    if (State.view !== 'care' || !p || !petSleeping(p)) return;
    wakePet(p);
    spawnActionFeedback('*yawn*', false);
    renderStats();
    scheduleBlink();   /* open the eyes now rather than on the next 4s sleep re-check */
    scheduleNextBubble();
    persist();
  });
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
    const id = $<HTMLInputElement>('connect-input').value.trim();
    if (!/^\d+\.\d+\.\d+$/.test(id)) { alert('Format: 0.0.xxxxxx'); return; }
    $('connect-modal').classList.remove('slimegachi-show');
    State.stubMode = false;
    await loadAccount(id);
  });

  /* Dev panel (only if showDevPanel) */
  if (options.showDevPanel) {
    $('dev-toggle').addEventListener('click', () => {
      if (State.stubMode) {
        $<HTMLInputElement>('connect-input').value = '';
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
      State.collection = emptyCollection();
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
    async setAccountId(accountId: string | null) {
      if (!accountId) { State.stubMode = true; await loadAccount('stub'); return; }
      State.stubMode = false;
      await loadAccount(accountId);
    },
    async disconnect() {
      State.stubMode = true;
      await loadAccount('stub');
    },
    openPet(serial: number) {
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
