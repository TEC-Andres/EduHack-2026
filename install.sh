#!/usr/bin/env bash
# Checks dependencies, starts the Postgres container, installs packages, pushes the Prisma schema.
set -euo pipefail
cd "$(dirname "$0")"

missing=0
need() { command -v "$1" >/dev/null 2>&1 && echo "ok  $1" || { echo "MISSING  $1 - $2"; missing=1; }; }
need node   "install Node.js 18+ from https://nodejs.org"
need npm    "ships with Node.js"
need npx    "ships with Node.js"
need docker "install Docker from https://docs.docker.com/get-docker/"

[ "$missing" = 0 ] || exit 1

node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 18 ] || { echo "Node 18+ required (found $(node -v))"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is installed but the daemon is not running. Start Docker Desktop/service."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "MISSING  'docker compose' plugin"; exit 1; }

[ -f .env ] || cp .env.example .env

docker compose up -d --wait db
npm install
npx prisma db push

echo "Done. Run: npm run dev  (http://localhost:3000)"
