import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepeaterImportSearchResponse, RepeaterResponse } from '@readycircle/contracts';
import { CircleRepeatersCard } from './CircleRepeatersCard.js';

const CIRCLE_ID = 'circle-1';

let repeatersResult: { data?: { items: RepeaterResponse[] }; isLoading: boolean };
let importSearchResult: {
  data?: RepeaterImportSearchResponse;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const importMock = vi.fn();

vi.mock('./api.js', () => ({
  useCircleRepeaters: () => repeatersResult,
  useCircleRepeaterChecks: () => ({ data: { items: [] }, isLoading: false }),
  useCreateRepeater: () => ({ mutateAsync: createMock, isPending: false, isError: false }),
  useUpdateRepeater: () => ({ mutateAsync: updateMock, isPending: false, isError: false }),
  useDeleteRepeater: () => ({ mutateAsync: deleteMock, isPending: false, isError: false }),
  useDeleteRepeaterCheck: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useRepeaterImportSearch: () => importSearchResult,
  useImportRepeaters: () => ({ mutateAsync: importMock, isPending: false, isError: false }),
}));

vi.mock('./RepeaterLocationFields.js', () => ({
  RepeaterLocationFields: () => <div data-testid="repeater-location-fields" />,
}));

vi.mock('./LogRepeaterCheckForm.js', () => ({
  LogRepeaterCheckForm: () => <div data-testid="log-repeater-check-form" />,
}));

function makeRepeater(overrides: Partial<RepeaterResponse> = {}): RepeaterResponse {
  return {
    id: 'repeater-1',
    circleId: CIRCLE_ID,
    service: 'gmrs',
    name: 'Water Tower 725',
    callsign: 'WRZZ999',
    outputFrequencyMhz: 462.725,
    offsetOrInput: '+5 MHz',
    tone: '141.3',
    latitude: null,
    longitude: null,
    areaLabel: 'North side',
    source: 'manual',
    status: 'active',
    notes: null,
    viewerCanManage: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderCard(isCoordinator = true) {
  return render(<CircleRepeatersCard circleId={CIRCLE_ID} isCoordinator={isCoordinator} />);
}

describe('CircleRepeatersCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repeatersResult = { data: { items: [] }, isLoading: false };
    importSearchResult = { data: undefined, isLoading: false, isError: false, error: null };
  });

  it('shows an empty state when the directory has no repeaters', () => {
    renderCard();
    expect(screen.getByText(/no repeaters listed yet/i)).toBeInTheDocument();
  });

  it('lists repeaters with service, frequency, and tone details', () => {
    repeatersResult = { data: { items: [makeRepeater()] }, isLoading: false };
    renderCard();
    expect(screen.getByText('Water Tower 725')).toBeInTheDocument();
    expect(screen.getByText(/462\.7250 MHz/)).toBeInTheDocument();
    expect(screen.getByText(/tone 141\.3/)).toBeInTheDocument();
    expect(screen.getByText('No location')).toBeInTheDocument();
  });

  it('lets a manager edit status and remove an entry', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(makeRepeater({ status: 'offline' }));
    repeatersResult = { data: { items: [makeRepeater()] }, isLoading: false };
    renderCard(true);

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.selectOptions(screen.getByLabelText(/^status$/i), 'offline');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(updateMock).toHaveBeenCalledWith({
      repeaterId: 'repeater-1',
      input: expect.objectContaining({ status: 'offline' }),
    });

    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(deleteMock).toHaveBeenCalledWith('repeater-1');
  });

  it('hides curation controls when the viewer cannot manage the entry', () => {
    repeatersResult = { data: { items: [makeRepeater({ viewerCanManage: false })] }, isLoading: false };
    renderCard(false);
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log check/i })).toBeInTheDocument();
  });

  it('submits a manual add with parsed frequency', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue(makeRepeater());
    renderCard();

    await user.click(screen.getByRole('button', { name: /add manually/i }));
    await user.type(screen.getByPlaceholderText(/marion county/i), 'Hilltop 675');
    await user.type(screen.getByLabelText(/output frequency/i), '462.675');
    await user.type(screen.getByPlaceholderText('e.g. 141.3'), '103.5');
    await user.click(screen.getByRole('button', { name: /add repeater/i }));

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'gmrs',
        name: 'Hilltop 675',
        outputFrequencyMhz: 462.675,
        tone: '103.5',
      }),
    );
  });

  it('explains when RepeaterBook import is not configured', async () => {
    const user = userEvent.setup();
    importSearchResult = {
      data: { configured: false, state: null, candidates: [] },
      isLoading: false,
      isError: false,
      error: null,
    };
    renderCard();

    await user.click(screen.getByRole('button', { name: /find repeaters near this circle/i }));
    expect(screen.getByText(/isn't configured on this server/i)).toBeInTheDocument();
  });

  it('imports selected candidates and disables already-imported ones', async () => {
    const user = userEvent.setup();
    importMock.mockResolvedValue({ items: [] });
    importSearchResult = {
      data: {
        configured: true,
        state: 'Illinois',
        candidates: [
          {
            externalId: 'IL:100',
            service: 'gmrs',
            name: 'Springfield 725',
            callsign: 'WRAA100',
            outputFrequencyMhz: 462.725,
            offsetOrInput: null,
            tone: '141.3',
            latitude: null,
            longitude: null,
            areaLabel: 'Springfield, IL',
            distanceKm: 12,
            alreadyImported: false,
          },
          {
            externalId: 'IL:200',
            service: 'gmrs',
            name: 'Sherman 600',
            callsign: 'WRBB200',
            outputFrequencyMhz: 462.6,
            offsetOrInput: null,
            tone: null,
            latitude: null,
            longitude: null,
            areaLabel: 'Sherman, IL',
            distanceKm: 20,
            alreadyImported: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    };
    renderCard();

    await user.click(screen.getByRole('button', { name: /find repeaters near this circle/i }));
    expect(screen.getByText('In directory')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[1]).toBeDisabled(); // already imported

    await user.click(checkboxes[0]!);
    await user.click(screen.getByRole('button', { name: /import selected/i }));
    expect(importMock).toHaveBeenCalledWith({
      externalIds: ['IL:100'],
      service: 'gmrs',
      state: 'Illinois',
    });
  });
});
