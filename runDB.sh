#!/usr/bin/env bash
# Starts the Postgres container and syncs the Prisma schema.
set -euo pipefail
cd "$(dirname "$0")"

docker info >/dev/null 2>&1 || { echo "Docker daemon is not running. Start Docker Desktop/service."; exit 1; }
[ -f .env ] || cp .env.example .env

docker compose up -d --wait db
npx prisma db push

echo "Database is up on localhost:5432."
