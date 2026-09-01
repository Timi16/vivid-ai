#!/usr/bin/env bash
# Runs on the EC2 box, piped in over SSH by .github/workflows/deploy-backend.yml.
# The workflow prepends the exports it needs: IMAGE_PREFIX, IMAGE_TAG,
# GHCR_USER, GHCR_TOKEN, DEPLOY_PATH.
#
# The contract: either the new release answers /v1/health, or the box goes
# back to the release that did. A deploy never leaves the stack in a state
# nobody chose.
set -euo pipefail

: "${IMAGE_PREFIX:?}" "${IMAGE_TAG:?}" "${GHCR_USER:?}" "${GHCR_TOKEN:?}" "${DEPLOY_PATH:?}"

COMPOSE_FILE=docker-compose.prod.yml
HEALTH_URL=http://127.0.0.1:8000/v1/health
HEALTH_ATTEMPTS=60      # 60 x 5s = five minutes, enough for a cold Postgres
HEALTH_INTERVAL=5

cd "$DEPLOY_PATH"

if [ ! -f .env ]; then
  echo "No $DEPLOY_PATH/.env on this box. Production secrets are kept here, not in CI." >&2
  exit 1
fi

# Compose v2 is a docker plugin; keep working on a box that still has v1.
if docker compose version >/dev/null 2>&1; then
  compose() { docker compose -f "$COMPOSE_FILE" "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose -f "$COMPOSE_FILE" "$@"; }
else
  echo "docker compose is not installed on this box." >&2
  exit 1
fi

health_ok() {
  curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1
}

wait_for_health() {
  local i
  for ((i = 1; i <= HEALTH_ATTEMPTS; i++)); do
    if health_ok; then
      echo "healthy after $((i * HEALTH_INTERVAL))s"
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

PREVIOUS_TAG="$(cat .deployed_tag 2>/dev/null || true)"
export IMAGE_PREFIX IMAGE_TAG

echo "==> Signing in to GHCR"
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
# Whatever happens next, do not leave registry credentials behind.
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

echo "==> Pulling $IMAGE_TAG"
compose pull

echo "==> Starting"
compose up -d --remove-orphans

echo "==> Waiting for the backend to answer $HEALTH_URL"
if wait_for_health; then
  echo "$IMAGE_TAG" > .deployed_tag
  # Keep the box's disk from filling with every release ever deployed. Images
  # still referenced by a container, including the previous tag we may need
  # for a rollback, are untouched.
  docker image prune -f >/dev/null 2>&1 || true
  echo "==> Deployed $IMAGE_TAG"
  compose ps
  exit 0
fi

echo "==> $IMAGE_TAG never became healthy. Recent backend logs:" >&2
compose logs --tail 60 backend >&2 || true

if [ -z "$PREVIOUS_TAG" ]; then
  echo "==> No previous release recorded, so there is nothing to roll back to." >&2
  echo "==> The stack is left running the failed release for inspection." >&2
  exit 1
fi

echo "==> Rolling back to $PREVIOUS_TAG" >&2
IMAGE_TAG="$PREVIOUS_TAG" compose up -d --remove-orphans
if wait_for_health; then
  echo "==> Rolled back to $PREVIOUS_TAG; production is healthy on the previous release." >&2
else
  echo "==> Rollback did not become healthy either. The box needs a human." >&2
fi
exit 1
