export interface CognitoAuthProviderConfig {
  userPoolId: string;
  clientId: string;
  clientSecret: string;
  domain: string;
  redirectUri: string;
}

/**
 * Documented adapter boundary for the production identity provider
 * (Amazon Cognito, federating Google and Apple, plus email magic-link).
 * This milestone does not assume Cognito credentials are available, so the
 * class implements the shape a real integration needs without performing
 * live token exchange:
 *
 *   1. `getAuthorizationUrl` builds the OAuth redirect to the Cognito
 *      hosted UI.
 *   2. `handleCallback` is where a real implementation would exchange the
 *      authorization code for tokens, validate the ID token's signature
 *      and claims against the user pool's JWKS, and then call
 *      `findOrCreateUserByProviderIdentity` (see `identity-mapping.ts`) to
 *      map the verified `sub` claim to an internal user.
 *   3. The resulting internal `userId` is handed to `SessionManager` to
 *      create a normal ReadyCircle session -- Cognito tokens are never
 *      stored in the browser or returned to the client.
 *
 * Wiring this up for real requires: registering COGNITO_* environment
 * variables (see `.env.example`), adding a JWT verification dependency
 * (e.g. `aws-jwt-verify`), and implementing the code exchange call against
 * the Cognito token endpoint.
 */
export class CognitoAuthProvider {
  readonly name = 'cognito' as const;

  constructor(private readonly config: CognitoAuthProviderConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.userPoolId && this.config.clientId && this.config.domain && this.config.redirectUri);
  }

  getAuthorizationUrl(state: string): string {
    if (!this.isConfigured()) {
      throw new Error('Cognito is not configured in this environment.');
    }
    const url = new URL(`https://${this.config.domain}/oauth2/authorize`);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async handleCallback(_params: { code: string; state: string }): Promise<{ userId: string }> {
    throw new Error(
      'Cognito callback handling is not implemented in this milestone. See the class documentation in ' +
        'cognito-auth-provider.ts and docs/decisions/0007-development-authentication-boundary.md for the ' +
        'integration steps required before enabling this in production.',
    );
  }
}
