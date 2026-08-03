import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { circles } from '@readycircle/database';
import type * as DomainModule from '@readycircle/domain';
import { createTestContext, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';

const CIRCLE_IDENTIFIER_PATTERN = /^[BCDFGHJKMNPRSTVWXZ][AEIOU][BCDFGHJKMNPRSTVWXZ][1-9]$/;

// Preserves every other `@readycircle/domain` export (e.g. `canEditCircle`,
// used by the service under test) while letting individual tests override
// `generateCircleIdentifier` to force deterministic collisions.
vi.mock('@readycircle/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof DomainModule>();
  return { ...actual, generateCircleIdentifier: vi.fn(actual.generateCircleIdentifier) };
});
const { generateCircleIdentifier } = await import('@readycircle/domain');
const generateCircleIdentifierMock = vi.mocked(generateCircleIdentifier);
const { generateCircleIdentifier: actualGenerateCircleIdentifier } =
  await vi.importActual<typeof DomainModule>('@readycircle/domain');

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

  describe('Circle Identifier', () => {
    // These tests force specific literal identifiers via the mocked
    // generator; clear out any leftover circle from a previous, possibly
    // interrupted test run so the collision assertions stay deterministic
    // (test circles here aren't cascade-deleted by `deleteTestUser` --
    // `circles.createdBy` intentionally sets null instead of cascading).
    beforeAll(async () => {
      await ctx.db.delete(circles).where(eq(circles.circleIdentifier, 'RAV7'));
      await ctx.db.delete(circles).where(eq(circles.circleIdentifier, 'TUG8'));
      await ctx.db.delete(circles).where(eq(circles.circleIdentifier, 'MEK4'));
    });

    it('assigns a valid, unique Circle Identifier on creation', async () => {
      const first = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: { circleType: 'custom', name: 'Identifier Circle One', area: { areaLabel: 'Somewhere' }, creatorStationId },
      });
      const second = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: { circleType: 'custom', name: 'Identifier Circle Two', area: { areaLabel: 'Somewhere' }, creatorStationId },
      });
      const firstBody = first.json();
      const secondBody = second.json();
      expect(firstBody.circleIdentifier).toMatch(CIRCLE_IDENTIFIER_PATTERN);
      expect(secondBody.circleIdentifier).toMatch(CIRCLE_IDENTIFIER_PATTERN);
      expect(firstBody.circleIdentifier).not.toBe(secondBody.circleIdentifier);
    });

    it('includes circleIdentifier in list and detail responses', async () => {
      const createResponse = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: { circleType: 'custom', name: 'List Identifier Circle', area: { areaLabel: 'Somewhere' }, creatorStationId },
      });
      const circleId = createResponse.json().id;

      const detailResponse = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/circles/${circleId}`,
        cookies: { rc_session: creator.sessionToken },
      });
      expect(detailResponse.json().circleIdentifier).toMatch(CIRCLE_IDENTIFIER_PATTERN);

      const listResponse = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
      });
      const listed = listResponse.json().items.find((item: { id: string }) => item.id === circleId);
      expect(listed.circleIdentifier).toMatch(CIRCLE_IDENTIFIER_PATTERN);
    });

    it('ignores a client-supplied circleIdentifier on update (read-only)', async () => {
      const createResponse = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: { circleType: 'custom', name: 'Read Only Circle', area: { areaLabel: 'Somewhere' }, creatorStationId },
      });
      const circleId = createResponse.json().id;
      const originalIdentifier = createResponse.json().circleIdentifier;

      const updateResponse = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/circles/${circleId}`,
        cookies: { rc_session: creator.sessionToken },
        payload: { circleIdentifier: 'ZZZ9', name: 'Renamed Circle' },
      });
      expect(updateResponse.statusCode).toBe(200);
      const body = updateResponse.json();
      expect(body.name).toBe('Renamed Circle');
      expect(body.circleIdentifier).toBe(originalIdentifier);
      expect(body.circleIdentifier).not.toBe('ZZZ9');
    });

    it('retries with a fresh identifier when the first one collides', async () => {
      generateCircleIdentifierMock.mockReturnValueOnce('RAV7').mockReturnValueOnce('RAV7').mockReturnValueOnce('TUG8');

      const first = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: { circleType: 'custom', name: 'Collision Circle One', area: { areaLabel: 'Somewhere' }, creatorStationId },
      });
      expect(first.statusCode).toBe(201);
      expect(first.json().circleIdentifier).toBe('RAV7');

      const second = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: { circleType: 'custom', name: 'Collision Circle Two', area: { areaLabel: 'Somewhere' }, creatorStationId },
      });
      expect(second.statusCode).toBe(201);
      expect(second.json().circleIdentifier).toBe('TUG8');
    });

    it('returns a 409 with a clear message when retries are exhausted', async () => {
      generateCircleIdentifierMock.mockReturnValue('MEK4');
      // First call above consumes the 'MEK4' slot for real; second is guaranteed to collide every attempt.
      await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: { circleType: 'custom', name: 'Exhausted Circle One', area: { areaLabel: 'Somewhere' }, creatorStationId },
      });

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: { circleType: 'custom', name: 'Exhausted Circle Two', area: { areaLabel: 'Somewhere' }, creatorStationId },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.message).toMatch(/unique Circle Identifier/i);

      generateCircleIdentifierMock.mockReset();
      generateCircleIdentifierMock.mockImplementation(actualGenerateCircleIdentifier);
    });
  });

  describe('Circle grid location', () => {
    const GRID_IDENTIFIER_PATTERN = /^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}\d{4}$/;

    it('derives and returns a gridIdentifier when a map location is provided on creation', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: {
          circleType: 'custom',
          name: 'Grid Location Circle',
          area: { areaLabel: 'Somewhere', gridLocation: { latitude: 38.8977, longitude: -77.0365 } },
          creatorStationId,
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.area.gridIdentifier).toMatch(GRID_IDENTIFIER_PATTERN);
      expect(body.area.gridLatitude).toBeCloseTo(38.8977, 3);
      expect(body.area.gridLongitude).toBeCloseTo(-77.0365, 3);
    });

    it('returns null gridIdentifier and preserves legacy gridOrLocalityLabel when no map location is provided', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: { circleType: 'custom', name: 'No Grid Circle', area: { areaLabel: 'Somewhere' }, creatorStationId },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.area.gridIdentifier).toBeNull();
      expect(body.area.gridLatitude).toBeNull();
      expect(body.area.gridLongitude).toBeNull();
      // No legacy label was ever settable through this API, so it's null too -- see seed data for a populated example.
      expect(body.area.gridOrLocalityLabel).toBeNull();
    });

    it('sets, updates, and clears a gridLocation via PATCH', async () => {
      const createResponse = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: { circleType: 'custom', name: 'Grid Update Circle', area: { areaLabel: 'Somewhere' }, creatorStationId },
      });
      const circleId = createResponse.json().id;
      expect(createResponse.json().area.gridIdentifier).toBeNull();

      const setResponse = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/circles/${circleId}`,
        cookies: { rc_session: creator.sessionToken },
        payload: { area: { areaLabel: 'Somewhere', gridLocation: { latitude: 38.8977, longitude: -77.0365 } } },
      });
      expect(setResponse.statusCode).toBe(200);
      const firstIdentifier = setResponse.json().area.gridIdentifier;
      expect(firstIdentifier).toMatch(GRID_IDENTIFIER_PATTERN);

      const updateResponse = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/circles/${circleId}`,
        cookies: { rc_session: creator.sessionToken },
        payload: { area: { areaLabel: 'Somewhere', gridLocation: { latitude: 40.7128, longitude: -74.006 } } },
      });
      expect(updateResponse.statusCode).toBe(200);
      const secondIdentifier = updateResponse.json().area.gridIdentifier;
      expect(secondIdentifier).toMatch(GRID_IDENTIFIER_PATTERN);
      expect(secondIdentifier).not.toBe(firstIdentifier);

      const clearResponse = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/circles/${circleId}`,
        cookies: { rc_session: creator.sessionToken },
        payload: { area: { areaLabel: 'Somewhere', gridLocation: null } },
      });
      expect(clearResponse.statusCode).toBe(200);
      const clearedBody = clearResponse.json();
      expect(clearedBody.area.gridIdentifier).toBeNull();
      expect(clearedBody.area.gridLatitude).toBeNull();
      expect(clearedBody.area.gridLongitude).toBeNull();
    });

    it('ignores a client-supplied gridIdentifier and always re-derives it server-side', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: {
          circleType: 'custom',
          name: 'Spoofed Grid Circle',
          // `gridIdentifier` is not part of `circleGridLocationInputSchema`, so this is stripped by Zod.
          area: { areaLabel: 'Somewhere', gridLocation: { latitude: 1, longitude: 1, gridIdentifier: 'FAKE' } },
          creatorStationId,
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.area.gridIdentifier).not.toBe('FAKE');
      expect(body.area.gridIdentifier).toMatch(GRID_IDENTIFIER_PATTERN);
    });

    it('leaves an existing gridLocation untouched when the update omits it entirely', async () => {
      const createResponse = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: creator.sessionToken },
        payload: {
          circleType: 'custom',
          name: 'Grid Untouched Circle',
          area: { areaLabel: 'Somewhere', gridLocation: { latitude: 38.8977, longitude: -77.0365 } },
          creatorStationId,
        },
      });
      const circleId = createResponse.json().id;
      const originalIdentifier = createResponse.json().area.gridIdentifier;

      const renameResponse = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/circles/${circleId}`,
        cookies: { rc_session: creator.sessionToken },
        payload: { name: 'Renamed Without Touching Grid' },
      });
      expect(renameResponse.statusCode).toBe(200);
      expect(renameResponse.json().area.gridIdentifier).toBe(originalIdentifier);
    });
  });
});
