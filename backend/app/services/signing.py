"""HMAC-signed AI proposals (stateless: the server stores nothing between chat and apply).

A proposal is `{proposalId, ops, baseRevision, baseHash}` plus `signature`. The signature
proves the ops came from this server's agent and were validated against the design whose
hash is `baseHash` at revision `baseRevision`. Apply re-checks both (stale -> 409).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from functools import lru_cache

from app.config import get_settings

SIGNED_FIELDS = ("proposalId", "ops", "baseRevision", "baseHash")


def _canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def design_hash(design: dict) -> str:
    """SHA-256 of the canonical (already parsed) design."""
    return hashlib.sha256(_canonical_json(design)).hexdigest()


@lru_cache
def _key() -> bytes:
    configured = get_settings().proposal_signing_key.strip()
    # No configured key: a random per-process key. Proposals then expire on restart.
    return configured.encode("utf-8") if configured else secrets.token_bytes(32)


def sign(proposal: dict) -> str:
    payload = {field: proposal[field] for field in SIGNED_FIELDS}
    return hmac.new(_key(), _canonical_json(payload), hashlib.sha256).hexdigest()


def verify(proposal: dict) -> bool:
    signature = proposal.get("signature")
    if not isinstance(signature, str):
        return False
    try:
        expected = sign(proposal)
    except (KeyError, TypeError, ValueError):
        return False
    return hmac.compare_digest(expected, signature)
