import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CircleResponse } from '@readycircle/contracts';
import { CircleEditPage } from './CircleEditPage.js';

const baseCircle: CircleResponse = {
  id: 'circle-1',
  circleType: 'neighborhood',
  circleTypeLabel: 'Neighborhood',
  name: 'Riverside Neighbors',
  circleIdentifier: 'RAV7',
  shortDescription: 'Block watch and emergency prep',
  purpose: 'Stay in touch during outages',
  area: { areaLabel: 'Riverside district', gridOrLocalityLabel: null },
  isPrivate: true,
  requiresApproval: true,
  memberSharingPolicy: 'coordinators_only',
  status: 'active',
  memberCount: 5,
  coordinatorCount: 1,
  viewerRole: 'coordinator',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mutateAsyncMock = vi.fn();
let circleOverride: Partial<CircleResponse> = {};

vi.mock('../../../features/circles/api.js', () => ({
  useCircle: () => ({
    data: { ...baseCircle, ...circleOverride },
    isLoading: false,
    error: null,
  }),
  useUpdateCircle: () => ({ mutateAsync: mutateAsyncMock, isPending: false, isError: false }),
}));

function renderEditPage() {
  return render(
    <MemoryRouter initialEntries={['/app/circles/circle-1/edit']}>
      <Routes>
        <Route path="/app/circles/:circleId/edit" element={<CircleEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CircleEditPage', () => {
  beforeEach(() => {
    circleOverride = {};
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue(baseCircle);
  });

  it("pre-populates the form from the Circle's current values", () => {
    renderEditPage();
    expect(screen.getByLabelText(/circle name/i)).toHaveValue('Riverside Neighbors');
    expect(screen.getByLabelText(/general area/i)).toHaveValue('Riverside district');
  });

  it('shows the read-only Circle Identifier, not the internal database id', () => {
    renderEditPage();
    expect(screen.getByText('Circle Identifier')).toBeInTheDocument();
    expect(screen.getByText('RAV7')).toBeInTheDocument();
    expect(screen.queryByText(baseCircle.id)).not.toBeInTheDocument();
    // Display-only -- there's no editable form field for it, just the copy button.
    expect(screen.queryByRole('textbox', { name: /circle identifier/i })).not.toBeInTheDocument();
  });

  it('saves edited values via useUpdateCircle', async () => {
    const user = userEvent.setup();
    renderEditPage();

    const nameInput = screen.getByLabelText(/circle name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Circle');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed Circle' }));
  });

  it('shows a not-editable message for a non-coordinator instead of the form', () => {
    circleOverride = { viewerRole: 'member' };
    renderEditPage();
    expect(screen.getByText(/you can't edit this circle/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/circle name/i)).not.toBeInTheDocument();
  });
});
