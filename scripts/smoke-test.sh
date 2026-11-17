#!/usr/bin/env bash
# Production smoke test wrapper (D3-12).
# Usage: scripts/smoke-test.sh --base-url https://api.example --guide-url https://guide.example
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/smoke-test.js" "$@"
