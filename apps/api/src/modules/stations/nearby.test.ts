import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';
import { findNearbyStations } from './nearby.js';

function stationPayload(name: string, latitude: number, longitude: number) {
  return {
    name,
    stationType: 'home',
    location: { precision: 'one_km_grid', latitude, longitude },
    capabilities: ['frs'],
    experienceLevel: 'new',
    authorization: 'frs_user',
    visibility: 'private',
  };
}

describe('findNearbyStations', () => {
  let ctx: TestContext;
  let owner: TestUser;

  // Three points near downtown Springfield, IL: origin, ~0.5km away, and
  // ~50km away -- far enough apart to unambiguously test radius filtering
  // and distance ordering without being sensitive to exact geodesic math.
  const origin = { latitude: 39.7817, longitude: -89.6501 };
  const nearby = { latitude: 39.7862, longitude: -89.6501 }; // ~0.5km north
  const far = { latitude: 40.2, longitude: -89.6501 }; // ~46km north

  beforeAll(async () => {
    ctx = await createTestContext();
    owner = await loginAsNewDevUser(ctx.app, 'Nearby Query Owner');

    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: stationPayload('Origin Station', origin.latitude, origin.longitude),
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: stationPayload('Nearby Station', nearby.latitude, nearby.longitude),
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: owner.sessionToken },
      payload: stationPayload('Far Station', far.latitude, far.longitude),
    });
  });

  afterAll(async () => {
    await deleteTestUser(ctx.db, owner.userId);
    await ctx.close();
  });

  it('returns stations within the radius, ordered by distance, excluding ones outside it', async () => {
    const results = await findNearbyStations(ctx.db, {
      latitude: origin.latitude,
      longitude: origin.longitude,
      radiusMeters: 5000,
    });

    expect(results.length).toBe(2);
    expect(results[0]!.distanceMeters).toBeLessThan(results[1]!.distanceMeters);
    expect(results[0]!.distanceMeters).toBeLessThan(100);
    expect(results[1]!.distanceMeters).toBeGreaterThan(400);
    expect(results[1]!.distanceMeters).toBeLessThan(600);
  });

  it('respects the limit option', async () => {
    const results = await findNearbyStations(ctx.db, {
      latitude: origin.latitude,
      longitude: origin.longitude,
      radiusMeters: 5000,
      limit: 1,
    });
    expect(results.length).toBe(1);
  });

  it('finds nothing when searching from a point far from every station', async () => {
    const results = await findNearbyStations(ctx.db, {
      latitude: -33.8688, // Sydney, Australia -- nowhere near the seed stations above
      longitude: 151.2093,
      radiusMeters: 5000,
    });
    expect(results.length).toBe(0);
  });
});
