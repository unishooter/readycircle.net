import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';

describe('geocoding search route', () => {
  let ctx: TestContext;
  let user: TestUser;
  // vi.spyOn's inferred MockInstance<fetch's signature> and a pre-declared,
  // generically typed `let` don't unify cleanly (parameter contravariance
  // on `unknown` vs `string | URL | Request`); typing this loosely here is
  // simpler than fighting that for a test-only spy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;

  beforeAll(async () => {
    ctx = await createTestContext();
    user = await loginAsNewDevUser(ctx.app, 'Geocoding User');
  });

  afterAll(async () => {
    await deleteTestUser(ctx.db, user.userId);
    await ctx.close();
  });

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/geocoding/search?q=Springfield' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a query that is too short', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/geocoding/search?q=a',
      cookies: { rc_session: user.sessionToken },
    });
    expect(response.statusCode).toBe(400);
  });

  it('maps Nominatim results to the trimmed response shape', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { display_name: 'Springfield, Sangamon County, Illinois, United States', lat: '39.78', lon: '-89.65' },
        ]),
        { status: 200 },
      ),
    );

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/geocoding/search?q=Springfield%2C%20IL',
      cookies: { rc_session: user.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      results: [
        {
          label: 'Springfield, Sangamon County, Illinois, United States',
          latitude: 39.78,
          longitude: -89.65,
        },
      ],
    });

    const requestedUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(requestedUrl.toString()).toContain('nominatim.openstreetmap.org/search');
    expect(requestedUrl.searchParams.get('q')).toBe('Springfield, IL');
    const requestOptions = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect((requestOptions.headers as Record<string, string>)['User-Agent']).toContain('ReadyCircle.net');
  });

  it('degrades to an empty result set when the upstream call fails, rather than erroring', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }));

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/geocoding/search?q=Springfield%2C%20IL',
      cookies: { rc_session: user.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ results: [] });
  });
});
