#!/usr/bin/env bash
set -euo pipefail

# 90-second portfolio path: hermetic benchmark, public GET-only discovery,
# then local not-submitted evaluation evidence.
# This script never bids, claims, accepts, submits, signs, pays, or settles.

if command -v uv >/dev/null 2>&1; then
  ARBITER_CMD=(uv run arbiter)
else
  ARBITER_CMD=(.venv/bin/arbiter)
fi

"${ARBITER_CMD[@]}" golden-eval --corpus v1
"${ARBITER_CMD[@]}" scan --market opentask --market execution_market --limit 5 --top 3 --no-persist
"${ARBITER_CMD[@]}" markets
"${ARBITER_CMD[@]}" evaluate --marketplace opentask --limit 3
"${ARBITER_CMD[@]}" export-evaluations --format csv --output data/evaluations.csv
"${ARBITER_CMD[@]}" calibrate --real-only

echo "Read-only demo complete. Start the dashboard with:"
echo "  uv run streamlit run src/arbiter/dashboard.py"
