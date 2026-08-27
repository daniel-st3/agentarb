"""Consume one approved Agent Arbiter package and write a local artifact."""

from __future__ import annotations

import argparse
from pathlib import Path

from arbiter_worker.runtime import execute_package, retrieve_package, write_artifact


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8765")
    parser.add_argument("--package-id", required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("data/worker-artifacts/v1"))
    args = parser.parse_args()
    package = retrieve_package(args.api, args.package_id)
    artifact = execute_package(package)
    path = write_artifact(artifact, args.output_dir)
    print(f"{artifact['state']} · {path}")
    print("external_actions_taken=false · marketplace_submission_status=not_submitted")


if __name__ == "__main__":
    main()
