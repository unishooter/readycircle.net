import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CircleWizardPage } from './CircleWizardPage.js';

const mutateAsyncMock = vi.fn();
vi.mock('../../../features/circles/api.js', () => ({
  useCreateCircle: () => ({ mutateAsync: mutateAsyncMock, isPending: false, isError: false }),
}));

vi.mock('../../../features/stations/api.js', () => ({
  useStations: () => ({
    data: { items: [{ id: 'station-1', name: "Ana's Home Station", status: 'active' }] },
    isLoading: false,
  }),
}));

// Real Leaflet map interaction can't be simulated under JSDOM once a
// value with an `mgrsCode` is set (it renders a <Rectangle>, which needs a
// vector renderer JSDOM doesn't support -- see MapLocationPicker.test.tsx),
// so this fake stands in for click-to-select behavior across the wizard
// and edit-page tests.
vi.mock('../../../features/location/MapLocationPicker.js', () => ({
  MapLocationPicker: ({ onChange }: { onChange: (value: { latitude: number; longitude: number }) => void }) => (
    <button type="button" onClick={() => onChange({ latitude: 38.8977, longitude: -77.0365 })}>
      Simulate map click
    </button>
  ),
}));

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/app/circles/new']}>
      <CircleWizardPage />
    </MemoryRouter>,
  );
}

async function advanceToAreaStep(user: ReturnType<typeof userEvent.setup>) {
  // Step 0 (Type) has a default selection already; step 1 (Identity) needs a name.
  await user.click(screen.getByRole('button', { name: /next/i }));
  await user.type(screen.getByLabelText(/circle name/i), 'Riverside Neighbors');
  await user.click(screen.getByRole('button', { name: /next/i }));
}

describe('CircleWizardPage grid location', () => {
  it('shows the map picker with instructional copy on the Area step, and no clear button yet', async () => {
    const user = userEvent.setup();
    renderWizard();
    await advanceToAreaStep(user);

    expect(screen.getByText(/map location \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByText(/represent your circle's actual coverage/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear location/i })).not.toBeInTheDocument();
  });

  it('shows a Clear location button once a location is picked, and clears it on click', async () => {
    const user = userEvent.setup();
    renderWizard();
    await advanceToAreaStep(user);

    await user.click(screen.getByRole('button', { name: /simulate map click/i }));
    expect(screen.getByRole('button', { name: /clear location/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear location/i }));
    expect(screen.queryByRole('button', { name: /clear location/i })).not.toBeInTheDocument();
  });

  it('submits the picked gridLocation when creating the Circle', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ id: 'circle-9' });
    renderWizard();
    await advanceToAreaStep(user);

    await user.type(screen.getByLabelText(/general area/i), 'Riverside district');
    await user.click(screen.getByRole('button', { name: /simulate map click/i }));

    // Membership & privacy, then station selection.
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByLabelText(/ana's home station/i));
    await user.click(screen.getByRole('button', { name: /next/i }));

    await user.click(screen.getByRole('button', { name: /create circle/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        area: { areaLabel: 'Riverside district', gridLocation: { latitude: 38.8977, longitude: -77.0365 } },
      }),
    );
  });
});
