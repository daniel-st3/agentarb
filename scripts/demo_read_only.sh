#!/usr/bin/env bash
set -euo pipefail

# 90-second portfolio path: benchmark plus governed GET-only discovery.
# This script never bids, claims, accepts, submits, signs, pays, or settles.

if command -v uv >/dev/null 2>&1; then
  ARBITER_CMD=(uv run arbiter)
else
  ARBITER_CMD=(.venv/bin/arbiter)
fi

"${ARBITER_CMD[@]}" golden-eval --corpus v1
ARBITER_LLM_PROVIDER=heuristic "${ARBITER_CMD[@]}" refresh-opportunities \
  --marketplace mock --marketplace opentask --marketplace execution_market --limit 5
"${ARBITER_CMD[@]}" markets
"${ARBITER_CMD[@]}" calibrate --real-only

echo "Discovery-only refresh complete. Start the dashboard with:"
echo "  uv run streamlit run src/arbiter/dashboard.py"
echo "Approve mock:mock-003 for the local worker, then run:"
echo "  uv run arbiter serve --host 127.0.0.1 --port 8765"
echo "  uv run python examples/local_worker_agent.py --api http://127.0.0.1:8765 --package-id wp_... --output-dir data/worker-artifacts/v1"
