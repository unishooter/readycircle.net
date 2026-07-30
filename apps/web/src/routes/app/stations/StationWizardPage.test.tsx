import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StationWizardPage } from './StationWizardPage.js';

const mutateAsyncMock = vi.fn();
vi.mock('../../../features/stations/api.js', () => ({
  useCreateStation: () => ({ mutateAsync: mutateAsyncMock, isPending: false, isError: false }),
}));

describe('StationWizardPage', () => {
  it('blocks moving past the identity step until a name is entered', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StationWizardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/station name/i), 'Home base');
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
  });

  it('advances through steps to the location step', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StationWizardPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/station name/i), 'Home base');
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByLabelText(/general area/i)).toBeInTheDocument();
  });
});
