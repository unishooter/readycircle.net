import { useEffect, useState } from 'react';
import { TextInput } from '@readycircle/ui';
import { useGeocodingSearch } from '../geocoding/api.js';

export interface PlaceSearchResult {
  label: string;
  latitude: number;
  longitude: number;
}

export interface PlaceSearchProps {
  onSelect: (result: PlaceSearchResult) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 400;

/**
 * Free-text search for a zip code, city, county, or state name (via the
 * server-side Nominatim proxy) -- the "broad area" location-capture path,
 * for stations that shouldn't or can't share a precise 1km grid square.
 */
export function PlaceSearch({ onSelect, placeholder }: PlaceSearchProps) {
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [justSelected, setJustSelected] = useState(false);

  useEffect(() => {
    if (justSelected) return;
    const handle = setTimeout(() => setDebounced(input), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [input, justSelected]);

  const { data, isFetching } = useGeocodingSearch(debounced);
  const results = data?.results ?? [];
  const showResults = !justSelected && debounced.trim().length >= 2 && results.length > 0;

  function handleInputChange(nextValue: string) {
    setInput(nextValue);
    setJustSelected(false);
  }

  function handleSelect(result: PlaceSearchResult) {
    onSelect(result);
    setInput(result.label);
    setJustSelected(true);
  }

  return (
    <div className="relative">
      <TextInput
        value={input}
        onChange={(event) => handleInputChange(event.target.value)}
        placeholder={placeholder ?? 'Search zip code, city, county, or state'}
      />
      {isFetching ? <p className="mt-1 text-xs text-ink/50">Searching…</p> : null}
      {showResults ? (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-black/10 bg-white shadow-md">
          {results.map((result, index) => (
            <li key={`${result.label}-${index}`}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-navy-50"
                onClick={() => handleSelect(result)}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
