import { AUTHORIZATION_LABELS, EXPERIENCE_LEVEL_LABELS, authorizationSchema, experienceLevelSchema } from '@readycircle/contracts';
import { Field, Select } from '@readycircle/ui';
import type { StationFormDraft } from './types.js';

export interface StationExperienceSectionProps {
  draft: StationFormDraft;
  onChange: (patch: Partial<StationFormDraft>) => void;
}

export function StationExperienceSection({ draft, onChange }: StationExperienceSectionProps) {
  return (
    <div className="space-y-4">
      <Field label="Experience level" required>
        {(id) => (
          <Select
            id={id}
            value={draft.experienceLevel}
            onChange={(event) => onChange({ experienceLevel: event.target.value as StationFormDraft['experienceLevel'] })}
          >
            {experienceLevelSchema.options.map((option) => (
              <option key={option} value={option}>
                {EXPERIENCE_LEVEL_LABELS[option]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Authorization" required>
        {(id) => (
          <Select
            id={id}
            value={draft.authorization}
            onChange={(event) => onChange({ authorization: event.target.value as StationFormDraft['authorization'] })}
          >
            {authorizationSchema.options.map((option) => (
              <option key={option} value={option}>
                {AUTHORIZATION_LABELS[option]}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}
