# 8. Cognito + Google as the production identity provider

## Status

Accepted

## Context

The application needs a real production sign-in flow, replacing the
`CognitoAuthProvider` stub described in earlier ADRs. The explicit goal is
the lowest possible friction to sign up, with "Continue with Google" as the
primary path, plus a fallback for people without (or unwilling to use) a
Google account.

Two broad approaches were considered:

1. **Amazon Cognito** (User Pool), federating Google, with Cognito's own
   username/password store as the fallback. Stays inside the AWS footprint
   this application already deploys onto (ADR 6), free up to 50k MAUs, and
   is what the schema (`user_identities`), contracts (`authProvider` enum),
   and the existing `CognitoAuthProvider` stub already assumed.
2. **Direct "Sign in with Google"** (Google Identity Services), bypassing
   Cognito entirely, verifying Google ID tokens ourselves.

Cognito was chosen: it avoids introducing a new vendor, fits the existing
AWS deployment model, and its Hosted UI / Managed Login gives us a
fully-built sign-up, email verification, and forgot-password flow for the
email fallback with no additional infrastructure (no Lambda triggers, no
custom password-reset emails to build or send).

The obvious downside of Cognito is friction: its Hosted UI normally shows
an AWS-branded picker screen before redirecting to an upstream identity
provider, which works against the "Google should feel instant" goal.

## Decision

- Use a Cognito User Pool with two enabled sign-in methods on one App
  Client: Google (federated) and Cognito's native username/password store.
- **Bypass Cognito's picker screen for Google** by calling
  `/oauth2/authorize` with `identity_provider=Google` directly from our own
  "Continue with Google" button (`GET /api/v1/auth/google`). The user goes
  straight from our button to Google's real consent screen; Cognito's own
  screen is only ever shown for the "Continue with email" path
  (`GET /api/v1/auth/login`), which needs its native sign-up/verification/
  forgot-password UI anyway.
- Use Authorization Code + PKCE even though the App Client is confidential
  (has a client secret) and the code exchange happens server-side, as
  defense-in-depth against authorization code interception. The transient
  `state`/`code_verifier` pair lives in a short-lived signed cookie
  (`rc_oauth_pending`), not server-side memory, since the API runs behind
  an ALB across multiple EC2 instances with no sticky sessions -- whichever
  instance handles the callback must be able to validate it unaided.
- Verify the ID token against the user pool's JWKS using `aws-jwt-verify`
  (the package the original stub's own documentation already named as the
  intended choice), rather than trusting anything from the client.
- Rename the planned `email_magic_link` provider value to `email_password`
  in `user_identities.provider` / the `authProvider` contract: the email
  fallback is Cognito-native username/password, not a magic link, because
  building magic-link email delivery ourselves (or wiring Cognito's
  passwordless feature) was judged not worth the extra infrastructure for
  v1. `apple` remains a placeholder value with no working sign-in path.
- **Link accounts by verified email**, not by any Cognito-side mechanism:
  `findOrCreateUserByProviderIdentity` (`packages/auth/src/identity-mapping.ts`)
  checks for an existing user with a matching *verified* email before
  creating a new one, so someone who signs up with Google and later uses
  "Continue with email" with the same address (or vice versa) ends up as
  one ReadyCircle account. An unverified email is never used for this
  lookup, and is never even stored on `users.email` (which is unique and
  otherwise only ever holds verified addresses) -- both to prevent account
  takeover via a spoofed address and to avoid a duplicate-email database
  error.
- Cognito credentials are required, not optional, in production
  (`packages/config`'s `loadConfig` now refuses to start without all five
  `COGNITO_*` variables when `APP_ENV=production`), mirroring how
  `DEV_AUTH_ENABLED` is already enforced (ADR 7).
- Logging out also redirects through Cognito's own hosted `/logout`
  endpoint (`GET /api/v1/auth/logout-redirect`), clearing its SSO session
  too -- otherwise clicking "Continue with Google" again after signing out
  could silently re-authenticate the same account with no prompt.

## Consequences

- Setting this up requires manual, one-time steps in the Google Cloud and
  AWS consoles (documented in
  [`docs/deployment/cognito-google-setup.md`](../deployment/cognito-google-setup.md))
  that cannot be scripted from this repository.
- Development authentication (ADR 7) is unaffected and can run alongside a
  configured Cognito integration locally -- `/login` shows both, since
  `devAuthEnabled` and `cognitoEnabled` are independent flags.
- Adding Apple or a passwordless email option later means adding another
  federated identity provider (Apple) or enabling Cognito's newer
  passwordless feature -- both are incremental to this design, not a
  rearchitecture, since every sign-in method already funnels through the
  same authorize/callback/JWKS-verification path.
- `CognitoAuthProvider` accepts an injectable ID-token verifier so its
  callback-handling logic (claim mapping, provider-label inference) can be
  unit-tested without a live user pool or network access; only the
  redirect-building and state-validation behavior of the actual API routes
  is covered by integration tests, not a real Cognito token exchange.
