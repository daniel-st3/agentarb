"""Export public deterministic rules and parity evidence; never reads local secrets.

Run from the repository root: python scripts/export_web_contract.py --check.
The generated JSON is build-time data. The web runtime never launches Python.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from pathlib import Path

from arbiter.classification import _CATEGORY_TAGS
from arbiter.connectors.execution_market import _CATEGORY_MAP
from arbiter.executors.safety import (
    _HARMFUL_PATTERNS,
    _MIN_DESCRIPTION_CHARS,
    _OUT_OF_SCOPE_PATTERNS,
    _VAGUE_PATTERNS,
)
from arbiter.governance import _CONTROL_PLANE_PROHIBITED_PATTERNS
from arbiter.llm import HeuristicEstimator
from arbiter.models import Bounty
from arbiter.sandbox import TEMPLATES, controlled_records, evaluate, template_profile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "web/src/lib/generated-policy.json"
PARITY = ROOT / "web/tests/fixtures/policy-parity.json"


async def export() -> str:
    sources = [
        "classification.py",
        "governance.py",
        "llm.py",
        "sandbox.py",
        "executors/safety.py",
        "connectors/opentask.py",
        "connectors/execution_market.py",
    ]
    corpus = [
        json.loads(line) for line in (ROOT / "data/golden_tasks/v1.jsonl").read_text().splitlines()
    ]
    tasks = controlled_records() + [
        Bounty(
            marketplace=item["marketplace"],
            bounty_id=item["id"],
            title=item["title"],
            description=item["description"],
            category=item["category"],
            payout_usd=item["payout_usd"],
            tags=item["tags"],
        )
        for item in corpus
    ]
    parity = []
    for name in TEMPLATES:
        profile, policy = template_profile(name)
        entries = [
            {"bounty": task, "source_type": "controlled_mock", "observed_at": None}
            for task in tasks
        ]
        rows = await evaluate(entries, profile, policy)
        parity.extend(
            {"template": name, "task": task.model_dump(mode="json"), "expected": row}
            for task, row in zip(tasks, rows, strict=True)
        )
    rules = {
        "schema_version": "python-hosted-rules/1",
        "source_sha256": {
            source: hashlib.sha256((ROOT / "src/arbiter" / source).read_bytes()).hexdigest()
            for source in sources
        },
        "control_patterns": _CONTROL_PLANE_PROHIBITED_PATTERNS,
        "harmful_patterns": _HARMFUL_PATTERNS,
        "scope_patterns": _OUT_OF_SCOPE_PATTERNS,
        "vague_patterns": _VAGUE_PATTERNS,
        "min_description_chars": _MIN_DESCRIPTION_CHARS,
        "category_tags": [(cat.value, sorted(tags)) for cat, tags in _CATEGORY_TAGS],
        "execution_categories": {key: value.value for key, value in _CATEGORY_MAP.items()},
        "heuristic_base": {cat.value: values for cat, values in HeuristicEstimator._BASE.items()},
        "heuristic_flags": HeuristicEstimator._RED_FLAGS,
        "heuristic_scale_pattern": HeuristicEstimator._SCALE_RE.pattern,
        "controlled_records": [task.model_dump(mode="json") for task in controlled_records()],
        "parity": parity,
    }
    return json.dumps(rules, indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = asyncio.run(export())
    if args.check:
        payload = json.loads(content)
        parity = payload.pop("parity")
        if (
            not TARGET.exists()
            or not PARITY.exists()
            or json.loads(TARGET.read_text()) != payload
            or json.loads(PARITY.read_text()) != parity
        ):
            raise SystemExit("Web policy snapshot is stale; regenerate before building.")
        print("Python source snapshot and 184 hosted-policy parity cases are current.")
    else:
        print(content, end="")
