#!/usr/bin/env bash
# Local SonarQube static audit.
#
# First run only:
#   1. ./scripts/sonar-audit.sh --server   (then wait for http://localhost:9000)
#   2. Log in (admin/admin), update the password, and create a project token
#      under My Account > Security.
#   3. export SONAR_TOKEN=<that token>
# Then run the full audit:
#   ./scripts/sonar-audit.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running." >&2
  exit 1
fi

docker compose up -d sonarqube

if [[ "${1:-}" == "--server" ]]; then
  echo "SonarQube starting at http://localhost:9000 (first boot takes a few minutes)."
  exit 0
fi

until curl -sf http://localhost:9000/api/system/status | grep -q '"status":"UP"'; do
  echo "Waiting for SonarQube…"
  sleep 3
done

pnpm --filter @tasuketejs/core test:coverage

SONAR_TOKEN="${SONAR_TOKEN:?Export SONAR_TOKEN first — create one at http://localhost:9000 (My Account > Security).}" \
  docker compose run --rm scanner

echo "Audit complete: http://localhost:9000/dashboard?id=tasuketejs"
