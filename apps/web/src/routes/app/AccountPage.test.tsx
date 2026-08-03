import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@readycircle/contracts';
import { AccountPage } from './AccountPage.js';

const baseUser: CurrentUser = {
  id: 'user-1',
  displayName: 'Ana Rivera',
  email: 'ana@example.com',
  emailVerified: true,
  contactEmail: null,
  emailVisibleToCircle: false,
  phone: null,
  phoneVisibleToCircle: false,
  address: null,
  city: null,
  state: null,
  zip: null,
  addressVisibleToCircle: false,
  authProvider: 'google',
  isAdmin: false,
  createdAt: '2025-01-01T00:00:00.000Z',
};

const mutateAsyncMock = vi.fn();
let userOverride: Partial<CurrentUser> = {};
let zipLookupResult: { city: string; state: string } | undefined;

vi.mock('../../features/session/api.js', () => ({
  useCurrentUser: () => ({ data: { ...baseUser, ...userOverride }, isLoading: false }),
  useUpdateCurrentUser: () => ({ mutateAsync: mutateAsyncMock, isPending: false, isError: false }),
}));

vi.mock('../../features/geocoding/api.js', () => ({
  useZipLookup: () => ({ data: zipLookupResult }),
}));

function renderPage() {
  return render(<AccountPage />);
}

describe('AccountPage', () => {
  beforeEach(() => {
    userOverride = {};
    zipLookupResult = undefined;
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue(baseUser);
  });

  it("pre-populates the form from the current user's values", () => {
    renderPage();
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Ana Rivera');
    expect(screen.getByLabelText(/phone/i)).toHaveValue('');
    expect(screen.getByLabelText(/^city$/i)).toHaveValue('');
    expect(screen.getByLabelText(/^state$/i)).toHaveValue('');
    expect(screen.getByLabelText(/^zip$/i)).toHaveValue('');
  });

  it('displays the login email as a live default when no contactEmail override is set', () => {
    renderPage();
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('ana@example.com');
  });

  it('displays an explicit contactEmail override instead of the login email', () => {
    userOverride = { contactEmail: 'shared@example.com' };
    renderPage();
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('shared@example.com');
  });

  it('saves an explicit contactEmail override when the email field is edited', async () => {
    const user = userEvent.setup();
    renderPage();

    // fireEvent.change rather than user.clear+type: the input's displayed
    // value is a computed fallback (draft.contactEmail || user.email), so an
    // intermediate empty state would immediately redisplay the login email,
    // which trips up user-event's internal value tracking mid-interaction.
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'shared@example.com' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ contactEmail: 'shared@example.com' }));
  });

  it('saves null for contactEmail when cleared back to the login-email default', async () => {
    const user = userEvent.setup();
    userOverride = { contactEmail: 'shared@example.com', emailVisibleToCircle: true };
    renderPage();

    // Clearing to '' resumes tracking the login email rather than clearing to nothing.
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ contactEmail: null }));
  });

  it('disables the email visibility toggle only when there is neither a login nor override email', () => {
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

  it('keeps the address visibility toggle disabled until any of street, city, state, or zip is entered', async () => {
    const user = userEvent.setup();
    renderPage();
    const [, , addressToggle] = screen.getAllByLabelText(/visible to my circles/i);
    expect(addressToggle).toBeDisabled();

    await user.type(screen.getByLabelText(/^city$/i), 'Springfield');
    expect(addressToggle).toBeEnabled();
  });

  it('disables the address visibility toggle again only once all four address fields are emptied', async () => {
    const user = userEvent.setup();
    userOverride = {
      address: '123 Maple St',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
      addressVisibleToCircle: true,
    };
    renderPage();
    const [, , addressToggle] = screen.getAllByLabelText(/visible to my circles/i);
    expect(addressToggle).toBeChecked();

    await user.clear(screen.getByLabelText(/address/i));
    expect(addressToggle).toBeChecked();
    await user.clear(screen.getByLabelText(/^city$/i));
    expect(addressToggle).toBeChecked();
    await user.clear(screen.getByLabelText(/^state$/i));
    expect(addressToggle).toBeChecked();
    await user.clear(screen.getByLabelText(/^zip$/i));
    expect(addressToggle).not.toBeChecked();
    expect(addressToggle).toBeDisabled();
  });

  it('auto-fills city and state once the zip lookup resolves', async () => {
    zipLookupResult = { city: 'Springfield', state: 'IL' };
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/^city$/i)).toHaveValue('Springfield');
      expect(screen.getByLabelText(/^state$/i)).toHaveValue('IL');
    });
  });

  it('saves display name, phone, address parts, and toggles via useUpdateCurrentUser', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/phone/i), '555-0100');
    const [, phoneToggle] = screen.getAllByLabelText(/visible to my circles/i);
    await user.click(phoneToggle!);
    await user.type(screen.getByLabelText(/address/i), '123 Main St');
    await user.type(screen.getByLabelText(/^city$/i), 'Springfield');
    await user.type(screen.getByLabelText(/^state$/i), 'il');
    await user.type(screen.getByLabelText(/^zip$/i), '62704');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Ana Rivera',
        phone: '555-0100',
        address: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip: '62704',
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
