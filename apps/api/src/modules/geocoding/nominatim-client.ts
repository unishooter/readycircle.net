const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
// Nominatim's usage policy caps public API use at 1 request/second
// (https://operations.osmfoundation.org/policies/nominatim/); a little
// headroom above that.
const MIN_INTERVAL_MS = 1100;

let lastRequestAt = 0;
let gateQueue: Promise<void> = Promise.resolve();

/**
 * Serializes calls so that, however many users are concurrently typing into
 * the search box, this process never sends more than ~1 request/second to
 * the shared public Nominatim instance. Chained on a promise queue rather
 * than a bare timestamp check, so two concurrent callers can't both read a
 * stale `lastRequestAt` and slip through together.
 */
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

export interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export interface SearchPlacesOptions {
  /** Required by Nominatim's usage policy to identify requests. */
  contactEmail: string;
  limit?: number;
}

/**
 * Free-form place search (handles zip codes, city/county/state names, or a
 * mix) against OpenStreetMap Nominatim, proxied server-side so the required
 * identifying contact info and the rate gate above live here rather than in
 * the public JS bundle.
 */
export async function searchPlaces(query: string, { contactEmail, limit = 5 }: SearchPlacesOptions): Promise<NominatimResult[]> {
  await throttle();

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('email', contactEmail);

  const response = await fetch(url, {
    headers: {
      // A stock User-Agent (as set by default http libraries) is explicitly
      // disallowed by Nominatim's usage policy.
      'User-Agent': `ReadyCircle.net Station Locator (${contactEmail})`,
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim search responded with status ${response.status}`);
  }

  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error('Unexpected response shape from Nominatim search');
  }
  return body as NominatimResult[];
}

/**
 * Coarse reverse geocode used by the RepeaterBook import search to derive
 * the US state a Circle sits in from its (never exposed) station centroid.
 * Shares the same throttle gate as forward search.
 */
export async function reverseGeocodeState(
  latitude: number,
  longitude: number,
  { contactEmail }: { contactEmail: string },
): Promise<string | null> {
  await throttle();

  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('format', 'json');
  // Zoom 5 resolves to the state level -- we deliberately never ask for
  // anything finer here.
  url.searchParams.set('zoom', '5');
  url.searchParams.set('email', contactEmail);

  const response = await fetch(url, {
    headers: {
      'User-Agent': `ReadyCircle.net Station Locator (${contactEmail})`,
    },
  });
  if (!response.ok) {
    throw new Error(`Nominatim reverse geocode responded with status ${response.status}`);
  }

  const body = (await response.json()) as { address?: { state?: string } };
  return body.address?.state ?? null;
}
