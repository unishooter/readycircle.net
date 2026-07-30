import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';

function stationPayload(name: string) {
  return {
    name,
    stationType: 'home',
    location: { areaLabel: 'Test Area', precision: 'broad_area' },
    capabilities: ['frs'],
    experienceLevel: 'new',
    authorization: 'frs_user',
    visibility: 'circle',
  };
}

async function createStation(ctx: TestContext, user: TestUser, name: string): Promise<string> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/stations',
    cookies: { rc_session: user.sessionToken },
    payload: stationPayload(name),
  });
  return response.json().id;
}

describe('circles API', () => {
  let ctx: TestContext;
  let creator: TestUser;
  let outsider: TestUser;
  let creatorStationId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    creator = await loginAsNewDevUser(ctx.app, 'Circle Creator');
    outsider = await loginAsNewDevUser(ctx.app, 'Circle Outsider');
    creatorStationId = await createStation(ctx, creator, "Creator's Station");
  });

  afterAll(async () => {
    await deleteTestUser(ctx.db, creator.userId);
    await deleteTestUser(ctx.db, outsider.userId);
    await ctx.close();
  });

  it('creates a Circle and makes the creator a coordinator', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: creator.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'Test Neighborhood Circle',
        area: { areaLabel: 'Test Area' },
        creatorStationId,
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.viewerRole).toBe('coordinator');
    expect(body.coordinatorCount).toBe(1);
    expect(body.memberCount).toBe(1);
    expect(body.circleTypeLabel).toBe('Neighborhood Radio Circle');
  });

  it('rejects creating a Circle with a station the caller does not own', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: outsider.sessionToken },
      payload: {
        circleType: 'custom',
        name: 'Should Fail',
        area: { areaLabel: 'Nowhere' },
        creatorStationId, // owned by `creator`, not `outsider`
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('prevents nonmembers from viewing a Circle', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: creator.sessionToken },
      payload: {
        circleType: 'family',
        name: 'Private Family Circle',
        area: { areaLabel: 'Somewhere' },
        creatorStationId,
      },
    });
    const circleId = createResponse.json().id;

    const viewResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}`,
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(viewResponse.statusCode).toBe(403);
  });

  it('lists only Circles the caller belongs to', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/circles',
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toEqual([]);
  });

  it('prevents a non-coordinator member from editing the Circle', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: creator.sessionToken },
      payload: {
        circleType: 'custom',
        name: 'Edit Test Circle',
        area: { areaLabel: 'Somewhere' },
        creatorStationId,
      },
    });
    const circleId = createResponse.json().id;

    const outsiderStationId = await createStation(ctx, outsider, "Outsider's Station");
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: creator.sessionToken },
      payload: { stationId: outsiderStationId },
    });

    const updateResponse = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/circles/${circleId}`,
      cookies: { rc_session: outsider.sessionToken },
      payload: { name: 'Hijacked' },
    });
    expect(updateResponse.statusCode).toBe(403);
  });
});
