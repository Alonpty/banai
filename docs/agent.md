# AI agent and voice

## Text agent (`/api/chat`)
- **Model:** `OPENAI_CHAT_MODEL` (default `gpt-6-luna`), `OPENAI_REASONING_EFFORT` (default `low`),
  OpenAI Responses API, `store=false`.
- **Tools:** `propose_changes` (design ops), `ask_clarification` (one question), `out_of_scope`
  (declines anything unrelated to the wardrobe design).
- **Context each turn:** a readable outline of the CURRENT committed design (UI names + ids, positions
  in mm), the customer's selection, catalog ids, the design JSON, and the reply language.
- **Validation:** every proposed op batch is dry-run by the domain engine; errors go back to the model
  (max `AGENT_MAX_REPAIRS`, default 2). Valid proposals are HMAC-signed with `baseRevision` and
  `baseHash` (`PROPOSAL_SIGNING_KEY`; random per process if empty).
- **Apply:** `POST /api/proposals/apply` verifies the signature, revision and design hash (409 if
  stale) and applies with the domain engine. The frontend commits the server's design.
- **Scope:** only wardrobe-design topics are answered. Declined replies show an
  "Outside wardrobe design" label in the chat.
- **Limits:** 30 messages / 2,000 chars per request, per-IP rate limit
  (`AGENT_RATE_LIMIT_PER_MINUTE`, default 20). Errors never echo input or provider details.
- **Without a key** the UI uses the labelled rule-based demo assistant.

## Voice (`/api/voice/session`, GPT-Live, client delegation)
- The browser opens WebRTC (microphone + data channel `oai-events`) and posts its SDP offer to our
  server; the server creates the Live session with the API key (never sent to the browser) and returns
  only the SDP answer. Model `OPENAI_VOICE_MODEL` (default `gpt-live-1`), voice `OPENAI_VOICE`
  (default `marin`), `VOICE_SESSIONS_PER_MINUTE` (default 6).
- GPT-Live only handles the spoken conversation. On `session.delegation.created` the browser sends
  what the customer just said through the SAME text agent (`chat.submit`), then speaks the result back
  with `session.commentary.append`.
- **Approval stays a click:** a spoken request produces the normal suggestion card and 3D preview; the
  voice says "Suggestion ready, not applied yet … tap Apply changes". Voice never applies changes.
- **Locked-down data channel:** the browser may only send `session.commentary.append`,
  `session.thinking.append` and `session.close`; it cannot append instructions or update the session.
- Billing is per second of session; the session closes when the customer taps the microphone again.

## Tests
- Unit: `backend/tests/agent/` (fake OpenAI client), `frontend/tests/unit/chat`, `tests/unit/voice`.
- E2E (Playwright) runs WITHOUT a key (`OPENAI_API_KEY=''`) so it uses the deterministic demo.
- Live evaluation (real model, 30 scenarios x 2 runs, plus 26 scope cases x 5 rounds, plus voice runs
  with synthetic speech): see the report in `../banai-agent-report/report.html` (kept outside the repo
  because of its screenshots).
