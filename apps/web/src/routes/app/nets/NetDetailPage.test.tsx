import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetDetailResponse, NetSessionResponse } from '@readycircle/contracts';
import { NetDetailPage } from './NetDetailPage.js';

let netResult: { data?: NetDetailResponse; isLoading: boolean; error: Error | null } = {
  data: undefined,
  isLoading: false,
  error: null,
};

const recordCheckinMock = vi.fn().mockResolvedValue({});
const openSessionMock = vi.fn().mockResolvedValue({});

function mutationStub(mutateAsync: (input?: unknown) => Promise<unknown>) {
  return { mutateAsync, isPending: false, isError: false, error: null };
}

vi.mock('../../../features/nets/api.js', () => ({
  useNet: () => netResult,
  useOpenSession: () => mutationStub(openSessionMock),
  useCloseSession: () => mutationStub(vi.fn().mockResolvedValue({})),
  useRecordCheckin: () => mutationStub(recordCheckinMock),
  useRemoveCheckin: () => mutationStub(vi.fn().mockResolvedValue({})),
  useArchiveNet: () => mutationStub(vi.fn().mockResolvedValue({})),
}));

vi.mock('../../../features/stations/api.js', () => ({
  useStations: () => ({ data: { items: [{ id: 'station-mine' }] }, isLoading: false }),
}));

function makeSession(overrides: Partial<NetSessionResponse> = {}): NetSessionResponse {
  return {
    id: 'session-1',
    netId: 'net-1',
    scheduledFor: '2026-08-03T00:00:00.000Z',
    startedAt: '2026-08-03T00:01:00.000Z',
    endedAt: null,
    status: 'open',
    netControlStationId: null,
    netControlStationName: null,
    notes: null,
    checkins: [],
    ...overrides,
  };
}

function makeDetail(overrides: Partial<NetDetailResponse> = {}): NetDetailResponse {
  return {
    id: 'net-1',
    circleId: 'circle-1',
    circleName: 'Riverside Neighbors',
    name: 'Sunday Evening Net',
    description: 'Weekly practice for the neighborhood.',
    channel: 'FRS channel 3 (462.6125 MHz)',
    schedule: {
      frequency: 'weekly',
      frequencyLabel: 'Weekly',
      firstOccursOn: '2026-08-02',
      timeLocal: '19:00',
      timezone: 'America/Chicago',
      durationMinutes: 30,
    },
    procedure: ['Open the net', 'Take check-ins'],
    status: 'active',
    sourcePlanVersionId: null,
    nextOccurrences: ['2026-08-10T00:00:00.000Z'],
    viewerCanManage: false,
    viewerCanRunSession: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    sessions: [],
    participation: [
      {
        stationId: 'station-mine',
        stationName: 'My Handheld',
        operatorName: 'Me',
        sessionsAttended: 3,
        recentAttendanceRate: 0.75,
        currentStreak: 2,
      },
      {
        stationId: 'station-other',
        stationName: 'Neighbor Base',
        operatorName: 'Neighbor',
        sessionsAttended: 1,
        recentAttendanceRate: 0.25,
        currentStreak: 0,
      },
    ],
    closedSessionCount: 4,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/nets/net-1']}>
      <Routes>
        <Route path="/app/nets/:netId" element={<NetDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NetDetailPage', () => {
  beforeEach(() => {
    netResult = { data: makeDetail(), isLoading: false, error: null };
    recordCheckinMock.mockClear();
    openSessionMock.mockClear();
  });

  it('renders schedule, procedure, and participation stats', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Sunday Evening Net' })).toBeInTheDocument();
    expect(screen.getByText(/weekly at 19:00/i)).toBeInTheDocument();
    expect(screen.getByText('Open the net')).toBeInTheDocument();
    // Participation table with counts and streaks.
    expect(screen.getByText('My Handheld')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('2 in a row')).toBeInTheDocument();
  });

  it('hides the start-session button from members without session rights', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();
  });

  it('shows the start-session button to authorized viewers and opens a session', async () => {
    netResult = { data: makeDetail({ viewerCanRunSession: true }), isLoading: false, error: null };
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /start session/i }));
    expect(openSessionMock).toHaveBeenCalled();
  });

  it('lets a member check in only their own station during an open session', async () => {
    netResult = { data: makeDetail({ sessions: [makeSession()] }), isLoading: false, error: null };
    renderPage();
    expect(screen.getByText(/session in progress/i)).toBeInTheDocument();

    // Only the viewer's own station has a check-in button.
    const checkinButton = screen.getByRole('button', { name: /check in my station/i });
    expect(screen.getByText('Not checked in')).toBeInTheDocument();

    await userEvent.click(checkinButton);
    expect(recordCheckinMock).toHaveBeenCalledWith({ sessionId: 'session-1', stationId: 'station-mine' });
  });

  it('shows per-station check-in buttons to viewers who can run the session', () => {
    netResult = {
      data: makeDetail({ viewerCanRunSession: true, sessions: [makeSession()] }),
      isLoading: false,
      error: null,
    };
    renderPage();
    expect(screen.getAllByRole('button', { name: /^check in$/i })).toHaveLength(2);
  });

  it('shows session history with check-in counts', () => {
    netResult = {
      data: makeDetail({
        sessions: [
          makeSession({
            id: 'session-2',
            status: 'closed',
            endedAt: '2026-08-03T00:30:00.000Z',
            checkins: [
              {
                id: 'checkin-1',
                stationId: 'station-other',
                stationName: 'Neighbor Base',
                operatorName: 'Neighbor',
                checkedInAt: '2026-08-03T00:05:00.000Z',
                note: null,
              },
            ],
          }),
        ],
      }),
      isLoading: false,
      error: null,
    };
    renderPage();
    expect(screen.getByText(/session history/i)).toBeInTheDocument();
    expect(screen.getByText(/1 check-in/i)).toBeInTheDocument();
  });
});
