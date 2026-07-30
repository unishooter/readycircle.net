import { createHash, randomBytes } from 'node:crypto';

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A random, unguessable value used to correlate an OAuth callback with the request that started it. */
export function generateState(): string {
  return base64url(randomBytes(32));
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generates an RFC 7636 PKCE pair. Used even though the Cognito app client
 * is confidential (has a client secret) as defense-in-depth against
 * authorization code interception -- Cognito supports PKCE alongside a
 * client secret without any extra configuration.
 */
export function generatePkcePair(): PkcePair {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}
