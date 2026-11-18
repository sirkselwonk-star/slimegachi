/**
 * SLIMEgachi — default NFT ownership lookup: Hedera Mirror Node for the
 * account's serials, then IPFS for each NFT's metadata. Hosts can replace
 * this wholesale with the `getOwnedPets` mount option.
 */
import type { GetOwnedPets, OwnedPet, PetId, SlimegachiError } from './types';
import { PET_DEFS } from './data';

export interface OwnershipLookupOptions {
  tokenId: string;
  mirrorNodes: string[];
  ipfsGateways: string[];
  onError(err: SlimegachiError): void;
}

/** The slice of a Mirror Node NFT row the lookup reads. */
interface MirrorNft { serial_number: number; metadata?: string; }
interface NftAttribute { trait_type: string; value: string; }
interface NftMetadata { name?: string; image?: string; attributes?: NftAttribute[]; }

function isPetId(v: string): v is PetId {
  return Object.prototype.hasOwnProperty.call(PET_DEFS, v);
}

/* Default getOwnedPets — Mirror Node + IPFS gateways */
export function makeDefaultGetOwnedPets(opts: OwnershipLookupOptions): GetOwnedPets {
  return async function (accountId: string) {
    if (!accountId) return [];
    const tokenId = opts.tokenId;
    const path = '/accounts/' + accountId + '/nfts?token.id=' + tokenId + '&limit=100';
    let data: { nfts?: MirrorNft[] } | null = null;
    let lastErr: Error | null = null;
    for (const base of opts.mirrorNodes) {
      try {
        const res = await fetch(base + path);
        if (res.status === 404) {
          opts.onError({ code: 'account_not_found', message: 'Account ' + accountId + ' not found on mainnet.' });
          return [];
        }
        if (!res.ok) { lastErr = new Error(base + ' → HTTP ' + res.status); continue; }
        data = await res.json();
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }
    if (!data) {
      opts.onError({
        code: 'mirror_unreachable',
        message: 'All mirror nodes unreachable. ' + (lastErr ? lastErr.message : '') + ' (Tip: open over http://, not file://)'
      });
      return [];
    }
    const nfts = (data && data.nfts) || [];
    if (nfts.length === 0) {
      opts.onError({ code: 'no_nfts', message: 'Account ' + accountId + ' holds no SLIME NFTs.' });
      return [];
    }
    const owned: OwnedPet[] = [];
    for (const nft of nfts) {
      const meta = await fetchMetadata(nft, opts.ipfsGateways);
      if (!meta) continue;
      const headTrait = (meta.attributes || []).find((a) => a.trait_type === 'Head');
      const headValue = headTrait && headTrait.value;
      if (!headValue) continue;
      if (isPetId(headValue) && PET_DEFS[headValue].status === 'available') {
        owned.push({
          pet: headValue,
          serial: nft.serial_number,
          name: meta.name || 'SLIME #' + nft.serial_number,
          image: meta.image || null,
          traits: Object.fromEntries((meta.attributes || []).map((a) => [a.trait_type, a.value]))
        });
      }
    }
    if (owned.length === 0) {
      opts.onError({ code: 'no_playable_pets', message: 'Account has SLIME NFTs but none with Kitten or Monkey heads.' });
    }
    return owned;
  };
}
async function fetchMetadata(nft: MirrorNft, gateways: string[]): Promise<NftMetadata | null> {
  const b64 = nft.metadata;
  if (!b64) return null;
  let uri: string;
  try { uri = atob(b64); } catch (e) { return null; }
  if (!uri.startsWith('ipfs://')) return null;
  const path = uri.replace('ipfs://', '');
  for (const gw of gateways) {
    try {
      const r = await fetch(gw + path, { cache: 'force-cache' });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  return null;
}
