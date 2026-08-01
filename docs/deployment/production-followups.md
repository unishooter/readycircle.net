# Production follow-ups

A running list of things discovered or deliberately deferred during the
first production deployment, that aren't blocking but shouldn't be
forgotten. Roughly ordered by priority. Cross-references point at where
the fuller context/reasoning already lives, rather than repeating it here.

Update this file as items get resolved or new ones come up -- delete
resolved items rather than just checking them off, so it stays a live
"what's left" list, not a growing changelog.

## High priority

### 1. One-time host setup doesn't survive an instance replacement
The Auto Scaling Group replaced an instance mid-setup during this very
deployment (an ELB health check failure triggered it), wiping out
everything done manually via SSM up to that point -- git clone, Node/
pnpm, systemd units, Nginx config, env files, all of it. Right now,
*any* instance replacement (health check flap, scaling event, spot
interruption, manual termination) puts a fresh instance into the ASG
with none of this setup applied, and no application will actually be
running on it.

**Fix**: bake the "One-time host setup" steps (see
[deployment-runbook.md](./deployment-runbook.md)) into either:
- a custom AMI (run the setup once, snapshot it, point the launch
  template at that AMI), or
- the launch template's EC2 user-data script (runs automatically on
  every boot).

Either way, env files (`api.env`/`worker.env`) should be rendered from
Secrets Manager at boot rather than expected to already exist on the
AMI -- which ties into item 2.

### 2. Env vars are hand-typed flat files, not Secrets Manager
Deliberately deferred to get the first deployment unblocked (see the
"got .env for now, move to secrets mgr later" decision). `SESSION_SECRET`,
`DATABASE_URL`, and the `COGNITO_*` values currently live in
`/etc/readycircle/api.env` / `worker.env` as plaintext, populated by hand.

**Fix**: a deploy-time bootstrap script that calls
`aws secretsmanager get-secret-value` for each secret and renders the
result into the env files, replacing the manual `sudoedit`/`sudo tee`
step. No application code changes needed for this (an
`@readycircle/aws` helper for this already exists but is unused --
`getSecretString` in
[`packages/aws/src/secrets-manager.ts`](../../packages/aws/src/secrets-manager.ts)
-- though a bootstrap script is simpler than wiring Secrets Manager
calls into app startup itself).

## Medium priority

### 3. AWS_S3_DOCUMENT_BUCKET / AWS_SQS_*_QUEUE_URL are still placeholder text
`/etc/readycircle/api.env` and `worker.env` have literal `<your bucket>`
/ `<your queue url>` text on these lines -- never replaced with real
resource identifiers. This doesn't block the API or worker from
*starting* (the production config check only requires non-empty
values), but the worker will try to actually poll SQS using the literal
placeholder string, which will fail against the real AWS API and spam
errors into its logs. Not urgent since `apps/worker`'s job handlers are
currently no-op placeholders anyway (see README's "Known limitations"),
but should be resolved before real plan/document generation is built.

### 4. No CI pipeline -- deploying still requires a human in an SSM session
`infrastructure/deployment/deploy.sh` now automates the full build-in-place
flow end to end (`git pull`, `pnpm install`/`build`, release cutover,
migrate, restart, reload, health check, and a sanity check that Nginx is
actually serving the bundle that was just built -- see the script's header
comment for why that last check exists). What's still missing is anything
that *triggers* it automatically: someone has to start an SSM session and
run `sudo infrastructure/deployment/deploy.sh` by hand for every deploy.

**Fix**: set up actual CI (GitHub Actions is the natural choice given the
repo's already on GitHub). The likely end state is CI running `pnpm build`,
packaging a tarball, and pushing it to S3, with a tarball-consuming
variant of `deploy.sh` (or a sibling script) replacing today's build-in-
place approach -- but even a much smaller first step, like a GitHub Actions
workflow that just SSMs in and runs today's `deploy.sh` on `push` to
`master`, would remove the remaining manual step.

## Low priority / cosmetic

### 5. Google's OAuth consent screen shows the raw Cognito domain
`https://readycircle.net/login` → "Continue with Google" currently
shows `us-east-1ksmbd4heg.auth.us-east-1.amazoncognito.com` on Google's
consent screen instead of a branded name, because that's the Google
OAuth client's actual registered redirect domain (the plain
AWS-provided Cognito domain, not a custom one).

**Fix, two layers**:
1. Free/quick: set the "App name" (and logo, homepage, privacy policy,
   ToS links) in Google Cloud Console's OAuth consent screen config, if
   not already done.
2. If that's not enough on its own: set up a custom Cognito domain
   (e.g. `auth.readycircle.net`, needs an ACM cert in us-east-1 + a DNS
   record -- this is exactly the "custom domain" path deferred during
   initial Cognito setup in favor of the plain Cognito domain, see
   [cognito-google-setup.md](./cognito-google-setup.md)), then update
   the Google OAuth client's redirect URI and `COGNITO_DOMAIN` to
   match.

### 6. Confirm Google OAuth app's publishing status
Worth double-checking in Google Cloud Console → OAuth consent screen:
if the app is still in **Testing** mode (not verified/published), only
pre-approved test-user Google accounts can actually complete
"Continue with Google" -- real users outside that test list would be
blocked. Moving to production/verified status (a separate Google
process, with its own requirements once you request scopes beyond the
basic ones already used here) is needed before this is usable by the
general public.

### 7. Apple sign-in / passwordless email
Already tracked in [ADR 0008](../decisions/0008-cognito-google-oauth.md)
and the README's "Next milestone" section -- not repeated here in
detail, just cross-referenced so this file is a complete index of
what's outstanding.
