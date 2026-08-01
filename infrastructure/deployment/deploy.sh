#!/usr/bin/env bash
#
# ReadyCircle.net deployment script -- "build in place" flow.
#
# There's no CI pipeline yet (see docs/deployment/production-followups.md,
# item 4), so releases are built directly on the target instance from a git
# checkout rather than from a CI-produced tarball. Run this on the EC2
# instance (via AWS Systems Manager Session Manager, not SSH), as root:
#
# Usage:
#   sudo ./deploy.sh [repo-dir]
#
# repo-dir defaults to /tmp/readycircle-repo (the one-time host setup's git
# clone target -- see "One-time host setup" in
# docs/deployment/deployment-runbook.md) and must be an existing git working
# tree with a remote configured.
#
# What this does, in order:
#   1. `git pull`, `pnpm install`, `pnpm build` inside repo-dir -- run as
#      whichever user already owns that directory, not root (see
#      run_as_owner below), so root doesn't leave root-owned files behind
#      in a checkout someone else needs to keep using.
#   2. Copies the freshly-built tree into a new release directory under
#      /opt/readycircle/releases, named from a per-second UTC timestamp.
#   3. Runs database migrations against the new release, as an explicit
#      step before touching anything currently running.
#   4. Swaps the /opt/readycircle/current symlink, restarts both systemd
#      services, reloads nginx.
#   5. Polls /health/ready, then double-checks that nginx is actually
#      serving the JS bundle the new release just built (see "Why the
#      sanity check" below) before declaring success.
#
# Exit codes: non-zero on any failure. This script intentionally does not
# attempt automatic rollback of the /opt/readycircle/current symlink;
# because the swap happens only after the release is built and migrated,
# a failure at any step before the swap leaves the previous release
# running untouched. A failure *after* the swap (health check / sanity
# check) leaves the new release live but flagged as broken in this
# script's output -- see "Rollback" in the deployment runbook to point
# `current` back at the prior release directory by hand.
#
# Why the per-second timestamp and existence check: an early version of
# this flow (run by hand, before this script existed) used a
# `manual-YYYY.MM.DD-N` version tag with no such check. A second same-day
# deploy reused a release directory that already existed from an earlier
# run, and `cp -r SRC DEST` silently *nests* SRC inside DEST when DEST
# already exists instead of overwriting its contents -- the fresh build
# landed one level too deep, and nginx kept serving the stale previous
# release with no error anywhere in the deploy output. A per-second
# timestamp makes a same-day collision effectively impossible; the
# existence check above and the sanity check near the end of this script
# exist so that if it somehow still happens, this script fails loudly
# instead of silently doing nothing.

set -euo pipefail

REPO_DIR="${1:-/tmp/readycircle-repo}"
RELEASE_ROOT="/opt/readycircle/releases"
CURRENT_LINK="/opt/readycircle/current"
SERVICE_USER="readycircle"
API_ENV_FILE="/etc/readycircle/api.env"
HEALTH_URL="http://127.0.0.1:3000/health/ready"
HEALTH_TIMEOUT_SECONDS=60

log() {
  echo "[deploy] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

if [[ $EUID -ne 0 ]]; then
  fail "this script must be run as root (it manages /opt/readycircle, systemd units, and nginx) -- try: sudo $0 $*"
fi

if [[ ! -d "$REPO_DIR/.git" ]]; then
  fail "$REPO_DIR is not a git working tree (expected $REPO_DIR/.git to exist) -- see \"One-time host setup\" in docs/deployment/deployment-runbook.md"
fi

REPO_OWNER="$(stat -c '%U' "$REPO_DIR")"
log "Building in place at $REPO_DIR (as user '$REPO_OWNER')"

run_as_owner() {
  sudo -u "$REPO_OWNER" -H bash -lc "cd '$REPO_DIR' && $1"
}

run_as_owner "git pull" || fail "git pull failed in $REPO_DIR"
run_as_owner "pnpm install" || fail "pnpm install failed in $REPO_DIR"
run_as_owner "pnpm build" || fail "pnpm build failed in $REPO_DIR"

VERSION="manual-$(date -u +'%Y.%m.%d-%H%M%S')"
RELEASE_DIR="$RELEASE_ROOT/$VERSION"

if [[ -e "$RELEASE_DIR" ]]; then
  fail "release directory $RELEASE_DIR already exists; refusing to continue (this should be practically impossible with a per-second timestamp -- check the system clock)"
fi

log "Copying $REPO_DIR -> $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
# The trailing "/." on the source copies REPO_DIR's *contents* into the
# already-created RELEASE_DIR, rather than copying REPO_DIR itself as a
# subdirectory inside it -- see the nesting-bug note at the top of this
# file. Combined with the existence check above, this makes that bug
# structurally impossible here.
cp -r "$REPO_DIR/." "$RELEASE_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$RELEASE_DIR"

log "Running database migrations"
(
  cd "$RELEASE_DIR"
  if [[ -f "$API_ENV_FILE" ]]; then
    # NOT `source`d: $API_ENV_FILE is written for systemd's
    # `EnvironmentFile=` directive, a plain `KEY=VALUE` format with no
    # shell quoting rules -- values like a DB password containing an
    # unescaped `)` are perfectly valid there but are a bash syntax error
    # if the file is `source`d as a script (confirmed live: migrations
    # failed on exactly this before this loop replaced a `source` here).
    # Reading line-by-line and exporting each KEY=VALUE literally, with no
    # shell evaluation of VALUE, works regardless of what characters the
    # value contains.
    while IFS= read -r env_line || [[ -n "$env_line" ]]; do
      [[ "$env_line" =~ ^[[:space:]]*(#.*)?$ ]] && continue
      [[ "$env_line" == *=* ]] || continue
      export "$env_line"
    done < "$API_ENV_FILE"
  else
    log "WARNING: $API_ENV_FILE not found; relying on DATABASE_URL already being in this shell's environment"
  fi
  pnpm --filter @readycircle/database run migrate
) || fail "migration step failed; aborting before touching the running release"

log "Swapping current -> $RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK.new"
mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"

log "Restarting application services"
systemctl restart readycircle-api.service
systemctl restart readycircle-worker.service

log "Reloading nginx"
nginx -t || fail "nginx configuration test failed"
systemctl reload nginx

log "Waiting for $HEALTH_URL to return 200 (timeout ${HEALTH_TIMEOUT_SECONDS}s)"
elapsed=0
until curl --fail --silent --show-error "$HEALTH_URL" > /dev/null; do
  elapsed=$((elapsed + 2))
  if [[ "$elapsed" -ge "$HEALTH_TIMEOUT_SECONDS" ]]; then
    fail "$HEALTH_URL did not return 200 within ${HEALTH_TIMEOUT_SECONDS}s; deploy failed, previous release is still symlinked as $CURRENT_LINK until you point it back manually or redeploy"
  fi
  sleep 2
done

# Why this sanity check: the health endpoint only proves the API process
# is up -- it says nothing about whether nginx is actually serving the web
# bundle this deploy just built (which is exactly what went silently wrong
# in the incident described at the top of this file). Comparing the asset
# hash nginx serves against the one just built catches that class of bug
# immediately instead of leaving it to be noticed later in a browser.
BUILT_ASSET="$(grep -o 'assets/index-[^"]*\.js' "$RELEASE_DIR/apps/web/dist/index.html" 2>/dev/null || echo "")"
SERVED_ASSET="$(curl --silent http://127.0.0.1/ | grep -o 'assets/index-[^"]*\.js' || echo "")"
if [[ -z "$BUILT_ASSET" || "$BUILT_ASSET" != "$SERVED_ASSET" ]]; then
  fail "sanity check failed: built asset ('$BUILT_ASSET') does not match what nginx is serving ('$SERVED_ASSET') -- current -> $RELEASE_DIR, but the deploy did not visibly take effect"
fi
log "Sanity check passed: nginx is serving the freshly built asset ($SERVED_ASSET)"

log "Health check passed. Deploy of $VERSION complete."

log "Pruning old releases (keeping the 5 most recent)"
# shellcheck disable=SC2012
ls -1dt "$RELEASE_ROOT"/*/ 2>/dev/null | tail -n +6 | xargs -r rm -rf

log "Done."
