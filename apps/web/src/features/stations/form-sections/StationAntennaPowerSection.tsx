import {
  ANTENNA_TYPE_LABELS,
  antennaTypeSchema,
  BACKUP_POWER_LABELS,
  backupPowerSchema,
  type BackupPower,
} from '@readycircle/contracts';
import { CheckboxOption, Field, Select, TextInput } from '@readycircle/ui';
import type { StationFormDraft } from './types.js';

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function parsePositiveInt(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export interface StationAntennaPowerSectionProps {
  draft: StationFormDraft;
  onChange: (patch: Partial<StationFormDraft>) => void;
}

/**
 * Optional RF attributes feeding the coverage / gear-check analysis in
 * generated plans. Everything here can be left blank -- the analysis falls
 * back to conservative defaults based on station type.
 */
export function StationAntennaPowerSection({ draft, onChange }: StationAntennaPowerSectionProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">
        Optional, but the coverage analysis in generated plans gets much more accurate with real numbers.
      </p>
      <Field label="Transmit power (watts)" hint="A typical handheld is 5 W; a mobile radio 25–50 W.">
        {(id) => (
          <TextInput
            id={id}
            type="number"
            min={1}
            max={1500}
            value={draft.transmitPowerWatts ?? ''}
            onChange={(event) => onChange({ transmitPowerWatts: parsePositiveInt(event.target.value) })}
          />
        )}
      </Field>
      <Field label="Antenna type">
        {(id) => (
          <Select
            id={id}
            value={draft.antennaType ?? ''}
            onChange={(event) =>
              onChange({
                antennaType: event.target.value
                  ? (event.target.value as StationFormDraft['antennaType'])
                  : undefined,
              })
            }
          >
            <option value="">Not sure / not set</option>
            {antennaTypeSchema.options.map((option) => (
              <option key={option} value={option}>
                {ANTENNA_TYPE_LABELS[option]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Antenna height (feet above ground)" hint="Roof-mounted antennas are usually 15–30 ft.">
        {(id) => (
          <TextInput
            id={id}
            type="number"
            min={0}
            max={500}
            value={draft.antennaHeightFeet ?? ''}
            onChange={(event) => onChange({ antennaHeightFeet: parsePositiveInt(event.target.value) })}
          />
        )}
      </Field>
      <div className="space-y-3">
        <p className="text-sm font-medium text-ink">Backup power</p>
        {backupPowerSchema.options.map((option: BackupPower) => (
          <CheckboxOption
            key={option}
            label={BACKUP_POWER_LABELS[option]}
            checked={(draft.backupPower ?? []).includes(option)}
            onChange={() => onChange({ backupPower: toggleValue(draft.backupPower ?? [], option) })}
          />
        ))}
      </div>
    </div>
  );
}
