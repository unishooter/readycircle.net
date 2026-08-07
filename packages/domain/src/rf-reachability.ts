/**
 * RF reachability engine: pure deterministic logic estimating which
 * stations in a Circle can talk to which, over which paths, under
 * conservative assumptions. No external calls and no persistence -- the
 * plan engine feeds it station attributes, the repeater directory, and
 * declared station-repeater links, and stores only the derived output.
 *
 * Privacy: coordinates come in, but only rounded pairwise distances and
 * verdicts go out. Callers must never persist or display the inputs.
 *
 * Physics model (intentionally conservative, documented in ADR 0012):
 * - Radio horizon from antenna heights: d(km) = 4.12 * (sqrt(h1) + sqrt(h2)),
 *   the standard 4/3-earth VHF/UHF horizon approximation.
 * - Clamped by a practical-range table keyed on TX power bucket and antenna
 *   class, because horizon alone wildly overestimates handheld range.
 * - Terrain is a class multiplier only (flat / rolling / mountainous); a
 *   future elevation-API path profile can drop in behind the same interface.
 */

import type {
  AntennaType,
  ConnectivityLink,
  ConnectivityPathType,
  ConnectivityStationSummary,
  ConnectivityVerdict,
  RadioCapability,
  RepeaterAccess,
  RepeaterService,
  RepeaterStatus,
  StationType,
} from '@readycircle/contracts';

export type TerrainClass = 'flat' | 'rolling' | 'mountainous';

export interface RfStation {
  id: string;
  name: string;
  stationType: StationType;
  hypothetical: boolean;
  capabilities: RadioCapability[];
  receiveOnly: boolean;
  transmitPowerWatts: number | null;
  antennaType: AntennaType | null;
  antennaHeightFeet: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface RfRepeater {
  id: string;
  name: string;
  service: RepeaterService;
  status: RepeaterStatus;
  latitude: number | null;
  longitude: number | null;
}

export interface RfStationRepeaterLink {
  stationId: string;
  repeaterId: string;
  access: RepeaterAccess;
}

/**
 * A self-declared logged QSO between two stations (see packages/database
 * `contacts` table). Observed truth like `RfStationRepeaterLink` -- when
 * present for a pair, it outranks the distance/coverage estimate entirely
 * rather than just nudging it.
 */
export interface RfConfirmedContact {
  stationAId: string;
  stationBId: string;
  mode: ConnectivityPathType;
  /** ISO instant; when multiple contacts exist for a pair, the most recent wins. */
  occurredAt: string;
  /** Directory repeater named on a mode=repeater contact, when known. */
  repeaterId?: string | null;
  repeaterName?: string | null;
}

export interface RfAnalysisInput {
  stations: RfStation[];
  repeaters: RfRepeater[];
  links: RfStationRepeaterLink[];
  confirmedContacts?: RfConfirmedContact[];
  /** Defaults to 'rolling' when unknown. */
  terrain?: TerrainClass;
}

export interface RfBaselineRelayResult {
  pass: boolean;
  summary: string;
  hubStationNames: string[];
}

export interface RfAnalysisResult {
  stations: ConnectivityStationSummary[];
  links: ConnectivityLink[];
  baselineRelay: RfBaselineRelayResult;
  gaps: string[];
  repeatersConsidered: string[];
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ---------------------------------------------------------------------------
// Physics heuristics
// ---------------------------------------------------------------------------

const FEET_TO_METERS = 0.3048;

/** Conservative antenna-height defaults (meters) by station type. */
const DEFAULT_HEIGHT_METERS: Record<StationType, number> = {
  home: 6,
  handheld: 1.5,
  vehicle: 2,
  portable: 1.5,
  organization: 6,
  meshtastic: 3,
  meshcore: 3,
  receive_only: 1.5,
  other: 1.5,
};

/** Antenna-class default when unset, keyed by station type. */
const DEFAULT_ANTENNA: Record<StationType, AntennaType> = {
  home: 'rubber_duck',
  handheld: 'rubber_duck',
  vehicle: 'mobile_whip',
  portable: 'rubber_duck',
  organization: 'base_vertical',
  meshtastic: 'other',
  meshcore: 'other',
  receive_only: 'rubber_duck',
  other: 'rubber_duck',
};

/** Baseline UV-5R-class assumption when TX power is not stated. */
const DEFAULT_TX_WATTS = 5;

type PowerBucket = 'low' | 'medium' | 'high';

function powerBucket(watts: number): PowerBucket {
  if (watts <= 8) return 'low';
  if (watts <= 25) return 'medium';
  return 'high';
}

/**
 * Practical planning ranges in km: [likely, marginal]. Horizon math alone
 * overestimates real-world handheld performance, so effective range is
 * min(horizon, practical).
 */
const PRACTICAL_RANGE_KM: Record<AntennaType, Record<PowerBucket, [number, number]>> = {
  rubber_duck: { low: [5, 8], medium: [6, 10], high: [8, 12] },
  mobile_whip: { low: [8, 13], medium: [15, 24], high: [20, 32] },
  base_vertical: { low: [12, 19], medium: [24, 40], high: [32, 56] },
  directional: { low: [16, 26], medium: [32, 48], high: [48, 72] },
  wire: { low: [10, 15], medium: [19, 32], high: [26, 45] },
  other: { low: [5, 8], medium: [6, 10], high: [8, 12] },
};

const TERRAIN_MULTIPLIER: Record<TerrainClass, number> = {
  flat: 1.15,
  rolling: 1,
  mountainous: 0.6,
};

export function antennaHeightMeters(station: RfStation): number {
  if (station.antennaHeightFeet !== null && station.antennaHeightFeet > 0) {
    return station.antennaHeightFeet * FEET_TO_METERS;
  }
  return DEFAULT_HEIGHT_METERS[station.stationType];
}

/** Standard 4/3-earth VHF/UHF radio horizon between two antenna heights (meters). */
export function radioHorizonKm(height1Meters: number, height2Meters: number): number {
  return 4.12 * (Math.sqrt(Math.max(height1Meters, 0)) + Math.sqrt(Math.max(height2Meters, 0)));
}

interface StationRange {
  likelyKm: number;
  marginalKm: number;
}

function stationRange(station: RfStation, terrain: TerrainClass): StationRange {
  const antenna = station.antennaType ?? DEFAULT_ANTENNA[station.stationType];
  const watts = station.transmitPowerWatts ?? DEFAULT_TX_WATTS;
  const [likely, marginal] = PRACTICAL_RANGE_KM[antenna][powerBucket(watts)];
  const multiplier = TERRAIN_MULTIPLIER[terrain];
  return { likelyKm: likely * multiplier, marginalKm: marginal * multiplier };
}

// ---------------------------------------------------------------------------
// Path capability checks
// ---------------------------------------------------------------------------

const VOICE_RF: RadioCapability[] = ['frs', 'gmrs', 'amateur'];

/** FRS and GMRS share channels; amateur only talks to amateur. */
function sharedVoiceBand(a: RadioCapability[], b: RadioCapability[]): boolean {
  const aFrsGmrs = a.includes('frs') || a.includes('gmrs');
  const bFrsGmrs = b.includes('frs') || b.includes('gmrs');
  if (aFrsGmrs && bFrsGmrs) return true;
  return a.includes('amateur') && b.includes('amateur');
}

function hasSatellite(capabilities: RadioCapability[]): boolean {
  return capabilities.includes('satellite_internet') || capabilities.includes('satellite_phone');
}

function sharedMesh(a: RadioCapability[], b: RadioCapability[]): boolean {
  return (
    (a.includes('meshtastic') && b.includes('meshtastic')) ||
    (a.includes('meshcore') && b.includes('meshcore'))
  );
}

/**
 * Hypothetical (planned) stations have no gear yet: for estimation we
 * assume the baseline dual-band HT the gear plan will recommend at minimum,
 * so their links read as "what the baseline would achieve".
 */
function effectiveCapabilities(station: RfStation): RadioCapability[] {
  if (station.capabilities.length > 0) return station.capabilities;
  return station.hypothetical ? ['gmrs', 'amateur'] : [];
}

function canTransmitVoice(station: RfStation): boolean {
  if (station.receiveOnly) return false;
  return effectiveCapabilities(station).some((cap) => VOICE_RF.includes(cap));
}

// ---------------------------------------------------------------------------
// Pairwise link evaluation
// ---------------------------------------------------------------------------

const VERDICT_RANK: Record<ConnectivityVerdict, number> = {
  likely: 3,
  marginal: 2,
  unlikely: 1,
  unknown: 0,
};

interface CandidatePath {
  pathType: ConnectivityPathType;
  verdict: ConnectivityVerdict;
  viaRepeaterName: string | null;
  detail: string | null;
}

/** Assumed repeater antenna height when estimating undeclared coverage. */
const REPEATER_HEIGHT_METERS = 30;

function roundKm(value: number): number {
  return Math.round(value);
}

export function analyzeRfReachability(input: RfAnalysisInput): RfAnalysisResult {
  const terrain = input.terrain ?? 'rolling';
  const stations = input.stations;
  const activeRepeaters = input.repeaters.filter((r) => r.status !== 'offline');

  const linksByStation = new Map<string, Map<string, RepeaterAccess>>();
  for (const link of input.links) {
    let byRepeater = linksByStation.get(link.stationId);
    if (!byRepeater) {
      byRepeater = new Map();
      linksByStation.set(link.stationId, byRepeater);
    }
    byRepeater.set(link.repeaterId, link.access);
  }

  /** Unordered pair key so lookups don't care which side is "from"/"to". */
  function pairKey(idA: string, idB: string): string {
    return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
  }

  const confirmedByPair = new Map<string, RfConfirmedContact>();
  for (const contact of input.confirmedContacts ?? []) {
    const key = pairKey(contact.stationAId, contact.stationBId);
    const existing = confirmedByPair.get(key);
    if (!existing || contact.occurredAt > existing.occurredAt) {
      confirmedByPair.set(key, contact);
    }
  }

  /**
   * A station's usable access to a repeater: declared links are observed
   * truth; otherwise (notably for hypothetical stations) fall back to a
   * distance estimate against an assumed 30 m repeater antenna.
   */
  function repeaterAccess(
    station: RfStation,
    repeater: RfRepeater,
  ): { access: RepeaterAccess; estimated: boolean } | null {
    const declared = linksByStation.get(station.id)?.get(repeater.id);
    if (declared) return { access: declared, estimated: false };
    if (
      station.latitude === null ||
      station.longitude === null ||
      repeater.latitude === null ||
      repeater.longitude === null
    ) {
      return null;
    }
    if (!canTransmitVoice(station) && !station.hypothetical) return null;
    const distance = haversineKm(station.latitude, station.longitude, repeater.latitude, repeater.longitude);
    const horizon = radioHorizonKm(antennaHeightMeters(station), REPEATER_HEIGHT_METERS);
    const range = stationRange(station, terrain);
    // Repeaters sit high, so allow up to the marginal practical range * 1.5.
    if (distance <= Math.min(horizon, range.marginalKm * 1.5)) {
      return { access: 'rx_tx', estimated: true };
    }
    return null;
  }

  function evaluatePair(a: RfStation, b: RfStation): CandidatePath[] {
    const candidates: CandidatePath[] = [];
    const capsA = effectiveCapabilities(a);
    const capsB = effectiveCapabilities(b);
    const hasCoords =
      a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null;
    const distance = hasCoords
      ? haversineKm(a.latitude as number, a.longitude as number, b.latitude as number, b.longitude as number)
      : null;

    // Direct simplex.
    if (sharedVoiceBand(capsA, capsB) && canTransmitVoice(a) && canTransmitVoice(b)) {
      if (distance === null) {
        candidates.push({
          pathType: 'simplex',
          verdict: 'unknown',
          viaRepeaterName: null,
          detail: 'Location needed for coverage analysis',
        });
      } else {
        const horizon = radioHorizonKm(antennaHeightMeters(a), antennaHeightMeters(b));
        const rangeA = stationRange(a, terrain);
        const rangeB = stationRange(b, terrain);
        const likelyLimit = Math.min(horizon, rangeA.likelyKm, rangeB.likelyKm);
        const marginalLimit = Math.min(horizon, rangeA.marginalKm, rangeB.marginalKm);
        const verdict: ConnectivityVerdict =
          distance <= likelyLimit ? 'likely' : distance <= marginalLimit ? 'marginal' : 'unlikely';
        candidates.push({ pathType: 'simplex', verdict, viaRepeaterName: null, detail: null });
      }
    }

    // Shared repeater paths.
    for (const repeater of activeRepeaters) {
      // Service gate: GMRS repeaters need GMRS gear, ham repeaters need amateur.
      const serviceCap: RadioCapability = repeater.service === 'gmrs' ? 'gmrs' : 'amateur';
      if (!capsA.includes(serviceCap) || !capsB.includes(serviceCap)) continue;
      const accessA = repeaterAccess(a, repeater);
      const accessB = repeaterAccess(b, repeater);
      if (!accessA || !accessB) continue;
      const bothTx = accessA.access === 'rx_tx' && accessB.access === 'rx_tx';
      const estimated = accessA.estimated || accessB.estimated;
      if (bothTx) {
        candidates.push({
          pathType: 'repeater',
          verdict: estimated ? 'marginal' : 'likely',
          viaRepeaterName: repeater.name,
          detail: estimated ? 'Estimated coverage -- confirm by declaring repeater access' : null,
        });
      } else {
        candidates.push({
          pathType: 'repeater',
          verdict: 'marginal',
          viaRepeaterName: repeater.name,
          detail: 'One-way only: at least one station can hear but not key this repeater',
        });
      }
    }

    // Satellite: distance-independent, needs both ends equipped.
    if (hasSatellite(capsA) && hasSatellite(capsB)) {
      candidates.push({
        pathType: 'satellite',
        verdict: 'likely',
        viaRepeaterName: null,
        detail: 'Requires backup power at both ends during an outage',
      });
    }

    // Mesh (same network only).
    if (sharedMesh(capsA, capsB)) {
      if (distance === null) {
        candidates.push({
          pathType: 'mesh',
          verdict: 'unknown',
          viaRepeaterName: null,
          detail: 'Location needed for coverage analysis',
        });
      } else {
        const verdict: ConnectivityVerdict = distance <= 5 ? 'likely' : distance <= 15 ? 'marginal' : 'unlikely';
        candidates.push({
          pathType: 'mesh',
          verdict,
          viaRepeaterName: null,
          detail: verdict === 'marginal' ? 'May need intermediate mesh nodes' : null,
        });
      }
    }

    return candidates;
  }

  // Preference order when verdicts tie: declared/observed paths and voice first.
  const PATH_PREFERENCE: ConnectivityPathType[] = ['repeater', 'simplex', 'satellite', 'mesh'];

  const resultLinks: ConnectivityLink[] = [];
  const likelyAdjacency = new Map<string, Set<string>>();
  for (const station of stations) likelyAdjacency.set(station.id, new Set());
  const oneWayGaps: string[] = [];

  for (let i = 0; i < stations.length; i += 1) {
    for (let j = i + 1; j < stations.length; j += 1) {
      const a = stations[i] as RfStation;
      const b = stations[j] as RfStation;
      const candidates = evaluatePair(a, b);
      const hasCoords =
        a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null;
      const distance = hasCoords
        ? haversineKm(
            a.latitude as number,
            a.longitude as number,
            b.latitude as number,
            b.longitude as number,
          )
        : null;

      let best: CandidatePath | null = null;
      for (const candidate of candidates) {
        if (!best) {
          best = candidate;
          continue;
        }
        const rankDiff = VERDICT_RANK[candidate.verdict] - VERDICT_RANK[best.verdict];
        if (
          rankDiff > 0 ||
          (rankDiff === 0 &&
            PATH_PREFERENCE.indexOf(candidate.pathType) < PATH_PREFERENCE.indexOf(best.pathType))
        ) {
          best = candidate;
        }
      }

      const confirmedContact = confirmedByPair.get(pairKey(a.id, b.id));
      if (confirmedContact) {
        const namedRepeater =
          confirmedContact.mode === 'repeater'
            ? (confirmedContact.repeaterName ??
              (best?.pathType === 'repeater' ? best.viaRepeaterName : null))
            : null;
        best = {
          pathType: confirmedContact.mode,
          verdict: 'likely',
          viaRepeaterName:
            namedRepeater ??
            (best?.pathType === confirmedContact.mode ? best.viaRepeaterName : null),
          detail: `Confirmed by a logged contact on ${confirmedContact.occurredAt.slice(0, 10)}`,
        };
      }

      const link: ConnectivityLink = best
        ? {
            fromStationId: a.id,
            fromStationName: a.name,
            toStationId: b.id,
            toStationName: b.name,
            pathType: best.pathType,
            verdict: best.verdict,
            distanceKm: distance === null ? null : roundKm(distance),
            viaRepeaterName: best.viaRepeaterName,
            detail: best.detail,
            confirmed: Boolean(confirmedContact),
          }
        : {
            fromStationId: a.id,
            fromStationName: a.name,
            toStationId: b.id,
            toStationName: b.name,
            pathType: 'simplex',
            verdict: hasCoords ? 'unlikely' : 'unknown',
            distanceKm: distance === null ? null : roundKm(distance),
            viaRepeaterName: null,
            detail: hasCoords ? 'No shared service, repeater, satellite, or mesh path' : 'Location needed for coverage analysis',
            confirmed: false,
          };
      resultLinks.push(link);

      if (link.verdict === 'likely') {
        likelyAdjacency.get(a.id)?.add(b.id);
        likelyAdjacency.get(b.id)?.add(a.id);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Graph analysis over likely two-way links.
  // ---------------------------------------------------------------------

  const componentByStation = new Map<string, number>();
  let componentCount = 0;
  for (const station of stations) {
    if (componentByStation.has(station.id)) continue;
    const queue = [station.id];
    componentByStation.set(station.id, componentCount);
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const neighbor of likelyAdjacency.get(current) ?? []) {
        if (!componentByStation.has(neighbor)) {
          componentByStation.set(neighbor, componentCount);
          queue.push(neighbor);
        }
      }
    }
    componentCount += 1;
  }

  function reachableFrom(startId: string): Set<string> {
    const seen = new Set<string>([startId]);
    const queue = [startId];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const neighbor of likelyAdjacency.get(current) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    seen.delete(startId);
    return seen;
  }

  const stationSummaries: ConnectivityStationSummary[] = stations.map((station) => {
    const degree = likelyAdjacency.get(station.id)?.size ?? 0;
    const reachable = reachableFrom(station.id);
    const hasLocation = station.latitude !== null && station.longitude !== null;
    const notes: string[] = [];
    if (station.hypothetical) notes.push('Planned station -- estimates assume a baseline dual-band handheld');
    if (!hasLocation) notes.push('Location needed for coverage analysis');
    if (station.receiveOnly) notes.push('Receive-only: can monitor but not respond');
    const role: ConnectivityStationSummary['role'] = !hasLocation && degree === 0
      ? 'unknown'
      : degree === 0
        ? 'isolated'
        : degree === 1
          ? 'edge'
          : 'connected';
    return {
      stationId: station.id,
      stationName: station.name,
      hypothetical: station.hypothetical,
      hasLocation,
      reachableStationCount: reachable.size,
      role,
      notes,
    };
  });

  // Baseline relay test: at least one non-hypothetical station must be able
  // to reach every other analyzable station (multi-hop allowed) so it can
  // relay between edges. Stations with no location and no links are exempt
  // (flagged separately) so one missing pin doesn't fail the whole Circle.
  const analyzable = stationSummaries.filter((s) => s.role !== 'unknown').map((s) => s.stationId);
  const hubStationNames: string[] = [];
  if (analyzable.length >= 2) {
    for (const station of stations) {
      if (station.hypothetical || station.receiveOnly) continue;
      const reachable = reachableFrom(station.id);
      const coversAll = analyzable.every((id) => id === station.id || reachable.has(id));
      if (coversAll) hubStationNames.push(station.name);
    }
  }
  const pass = analyzable.length >= 2 && hubStationNames.length > 0;
  const summary =
    analyzable.length < 2
      ? 'Not enough stations with locations or links to run the relay test.'
      : pass
        ? `${hubStationNames.length === 1 ? hubStationNames[0] + ' can' : hubStationNames.length + ' stations can each'} relay a message to every reachable station and back.`
        : 'No single station can relay to every other station -- the Circle is split into groups that cannot reach each other.';

  // ---------------------------------------------------------------------
  // Gaps
  // ---------------------------------------------------------------------

  const gaps: string[] = [];
  for (const s of stationSummaries) {
    if (!s.hasLocation) {
      gaps.push(`${s.stationName}: location needed for coverage analysis.`);
    }
  }
  for (const s of stationSummaries) {
    if (s.role === 'isolated' && s.hasLocation) {
      gaps.push(`${s.stationName} has no likely two-way path to any other station.`);
    }
  }
  const populatedComponents = new Set(
    stationSummaries.filter((s) => s.role !== 'unknown').map((s) => componentByStation.get(s.stationId)),
  );
  if (populatedComponents.size > 1) {
    gaps.push(
      `The Circle splits into ${populatedComponents.size} groups that cannot reach each other with current gear.`,
    );
  }

  // Single points of failure: removing one connected station must not
  // disconnect previously-connected pairs. Simple O(V*(V+E)) check.
  for (const station of stations) {
    const degree = likelyAdjacency.get(station.id)?.size ?? 0;
    if (degree < 2) continue;
    const previouslyConnected = stations
      .filter((s) => s.id !== station.id)
      .map((s) => s.id)
      .filter((id) => componentByStation.get(id) === componentByStation.get(station.id));
    if (previouslyConnected.length < 2) continue;
    const adjacencyWithout = new Map<string, Set<string>>();
    for (const id of previouslyConnected) {
      adjacencyWithout.set(
        id,
        new Set([...(likelyAdjacency.get(id) ?? [])].filter((n) => n !== station.id)),
      );
    }
    const start = previouslyConnected[0];
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const neighbor of adjacencyWithout.get(current) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (previouslyConnected.some((id) => !seen.has(id))) {
      gaps.push(`${station.name} is a single point of failure: losing it splits the network.`);
    }
  }

  for (const link of resultLinks) {
    if (link.pathType === 'repeater' && link.detail?.startsWith('One-way')) {
      oneWayGaps.push(
        `${link.fromStationName} <-> ${link.toStationName} via ${link.viaRepeaterName ?? 'repeater'} is one-way only.`,
      );
    }
  }
  gaps.push(...oneWayGaps);

  return {
    stations: stationSummaries,
    links: resultLinks,
    baselineRelay: { pass, summary, hubStationNames },
    gaps,
    repeatersConsidered: activeRepeaters.map(
      (r) => `${r.name} (${r.service === 'gmrs' ? 'GMRS' : 'Ham'})`,
    ),
  };
}
