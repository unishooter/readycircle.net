# Cognito + Google sign-in setup

Production sign-in (`apps/api/src/modules/auth/routes.ts`) is built against
Amazon Cognito, with Google configured as a federated identity provider and
Cognito's own username/password store as the email fallback. None of this
can be provisioned automatically from this repository -- it requires
interactive steps in the Google Cloud and AWS consoles under accounts this
codebase has no access to. This document is what you need to do manually,
and what to hand back so the code can use it.

Once you've completed this, you'll have five values for `.env` (local) or
your production secrets store (see the
[deployment runbook](./deployment-runbook.md)):

```
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_CLIENT_SECRET=
COGNITO_DOMAIN=
COGNITO_REDIRECT_URI=
```

## 1. Google Cloud: OAuth client

1. In the [Google Cloud Console](https://console.cloud.google.com/), create
   (or reuse) a project for ReadyCircle.
2. Configure the **OAuth consent screen** (APIs & Services → OAuth consent
   screen): External user type, app name "ReadyCircle", support email, and
   the `email`/`profile`/`openid` scopes (these are the defaults).
3. Create an **OAuth client ID** (APIs & Services → Credentials → Create
   Credentials → OAuth client ID):
   - Application type: **Web application**.
   - Authorized redirect URI: `https://<your-cognito-domain>/oauth2/idpresponse`
     (you'll get the exact domain in step 2 below -- come back and add this
     once you have it; Google requires the URI to already resolve to a real
     Cognito domain format, but it doesn't have to be live yet).
4. Save the generated **Client ID** and **Client secret** -- Cognito needs
   these in step 3, not this application's own environment variables. This
   app's backend never talks to Google directly; Cognito does that on its
   behalf.

## 2. Amazon Cognito: User Pool

In the AWS Console (or `aws cognito-idp` CLI, if you prefer):

1. **Create a User Pool**:
   - Sign-in identifiers: **Email**.
   - Password policy: your preference (Cognito's defaults are reasonable).
   - MFA: optional, off is fine to start.
   - Required attributes: `email`, `name`.
2. **Set up a domain** (User Pool → App integration → Domain): either a
   Cognito-provided domain (`https://<prefix>.auth.<region>.amazoncognito.com`)
   or a custom domain under `readycircle.net` for a fully-branded experience
   later. The plain Cognito domain is fine to start with.
3. **Create an App Client** (User Pool → App integration → App clients):
   - **Confidential client** (generate a client secret) -- the OAuth code
     exchange happens server-side in `apps/api`, never in the browser, so a
     client secret is safe to hold and more secure than a public client.
   - Authentication flows: enable **Authorization code grant**.
   - OAuth scopes: `openid`, `email`, `profile`.
   - Callback URL(s): add both
     `http://localhost:3000/api/v1/auth/callback` (local dev) and your
     production callback, e.g. `https://readycircle.net/api/v1/auth/callback`.
   - Sign-out URL(s): the **web app's** origin (`APP_BASE_URL`), not
     necessarily the API's -- e.g. `http://localhost:5173` for local dev
     (Vite and the API run on different ports there) and
     `https://readycircle.net` in production (where Nginx unifies both
     onto one origin).
4. **Add Google as an Identity Provider** (User Pool → Sign-in experience →
   Federated identity provider sign-in → Add identity provider → Google):
   - Paste the Google **Client ID** and **Client secret** from step 1.
   - Authorized scopes: `profile email openid`.
   - Attribute mapping: map Google's `email` → Cognito `email`, `name` →
     Cognito `name`, `sub` → Cognito `username`.
5. Go back to the **App Client** and enable **Google** as an allowed
   identity provider alongside **Cognito user pool** (the native
   username/password store) -- both need to be checked.
6. Now that you have the real Cognito domain, go back to the Google Cloud
   Console (step 1.3) and set the authorized redirect URI to
   `https://<your-cognito-domain>/oauth2/idpresponse`.

### A note on account linking

This app links accounts by *verified* email in its own database (see
`findOrCreateUserByProviderIdentity` in
[`packages/auth/src/identity-mapping.ts`](../../packages/auth/src/identity-mapping.ts)),
so someone who signs up with Google and later uses "Continue with email"
(or vice versa) with the same address ends up as one ReadyCircle account.
This is handled entirely in this application's code, not in Cognito, so no
additional Cognito-side account-linking configuration (e.g. a pre-sign-up
Lambda trigger) is required.

## 3. Populate environment variables

From the values above:

| Variable | Where to find it |
|---|---|
| `COGNITO_USER_POOL_ID` | User Pool → General settings (e.g. `us-east-1_AbCdEfGhI`) |
| `COGNITO_CLIENT_ID` | App client → App client information |
| `COGNITO_CLIENT_SECRET` | App client → App client information → Show client secret |
| `COGNITO_DOMAIN` | App integration → Domain (just the host, no `https://`, e.g. `readycircle.auth.us-east-1.amazoncognito.com`) |
| `COGNITO_REDIRECT_URI` | The exact callback URL registered on the app client for this environment |

Local development: add these to your `.env` file (copied from
`.env.example`). Once all five are set, restart `pnpm dev` -- `/login` will
show "Continue with Google" and "Continue with email" alongside (or instead
of, in production) the development sign-in panel.

Production: populate these into whatever renders
`/etc/readycircle/api.env` from Secrets Manager / SSM Parameter Store (see
the [deployment runbook](./deployment-runbook.md)). `packages/config`
refuses to start the API in production if any of these five are missing.

## 4. Verify end-to-end

1. Visit `/login`. Click **Continue with Google** -- you should land
   directly on Google's real consent screen (no intermediate Cognito page),
   then get redirected back into the app, signed in.
2. Click **Continue with email** -- you should land on Cognito's hosted
   sign-up/sign-in form. Create an account there; Cognito handles
   verification-code delivery and the forgot-password flow itself.
3. Sign out, then sign back in with Google -- you should return to the same
   ReadyCircle account (check `apps/web`'s Account page, or the `authProvider`
   field on `GET /api/v1/session`).
