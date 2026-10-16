from fastapi import APIRouter

from app.config import get_settings

router = APIRouter()


@router.get("/api/health")
def health() -> dict:
    settings = get_settings()
    # `agent` tells the UI whether the real AI agent is available (never exposes the key).
    return {"success": True, "data": {"status": "ok", "env": settings.app_env, "agent": settings.agent_configured}}
