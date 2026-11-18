/**
 * SLIMEgachi widget — zero runtime dependencies.
 *
 * Usage:
 *   const game = SLIMEgachi.mount(container, options);
 *
 * See README.md for the full options/events contract.
 */
import type { MountOptions, SlimegachiInstance } from './types';
/** Must match `version` in package.json; the build fails if it doesn't. */
export declare const version = "1.10.0";
/** Mount the game into `container`. Returns the instance API. */
export declare function mount(container: HTMLElement, options?: MountOptions): SlimegachiInstance;
export type * from './types';
