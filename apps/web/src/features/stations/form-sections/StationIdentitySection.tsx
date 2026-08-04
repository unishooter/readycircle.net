import { STATION_TYPE_LABELS, stationTypeSchema } from '@readycircle/contracts';
import { Field, Select, TextInput } from '@readycircle/ui';
import type { StationFormDraft } from './types.js';

export interface StationIdentitySectionProps {
  draft: StationFormDraft;
  onChange: (patch: Partial<StationFormDraft>) => void;
  autoFocusName?: boolean;
}

export function StationIdentitySection({ draft, onChange, autoFocusName }: StationIdentitySectionProps) {
  return (
    <div className="space-y-4">
      <Field label="Station name" required hint="e.g. 'Home base' or 'Ana's Go-Kit'">
        {(id) => (
          <TextInput
            id={id}
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            autoFocus={autoFocusName}
          />
        )}
      </Field>
      <Field label="Station type" required>
        {(id) => (
          <Select
            id={id}
            value={draft.stationType}
            onChange={(event) => onChange({ stationType: event.target.value as StationFormDraft['stationType'] })}
          >
            {stationTypeSchema.options.map((option) => (
              <option key={option} value={option}>
                {STATION_TYPE_LABELS[option]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Callsign"
        hint="Optional -- e.g. KI5ABC-9. Used to match this station's own APRS beacons for live map tracking."
      >
        {(id) => (
          <TextInput
            id={id}
            value={draft.callsign ?? ''}
            onChange={(event) => onChange({ callsign: event.target.value || undefined })}
            placeholder="KI5ABC-9"
          />
        )}
      </Field>
    </div>
  );
}
