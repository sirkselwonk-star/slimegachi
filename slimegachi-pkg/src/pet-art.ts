/**
 * SLIMEgachi — embedded pet art (base64 SVG data URIs).
 *
 * `__EMBEDDED_PET_ART__` is replaced at build time by scripts/build.js with
 * the contents of assets/pet-art/. Hosts can override any entry with the
 * `petArt` mount option.
 */
import type { PetId } from './types';

declare const __EMBEDDED_PET_ART__: Partial<Record<PetId, string>> | undefined;

export const EMBEDDED_PET_ART: Partial<Record<PetId, string>> =
  typeof __EMBEDDED_PET_ART__ !== 'undefined' && __EMBEDDED_PET_ART__ ? __EMBEDDED_PET_ART__ : {};
