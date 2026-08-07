import { describe, expect, it } from 'vitest';
import {
  analyzeRfReachability,
  haversineKm,
  radioHorizonKm,
  type RfRepeater,
  type RfStation,
} from './rf-reachability.js';

/** ~0.009 degrees of latitude per km at any longitude. */
function stationAt(km: number, overrides: Partial<RfStation> & { id: string; name: string }): RfStation {
  return {
    stationType: 'handheld',
    hypothetical: false,
    capabilities: ['gmrs'],
    receiveOnly: false,
    transmitPowerWatts: null,
    antennaType: null,
    antennaHeightFeet: null,
    latitude: 40 + km / 111.195,
    longitude: -105,
    ...overrides,
  };
}

function repeater(overrides: Partial<RfRepeater> & { id: string; name: string }): RfRepeater {
  return {
    service: 'gmrs',
    status: 'active',
    latitude: 40,
    longitude: -105,
    ...overrides,
  };
}

function linkBetween(result: ReturnType<typeof analyzeRfReachability>, aId: string, bId: string) {
  const link = result.links.find(
    (l) =>
      (l.fromStationId === aId && l.toStationId === bId) ||
      (l.fromStationId === bId && l.toStationId === aId),
  );
  expect(link).toBeDefined();
  return link!;
}

describe('haversineKm', () => {
  it('computes a known distance', () => {
    // One degree of latitude is ~111.2 km.
    expect(haversineKm(40, -105, 41, -105)).toBeCloseTo(111.195, 0);
  });

  it('is zero for identical points', () => {
    expect(haversineKm(40, -105, 40, -105)).toBe(0);
  });
});

describe('radioHorizonKm', () => {
  it('matches the 4/3-earth approximation', () => {
    // Two 1.5 m antennas: 4.12 * 2 * sqrt(1.5) ~ 10.09 km.
    expect(radioHorizonKm(1.5, 1.5)).toBeCloseTo(10.09, 1);
  });

  it('grows with antenna height', () => {
    expect(radioHorizonKm(30, 1.5)).toBeGreaterThan(radioHorizonKm(1.5, 1.5));
  });
});

describe('simplex verdicts', () => {
  it('rates two nearby handhelds as likely', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(3, { id: 'b', name: 'B' })],
      repeaters: [],
      links: [],
    });
    const link = linkBetween(result, 'a', 'b');
    expect(link.pathType).toBe('simplex');
    expect(link.verdict).toBe('likely');
    expect(link.distanceKm).toBe(3);
  });

  it('rates handhelds in the marginal window as marginal', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(6.5, { id: 'b', name: 'B' })],
      repeaters: [],
      links: [],
    });
    expect(linkBetween(result, 'a', 'b').verdict).toBe('marginal');
  });

  it('rates distant handhelds as unlikely', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(12, { id: 'b', name: 'B' })],
      repeaters: [],
      links: [],
    });
    expect(linkBetween(result, 'a', 'b').verdict).toBe('unlikely');
  });

  it('treats FRS and GMRS as interoperable but not amateur-to-GMRS', () => {
    const frsToGmrs = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A', capabilities: ['frs'] }),
        stationAt(1, { id: 'b', name: 'B', capabilities: ['gmrs'] }),
      ],
      repeaters: [],
      links: [],
    });
    expect(linkBetween(frsToGmrs, 'a', 'b').verdict).toBe('likely');

    const hamToGmrs = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A', capabilities: ['amateur'] }),
        stationAt(1, { id: 'b', name: 'B', capabilities: ['gmrs'] }),
      ],
      repeaters: [],
      links: [],
    });
    expect(linkBetween(hamToGmrs, 'a', 'b').verdict).toBe('unlikely');
  });

  it('applies the mountainous terrain penalty', () => {
    const rolling = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(4, { id: 'b', name: 'B' })],
      repeaters: [],
      links: [],
      terrain: 'rolling',
    });
    expect(linkBetween(rolling, 'a', 'b').verdict).toBe('likely');

    const mountainous = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(4, { id: 'b', name: 'B' })],
      repeaters: [],
      links: [],
      terrain: 'mountainous',
    });
    expect(linkBetween(mountainous, 'a', 'b').verdict).toBe('marginal');
  });

  it('marks pairs without coordinates as unknown', () => {
    const result = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A' }),
        stationAt(0, { id: 'b', name: 'B', latitude: null, longitude: null }),
      ],
      repeaters: [],
      links: [],
    });
    const link = linkBetween(result, 'a', 'b');
    expect(link.verdict).toBe('unknown');
    expect(link.distanceKm).toBeNull();
    expect(result.gaps.some((g) => g.includes('location needed'))).toBe(true);
  });
});

describe('repeater paths', () => {
  it('rates two rx_tx-linked stations as likely regardless of distance', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(40, { id: 'b', name: 'B' })],
      repeaters: [repeater({ id: 'r1', name: 'Green Mountain' })],
      links: [
        { stationId: 'a', repeaterId: 'r1', access: 'rx_tx' },
        { stationId: 'b', repeaterId: 'r1', access: 'rx_tx' },
      ],
    });
    const link = linkBetween(result, 'a', 'b');
    expect(link.pathType).toBe('repeater');
    expect(link.verdict).toBe('likely');
    expect(link.viaRepeaterName).toBe('Green Mountain');
  });

  it('flags rx-only access as a one-way marginal path', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(40, { id: 'b', name: 'B' })],
      repeaters: [repeater({ id: 'r1', name: 'Green Mountain' })],
      links: [
        { stationId: 'a', repeaterId: 'r1', access: 'rx_tx' },
        { stationId: 'b', repeaterId: 'r1', access: 'rx' },
      ],
    });
    const link = linkBetween(result, 'a', 'b');
    expect(link.verdict).toBe('marginal');
    expect(result.gaps.some((g) => g.includes('one-way'))).toBe(true);
  });

  it('ignores offline repeaters', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(40, { id: 'b', name: 'B' })],
      repeaters: [repeater({ id: 'r1', name: 'Green Mountain', status: 'offline' })],
      links: [
        { stationId: 'a', repeaterId: 'r1', access: 'rx_tx' },
        { stationId: 'b', repeaterId: 'r1', access: 'rx_tx' },
      ],
    });
    expect(linkBetween(result, 'a', 'b').pathType).toBe('simplex');
    expect(result.repeatersConsidered).toHaveLength(0);
  });

  it('gates repeater use on the matching service capability', () => {
    const result = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A', capabilities: ['amateur'] }),
        stationAt(40, { id: 'b', name: 'B', capabilities: ['amateur'] }),
      ],
      repeaters: [repeater({ id: 'r1', name: 'GMRS Hilltop', service: 'gmrs' })],
      links: [
        { stationId: 'a', repeaterId: 'r1', access: 'rx_tx' },
        { stationId: 'b', repeaterId: 'r1', access: 'rx_tx' },
      ],
    });
    // Neither has GMRS gear, so the GMRS repeater cannot connect them.
    expect(linkBetween(result, 'a', 'b').pathType).toBe('simplex');
  });
});

describe('satellite and mesh paths', () => {
  it('rates satellite-equipped pairs likely at any distance', () => {
    const result = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A', capabilities: ['satellite_internet'] }),
        stationAt(300, { id: 'b', name: 'B', capabilities: ['satellite_phone'] }),
      ],
      repeaters: [],
      links: [],
    });
    const link = linkBetween(result, 'a', 'b');
    expect(link.pathType).toBe('satellite');
    expect(link.verdict).toBe('likely');
  });

  it('rates nearby meshtastic pairs likely, but not across mesh networks', () => {
    const sameMesh = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A', capabilities: ['meshtastic'] }),
        stationAt(3, { id: 'b', name: 'B', capabilities: ['meshtastic'] }),
      ],
      repeaters: [],
      links: [],
    });
    expect(linkBetween(sameMesh, 'a', 'b').pathType).toBe('mesh');
    expect(linkBetween(sameMesh, 'a', 'b').verdict).toBe('likely');

    const crossMesh = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A', capabilities: ['meshtastic'] }),
        stationAt(3, { id: 'b', name: 'B', capabilities: ['meshcore'] }),
      ],
      repeaters: [],
      links: [],
    });
    expect(linkBetween(crossMesh, 'a', 'b').verdict).toBe('unlikely');
  });
});

describe('hypothetical stations', () => {
  it('assumes baseline gear and estimates repeater coverage by distance', () => {
    const result = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A' }),
        stationAt(20, { id: 'b', name: 'Planned', hypothetical: true, capabilities: [] }),
      ],
      // Repeater near the planned station.
      repeaters: [repeater({ id: 'r1', name: 'Hilltop', latitude: 40 + 18 / 111.195 })],
      links: [{ stationId: 'a', repeaterId: 'r1', access: 'rx_tx' }],
    });
    const link = linkBetween(result, 'a', 'b');
    // Planned station has no declared link, so the path is estimated -> marginal.
    expect(link.pathType).toBe('repeater');
    expect(link.verdict).toBe('marginal');
    const summary = result.stations.find((s) => s.stationId === 'b');
    expect(summary?.hypothetical).toBe(true);
    expect(summary?.notes.some((n) => n.includes('Planned station'))).toBe(true);
  });
});

describe('confirmed contacts', () => {
  it('bumps an unlikely simplex estimate to likely and flags it confirmed', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(12, { id: 'b', name: 'B' })],
      repeaters: [],
      links: [],
      confirmedContacts: [{ stationAId: 'a', stationBId: 'b', mode: 'simplex', occurredAt: '2026-07-01T12:00:00.000Z' }],
    });
    const link = linkBetween(result, 'a', 'b');
    expect(link.verdict).toBe('likely');
    expect(link.confirmed).toBe(true);
    expect(link.pathType).toBe('simplex');
    expect(link.detail).toBe('Confirmed by a logged contact on 2026-07-01');
  });

  it('is order-independent -- the pair matches regardless of which side is A/B', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(12, { id: 'b', name: 'B' })],
      repeaters: [],
      links: [],
      confirmedContacts: [{ stationAId: 'b', stationBId: 'a', mode: 'simplex', occurredAt: '2026-07-01T12:00:00.000Z' }],
    });
    expect(linkBetween(result, 'a', 'b').confirmed).toBe(true);
  });

  it('uses the contact mode as the path type even when it differs from the best estimated path', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(40, { id: 'b', name: 'B' })],
      repeaters: [repeater({ id: 'r1', name: 'Green Mountain' })],
      links: [
        { stationId: 'a', repeaterId: 'r1', access: 'rx_tx' },
        { stationId: 'b', repeaterId: 'r1', access: 'rx_tx' },
      ],
      confirmedContacts: [{ stationAId: 'a', stationBId: 'b', mode: 'satellite', occurredAt: '2026-07-01T12:00:00.000Z' }],
    });
    const link = linkBetween(result, 'a', 'b');
    expect(link.pathType).toBe('satellite');
    expect(link.verdict).toBe('likely');
    expect(link.confirmed).toBe(true);
  });

  it('keeps the repeater name when the confirmed mode matches the best repeater path', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(40, { id: 'b', name: 'B' })],
      repeaters: [repeater({ id: 'r1', name: 'Green Mountain' })],
      links: [
        { stationId: 'a', repeaterId: 'r1', access: 'rx_tx' },
        { stationId: 'b', repeaterId: 'r1', access: 'rx_tx' },
      ],
      confirmedContacts: [{ stationAId: 'a', stationBId: 'b', mode: 'repeater', occurredAt: '2026-07-01T12:00:00.000Z' }],
    });
    const link = linkBetween(result, 'a', 'b');
    expect(link.viaRepeaterName).toBe('Green Mountain');
  });

  it('prefers the named directory repeater on a confirmed repeater contact', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(40, { id: 'b', name: 'B' })],
      repeaters: [
        repeater({ id: 'r1', name: 'Green Mountain' }),
        repeater({ id: 'r2', name: 'Water Tower' }),
      ],
      links: [
        { stationId: 'a', repeaterId: 'r1', access: 'rx_tx' },
        { stationId: 'b', repeaterId: 'r1', access: 'rx_tx' },
        { stationId: 'a', repeaterId: 'r2', access: 'rx_tx' },
        { stationId: 'b', repeaterId: 'r2', access: 'rx_tx' },
      ],
      confirmedContacts: [
        {
          stationAId: 'a',
          stationBId: 'b',
          mode: 'repeater',
          occurredAt: '2026-07-01T12:00:00.000Z',
          repeaterId: 'r2',
          repeaterName: 'Water Tower',
        },
      ],
    });
    const link = linkBetween(result, 'a', 'b');
    expect(link.viaRepeaterName).toBe('Water Tower');
    expect(link.confirmed).toBe(true);
  });

  it('uses the most recent contact when several exist for the same pair', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(12, { id: 'b', name: 'B' })],
      repeaters: [],
      links: [],
      confirmedContacts: [
        { stationAId: 'a', stationBId: 'b', mode: 'mesh', occurredAt: '2025-01-01T00:00:00.000Z' },
        { stationAId: 'a', stationBId: 'b', mode: 'simplex', occurredAt: '2026-07-01T12:00:00.000Z' },
      ],
    });
    const link = linkBetween(result, 'a', 'b');
    expect(link.pathType).toBe('simplex');
    expect(link.detail).toBe('Confirmed by a logged contact on 2026-07-01');
  });

  it('leaves unconfirmed pairs marked confirmed: false', () => {
    const result = analyzeRfReachability({
      stations: [stationAt(0, { id: 'a', name: 'A' }), stationAt(3, { id: 'b', name: 'B' })],
      repeaters: [],
      links: [],
    });
    expect(linkBetween(result, 'a', 'b').confirmed).toBe(false);
  });
});

describe('graph analysis and baseline relay', () => {
  it('passes when a middle station bridges two edges, and flags it as a SPOF', () => {
    const result = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A' }),
        stationAt(4, { id: 'b', name: 'B' }),
        stationAt(8, { id: 'c', name: 'C' }),
      ],
      repeaters: [],
      links: [],
    });
    // A-B and B-C are likely (4 km); A-C (8 km) is not.
    expect(result.baselineRelay.pass).toBe(true);
    expect(result.baselineRelay.hubStationNames).toContain('B');
    expect(result.stations.find((s) => s.stationId === 'a')?.role).toBe('edge');
    expect(result.stations.find((s) => s.stationId === 'b')?.role).toBe('connected');
    expect(result.gaps.some((g) => g.includes('single point of failure') && g.includes('B'))).toBe(true);
  });

  it('fails when the circle splits into disconnected groups', () => {
    const result = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A' }),
        stationAt(3, { id: 'b', name: 'B' }),
        stationAt(50, { id: 'c', name: 'C' }),
        stationAt(53, { id: 'd', name: 'D' }),
      ],
      repeaters: [],
      links: [],
    });
    expect(result.baselineRelay.pass).toBe(false);
    expect(result.gaps.some((g) => g.includes('2 groups'))).toBe(true);
  });

  it('exempts stations without locations from the relay test but flags them', () => {
    const result = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A' }),
        stationAt(3, { id: 'b', name: 'B' }),
        stationAt(0, { id: 'c', name: 'C', latitude: null, longitude: null }),
      ],
      repeaters: [],
      links: [],
    });
    expect(result.baselineRelay.pass).toBe(true);
    expect(result.stations.find((s) => s.stationId === 'c')?.role).toBe('unknown');
    expect(result.gaps.some((g) => g.includes('C: location needed'))).toBe(true);
  });

  it('never selects receive-only or hypothetical stations as relay hubs', () => {
    const result = analyzeRfReachability({
      stations: [
        stationAt(0, { id: 'a', name: 'A', receiveOnly: true }),
        stationAt(3, { id: 'b', name: 'B', hypothetical: true }),
      ],
      repeaters: [],
      links: [],
    });
    expect(result.baselineRelay.hubStationNames).toHaveLength(0);
  });
});
