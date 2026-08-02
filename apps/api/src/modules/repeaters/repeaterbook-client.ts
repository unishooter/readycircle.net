/**
 * Server-side RepeaterBook export API client (mirrors the Nominatim proxy
 * pattern: identifying headers, rate gate, and caching live here rather
 * than in the public JS bundle). One integration covers both services --
 * RepeaterBook serves GMRS repeaters through the same export endpoint with
 * `stype=gmrs`.
 *
 * RepeaterBook requires a free issued app token plus a descriptive
 * User-Agent, and asks that whole-state exports be cached rather than
 * re-fetched -- hence the 24h in-memory cache keyed by state + service.
 */

import type { RepeaterService } from '@readycircle/contracts';

const EXPORT_URL = 'https://www.repeaterbook.com/api/export.php';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 5000;

let lastRequestAt = 0;
let gateQueue: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  const wait = gateQueue.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
    }
    lastRequestAt = Date.now();
  });
  gateQueue = wait;
  return wait;
}

export interface RepeaterBookEntry {
  /** Stable dedupe key: `<State ID>:<Rptr ID>` within a service. */
  externalId: string;
  callsign: string | null;
  outputFrequencyMhz: number;
  /** Formatted as an explicit input frequency when RepeaterBook provides one. */
  offsetOrInput: string | null;
  tone: string | null;
  latitude: number | null;
  longitude: number | null;
  areaLabel: string | null;
  name: string;
  operational: boolean;
}

interface RawRecord {
  'State ID'?: string;
  'Rptr ID'?: string | number;
  Frequency?: string | number;
  'Input Freq'?: string | number;
  PL?: string | number;
  TSQ?: string | number;
  'Nearest City'?: string;
  Landmark?: string;
  County?: string;
  State?: string;
  Callsign?: string;
  'Operational Status'?: string;
  Lat?: string | number;
  Long?: string | number;
}

const cache = new Map<string, { fetchedAt: number; entries: RepeaterBookEntry[] }>();

/** Test seam. */
export function clearRepeaterBookCache(): void {
  cache.clear();
}

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(record: RawRecord): RepeaterBookEntry | null {
  const frequency = toNumber(record.Frequency);
  const stateId = record['State ID'];
  const rptrId = record['Rptr ID'];
  if (frequency === null || !stateId || rptrId === undefined || rptrId === '') return null;

  const callsign = record.Callsign?.trim() || null;
  const city = record['Nearest City']?.trim() || null;
  const landmark = record.Landmark?.trim() || null;
  const inputFreq = toNumber(record['Input Freq']);
  const tone = record.PL !== undefined && record.PL !== '' ? String(record.PL) : record.TSQ !== undefined && record.TSQ !== '' ? String(record.TSQ) : null;

  return {
    externalId: `${stateId}:${String(rptrId)}`,
    callsign,
    outputFrequencyMhz: frequency,
    offsetOrInput: inputFreq !== null ? `input ${inputFreq.toFixed(4)} MHz` : null,
    tone,
    latitude: toNumber(record.Lat),
    longitude: toNumber(record.Long),
    areaLabel: [city, record.State?.trim()].filter(Boolean).join(', ') || null,
    name: landmark || [city, callsign].filter(Boolean).join(' ') || callsign || 'Repeater',
    operational: (record['Operational Status'] ?? '').toLowerCase() !== 'off-air',
  };
}

export interface FetchStateRepeatersOptions {
  appToken: string;
  contactEmail: string;
}

/**
 * Fetches (or serves from cache) every repeater RepeaterBook lists for a US
 * state and service. Callers filter by distance to the Circle centroid.
 */
export async function fetchStateRepeaters(
  state: string,
  service: RepeaterService,
  { appToken, contactEmail }: FetchStateRepeatersOptions,
): Promise<RepeaterBookEntry[]> {
  const cacheKey = `${service}:${state.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.entries;
  }

  await throttle();

  const url = new URL(EXPORT_URL);
  url.searchParams.set('state', state);
  if (service === 'gmrs') url.searchParams.set('stype', 'gmrs');

  const response = await fetch(url, {
    headers: {
      'User-Agent': `ReadyCircle.net Repeater Import (${contactEmail})`,
      Authorization: `Bearer ${appToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`RepeaterBook export responded with status ${response.status}`);
  }

  const body = (await response.json()) as { results?: RawRecord[] };
  const entries = (body.results ?? [])
    .map(normalize)
    .filter((entry): entry is RepeaterBookEntry => entry !== null);

  cache.set(cacheKey, { fetchedAt: Date.now(), entries });
  return entries;
}
