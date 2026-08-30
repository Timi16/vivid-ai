#!/usr/bin/env bash
# Rolls one image tag out on the instance. Run by the deploy job over SSH:
#
#   IMAGE_REPO=ghcr.io/<owner>/<repo> /opt/vivid/deploy.sh <tag>
#
# Pull, restart, wait for /v1/health, and put the previous tag back if the new
# one does not come up. The tag that is actually serving traffic is recorded in
# /opt/vivid/.image_tag, which is both the rollback source and the answer to
# "what is running right now".
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/vivid}"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8000/v1/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-45}"   # x2s = 90s, enough for init_db on a cold DB
HEALTH_DELAY=2

NEW_TAG="${1:-}"
if [ -z "$NEW_TAG" ]; then
    echo "usage: deploy.sh <image-tag>" >&2
    exit 2
fi

cd "$DEPLOY_DIR"

if [ ! -f app.env ]; then
    # Without it the backend would boot on config.py's defaults, including a
    # JWT_SECRET that is public in the repo.
    echo "FATAL: $DEPLOY_DIR/app.env is missing. See deploy/app.env.example." >&2
    exit 1
fi

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

wait_for_health() {
    local i
    for ((i = 1; i <= HEALTH_RETRIES; i++)); do
        if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
            return 0
        fi
        sleep "$HEALTH_DELAY"
    done
    return 1
}

PREV_TAG="$(cat .image_tag 2>/dev/null || true)"
echo "==> deploying $NEW_TAG (previous: ${PREV_TAG:-none})"

export IMAGE_TAG="$NEW_TAG"
compose pull
compose up -d --remove-orphans

if wait_for_health; then
    echo "$NEW_TAG" > .image_tag
    echo "==> healthy on $NEW_TAG"
    curl -fsS "$HEALTH_URL" || true
    echo
    # Keep a week of images so a rollback target is still on disk.
    docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
    exit 0
fi

echo "==> FAILED: $NEW_TAG did not become healthy in $((HEALTH_RETRIES * HEALTH_DELAY))s" >&2
compose logs --tail=80 backend >&2 || true

if [ -z "$PREV_TAG" ] || [ "$PREV_TAG" = "$NEW_TAG" ]; then
    echo "==> no previous tag to roll back to; leaving $NEW_TAG up for inspection" >&2
    exit 1
fi

echo "==> rolling back to $PREV_TAG" >&2
export IMAGE_TAG="$PREV_TAG"
compose up -d --remove-orphans
if wait_for_health; then
    echo "==> rolled back to $PREV_TAG; the deploy is still a failure" >&2
else
    echo "==> ROLLBACK IS ALSO UNHEALTHY. The instance needs a human." >&2
fi
exit 1
