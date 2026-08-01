import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';

function stationPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Home Station',
    stationType: 'home',
    location: { areaLabel: 'Test Neighborhood', precision: 'broad_area', latitude: 39.5, longitude: -89.5 },
    capabilities: ['frs'],
    experienceLevel: 'new',
    authorization: 'frs_user',
    goals: ['nearby_family_communication'],
    visibility: 'circle',
    ...overrides,
  };
}

describe('stations API', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let otherUser: TestUser;

  beforeAll(async () => {
    ctx = await createTestContext();
    owner = await loginAsNewDevUser(ctx.app, 'Station Owner');
    otherUser = await loginAsNewDevUser(ctx.app, 'Other User');
  });

  afterAll(async () => {
    await deleteTestUser(ctx.db, owner.userId);
    await deleteTestUser(ctx.db, otherUser.userId);
    await ctx.close();
  });

  it('creates a station for the authenticated owner', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: stationPayload(),
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.isOwner).toBe(true);
    expect(body.ownerId).toBe(owner.userId);
    expect(body.name).toBe('Test Home Station');
    expect(body.location.latitude).toBe(39.5);
    // Server-derived 1km MGRS code for (39.5, -89.5) -- see packages/geo.
    // gridIdentifier is always derived from coordinates, regardless of the
    // 'broad_area' display precision used here (that only controls what
    // non-owners see, per shapeStationLocation).
    expect(body.location.gridIdentifier).toBe('16SBJ8575');
  });

  it('ignores a client-supplied gridIdentifier and always derives it from coordinates', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: stationPayload({
        location: {
          areaLabel: 'Test Neighborhood',
          precision: 'one_km_grid',
          latitude: 39.5,
          longitude: -89.5,
          gridIdentifier: 'NOT-A-REAL-GRID',
        },
      }),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().location.gridIdentifier).toBe('16SBJ8575');
  });

  it('derives no gridIdentifier when no coordinates are provided', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: stationPayload({ location: { precision: 'hidden' } }),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().location.gridIdentifier).toBeNull();
  });

  it('lists only the caller\'s own stations', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((s: { ownerId: string }) => s.ownerId === owner.userId)).toBe(true);
  });

  it('rejects requests with no session', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/stations' });
    expect(response.statusCode).toBe(401);
  });

  it('enforces ownership: a non-owner cannot view a private station', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: stationPayload({ visibility: 'private' }),
    });
    const stationId = createResponse.json().id;

    const viewResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stations/${stationId}`,
      cookies: { rc_session: otherUser.sessionToken },
    });
    expect(viewResponse.statusCode).toBe(403);
  });

  it('does not expose precise coordinates to a non-owner even when circle-visible without a shared circle', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: stationPayload({ visibility: 'circle' }),
    });
    const stationId = createResponse.json().id;

    // No shared Circle exists between owner and otherUser yet, so this must be forbidden entirely.
    const viewResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stations/${stationId}`,
      cookies: { rc_session: otherUser.sessionToken },
    });
    expect(viewResponse.statusCode).toBe(403);
  });

  it('enforces ownership: a non-owner cannot edit or archive a station', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: stationPayload(),
    });
    const stationId = createResponse.json().id;

    const updateResponse = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/stations/${stationId}`,
      cookies: { rc_session: otherUser.sessionToken },
      payload: { name: 'Hijacked Name' },
    });
    expect(updateResponse.statusCode).toBe(403);

    const archiveResponse = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/stations/${stationId}`,
      cookies: { rc_session: otherUser.sessionToken },
    });
    expect(archiveResponse.statusCode).toBe(403);
  });

  it('archives (rather than deletes) a station for its owner', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: stationPayload(),
    });
    const stationId = createResponse.json().id;

    const archiveResponse = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/stations/${stationId}`,
      cookies: { rc_session: owner.sessionToken },
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json().status).toBe('archived');

    const getResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stations/${stationId}`,
      cookies: { rc_session: owner.sessionToken },
    });
    expect(getResponse.json().status).toBe('archived');
  });

  it('rejects invalid station payloads with a validation error shape', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: { name: '', stationType: 'not-a-real-type' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_error');
  });
});
