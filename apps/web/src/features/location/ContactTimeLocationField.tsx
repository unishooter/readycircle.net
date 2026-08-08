import { useEffect, useState } from 'react';
import type { ContactLocation } from '@readycircle/contracts';
import { Button } from '@readycircle/ui';
import { MapLocationPicker } from './MapLocationPicker.js';

export interface ContactTimeLocationFieldProps {
  /** Section title, e.g. "Where you were (optional)". */
  label: string;
  /**
   * Station home coords when the viewer is allowed to see them (own station).
   * Null/undefined for counterparty (privacy) — server still defaults from DB.
   */
  defaultLocation: ContactLocation | null;
  /** Whether a visible default is available to show on the map. */
  defaultKnown: boolean;
  value: ContactLocation | null;
  overridden: boolean;
  onChange: (next: { location: ContactLocation | null; overridden: boolean }) => void;
  hint?: string;
}

/**
 * Precise MapLocationPicker for contact/check-time location. Defaults to the
 * station home when known; "Adjust on map" reveals the same picker used on
 * station edit (precise mode).
 */
export function ContactTimeLocationField({
  label,
  defaultLocation,
  defaultKnown,
  value,
  overridden,
  onChange,
  hint,
}: ContactTimeLocationFieldProps) {
  const [adjusting, setAdjusting] = useState(overridden);

  useEffect(() => {
    if (overridden) setAdjusting(true);
  }, [overridden]);

  const display = overridden ? value : defaultLocation;

  function startAdjust() {
    setAdjusting(true);
    if (!overridden && defaultLocation) {
      onChange({ location: defaultLocation, overridden: true });
    } else if (!overridden) {
      onChange({ location: value, overridden: true });
    }
  }

  function useDefault() {
    setAdjusting(false);
    onChange({ location: defaultLocation, overridden: false });
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          {hint ? <p className="mt-0.5 text-xs text-ink/50">{hint}</p> : null}
          <p className="mt-1 text-xs text-ink/60">
            {overridden
              ? 'Custom location for this log'
              : defaultKnown
                ? 'Using station saved location'
                : 'Will use their saved station location (if any)'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!adjusting ? (
            <Button type="button" size="sm" variant="secondary" onClick={startAdjust}>
              Adjust on map
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={useDefault}>
              Use station default
            </Button>
          )}
        </div>
      </div>
      {adjusting ? (
        <MapLocationPicker
          mode="precise"
          value={display ? { latitude: display.latitude, longitude: display.longitude } : null}
          onChange={(next) =>
            onChange({ location: { latitude: next.latitude, longitude: next.longitude }, overridden: true })
          }
        />
      ) : null}
    </div>
  );
}
