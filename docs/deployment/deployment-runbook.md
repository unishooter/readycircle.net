# Deployment runbook

This describes how ReadyCircle.net is deployed onto the existing AWS
infrastructure. It documents and targets that infrastructure -- it does not
provision it. There is no Terraform or other IaC in this repository; the
assets under `infrastructure/` are configuration files and a shell script
meant to be applied to instances that already exist.

## Assumed AWS architecture

- **Route 53** resolves `readycircle.net` / `www.readycircle.net` to an
  **Application Load Balancer (ALB)**.
- The **ALB** terminates TLS and forwards HTTP to instances in an
  **EC2 Auto Scaling Group (ASG)**, setting `X-Forwarded-For` /
  `X-Forwarded-Proto`.
- Each instance runs **Nginx** (serves the built web app, reverse-proxies
  `/api/` and `/health/` to the local Fastify API on port 3000) and two
  **systemd** services (`readycircle-api`, `readycircle-worker`).
- **RDS PostgreSQL** (with the PostGIS extension enabled) is the primary
  datastore. In production the API, worker, and `deploy.sh` migrations
  resolve credentials from the **RDS-managed Secrets Manager secret** via
  `DATABASE_SECRET_ARN` (in-process at connection time, not baked into a
  password URL). Local/dev still uses `DATABASE_URL`.
- **S3** stores generated documents (plans, PDFs). **SQS** carries
  plan-generation and document-generation jobs from the API to the worker.
- **Secrets Manager** / **SSM Parameter Store** holds the RDS DB secret
  (referenced by `DATABASE_SECRET_ARN`), plus `SESSION_SECRET`, the Cognito
  credentials (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`,
  `COGNITO_CLIENT_SECRET`, `COGNITO_DOMAIN`, `COGNITO_REDIRECT_URI` -- see
  [cognito-google-setup.md](./cognito-google-setup.md) for how these are
  obtained), and `OPENAI_API_KEY` (AI plan generation); `packages/config`
  refuses to start the API in production if any are missing. Non-DB secrets
  are still rendered into `/etc/readycircle/api.env` and
  `/etc/readycircle/worker.env` by whatever provisioning/config-management
  tooling manages the ASG launch template -- that step is outside this
  repo's scope. The DB password itself should **not** live in those files.
- **CloudWatch** collects logs (via the CloudWatch agent tailing journald
  output, since both services log structured JSON to stdout/journald) and
  metrics/alarms.
- **IAM** instance roles grant the EC2 instances least-privilege access to
  the specific S3 bucket, SQS queues, and Secrets Manager secrets they need
  (see `packages/aws` for the exact AWS SDK calls made). For the RDS
  secret this must include `secretsmanager:GetSecretValue` on that secret
  ARN (and `kms:Decrypt` if the secret is encrypted with a customer-managed
  KMS key).

## No SSH -- use Systems Manager Session Manager

Instances are not expected to have a public SSH surface. All operational
access (log inspection, running `deploy.sh`, restarting services) happens
through **AWS Systems Manager Session Manager**:

```bash
aws ssm start-session --target <instance-id>
```

Once connected, commands below run in that shell as if it were an SSH
session -- there's no `ssh` step to add.

## One-time host setup (per instance, or baked into the AMI/launch template)

Steps 4 and 5 below reference files under `infrastructure/` (systemd units,
the Nginx site config). These are deliberately **not** part of the release
tarball described later in this doc -- that tarball only carries the
built app (`apps/*/dist`), since host/service configuration is meant to be
a rare, one-time change, not something that gets re-copied on every
deploy. That means `infrastructure/` has to land on the instance
separately, once, before running steps 4-5. Two ways to do that:

```bash
# Option A: clone the repo directly onto the instance (needs git and,
# if this is a private repo, credentials configured on the instance).
# `git` is often not preinstalled -- if `git clone` isn't found:
#   Ubuntu/Debian: sudo apt-get install -y git
#   Amazon Linux 2023: sudo dnf install -y git
git clone https://github.com/unishooter/readycircle.net.git /tmp/readycircle-repo
cd /tmp/readycircle-repo

# Option B: upload just the infrastructure/ folder via S3, from your
# local machine, then pull it down inside the SSM session -- avoids
# needing git credentials on the instance at all
#   (local)    tar -czf infrastructure.tar.gz infrastructure/
#              aws s3 cp infrastructure.tar.gz s3://<your-deploy-bucket>/infrastructure.tar.gz
#   (instance) aws s3 cp s3://<your-deploy-bucket>/infrastructure.tar.gz /tmp/infrastructure.tar.gz
#              mkdir -p /tmp/readycircle-repo && tar -xzf /tmp/infrastructure.tar.gz -C /tmp/readycircle-repo
#              cd /tmp/readycircle-repo
```

Run steps 4 and 5's `cp` commands from whichever directory you used above
(they use paths relative to the repo root).

1. Create the service user and directories:
   ```bash
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin readycircle
   sudo mkdir -p /opt/readycircle/releases /etc/readycircle /var/log/readycircle
   sudo chown -R readycircle:readycircle /opt/readycircle /var/log/readycircle
   sudo chmod 700 /etc/readycircle
   ```
2. Install Node.js 20.x and `pnpm` on the instance/AMI. This repo doesn't
   assume a specific base image; use whichever matches yours:
   ```bash
   # Ubuntu / Debian
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Amazon Linux 2023
   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
   sudo dnf install -y nodejs
   ```
   Then, on either, install pnpm as a true global package via npm --
   **not** `corepack prepare`, which pins the version into whichever
   user's corepack cache runs the `prepare` command (typically root's,
   via `sudo`), but is invisible to any other user (e.g. `ssm-user`) who
   later runs `pnpm` -- that user's corepack then silently fetches
   "latest" instead of the pinned version, which can be incompatible with
   the installed Node version entirely (confirmed live: corepack grabbed
   pnpm 11 under `ssm-user`, which requires Node 22+, on a Node 20 host):
   ```bash
   sudo npm install -g pnpm@9.15.4
   ```
   (pinned to match `package.json#packageManager`). Verify with `node -v`
   and `pnpm -v` as the **same user** that will actually run `pnpm
   install`/`pnpm build` later, not just as root.

   If building on the instance itself (rather than in CI) on a small
   instance type, add swap first -- a monorepo `pnpm install` + build can
   exceed available memory on e.g. a `t3.small`, and there's no swap by
   default:
   ```bash
   sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```
3. Populate `/etc/readycircle/api.env` and `/etc/readycircle/worker.env`
   (root-owned, mode `0600`) with the environment variables from
   `.env.example`, sourced from Secrets Manager / SSM Parameter Store.
   **Both files should contain the same values.** Include
   `DATABASE_SECRET_ARN` (the RDS-managed secret ARN) and `AWS_REGION`;
   do **not** put a password-bearing `DATABASE_URL` in production -- the
   app fetches username/password from Secrets Manager at connection time.
   Confirm the instance role can read that secret
   (`aws secretsmanager get-secret-value --secret-id "$DATABASE_SECRET_ARN"`).
   `apps/worker` calls the same shared `loadConfig()` as `apps/api`, so the
   same production-required checklist (`DATABASE_SECRET_ARN`,
   `SESSION_SECRET`, the three `AWS_S3_*`/`AWS_SQS_*` variables, all five
   `COGNITO_*` variables, and `OPENAI_API_KEY`) applies to both -- the
   worker refuses to start without them even though it doesn't functionally
   use most of them (no sessions, no sign-in). `NODE_ENV`/`APP_ENV` must
   both be `production`; `APP_BASE_URL` and `API_PORT` are unused by the
   worker but harmless to include for consistency. Without a
   `sudoedit`/editor session handy, write a file non-interactively with:
   ```bash
   sudo tee /etc/readycircle/api.env > /dev/null << 'EOF'
   NODE_ENV=production
   APP_ENV=production
   ...
   EOF
   sudo chmod 600 /etc/readycircle/api.env /etc/readycircle/worker.env
   sudo chown root:root /etc/readycircle/api.env /etc/readycircle/worker.env
   ```
4. Install the systemd units:
   ```bash
   sudo cp infrastructure/systemd/readycircle-api.service /etc/systemd/system/
   sudo cp infrastructure/systemd/readycircle-worker.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable readycircle-api readycircle-worker
   ```
5. Install Nginx if it isn't already present, then install the site
   config. Both the package name/install step and the site-config
   location depend on your AMI's distro convention:
   ```bash
   # Ubuntu / Debian (skip if `nginx -v` already works)
   sudo apt-get install -y nginx

   # Amazon Linux 2023 (skip if `nginx -v` already works)
   sudo dnf install -y nginx
   sudo systemctl enable nginx
   ```
   ```bash
   # Ubuntu / Debian: uses the sites-available/sites-enabled convention
   sudo cp infrastructure/nginx/readycircle.conf /etc/nginx/sites-available/readycircle.conf
   sudo ln -s /etc/nginx/sites-available/readycircle.conf /etc/nginx/sites-enabled/readycircle.conf

   # Amazon Linux 2023: no sites-available/sites-enabled -- conf.d is
   # already included by the stock nginx.conf, no symlink step needed
   sudo cp infrastructure/nginx/readycircle.conf /etc/nginx/conf.d/readycircle.conf
   ```
   Then, on either:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
   A `conflicting server name "_" on 0.0.0.0:80, ignored` warning from
   `nginx -t` is expected on some AMIs' stock config (a pre-existing
   default catch-all server block, unrelated to this site config) and is
   safe to ignore -- `server_name readycircle.net www.readycircle.net;`
   is more specific and takes precedence for matching requests regardless.
6. Point the ALB target group's health check at `/nginx-health` (fast, does
   not depend on the API or database) or `/health/ready` (also verifies the
   database, at the cost of the ALB health check depending on RDS).

## Deploying a new release

There's no CI pipeline yet (see
[production-followups.md](./production-followups.md#4-no-ci-pipeline----deploys-are-entirely-manual-right-now)),
so releases are built directly on the instance from a git checkout rather
than from a CI-produced tarball. `infrastructure/deployment/deploy.sh`
automates this end to end -- it's the standard way to deploy, not just a
helper script for some other manual process.

1. Start (or reuse) an SSM session on the instance, and make sure
   `/tmp/readycircle-repo` (or wherever you cloned it -- see "One-time host
   setup" above) exists and is a git working tree with the `origin` remote
   already configured. `deploy.sh` itself does the `git pull`, so you don't
   need to pull by hand first.
2. Run the deploy script as root, from inside that checkout (it needs to
   read itself from `infrastructure/deployment/deploy.sh` relative to the
   repo root):
   ```bash
   cd /tmp/readycircle-repo
   sudo infrastructure/deployment/deploy.sh
   ```
   Or, from anywhere, pass the checkout path explicitly:
   ```bash
   sudo /tmp/readycircle-repo/infrastructure/deployment/deploy.sh /tmp/readycircle-repo
   ```
3. What it does, in order: `git pull` + `pnpm install` + `pnpm build`
   inside the checkout (running as whichever user already owns that
   directory, not root, so root doesn't leave root-owned files behind in a
   checkout someone else needs to keep using) &rarr; copies the freshly
   built tree into a new `/opt/readycircle/releases/manual-<UTC
   timestamp>` directory &rarr; **runs database migrations as an explicit
   step before touching anything currently running** &rarr; swaps the
   `/opt/readycircle/current` symlink &rarr; restarts both systemd units
   &rarr; reloads Nginx &rarr; polls `GET /health/ready` until it returns
   `200` &rarr; double-checks that Nginx is actually serving the JS bundle
   this exact run just built (not some stale previous one -- see "Why the
   sanity check" in the script's header comment for why that check exists)
   &rarr; prunes old release directories, keeping the 5 most recent.
   Fails loudly with a non-zero exit code at any step, in which case the
   previous release is untouched and still running (see "Rollback" below).
4. If there's ever more than one instance in the ASG at once, repeat this
   per instance (or drive it from orchestration tooling) -- this script is
   intentionally a single idempotent unit of work for one instance, not a
   fleet-wide orchestrator.

### Release-specific step: RDS Secrets Manager DB credentials

Cut over production from a static `DATABASE_URL` password to the
RDS-managed Secrets Manager secret (required once this build is live --
`APP_ENV=production` refuses to start without `DATABASE_SECRET_ARN`):

1. Put `DATABASE_SECRET_ARN=<rds-managed-secret-arn>` in **both**
   `/etc/readycircle/api.env` and `/etc/readycircle/worker.env`. Keep
   `AWS_REGION` set to the region that holds the secret.
2. Remove or blank the password-bearing `DATABASE_URL` line in both files
   (when the ARN is set the app ignores `DATABASE_URL` anyway).
3. Confirm the EC2 instance role can read the secret:
   ```bash
   aws secretsmanager get-secret-value --secret-id "$DATABASE_SECRET_ARN" --query ARN --output text
   ```
   If this fails with `AccessDenied`, attach
   `secretsmanager:GetSecretValue` on that ARN (and `kms:Decrypt` if the
   secret uses a CMK) to the instance role before restarting services.
4. Restart API/worker (or run `deploy.sh`, which also migrates using the
   same ARN from `api.env`):
   ```bash
   sudo systemctl restart readycircle-api readycircle-worker
   curl -sS http://127.0.0.1:3000/health/ready
   curl -sS http://127.0.0.1:3000/api/v1/session
   ```
5. Optionally enable or confirm RDS managed password rotation for that
   secret -- the app caches the password briefly and invalidates + retries
   once on `password authentication failed`, so rotation should not require
   a process restart.

### Release-specific step: AI plan generation (first deploy that includes it)

The plan-generation feature added new required production configuration.
Before deploying a build that includes it:

1. Add `OPENAI_API_KEY=<key>` to **both** `/etc/readycircle/api.env` and
   `/etc/readycircle/worker.env` (the shared config loader requires it in
   production for both processes). Optionally set `OPENAI_MODEL` (defaults
   to `gpt-5.6-terra`).
2. Verify the `AWS_SQS_PLAN_QUEUE_URL` and `AWS_SQS_DOCUMENT_QUEUE_URL`
   values in both env files point at real queues, and that the instance
   IAM role can `sqs:SendMessage` (API) and
   `sqs:ReceiveMessage`/`sqs:DeleteMessage` (worker) on them. Quick check
   from the instance:
   ```bash
   aws sqs get-queue-attributes --queue-url "<AWS_SQS_PLAN_QUEUE_URL>" --attribute-names QueueArn
   ```
   If the queue URLs are left **blank**, the API silently falls back to
   running plan/document generation in-process (the local-development
   path). That works, but the AI call and PDF rendering then happen inside
   the API service instead of the worker -- acceptable as a stopgap, not
   the intended production shape.
3. Verify `AWS_S3_DOCUMENT_BUCKET` names a bucket the instance role can
   `s3:PutObject`/`s3:GetObject` on; rendered plan PDFs are stored there
   under `plans/<planId>/version-<n>.pdf`.
4. After the deploy, generate a plan in the UI end to end (generate →
   publish → download PDF) and watch
   `journalctl -u readycircle-worker -f` for the `plan.generate` /
   `document.generate` job logs.

### Release-specific step: repeater import (first deploy that includes it)

The repeater directory works with no new configuration -- manual entry is
always available. To enable the "Find repeaters near this Circle" import,
request a free application token from RepeaterBook
(https://www.repeaterbook.com/wiki/doku.php?id=api) and add
`REPEATERBOOK_APP_TOKEN=<token>` to `/etc/readycircle/api.env` (the import
proxy runs in the API process only; adding it to `worker.env` is harmless
but unused). The variable is **optional in all environments**: when it is
blank, the import UI reports "not configured" and everything else works.
The API caches whole-state exports in memory for 24 hours per
state + service and enforces a 5-second gap between upstream calls, per
RepeaterBook's usage policy. See
[ADR 12](../decisions/0012-repeaters-gear-check-scenarios.md).

### Release-specific step: invite-only access and admin panel (first deploy that includes it)

This migration (`0008_invite_only_access_and_admin`) grandfathers **every**
existing user into the new platform-wide admin role
(`UPDATE users SET is_admin = true`) -- there was no admin concept before
it, so this is the only way to avoid shipping a build with zero admins and
no way to promote one. No env var change is required: `INVITE_ONLY_ACCESS`
defaults to `false`, so sign-up stays open until an admin turns it on.

1. After `deploy.sh` runs the migration step, confirm the grandfather
   backfill actually ran as expected -- from the instance (or anywhere with
   `DATABASE_URL` set to the production connection string):
   ```bash
   psql "$DATABASE_URL" -c "select count(*) as total_users, count(*) filter (where is_admin) as admins from users;"
   ```
   `admins` should equal `total_users` immediately after this deploy (every
   pre-existing account was grandfathered in). It's expected to diverge
   later as new users sign up without the admin flag.
2. Sign in as one of the grandfathered accounts and confirm `/app/admin` is
   reachable and shows the user list -- this is the fastest way to verify
   the flag actually took effect for a real production account, not just
   in the database.
3. Decide whether to turn `INVITE_ONLY_ACCESS` on immediately or leave
   sign-up open for now; either way it's a runtime toggle from `/app/admin`
   afterward, not a redeploy. See
   [ADR 13](../decisions/0013-invite-only-access-and-admin-panel.md).

Once CI exists, the natural evolution is CI running `pnpm build`, packaging
a tarball, and pushing it to S3 -- with `deploy.sh` (or a sibling script)
pulling that tarball down instead of building in place. That's future
work, tracked in
[production-followups.md](./production-followups.md#4-no-ci-pipeline----deploys-are-entirely-manual-right-now);
this doc intentionally only documents the build-in-place flow that's
actually in use today.

## Rollback

Because the `current` symlink is only repointed after migrations succeed
and services restart, a failed deploy leaves the previous release running.
To roll back a release that *did* complete but is misbehaving:

```bash
sudo ln -sfn /opt/readycircle/releases/<previous-version> /opt/readycircle/current
sudo systemctl restart readycircle-api readycircle-worker
```

Note this does not reverse database migrations -- migrations in this
project are additive/backward-compatible by convention, so rolling back the
application code should not require rolling back the schema.

## Observability

- Both services log structured JSON (via `@readycircle/observability`) to
  stdout, which systemd/journald captures. Tail live logs with:
  ```bash
  journalctl -u readycircle-api -f
  journalctl -u readycircle-worker -f
  ```
- `GET /health/live` returns `200` as soon as the process is up (no
  dependency checks); `GET /health/ready` additionally checks the database
  connection and returns `503` if it fails.
