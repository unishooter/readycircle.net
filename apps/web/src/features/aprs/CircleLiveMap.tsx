import { useEffect } from 'react';
import type { LatLngExpression, LatLngTuple } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { AprsPositionResponse } from '@readycircle/contracts';
import { Card, CardTitle } from '@readycircle/ui';
import 'leaflet/dist/leaflet.css';
import '../location/leaflet-icon-fix.js';
import { useCircleAprsPositions } from './api.js';
import { formatHeardAgo, isStale } from './format.js';

// Same "geographic center of the contiguous US" fallback used by
// MapLocationPicker -- only relevant before any position has ever loaded.
const DEFAULT_CENTER: LatLngExpression = [39.5, -98.35];
const DEFAULT_ZOOM = 4;

function FitToMarkers({ positions }: { positions: AprsPositionResponse[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    const only = positions.length === 1 ? positions[0] : undefined;
    if (only) {
      map.setView([only.latitude, only.longitude], 13);
      return;
    }
    const bounds: LatLngTuple[] = positions.map((p) => [p.latitude, p.longitude]);
    map.fitBounds(bounds, { padding: [32, 32] });
    // Only re-fit when the set of positions actually changes shape/values,
    // not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(positions.map((p) => [p.stationId, p.latitude, p.longitude]))]);
  return null;
}

export interface CircleLiveMapProps {
  circleId: string;
}

/**
 * Read-only live map of member stations currently beaconing over APRS.
 * Positions are heard directly from APRS-IS by the worker (see
 * apps/worker/src/aprs) and matched to a station by its configured
 * callsign -- there is no manual placement here. Deliberately shows exact
 * coordinates to every Circle member regardless of a station's location
 * privacy setting (see docs/decisions/0017-aprs-live-tracking.md).
 */
export function CircleLiveMap({ circleId }: CircleLiveMapProps) {
  const { data, isLoading } = useCircleAprsPositions(circleId);
  const positions = data?.items ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Live map</CardTitle>
        <p className="text-xs text-ink/50">Via APRS</p>
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-ink/50">Loading…</p>
      ) : positions.length === 0 ? (
        <p className="mt-3 text-sm text-ink/60">
          No live positions yet. Add a callsign to your station to enable live tracking -- see your station&apos;s
          edit page.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-black/10">
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: '320px', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitToMarkers positions={positions} />
            {positions.map((position) => {
              const stale = isStale(position.heardAt);
              return (
                <Marker
                  key={position.stationId}
                  position={[position.latitude, position.longitude]}
                  opacity={stale ? 0.45 : 1}
                >
                  <Popup>
                    <p className="font-medium">{position.stationName}</p>
                    <p>{position.callsign}</p>
                    {position.comment ? <p>{position.comment}</p> : null}
                    <p className={stale ? 'text-ink/50' : undefined}>Heard {formatHeardAgo(position.heardAt)}</p>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      )}
    </Card>
  );
}
