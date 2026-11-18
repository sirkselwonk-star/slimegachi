/**
 * SLIMEgachi — pet leveling. Care actions that meet a genuine need increment
 * a pet's `care_count`; levels are derived from it, not stored.
 */
export declare const LEVEL_THRESHOLDS: number[];
export declare const MAX_LEVEL: number;
export declare const MILESTONE_COIN_REWARDS: number[];
export declare function levelForCount(c: number): number;
export declare function progressToNextLevel(c: number): {
    lvl: number;
    frac: number;
    current: number;
    next: number;
};
