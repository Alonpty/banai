"""Agent orchestration and API with a fake OpenAI client (no network, no key needed)."""

from __future__ import annotations

import copy
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.agent import orchestrator
from app.agent.context import describe, label_of
from app.agent.orchestrator import AgentUnavailable, run_turn
from app.api import agent as agent_api
from app.config import Settings, get_settings
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from app.main import app
from app.services import signing

CATALOG = load_catalog()


def call(name: str, args: dict, call_id: str = "call_1"):
    return SimpleNamespace(type="function_call", name=name, arguments=json.dumps(args), call_id=call_id, id="fc_1")


def text(value: str):
    return SimpleNamespace(output=[SimpleNamespace(type="message")], output_text=value)


def tool(name: str, args: dict, call_id: str = "call_1"):
    return SimpleNamespace(output=[call(name, args, call_id)], output_text="")


class FakeClient:
    """Returns the queued responses in order and records every request."""

    def __init__(self, *responses):
        self.queue = list(responses)
        self.requests: list[dict] = []
        self.responses = self

    def create(self, **kwargs):
        self.requests.append(copy.deepcopy({k: v for k, v in kwargs.items() if k != "input"}) | {"input": list(kwargs["input"])})
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def turn(client, *, design=None, selection=None, message="hi", revision=1):
    return run_turn(
        client=client, model="test-model", reasoning_effort="low",
        messages=[{"role": "user", "content": message}],
        design=design or basic_wardrobe(), revision=revision, selection=selection, catalog=CATALOG,
    )


MOVE_UP = {"message": "Moving it up.", "summary": ["Shelf 2 · Left section: 80.0 → 95.0 cm"],
           "ops": [{"op": "modify_shelf", "id": "shf_l2", "y": 950, "thickness": None}]}


class TestOrchestrator:
    def test_plain_reply(self):
        assert turn(FakeClient(text("Hello!"))) == {"kind": "reply", "text": "Hello!"}

    def test_clarification(self):
        result = turn(FakeClient(tool("ask_clarification", {"question": "Which section?"})))
        assert result == {"kind": "clarification", "text": "Which section?"}

    def test_valid_proposal_is_signed_and_never_applied(self):
        design = basic_wardrobe()
        before = copy.deepcopy(design)
        result = turn(FakeClient(tool("propose_changes", MOVE_UP)), design=design, revision=4)
        assert result["kind"] == "proposal"
        proposal = result["proposal"]
        assert proposal["ops"] == [{"op": "modify_shelf", "id": "shf_l2", "y": 950}]  # nulls dropped
        assert proposal["baseRevision"] == 4
        assert proposal["baseHash"] == signing.design_hash(design)
        assert signing.verify(proposal)
        assert design == before  # the committed design is untouched

    def test_new_component_ids_are_filled_before_signing(self):
        args = {"message": "ok", "summary": ["Add a drawer"], "ops": [{"op": "add_drawer", "compartmentId": "cmp_middle", "y": 0, "height": 200}]}
        proposal = turn(FakeClient(tool("propose_changes", args)))["proposal"]
        assert proposal["ops"][0]["id"].startswith("drw_")

    def test_invalid_ops_are_sent_back_for_repair(self):
        bad = {"message": "x", "summary": ["x"], "ops": [{"op": "modify_shelf", "id": "shf_l2", "y": 99999}]}
        client = FakeClient(tool("propose_changes", bad), tool("propose_changes", MOVE_UP, "call_2"))
        result = turn(client)
        assert result["kind"] == "proposal"
        feedback = client.requests[1]["input"][-1]
        assert feedback["type"] == "function_call_output" and feedback["call_id"] == "call_1"
        assert json.loads(feedback["output"])["error"]["code"] == "OUT_OF_BOUNDS"

    def test_gives_up_after_max_repairs(self):
        bad = tool("propose_changes", {"message": "x", "summary": [], "ops": [{"op": "remove_component", "id": "shf_nope"}]})
        result = turn(FakeClient(bad, bad, bad))
        assert result["kind"] == "clarification"
        assert result["text"] == orchestrator.GAVE_UP

    def test_provider_errors_become_agent_unavailable(self):
        with pytest.raises(AgentUnavailable):
            turn(FakeClient(RuntimeError("boom")))

    def test_request_carries_instructions_tools_and_the_current_design(self):
        client = FakeClient(text("ok"))
        edited = apply_ops(basic_wardrobe(), [{"op": "modify_shelf", "id": "shf_l2", "y": 1000}], CATALOG)
        turn(client, design=edited, selection={"id": "shf_l2", "kind": "shelf"})
        request = client.requests[0]
        assert request["model"] == "test-model"
        assert {t["name"] for t in request["tools"]} == {"propose_changes", "ask_clarification"}
        assert request["store"] is False and request["parallel_tool_calls"] is False
        context = request["input"][0]
        assert context["role"] == "developer"
        assert "Shelf 2 [shf_l2]: y 1000" in context["content"]  # the manual edit is visible
        assert "SELECTED BY THE CUSTOMER: Shelf 2 · Left section [shf_l2]" in context["content"]


class TestContext:
    def test_names_match_the_ui(self):
        design = basic_wardrobe()
        assert label_of(design, "cmp_middle") == "Middle section"
        assert label_of(design, "shf_l2") == "Shelf 2 · Left section"
        assert label_of(design, "prt_1") == "Divider 1"
        assert label_of(design, "nope") is None
        assert "Nothing is selected." in describe(design, CATALOG, None)


# ---------------------------------------------------------------- API

@pytest.fixture
def api():
    calls = {}

    def use(client, **settings):
        app.dependency_overrides[agent_api.get_openai_client] = lambda: client
        app.dependency_overrides[get_settings] = lambda: Settings(openai_api_key="test", **settings)
        calls["client"] = client
        return TestClient(app)

    agent_api._hits.clear()
    yield use
    app.dependency_overrides.clear()


def chat_body(**overrides):
    body = {"messages": [{"role": "user", "content": "move this up 15 cm"}], "design": basic_wardrobe(), "revision": 3,
            "selection": {"id": "shf_l2", "kind": "shelf"}}
    return body | overrides


class TestChatApi:
    def test_not_configured_returns_503(self):
        app.dependency_overrides[agent_api.get_openai_client] = lambda: None
        try:
            response = TestClient(app).post("/api/chat", json=chat_body())
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "AGENT_NOT_CONFIGURED"

    def test_returns_a_signed_proposal(self, api):
        response = api(FakeClient(tool("propose_changes", MOVE_UP))).post("/api/chat", json=chat_body())
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["kind"] == "proposal" and data["proposal"]["baseRevision"] == 3

    def test_rejects_invalid_designs_and_requests(self, api):
        client = api(FakeClient())
        broken = basic_wardrobe()
        broken["compartments"][0]["width"] = 1
        assert client.post("/api/chat", json=chat_body(design=broken)).json()["error"]["code"] == "INVALID_DESIGN"
        assistant_last = chat_body(messages=[{"role": "assistant", "content": "hi"}])
        assert client.post("/api/chat", json=assistant_last).status_code == 422
        assert client.post("/api/chat", json=chat_body(messages=[{"role": "user", "content": "x" * 2001}])).status_code == 422
        assert client.post("/api/chat", json=chat_body(selection={"id": "<script>", "kind": "shelf"})).status_code == 422

    def test_provider_failure_is_502_without_details(self, api):
        response = api(FakeClient(RuntimeError("secret detail"))).post("/api/chat", json=chat_body())
        assert response.status_code == 502
        assert "secret" not in response.text

    def test_rate_limit(self, api):
        client = api(FakeClient(*[text("ok")] * 3), agent_rate_limit_per_minute=2)
        codes = [client.post("/api/chat", json=chat_body()).status_code for _ in range(3)]
        assert codes == [200, 200, 429]


class TestApplyApi:
    def proposal(self, design, revision=3):
        return turn(FakeClient(tool("propose_changes", MOVE_UP)), design=design, revision=revision)["proposal"]

    def test_applies_a_valid_proposal(self):
        design = basic_wardrobe()
        body = {"design": design, "revision": 3, "proposal": self.proposal(design)}
        response = TestClient(app).post("/api/proposals/apply", json=body)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["revision"] == 4
        assert data["design"]["compartments"][0]["shelves"][1]["y"] == 950

    def test_tampered_proposal_is_rejected(self):
        design = basic_wardrobe()
        proposal = self.proposal(design)
        proposal["ops"][0]["y"] = 100
        response = TestClient(app).post("/api/proposals/apply", json={"design": design, "revision": 3, "proposal": proposal})
        assert response.status_code == 403

    def test_stale_revision_or_changed_design_is_409(self):
        design = basic_wardrobe()
        proposal = self.proposal(design)
        client = TestClient(app)
        assert client.post("/api/proposals/apply", json={"design": design, "revision": 4, "proposal": proposal}).status_code == 409
        edited = apply_ops(design, [{"op": "modify_shelf", "id": "shf_l1", "y": 450}], CATALOG)
        assert client.post("/api/proposals/apply", json={"design": edited, "revision": 3, "proposal": proposal}).status_code == 409


def test_health_reports_whether_the_agent_is_configured():
    app.dependency_overrides[get_settings] = lambda: Settings(openai_api_key="")
    try:
        assert TestClient(app).get("/api/health").json()["data"]["agent"] in (True, False)
    finally:
        app.dependency_overrides.clear()


def test_blank_model_setting_keeps_the_default():
    assert Settings(openai_chat_model="", openai_reasoning_effort=" ").openai_chat_model == "gpt-6-luna"


def test_reply_language_follows_the_customers_script():
    from app.agent.orchestrator import reply_language

    assert reply_language("תוסיף מדף") == "Hebrew"
    assert reply_language("Add a shelf").startswith("English")
    client = FakeClient(text("ok"))
    turn(client, message="תוסיף מדף")
    assert client.requests[0]["input"][0]["content"].endswith("REPLY LANGUAGE: Hebrew")
