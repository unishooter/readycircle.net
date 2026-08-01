import { STATION_VISIBILITY_LABELS, stationVisibilitySchema } from '@readycircle/contracts';
import { CheckboxOption, RadioOption } from '@readycircle/ui';
import type { StationFormDraft } from './types.js';

export interface StationParticipationPrivacySectionProps {
  draft: StationFormDraft;
  onChange: (patch: Partial<StationFormDraft>) => void;
}

export function StationParticipationPrivacySection({ draft, onChange }: StationParticipationPrivacySectionProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-medium text-ink">Participation</p>
        <CheckboxOption
          label="Participate in scheduled check-ins"
          checked={draft.participatesInScheduledChecks}
          onChange={(event) => onChange({ participatesInScheduledChecks: event.target.checked })}
        />
        <CheckboxOption
          label="Willing to relay messages for others"
          checked={draft.willingToRelay}
          onChange={(event) => onChange({ willingToRelay: event.target.checked })}
        />
        <CheckboxOption
          label="Willing to act as net control"
          checked={draft.willingToActAsNetControl}
          onChange={(event) => onChange({ willingToActAsNetControl: event.target.checked })}
        />
        <CheckboxOption
          label="Receive-only (this station cannot transmit)"
          checked={draft.receiveOnly}
          onChange={(event) => onChange({ receiveOnly: event.target.checked })}
        />
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium text-ink">Who can see this station?</p>
        {stationVisibilitySchema.options.map((option) => (
          <RadioOption
            key={option}
            name="visibility"
            label={STATION_VISIBILITY_LABELS[option]}
            checked={draft.visibility === option}
            onChange={() => onChange({ visibility: option })}
          />
        ))}
      </div>
    </div>
  );
}
