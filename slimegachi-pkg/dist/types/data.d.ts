/**
 * SLIMEgachi — static game data: pet definitions, foods, achievements,
 * speech lines and tuning constants. See docs/GAME_DESIGN.md before
 * changing a number.
 */
import type { AchievementDef, AchievementId, FoodDef, FoodId, Mood, PetDef, PetId } from './types';
export declare const PET_DEFS: Record<PetId, PetDef>;
export declare const PET_ORDER: PetId[];
export declare const FOODS: Record<FoodId, FoodDef>;
export declare const ACHIEVEMENTS: Record<AchievementId, AchievementDef>;
export declare const SPEECH: Record<PetId, Record<Mood, string[]>>;
export declare const PASSIVE_DECAY_MULTIPLIER = 0.4;
export declare const TICK_INTERVAL_MS = 15000;
export declare const SAVE_DEBOUNCE_MS = 800;
export declare const SPEECH_INTERVAL_MS = 22000;
export declare const EVENT_CHECK_INTERVAL_MS = 60000;
export declare const SLEEP_BONUS_MULT = 1.5;
export declare const WRONG_TIME_PENALTY = 0.5;
export declare const CLEAN_CARE_THRESHOLD = 60;
export declare const SLEEP_CARE_THRESHOLD = 60;
export declare const FEED_CARE_THRESHOLD = 60;
export declare const DEFAULT_MIRROR_NODES: string[];
export declare const DEFAULT_IPFS_GATEWAYS: string[];
export declare const DEFAULT_TOKEN_ID = "0.0.9474754";
