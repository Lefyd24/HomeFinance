# Plan 4 — AI-Powered Market Research

**Goal**: on-demand, structured research reports on any ticker. The app gathers fundamentals,
news, analyst data and price context, hands the model a numbered evidence pack, and the model
*synthesises* — it never retrieves, never computes, and never recommends. Every factual claim
carries a citation to a numbered source the user can open.

**Self-contained**: uses the existing DeepSeek integration (`app/services/ai_service.py`,
`app/routers/ai_chat.py`) and the existing Yahoo provider
(`app/services/investment_providers/yahoo.py`). Optionally enriches with the shared price
cache from plans 1–3, but degrades gracefully without it.

Background and citations: `docs/investments/00-research-foundations.md` — A.3 (the Morningstar
report structure this borrows), A.1 (Barber & Odean on attention bias, which is why the bear
case is structurally mandatory).

---

## Part 0 — Files touched

```
backend/app/models/research_report.py                NEW   ResearchReport, ResearchSource
backend/app/services/research/__init__.py            NEW
backend/app/services/research/collector.py           NEW   evidence-pack assembly (all I/O)
backend/app/services/research/prompt.py              NEW   prompt construction + schema
backend/app/services/research/validator.py           NEW   citation + advice-guardrail checks
backend/app/services/research_service.py             NEW   orchestration + streaming
backend/app/routers/research.py                      NEW   /api/research
backend/app/schemas/research.py                      NEW
backend/app/config.py                                EDIT
backend/app/main.py                                  EDIT  include_router
backend/alembic/versions/xxxx_research_reports.py    NEW
backend/tests/test_research_collector.py             NEW
backend/tests/test_research_validator.py             NEW
backend/tests/test_research_api.py                   NEW

frontend/app/src/investments/ResearchReportPage.tsx        NEW
frontend/app/src/investments/ResearchLibraryPage.tsx       NEW
frontend/app/src/investments/researchApi.ts                NEW
frontend/app/src/investments/useResearch.ts                NEW
frontend/app/src/investments/widgets/ReportSection.tsx     NEW
frontend/app/src/investments/widgets/CitationRef.tsx       NEW
frontend/app/src/investments/widgets/BullBearPanel.tsx     NEW
frontend/app/src/investments/widgets/SourceList.tsx        NEW
frontend/app/src/investments/widgets/ReportProgress.tsx    NEW
frontend/app/src/investments/CompanyResearchPage.tsx       EDIT  "Generate research report" entry point
frontend/app/src/App.tsx                                   EDIT  routes
frontend/app/src/locales/{en,el}/investments.json          EDIT
```

---

## Part 1 — Architecture principle

> **Scope note (added with plan 5).** Everything in this section — "no tool-calling", "do not
> extend the chat agent", "never recommend an action" — governs **this feature: the persisted,
> citable research report**. It does *not* govern the conversational advisor, which
> [`05-portfolio-advisor-agent.md`](./05-portfolio-advisor-agent.md) built by deliberately taking
> the opposite position on both points. The difference is the subject: a report is read later,
> detached from any particular person, and must not carry a recommendation; a conversation knows
> whose emergency fund, horizon and concentration it is reasoning about, which is what makes an
> opinionated answer defensible. See plan 5 Part 0 for the full comparison. This plan is
> otherwise unimplemented.

**The model synthesises; it does not retrieve and it does not calculate.**

Everything factual is gathered by Python, assigned a source id, and placed in the prompt. The
model's only job is to organise, contextualise and argue both sides. This buys three things:

1. Hallucinated numbers become structurally hard — every figure the model can state is one we
   put in front of it, and the validator checks that stated figures appear in the pack.
2. Citations are verifiable, because source ids are ours.
3. The report is reproducible and auditable — we store the evidence pack alongside the output.

**No tool-calling.** `ai_service.run_agent_stream` is a tool-calling agent for the user's own
financial data; this is a different shape of problem — one large context, one structured
output. Reuse the `OpenAI` client construction and the SSE event vocabulary from
`ai_service.py`, but write a separate, simpler generator. Do not extend the chat agent.

---

## Part 2 — Evidence collection (`research/collector.py`)

```python
@dataclass
class Evidence:
    sources: list[Source]           # numbered S1..Sn, each with kind/title/url/published
    facts: dict                     # the structured, pre-computed blocks below
    missing: list[str]              # what could not be fetched, surfaced to the user
    collected_at: datetime
```

Depth modes:

| | quick | deep |
|---|---|---|
| News articles | 8 | 35 |
| Fundamentals | `.info` snapshot | + 4y income statement, balance sheet, cash flow |
| Analyst data | consensus + mean target | + `upgrades_downgrades` (last 90 days), `eps_trend`, `growth_estimates`, `earnings_history` |
| Price context | 1y return, 52w range, volatility | + drawdown stats, 3y/5y returns, beta vs benchmark |
| Peers | — | sector peer multiples (see §2.3) |
| Model call | single pass | map-reduce over news, then synthesis |
| Target latency | < 20 s | < 90 s |

### 2.1 Blocks, and where each comes from

All calls go through `yfinance` and are wrapped individually — **one failing block must never
fail the report**. Each block records its own provenance string.

```python
profile      = yahoo_market_data.get_company_profile(symbol)     # existing, reuse verbatim
news         = yahoo_market_data.get_news(symbol=symbol, limit=N) # existing, reuse verbatim
tk           = yf.Ticker(symbol)
analyst      = { "price_targets": tk.analyst_price_targets,       # dict: low/high/mean/median/current
                 "recommendations": tk.recommendations,           # DataFrame: strongBuy/buy/hold/sell/strongSell by period
                 "upgrades": tk.upgrades_downgrades,              # DataFrame: firm, from/to grade, action, date
                 "eps_trend": tk.eps_trend,
                 "growth": tk.growth_estimates,
                 "earnings_history": tk.earnings_history }        # EPS actual vs estimate + surprise %
financials   = { "income": tk.income_stmt, "balance": tk.balance_sheet,
                 "cashflow": tk.cashflow }                         # deep mode only
fund         = tk.funds_data                                       # ETFs: expense ratio, holdings, sector weights
holders      = { "institutional": tk.institutional_holders,
                 "insider": tk.insider_transactions }              # deep mode only
```

`yfinance` returns pandas objects; convert to plain lists of dicts with **rounded** numbers and
ISO dates before they reach the prompt. Truncate income-statement rows to the ~12 line items
that matter (Total Revenue, Gross Profit, Operating Income, Net Income, EBITDA, Diluted EPS,
plus the cash-flow trio) — the full statement is 60+ rows of noise that will crowd out the
news.

### 2.2 Derived facts computed in Python, never by the model

The model is bad at arithmetic and will confidently produce a wrong CAGR. Precompute and label:

- Revenue and EPS CAGR over the available years; YoY growth per year.
- Margin series (gross, operating, net) per year and their direction.
- FCF yield, ROE, debt/equity, net-debt/EBITDA, interest coverage, current ratio.
- Position within the 52-week range as a percentage.
- 1y/3y/5y total return and the same for the benchmark, plus max drawdown (via the shared
  `analytics` module when available; otherwise from a single `yf.download`).
- Analyst dispersion: `(high − low) / mean` of price targets, and the implied upside/downside
  of the mean target versus the current price — stated as *what analysts think*, never as a
  target the app endorses.
- Consensus counts and the *change* in counts versus 1 and 3 months ago (from
  `recommendations`, which is period-indexed) — "the consensus has shifted" is a real fact and
  the model cannot derive it from a single snapshot.
- Earnings surprise history: beat/miss and surprise % for the last 4 quarters.
- **Piotroski F-score** (optional, deep mode, non-financial issuers): nine binary accounting
  tests, all computable from the three statements. Include the nine components, not just the
  total, so the report can explain it.

### 2.3 Peer comparison (deep mode)

There is no free peer-list API. Pragmatic approach: a curated static map of ~30 sector/industry
→ representative peer tickers in `research/peers.py`, matched on the profile's `sector` and
`industry`, capped at 5 peers, each fetched for market cap, trailing/forward P/E, P/B,
EV/EBITDA and net margin. Compute the peer **median** and pass it alongside the subject's
values — this is the Bloomberg `EQRV` idea from the research doc §A.3, and it is what turns
"P/E of 28.5" into an interpretable statement. If no peer group matches, set
`missing.append("peer_group")` and the report simply omits that comparison rather than
inventing a sector average.

### 2.4 Source numbering

Every fact gets a citable source:

```
S1  Yahoo Finance — company profile & key statistics (fetched 2026-08-07)
S2  Yahoo Finance — income statement FY2022–FY2025
S3  Yahoo Finance — analyst consensus & price targets (fetched 2026-08-07)
S4  Reuters via Yahoo Finance — "Apple faces EU probe over…" (2026-08-03) — <url>
S5  Bloomberg via Yahoo Finance — "…" (2026-08-01) — <url>
…
```

Persisted as `ResearchSource` rows so the citation links keep working after the article
scrolls out of Yahoo's feed — the existing news implementation caches stories only in a
256-entry in-process `OrderedDict` (`investment_providers/yahoo.py`), so a stored report
would otherwise develop dead citations within hours.

### 2.5 Failure and degradation

| Failure | Behaviour |
|---|---|
| Symbol not found | 404 before any model call |
| News empty | Proceed; `missing=["news"]`; the "Recent developments" section renders "No recent news found in the last 30 days" and the model is told not to invent any |
| Analyst data empty (common for ETFs, non-US small caps) | Section omitted entirely, `missing` records it |
| Financials empty (ETFs, crypto) | Switch to the **fund** or **crypto** report template (§3.4) |
| Partial `.info` | Missing fields are omitted from the pack, never sent as `null` — a model shown `"trailingPE": null` will write about it |
| Yahoo rate-limited | 502 with a retry hint; do **not** call the model and burn tokens on an empty pack |
| DeepSeek not configured | 503 with `configured: false`, mirroring `GET /api/ai/status` |

---

## Part 3 — The model call (`research/prompt.py`, `research_service.py`)

### 3.1 Structured output

DeepSeek's OpenAI-compatible API supports `response_format={"type": "json_object"}`. Use it,
and validate the result against a Pydantic model — the JSON mode guarantees parseable JSON,
not correct *shape*, so validation is not optional. On a validation failure, retry once with
the validation error appended to the conversation; on a second failure, return 502 with the
raw output stored for debugging (never shown to the user).

```python
class ReportPayload(BaseModel):
    executive_summary: str = Field(min_length=80, max_length=700)
    what_it_does: str
    fundamentals_narrative: str
    recent_developments: RecentDevelopments      # themes: list[Theme], each with a name,
                                                 # article_count, summary, citations
    analyst_view: str | None
    risks: list[RiskItem] = Field(min_length=3, max_length=5)
    bull_case: str = Field(min_length=200, max_length=1400)
    bear_case: str = Field(min_length=200, max_length=1400)
    uncertainty: Literal["low", "medium", "high", "very_high"]
    uncertainty_reason: str
    data_gaps: list[str]

class RiskItem(BaseModel):
    title: str = Field(max_length=80)
    detail: str
    citations: list[str]        # ["S4","S7"]
```

Design choices that force balance **structurally** rather than by asking politely (the
Morningstar pattern, research doc §A.3):

- `bull_case` and `bear_case` have the *same* length bounds. A model that writes 900 words of
  bull and 200 of bear fails validation and gets retried.
- `risks` has a minimum of 3 — "there are no significant risks" is not an available output.
- `uncertainty` is a required enum with a required reason. Hedging must be committed to a
  field, not diffused into prose.

### 3.2 System prompt

Follows the style of the existing `SYSTEM_PROMPT` in `ai_service.py` — terse, constraint-first.

```
You are a research analyst writing an objective briefing on a financial instrument for a
private individual. You are given a numbered evidence pack. Follow these rules exactly.

FACTS
- Use ONLY the evidence pack. If a fact is not in the pack, you do not know it. Never recall
  facts about this company from your own knowledge — your training data is out of date and
  the user cannot verify it.
- Every factual claim must cite its source inline as [S3] or [S4][S7]. Claims without a
  citation will be rejected.
- Do not perform arithmetic. Every ratio, growth rate and return you need is already computed
  in the pack. Quote them; do not derive new ones.
- Where the evidence is thin, mixed or absent, say so explicitly. "Analyst opinion is split
  (12 buy, 11 hold, 5 sell) with no clear consensus [S3]" is a better sentence than picking
  a side.

WHAT YOU MUST NOT DO
- Never recommend an action. Do not write "buy", "sell", "hold", "accumulate", "avoid",
  "should", "we like", "attractive entry", "undervalued", "overvalued", or a price target of
  your own. You may report that ANALYSTS hold such views, attributed and cited.
- Never predict a price or a direction. You may report what analysts forecast, cited.
- Never describe the instrument as suitable or unsuitable for anyone.

BALANCE
- The bull case and the bear case must be argued with equal seriousness and similar length.
  Write each as if it were the only thing you believed. Ground both in the pack, with
  citations.
- Risks must be specific and drawn from the evidence: "40% of revenue from a single customer
  [S2]" or "EU antitrust decision expected in Q3 [S6]", not "market risk" or "competition".

STYLE
- Plain language. Explain any term a non-specialist would not know, in the same sentence.
- Give numbers context: "P/E of 28.5, against a sector median of 22.1 [S1][S9]" — never a
  bare multiple.
- Return a single JSON object matching the schema. No markdown code fences.
```

### 3.3 Evidence pack format

A single user message, sections delimited by markers, numbers pre-rounded, dates ISO. Ordering
matters — put the structured facts first and the news last, because with a long news list
models tend to over-weight whatever is nearest the instruction. Guard the total: truncate news
summaries to ~600 characters each and cap the pack at
`RESEARCH_MAX_PROMPT_CHARS = 120_000`, dropping the oldest articles first and recording the
drop in `data_gaps`.

### 3.4 Templates by instrument type

The section set varies; the schema is the same with optional sections nulled.

- **stock** — the full set above.
- **etf / mutual fund** — replaces fundamentals with: strategy and index tracked, **expense
  ratio** (the highest-signal fund fact per Bogle, research doc §A.3), AUM, holdings
  concentration, sector/geography weights, tracking difference, yield. Risks are structural
  (concentration, currency, closure/liquidity, index methodology). Bull/bear becomes
  "the case for this exposure" / "what could disappoint".
- **crypto** — no fundamentals; supply schedule, market cap, dominance, volatility, and an
  explicit statement that traditional valuation does not apply. Risks emphasise regulatory,
  custody and volatility.
- **index** — brief; constituents, methodology, and a note that a price index excludes
  dividends.

### 3.5 Streaming

Report generation takes 15–90 s. A spinner for 90 s reads as a hang. Stream SSE using the
exact event vocabulary and `StreamingResponse` configuration already used by
`routers/ai_chat.py` (`media_type="text/event-stream"`, `Cache-Control: no-cache`,
`X-Accel-Buffering: no` — the last one matters behind the Tailscale/proxy setup described in
`CLAUDE.md`).

Events:
```
{"type":"stage","stage":"collecting","detail":"Fetching company fundamentals"}
{"type":"stage","stage":"collecting","detail":"Reading 32 news articles"}
{"type":"stage","stage":"synthesizing"}
{"type":"section","name":"executive_summary","content":"…"}   # deep mode, as each completes
{"type":"done","report_id":42}
{"type":"error","message":"…"}
```

For deep mode's map-reduce, emit a `stage` event per news batch so the progress is truthful
rather than decorative. Since the payload is one JSON object, per-section streaming requires
either incremental JSON parsing or two calls; **simplest correct approach**: stream stage
events during collection and the map phase, then emit the whole validated report at the end.
Do not fake token streaming of a structured payload.

---

## Part 4 — Validation (`research/validator.py`)

Runs on the parsed payload before anything is persisted or shown.

1. **Citation integrity** — extract every `[Sn]` via `re.findall(r"\[S(\d+)\]", text)` across
   all prose fields. Any id not in the evidence pack → **reject and retry once**. A dangling
   citation is worse than none: it looks verified and is not.
2. **Citation coverage** — count sentences containing a digit or a percentage sign that carry
   no citation. If more than 20% of such sentences are uncited, retry once with that feedback.
   Below the threshold, flag the report `coverage_warning` rather than failing — a hard
   requirement here produces citation-spam.
3. **Number grounding** — extract numeric tokens from the prose and check each against the set
   of numbers present in the evidence pack (with rounding tolerance and a small allowlist for
   years, counts and ordinals). Unmatched numbers are recorded in `ungrounded_numbers` and
   shown to the *developer* in logs; a count above 5 triggers one retry. This is the strongest
   available hallucination check and it is pure Python.
4. **Advice guardrail** — regex the prose for a banned-vocabulary list
   (`\b(you should|we recommend|i recommend|buy now|strong buy|time to buy|worth buying|
   avoid this|dump|attractive entry|undervalued|overvalued|price target of)\b`, case-insensitive),
   **excluding spans that are attributed** (a sentence containing "analysts", "consensus",
   "according to" plus a citation is allowed to contain "strong buy" because that is the name
   of a rating category). A hit outside an attributed span → retry once, then reject with 502.
   Log every hit — a rising hit rate means the prompt needs work.
5. **Balance check** — `abs(len(bull) − len(bear)) / max(len) > 0.5` → retry once.
6. **Disclaimer** — appended by the **server**, from an i18n key, after validation. Never
   generated by the model, so it can never be omitted, softened or reworded.

The validator is where this feature's integrity actually lives. It is testable without a
network or a model: feed it hand-written payloads and assert the verdicts.

---

## Part 5 — Persistence

```python
class ResearchReport(Base):
    __tablename__ = "research_reports"
    id            = Column(Integer, primary_key=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    symbol        = Column(String(50), nullable=False, index=True)
    name          = Column(String(200), nullable=True)
    quote_type    = Column(String(20), nullable=True)
    depth         = Column(String(10), nullable=False)          # quick | deep
    language      = Column(String(5), default="en")
    payload       = Column(Text, nullable=False)                # validated ReportPayload JSON
    evidence      = Column(Text, nullable=False)                # the pack, for audit/reproduction
    facts_snapshot= Column(Text, nullable=False)                # numbers as of generation
    model         = Column(String(50), nullable=True)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    warnings      = Column(Text, nullable=True)                 # JSON list
    created_at    = Column(DateTime, default=datetime.utcnow, index=True)

class ResearchSource(Base):
    __tablename__ = "research_sources"
    id         = Column(Integer, primary_key=True)
    report_id  = Column(Integer, ForeignKey("research_reports.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    ref        = Column(String(8), nullable=False)     # "S4"
    kind       = Column(String(20), nullable=False)    # profile|financials|analyst|news|price|peers
    title      = Column(String(400), nullable=False)
    url        = Column(String(1000), nullable=True)
    publisher  = Column(String(120), nullable=True)
    published_at = Column(DateTime, nullable=True)
```

Storing `evidence` is the difference between a report and a black box: a user can, months
later, see exactly what the model was shown. It also makes regressions debuggable when the
prompt changes.

**Reuse window**: an identical `(user, symbol, depth, language)` request within
`RESEARCH_CACHE_TTL_HOURS` (default 12) returns the stored report with `cached: true` and its
age, plus a "Generate a fresh report" action. Markets move; a day-old report should be
labelled, not silently reused, and never silently regenerated at cost.

---

## Part 6 — API (`routers/research.py`)

```
GET  /api/research/status                       -> {configured: bool, quota_remaining: int}
POST /api/research/{symbol}?depth=quick|deep    -> SSE stream, ends with report_id
GET  /api/research/reports?symbol=&limit=       -> [ReportSummary]
GET  /api/research/reports/{id}                 -> ReportDetail (payload + sources)
DELETE /api/research/reports/{id}
```

All `Depends(get_current_user_authenticated)`; every query filtered by `user_id`.

Rate limiting via `app/utils/rate_limit.py`: **5 deep reports/hour** and **20 quick/hour** per
user. Each deep report is 40–120k prompt tokens; without a limit a loop in the UI becomes a
real bill. `GET /status` returns the remaining quota so the UI can disable the button with a
reason rather than failing on click.

`GET /api/research/status` mirrors the existing `GET /api/ai/status` pattern — `configured` is
`bool(settings.DEEPSEEK_API_KEY)`.

---

## Part 7 — UI

Routes: `/investments/research/:symbol/report` (generate + view) and
`/investments/research/reports` (library). Entry points: a primary "Generate research report"
button on the existing `CompanyResearchPage`, plus an action on ticker search results and on
each holding.

### 7.1 Generation flow

```
┌ Symbol header (reuse CompanyResearchPage's)
├ Depth selector — as a choice with stated costs, not a jargon toggle:
│   ( • Quick     ~15 s · 8 news articles · key fundamentals )
│   ( ○ In depth  ~60 s · 35 articles · 4 years of financials · analyst history · peers )
│                                                        [Generate report]
├ ReportProgress (while streaming)
│   ✓ Company fundamentals        ✓ 4 years of financials
│   ✓ 32 news articles            ⟳ Analyst estimates
│   ○ Writing the report
│   caption: "Reading the sources. This takes about a minute for an in-depth report."
└ Report
```

`ReportProgress` uses the existing `Spinner` and `Progress` components. The stage list is
concrete and truthful — it maps 1:1 to the SSE `stage` events.

### 7.2 Report layout

```
┌ Header: AAPL · Apple Inc · generated 7 Aug 2026, 14:32 · Quick
│         [Uncertainty: Medium ⓘ]  [Regenerate] [Delete]  (if cached: "12 hours old")
│
├ Tile "In short"  — executive summary, larger type, no citations shown inline
│                     (they are there in the markup; the summary reads clean and the
│                      citation dots appear on hover — the 15-second read must be uncluttered)
│
├ Tile "What it does"
├ Tile "The numbers"       fundamentals narrative + a compact metric grid using MetricWithHelp
│                          from plan 1's glossary; each metric shows the peer median beside it
├ Tile "What's happening"  themes as sub-blocks: theme name · "5 of 32 articles" ·
│                          summary · the contributing article links
├ Tile "What analysts think"  consensus distribution as a small stacked bar
│                          (strong buy → strong sell), mean target with the high/low range and
│                          the dispersion, recent upgrades/downgrades as a timeline.
│                          Caption: "This is what sell-side analysts published. Analyst
│                          targets are frequently wrong and are shown here as information
│                          about market expectations, not as a forecast."
├ Tile "Risks"            3–5 named risks, each with its citations
├ BullBearPanel           two columns, equal width, equal visual weight, side by side on
│                          desktop and as tabs on mobile. Deliberately no colour coding —
│                          green-bull/red-bear would nudge the reader toward a conclusion the
│                          report is not making.
├ SourceList              every source numbered, linked, with publisher and date; news items
│                          open in a new tab. Grouped by kind.
└ Disclaimer footer       server-generated, always present
```

### 7.3 Citations

`CitationRef` renders `[S4]` as a small superscript button. Click/hover opens a `Popover`
with the source title, publisher, date and an "open" link; clicking the number also scrolls
and highlights the entry in `SourceList`. On mobile it is a tap target of at least 24 px —
superscripts are otherwise untappable.

Parsing: the payload prose contains literal `[Sn]` tokens. Render with a small splitter that
tokenises on `/\[S\d+\]/` and interleaves `CitationRef` elements. **Do not** use
`dangerouslySetInnerHTML`; the model's output is untrusted text. (`dompurify` and `marked` are
project dependencies, but there is no reason to let the model emit markup at all — the schema
says plain text, and the validator can reject a payload containing `<`.)

### 7.4 Library page

Cards grouped by symbol, showing depth badge, age, uncertainty rating and the first line of
the executive summary. Filter by symbol; sort by date. Multiple reports on the same symbol
over time are a feature — "here is what the picture looked like three months ago" — so show
them as a per-symbol timeline rather than deduplicating.

### 7.5 States

- **Not configured**: an `Empty` state explaining that `DEEPSEEK_API_KEY` is unset, with the
  README pointer. Same treatment the AI chat feature uses.
- **Quota exhausted**: the button is disabled with the reset time stated.
- **Generation failure**: the collected evidence is still shown ("we gathered these sources
  but the write-up failed") with a retry — the collection is the expensive-in-latency part and
  throwing it away is wasteful and feels broken.
- **Thin data** (a small non-US listing): the report renders with fewer sections and a
  prominent `data_gaps` list. This is the honesty principle: a short report about a
  data-poor instrument is the correct output.
- **Mobile**: sections stack; the bull/bear panel becomes tabs with the tab labels showing
  both are present; the source list collapses to a disclosure.

### 7.6 Copy for the plain-language layer

Added to `metricGlossary.ts` (plan 1 §4.1):

- **uncertainty.body**: "How much confidence the underlying data supports. High uncertainty
  means the sources disagree, are sparse, or the business is hard to predict — it is a
  statement about the *evidence*, not a warning about the investment."
- **analystTarget.body**: "The average price analysts covering this company published as their
  12-month expectation. Studies consistently find these are optimistic on average and are
  frequently wide of the mark. They are useful as a read on what the market expects, not as a
  prediction."
- **consensusSplit.body**: "How the analysts covering this company are distributed across
  ratings. A wide split means professionals disagree — which is more informative than a
  headline 'buy' rating, because it tells you the answer isn't obvious."
- **reportBasis.body**: "This report was written by an AI from the numbered sources listed at
  the bottom. It organises and summarises public information — it has no private insight, no
  view of the future, and no opinion about what you should do."

The server-generated disclaimer, verbatim:

> "This report is a synthesis of publicly available information, generated automatically. It
> is not investment advice, not a recommendation, and not a forecast. Facts are drawn from the
> numbered sources listed above; the analysis is an AI's organisation of those sources and may
> contain errors. Verify anything you intend to act on. The decision is yours."

---

## Part 8 — Config

```python
RESEARCH_ENABLED: bool = True
RESEARCH_MODEL: str | None = None            # defaults to DEEPSEEK_MODEL
RESEARCH_QUICK_NEWS_COUNT: int = 8
RESEARCH_DEEP_NEWS_COUNT: int = 35
RESEARCH_MAX_PROMPT_CHARS: int = 120_000
RESEARCH_CACHE_TTL_HOURS: int = 12
RESEARCH_QUICK_PER_HOUR: int = 20
RESEARCH_DEEP_PER_HOUR: int = 5
RESEARCH_MAX_RETRIES: int = 1                # validation retries
```

Reuses `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` from `config.py`. Per
`CLAUDE.md`, the feature is optional and feature-flagged: with no key, `GET /status` returns
`configured: false` and the UI hides the entry points.

---

## Part 9 — Tests

`test_research_collector.py` (monkeypatched `yfinance`, no network):
1. Every block failing individually still yields a usable pack with the right `missing` entries.
2. Empty news → `missing=["news"]`, and the pack contains no news section at all (rather than
   an empty one the model could pad).
3. ETF input selects the fund template and includes the expense ratio.
4. Pandas objects are fully converted — assert the serialised pack contains no `NaN`,
   `Timestamp` or `nan` tokens (the same class of bug `_safe_float` exists for in
   `investment_providers/yahoo.py`).
5. Oversized packs truncate oldest-news-first and record it.
6. Derived facts: revenue CAGR and margin series computed from a fixed statement fixture match
   hand-calculated values.

`test_research_validator.py` (no model, hand-written payloads) — **the most important file**:
1. A dangling `[S9]` in a 5-source pack is rejected.
2. A payload with numbers absent from the pack populates `ungrounded_numbers`.
3. "You should buy this stock" is rejected.
4. "Analysts rate it strong buy (12 of 28) [S3]" is **accepted** — attribution + citation.
5. A 900-word bull case with a 150-word bear case fails the balance check.
6. `risks` with 2 items fails schema validation.
7. The disclaimer is present on output even when the model omitted one.
8. A payload containing `<script>` is rejected.

`test_research_api.py`: 503 when unconfigured; SSE event ordering; the rate limiter's counting;
ownership isolation on report reads; cache reuse within the TTL and the `cached` flag.

**Do not write a test that calls DeepSeek.** Fixture the client with a stub returning canned
payloads, in keeping with the existing test suite's offline discipline
(`conftest.py` deliberately keeps the app off the network).

---

## Part 10 — Build order

1. `collector.py` + its tests — the pack is the product; the model is a formatter over it.
2. `validator.py` + its tests, written before the first real model call.
3. `prompt.py` + `research_service.py` + the endpoint, quick mode only.
4. Report page with citations and the source list.
5. Deep mode, map-reduce, peer comparison.
6. Library + caching + quotas.

## Part 11 — Definition of done

- `uv run pytest backend/tests -v` green; `npm run build` clean.
- A quick report on `AAPL` returns in under a minute with an executive summary readable in
  15 seconds, 3–5 named specific risks, symmetric bull/bear cases, and every numeric claim
  carrying a working citation.
- Deleting a source article from Yahoo's live feed does not break the stored report's links.
- The validator rejects a hand-crafted payload containing advice, and the rejection is logged.
- A report on a data-poor instrument renders short and says why, rather than padding.
- The disclaimer is present on every report and is not model-generated.
