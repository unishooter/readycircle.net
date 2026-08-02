import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  deleteTestCircle,
  deleteTestUser,
  loginAsNewDevUser,
  type TestContext,
  type TestUser,
} from '../../test/helpers.js';

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

describe('invite-only sign-up gate (dev-auth)', () => {
  let bootstrapCtx: TestContext;
  let gatedCtx: TestContext;
  let coordinator: TestUser;
  let inviteToken: string;
  let circleId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    // Two Fastify apps pointed at the same database: `bootstrapCtx` runs
    // with the ordinary (invite-only off) config so a coordinator, station,
    // Circle, and invite link can be set up; `gatedCtx` runs with
    // INVITE_ONLY_ACCESS=true to exercise the sign-up gate itself.
    bootstrapCtx = await createTestContext();
    gatedCtx = await createTestContext({ INVITE_ONLY_ACCESS: 'true' });

    coordinator = await loginAsNewDevUser(bootstrapCtx.app, 'Gate Test Coordinator');
    createdUserIds.push(coordinator.userId);

    const stationResponse = await bootstrapCtx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        name: "Coordinator's Station",
        stationType: 'home',
        location: { areaLabel: 'Test Area', precision: 'broad_area' },
        capabilities: ['frs'],
        experienceLevel: 'new',
        authorization: 'frs_user',
        visibility: 'circle',
      },
    });
    const stationId = stationResponse.json().id;

    const circleResponse = await bootstrapCtx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'Gate Test Circle',
        area: { areaLabel: 'Test Area' },
        creatorStationId: stationId,
      },
    });
    circleId = circleResponse.json().id;

    const inviteResponse = await bootstrapCtx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/invites`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {},
    });
    inviteToken = (inviteResponse.json().inviteUrl as string).split('/invite/')[1]!;
  });

  afterAll(async () => {
    // Delete the Circle first -- it cascades to memberships and invites,
    // which otherwise block deleting the users referenced by
    // `circle_invitations.invited_by` (NOT NULL, no cascade by design).
    await deleteTestCircle(bootstrapCtx.db, circleId);
    for (const userId of createdUserIds) {
      await deleteTestUser(bootstrapCtx.db, userId);
    }
    await bootstrapCtx.close();
    await gatedCtx.close();
  });

  it('reports inviteOnlyAccess: true on /session', async () => {
    const response = await gatedCtx.app.inject({ method: 'GET', url: '/api/v1/session' });
    expect(response.json()).toMatchObject({ inviteOnlyAccess: true });
  });

  it('blocks creating a brand-new account with no invite token', async () => {
    const response = await gatedCtx.app.inject({
      method: 'POST',
      url: '/api/v1/dev-auth/login',
      payload: { displayName: 'Should Be Blocked' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('blocks creating a brand-new account with an invalid invite token', async () => {
    const response = await gatedCtx.app.inject({
      method: 'POST',
      url: '/api/v1/dev-auth/login',
      payload: { displayName: 'Should Also Be Blocked', inviteToken: 'not-a-real-token' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows creating a brand-new account with a valid invite token', async () => {
    const response = await gatedCtx.app.inject({
      method: 'POST',
      url: '/api/v1/dev-auth/login',
      payload: { displayName: 'Invited New User', inviteToken },
    });
    expect(response.statusCode).toBe(200);
    createdUserIds.push(response.json().user.id);
  });

  it('never blocks a returning (existing) user, regardless of invite-only or token presence', async () => {
    const response = await gatedCtx.app.inject({
      method: 'POST',
      url: '/api/v1/dev-auth/login',
      payload: { userId: coordinator.userId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.id).toBe(coordinator.userId);
  });
});
