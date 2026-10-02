# Plan: advisor skills (on-demand expertise + their own tools)

Builds on the OpenRouter migration (`docs/plans/openrouter-migration.md`).

## Goal

Make the advisor capable of three things it does only shallowly today:

1. **Proper financial analysis of the user's own data**: cash-flow trends, spending by category over time, savings rate, budget variance, anomalies, debt and net-worth trajectory. The output is a structured report.
2. **Report emails**: well-formatted reports (headings, tables, key figures) sent to the user, optionally with a PDF attachment, and optionally on a schedule.
3. **Investment research and advice beyond current holdings**: screen the market for candidates, research a company in depth (statements, estimates, valuation, peers, news), and judge fit against the user's profile and portfolio. The result is a ranked shortlist with reasoning.

## Concept: a skill = method + its own tools

```
backend/app/ai_skills/
  __init__.py              # loader + registry
  <skill_name>/
    SKILL.md               # frontmatter + methodology (what a professional would do)
    tools.py               # optional: TOOLS + DISPATCH, same shape as ai_tools*.py
```

`SKILL.md` frontmatter:

```yaml
name: equity-research
description: When to use it (one or two sentences; this is all the model sees until it loads the skill)
tools: [get_financial_statements_tool, get_analyst_estimates_tool, dcf_valuation_tool]  # this skill's own tools
uses: [get_company_research_tool, compare_symbols_tool]   # existing core tools it relies on (validated)
max_rounds: 20             # raises AI_CHAT_MAX_TOOL_ROUNDS for the turn once loaded (capped by AI_SKILL_MAX_ROUNDS)
requires: [investments]    # feature flags; skill hidden when unmet (e.g. AI_INVESTMENT_TOOLS_ENABLED=false)
```

### Progressive disclosure (what the model sees)

- **Always**: the core tools (today's 28) plus one new tool, `load_skill_tool(name)`. The system prompt lists each skill's `name` and `description` only.
- **After `load_skill_tool("equity-research")`**: the tool result is the SKILL.md body. **From the next round on**, that skill's tools are added to the `tools` array sent to the model. Unloaded skills cost nothing, because their schemas never enter the context.
- Several skills can be active in one turn (e.g. `opportunity-screening` loads `equity-research` for its top picks).
- **Across turns**: the app stays stateless. The `done` event carries `active_skills`, and the client stores them on the turn and echoes `skills: [...]` in the next request, so a follow-up question ("and what about its debt?") keeps the tools without reloading the method. The server validates the list against the registry and ignores unknown names.
- **Slash commands**: typing `/research NVDA` or `/review` in the chat pre-activates the skill server-side (the method is injected as a system note before the first round). The picker lists the available skills, like my `/` menu.

### Validation at import (same spirit as `_build_registry`)

Every `tools:` entry must exist in that skill's `tools.py`. Every `uses:` entry must be a core tool. Tool names must be globally unique. A broken skill fails startup, not mid-conversation.

## Skills (first set)

### 1. `financial-health-review`: analysis of the user's own data
Method: savings rate, income stability, spending by category over 3/6/12 months with month-over-month change, recurring creep (subscriptions that grew), budget variance, debt cost ranking, emergency-fund months, net-worth trend. It finishes with 3–5 prioritised, concrete actions, each with a number attached.
Own tools (DB only, deterministic):
- `get_category_trends_tool(months, top_n)`: per-category monthly totals, change versus the trailing average, and the biggest movers.
- `get_cashflow_trend_tool(months)`: monthly income, expenses, net and savings rate, plus a rolling average.
- `detect_spending_anomalies_tool(months)`: unusually large transactions or months per category (z-score / IQR), and new recurring merchants.
- `get_subscription_audit_tool()`: recurring expenses with price changes over time and their annualised cost.

### 2. `report-email`: write and send a proper report
Method: report structure (summary up top, key figures table, sections, actions, data date and caveats), tone, and length. It never sends unasked; it confirms the subject first if ambiguous.
Own tools:
- `send_report_email_tool(subject, markdown, attach_pdf=false)`: Markdown → sanitised HTML (headings, lists, **tables**, bold) inside the existing `email_templates.render`, with a plain-text alternative. Recipient is still injected server-side and is always the user. This replaces the paragraph-only `send_analysis_email_tool` for reports (keep the old one for short notes, or alias it).
- PDF attachment (phase 2 below): backend renders the same Markdown to PDF and `mail_service` gains attachment support.

### 3. `equity-research`: deep dive on one company or ETF
Method, adapted from Anthropic's open-source financial-services skills (Apache-2.0: comps, DCF, initiation-note structure), rewritten for a personal investor and chat output. The steps are business overview, 3–5 year financial trends (growth, margins, FCF conversion, balance-sheet health), analyst expectations and revisions, valuation from three angles (multiples versus peers, DCF with a sensitivity grid, historical range), bull/bear cases, key risks, catalysts, and a verdict framed as "fair value range + what would change the view". It states which data was missing or stale.
Own tools:
- `get_financial_statements_tool(symbol, statement, period=annual|quarterly, years=4)`: income, balance and cash flow from yfinance, trimmed to ~20 key lines, plus derived growth and margin rows.
- `get_analyst_estimates_tool(symbol)`: EPS/revenue estimates (0q, +1q, 0y, +1y), growth estimates, price-target range, recommendation trend, and recent upgrades/downgrades.
- `find_peers_tool(symbol, n=5)`: same-industry companies with a similar market cap (via `yf.Industry(...).top_companies` and the screener).
- `dcf_valuation_tool(fcf_base, growth_years, growth_rate, terminal_growth, discount_rate, net_debt, shares)`: **deterministic** maths returning per-share value and a WACC × terminal-growth sensitivity grid. The model chooses and justifies inputs; it never does the arithmetic.
- `get_news_digest_tool(symbol, days=30)`: deduplicated recent headlines plus summaries (wraps the existing news provider, with a larger window than `get_company_research_tool`).

### 4. `opportunity-screening`: find candidates beyond current holdings
Method: start from the investor profile (horizon, risk, preferences/exclusions, currency) and the portfolio's gaps (under-weight sectors and regions, concentration). Translate those into screens, run 1–3 screens, filter out what's already held, shortlist 5–8, run a light pass on each (fundamentals + technical + correlation to the portfolio), deep-dive the top 2–3 with `equity-research`, then rank. The output is a table: symbol, why it fits, valuation stance, main risk, suggested position size as a % of investable surplus. It always includes broad ETFs as a baseline alternative, so "buy a cheap index fund" is on the table.
Own tools:
- `screen_stocks_tool(filters, sort_by, limit=25)`: a whitelisted subset of `yf.EquityQuery` fields (region, exchange, sector, industry, market cap, P/E, forward P/E, P/B, EPS growth, revenue growth, dividend yield, debt/equity, beta, avg volume). The model passes structured filters; the tool builds the query, so the model never writes free-form query syntax.
- `screen_etfs_tool(filters, limit)`: `yf.ETFQuery` / predefined screens for funds.
- `get_sector_overview_tool(sector, region)`: `yf.Sector`: performance, top companies, top ETFs, industries.
- `portfolio_fit_tool(symbols)`: for each candidate, correlation with the current portfolio, overlap with existing holdings/ETFs, and the concentration after a hypothetical position. Uses the existing price cache and `portfolio_analytics_service`.

### 5. `portfolio-review`: rebalancing and fit (advisor workflow)
Method: drift versus the target allocation implied by the profile, concentration and currency risk, cost (fund expense ratios), tax/fee awareness (generic, no jurisdiction-specific claims), and a rebalance plan that prefers new contributions over selling.
Own tools:
- `rebalance_plan_tool(target_allocation, new_cash=0)`: deterministic trades or contribution split to move toward the target.
- `get_fund_costs_tool()`: expense ratios across held funds and ETFs, with the annual cost in currency.

### 6. `web-research` (optional, feature-flagged `AI_WEB_SEARCH_ENABLED`, default off)
For questions Yahoo data can't answer (regulatory news, product launches, macro).
Own tool:
- `web_search_tool(query, max_results=5)`: uses OpenRouter's web-search plugin on a cheap model and returns titles, URLs and snippets. Search cost is added to the turn's cost and counts toward `AI_TURN_COST_CAP_USD`. Check OpenRouter's current docs and pricing before implementing.

## Cross-cutting

- **Caching**: `ticker.info`, statements, estimates, screens and sector data go into an in-process TTL cache (statements and estimates 12h, screens and sectors 1h, news 30m). A deep-dive must not refetch the same ticker five times.
- **Rounds and cost**: the skill's `max_rounds` raises the turn limit up to `AI_SKILL_MAX_ROUNDS` (default 25). The cost cap still applies. **Last-round fallback**: on the final allowed round, call the model with `tool_choice: "none"` so it must answer with what it has, instead of failing with "Reached maximum tool-call rounds".
- **Model hint**: optional `suggested_model` in frontmatter. When a skill loads on the cheap default model, the UI shows a hint ("deep research works best with a stronger model"); it never switches automatically.
- **Advice guardrails**: the skills keep the existing prompt rules (no price predictions, analyst targets are attributed, no invented figures). Every recommendation names its main risk and its fit with the profile. The server disclaimer is unchanged. No trading or execution tools, ever.
- **UI**: a skill load shows in the tool trail as "Using skill: Equity research". Research tools get readable labels in `aiAdvisorLabels.ts` (en + el). A `/` menu in the composer lists the skills.

## Phases

1. **Framework**: `ai_skills` loader and validation, `load_skill_tool`, per-round dynamic tool list in `run_agent_stream`, `active_skills` round-trip (schema `skills: list[str]` on `AiChatRequest`, `done.active_skills`), slash-command pre-activation, last-round `tool_choice: none` fallback, `AI_SKILL_MAX_ROUNDS`. Tests: validation failures, tools hidden until loaded, round-trip, fallback.
2. **Market data layer**: TTL cache plus `yahoo_market_data` additions (statements, estimates, screen, sector/industry, peers). Unit-tested with yfinance stubbed (no network in tests).
3. **Skills 1–2** (own data + report email), in parallel with **skills 3–5** (research), which depend on phase 2.
4. **Frontend**: tool-trail labels, `/` skill menu, active-skills echo, model hint.
5. **In scope**: PDF attachments (backend Markdown → PDF with a pure-Python renderer that has Greek glyph support; `mail_service` attachment support) and `web-research`. **Deferred**: scheduled reports (APScheduler job: monthly `financial-health-review` emailed on the 1st, opt-in per user).

Parallelisation: after phase 1, the backend phase 2 + skills 3–5, backend skills 1–2, and the frontend phase 4 can be three Sonnet subagents with disjoint files.

## Verification

- `uv run pytest backend/tests -v`; `npm run build && npm run lint && npm run test` (frontend).
- Manual, with a real key and a strong model:
  - "Review my finances for the last 6 months and email me the report"
  - "/research ASML"
  - "Find me 3 investment opportunities that fit my profile and aren't in my portfolio"
  - Then check the email rendering, the tool trail, the per-turn cost, and that nothing hits the round cap.
