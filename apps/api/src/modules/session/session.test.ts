import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, deleteTestUser, type TestContext } from '../../test/helpers.js';

describe('session and development authentication', () => {
  let ctx: TestContext;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(ctx.db, userId);
    }
    await ctx.close();
  });

  it('reports unauthenticated when no session cookie is present', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/session' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ authenticated: false, user: null, devAuthEnabled: true });
  });

  it('creates a new development user and returns an authenticated session', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/dev-auth/login',
      payload: { displayName: 'Test Dev User' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.displayName).toBe('Test Dev User');
    createdUserIds.push(body.user.id);

    const sessionCookie = response.cookies.find((cookie) => cookie.name === 'rc_session');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
  });

  it('resolves the current session from the cookie', async () => {
    const loginResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/dev-auth/login',
      payload: { displayName: 'Cookie Check User' },
    });
    const { user } = loginResponse.json();
    createdUserIds.push(user.id);
    const cookie = loginResponse.cookies.find((c) => c.name === 'rc_session');

    const sessionResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/session',
      cookies: { rc_session: cookie!.value },
    });
    expect(sessionResponse.json()).toMatchObject({ authenticated: true, user: { id: user.id } });
  });

  it('clears the session on logout', async () => {
    const loginResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/dev-auth/login',
      payload: { displayName: 'Logout User' },
    });
    const { user } = loginResponse.json();
    createdUserIds.push(user.id);
    const cookie = loginResponse.cookies.find((c) => c.name === 'rc_session');

    await ctx.app.inject({ method: 'POST', url: '/api/v1/logout', cookies: { rc_session: cookie!.value } });

    const sessionResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/session',
      cookies: { rc_session: cookie!.value },
    });
    expect(sessionResponse.json()).toMatchObject({ authenticated: false, user: null });
  });

  it('rejects protected routes without a session', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/users/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unauthorized');
  });
});
