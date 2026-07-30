import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { ProviderIdentityInput } from './identity-mapping.js';

export interface CognitoAuthProviderConfig {
  userPoolId: string;
  clientId: string;
  clientSecret: string;
  domain: string;
  redirectUri: string;
}

/**
 * Minimal shape we depend on from `aws-jwt-verify`'s Cognito ID-token
 * verifier, so tests can inject a fake verifier instead of hitting a real
 * user pool's JWKS endpoint over the network.
 */
export interface CognitoIdTokenVerifier {
  verify(idToken: string): Promise<Record<string, unknown>>;
}

export interface AuthorizationUrlOptions {
  state: string;
  codeChallenge: string;
  /**
   * When set to `'Google'`, Cognito skips its own Hosted UI / Managed Login
   * picker screen entirely and redirects straight to Google's consent
   * screen -- this is what makes the "Continue with Google" button feel
   * like a direct Google sign-in rather than a detour through an
   * AWS-branded page.
   */
  identityProvider?: 'Google';
}

/**
 * Real Amazon Cognito OAuth adapter (Authorization Code + PKCE). Cognito is
 * configured (outside this codebase, see
 * docs/deployment/cognito-google-setup.md) with two enabled sign-in
 * methods: native username/password, and Google as a federated identity
 * provider. Both funnel through the same `/oauth2/authorize` ->
 * `/oauth2/token` -> ID-token-verification flow; the only difference is
 * whether `identityProvider` is set when building the authorize URL.
 *
 * Cognito tokens (id/access/refresh) are never returned to the browser --
 * the verified identity is hashed down to a `ProviderIdentityInput` here,
 * then handed to `findOrCreateUserByProviderIdentity` and `SessionManager`
 * by the caller (see `apps/api/src/modules/auth/routes.ts`), which is the
 * only thing that ever issues a ReadyCircle session cookie.
 */
export class CognitoAuthProvider {
  readonly name = 'cognito' as const;
  private readonly verifierFactory: () => CognitoIdTokenVerifier;
  private cachedVerifier: CognitoIdTokenVerifier | null = null;

  constructor(
    private readonly config: CognitoAuthProviderConfig,
    /** Injectable for tests; defaults to a real JWKS-backed verifier for this user pool. */
    verifierFactory?: () => CognitoIdTokenVerifier,
  ) {
    this.verifierFactory =
      verifierFactory ??
      (() =>
        CognitoJwtVerifier.create({
          userPoolId: this.config.userPoolId,
          tokenUse: 'id',
          clientId: this.config.clientId,
        }) as unknown as CognitoIdTokenVerifier);
  }

  private get verifier(): CognitoIdTokenVerifier {
    if (!this.cachedVerifier) this.cachedVerifier = this.verifierFactory();
    return this.cachedVerifier;
  }

  isConfigured(): boolean {
    return Boolean(this.config.userPoolId && this.config.clientId && this.config.domain && this.config.redirectUri);
  }

  getAuthorizationUrl({ state, codeChallenge, identityProvider }: AuthorizationUrlOptions): string {
    if (!this.isConfigured()) {
      throw new Error('Cognito is not configured in this environment.');
    }
    const url = new URL(`https://${this.config.domain}/oauth2/authorize`);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (identityProvider) {
      url.searchParams.set('identity_provider', identityProvider);
    }
    return url.toString();
  }

  /**
   * Cognito's hosted end-session endpoint -- also clears its own SSO
   * session, not just ours. `postLogoutRedirectUri` should be the web
   * app's own origin (`config.appBaseUrl`), which is *not* necessarily the
   * same origin as `redirectUri` in local development (the API and Vite
   * dev server run on different ports there, even though Nginx unifies
   * them onto one origin in production) -- it must also be registered as
   * an allowed sign-out URL on the Cognito App Client.
   */
  getLogoutUrl(postLogoutRedirectUri: string): string {
    if (!this.isConfigured()) {
      throw new Error('Cognito is not configured in this environment.');
    }
    const url = new URL(`https://${this.config.domain}/logout`);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('logout_uri', postLogoutRedirectUri);
    return url.toString();
  }

  async handleCallback(params: { code: string; codeVerifier: string }): Promise<ProviderIdentityInput> {
    if (!this.isConfigured()) {
      throw new Error('Cognito is not configured in this environment.');
    }

    const tokenResponse = await fetch(`https://${this.config.domain}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        code: params.code,
        redirect_uri: this.config.redirectUri,
        code_verifier: params.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error(`Cognito token exchange failed with status ${tokenResponse.status}: ${body}`);
    }

    const tokens = (await tokenResponse.json()) as { id_token?: string };
    if (!tokens.id_token) {
      throw new Error('Cognito token response did not include an id_token.');
    }

    const claims = await this.verifier.verify(tokens.id_token);
    return mapClaimsToIdentity(claims);
  }
}

/**
 * For a federated sign-in (e.g. Google), Cognito adds an `identities` claim
 * to the ID token: a JSON-*encoded string* (not a native array) whose first
 * entry's `providerName` names the upstream IdP. When the claim is absent,
 * the user authenticated directly against the user pool's own
 * username/password store.
 */
function mapClaimsToIdentity(claims: Record<string, unknown>): ProviderIdentityInput {
  const sub = requireStringClaim(claims, 'sub');
  const email = typeof claims.email === 'string' ? claims.email : null;
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  const displayName =
    (typeof claims.name === 'string' && claims.name) ||
    (typeof claims.given_name === 'string' && claims.given_name) ||
    email ||
    'ReadyCircle member';

  return {
    provider: federatedProviderFrom(claims),
    providerSubject: sub,
    providerEmail: email,
    emailVerified,
    displayName,
  };
}

function federatedProviderFrom(claims: Record<string, unknown>): ProviderIdentityInput['provider'] {
  const raw = claims.identities;
  if (typeof raw !== 'string') return 'email_password';
  try {
    const identities = JSON.parse(raw) as Array<{ providerName?: string }>;
    if (identities[0]?.providerName === 'Google') return 'google';
  } catch {
    // Malformed/unexpected claim shape; fall through to the safe default
    // rather than fail the whole sign-in over a cosmetic label.
  }
  return 'email_password';
}

function requireStringClaim(claims: Record<string, unknown>, key: string): string {
  const value = claims[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Cognito ID token is missing the required "${key}" claim.`);
  }
  return value;
}
