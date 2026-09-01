#!/bin/bash
set -u

# Warm the VPS product cache every 5 minutes.
# Keep this endpoint local so the request never depends on the public DNS/proxy.
APP_URL="http://127.0.0.1:${PORT:-3000}/api/woocommerce/products?preload=1"

curl -fsS --max-time 120 -H 'Cache-Control: no-cache' "$APP_URL" >/dev/null || true
