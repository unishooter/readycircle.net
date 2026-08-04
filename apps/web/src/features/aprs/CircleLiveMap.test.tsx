import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AprsPositionResponse } from '@readycircle/contracts';
import { CircleLiveMap } from './CircleLiveMap.js';

let positionsResult: { data?: { items: AprsPositionResponse[] }; isLoading: boolean };

vi.mock('./api.js', () => ({
  useCircleAprsPositions: () => positionsResult,
}));

function makePosition(overrides: Partial<AprsPositionResponse> = {}): AprsPositionResponse {
  return {
    stationId: 'station-1',
    stationName: "Ana's Home Station",
    callsign: 'KI5ABC-9',
    latitude: 39.78,
    longitude: -89.65,
    symbolTable: '/',
    symbolCode: '>',
    comment: 'Mobile',
    heardAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('CircleLiveMap', () => {
  it('shows a loading state while positions are being fetched', () => {
    positionsResult = { data: undefined, isLoading: true };
    render(<CircleLiveMap circleId="circle-1" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an empty state when no member station has a live position yet', () => {
    positionsResult = { data: { items: [] }, isLoading: false };
    render(<CircleLiveMap circleId="circle-1" />);
    expect(screen.getByText(/add a callsign to your station to enable live tracking/i)).toBeInTheDocument();
  });

  it('renders one marker per station position', () => {
    positionsResult = {
      data: { items: [makePosition(), makePosition({ stationId: 'station-2', callsign: 'N0CALL' })] },
      isLoading: false,
    };
    render(<CircleLiveMap circleId="circle-1" />);
    expect(screen.getAllByRole('button', { name: /marker/i })).toHaveLength(2);
  });

  it("shows a marker's station, callsign, comment, and 'heard' popup content when opened", async () => {
    const user = userEvent.setup();
    positionsResult = { data: { items: [makePosition()] }, isLoading: false };
    render(<CircleLiveMap circleId="circle-1" />);

    await user.click(screen.getByRole('button', { name: /marker/i }));

    expect(screen.getByText("Ana's Home Station")).toBeInTheDocument();
    expect(screen.getByText('KI5ABC-9')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByText(/heard just now/i)).toBeInTheDocument();
  });

  it('shows the "heard X ago" text for an older position, once its popup is opened', async () => {
    const user = userEvent.setup();
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    positionsResult = { data: { items: [makePosition({ heardAt: threeHoursAgo })] }, isLoading: false };
    render(<CircleLiveMap circleId="circle-1" />);

    await user.click(screen.getByRole('button', { name: /marker/i }));

    expect(screen.getByText(/heard 3h ago/i)).toBeInTheDocument();
  });

  it('renders a stale (muted) marker for a position older than the staleness threshold', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    positionsResult = { data: { items: [makePosition({ heardAt: threeHoursAgo })] }, isLoading: false };
    render(<CircleLiveMap circleId="circle-1" />);

    const marker = screen.getByRole('button', { name: /marker/i });
    expect(marker.style.opacity).toBe('0.45');
  });
});
