/**
 * SLIMEgachi — pet leveling. Care actions that meet a genuine need increment
 * a pet's `care_count`; levels are derived from it, not stored.
 */

export const LEVEL_THRESHOLDS = [0, 5, 12, 22, 35, 50, 70, 100, 140, 200, 280];
export const MAX_LEVEL = LEVEL_THRESHOLDS.length - 1;
export const MILESTONE_COIN_REWARDS = [0, 8, 12, 18, 25, 35, 50, 70, 100, 140, 200];

export function levelForCount(c: number): number {
  for (let i = MAX_LEVEL; i >= 0; i--) {
    if (c >= LEVEL_THRESHOLDS[i]) return i;
  }
  return 0;
}
export function progressToNextLevel(c: number) {
  const lvl = levelForCount(c);
  if (lvl >= MAX_LEVEL) return { lvl: lvl, frac: 1, current: c, next: c };
  const base = LEVEL_THRESHOLDS[lvl];
  const next = LEVEL_THRESHOLDS[lvl + 1];
  return { lvl: lvl, frac: (c - base) / (next - base), current: c - base, next: next - base };
}
