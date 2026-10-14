#!/usr/bin/env bash
# Generates src/api/schema.d.ts from orbit-control's OpenAPI contract (the control repo owns the spec).
# The spec is read from the sibling checkout; set ORBIT_OPENAPI to point elsewhere.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
spec="${ORBIT_OPENAPI:-$root/../orbit-control/docs/openapi.yaml}"

if [[ ! -f "$spec" ]]; then
  echo "gen-api: OpenAPI spec not found: $spec" >&2
  echo "gen-api: check out orbit-control next to orbit-web, or set ORBIT_OPENAPI to the spec path." >&2
  exit 1
fi

cd "$root"
node scripts/validate-openapi.mjs "$spec"
pnpm exec openapi-typescript "$spec" --output src/api/schema.d.ts
