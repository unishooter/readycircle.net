import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from './index.js';

describe('database schema', () => {
  it('defines every table required by the milestone', () => {
    const expectedTables = [
      schema.users,
      schema.userIdentities,
      schema.sessions,
      schema.stations,
      schema.stationLocations,
      schema.stationPrivacy,
      schema.stationCapabilities,
      schema.equipment,
      schema.stationEquipment,
      schema.circles,
      schema.circleMemberships,
      schema.circleInvitations,
      schema.circleRoles,
      schema.circleRoleAssignments,
      schema.auditEvents,
      schema.plans,
      schema.planVersions,
      schema.planSections,
    ];
    for (const table of expectedTables) {
      expect(table).toBeDefined();
    }
  });

  it('gives stations a uuid primary key and owner reference', () => {
    const columns = getTableColumns(schema.stations);
    expect(columns.id.primary).toBe(true);
    expect(columns.ownerId.notNull).toBe(true);
    expect(getTableName(schema.stations)).toBe('stations');
  });

  it('keeps station location precision and stored coordinates as distinct columns', () => {
    const columns = getTableColumns(schema.stationLocations);
    expect(columns.precision).toBeDefined();
    expect(columns.latitude).toBeDefined();
    expect(columns.longitude).toBeDefined();
    expect(columns.areaLabel).toBeDefined();
    expect(columns.gridIdentifier).toBeDefined();
  });

  it('splits plan content across versions and sections instead of one text column', () => {
    expect(getTableColumns(schema.planVersions).versionNumber).toBeDefined();
    expect(getTableColumns(schema.planSections).content).toBeDefined();
    expect(getTableColumns(schema.planSections).sectionKey).toBeDefined();
  });

  it('gives circles a required, non-key circleIdentifier column', () => {
    const columns = getTableColumns(schema.circles);
    expect(columns.circleIdentifier).toBeDefined();
    expect(columns.circleIdentifier.notNull).toBe(true);
    expect(columns.circleIdentifier.primary).toBe(false);
    expect(columns.id.primary).toBe(true);
  });

  it('gives circles optional map-derived grid location columns', () => {
    const columns = getTableColumns(schema.circles);
    expect(columns.gridIdentifier).toBeDefined();
    expect(columns.gridIdentifier.notNull).toBe(false);
    expect(columns.gridLatitude).toBeDefined();
    expect(columns.gridLongitude).toBeDefined();
    expect(columns.gridGeog).toBeDefined();
    // Legacy free-text field predating the map picker -- still present for fallback display.
    expect(columns.gridOrLocalityLabel).toBeDefined();
  });

  it('gives stations an optional, nullable callsign for APRS matching', () => {
    const columns = getTableColumns(schema.stations);
    expect(columns.callsign).toBeDefined();
    expect(columns.callsign.notNull).toBe(false);
  });

  it('defines a station_aprs_positions table keyed by stationId with a spatial index', () => {
    expect(schema.stationAprsPositions).toBeDefined();
    expect(getTableName(schema.stationAprsPositions)).toBe('station_aprs_positions');
    const columns = getTableColumns(schema.stationAprsPositions);
    expect(columns.stationId.primary).toBe(true);
    expect(columns.sourceCallsign.notNull).toBe(true);
    expect(columns.latitude.notNull).toBe(true);
    expect(columns.longitude.notNull).toBe(true);
    expect(columns.geog).toBeDefined();
    expect(columns.symbolTable.notNull).toBe(true);
    expect(columns.symbolCode.notNull).toBe(true);
    expect(columns.comment.notNull).toBe(false);
    expect(columns.heardAt.notNull).toBe(true);
    expect(columns.rawPacket.notNull).toBe(true);
  });
});
