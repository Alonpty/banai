"""AI agent endpoints.

POST /api/chat             one agent turn -> reply | clarification | signed proposal (no state change)
POST /api/proposals/apply  verify signature + revision + design hash, then apply -> new design

Both validate the incoming design with the domain engine first. Errors use the
{success, data, error} envelope and never echo input or provider details.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.agent.orchestrator import AgentUnavailable, run_turn
from app.config import Settings, get_settings
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.domain.ids import ANY_ID_PATTERN
from app.services import signing

router = APIRouter(prefix="/api")

MAX_MESSAGES = 30
MAX_MESSAGE_CHARS = 2000


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: Annotated[str, Field(min_length=1, max_length=MAX_MESSAGE_CHARS)]


class Selection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Annotated[str, Field(pattern=rf"{ANY_ID_PATTERN}|^carcass$")]
    kind: Annotated[str, Field(pattern=r"^[a-z]{1,20}$")]


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: Annotated[list[ChatMessage], Field(min_length=1, max_length=MAX_MESSAGES)]
    design: dict
    revision: Annotated[int, Field(ge=1, le=1_000_000)]
    selection: Selection | None = None


class Proposal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    proposalId: Annotated[str, Field(pattern=r"^prp_[0-9a-f]{16}$")]
    ops: list
    baseRevision: int
    baseHash: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    signature: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class ApplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    design: dict
    revision: Annotated[int, Field(ge=1, le=1_000_000)]
    proposal: Proposal


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"success": False, "data": None, "error": {"code": code, "message": message}})


# ---- tiny in-memory rate limiter (per client IP, sliding minute) -----------------
_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def _rate_limited(key: str, limit: int) -> bool:
    now = time.monotonic()
    with _lock:
        window = _hits[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= limit:
            return True
        window.append(now)
        return False


# ---- OpenAI client (overridable in tests) ------------------------------------------
_client = None


def get_openai_client(settings: Annotated[Settings, Depends(get_settings)]):
    global _client
    if not settings.agent_configured:
        return None
    if _client is None:
        from openai import OpenAI  # imported lazily: the app runs without the key

        _client = OpenAI(api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds, max_retries=1)
    return _client


def _canonical(design: dict, catalog: dict) -> dict:
    return apply_ops(design, [], catalog)  # parse + full validation, raises DomainError


@router.post("/chat")
def chat(
    body: ChatRequest,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    client=Depends(get_openai_client),
):
    if client is None:
        return _error(503, "AGENT_NOT_CONFIGURED", "The AI agent is not configured on this server.")
    if body.messages[-1].role != "user":
        return _error(422, "INVALID_REQUEST", "The last message must come from the customer.")
    if _rate_limited(request.client.host if request.client else "unknown", settings.agent_rate_limit_per_minute):
        return _error(429, "RATE_LIMITED", "Too many messages. Please wait a moment.")
    catalog = load_catalog()
    try:
        design = _canonical(body.design, catalog)
    except DomainError:
        return _error(422, "INVALID_DESIGN", "The current design is not valid.")
    selection = body.selection.model_dump() if body.selection else None
    try:
        result = run_turn(
            client=client,
            model=settings.openai_chat_model,
            reasoning_effort=settings.openai_reasoning_effort,
            messages=[m.model_dump() for m in body.messages],
            design=design,
            revision=body.revision,
            selection=selection,
            catalog=catalog,
            max_repairs=settings.agent_max_repairs,
        )
    except AgentUnavailable:
        return _error(502, "AGENT_UNAVAILABLE", "The AI agent is not reachable right now.")
    return {"success": True, "data": result, "error": None}


@router.post("/proposals/apply")
def apply_proposal(body: ApplyRequest):
    proposal = body.proposal.model_dump()
    if not signing.verify(proposal):
        return _error(403, "INVALID_SIGNATURE", "This suggestion could not be verified.")
    catalog = load_catalog()
    try:
        design = _canonical(body.design, catalog)
    except DomainError:
        return _error(422, "INVALID_DESIGN", "The current design is not valid.")
    if body.revision != proposal["baseRevision"] or signing.design_hash(design) != proposal["baseHash"]:
        return _error(409, "STALE", "The design changed after this suggestion. Ask again for an updated one.")
    try:
        new_design = apply_ops(design, proposal["ops"], catalog)
    except DomainError:
        return _error(422, "INVALID_OPS", "This suggestion no longer fits the design.")
    return {"success": True, "data": {"design": new_design, "revision": body.revision + 1}, "error": None}
