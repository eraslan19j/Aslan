export type RegionId = 'esenler-namik-kemal' | 'fatih-sultanahmet-eminonu';

export interface RegionRegistryEntry {
  id: RegionId;
  nameTr: string;
  nameEn: string;
  subtitleTr: string;
  subtitleEn: string;
  /** Runtime fetch URL relative to index.html (served from public/derived-data/...). */
  baseUrl: string;
  /** Disk subdirectory relative to repo root public/. */
  publicSubdir: string;
  /** Whether the region borders open Bosphorus/Marmara sea plane. */
  hasCoastalSea: boolean;
  /** Ambient district architectural character. */
  character: 'residential-hillside' | 'historic-peninsula';
}

export const DEFAULT_REGION_ID: RegionId = 'esenler-namik-kemal';

export const REGION_REGISTRY: readonly RegionRegistryEntry[] = [
  {
    id: 'esenler-namik-kemal',
    nameTr: 'Esenler · Namık Kemal',
    nameEn: 'Esenler · Namik Kemal',
    subtitleTr: 'Dar eğimli konut sokakları, bakkal, çay ocağı ve mahalle hayatı',
    subtitleEn: 'Sloped residential alleys, corner bakkal, tea houses & local life',
    baseUrl: './derived-data/esenler-namik-kemal',
    publicSubdir: 'derived-data/esenler-namik-kemal',
    hasCoastalSea: false,
    character: 'residential-hillside',
  },
  {
    id: 'fatih-sultanahmet-eminonu',
    nameTr: 'Fatih · Sultanahmet–Eminönü',
    nameEn: 'Fatih · Sultanahmet–Eminonu',
    subtitleTr: 'Tarihî yarımada, Hipodrom, Divanyolu ve Eminönü sahili',
    subtitleEn: 'Historic peninsula, Hippodrome, Divanyolu & Eminonu waterfront',
    baseUrl: './derived-data/fatih-sultanahmet-eminonu',
    publicSubdir: 'derived-data/fatih-sultanahmet-eminonu',
    hasCoastalSea: true,
    character: 'historic-peninsula',
  },
] as const;

export function resolveRegionId(candidate: string | null | undefined): RegionId {
  if (candidate === 'fatih-sultanahmet-eminonu') return 'fatih-sultanahmet-eminonu';
  return DEFAULT_REGION_ID;
}

export function getRegionEntry(id: RegionId): RegionRegistryEntry {
  return REGION_REGISTRY.find((r) => r.id === id) ?? REGION_REGISTRY[0]!;
}
