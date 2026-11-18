/**
 * SLIMEgachi — static game data: pet definitions, foods, achievements,
 * speech lines and tuning constants. See docs/GAME_DESIGN.md before
 * changing a number.
 */
import type { AchievementDef, AchievementId, FoodDef, FoodId, Mood, PetDef, PetId } from './types';
import { ACH_ICONS, EMOTE_ICONS, FOOD_ICONS, MISC_ICONS } from './icons';

/* ===================================================================
   Pet definitions — gameplay metadata. Decay rates, sleep windows,
   favorite foods/games, accent colors. Driven by the "Head" trait
   value in the NFT metadata.
   =================================================================== */
export const PET_DEFS: Record<PetId, PetDef> = {
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
export const PET_ORDER: PetId[] = ['Kitten', 'Monkey', 'Owl', 'Dragon'];

export const FOODS: Record<FoodId, FoodDef> = {
  snack:    { id: 'snack',    name: 'Snack',     icon: FOOD_ICONS.snack,    cost: 0,  hunger: 20, happy: 0,  clean: 0,  desc: 'Free, basic' },
  burger:   { id: 'burger',   name: 'Burger',    icon: FOOD_ICONS.burger,   cost: 15, hunger: 35, happy: 0,  clean: -3, desc: 'Filling, messy' },
  banana:   { id: 'banana',   name: 'Banana',    icon: FOOD_ICONS.banana,   cost: 8,  hunger: 25, happy: 5,  clean: 0,  desc: 'Sweet & happy' },
  cake:     { id: 'cake',     name: 'Cake',      icon: FOOD_ICONS.cake,     cost: 25, hunger: 40, happy: 10, clean: -8, desc: 'Treat yourself' },
  medicine: { id: 'medicine', name: 'Medicine',  icon: FOOD_ICONS.medicine, cost: 30, hunger: 0,  happy: -2, clean: 0,  desc: 'Cures sickness', healsSick: true },
  toyball:  { id: 'toyball',  name: 'Toy Ball',  icon: FOOD_ICONS.toyball,  cost: 20, hunger: 0,  happy: 8,  clean: 0,  desc: 'Buffs next play', isToy: true }
};

export const ACHIEVEMENTS: Record<AchievementId, AchievementDef> = {
  firstSteps:   { id: 'firstSteps',   name: 'First Steps',       desc: 'Cared for a pet for the first time',   mintable: false, icon: ACH_ICONS.paw },
  pickyEater:   { id: 'pickyEater',   name: 'Picky Eater',       desc: 'Fed a pet its favorite food',          mintable: false, icon: ACH_ICONS.star },
  squeakyClean: { id: 'squeakyClean', name: 'Squeaky Clean',     desc: 'All four stats above 80 at once',      mintable: false, icon: ACH_ICONS.sparkle },
  devoted:      { id: 'devoted',      name: 'Devoted Caretaker', desc: '7-day care streak',                    mintable: true,  icon: ACH_ICONS.diamond },
  bubbleMaster: { id: 'bubbleMaster', name: 'Bubble Master',     desc: 'Score 100+ in Bubble Pop',             mintable: false, icon: ACH_ICONS.bubbles },
  bananaMaster: { id: 'bananaMaster', name: 'Banana Master',     desc: 'Score 100+ in Banana Catch',           mintable: false, icon: FOOD_ICONS.banana },
  whisperer:    { id: 'whisperer',    name: 'Slime Whisperer',   desc: 'Kept pet Thriving for 24 hours',       mintable: true,  icon: ACH_ICONS.glowstar }
};

export const SPEECH: Record<PetId, Record<Mood, string[]>> = {
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
export const PASSIVE_DECAY_MULTIPLIER = 0.4;
export const TICK_INTERVAL_MS = 15000;
export const SAVE_DEBOUNCE_MS = 800;
export const SPEECH_INTERVAL_MS = 22000;
export const EVENT_CHECK_INTERVAL_MS = 60000;
export const SLEEP_BONUS_MULT = 1.5;
export const WRONG_TIME_PENALTY = 0.5;
/* A care action only counts toward leveling when it meets a genuine need —
   the relevant stat is below its threshold beforehand. Topping up an already
   satisfied pet still applies the stat boost but earns no care credit, so the
   free Clean / Sleep / Snack buttons can't be spammed for easy levels. */
export const CLEAN_CARE_THRESHOLD = 60;  // clean
export const SLEEP_CARE_THRESHOLD = 60;  // energy
export const FEED_CARE_THRESHOLD  = 60;  // hunger

export const DEFAULT_MIRROR_NODES = [
  'https://mainnet-public.mirrornode.hedera.com/api/v1',
  'https://mainnet.mirrornode.hedera.com/api/v1',
  'https://mainnet.hashio.io/api/v1'
];
export const DEFAULT_IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/'
];
export const DEFAULT_TOKEN_ID = '0.0.9474754';
