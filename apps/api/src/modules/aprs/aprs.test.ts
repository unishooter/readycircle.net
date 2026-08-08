import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { stationAprsPositions } from '@readycircle/database';
import {
  createTestContext,
  deleteTestUser,
  loginAsNewDevUser,
  type TestContext,
  type TestUser,
} from '../../test/helpers.js';

function stationPayload(name: string, extras: Record<string, unknown> = {}) {
  return {
    name,
    stationType: 'home',
    location: { areaLabel: 'Test Area', precision: 'broad_area' },
    capabilities: ['gmrs'],
    experienceLevel: 'new',
    authorization: 'gmrs_license',
    visibility: 'circle',
    ...extras,
  };
}

describe('APRS live positions API', () => {
  let ctx: TestContext;
  let coordinator: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let coordinatorStationId: string;
  let memberStationId: string;
  let noPositionStationId: string;
  let circleId: string;

  beforeAll(async () => {
    // Login callsign required for the feature gate (enabled && callsign).
    ctx = await createTestContext({ APRS_IS_CALLSIGN: 'W1AW', APRS_ENABLED: 'true' });
    coordinator = await loginAsNewDevUser(ctx.app, 'APRS Coordinator');
    member = await loginAsNewDevUser(ctx.app, 'APRS Member');
    outsider = await loginAsNewDevUser(ctx.app, 'APRS Outsider');

    const coordStation = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: coordinator.sessionToken },
      payload: stationPayload('Coordinator Base', { callsign: 'KI5ABC-9' }),
    });
    coordinatorStationId = coordStation.json().id;

    const circleResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'APRS Test Circle',
        area: { areaLabel: 'Trackerville' },
        creatorStationId: coordinatorStationId,
      },
    });
    circleId = circleResponse.json().id;

    const memberStation = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: member.sessionToken },
      payload: stationPayload('Member Mobile', { callsign: 'N0CALL-5' }),
    });
    memberStationId = memberStation.json().id;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: member.sessionToken },
      payload: { stationId: memberStationId },
    });

    const noPositionStation = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: member.sessionToken },
      payload: stationPayload('Handheld With No Beacon Yet', { callsign: 'W9NONE' }),
    });
    noPositionStationId = noPositionStation.json().id;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: member.sessionToken },
      payload: { stationId: noPositionStationId },
    });

    // Simulates what the worker's AprsIsListener writes after hearing a packet.
    await ctx.db.insert(stationAprsPositions).values({
      stationId: coordinatorStationId,
      sourceCallsign: 'KI5ABC-9',
      latitude: 33.4589,
      longitude: -97.1333,
      symbolTable: '/',
      symbolCode: '>',
      comment: 'Mobile station',
      heardAt: new Date('2026-08-01T12:00:00Z'),
      rawPacket: 'KI5ABC-9>APRS:!3327.50N/09708.00W>Mobile station',
    });
    await ctx.db.insert(stationAprsPositions).values({
      stationId: memberStationId,
      sourceCallsign: 'N0CALL-5',
      latitude: 49.0583,
      longitude: -72.0292,
      symbolTable: '/',
      symbolCode: '-',
      comment: null,
      heardAt: new Date('2026-08-01T12:05:00Z'),
      rawPacket: 'N0CALL-5>APRS:!4903.50N/07201.75W-',
    });
  });

  afterAll(async () => {
    for (const user of [coordinator, member, outsider]) {
      await deleteTestUser(ctx.db, user.userId);
    }
    await ctx.close();
  });

  it('hides live positions from non-members', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/aprs-positions`,
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects requests with no session', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: `/api/v1/circles/${circleId}/aprs-positions` });
    expect(response.statusCode).toBe(401);
  });

  it('lists exact coordinates for every member station with a callsign and a recorded position, regardless of the station\'s manual location precision', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/aprs-positions`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    const items = response.json().items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);

    const coordinatorItem = items.find((item) => item.stationId === coordinatorStationId);
    expect(coordinatorItem).toMatchObject({
      stationName: 'Coordinator Base',
      callsign: 'KI5ABC-9',
      latitude: 33.4589,
      longitude: -97.1333,
      symbolTable: '/',
      symbolCode: '>',
      comment: 'Mobile station',
    });
    expect(coordinatorItem?.heardAt).toBe('2026-08-01T12:00:00.000Z');
  });

  it('excludes member stations that have no recorded APRS position yet', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/aprs-positions`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    const items = response.json().items as Array<Record<string, unknown>>;
    expect(items.some((item) => item.stationId === noPositionStationId)).toBe(false);
  });

  it('stops showing a station once its callsign is cleared, even if a stale position row remains', async () => {
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/stations/${memberStationId}`,
      cookies: { rc_session: member.sessionToken },
      payload: { callsign: null },
    });

    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/aprs-positions`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    const items = response.json().items as Array<Record<string, unknown>>;
    expect(items.some((item) => item.stationId === memberStationId)).toBe(false);

    // Cleanup: restore state a later test in this describe block might rely on.
    const stillThere = await ctx.db
      .select()
      .from(stationAprsPositions)
      .where(eq(stationAprsPositions.stationId, memberStationId));
    expect(stillThere).toHaveLength(1); // the row itself is untouched, only hidden
  });
});
