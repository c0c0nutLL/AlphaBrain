"""Declarative capability-registry loader.

The registry is deliberately data-only.  UI and API code should consume it
through :mod:`alphabrain_ui.capabilities` instead of opening ``catalog.yaml``
directly, so filtering and compatibility semantics stay consistent.
"""

from __future__ import annotations

from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

CATALOG_PATH = Path(__file__).with_name("catalog.yaml")


@lru_cache(maxsize=1)
def _cached_catalog() -> dict[str, Any]:
    with CATALOG_PATH.open("r", encoding="utf-8") as stream:
        catalog = yaml.safe_load(stream)
    if not isinstance(catalog, dict):
        raise RuntimeError(f"Capability registry must be a mapping: {CATALOG_PATH}")
    return catalog


def load_catalog() -> dict[str, Any]:
    """Return an isolated copy of the packaged capability catalog."""

    return deepcopy(_cached_catalog())


__all__ = ["CATALOG_PATH", "load_catalog"]
