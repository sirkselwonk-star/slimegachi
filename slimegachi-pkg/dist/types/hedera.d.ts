/**
 * SLIMEgachi — default NFT ownership lookup: Hedera Mirror Node for the
 * account's serials, then IPFS for each NFT's metadata. Hosts can replace
 * this wholesale with the `getOwnedPets` mount option.
 */
import type { GetOwnedPets, SlimegachiError } from './types';
export interface OwnershipLookupOptions {
    tokenId: string;
    mirrorNodes: string[];
    ipfsGateways: string[];
    onError(err: SlimegachiError): void;
}
export declare function makeDefaultGetOwnedPets(opts: OwnershipLookupOptions): GetOwnedPets;
