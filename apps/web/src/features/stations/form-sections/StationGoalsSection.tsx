import { STATION_GOAL_LABELS, stationGoalSchema } from '@readycircle/contracts';
import { CheckboxOption } from '@readycircle/ui';
import type { StationFormDraft } from './types.js';

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export interface StationGoalsSectionProps {
  draft: StationFormDraft;
  onChange: (patch: Partial<StationFormDraft>) => void;
}

export function StationGoalsSection({ draft, onChange }: StationGoalsSectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink/60">What do you want to use this station for? Select all that apply.</p>
      {stationGoalSchema.options.map((option) => (
        <CheckboxOption
          key={option}
          label={STATION_GOAL_LABELS[option]}
          checked={draft.goals.includes(option)}
          onChange={() => onChange({ goals: toggleValue(draft.goals, option) })}
        />
      ))}
    </div>
  );
}
