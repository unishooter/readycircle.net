import { RADIO_CAPABILITY_LABELS, radioCapabilitySchema } from '@readycircle/contracts';
import { CheckboxOption } from '@readycircle/ui';
import type { StationFormDraft } from './types.js';

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export interface StationCapabilitiesSectionProps {
  draft: StationFormDraft;
  onChange: (patch: Partial<StationFormDraft>) => void;
}

export function StationCapabilitiesSection({ draft, onChange }: StationCapabilitiesSectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink/60">What can this station use? Select all that apply.</p>
      {radioCapabilitySchema.options.map((option) => (
        <CheckboxOption
          key={option}
          label={RADIO_CAPABILITY_LABELS[option]}
          checked={draft.capabilities.includes(option)}
          onChange={() => onChange({ capabilities: toggleValue(draft.capabilities, option) })}
        />
      ))}
    </div>
  );
}
