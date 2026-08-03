import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@readycircle/contracts';
import { AccountPage } from './AccountPage.js';

const baseUser: CurrentUser = {
  id: 'user-1',
  displayName: 'Ana Rivera',
  email: 'ana@example.com',
  emailVerified: true,
  emailVisibleToCircle: false,
  phone: null,
  phoneVisibleToCircle: false,
  address: null,
  addressVisibleToCircle: false,
  authProvider: 'google',
  isAdmin: false,
  createdAt: '2025-01-01T00:00:00.000Z',
};

const mutateAsyncMock = vi.fn();
let userOverride: Partial<CurrentUser> = {};

vi.mock('../../features/session/api.js', () => ({
  useCurrentUser: () => ({ data: { ...baseUser, ...userOverride }, isLoading: false }),
  useUpdateCurrentUser: () => ({ mutateAsync: mutateAsyncMock, isPending: false, isError: false }),
}));

function renderPage() {
  return render(<AccountPage />);
}

describe('AccountPage', () => {
  beforeEach(() => {
    userOverride = {};
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue(baseUser);
  });

  it("pre-populates the form from the current user's values", () => {
    renderPage();
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Ana Rivera');
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('ana@example.com');
    expect(screen.getByLabelText(/phone/i)).toHaveValue('');
  });

  it('disables the email visibility toggle when there is no email on file', () => {
    userOverride = { email: null };
    renderPage();
    const emailToggle = screen.getAllByLabelText(/visible to my circles/i)[0]!;
    expect(emailToggle).toBeDisabled();
  });

  it('keeps the phone visibility toggle disabled until a phone number is entered', async () => {
    const user = userEvent.setup();
    renderPage();
    const [, phoneToggle] = screen.getAllByLabelText(/visible to my circles/i);
    expect(phoneToggle).toBeDisabled();

    await user.type(screen.getByLabelText(/phone/i), '555-0100');
    expect(phoneToggle).toBeEnabled();
  });

  it('clears a visibility toggle when its field is emptied', async () => {
    const user = userEvent.setup();
    userOverride = { phone: '555-0100', phoneVisibleToCircle: true };
    renderPage();
    const [, phoneToggle] = screen.getAllByLabelText(/visible to my circles/i);
    expect(phoneToggle).toBeChecked();

    await user.clear(screen.getByLabelText(/phone/i));
    expect(phoneToggle).not.toBeChecked();
    expect(phoneToggle).toBeDisabled();
  });

  it('saves display name, phone, address, and toggles via useUpdateCurrentUser', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/phone/i), '555-0100');
    const [, phoneToggle] = screen.getAllByLabelText(/visible to my circles/i);
    await user.click(phoneToggle!);
    await user.type(screen.getByLabelText(/address/i), '123 Main St');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Ana Rivera',
        phone: '555-0100',
        address: '123 Main St',
        phoneVisibleToCircle: true,
        addressVisibleToCircle: false,
      }),
    );
  });

  it('sends an explicit null to clear a previously-set phone number', async () => {
    const user = userEvent.setup();
    userOverride = { phone: '555-0100' };
    renderPage();

    await user.clear(screen.getByLabelText(/phone/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ phone: null }));
  });
});
