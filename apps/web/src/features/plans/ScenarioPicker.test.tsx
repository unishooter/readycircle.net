import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO, type Scenario } from '@readycircle/contracts';
import { ScenarioPicker } from './ScenarioPicker.js';

/** Controlled harness exposing the latest value for assertions. */
function Harness({ initial = DEFAULT_SCENARIO }: { initial?: Scenario }) {
  const [value, setValue] = useState<Scenario>(initial);
  return (
    <div>
      <ScenarioPicker value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </div>
  );
}

function currentValue(): Scenario {
  return JSON.parse(screen.getByTestId('value').textContent ?? '{}') as Scenario;
}

describe('ScenarioPicker', () => {
  it('marks the matching preset as selected', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: /72-hour local outage/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /extended regional disaster/i })).not.toBeChecked();
  });

  it('switches the whole scenario when another preset is chosen', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('radio', { name: /extended regional disaster/i }));
    expect(currentValue()).toMatchObject({ duration: 'weeks_plus', extent: 'regional' });
  });

  it('opens the editor for a custom scenario and applies edits', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('radio', { name: /custom/i }));
    await user.selectOptions(screen.getByLabelText(/how long/i), 'week');
    await user.selectOptions(screen.getByLabelText(/how widespread/i), 'regional');
    expect(currentValue()).toMatchObject({ duration: 'week', extent: 'regional' });
  });

  it('never allows deselecting the last remaining circumstance', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('radio', { name: /custom/i }));
    await user.click(screen.getByLabelText(/no cellular coverage/i));
    await user.click(screen.getByLabelText(/no internet/i));
    // Only power outage remains; clicking it must be a no-op.
    await user.click(screen.getByLabelText(/power outage/i));
    expect(currentValue().circumstances).toEqual(['power_outage']);
  });
});
