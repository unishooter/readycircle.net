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
  datastore. `DATABASE_URL` points at it.
- **S3** stores generated documents (plans, PDFs). **SQS** carries
  plan-generation and document-generation jobs from the API to the worker.
- **Secrets Manager** / **SSM Parameter Store** holds `SESSION_SECRET`,
  `DATABASE_URL`, Cognito credentials, etc. These are rendered into
  `/etc/readycircle/api.env` and `/etc/readycircle/worker.env` by whatever
  provisioning/config-management tooling manages the ASG launch template --
  that step is outside this repo's scope.
- **CloudWatch** collects logs (via the CloudWatch agent tailing journald
  output, since both services log structured JSON to stdout/journald) and
  metrics/alarms.
- **IAM** instance roles grant the EC2 instances least-privilege access to
  the specific S3 bucket, SQS queues, and Secrets Manager secrets they need
  (see `packages/aws` for the exact AWS SDK calls made).

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

1. Create the service user and directories:
   ```bash
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin readycircle
   sudo mkdir -p /opt/readycircle/releases /etc/readycircle /var/log/readycircle
   sudo chown -R readycircle:readycircle /opt/readycircle /var/log/readycircle
   sudo chmod 700 /etc/readycircle
   ```
2. Install Node.js 20.x and `pnpm` (via corepack) on the instance/AMI.
3. Populate `/etc/readycircle/api.env` and `/etc/readycircle/worker.env`
   (root-owned, mode `0600`) with the environment variables from
   `.env.example`, sourced from Secrets Manager / SSM Parameter Store.
4. Install the systemd units:
   ```bash
   sudo cp infrastructure/systemd/readycircle-api.service /etc/systemd/system/
   sudo cp infrastructure/systemd/readycircle-worker.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable readycircle-api readycircle-worker
   ```
5. Install the Nginx site:
   ```bash
   sudo cp infrastructure/nginx/readycircle.conf /etc/nginx/sites-available/readycircle.conf
   sudo ln -s /etc/nginx/sites-available/readycircle.conf /etc/nginx/sites-enabled/readycircle.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```
6. Point the ALB target group's health check at `/nginx-health` (fast, does
   not depend on the API or database) or `/health/ready` (also verifies the
   database, at the cost of the ALB health check depending on RDS).

## Deploying a new release

1. CI builds the monorepo (`pnpm build`) and packages a tarball containing
   `apps/*/dist`, every `package.json` in the workspace (so `pnpm install
   --prod` can resolve real npm dependencies), `pnpm-lock.yaml`, and
   `pnpm-workspace.yaml`.
2. Upload the tarball to the instance (e.g. via S3 + `aws s3 cp` from within
   the SSM session, since there's no direct file transfer over Session
   Manager).
3. Run the deploy script as root:
   ```bash
   sudo infrastructure/deployment/deploy.sh <version> /path/to/readycircle-<version>.tar.gz
   ```
   This extracts the release to `/opt/readycircle/releases/<version>`,
   installs production dependencies, **runs database migrations as an
   explicit step before touching the running services**, swaps the
   `/opt/readycircle/current` symlink, restarts both systemd units, reloads
   Nginx, and polls `GET /health/ready` until it returns `200` (failing
   loudly, with a non-zero exit code, if it doesn't within 60 seconds).
4. Repeat per-instance across the ASG (or drive this from your existing
   deployment/orchestration tooling -- this script is intentionally a single
   idempotent unit of work for one instance, not a fleet-wide orchestrator).

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
