# Plan: replace DeepSeek with OpenRouter (dynamic model picker, cached catalogue, per-turn cost)

## Note to the implementing agent

Several tasks below are independent. **It is more efficient to use subagents for the work that can run in parallel** (see "Parallelisation" at the end) instead of doing everything sequentially in one context. Give each subagent only the files it owns, so they do not edit the same file.

Reference implementation to port from (read it, don't re-derive it):
`D:\lefteris.fthenos\Python_Projects\Personal Projects\PolTrust`
- `backend/app/llm/client.py` — OpenRouter client (streaming, tools, `usage.cost`, `list_models`, retries)
- `backend/app/assistant/catalog.py` — `ModelCatalog` / `ModelInfo` (24h cache, stale-serve, cost fallback)
- `backend/app/assistant/budget.py` — token estimate + history trimming
- `backend/app/assistant/agent.py` — loop, per-turn cost cap, `usage` events
- `backend/app/assistant/service.py` — `resolve_model`, `model_catalog`
- `backend/app/assistant/prompt.py` — `system_message` (Anthropic `cache_control`)
- `web/src/components/assistant/{ModelPicker,TurnFooter,Composer,format}.*` and `web/src/api/queries.ts` (model hooks)

PolTrust differences to NOT copy: it persists conversations in Postgres (JSONB); PersonalFinance is SQLite and stateless (client resends the transcript, stored in `sessionStorage`). Keep that.

## Current state (PersonalFinance)

- `backend/app/services/ai_service.py` — `run_agent_stream`, uses the `openai` SDK against DeepSeek. Tool registry, `_execute_tool`, `_serialize_result`, profile-write event: keep as is.
- `backend/app/routers/ai_chat.py` — `/ai/status`, `/ai/chat` (SSE), per-user rate limit, server-side disclaimer.
- `backend/app/schemas/ai_chat.py`, `backend/app/config.py` (`DEEPSEEK_*`), `.env.example`, `docker-compose.yml`.
- Frontend `frontend/app/src/ai-advisor/`: `aiChatApi.ts`, `useAiChat.ts`, `ChatWidget.tsx`, locales `src/locales/{en,el}/advisor.json`.
- Tests: `backend/tests/test_ai_chat.py` (stubs `ai_service.OpenAI`), `AdvisorChat.test.tsx`, `conversationFlow.test.tsx`, `investmentAdvisor.test.tsx`.
- Docs mentioning DeepSeek: `README.md`, `CLAUDE.md`, `frontend/app/src/legal/PrivacyPage.tsx`, advisor locale `unavailableReason`.

## Decisions (defaults; change only if the user says so)

1. Selected model is **per message**, remembered in browser `localStorage`; no server-side per-user default.
2. **No conversation persistence.** Only a new `ai_usage` table for cost tracking.
3. Per-turn cost cap `AI_TURN_COST_CAP_USD=0.25` (as PolTrust); optional monthly cap `AI_MONTHLY_CAP_USD` (unset = off).
4. Default model `AI_DEFAULT_MODEL=deepseek/deepseek-chat-v3.1` (continuity with today's behaviour).
5. Catalogue cache is **in-memory, 24h** (single process; restart = one refetch).

## Phase 1 — OpenRouter client

- New `backend/app/llm/__init__.py` + `backend/app/llm/openrouter.py`, ported from PolTrust `client.py`: `OpenRouterClient`, `Usage`, `ChatCompletion`, `TextDelta`, `ReasoningDelta`, `ToolCallStarted`, `ToolCallRequest`, `LLMConfigError`, `LLMStreamError`, retry/backoff, `_merge_reasoning_details`, `list_models`.
- Drop `complete_json`, `decide`, `embed`, `strict_schema` (unused here).
- Headers: `HTTP-Referer` / `X-Title` set to this app. Always send `usage: {include: true}`.
- Do not remove `openai` from `pyproject.toml` until Phase 3 is done and no import remains; then remove it and run `uv lock`.

## Phase 2 — Model catalogue (daily cache)

- New `backend/app/services/ai_models.py` ported from PolTrust `catalog.py`:
  - `ModelInfo(id, name, context_length, prompt_per_m, completion_per_m, cache_read_per_m, supports_tools, known)`; prices converted from OpenRouter per-token strings to USD per 1M tokens.
  - `history_budget(settings)` (context minus 5% margin minus max output tokens) and `cost_usd(usage, settings)` (OpenRouter-reported cost wins, else catalogue price, else fallback price; flag `estimated`).
  - `ModelCatalog` with `CACHE_SECONDS = 24h`, `RETRY_SECONDS = 60`, lock, keep serving stale on fetch failure, `all_models(force=)`, `is_selectable`, `get` (unknown ids → default context 128k, `known=False`). Only tool-capable models are selectable.
- Endpoints in `routers/ai_chat.py`:
  - `GET /ai/models` → `{models: [...], fetched_at}`
  - `POST /ai/models/refresh` → same, forced
  - `GET /ai/status` → add `default_model`; `configured` becomes `bool(OPENROUTER_API_KEY)`
- Schemas in `schemas/ai_chat.py`: `ModelOut`, `ModelCatalogOut`; add `model: str | None` to `AiChatRequest`.
- `resolve_model(requested)`: the configured default always passes (so an outage never strands the chat); anything else must be catalogue-listed with tool support, else HTTP 422.

## Phase 3 — Agent loop on OpenRouter

Rewrite `run_agent_stream` in `ai_service.py` on `OpenRouterClient.stream_chat`. Keep tool plumbing and existing SSE event names (`token`, `tool_call_start`, `tool_call_result`, `profile_update`, `done`, `error`, `disclaimer`) so the frontend keeps working.

- New signature takes the resolved `ModelInfo`.
- New optional event `reasoning` (`{text}`) from `ReasoningDelta`.
- Put `reasoning_details` back on assistant messages that carry tool calls (in-memory, within the turn only).
- Per model call: `cost, estimated = model.cost_usd(usage, settings)`; accumulate turn totals (prompt/completion/cached tokens, cost, estimated flag, peak context, duration).
- Stop when turn cost ≥ `AI_TURN_COST_CAP_USD` (emit an error/notice event) in addition to `AI_CHAT_MAX_TOOL_ROUNDS`.
- Trim history with a ported `fit_history`/`estimate_tokens` (put in `backend/app/services/ai_budget.py`; keep the non-ASCII-weighted estimate, Greek is token-heavy) to the model's history budget minus system prompt and tool schemas.
- For `anthropic/*` models wrap the system prompt with `cache_control: {type: ephemeral}` (PolTrust `system_message`).
- `done` event: `{content, model, context_window, usage: {prompt_tokens, completion_tokens, cached_tokens, cost_usd, cost_estimated, peak_context_tokens, duration_ms, steps, tool_calls}}`.
- Map errors: missing key → "AI chat is not configured."; provider/HTTP errors → short message without leaking internals (project rule: no exception text to clients beyond what existing handlers do; log the real error).

## Phase 4 — Cost tracking

- Alembic migration (next after the current head; check `backend/alembic/versions`, follow `backend/ALEMBIC_GUIDE.md`) creating `ai_usage`: `id, user_id (FK), model, prompt_tokens, completion_tokens, cached_tokens, cost_usd, cost_estimated, duration_ms, created_at`. SQLite-safe types only. Add `models/ai_usage.py` and register it in `models/__init__.py`.
- Router writes one row per completed turn after the stream ends (from the `done` usage).
- `GET /ai/usage` → totals for the current month and per model.
- Optional monthly cap: refuse a new turn when this month's spend ≥ `AI_MONTHLY_CAP_USD`.

## Phase 5 — Frontend

- `aiChatApi.ts`: `getModels()`, `refreshModels()`, `model` in the `streamChat` body, new/extended event types (`reasoning`, richer `done`), `ChatStatus.default_model`.
- New `ModelPicker.tsx` ported from PolTrust: Popover (`components/ui/popover`) + search input + sort (name / price / context) + list rows showing name, id, price per 1M tokens (input / output, or "free"), context length; footer with "updated X ago" and a refresh button. Export a pure `filterModels` for testing. Use TanStack Query hooks (`useAiModels`, `useRefreshAiModels`, `staleTime` ~1h) in a small `useAiModels.ts`.
- `useAiChat.ts`: selected model state persisted in `localStorage` (wrapped in try/catch, default to `status.default_model`); pass it on every `send`; store `model` + `usage` on each assistant `Turn` (extend the type and `migrateTurn` so old stored transcripts still load).
- `ChatWidget.tsx`: mount the picker next to the input, disabled while streaming; add a per-turn footer (model · tokens · cost, `≈` if estimated · duration) with a hover breakdown, ported from PolTrust `TurnFooter`. Optional: session total and context-fill indicator.
- Money/token formatters ported from PolTrust `format.ts`, but use the app's i18n locale rather than hard-coded `el-GR`.
- i18n: add strings to `locales/en/advisor.json` and `locales/el/advisor.json`; change `unavailableReason` to name `OPENROUTER_API_KEY`.

## Phase 6 — Config, docs, tests

- `config.py`, `.env.example`, `docker-compose.yml`: replace `DEEPSEEK_*` with `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`, `AI_DEFAULT_MODEL`, `AI_MAX_OUTPUT_TOKENS` (4096), `AI_TURN_COST_CAP_USD`, `AI_MONTHLY_CAP_USD` (optional), fallback prices `AI_FALLBACK_PRICE_IN_PER_M` / `AI_FALLBACK_PRICE_OUT_PER_M`. Keep the existing `AI_CHAT_*` and `AI_TOOL_RESULT_MAX_CHARS` settings. Do not loosen any startup validation in `config.py`/`main.py`.
- Docs: update `README.md` (setup + privacy paragraph: data goes to OpenRouter and the chosen model's provider), `CLAUDE.md` integrations line, `PrivacyPage.tsx`.
- Backend tests (`backend/tests/`): rewrite the `stub_deepseek` fixture in `test_ai_chat.py` around a fake `OpenRouterClient` (keep all behavioural assertions: disclaimer, tool rounds, profile event, round limit, rate limit). New tests: catalogue parsing/pricing conversion, 24h caching + force refresh, stale-serve on failure, `resolve_model` accept/reject, cost fallback order, turn cost cap, history trimming, `ai_usage` rows, `/ai/models`, `/ai/usage`. Remember `conftest.py` ordering constraints (don't hit the network).
- Frontend tests: port `ModelPicker.test.tsx` (filter + sort); update `AdvisorChat.test.tsx`, `conversationFlow.test.tsx`, `investmentAdvisor.test.tsx` for the `model` field and status shape.

## Verification

- `uv run pytest backend/tests -v`
- From `frontend/app/`: `npm run build` (type errors fail it), `npm run lint`, `npm run test`
- Manual, with a real key: a tool-calling question on a cheap model and on a reasoning model; switch model mid-conversation; confirm the footer cost matches OpenRouter's activity dashboard; confirm refresh updates "updated X ago"; confirm a model not in the catalogue is rejected with 422.

## Parallelisation (use subagents)

Phase 1 is the only hard prerequisite for 2 and 3. Suggested split:

1. **Sequential first:** Phase 1 (client) — small, everything depends on it.
2. **Then in parallel:**
   - Subagent A — Phase 2 (catalogue + `/ai/models` endpoints + schemas) and then Phase 3 (agent loop), since 3 needs `ModelInfo`. Owns `services/ai_models.py`, `services/ai_budget.py`, `services/ai_service.py`, `schemas/ai_chat.py`, `routers/ai_chat.py`.
   - Subagent B — Phase 5 frontend, coding against the API contract defined above (`/ai/models`, `/ai/models/refresh`, `/ai/status`, `model` in the chat body, `done.usage`). Owns `frontend/app/src/ai-advisor/**` and the locale files.
   - Subagent C — Phase 4 migration + `ai_usage` model + `/ai/usage` (coordinate with A on the router: C only adds a separate `routers/ai_usage.py` or a clearly delimited block, then A wires it in).
   - Subagent D — Phase 6 docs/config/`.env.example`/`docker-compose.yml`/`PrivacyPage.tsx`.
3. **Then:** update the backend tests (A's area) and frontend tests (B's area) — can be two subagents in parallel — and finally run the full verification yourself.

Fix the API contract (field names above) before spawning so A and B don't drift; review each subagent's diff before merging results.
