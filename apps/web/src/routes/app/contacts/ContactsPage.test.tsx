import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CircleResponse, ContactResponse } from '@readycircle/contracts';
import { ContactsPage } from './ContactsPage.js';

let circlesResult: { data?: { items: CircleResponse[] } };
let contactsResult: { data?: { items: ContactResponse[] }; isLoading: boolean };

const deleteContactMock = vi.fn();

vi.mock('../../../features/circles/api.js', () => ({
  useCircles: () => circlesResult,
}));

vi.mock('../../../features/contacts/api.js', () => ({
  useMyContacts: () => contactsResult,
  useDeleteContact: () => ({ mutateAsync: deleteContactMock, isPending: false, isError: false }),
}));

// The form itself is covered by LogContactForm.test.tsx -- stub it here so
// this page test can focus on circle selection and the contacts list.
vi.mock('../../../features/contacts/LogContactForm.js', () => ({
  LogContactForm: ({ circleId }: { circleId: string }) => <div data-testid="log-contact-form">Form for {circleId}</div>,
}));

function makeCircle(overrides: Partial<CircleResponse> = {}): CircleResponse {
  return {
    id: 'circle-1',
    circleType: 'neighborhood',
    circleTypeLabel: 'Neighborhood Radio Circle',
    name: 'Riverside Neighbors',
    circleIdentifier: 'RAV7',
    shortDescription: null,
    purpose: null,
    area: { areaLabel: 'Riverside district', gridOrLocalityLabel: null },
    isPrivate: false,
    requiresApproval: false,
    memberSharingPolicy: 'all_members',
    status: 'active',
    memberCount: 2,
    coordinatorCount: 1,
    viewerRole: 'member',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeContact(overrides: Partial<ContactResponse> = {}): ContactResponse {
  return {
    id: 'contact-1',
    circleId: 'circle-1',
    circleName: 'Riverside Neighbors',
    stationId: 'station-1',
    stationName: 'My Station',
    counterpartyStationId: 'station-2',
    counterpartyStationName: 'Neighbor Station',
    occurredAt: '2026-07-15T18:00:00.000Z',
    mode: 'simplex',
    channel: 'GMRS ch 3',
    signalRating: 4,
    notes: null,
    netSessionId: null,
    recordedByUserId: 'user-1',
    recordedByDisplayName: 'Me',
    viewerCanDelete: true,
    createdAt: '2026-07-15T18:05:00.000Z',
    ...overrides,
  };
}

describe('ContactsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    circlesResult = { data: { items: [makeCircle()] } };
    contactsResult = { data: { items: [] }, isLoading: false };
  });

  it('shows an empty state when there are no contacts yet', () => {
    render(<ContactsPage />);
    expect(screen.getByText(/no contacts logged yet/i)).toBeInTheDocument();
  });

  it('lists recent contacts with their circle, mode, and channel', () => {
    contactsResult = { data: { items: [makeContact()] }, isLoading: false };
    render(<ContactsPage />);
    expect(screen.getByText(/my station/i)).toBeInTheDocument();
    expect(screen.getByText(/neighbor station/i)).toBeInTheDocument();
    expect(screen.getAllByText(/riverside neighbors/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/gmrs ch 3/i)).toBeInTheDocument();
  });

  it('shows the delete action only when the viewer logged the contact', () => {
    contactsResult = {
      data: { items: [makeContact({ id: 'a', viewerCanDelete: true }), makeContact({ id: 'b', viewerCanDelete: false })] },
      isLoading: false,
    };
    render(<ContactsPage />);
    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(1);
  });

  it('deletes a contact when its delete button is clicked', async () => {
    const user = userEvent.setup();
    contactsResult = { data: { items: [makeContact()] }, isLoading: false };
    render(<ContactsPage />);

    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(deleteContactMock).toHaveBeenCalledWith('contact-1');
  });

  it('shows the log-contact form once a Circle is chosen', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);

    expect(screen.queryByTestId('log-contact-form')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/circle/i), 'circle-1');
    expect(screen.getByTestId('log-contact-form')).toBeInTheDocument();
  });

  it('prompts to join a Circle when the viewer has none', () => {
    circlesResult = { data: { items: [] } };
    render(<ContactsPage />);
    expect(screen.getByText(/join a circle with at least one other station/i)).toBeInTheDocument();
  });
});
