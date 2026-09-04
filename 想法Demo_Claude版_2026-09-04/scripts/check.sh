#!/usr/bin/env bash
set -euo pipefail
pnpm lint
pnpm test
pnpm build
