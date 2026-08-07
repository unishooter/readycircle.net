import { Button, Field, TextInput } from '@readycircle/ui';
import { MapLocationPicker, type MapLocationPickerValue } from '../location/MapLocationPicker.js';
import { PlaceSearch, type PlaceSearchResult } from '../location/PlaceSearch.js';

export interface RepeaterLocationValue {
  areaLabel: string;
  latitude: number | null;
  longitude: number | null;
}

export interface RepeaterLocationFieldsProps {
  value: RepeaterLocationValue;
  onChange: (value: RepeaterLocationValue) => void;
}

/**
 * Optional precise location for a Circle directory repeater. Coords help RF
 * coverage estimates; save is allowed without them.
 */
export function RepeaterLocationFields({ value, onChange }: RepeaterLocationFieldsProps) {
  const pickerValue: MapLocationPickerValue | null =
    value.latitude != null && value.longitude != null
      ? { latitude: value.latitude, longitude: value.longitude }
      : null;

  function handlePlaceSelect(result: PlaceSearchResult) {
    onChange({
      areaLabel: result.label,
      latitude: result.latitude,
      longitude: result.longitude,
    });
  }

  function handleMapChange(next: MapLocationPickerValue) {
    onChange({
      ...value,
      latitude: next.latitude,
      longitude: next.longitude,
    });
  }

  function clearLocation() {
    onChange({ areaLabel: value.areaLabel, latitude: null, longitude: null });
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-ink">Location</p>
        <p className="text-xs text-ink/50">
          Optional, but recommended — plans use coordinates when estimating who can hear this
          machine. You can save without a pin.
        </p>
        <PlaceSearch onSelect={handlePlaceSelect} placeholder="Search city or place…" />
      </div>
      <Field label="Area label" hint="Shown in the directory list">
        {(id) => (
          <TextInput
            id={id}
            value={value.areaLabel}
            onChange={(event) => onChange({ ...value, areaLabel: event.target.value })}
            placeholder="e.g. north side of town"
          />
        )}
      </Field>
      <MapLocationPicker mode="precise" value={pickerValue} onChange={handleMapChange} />
      {pickerValue ? (
        <Button type="button" variant="ghost" size="sm" onClick={clearLocation}>
          Clear map pin
        </Button>
      ) : (
        <p className="text-xs text-amber-800/80">No location yet — coverage estimates will be weaker.</p>
      )}
    </div>
  );
}
