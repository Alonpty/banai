"""Golden fixtures shared with the JS engine (shared/fixtures/ops)."""

import copy

import pytest

from app.domain.apply import apply_ops
from app.domain.errors import DomainError

from .conftest import load_design, load_op_cases, subset_match

CASES = load_op_cases()


def with_mutations(design: dict, mutations: list[dict]) -> dict:
    """Test-only: set values at key paths on a copy of a base design."""
    result = copy.deepcopy(design)
    for mutation in mutations:
        *parents, last = mutation["path"]
        target = result
        for key in parents:
            target = target[key]
        target[last] = mutation["value"]
    return result


@pytest.mark.parametrize("case", CASES, ids=[f"{c['file']}::{c['name']}" for c in CASES])
def test_fixture(case, catalog):
    base = load_design(case["base"]) if isinstance(case.get("base"), str) else case.get("base")
    if case.get("mutate"):
        base = with_mutations(base, case["mutate"])
    snapshot = copy.deepcopy(base)
    expect = case["expect"]

    if "error" in expect:
        with pytest.raises(DomainError) as info:
            apply_ops(base, case["ops"], catalog)
        assert info.value.code == expect["error"]["code"], info.value.to_dict()
        if "path" in expect["error"]:
            assert info.value.path == expect["error"]["path"], info.value.to_dict()
    else:
        result = apply_ops(base, case["ops"], catalog)
        if "design" in expect:
            assert result == expect["design"]
        if "match" in expect:
            subset_match(result, expect["match"])

    assert base == snapshot, "input design must never be mutated"
