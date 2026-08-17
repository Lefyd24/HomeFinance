# Plan 5 — The portfolio advisor agent

**Goal**: the AI chat agent can see the portfolio, research any instrument, and give *direct,
personal investment advice* grounded in the user's actual balance sheet — with every number
computed in Python and every recommendation carrying its reasoning, its main risk, and what
would make it wrong.

**Status**: implemented.

---

## Part 0 — How this differs from plan 4, and why

Plan 4 (`04-ai-market-research.md`) states, of the research report:

> **No tool-calling.** … Do not extend the chat agent.
> Never recommend an action. Do not write "buy", "sell", "hold" …

**That rule stands, for that feature.** A research report is a persisted, citable document about
an instrument. It is read later, possibly shared, and detached from the person who generated
it — so it must not carry a recommendation, and it must be a single-pass synthesis over a
numbered evidence pack.

This plan is a different shape of problem, and takes the opposite posture on both points:

| | Plan 4 — research report | Plan 5 — advisor agent |
|---|---|---|
| Shape | One large context, one structured output | Conversational, multi-round tool calling |
| Subject | An instrument | *This user*, and their whole financial position |
| Output | A persisted document | An answer in a conversation |
| Recommends? | **Never** | **Yes — that is the point** |
| Grounding | Numbered evidence pack + citation validator | Deterministic tools + an investor profile |

The distinction that makes an opinionated answer defensible here is that the advisor knows *who
it is advising*: their emergency fund, their horizon, their concentration, their stated limits.
A report cannot know that; a conversation can. Advice without a subject is a recommendation
into the void, which is exactly what plan 4 was right to refuse.

---

## Part 1 — The load-bearing principle

> **The model decides and explains. Python computes.**

An LLM producing a confident, plausible, wrong percentage is the characteristic failure mode of
AI financial advice. So every figure the advisor can state comes out of a tool:

- Growth projections → `project_investment_tool` (wraps `advisor_service.InvestmentCalculator`)
- Pay-off-versus-invest → `compare_invest_vs_debt_payoff_tool` (wraps `LoanCalculator`)
- Weights, HHI, allocation → `portfolio_analytics_service`
- Returns, Sharpe, drawdown, beta → the existing `analytics/` primitives
- Company facts → the existing Yahoo provider, never the model's training data

The system prompt says "Never do arithmetic" in those words. The tools exist to make that
instruction followable rather than aspirational.

---

## Part 2 — Files

```
backend/app/models/investor_profile.py                NEW   InvestorProfile, InvestorProfileRevision
backend/app/services/investor_profile_service.py      NEW   validation + revision log (one owner)
backend/app/routers/investor_profile.py               NEW   /api/investor-profile
backend/app/schemas/investor_profile.py               NEW
backend/app/services/portfolio_analytics_service.py   NEW   overview / positions / allocation / risk
backend/app/services/ai_tools_investments.py          NEW   portfolio + research tools
backend/app/services/ai_tools_planning.py             NEW   whole-picture bridge tools
backend/app/services/ai_prompt.py                     NEW   per-request system prompt + disclaimer
backend/app/services/ai_service.py                    EDIT  registry, truncation, usage, events
backend/app/services/ai_tools.py                      EDIT  profile read/write tools + schemas
backend/app/routers/ai_chat.py                        EDIT  rate limit, prompt builder, disclaimer
backend/app/routers/investments.py                    EDIT  position helpers moved to the service
backend/app/config.py                                 EDIT
backend/alembic/versions/022_investor_profile.py      NEW

frontend/app/src/account-settings/InvestorProfilePage.tsx   NEW
frontend/app/src/account-settings/investorProfileApi.ts     NEW
frontend/app/src/account-settings/useInvestorProfile.ts     NEW
frontend/app/src/ai-advisor/ProfileUpdateCard.tsx           NEW
frontend/app/src/ai-advisor/{aiChatApi,useAiChat,ToolTrail,ChatWidget,aiAdvisorLabels}.*  EDIT
frontend/app/src/locales/{en,el}/{advisor,nav}.json         EDIT
```

---

## Part 3 — The investor profile

Without a risk tolerance, a horizon and a set of constraints, "should I buy more of X" has no
correct answer. `InvestorProfile` is one row per user holding exactly that, and it is injected
into the system prompt on every turn.

**The advisor can write to it.** `update_investor_profile_tool` lets it record something the
user just said ("I'd need this in three years" → `horizon_years`). That is the only model-chosen
write in the app, and it is fenced accordingly:

1. A hardcoded whitelist of editable fields — anything else is an error handed back to the model.
2. Per-field validation (enums, ranges, allocation summing to ~100 ±2).
3. Validate-everything-then-write: a bad field means nothing is written, never half of it.
4. One `InvestorProfileRevision` per changed field, carrying the model's stated `reason`.
5. An SSE `profile_update` event → a card in the chat with the change, the reason, and **Undo**.

The revision log is not decoration. The profile governs every future answer, so a silent,
unreviewable mutation of it would let the advisor quietly reshape the basis of its own advice.
An undo is recorded as a new revision rather than by deleting the old one — the history of what
the advisor did stays intact.

Both the REST router and the tool go through `investor_profile_service.apply_updates`, so the
guardrails cannot exist on one path and not the other.

---

## Part 4 — Portfolio analytics

`portfolio_analytics_service` is new because nothing on the backend computed portfolio-level
allocation or risk: concentration and currency exposure lived client-side in
`portfolioInsights.ts`, and there was no portfolio return series anywhere.

Two rules it inherits and must not break:

**Never sum across currencies.** Positions carry `*_base` columns restating them in their
account's currency. Totals *across accounts* only exist when the accounts agree on a currency;
otherwise they are `None` with a stated reason — the same choice `aggregateTotals` makes on the
frontend. The allocation and risk tools refuse outright rather than return a meaningless
percentage.

**Returns are time-weighted.** `PortfolioSnapshot.total_value` moves when you deposit money, and
a deposit is not a return. Daily returns are `(V_t − F_t) / V_{t−1} − 1`, where `F_t` is the net
external cash flow (deposits and withdrawals only — buys and sells are internal and net to zero
at this level). Without this, a payday reads as a spectacular one-day gain and every downstream
risk metric is wrong. Snapshot gaps longer than 5 days are skipped rather than treated as
returns, and a date counts only when *every* account reported on it.

When snapshot history is too short for the 60 observations `analytics/risk.py` requires, the
service falls back to a synthetic series — today's holdings at today's weights over the period —
and **says so in the result**, including that this flatters a portfolio whose winners were bought
late. The advisor is instructed to report the method alongside the numbers.

Asset classes come from *cached* `MarketSymbolMeta` only. A portfolio of 30 holdings would
otherwise mean 30 network round trips inside one tool call; instead the result reports
`asset_class_coverage_pct` and buckets the rest as `unknown`.

> Known duplication: allocation logic now exists both here and in
> `frontend/app/src/investments/portfolioInsights.ts`. The intended direction is for the frontend
> to read these numbers from the backend; that refactor was deliberately not part of this change.

---

## Part 5 — The tool surface

28 tools, assembled in `ai_service._build_registry()` from per-module `TOOLS`/`DISPATCH` pairs so
each schema lives beside its implementation. A schema without an implementation raises at import
rather than mid-conversation.

**The security boundary**: no schema names `user_id` or `user_email`. They are injected in
`_execute_tool` from the authenticated user, so the model has no way to reach another user's
data or redirect the email tool. `test_ai_tools_investments.py` asserts this over every schema.

| Group | Tools |
|---|---|
| Existing | transactions, totals, balances, budgets, recurring, debts, email |
| Profile | `get_investor_profile_tool`, `update_investor_profile_tool` |
| Portfolio | overview, positions, allocation, risk, investment transactions, position history, watchlist |
| Research | symbol search, company research (sectioned), compare, technical, simulate |
| Planning | net worth, emergency fund, goals, investable surplus, recurring commitments, project investment, invest-vs-payoff |

Two deliberate consolidations keep the list navigable: `get_company_research_tool` takes an
`include` list rather than being five separate tools, and `compare_symbols_tool` reuses
`comparison_service.build_comparison` whole rather than reimplementing risk-adjusted comparison.

`get_investable_surplus_tool` is the one genuinely new computation: average net cashflow, less
an emergency-fund top-up spread over 12 months, less minimum payments on debt above 8%. It
returns every deduction and assumption separately, because it is the number that turns "you
should invest more" into a sentence the advisor can actually defend.

---

## Part 6 — Prompt, cost and safety

`ai_prompt.build_system_prompt(db, user)` replaces the old module constant. It injects **today's
date** (previously absent entirely — the model was guessing what "this month" meant), the
account context, and the profile block, then states the posture: recommend directly, ground it
in named facts, always give the main risk and what would falsify it, never predict a price,
check suggestions against the profile's limits, and never do arithmetic.

The **disclaimer** is emitted by the router as a final SSE event after the answer. It is
server-generated for the same reason plan 4 §4.6 gives: a model-generated disclaimer can be
omitted, softened or reworded, and a server-generated one cannot.

Cost controls, none of which existed before:

- `AI_CHAT_PER_HOUR` (60) — per-user sliding window on `/api/ai/chat`.
- `AI_TOOL_RESULT_MAX_CHARS` (20 000) — oversized tool results have their longest list halved
  until they fit, and are marked `truncated` so the model reports a partial list as partial.
  Without this a five-symbol comparison can exhaust the context window in one round, degrading
  the answer with no visible cause.
- `AI_CHAT_MAX_TOOL_ROUNDS` raised 6 → 10; advice-grade answers legitimately chain
  overview → allocation → risk → surplus → compare → project.
- Token usage logged per request via `stream_options={"include_usage": True}`.
- `AI_INVESTMENT_TOOLS_ENABLED` — feature-flagged like every other integration.

---

## Part 7 — Tests

`test_investor_profile.py`, `test_portfolio_analytics.py`, `test_ai_tools_investments.py`,
`test_ai_chat.py` on the backend; `investmentAdvisor.test.tsx` and `InvestorProfilePage.test.tsx`
on the frontend. **No test calls DeepSeek** — the client is stubbed with canned tool-call
payloads, per `conftest.py`'s offline discipline.

The ones that matter most:

- Every tool schema is asserted free of `user_id`.
- A deposit does not register as a return.
- Totals refuse to exist across mismatched currencies.
- The profile write tool rejects a non-whitelisted field, a bad enum, a missing reason, and an
  allocation that doesn't sum to 100 — writing nothing in each case.
- The disclaimer appears on every answer.

---

## Part 8 — Known limits

- **Tool count.** 28 is toward the upper end of what a model selects reliably from. If selection
  proves unreliable in use, the next move is a cheap routing round that narrows the list per
  turn — not more tools.
- **No conversation persistence.** The transcript still lives in `sessionStorage` and the model
  never sees prior turns' tool results, only prior prose. A long multi-turn analysis re-derives
  context it already had.
- **Sector and geography exposure** are not in the allocation tool, because there is no cached
  sector field. Adding `sector` to `MarketSymbolMeta` would fix this in one migration.
- **Plan 4 is still unimplemented.** The research report, its evidence pack and its citation
  validator do not exist; `get_company_research_tool` is a live lookup, not a cited document.
