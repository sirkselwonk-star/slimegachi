/**
 * SLIMEgachi — the widget instance. One is created per mount() call; all game
 * state lives in this closure.
 */
import type { MountOptions, SlimegachiInstance } from './types';
export declare function createInstance(container: HTMLElement, userOptions: MountOptions): SlimegachiInstance;
