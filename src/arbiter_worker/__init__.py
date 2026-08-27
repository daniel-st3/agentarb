"""Isolated deterministic consumer of approved Agent Arbiter work packages."""

from arbiter_worker.runtime import execute_package, retrieve_package

__all__ = ["execute_package", "retrieve_package"]

