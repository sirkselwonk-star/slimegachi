/**
 * SLIMEgachi — embedded pet art (base64 SVG data URIs).
 *
 * `__EMBEDDED_PET_ART__` is replaced at build time by scripts/build.js with
 * the contents of assets/pet-art/. Hosts can override any entry with the
 * `petArt` mount option.
 */
import type { PetId } from './types';
export declare const EMBEDDED_PET_ART: Partial<Record<PetId, string>>;
