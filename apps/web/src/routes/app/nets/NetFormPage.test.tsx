import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetCreatePage } from './NetFormPage.js';

const createNetMock = vi.fn().mockResolvedValue({ id: 'net-new' });

vi.mock('../../../features/nets/api.js', () => ({
  useCreateNet: () => ({ mutateAsync: createNetMock, isPending: false, isError: false, error: null }),
  useNet: () => ({ data: undefined, isLoading: false, error: null }),
  useUpdateNet: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
}));

vi.mock('../../../features/circles/api.js', () => ({
  useCircle: () => ({ data: { id: 'circle-1', name: 'Riverside Neighbors' }, isLoading: false }),
}));

vi.mock('../../../features/plans/api.js', () => ({
  usePlanVersion: () => ({ data: undefined, isLoading: false }),
}));

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/app/circles/circle-1/nets/new']}>
      <Routes>
        <Route path="/app/circles/:circleId/nets/new" element={<NetCreatePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NetCreatePage', () => {
  beforeEach(() => {
    createNetMock.mockClear();
  });

  it('disables submit until the required fields are filled', () => {
    renderCreate();
    expect(screen.getByRole('heading', { name: /schedule a net for riverside neighbors/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /schedule net/i })).toBeDisabled();
  });

  it('submits the parsed form as a create request', async () => {
    renderCreate();
    await userEvent.type(screen.getByLabelText(/net name/i), 'Sunday Evening Net');
    await userEvent.type(screen.getByLabelText(/channel/i), 'FRS channel 3');
    await userEvent.type(screen.getByLabelText(/first occurrence/i), '2026-08-02');
    await userEvent.type(screen.getByLabelText(/net procedure/i), 'Open the net\nTake check-ins');

    const submit = screen.getByRole('button', { name: /schedule net/i });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(createNetMock).toHaveBeenCalledTimes(1);
    const input = createNetMock.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      name: 'Sunday Evening Net',
      channel: 'FRS channel 3',
      schedule: expect.objectContaining({
        frequency: 'weekly',
        firstOccursOn: '2026-08-02',
        timeLocal: '19:00',
      }),
      procedure: ['Open the net', 'Take check-ins'],
    });
  });
});
