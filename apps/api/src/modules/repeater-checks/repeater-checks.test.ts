import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { stationRepeaters } from '@readycircle/database';
import {
  createTestContext,
  deleteTestCircle,
  deleteTestUser,
  loginAsNewDevUser,
  type TestContext,
  type TestUser,
} from '../../test/helpers.js';

async function createStation(ctx: TestContext, user: TestUser, name: string): Promise<string> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/stations',
    cookies: { rc_session: user.sessionToken },
    payload: {
      name,
      stationType: 'home',
      location: { areaLabel: 'Test Area', precision: 'broad_area' },
      capabilities: ['frs'],
      experienceLevel: 'new',
      authorization: 'frs_user',
      visibility: 'circle',
    },
  });
  return response.json().id;
}

describe('repeater checks API', () => {
  let ctx: TestContext;
  let coordinator: TestUser;
  let member: TestUser;
  let coordinatorStationId: string;
  let memberStationId: string;
  let circleId: string;
  let repeaterId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    coordinator = await loginAsNewDevUser(ctx.app, 'Check Coordinator');
    member = await loginAsNewDevUser(ctx.app, 'Check Member');

    coordinatorStationId = await createStation(ctx, coordinator, "Coordinator's Station");
    memberStationId = await createStation(ctx, member, "Member's Station");

    const circleResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'Repeater Check Circle',
        area: { areaLabel: 'Test Area' },
        creatorStationId: coordinatorStationId,
      },
    });
    circleId = circleResponse.json().id;

    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: member.sessionToken },
      payload: { stationId: memberStationId },
    });

    const repeaterResponse = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/repeaters`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        service: 'ham',
        name: 'Check Machine',
        outputFrequencyMhz: 146.94,
        latitude: 39.78,
        longitude: -89.65,
      },
    });
    expect(repeaterResponse.statusCode).toBe(201);
    repeaterId = repeaterResponse.json().id;
  });

  afterAll(async () => {
    await deleteTestCircle(ctx.db, circleId);
    await deleteTestUser(ctx.db, coordinator.userId);
    await deleteTestUser(ctx.db, member.userId);
    await ctx.close();
  });

  it('logs a check, upserts station_repeaters, and upgrades access to rx_tx', async () => {
    const rx = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/repeater-checks`,
      cookies: { rc_session: member.sessionToken },
      payload: {
        stationId: memberStationId,
        repeaterId,
        occurredAt: new Date().toISOString(),
        access: 'rx',
        counterpartyNote: 'unspecified',
      },
    });
    expect(rx.statusCode).toBe(201);
    expect(rx.json().access).toBe('rx');
    expect(rx.json().counterpartyNote).toBe('unspecified');

    const [linkAfterRx] = await ctx.db
      .select()
      .from(stationRepeaters)
      .where(eq(stationRepeaters.stationId, memberStationId));
    expect(linkAfterRx?.repeaterId).toBe(repeaterId);
    expect(linkAfterRx?.access).toBe('rx');

    const rxTx = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/repeater-checks`,
      cookies: { rc_session: member.sessionToken },
      payload: {
        stationId: memberStationId,
        repeaterId,
        occurredAt: new Date().toISOString(),
        access: 'rx_tx',
      },
    });
    expect(rxTx.statusCode).toBe(201);

    const [linkAfterTx] = await ctx.db
      .select()
      .from(stationRepeaters)
      .where(eq(stationRepeaters.stationId, memberStationId));
    expect(linkAfterTx?.access).toBe('rx_tx');
  });

  it('does not remove the declared link when a check is deleted', async () => {
    const create = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/repeater-checks`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        stationId: coordinatorStationId,
        repeaterId,
        occurredAt: new Date().toISOString(),
        access: 'rx_tx',
      },
    });
    const checkId = create.json().id;

    const deleted = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/repeater-checks/${checkId}`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(deleted.statusCode).toBe(204);

    const [link] = await ctx.db
      .select()
      .from(stationRepeaters)
      .where(eq(stationRepeaters.stationId, coordinatorStationId));
    expect(link?.repeaterId).toBe(repeaterId);
    expect(link?.access).toBe('rx_tx');
  });

  it('lists recent checks for Circle members', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/repeater-checks`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items.length).toBeGreaterThan(0);
  });
});
