import { useCallback, useState } from 'react';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Rectangle, TileLayer, useMapEvents } from 'react-leaflet';
import { mgrsCellBounds } from '@readycircle/geo';
import { Button } from '@readycircle/ui';
import 'leaflet/dist/leaflet.css';
import './leaflet-icon-fix.js';
import { computeGridSelection } from './grid-selection.js';

export interface MapLocationPickerValue {
  latitude: number;
  longitude: number;
  /** Only meaningful in 'grid' mode. */
  mgrsCode?: string;
}

export interface MapLocationPickerProps {
  /**
   * 'grid' snaps every click to its containing 1km MGRS cell and stores the
   * cell's center (see computeGridSelection) -- an exact click point is
   * never captured. 'precise' stores the raw click point directly; it's the
   * only mode that ever populates real precision, for the 'precise, visible
   * only to me' option.
   */
  mode: 'grid' | 'precise';
  value?: MapLocationPickerValue | null;
  onChange: (value: MapLocationPickerValue) => void;
}

// Roughly the geographic center of the contiguous US -- there's no
// geo-IP/default-location lookup, so an unselected map just opens zoomed out
// on the whole country rather than guessing.
const DEFAULT_CENTER: LatLngExpression = [39.5, -98.35];
const DEFAULT_ZOOM = 4;
const SELECTED_ZOOM = 13;

function ClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function toLeafletBounds(bounds: ReturnType<typeof mgrsCellBounds>): LatLngBoundsExpression {
  return [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ];
}

export function MapLocationPicker({ mode, value, onChange }: MapLocationPickerProps) {
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const handleSelect = useCallback(
    (lat: number, lng: number) => {
      if (mode === 'grid') {
        const selection = computeGridSelection(lat, lng);
        onChange({ latitude: selection.latitude, longitude: selection.longitude, mgrsCode: selection.mgrsCode });
      } else {
        onChange({ latitude: lat, longitude: lng });
      }
    },
    [mode, onChange],
  );

  function handleUseCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setLocateError('Your browser does not support location detection.');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        handleSelect(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setLocating(false);
        setLocateError('Could not detect your location -- pick a point on the map instead.');
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  const center: LatLngExpression = value ? [value.latitude, value.longitude] : DEFAULT_CENTER;
  const zoom = value ? SELECTED_ZOOM : DEFAULT_ZOOM;
  const gridBounds: LatLngBoundsExpression | null =
    mode === 'grid' && value?.mgrsCode ? toLeafletBounds(mgrsCellBounds(value.mgrsCode)) : null;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-black/10">
        {/* `key={mode}` forces a remount when switching modes so the map's
            initial center/zoom (which react-leaflet only applies on mount)
            re-evaluates against the current value. */}
        <MapContainer key={mode} center={center} zoom={zoom} style={{ height: '320px', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onSelect={handleSelect} />
          {value ? <Marker position={[value.latitude, value.longitude]} /> : null}
          {gridBounds ? <Rectangle bounds={gridBounds} pathOptions={{ color: '#33465c', weight: 2, fillOpacity: 0.1 }} /> : null}
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink/60">
          {mode === 'grid' ? (
            value?.mgrsCode ? (
              <>
                Selected 1km grid square: <span className="font-medium text-ink">{value.mgrsCode}</span>
              </>
            ) : (
              "Click the map to select the 1km grid square you're in."
            )
          ) : value ? (
            `Selected: ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
          ) : (
            'Click the map to drop a pin at your exact location.'
          )}
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={handleUseCurrentLocation} disabled={locating}>
          {locating ? 'Locating…' : 'Use my current location'}
        </Button>
      </div>
      {locateError ? (
        <p role="alert" className="text-xs text-red-700">
          {locateError}
        </p>
      ) : null}
    </div>
  );
}
