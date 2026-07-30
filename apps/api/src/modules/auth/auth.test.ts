import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/helpers.js';

const COGNITO_ENV = {
  COGNITO_USER_POOL_ID: 'us-east-1_example',
  COGNITO_CLIENT_ID: 'test-client-id',
  COGNITO_CLIENT_SECRET: 'test-client-secret',
  COGNITO_DOMAIN: 'readycircle-test.auth.us-east-1.amazoncognito.com',
  COGNITO_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/callback',
};

describe('Cognito auth routes (configured)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext(COGNITO_ENV);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /auth/google redirects straight to Google via Cognito and sets a pending-state cookie', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/google' });
    expect(response.statusCode).toBe(302);

    const location = new URL(response.headers.location as string);
    expect(location.origin + location.pathname).toBe('https://readycircle-test.auth.us-east-1.amazoncognito.com/oauth2/authorize');
    expect(location.searchParams.get('identity_provider')).toBe('Google');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.has('state')).toBe(true);

    const pendingCookie = response.cookies.find((cookie) => cookie.name === 'rc_oauth_pending');
    expect(pendingCookie).toBeDefined();
    expect(pendingCookie?.httpOnly).toBe(true);
  });

  it('GET /auth/login redirects to the Cognito hosted UI without identity_provider set', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/login' });
    expect(response.statusCode).toBe(302);

    const location = new URL(response.headers.location as string);
    expect(location.searchParams.has('identity_provider')).toBe(false);
    expect(location.searchParams.has('state')).toBe(true);
  });

  it('GET /auth/callback redirects to /login?error=oauth_cancelled when the provider reports an error', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/callback?error=access_denied' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/login?error=oauth_cancelled');
  });

  it('GET /auth/callback redirects to /login?error=oauth_failed when there is no pending-state cookie', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/callback?code=some-code&state=some-state',
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/login?error=oauth_failed');
  });

  it('GET /auth/callback redirects to /login?error=oauth_failed when state does not match the pending cookie', async () => {
    const startResponse = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/google' });
    const pendingCookie = startResponse.cookies.find((cookie) => cookie.name === 'rc_oauth_pending')!;

    const callbackResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/callback?code=some-code&state=a-different-state-value',
      cookies: { rc_oauth_pending: pendingCookie.value },
    });
    expect(callbackResponse.statusCode).toBe(302);
    expect(callbackResponse.headers.location).toContain('/login?error=oauth_failed');
  });

  it('GET /auth/logout-redirect redirects to the Cognito hosted logout endpoint', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/logout-redirect' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('https://readycircle-test.auth.us-east-1.amazoncognito.com/logout');
  });

  it('reports cognitoEnabled: true on /session', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/session' });
    expect(response.json()).toMatchObject({ cognitoEnabled: true });
  });
});

describe('Cognito auth routes (not configured)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('does not register any /auth/* routes when Cognito is not configured', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/google' });
    expect(response.statusCode).toBe(404);
  });

  it('reports cognitoEnabled: false on /session', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/session' });
    expect(response.json()).toMatchObject({ cognitoEnabled: false });
  });
});
