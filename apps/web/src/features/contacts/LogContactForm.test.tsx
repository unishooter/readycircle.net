import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MembershipResponse, SessionResponse } from '@readycircle/contracts';
import { LogContactForm } from './LogContactForm.js';

const CIRCLE_ID = 'circle-1';

let sessionResult: { data?: SessionResponse };
let membersResult: { data?: { items: MembershipResponse[] } };

const logContactMock = vi.fn();

vi.mock('../session/api.js', () => ({
  useSession: () => sessionResult,
}));

vi.mock('../circles/api.js', () => ({
  useCircleMembers: () => membersResult,
}));

vi.mock('./api.js', () => ({
  useLogContact: () => ({ mutateAsync: logContactMock, isPending: false, isError: false }),
}));

function makeSession(userId = 'user-1'): SessionResponse {
  return {
    authenticated: true,
    user: {
      id: userId,
      displayName: 'My Name',
      email: null,
      emailVerified: false,
      contactEmail: null,
      emailVisibleToCircle: false,
      phone: null,
      phoneVisibleToCircle: false,
      address: null,
      city: null,
      state: null,
      zip: null,
      addressVisibleToCircle: false,
      authProvider: 'dev',
      isAdmin: false,
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    devAuthEnabled: true,
    cognitoEnabled: false,
    inviteOnlyAccess: false,
  };
}

function makeMember(overrides: Partial<MembershipResponse> = {}): MembershipResponse {
  return {
    id: 'membership-1',
    circleId: CIRCLE_ID,
    stationId: 'station-1',
    stationName: 'My Station',
    stationStatus: 'active',
    userId: 'user-1',
    memberDisplayName: 'My Name',
    contact: { email: null, phone: null, address: null, city: null, state: null, zip: null },
    role: 'member',
    status: 'active',
    joinedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('LogContactForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionResult = { data: makeSession() };
  });

  it("shows a message when the viewer has no station in this Circle", () => {
    membersResult = {
      data: { items: [makeMember({ userId: 'someone-else', stationId: 'station-2', stationName: 'Other Station' })] },
    };
    render(<LogContactForm circleId={CIRCLE_ID} />);
    expect(screen.getByText(/don't have a station in this circle/i)).toBeInTheDocument();
  });

  it('lists only the viewer\u2019s own stations as "Your station" options', () => {
    membersResult = {
      data: {
        items: [
          makeMember(),
          makeMember({ id: 'm2', userId: 'someone-else', stationId: 'station-2', stationName: 'Other Station' }),
        ],
      },
    };
    render(<LogContactForm circleId={CIRCLE_ID} />);
    const yourStationSelect = screen.getByLabelText(/your station/i) as HTMLSelectElement;
    const optionLabels = Array.from(yourStationSelect.options).map((option) => option.textContent);
    expect(optionLabels).toContain('My Station');
    expect(optionLabels).not.toContain('Other Station');
  });

  it('excludes the chosen "your station" from the counterparty options', async () => {
    const user = userEvent.setup();
    membersResult = {
      data: {
        items: [
          makeMember(),
          makeMember({ id: 'm2', userId: 'someone-else', stationId: 'station-2', stationName: 'Other Station' }),
        ],
      },
    };
    render(<LogContactForm circleId={CIRCLE_ID} />);

    await user.selectOptions(screen.getByLabelText(/your station/i), 'station-1');
    const counterpartySelect = screen.getByLabelText(/other station/i) as HTMLSelectElement;
    const optionValues = Array.from(counterpartySelect.options).map((option) => option.value);
    expect(optionValues).not.toContain('station-1');
    expect(optionValues).toContain('station-2');
  });

  it('submits a log-contact request with the entered fields', async () => {
    const user = userEvent.setup();
    membersResult = {
      data: {
        items: [
          makeMember(),
          makeMember({ id: 'm2', userId: 'someone-else', stationId: 'station-2', stationName: 'Other Station' }),
        ],
      },
    };
    logContactMock.mockResolvedValue({});
    const onLogged = vi.fn();
    render(<LogContactForm circleId={CIRCLE_ID} onLogged={onLogged} />);

    await user.selectOptions(screen.getByLabelText(/your station/i), 'station-1');
    await user.selectOptions(screen.getByLabelText(/other station/i), 'station-2');
    await user.selectOptions(screen.getByLabelText(/mode/i), 'repeater');
    await user.type(screen.getByLabelText(/channel/i), 'GMRS ch 3');
    await user.selectOptions(screen.getByLabelText(/signal quality/i), '4');
    await user.click(screen.getByRole('button', { name: /log contact/i }));

    expect(logContactMock).toHaveBeenCalledTimes(1);
    const input = logContactMock.mock.calls[0]![0];
    expect(input.stationId).toBe('station-1');
    expect(input.counterpartyStationId).toBe('station-2');
    expect(input.mode).toBe('repeater');
    expect(input.channel).toBe('GMRS ch 3');
    expect(input.signalRating).toBe(4);
    expect(onLogged).toHaveBeenCalled();
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    membersResult = { data: { items: [makeMember()] } };
    const onCancel = vi.fn();
    render(<LogContactForm circleId={CIRCLE_ID} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
