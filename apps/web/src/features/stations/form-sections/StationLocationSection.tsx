import { LOCATION_PRECISION_LABELS, locationPrecisionSchema, type StationLocationInput } from '@readycircle/contracts';
import { deriveGridIdentifier } from '@readycircle/geo';
import { Field, Select, TextInput } from '@readycircle/ui';
import { MapLocationPicker, type MapLocationPickerValue } from '../../location/MapLocationPicker.js';
import { PlaceSearch, type PlaceSearchResult } from '../../location/PlaceSearch.js';

export interface StationLocationSectionProps {
  location: StationLocationInput;
  onChange: (patch: Partial<StationLocationInput>) => void;
}

/**
 * Location capture for a station: the display-precision selector gates
 * which capture method shows underneath it, since each precision level
 * implies a different capture method (map cell, broad-area search, exact
 * pin, or nothing at all). Coordinates are always sent to the server, which
 * derives the canonical 1km MGRS `gridIdentifier` "geo fence code" itself
 * (see @readycircle/geo and docs/decisions/0009-mgrs-location-capture.md) --
 * there's no free-text grid input here.
 */
export function StationLocationSection({ location, onChange }: StationLocationSectionProps) {
  const hasCoordinates = location.latitude != null && location.longitude != null;
  // Recomputed from stored coordinates rather than trusted from state, so
  // the highlighted grid cell still shows correctly when editing a station
  // whose location was captured (and the page then reloaded) previously --
  // deriving is deterministic and cheap, so there's nothing to cache.
  const gridPickerValue: MapLocationPickerValue | null = hasCoordinates
    ? {
        latitude: location.latitude!,
        longitude: location.longitude!,
        mgrsCode: deriveGridIdentifier(location.latitude, location.longitude) ?? undefined,
      }
    : null;
  const precisePickerValue: MapLocationPickerValue | null = hasCoordinates
    ? { latitude: location.latitude!, longitude: location.longitude! }
    : null;

  function handleMapChange(value: MapLocationPickerValue, source: StationLocationInput['locationSource']) {
    onChange({ latitude: value.latitude, longitude: value.longitude, locationSource: source });
  }

  function handlePlaceSelect(result: PlaceSearchResult) {
    onChange({
      areaLabel: result.label,
      latitude: result.latitude,
      longitude: result.longitude,
      locationSource: 'geocode_search',
    });
  }

  return (
    <div className="space-y-4">
      <Field
        label="Display precision"
        required
        hint="Controls what others in your Circle can see. Your exact coordinates are never shared."
      >
        {(id) => (
          <Select
            id={id}
            value={location.precision}
            onChange={(event) => onChange({ precision: event.target.value as StationLocationInput['precision'] })}
          >
            {locationPrecisionSchema.options.map((option) => (
              <option key={option} value={option}>
                {LOCATION_PRECISION_LABELS[option]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {location.precision === 'one_km_grid' ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">1km grid square</p>
          <MapLocationPicker mode="grid" value={gridPickerValue} onChange={(value) => handleMapChange(value, 'map_click')} />
        </div>
      ) : null}

      {location.precision === 'precise_private' ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">Exact location (only ever visible to you)</p>
          <MapLocationPicker mode="precise" value={precisePickerValue} onChange={(value) => handleMapChange(value, 'map_click')} />
        </div>
      ) : null}

      {location.precision === 'broad_area' ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-ink">Search for your area</p>
            <PlaceSearch onSelect={handlePlaceSelect} />
            <p className="text-xs text-ink/50">
              Broader than a 1km grid square -- acceptable, but less useful when building a communications plan.
            </p>
          </div>
          <Field label="General area" hint="A neighborhood, town, or region name -- edit if the search above didn't find it.">
            {(id) => (
              <TextInput
                id={id}
                value={location.areaLabel ?? ''}
                onChange={(event) => onChange({ areaLabel: event.target.value })}
                placeholder="e.g. Downtown Springfield"
              />
            )}
          </Field>
        </div>
      ) : null}

      {location.precision === 'hidden' ? (
        <p className="text-xs text-ink/50">
          Your location won&apos;t be shown to anyone, including other members of your Circle.
          {hasCoordinates ? ' (A previously selected location is still saved privately -- switch precision above to show or change it.)' : null}
        </p>
      ) : null}
    </div>
  );
}
