import { afterEach, describe, expect, it, vi } from 'vitest';
import { CognitoAuthProvider, type CognitoIdTokenVerifier } from './cognito-auth-provider.js';

const baseConfig = {
  userPoolId: 'us-east-1_example',
  clientId: 'client-abc',
  clientSecret: 'secret-xyz',
  domain: 'readycircle.auth.us-east-1.amazoncognito.com',
  redirectUri: 'http://localhost:3000/api/v1/auth/callback',
};

function fakeVerifier(claims: Record<string, unknown>): CognitoIdTokenVerifier {
  return { verify: vi.fn().mockResolvedValue(claims) };
}

describe('CognitoAuthProvider.getAuthorizationUrl', () => {
  it('builds a PKCE authorize URL against the configured Cognito domain', () => {
    const provider = new CognitoAuthProvider(baseConfig);
    const url = new URL(provider.getAuthorizationUrl({ state: 'state-1', codeChallenge: 'challenge-1' }));

    expect(url.origin + url.pathname).toBe('https://readycircle.auth.us-east-1.amazoncognito.com/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.has('identity_provider')).toBe(false);
  });

  it('adds identity_provider=Google to skip the Cognito picker screen', () => {
    const provider = new CognitoAuthProvider(baseConfig);
    const url = new URL(
      provider.getAuthorizationUrl({ state: 'state-1', codeChallenge: 'challenge-1', identityProvider: 'Google' }),
    );
    expect(url.searchParams.get('identity_provider')).toBe('Google');
  });

  it('throws when Cognito is not configured', () => {
    const provider = new CognitoAuthProvider({ ...baseConfig, domain: '' });
    expect(() => provider.getAuthorizationUrl({ state: 's', codeChallenge: 'c' })).toThrow();
  });
});

describe('CognitoAuthProvider.getLogoutUrl', () => {
  it('points at the Cognito hosted logout endpoint with the given post-logout redirect', () => {
    const provider = new CognitoAuthProvider(baseConfig);
    const url = new URL(provider.getLogoutUrl('http://localhost:5173'));
    expect(url.origin + url.pathname).toBe('https://readycircle.auth.us-east-1.amazoncognito.com/logout');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('logout_uri')).toBe('http://localhost:5173');
  });
});

describe('CognitoAuthProvider.handleCallback', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps a federated Google sign-in to provider "google" using the id token claims', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: 'fake-id-token' }),
    }) as unknown as typeof fetch;

    const verifier = fakeVerifier({
      sub: 'cognito-sub-1',
      email: 'person@example.com',
      email_verified: true,
      given_name: 'Person',
      identities: JSON.stringify([{ providerName: 'Google', userId: 'google-sub-1' }]),
    });

    const provider = new CognitoAuthProvider(baseConfig, () => verifier);
    const identity = await provider.handleCallback({ code: 'auth-code', codeVerifier: 'verifier-1' });

    expect(identity).toEqual({
      provider: 'google',
      providerSubject: 'cognito-sub-1',
      providerEmail: 'person@example.com',
      emailVerified: true,
      displayName: 'Person',
    });
  });

  it('maps a native username/password sign-in to provider "email_password" when no identities claim is present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: 'fake-id-token' }),
    }) as unknown as typeof fetch;

    const verifier = fakeVerifier({
      sub: 'cognito-sub-2',
      email: 'password-user@example.com',
      email_verified: true,
      name: 'Password User',
    });

    const provider = new CognitoAuthProvider(baseConfig, () => verifier);
    const identity = await provider.handleCallback({ code: 'auth-code', codeVerifier: 'verifier-1' });

    expect(identity.provider).toBe('email_password');
    expect(identity.providerSubject).toBe('cognito-sub-2');
  });

  it('throws when the token endpoint rejects the code', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid_grant',
    }) as unknown as typeof fetch;

    const provider = new CognitoAuthProvider(baseConfig, () => fakeVerifier({}));
    await expect(provider.handleCallback({ code: 'bad-code', codeVerifier: 'verifier-1' })).rejects.toThrow(
      /token exchange failed/i,
    );
  });

  it('throws when the id token is missing the sub claim', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: 'fake-id-token' }),
    }) as unknown as typeof fetch;

    const provider = new CognitoAuthProvider(baseConfig, () => fakeVerifier({ email: 'nosub@example.com' }));
    await expect(provider.handleCallback({ code: 'auth-code', codeVerifier: 'verifier-1' })).rejects.toThrow(/sub/);
  });
});
