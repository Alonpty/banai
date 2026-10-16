"""Voice session endpoint with a fake OpenAI client (no network)."""

from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import agent as agent_api
from app.config import Settings, get_settings
from app.main import app
from app.voice.prompts import ALLOWED_CLIENT_EVENTS

OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n"


class FakeLive:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []
        self.live = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            raise RuntimeError("provider secret")
        return SimpleNamespace(session=SimpleNamespace(id="live_123"), transport=SimpleNamespace(sdp="v=0 answer"))


def client_with(fake, **settings):
    app.dependency_overrides[agent_api.get_openai_client] = lambda: fake
    app.dependency_overrides[get_settings] = lambda: Settings(openai_api_key="test", **settings)
    agent_api._hits.clear()
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_creates_a_client_delegation_session_and_returns_only_the_answer():
    fake = FakeLive()
    response = client_with(fake).post("/api/voice/session", json={"sdp": OFFER})
    assert response.status_code == 200
    assert response.json()["data"] == {"sessionId": "live_123", "sdp": "v=0 answer"}
    call = fake.calls[0]
    assert call["transport"] == {"type": "webrtc", "sdp": OFFER}
    session = call["session"]
    assert session["model"] == "gpt-live-1"
    assert session["delegation"] == {"type": "client"}
    assert "never applied by voice" in session["instructions"].lower()
    # The untrusted browser cannot append instructions or update the session.
    allowed = session["client"]["data_channel"]["allowed_client_events"]
    assert allowed == ALLOWED_CLIENT_EVENTS
    assert "session.instructions.append" not in allowed and "session.update" not in allowed
    assert "OPENAI" not in response.text and "test" not in response.text


def test_rejects_bad_offers_and_hides_provider_errors():
    assert client_with(FakeLive()).post("/api/voice/session", json={"sdp": "not an sdp"}).status_code == 422
    response = client_with(FakeLive(fail=True)).post("/api/voice/session", json={"sdp": OFFER})
    assert response.status_code == 502 and "secret" not in response.text


def test_not_configured_and_rate_limited():
    app.dependency_overrides[agent_api.get_openai_client] = lambda: None
    assert TestClient(app).post("/api/voice/session", json={"sdp": OFFER}).status_code == 503
    client = client_with(FakeLive(), voice_sessions_per_minute=1)
    codes = [client.post("/api/voice/session", json={"sdp": OFFER}).status_code for _ in range(2)]
    assert codes == [200, 429]
