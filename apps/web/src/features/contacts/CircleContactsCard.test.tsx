import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactResponse } from '@readycircle/contracts';
import { CircleContactsCard } from './CircleContactsCard.js';

const CIRCLE_ID = 'circle-1';

let contactsResult: { data?: { items: ContactResponse[] }; isLoading: boolean };
const deleteContactMock = vi.fn();

vi.mock('./api.js', () => ({
  useCircleContacts: () => contactsResult,
  useDeleteContact: () => ({ mutateAsync: deleteContactMock, isPending: false, isError: false }),
}));

vi.mock('./LogContactForm.js', () => ({
  LogContactForm: ({ circleId }: { circleId: string }) => <div data-testid="log-contact-form">Form for {circleId}</div>,
}));

function makeContact(overrides: Partial<ContactResponse> = {}): ContactResponse {
  return {
    id: 'contact-1',
    circleId: CIRCLE_ID,
    circleName: 'Riverside Neighbors',
    stationId: 'station-1',
    stationName: 'My Station',
    counterpartyStationId: 'station-2',
    counterpartyStationName: 'Neighbor Station',
    occurredAt: '2026-07-15T18:00:00.000Z',
    mode: 'simplex',
    repeaterId: null,
    repeaterName: null,
    channel: null,
    signalRating: null,
    notes: null,
    netSessionId: null,
    stationLocation: null,
    stationLocationOverridden: false,
    counterpartyLocation: null,
    counterpartyLocationOverridden: false,
    recordedByUserId: 'user-1',
    recordedByDisplayName: 'Me',
    viewerCanDelete: true,
    createdAt: '2026-07-15T18:05:00.000Z',
    ...overrides,
  };
}

function renderCard() {
  return render(
    <MemoryRouter>
      <CircleContactsCard circleId={CIRCLE_ID} />
    </MemoryRouter>,
  );
}

describe('CircleContactsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactsResult = { data: { items: [] }, isLoading: false };
  });

  it('shows an empty state when there are no contacts yet', () => {
    renderCard();
    expect(screen.getByText(/no contacts logged yet/i)).toBeInTheDocument();
  });

  it('opens the log-contact form when the button is clicked', async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.queryByTestId('log-contact-form')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /log a contact/i }));
    expect(screen.getByTestId('log-contact-form')).toBeInTheDocument();
  });

  it('lists recent contacts and a link to the full Contacts page when there are more than shown', () => {
    contactsResult = {
      data: { items: [1, 2, 3, 4, 5, 6].map((n) => makeContact({ id: `c${n}` })) },
      isLoading: false,
    };
    renderCard();
    expect(screen.getAllByText(/my station/i)).toHaveLength(5);
    expect(screen.getByRole('link', { name: /view all contacts/i })).toBeInTheDocument();
  });

  it('deletes a contact the viewer logged', async () => {
    const user = userEvent.setup();
    contactsResult = { data: { items: [makeContact()] }, isLoading: false };
    renderCard();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(deleteContactMock).toHaveBeenCalledWith('contact-1');
  });

  it('hides the delete action for contacts logged by someone else', () => {
    contactsResult = { data: { items: [makeContact({ viewerCanDelete: false })] }, isLoading: false };
    renderCard();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
