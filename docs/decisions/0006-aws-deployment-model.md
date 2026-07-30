# 6. Target the existing AWS deployment model, not a new one

## Status

Accepted

## Context

ReadyCircle.net is deploying onto AWS infrastructure that already exists
(Route 53, an Application Load Balancer, an EC2 Auto Scaling Group, RDS
PostgreSQL) rather than infrastructure this project provisions from
scratch. There is no Terraform or other infrastructure-as-code in this
repository, and introducing a new deployment paradigm (containers on ECS,
a serverless architecture, etc.) would mean throwing away that existing
investment for no product benefit at this stage.

## Decision

Target the existing model exactly: Nginx and systemd running directly on
EC2 instances behind the ALB, with the API and worker as long-running Node
processes managed by systemd (not containers). `infrastructure/` contains
configuration *for* that existing setup (`nginx/readycircle.conf`,
`systemd/readycircle-api.service`, `systemd/readycircle-worker.service`,
`deployment/deploy.sh`) -- it describes and targets the infrastructure, it
does not provision it.

## Consequences

- No container runtime, image registry, or orchestrator is required on the
  deployment path; `deploy.sh` extracts a release tarball, installs
  production npm dependencies with `pnpm`, and restarts systemd units
  directly.
- Operational access goes through **AWS Systems Manager Session Manager**,
  not SSH, matching the existing instance access model (see
  `docs/deployment/deployment-runbook.md`).
- Zero-downtime deploys rely on the `current` symlink + service restart
  pattern rather than a rolling container deployment; a brief restart
  window on each instance is expected and acceptable given the existing
  ASG already handles instance-level redundancy.
- Because there's no IaC in this repo, any change to the actual AWS
  resources (security groups, target group health-check paths, IAM policy
  attached to the instance role, etc.) has to be made through whatever
  process already manages that infrastructure -- this repo only documents
  what those resources are expected to look like from the application's
  side.
