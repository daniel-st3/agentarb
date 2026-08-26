#!/usr/bin/env bash
set -euo pipefail

# Public GET-only discovery plus local, not-submitted evaluation evidence.
# This script never bids, claims, accepts, submits, signs, pays, or settles.

uv run arbiter scan --limit 12
uv run arbiter markets
uv run arbiter evaluate --marketplace opentask --limit 10
uv run arbiter export-evaluations --format csv --output data/evaluations.csv
uv run arbiter calibrate --real-only

echo "Read-only demo complete. Start the dashboard with:"
echo "  uv run streamlit run src/arbiter/dashboard.py"
