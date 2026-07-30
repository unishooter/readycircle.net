#!/usr/bin/env bash
#
# ReadyCircle.net deployment script.
#
# Run on the target EC2 instance (via AWS Systems Manager Session Manager,
# not SSH) as part of the release process. Expects a release artifact -- a
# tarball produced by CI containing the built monorepo (apps/api/dist,
# apps/worker/dist, apps/web/dist, and every package's source, since
# workspace packages are bundled at build time but the tarball still needs
# each package.json for `pnpm install --prod` to resolve versions) -- to
# already be present on disk.
#
# Usage:
#   sudo ./deploy.sh <version> <path-to-release-tarball>
#
# Example:
#   sudo ./deploy.sh 2026.07.30-1 /tmp/readycircle-2026.07.30-1.tar.gz
#
# Exit codes: non-zero on any failure. This script intentionally does not
# attempt automatic rollback of the "current" symlink; because the symlink
# swap happens only after a successful health check, a failed deploy simply
# leaves the previous release running untouched.

set -euo pipefail

RELEASE_ROOT="/opt/readycircle/releases"
CURRENT_LINK="/opt/readycircle/current"
SERVICE_USER="readycircle"
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
  fail "this script must be run as root (it manages /opt/readycircle, systemd units, and nginx)"
fi

VERSION="${1:-}"
ARTIFACT_PATH="${2:-}"

if [[ -z "$VERSION" || -z "$ARTIFACT_PATH" ]]; then
  fail "usage: $0 <version> <path-to-release-tarball>"
fi

if [[ ! -f "$ARTIFACT_PATH" ]]; then
  fail "release artifact not found at $ARTIFACT_PATH"
fi

RELEASE_DIR="$RELEASE_ROOT/$VERSION"

log "Deploying version $VERSION from $ARTIFACT_PATH"

if [[ -d "$RELEASE_DIR" ]]; then
  fail "release directory $RELEASE_DIR already exists; refusing to overwrite (use a unique version)"
fi

mkdir -p "$RELEASE_DIR"
log "Extracting release artifact to $RELEASE_DIR"
tar -xzf "$ARTIFACT_PATH" -C "$RELEASE_DIR"

log "Installing production dependencies"
(
  cd "$RELEASE_DIR"
  # Workspace packages are bundled into apps/*/dist by the build step, so
  # this only needs to materialize real npm dependencies for api/worker.
  pnpm install --prod --frozen-lockfile --filter=./apps/api --filter=./apps/worker
)

log "Running database migrations"
(
  cd "$RELEASE_DIR"
  pnpm --filter @readycircle/database run migrate
) || fail "migration step failed; aborting before touching the running release"

chown -R "$SERVICE_USER:$SERVICE_USER" "$RELEASE_DIR"

log "Swapping current -> $RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK.new"
mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"

log "Restarting application services"
systemctl restart readycircle-api.service
systemctl restart readycircle-worker.service

log "Reloading nginx"
nginx -t || fail "nginx configuration test failed"
systemctl reload nginx

log "Waiting for /health/ready to return 200 (timeout ${HEALTH_TIMEOUT_SECONDS}s)"
elapsed=0
until curl --fail --silent --show-error "$HEALTH_URL" > /dev/null; do
  elapsed=$((elapsed + 2))
  if [[ "$elapsed" -ge "$HEALTH_TIMEOUT_SECONDS" ]]; then
    fail "$HEALTH_URL did not return 200 within ${HEALTH_TIMEOUT_SECONDS}s; deploy failed, previous release is still symlinked as $CURRENT_LINK until you point it back manually or redeploy"
  fi
  sleep 2
done

log "Health check passed. Deploy of $VERSION complete."

log "Pruning old releases (keeping the 5 most recent)"
# shellcheck disable=SC2012
ls -1dt "$RELEASE_ROOT"/*/ 2>/dev/null | tail -n +6 | xargs -r rm -rf

log "Done."
