import { useState } from 'react';
import {
  SCENARIO_CIRCUMSTANCE_LABELS,
  SCENARIO_DURATION_LABELS,
  SCENARIO_EXTENT_LABELS,
  SCENARIO_PRESETS,
  type Scenario,
  type ScenarioCircumstance,
  type ScenarioDuration,
  type ScenarioExtent,
} from '@readycircle/contracts';
import { CheckboxOption, Select, TextInput } from '@readycircle/ui';

export interface ScenarioPickerProps {
  value: Scenario;
  onChange: (scenario: Scenario) => void;
}

function matchesPreset(value: Scenario, preset: Scenario): boolean {
  return (
    value.duration === preset.duration &&
    value.extent === preset.extent &&
    (value.notes ?? null) === (preset.notes ?? null) &&
    value.circumstances.length === preset.circumstances.length &&
    preset.circumstances.every((c) => value.circumstances.includes(c))
  );
}

/**
 * Scenario selection for plan generation: preset chips with an expandable
 * custom editor. The chosen scenario shapes the connectivity analysis
 * framing and the AI gear/backup-power recommendations.
 */
export function ScenarioPicker({ value, onChange }: ScenarioPickerProps) {
  const activePreset = SCENARIO_PRESETS.find((preset) => matchesPreset(value, preset.scenario));
  const [customOpen, setCustomOpen] = useState(!activePreset);
  const showEditor = customOpen || !activePreset;

  function toggleCircumstance(circumstance: ScenarioCircumstance) {
    const has = value.circumstances.includes(circumstance);
    // At least one circumstance must stay selected.
    if (has && value.circumstances.length === 1) return;
    onChange({
      ...value,
      circumstances: has
        ? value.circumstances.filter((c) => c !== circumstance)
        : [...value.circumstances, circumstance],
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Scenario">
        {SCENARIO_PRESETS.map((preset) => {
          const selected = !customOpen && activePreset?.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setCustomOpen(false);
                onChange({ ...preset.scenario, circumstances: [...preset.scenario.circumstances] });
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                selected ? 'bg-navy-700 text-white' : 'bg-black/5 text-ink/70 hover:bg-black/10'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={showEditor}
          onClick={() => setCustomOpen(true)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            showEditor ? 'bg-navy-700 text-white' : 'bg-black/5 text-ink/70 hover:bg-black/10'
          }`}
        >
          Custom
        </button>
      </div>

      {showEditor ? (
        <div className="space-y-3 rounded-lg border border-black/5 bg-black/[0.02] p-3">
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink/60">What has failed?</legend>
            <div className="space-y-1">
              {(Object.keys(SCENARIO_CIRCUMSTANCE_LABELS) as ScenarioCircumstance[]).map((circumstance) => (
                <CheckboxOption
                  key={circumstance}
                  label={SCENARIO_CIRCUMSTANCE_LABELS[circumstance]}
                  checked={value.circumstances.includes(circumstance)}
                  onChange={() => toggleCircumstance(circumstance)}
                />
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink/60">How long?</span>
              <Select
                value={value.duration}
                onChange={(e) => onChange({ ...value, duration: e.target.value as ScenarioDuration })}
              >
                {(Object.keys(SCENARIO_DURATION_LABELS) as ScenarioDuration[]).map((duration) => (
                  <option key={duration} value={duration}>
                    {SCENARIO_DURATION_LABELS[duration]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink/60">How widespread?</span>
              <Select
                value={value.extent}
                onChange={(e) => onChange({ ...value, extent: e.target.value as ScenarioExtent })}
              >
                {(Object.keys(SCENARIO_EXTENT_LABELS) as ScenarioExtent[]).map((extent) => (
                  <option key={extent} value={extent}>
                    {SCENARIO_EXTENT_LABELS[extent]}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/60">Notes (optional)</span>
            <TextInput
              value={value.notes ?? ''}
              onChange={(e) => onChange({ ...value, notes: e.target.value || null })}
              placeholder="e.g. wildfire season, bridge access may be cut off"
              maxLength={500}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
