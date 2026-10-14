import json
from pathlib import Path

import pytest

from app.domain.catalog import load_catalog

FIXTURES_DIR = Path(__file__).resolve().parents[3] / "shared" / "fixtures"


def load_design(name: str) -> dict:
    return json.loads((FIXTURES_DIR / "designs" / f"{name}.json").read_text(encoding="utf-8"))


def load_op_cases() -> list[dict]:
    cases = []
    for path in sorted((FIXTURES_DIR / "ops").glob("*.json")):
        for case in json.loads(path.read_text(encoding="utf-8")):
            cases.append({**case, "file": path.name})
    return cases


def subset_match(actual, expected, path: str = "$") -> None:
    """Assert `expected` is a structural subset of `actual` (arrays must match length)."""
    if isinstance(expected, dict):
        assert isinstance(actual, dict), f"{path}: expected object, got {actual!r}"
        for key, value in expected.items():
            assert key in actual, f"{path}.{key}: missing"
            subset_match(actual[key], value, f"{path}.{key}")
    elif isinstance(expected, list):
        assert isinstance(actual, list), f"{path}: expected array, got {actual!r}"
        assert len(actual) == len(expected), f"{path}: length {len(actual)} != {len(expected)}"
        for index, (a, e) in enumerate(zip(actual, expected)):
            subset_match(a, e, f"{path}[{index}]")
    else:
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"


@pytest.fixture(scope="session")
def catalog() -> dict:
    return load_catalog()


@pytest.fixture
def two() -> dict:
    return load_design("two")
