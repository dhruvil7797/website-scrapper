#!/usr/bin/env bash
set -euo pipefail

echo "=== Client Scraper Deploy ==="

# 1. Build web package
echo "[1/3] Building web package..."
pnpm --filter web build

# 2. Deploy D1 schema
echo "[2/3] Applying D1 schema..."
wrangler d1 execute client-scraper-db --file=./schema.sql

# 3. Deploy to Cloudflare Pages
echo "[3/3] Deploying to Cloudflare Pages..."
cd packages/web
wrangler pages deploy ./dist --project-name=client-scraper

echo "=== Deploy complete ==="
