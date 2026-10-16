"""One agent turn: customer message(s) + CURRENT design -> reply | clarification | signed proposal.

The agent is stateless and never applies anything:
1. The model sees the instructions, the current design outline and the conversation.
2. A `propose_changes` call is parsed and dry-run by the domain engine on a copy.
   Invalid ops are sent back to the model to repair (at most `max_repairs` times).
3. A valid proposal is returned signed (HMAC) with the base revision and design hash.
   Committing happens only in POST /api/proposals/apply, after the customer approves.
"""

from __future__ import annotations

import json
import logging
import secrets
import time
from typing import Any

from app.agent.context import describe
from app.agent.prompts import INSTRUCTIONS
from app.agent.tools import TOOLS
from app.domain import ids
from app.domain.apply import apply_ops
from app.domain.errors import DomainError
from app.services import signing

MAX_OUTPUT_TOKENS = 4000
# Uses uvicorn's configured logger so turn metrics show up in the server log (no content, no ids).
log = logging.getLogger("uvicorn.error")
FALLBACK_REPLY = "Sorry, I couldn't work that out. Could you say it another way?"
GAVE_UP = ("I couldn't turn that into a valid change for this wardrobe. "
           "Could you be more specific, for example which section and how many cm?")

# Add ops whose new component ids the server fills in before signing, so applying an
# approved proposal is deterministic (the same ids in the preview and the result).
_ID_FIELDS = {
    "add_shelf": [("id", ids.SHELF)],
    "add_drawer": [("id", ids.DRAWER)],
    "add_rail": [("id", ids.RAIL)],
    "add_compartment": [("id", ids.COMPARTMENT), ("partitionId", ids.PARTITION)],
    "add_partition": [("id", ids.PARTITION), ("newCompartmentId", ids.COMPARTMENT)],
}


class AgentUnavailable(Exception):
    """The model provider failed (network, auth, quota, timeout)."""


def _clean_ops(raw: object) -> object:
    """Drop null fields (the model often sends every key) and fill new ids."""
    if not isinstance(raw, list):
        return raw
    cleaned = []
    for op in raw:
        if not isinstance(op, dict):
            cleaned.append(op)
            continue
        op = {key: value for key, value in op.items() if value is not None}
        for field, prefix in _ID_FIELDS.get(op.get("op"), []):
            op.setdefault(field, ids.new_id(prefix))
        cleaned.append(op)
    return cleaned


def reply_language(text: str) -> str:
    """Deterministic language hint from the customer's last message (by script).

    The model alone drifted into other languages (Spanish, French, German) for English
    requests, so the reply language is stated explicitly. Latin script defaults to
    English unless the message clearly uses another Latin-script language.
    """
    scripts = {"Hebrew": ("֐", "׿"), "Arabic": ("؀", "ۿ"), "Russian": ("Ѐ", "ӿ")}
    for language, (low, high) in scripts.items():
        if any(low <= ch <= high for ch in text):
            return language
    return "English (unless the customer's message is clearly in another language; then that language)"


def _input_messages(messages: list[dict]) -> list[dict]:
    return [{"role": m["role"], "content": m["content"]} for m in messages]


def run_turn(
    *,
    client: Any,
    model: str,
    reasoning_effort: str,
    messages: list[dict],
    design: dict,
    revision: int,
    selection: dict | None,
    catalog: dict,
    max_repairs: int = 2,
) -> dict:
    """Return {"kind": "reply"|"clarification"|"proposal", "text": str, "proposal"?: dict}."""
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    context = describe(design, catalog, selection) + f"\nREPLY LANGUAGE: {reply_language(last_user)}"
    conversation: list[Any] = [{"role": "developer", "content": context}, *_input_messages(messages)]
    attempts = 0
    started = time.monotonic()
    usage = {"input": 0, "output": 0, "reasoning": 0}

    def done(result: dict) -> dict:
        log.info("agent_turn model=%s effort=%s kind=%s repairs=%d seconds=%.1f input_tokens=%d output_tokens=%d reasoning_tokens=%d",
                 model, reasoning_effort, result["kind"], attempts, time.monotonic() - started,
                 usage["input"], usage["output"], usage["reasoning"])
        return result

    while True:
        try:
            response = client.responses.create(
                model=model,
                instructions=INSTRUCTIONS,
                input=conversation,
                tools=TOOLS,
                tool_choice="auto",
                parallel_tool_calls=False,
                reasoning={"effort": reasoning_effort},
                max_output_tokens=MAX_OUTPUT_TOKENS,
                store=False,
                include=["reasoning.encrypted_content"],
            )
        except Exception as error:  # the SDK raises many error types; none may leak to the client
            raise AgentUnavailable(type(error).__name__) from error

        meter = getattr(response, "usage", None)
        if meter is not None:
            usage["input"] += getattr(meter, "input_tokens", 0) or 0
            usage["output"] += getattr(meter, "output_tokens", 0) or 0
            details = getattr(meter, "output_tokens_details", None)
            usage["reasoning"] += getattr(details, "reasoning_tokens", 0) or 0
        calls = [item for item in response.output if getattr(item, "type", None) == "function_call"]
        if not calls:
            text = (getattr(response, "output_text", "") or "").strip()
            return done({"kind": "reply", "text": text or FALLBACK_REPLY})

        call = calls[0]
        try:
            args = json.loads(call.arguments or "{}")
        except json.JSONDecodeError:
            args = None
        if call.name == "ask_clarification" and isinstance(args, dict) and isinstance(args.get("question"), str):
            return done({"kind": "clarification", "text": args["question"].strip() or FALLBACK_REPLY})

        problem: dict
        if call.name == "propose_changes" and isinstance(args, dict):
            ops = _clean_ops(args.get("ops"))
            try:
                apply_ops(design, ops, catalog)  # dry run on the engine's private copy
            except DomainError as error:
                problem = {"ok": False, "error": error.to_dict(),
                           "hint": "Fix the operations using the ids and limits in the design outline, then call propose_changes again."}
            else:
                return done({"kind": "proposal", "text": str(args.get("message") or "").strip() or "Here is my suggestion.",
                             "proposal": _signed(ops, revision, design, args.get("summary"))})
        else:
            problem = {"ok": False, "error": {"code": "BAD_TOOL_CALL", "message": "Use propose_changes or ask_clarification with valid JSON arguments."}}

        attempts += 1
        if attempts > max_repairs:
            return done({"kind": "clarification", "text": GAVE_UP})
        conversation += list(response.output)
        conversation.append({"type": "function_call_output", "call_id": call.call_id, "output": json.dumps(problem)})


def _signed(ops: list, revision: int, design: dict, summary: object) -> dict:
    lines = [str(line)[:200] for line in summary] if isinstance(summary, list) else []
    proposal = {
        "proposalId": f"prp_{secrets.token_hex(8)}",
        "ops": ops,
        "baseRevision": revision,
        "baseHash": signing.design_hash(design),
        "summary": lines[:40],
    }
    proposal["signature"] = signing.sign(proposal)
    return proposal
