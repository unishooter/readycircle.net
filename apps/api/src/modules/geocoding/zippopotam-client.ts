const ZIPPOPOTAM_US_URL = 'https://api.zippopotam.us/us';

interface ZippopotamPlace {
  'place name': string;
  state: string;
  'state abbreviation': string;
}

interface ZippopotamResponse {
  'post code': string;
  places: ZippopotamPlace[];
}

export interface ZipLookupResult {
  city: string;
  state: string;
}

/**
 * Purpose-built US zip -> city/state lookup, backing the Account page's
 * zip-driven autofill. Free, no API key or identifying contact info
 * required (unlike Nominatim), and returns clean structured fields rather
 * than a free-text place label.
 */
export async function lookupUsZip(zip: string): Promise<ZipLookupResult | null> {
  const response = await fetch(`${ZIPPOPOTAM_US_URL}/${zip}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Zippopotam lookup responded with status ${response.status}`);
  }

  const body = (await response.json()) as ZippopotamResponse;
  const place = body.places?.[0];
  if (!place) return null;

  return { city: place['place name'], state: place['state abbreviation'] };
}
