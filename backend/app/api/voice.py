"""Voice sessions (GPT-Live, WebRTC, client delegation).

POST /api/voice/session  {sdp} -> {sessionId, sdp}

The browser sends its WebRTC offer here; the server creates the Live session with the
project API key (never exposed to the browser) and returns only the SDP answer. Audio
and the data channel then flow between the browser and OpenAI. The data channel is
restricted (see app.voice.prompts) so the frontend cannot override the instructions.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api.agent import _error, _rate_limited, get_openai_client
from app.config import Settings, get_settings
from app.voice.prompts import ALLOWED_CLIENT_EVENTS, ALLOWED_SERVER_EVENTS, GREETING, VOICE_INSTRUCTIONS

router = APIRouter(prefix="/api/voice")

MAX_SDP_CHARS = 30_000


class VoiceSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sdp: Annotated[str, Field(min_length=10, max_length=MAX_SDP_CHARS, pattern=r"^v=0")]


def session_config(settings: Settings) -> dict:
    return {
        "model": settings.openai_voice_model,
        "instructions": VOICE_INSTRUCTIONS,
        "audio": {"output": {"voice": settings.openai_voice}},
        "delegation": {"type": "client"},
        "input": [{"type": "message", "role": "developer", "content": [{"type": "input_text", "text": GREETING}]}],
        "client": {"data_channel": {"allowed_client_events": ALLOWED_CLIENT_EVENTS, "allowed_server_events": ALLOWED_SERVER_EVENTS}},
        "store": False,
    }


@router.post("/session")
def create_voice_session(
    body: VoiceSessionRequest,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    client=Depends(get_openai_client),
):
    if client is None:
        return _error(503, "VOICE_NOT_CONFIGURED", "Voice is not configured on this server.")
    ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"voice:{ip}", settings.voice_sessions_per_minute):
        return _error(429, "RATE_LIMITED", "Too many voice sessions. Please wait a moment.")
    try:
        result = client.live.create(session=session_config(settings), transport={"type": "webrtc", "sdp": body.sdp})
    except Exception:  # never leak provider details
        return _error(502, "VOICE_UNAVAILABLE", "Voice is not available right now.")
    return {"success": True, "data": {"sessionId": result.session.id, "sdp": result.transport.sdp}, "error": None}
