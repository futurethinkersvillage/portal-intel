#!/bin/sh
set -e

echo "Running migrations..."
node dist/lib/migrate.js

echo "Seeding sources..."
node dist/lib/seed.js || echo "Seed skipped (may already exist)"

echo "Starting server..."
node dist/server.js
