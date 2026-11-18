/**
 * SLIMEgachi widget — zero runtime dependencies.
 *
 * Usage:
 *   const game = SLIMEgachi.mount(container, options);
 *
 * See README.md for the full options/events contract.
 */
import type { MountOptions, SlimegachiInstance } from './types';
import { createInstance } from './instance';

/** Must match `version` in package.json; the build fails if it doesn't. */
export const version = '1.10.0';

/** Mount the game into `container`. Returns the instance API. */
export function mount(container: HTMLElement, options?: MountOptions): SlimegachiInstance {
  if (!container) throw new Error('SLIMEgachi.mount: container is required');
  return createInstance(container, options || {});
}

export type * from './types';
