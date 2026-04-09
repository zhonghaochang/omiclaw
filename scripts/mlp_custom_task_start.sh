#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/vepfs-mlp2/mlp-public/250266/omiclaw"

cd "$PROJECT_ROOT"

if [[ -z "${OMICLAW_START_MODE:-}" ]]; then
  export OMICLAW_START_MODE=dev
fi

exec python "$PROJECT_ROOT/scripts/mlp_custom_task_entry.py"
