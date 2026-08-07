import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzeCircleConnectivity } from '@readycircle/plan-engine';
import { createTestContext, deleteTestCircle, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';

function stationPayload(name: string, location: { latitude: number; longitude: number } | null = null) {
  return {
    name,
    stationType: 'home',
    location: location
      ? { precision: 'one_km_grid', latitude: location.latitude, longitude: location.longitude }
      : { areaLabel: 'Test Area', precision: 'broad_area' },
    capabilities: ['frs'],
    experienceLevel: 'new',
    authorization: 'frs_user',
    visibility: 'circle',
  };
}

async function createStation(
  ctx: TestContext,
  user: TestUser,
  name: string,
  location: { latitude: number; longitude: number } | null = null,
): Promise<string> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/stations',
    cookies: { rc_session: user.sessionToken },
    payload: stationPayload(name, location),
  });
  return response.json().id;
}

// ~50 km apart -- far enough that the simplex distance estimate alone would
// be 'unlikely', so a logged contact confirming the link is unambiguous.
const COORDINATOR_LOCATION = { latitude: 39.78, longitude: -89.65 };
const MEMBER_LOCATION = { latitude: 40.23, longitude: -89.65 };

describe('contacts API', () => {
  let ctx: TestContext;
  let coordinator: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let coordinatorStationId: string;
  let memberStationId: string;
  let outsiderStationId: string;
  let circleId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    coordinator = await loginAsNewDevUser(ctx.app, 'Contact Coordinator');
    member = await loginAsNewDevUser(ctx.app, 'Contact Member');
    outsider = await loginAsNewDevUser(ctx.app, 'Contact Outsider');

    coordinatorStationId = await createStation(ctx, coordinator, "Coordinator's Station", COORDINATOR_LOCATION);
    memberStationId = await createStation(ctx, member, "Member's Station", MEMBER_LOCATION);
    outsiderStationId = await createStation(ctx, outsider, "Outsider's Station");

    const circleResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'Contact Test Circle',
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
  });

  afterAll(async () => {
    await deleteTestCircle(ctx.db, circleId);
    await deleteTestUser(ctx.db, coordinator.userId);
    await deleteTestUser(ctx.db, member.userId);
    await deleteTestUser(ctx.db, outsider.userId);
    await ctx.close();
  });

  it('rejects a non-member from logging a contact', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: outsider.sessionToken },
      payload: {
        stationId: outsiderStationId,
        counterpartyStationId: coordinatorStationId,
        occurredAt: new Date().toISOString(),
        mode: 'simplex',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects logging a contact for a station the caller does not own', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        stationId: memberStationId, // owned by `member`, not `coordinator`
        counterpartyStationId: coordinatorStationId,
        occurredAt: new Date().toISOString(),
        mode: 'simplex',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects a station cannot log a contact with itself', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        stationId: coordinatorStationId,
        counterpartyStationId: coordinatorStationId,
        occurredAt: new Date().toISOString(),
        mode: 'simplex',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a counterparty station that is not an active member of the Circle', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        stationId: coordinatorStationId,
        counterpartyStationId: outsiderStationId,
        occurredAt: new Date().toISOString(),
        mode: 'simplex',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a future-dated occurredAt', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        stationId: coordinatorStationId,
        counterpartyStationId: memberStationId,
        occurredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        mode: 'simplex',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('confirms the RF connectivity link once a contact between the pair has been logged', async () => {
    // Without any logged contact, ~50 km apart is well past the simplex
    // handheld range, so the raw distance estimate is 'unlikely'.
    const before = await analyzeCircleConnectivity(ctx.db, circleId);
    const beforeLink = before.links.find(
      (link) =>
        (link.fromStationId === coordinatorStationId && link.toStationId === memberStationId) ||
        (link.fromStationId === memberStationId && link.toStationId === coordinatorStationId),
    );
    expect(beforeLink?.confirmed).toBe(false);
    expect(beforeLink?.verdict).toBe('unlikely');

    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        stationId: coordinatorStationId,
        counterpartyStationId: memberStationId,
        occurredAt: new Date().toISOString(),
        mode: 'simplex',
      },
    });

    const after = await analyzeCircleConnectivity(ctx.db, circleId);
    const afterLink = after.links.find(
      (link) =>
        (link.fromStationId === coordinatorStationId && link.toStationId === memberStationId) ||
        (link.fromStationId === memberStationId && link.toStationId === coordinatorStationId),
    );
    expect(afterLink?.confirmed).toBe(true);
    expect(afterLink?.verdict).toBe('likely');
  });

  it('lets an active member log a verified contact for their own station', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        stationId: coordinatorStationId,
        counterpartyStationId: memberStationId,
        occurredAt: '2026-07-01T12:00:00.000Z',
        mode: 'simplex',
        channel: 'GMRS ch 3',
        signalRating: 4,
        notes: 'Clear copy both ways.',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.stationId).toBe(coordinatorStationId);
    expect(body.counterpartyStationId).toBe(memberStationId);
    expect(body.mode).toBe('simplex');
    expect(body.channel).toBe('GMRS ch 3');
    expect(body.signalRating).toBe(4);
    expect(body.viewerCanDelete).toBe(true);
  });

  it('lists contacts for the Circle, visible to any active member', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    const items = response.json().items;
    expect(items.length).toBeGreaterThan(0);
    // Logged by the coordinator, so it's not deletable by the member viewer.
    expect(items[0].viewerCanDelete).toBe(false);
  });

  it('rejects listing Circle contacts for a non-member', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lists a station's contacts to its owner via GET /stations/:stationId/contacts", async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stations/${coordinatorStationId}/contacts`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items.length).toBeGreaterThan(0);
  });

  it("rejects viewing another owner's station contacts", async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stations/${coordinatorStationId}/contacts`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(response.statusCode).toBe(403);
  });

  it("includes the caller's contacts (either side of the pair) in GET /contacts", async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/contacts',
      cookies: { rc_session: member.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    const items = response.json().items;
    expect(items.some((item: { counterpartyStationId: string }) => item.counterpartyStationId === memberStationId)).toBe(
      true,
    );
  });

  it('attaches an optional Circle repeater when mode is repeater', async () => {
    const createRepeater = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/repeaters`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        service: 'gmrs',
        name: 'Contact Test Repeater',
        outputFrequencyMhz: 462.725,
        latitude: 39.8,
        longitude: -89.65,
        areaLabel: 'Test ridge',
      },
    });
    expect(createRepeater.statusCode).toBe(201);
    const repeaterId = createRepeater.json().id;

    const rejected = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        stationId: coordinatorStationId,
        counterpartyStationId: memberStationId,
        occurredAt: new Date().toISOString(),
        mode: 'simplex',
        repeaterId,
      },
    });
    expect(rejected.statusCode).toBe(400);

    const accepted = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        stationId: coordinatorStationId,
        counterpartyStationId: memberStationId,
        occurredAt: new Date().toISOString(),
        mode: 'repeater',
        repeaterId,
      },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().repeaterId).toBe(repeaterId);
    expect(accepted.json().repeaterName).toBe('Contact Test Repeater');

    const connectivity = await analyzeCircleConnectivity(ctx.db, circleId);
    const link = connectivity.links.find(
      (item) =>
        (item.fromStationId === coordinatorStationId && item.toStationId === memberStationId) ||
        (item.fromStationId === memberStationId && item.toStationId === coordinatorStationId),
    );
    expect(link?.viaRepeaterName).toBe('Contact Test Repeater');
  });

  it('lets the logger delete their own contact, but not other members', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/contacts`,
      cookies: { rc_session: member.sessionToken },
      payload: {
        stationId: memberStationId,
        counterpartyStationId: coordinatorStationId,
        occurredAt: new Date().toISOString(),
        mode: 'repeater',
      },
    });
    const contactId = createResponse.json().id;

    const forbiddenDelete = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/contacts/${contactId}`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(forbiddenDelete.statusCode).toBe(403);

    const allowedDelete = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/contacts/${contactId}`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(allowedDelete.statusCode).toBe(204);
  });
});
