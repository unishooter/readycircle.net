import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CircleInviteSummary } from '@readycircle/contracts';
import { InviteCard } from './InviteCard.js';

const CIRCLE_ID = 'circle-1';

let invitesResult: { data?: { items: CircleInviteSummary[] }; isLoading: boolean };

const createMock = vi.fn();
const revokeMock = vi.fn();

vi.mock('./api.js', () => ({
  useCircleInvites: () => invitesResult,
  useCreateCircleInvite: () => ({ mutateAsync: createMock, isPending: false, isError: false }),
  useRevokeCircleInvite: () => ({ mutateAsync: revokeMock, isPending: false, isError: false }),
}));

function makeInvite(overrides: Partial<CircleInviteSummary> = {}): CircleInviteSummary {
  return {
    id: 'invite-1',
    circleId: CIRCLE_ID,
    note: 'for Jane',
    status: 'pending',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-15T00:00:00.000Z',
    invitedByUserId: 'user-1',
    invitedByDisplayName: 'Coordinator Carl',
    acceptedAt: null,
    acceptedByDisplayName: null,
    ...overrides,
  };
}

function renderCard() {
  return render(<InviteCard circleId={CIRCLE_ID} />);
}

describe('InviteCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invitesResult = { data: { items: [] }, isLoading: false };
  });

  it('shows an empty state when there are no invites yet', () => {
    renderCard();
    expect(screen.getByText(/no invites yet/i)).toBeInTheDocument();
  });

  it('lists existing invites with their status', () => {
    invitesResult = { data: { items: [makeInvite()] }, isLoading: false };
    renderCard();
    expect(screen.getByText('for Jane')).toBeInTheDocument();
    expect(screen.getByText(/by coordinator carl/i)).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('creates an invite from the form and shows the one-time copyable link', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({ ...makeInvite(), inviteUrl: 'https://readycircle.net/invite/abc123' });
    renderCard();

    await user.click(screen.getByRole('button', { name: /new invite/i }));
    await user.type(screen.getByLabelText(/note/i), 'for testing');
    await user.click(screen.getByRole('button', { name: /create invite link/i }));

    expect(createMock).toHaveBeenCalledWith({ note: 'for testing' });
    expect(screen.getByDisplayValue('https://readycircle.net/invite/abc123')).toBeInTheDocument();
    expect(screen.getByText(/expires in 14 days and can only be used once/i)).toBeInTheDocument();
  });

  it('lets a member revoke a pending invite', async () => {
    const user = userEvent.setup();
    invitesResult = { data: { items: [makeInvite()] }, isLoading: false };
    renderCard();

    await user.click(screen.getByRole('button', { name: /revoke/i }));
    expect(revokeMock).toHaveBeenCalledWith('invite-1');
  });

  it('hides the revoke action for invites that are no longer pending', () => {
    invitesResult = { data: { items: [makeInvite({ status: 'accepted', acceptedByDisplayName: 'New Member' })] }, isLoading: false };
    renderCard();
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
    expect(screen.getByText(/joined as new member/i)).toBeInTheDocument();
  });
});
