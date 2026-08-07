# Plan 2 — Backtesting & Forward Sandbox

**Goal**: "If I had put €5,000 into MSFT on 2022-01-15, what would it be worth?" (retrospective)
and "Track what happens to a hypothetical €5,000 in MSFT from today" (prospective), both saved
into a named library that accumulates into an honest personal track record.

**Self-contained**: depends on the shared `market_data` and `analytics` modules. If plan 1 has
not been implemented, §1 below is the complete contract you need — build those modules here.

Background and citations: `docs/investments/00-research-foundations.md`
(especially A.1 Barber & Odean / Bessembinder, A.2 deflated Sharpe, A.3 GIPS TWR-vs-MWR).

---

## Part 0 — Files touched

```
backend/app/models/investment_analytics.py           NEW/EDIT  MarketPriceBar, MarketSymbolMeta (shared)
backend/app/models/scenario.py                       NEW       Scenario, ScenarioValuation
backend/app/services/market_data/prices.py           NEW/EDIT  shared price cache (§1)
backend/app/services/analytics/*.py                  NEW/EDIT  shared metric library (§1)
backend/app/services/backtest_service.py             NEW       simulation engine
backend/app/services/scenario_service.py             NEW       CRUD + track record + daily update
backend/app/routers/scenarios.py                     NEW       /api/scenarios
backend/app/schemas/scenario.py                      NEW
backend/app/services/scheduler.py                    EDIT      sandbox_update_tick
backend/app/config.py                                EDIT
backend/app/main.py                                  EDIT      include_router(scenarios)
backend/alembic/versions/xxxx_scenarios.py           NEW
backend/tests/test_backtest_engine.py                NEW
backend/tests/test_scenarios_api.py                  NEW
backend/tests/test_scheduler.py                      EDIT      sandbox job registration

frontend/app/src/investments/BacktestPage.tsx            NEW
frontend/app/src/investments/ScenarioLibraryPage.tsx     NEW
frontend/app/src/investments/ScenarioDetailPage.tsx      NEW
frontend/app/src/investments/scenariosApi.ts             NEW
frontend/app/src/investments/useScenarios.ts             NEW
frontend/app/src/investments/widgets/BacktestForm.tsx    NEW
frontend/app/src/investments/widgets/JourneyChart.tsx    NEW
frontend/app/src/investments/widgets/SensitivityStrip.tsx NEW
frontend/app/src/investments/widgets/HonestyPanel.tsx    NEW
frontend/app/src/investments/widgets/TrackRecordTile.tsx NEW
frontend/app/src/App.tsx                                 EDIT routes
frontend/app/src/locales/{en,el}/investments.json        EDIT
```

---

## Part 1 — Shared dependencies (contract)

Only what this plan uses. Full spec in plan `01` §1–2.

```python
# app/services/market_data/prices.py
get_price_history(symbols, start, end, *, db, refresh=False) -> dict[str, pd.DataFrame]
# adjusted daily OHLCV per symbol, ascending date index, cached in market_price_bars,
# fetched via yf.download(..., auto_adjust=True). Raises SymbolNotFound / MarketDataUnavailable.

# app/services/market_data/reference.py
get_risk_free_rate(db, start, end) -> pd.Series   # annualised, from ^IRX, constant fallback
periods_per_year(quote_type) -> int               # 365 crypto, else 252
to_currency(df, from_ccy, to_ccy, db) -> pd.DataFrame

# app/services/analytics/*
simple_returns, cagr, annualized_vol, max_drawdown -> DrawdownStats, ulcer_index
sharpe -> SharpeResult(value, se, ci_low, ci_high, n), sortino, calmar
probabilistic_sharpe(sr_periodic, n, skew, kurt, sr_benchmark)
deflated_sharpe(sr_periodic, n, skew, kurt, n_trials)
market_model(asset_excess, bench_excess, A) -> beta/alpha/r²
```

Two conventions this plan leans on hard:

- Prices are **adjusted** (`auto_adjust=True`), so the default backtest is a **total-return**
  backtest: dividends are implicitly reinvested at the close on the ex-date. The UI must say
  this, and the model offers a `dividend_treatment` field to override it (§2.4).
- `cagr` uses **calendar** days, so a 2020-02-29 entry date and a crypto/equity mix do not
  produce inconsistent annualisation.

---

## Part 2 — The simulation engine

`backend/app/services/backtest_service.py`. Pure computation over frames handed to it —
no DB writes, no HTTP. The scenario service owns persistence.

### 2.1 Inputs

```python
@dataclass(frozen=True)
class ScenarioSpec:
    symbol: str
    start_date: date
    end_date: date | None            # None = "to today" (a backtest) or "ongoing" (forward)
    initial_amount: float            # in `currency`
    currency: str = "EUR"
    contribution_amount: float = 0.0 # DCA
    contribution_freq: str = "none"  # none|weekly|monthly|quarterly
    benchmark: str = "^GSPC"
    cost_bps: float = 10.0           # 0.10% per trade, per the brief
    cost_flat: float = 0.0           # e.g. €5 per trade
    dividend_treatment: str = "reinvest"  # reinvest|cash|ignore
    dividend_withholding_pct: float = 0.0 # e.g. 15 for US withholding on a non-US holder
    kind: str = "backtest"           # backtest|forward
```

### 2.2 Trading-day resolution — the single most common bug class

The user picks a calendar date. It may be a Saturday, a market holiday, before the
instrument's first bar, or after its last. Rules, applied in order and **reported back to the
user**:

1. If `start_date` precedes the symbol's `first_bar_date`, reject with 422 and the message
   "MSFT price history starts on 1986-03-13" — do not silently clamp; the user's mental model
   is wrong and clamping hides that.
2. Otherwise resolve to the **first trading day on or after** `start_date`
   (`idx.searchsorted(start, side='left')`). If it moved, set
   `resolved_start` and `start_note = "2022-01-15 was a Saturday; used the next trading day,
   2022-01-18."`
3. `end_date` resolves to the **last trading day on or before** it. `None` → the last
   available bar. If the last bar is more than 4 calendar days old, set `stale_data: true`
   (a delisted or suspended ticker looks identical to a data outage from here; say "last
   price available is from 2026-07-02" rather than pretending it is current).
4. Contribution dates resolve the same way as `start_date` (next trading day on or after the
   nominal date). Two nominal dates must never collapse onto the same trading day — if they
   do (a long holiday), sum the contributions.

### 2.3 The simulation

Fractional shares are assumed and stated. Whole-share simulation would add a leftover-cash
model that obscures the point and is unrealistic for European brokers anyway (most support
fractional).

```
cash_in            = 0        # total the user "paid in", for MWR and cost-drag display
shares             = 0
cumulative_costs   = 0
cash_from_dividends= 0        # only when dividend_treatment == "cash"
cashflows          = []       # (date, signed amount) for IRR
```

For each contribution event `(t, gross)`, including the initial one:

```
fee     = gross * cost_bps/10_000 + cost_flat
net     = gross - fee
shares += net / price_t                 # price_t = adjusted close on the resolved trading day
cash_in += gross
cumulative_costs += fee
cashflows.append((t, -gross))
```

Daily portfolio value: `value_t = shares_t * price_t + cash_from_dividends_t`.

At the end: `cashflows.append((end, value_end))`. If `end_date` is an explicit exit (a
backtest with a chosen sell date), charge an exit fee and report the net proceeds; if the
scenario simply runs to today, do **not** charge an exit fee — the position is still open —
but show "if you sold today, costs would be €X."

**Benchmark**: identical cashflow schedule, identical fee model, on the benchmark's price
series. This is non-negotiable — a lump-sum benchmark against a DCA strategy compares two
different things and is the most common way backtest comparisons lie. If a contribution date
is not a trading day on the benchmark's calendar (different exchange holidays), resolve it
independently on the benchmark's own calendar; the *nominal* dates match, which is what
matters.

**Dividend handling**:
- `reinvest` (default) — use `auto_adjust=True` closes; nothing extra to do. Note that this
  implicitly reinvests gross, i.e. it assumes zero withholding.
- `cash` — fetch `yf.Ticker(sym).dividends`, use **unadjusted** closes
  (`auto_adjust=False`, `Close`) for the price path, and on each ex-date add
  `shares * dps * (1 - withholding/100)` to `cash_from_dividends`. Requires a second price
  series; fetch and cache it under a `_RAW` suffix key or add an `adjusted: bool` column
  discriminator to the bar table. **Prefer the suffix key** — it keeps the existing unique
  constraint intact.
- `ignore` — unadjusted closes, dividends dropped. Only exists so the user can *see* how much
  of the return was dividends; label it "price only — this understates the real return".

### 2.4 Output metrics

Per leg (scenario and benchmark):

| Field | Definition |
|---|---|
| `final_value` | `shares * last_price + cash_from_dividends` |
| `total_invested` | `cash_in` |
| `profit` | `final_value − cash_in` |
| `total_return_pct` | `profit / cash_in` |
| `twr_cagr` | CAGR of the **unit-value** series (see below) |
| `mwr_irr` | `scipy.optimize.brentq` on the NPV of `cashflows` (research doc §C.16) |
| `annualized_vol`, `sharpe`, `sortino`, `calmar` | on the unit-value daily returns |
| `max_drawdown` | `DrawdownStats` — depth, peak, trough, recovery, days under water |
| `best_month` / `worst_month` | calendar-month returns of the unit-value series |
| `cumulative_costs` | for the cost-drag line |
| `dividends_received` | when `dividend_treatment == "cash"` |

**Unit value** is the critical construct for a DCA scenario: the raw portfolio value rises
when money is added, so its "returns" are contaminated by contributions. Compute a
contribution-neutral series exactly the way a fund NAV works:

```
units_t   = units_{t-1} + net_contribution_t / unit_value_{t-1}
unit_value_t = portfolio_value_t / units_t          # unit_value_0 = 100
```

All time-weighted risk metrics (vol, Sharpe, Sortino, drawdown) run on `unit_value`, never on
`portfolio_value`. Report **both** TWR (from unit value: "how did the investment do") and MWR
(IRR: "how did *you* do, given when you put money in"); with a lump sum they coincide, with
DCA they diverge and the difference is timing luck. Show that sentence when
`|twr − mwr| > 1pp`.

### 2.5 Honesty instruments (the differentiators)

**Entry-date sensitivity.** Re-run the *identical* scenario for entry dates
`start ± {7, 14, 21, 30}` calendar days (8 extra runs, all from the already-cached price
frame, so ~milliseconds). Report min / p25 / median / p75 / max final value, and the
percentile the user's chosen date lands in. This converts "you selected these dates" from a
disclaimer into a measurement: "entering within a month either side of your date produced
final values from €7,100 to €9,400. Your date was in the top quartile of that range."
Only for `kind == "backtest"` — a forward scenario has no alternative entry dates.

**Deflated Sharpe over the user's own trials.** `n_trials` = the count of that user's saved
backtest scenarios (+1 for the current one). Compute `deflated_sharpe(...)` and render:
"You have run 23 backtests. Even with no skill at all, the best of 23 tries would be expected
to show a Sharpe of about 0.61 by luck. This one's is 0.74, which clears that bar by a
modest margin." Suppress when `n_trials < 5` (the correction is meaningless and the message
would be noise).

**Rolling-window win rate.** The share of all rolling 12-month windows inside the period where
the scenario beat the benchmark, plus the worst such window. Kills the single-start-date
artefact.

**Static disclosures**, rendered from i18n keys, not generated:
- *Survivorship bias*: "You can only backtest instruments that still exist and are still
  listed. Companies that went to zero are not in this dataset. Research on the US market
  (Bessembinder, 2018) found the median listed stock underperformed Treasury bills over its
  lifetime — the winners you can still see are the survivors."
- *Hindsight*: "You chose these dates knowing what happened. This shows what did happen in
  this window, not what will happen next."
- *Cost realism*: "This assumes 0.10% per transaction and fractional shares. It excludes
  taxes, currency conversion spreads, bid–ask spreads, and platform account fees."
- *Data*: "Prices are Yahoo Finance daily adjusted closes, which assume dividends are
  reinvested at the closing price on the ex-dividend date."

### 2.6 Edge cases

| Case | Behaviour |
|---|---|
| Symbol has no bars at all | 404, symbol named |
| `start_date` before first bar | 422 with the first available date |
| `start_date >= end_date` | 422 |
| `start_date` in the future | 422 (suggest creating a forward scenario) |
| Gap > 10 trading days inside the window (halt, delisting) | Simulate across it; set `data_gaps: [{start, end, days}]` and surface a warning |
| Currency of the instrument ≠ scenario currency | FX-convert the price series via `to_currency`; set `fx_applied` and note that part of the return is currency movement |
| Contribution frequency yields > 600 events | 422 (weekly over 12 years); cap for sanity |
| Benchmark identical to symbol | Allowed; benchmark comparisons render as zeros with a note |
| `initial_amount <= 0` and no contributions | 422 |
| Whole period is < 30 days | Compute value and return; suppress CAGR/Sharpe/Sortino with "period too short" |

---

## Part 3 — Persistence and the forward sandbox

### 3.1 Models — `backend/app/models/scenario.py`

```python
class Scenario(Base):
    """A saved hypothetical position — retrospective (backtest) or prospective (forward).

    Forward scenarios are revalued nightly by the scheduler; backtests are recomputed on
    read (cheap, and it keeps them correct when the price cache is corrected).
    """
    __tablename__ = "scenarios"
    id            = Column(Integer, primary_key=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name          = Column(String(120), nullable=False)
    note          = Column(Text, nullable=True)      # the decision journal: *why* you thought this
    kind          = Column(String(10), nullable=False)          # backtest | forward
    symbol        = Column(String(50), nullable=False)
    start_date    = Column(Date, nullable=False)
    end_date      = Column(Date, nullable=True)
    initial_amount= Column(Float, nullable=False)
    currency      = Column(String(10), nullable=False, default="EUR")
    contribution_amount = Column(Float, default=0.0)
    contribution_freq   = Column(String(12), default="none")
    benchmark     = Column(String(50), nullable=True, default="^GSPC")
    cost_bps      = Column(Float, default=10.0)
    cost_flat     = Column(Float, default=0.0)
    dividend_treatment = Column(String(12), default="reinvest")
    dividend_withholding_pct = Column(Float, default=0.0)
    status        = Column(String(12), default="active")   # active | closed | error
    last_error    = Column(Text, nullable=True)
    # denormalised for a fast library list — rewritten by the nightly tick
    last_valued_on   = Column(Date, nullable=True)
    last_value       = Column(Float, nullable=True)
    last_return_pct  = Column(Float, nullable=True)
    last_benchmark_return_pct = Column(Float, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ScenarioValuation(Base):
    """One row per forward scenario per trading day. Backtests do not write here."""
    __tablename__ = "scenario_valuations"
    __table_args__ = (UniqueConstraint("scenario_id", "date", name="uq_scenario_valuation"),)
    id            = Column(Integer, primary_key=True)
    scenario_id   = Column(Integer, ForeignKey("scenarios.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    date          = Column(Date, nullable=False)
    value         = Column(Float, nullable=False)
    invested      = Column(Float, nullable=False)
    benchmark_value = Column(Float, nullable=True)
    price         = Column(Float, nullable=True)
```

`ondelete="CASCADE"` plus `cascade="all, delete-orphan"` on the relationship — SQLite needs
`PRAGMA foreign_keys=ON` to enforce it, so rely on the ORM cascade rather than the DB.

### 3.2 Why forward scenarios are stored but backtests are not

A backtest is a pure function of (spec, price history) — recompute it in ~50 ms from the
cached bars. Storing its results would create a staleness problem the moment Yahoo restates a
price after a split.

A forward scenario is *also* recomputable from the same data — but storing the daily
valuation gives two things recomputation cannot: an audit trail that survives a data
correction (so "my scenario's history changed overnight" never happens), and a cheap library
list. Both are written by the nightly job, and the job is idempotent, so a full rebuild is
always available via `POST /scenarios/{id}/rebuild`.

### 3.3 Scheduler job

`backend/app/services/scheduler.py`, alongside the existing `notif_tick`,
`investment_sync_tick` and `bank_sync_tick`:

```python
if app_settings.SCENARIO_TRACKING_ENABLED:
    _scheduler.add_job(
        lambda: run_scenario_valuation_tick(session_factory),
        "cron", hour=app_settings.SCENARIO_VALUATION_HOUR_UTC, minute=30,
        id="scenario_valuation_tick",
    )
else:
    logger.info("Scenario tracking disabled; scenario_valuation_tick not scheduled")
```

Default `SCENARIO_VALUATION_HOUR_UTC = 22` — after the US close (21:00/22:00 UTC depending on
DST) and before midnight, so a "daily" valuation lands on the correct trading date. Follow
the existing file's pattern of gating each job independently and logging when one is skipped.
Deliberately **no** `next_run_time=datetime.now()`: unlike investment sync, there is nothing
urgent about revaluing on boot, and a deploy loop would hammer Yahoo.

`run_scenario_valuation_tick`:

1. One `session_factory()` session, closed in `finally` (mirror `run_tick`).
2. Collect the distinct `(symbol, benchmark)` set across all active forward scenarios and
   fetch each price series **once** — N scenarios on MSFT must produce one Yahoo call.
3. For each active forward scenario: recompute the valuation path from `start_date` to the
   latest bar, and upsert `ScenarioValuation` rows for any dates missing or changed. This
   makes the job **idempotent and self-healing**: a week of container downtime backfills on
   the next run rather than leaving a hole.
4. Update the denormalised `last_*` columns.
5. Catch per-scenario exceptions, write `status="error"`, `last_error=str(exc)[:500]`, log with
   `logger.exception`, and continue — one delisted ticker must not stop the batch. A scenario
   that errors 5 consecutive days flips to `status="closed"` with the reason preserved.
6. Wrap the whole tick in try/except like `run_tick` does, so a scheduler thread never dies.

Add a test in `backend/tests/test_scheduler.py` asserting the job is registered when the
setting is on and absent when off, matching the existing tests there.

**On-demand freshness**: `GET /scenarios/{id}` recomputes from the cached bars if
`last_valued_on` is behind the newest available bar, so a user who opens the app before the
nightly job has run does not see stale numbers.

### 3.4 Track record aggregation

`scenario_service.get_track_record(db, user_id) -> TrackRecord`, over **closed and matured**
scenarios (forward scenarios with ≥ 30 days of history, plus explicitly closed ones):

- `count`, `count_beating_benchmark`, `hit_rate`
- `mean_excess_return` (scenario return − benchmark return, arithmetic mean across scenarios)
- `median_excess_return` (report both; one outlier crypto scenario will dominate the mean)
- `best` / `worst` scenario by excess return
- `hit_rate_p_value`: two-sided binomial test against p = 0.5,
  `scipy.stats.binomtest(k, n, 0.5).pvalue`
- `verdict_key`: `too_few` (n < 10), `no_evidence_of_skill` (p > 0.1),
  `some_evidence` (p ≤ 0.1) — an i18n key, never generated prose

The framing, per Barber & Odean: "Across your 14 matured scenarios, 6 beat the S&P 500 and 8
did not. Average excess return: −2.1 percentage points. With 14 scenarios, a 43% hit rate is
well within what coin-flipping produces (p = 0.79) — this is not yet enough to say anything
about your stock-picking either way."

This must **never** be phrased as a compliment or a criticism, and it must never appear on a
page where the user is about to create a scenario in a way that reads as discouragement.
It lives on the library page.

---

## Part 4 — API

`backend/app/routers/scenarios.py`, mounted in `main.py` with the `/api` prefix like the rest.
All endpoints `Depends(get_current_user_authenticated)`; every query filters on
`Scenario.user_id == current_user.id` (a 404, not a 403, for another user's id).

```
POST   /api/scenarios/preview        body: ScenarioSpec  -> BacktestResult   (no persistence)
POST   /api/scenarios                body: ScenarioSpec + name/note -> ScenarioResponse
GET    /api/scenarios                ?kind=&status=&sort=  -> [ScenarioSummary]
GET    /api/scenarios/{id}                                -> ScenarioDetail (result recomputed)
PATCH  /api/scenarios/{id}           name, note, status only — the spec is immutable
DELETE /api/scenarios/{id}
POST   /api/scenarios/{id}/rebuild   force full revaluation
GET    /api/scenarios/track-record                        -> TrackRecord
```

**The spec is immutable after creation.** Editing the entry date of a saved scenario would
destroy the entire point of the track record — it is a decision journal, and a journal you can
retroactively edit records nothing. Only `name`, `note` and `status` are mutable. State this
in the API docstring and show it in the UI ("Entry terms are locked — that's what makes the
track record meaningful. Create a new scenario to try different terms.")

Rate limit `POST /preview` (it can trigger a cold Yahoo fetch): 30/5 min per user via
`app/utils/rate_limit.py`.

Response shape:

```
BacktestResult
├─ spec_resolved: { resolved_start, resolved_end, start_note|null, end_note|null,
│                   trading_days, fx_applied, data_gaps: [], stale_data: bool }
├─ scenario: LegResult          # §2.4 fields
├─ benchmark: LegResult | null
├─ comparison: { excess_return_pct, excess_cagr, beat_benchmark: bool,
│                rolling_1y_win_rate, worst_rolling_1y, alpha_annual, beta, r_squared }
├─ sensitivity: { entry_dates: [{date, final_value, return_pct}],
│                 min, p25, median, p75, max, chosen_percentile } | null
├─ deflated: { n_trials, expected_max_sharpe, sharpe, dsr } | null
├─ costs: { cumulative, pct_of_final_value, series: [{date, cumulative}] }
└─ series: [ { date, value, invested, benchmark_value, drawdown } ]
```

`series` downsampled to weekly above 750 points, monthly above 2600 — with drawdown
resampled by `min()` so the trough is never smoothed away (same rule as plan 1 §3.3).

---

## Part 5 — UI

Routes: `/investments/backtest` (create + preview), `/investments/scenarios` (library),
`/investments/scenarios/:id` (detail). All use `InvestmentsBreadcrumb`.

### 5.1 Backtest page — the flow

The whole page is one form and one result, with the result appearing below the form rather
than on a new page, so iterating on the inputs is fast (the primary interaction here is
"try another date").

```
┌ BacktestForm (glass-panel, 2-col on desktop, stacked on mobile)
│   Mode:  ( • Backtest — what would have happened )  ( ○ Forward — track from today )
│   Ticker [search combobox]      Amount [€ 5,000]     Currency [EUR ▾]
│   From [2022-01-15]  To [ today ▾ | pick a date ]        ← hidden in forward mode
│   Add regularly: [ none ▾ | €200 monthly ]
│   Benchmark [S&P 500 ▾]
│   ▸ Advanced: trading cost [0.10% + €0]  dividends [reinvested ▾]  withholding [0%]
│                                                     [Run]  [Save to library]
│
├ HEADLINE (after run)
│   Metric(lg) "Value today €8,412"   DeltaPill +68.2%
│   Metric     "You invested €5,000"  Metric "Profit €3,412"
│   Metric     "vs S&P 500 €7,905"    DeltaAmount +€507   ← always adjacent, never hidden
│
├ Tile "The journey"  (JourneyChart — the centrepiece)
├ Tile "The worst moment"   |  Tile "Risk-adjusted"      |  Tile "What it cost"
├ Tile "If you had entered a few weeks earlier or later" (SensitivityStrip)  ← backtest only
├ HonestyPanel  (always, never collapsed by default on first view)
```

### 5.2 JourneyChart

recharts `ComposedChart` inside a `Tile allowOverflow` (the existing `Tile` clips overflow;
the docstring in `widgets/Tile.tsx` explains that chart tooltips need the opt-out).

- Two `Line`s: scenario value (`var(--chart-4)`) and benchmark value (`var(--muted-foreground)`,
  dashed — the benchmark is a reference, not a competitor series).
- A stepped `Line` for `invested` (the money-in line) at low opacity, so with DCA the user can
  see contributions arriving and read profit as the gap between the two lines.
- `ReferenceArea` shading the maximum-drawdown window in `flow-out` at ~8% opacity, with a
  `ReferenceDot` at the trough labelled `−37.1%`.
- `ReferenceDot`s on contribution dates when there are ≤ 24 of them.
- Toggle: value (€) ↔ growth of 100 (normalised). Normalised is the honest view when
  contributions differ; value is what the user asked for. Default to value.
- `useChartMotion()` for reduced motion; `SERIES_COLORS` from `chartConfig.ts`.

Below the chart, one generated sentence in plain language — assembled in the frontend from
i18n interpolation, so it translates:

> "€5,000 invested in MSFT on 18 January 2022 would be worth **€8,412** today — a gain of
> **68.2%**, or **19.1% per year**. The same money in the S&P 500 would be worth **€7,905**.
> Along the way you would have been down **37.1%** at the worst point, in November 2022, and
> it took **11 months** to get back to even."

That sentence is the feature. Everything else supports it.

### 5.3 SensitivityStrip

A horizontal dot-strip: each of the 9 entry dates as a dot positioned by final value, the
user's chosen date highlighted, with min/median/max labelled. Caption:

> "You picked one date. Entering anywhere in the month either side would have produced final
> values between €7,140 and €9,380. Your date landed in the **78th percentile** of that range
> — a slightly lucky pick, not a repeatable edge."

### 5.4 HonestyPanel

Four short blocks with icons, always visible on a first result, collapsible thereafter (persist
the collapsed state in `localStorage`, but re-expand whenever a *new* scenario is run):
hindsight, survivorship, costs, data basis (§2.5). Plus the deflated-Sharpe block when
`n_trials ≥ 5`. Styling: `border-l-2 border-border` blocks with `text-xs text-muted-foreground`
— informative, not alarming. This is not a legal disclaimer wall; it is part of the analysis.

### 5.5 Library page

```
┌ TrackRecordTile (spans full width)
│   "14 matured scenarios · 6 beat the benchmark (43%) · average excess −2.1pp"
│   A small horizontal bar per scenario, sorted by excess return, flow-in/flow-out tinted,
│   with the zero line = benchmark. One glance says "mostly below the line".
│   Footnote: the binomial p-value sentence from §3.4.
│
├ Filters: [All | Backtests | Forward] [Active | Closed]  Sort: [Newest | Best | Worst]
└ Grid of scenario cards (reuse AccountCard's visual language):
     name · symbol badge · kind badge · "since 12 Mar 2026"
     Metric value · DeltaPill return · small "vs benchmark +2.1pp" line
     sparkline (recharts <Line> only, no axes, 40px tall) from the valuation series
     forward scenarios show "updated 2 hours ago"; errored ones show the reason
```

Empty state: two example cards, greyed, with "Create your first scenario" — and the
explanation of why a forward scenario is worth creating ("it costs nothing and in six months
it will tell you something true about your instincts").

### 5.6 Detail page

The backtest result layout plus: the note field (editable, markdown-free plain text —
`marked` is already a dependency but a decision journal does not need it), a locked-spec
notice, the daily valuation table behind a disclosure, and Rebuild / Close / Delete actions.
Delete uses `AlertDialog` with the scenario name typed back? No — over-friction for a
hypothetical. A plain confirm dialog is right.

### 5.7 States

- **Loading**: skeleton in the result area only; the form stays interactive.
- **Validation errors**: inline under the offending field, using the 422 detail verbatim
  where it is already user-readable ("MSFT price history starts on 1986-03-13").
- **Partial**: `stale_data` → an amber inline note above the headline, not a blocking error.
- **Mobile**: the form collapses to a single column; the headline metrics become a 2×2 grid;
  JourneyChart at 200 px with the invested line hidden below 400 px width (three lines at
  that size is unreadable) and a toggle to bring it back.

### 5.8 Glossary additions

Add to `metricGlossary.ts` (plan 1 §4.1) — same registry, same tooltip mechanism:

- **twr.body**: "Time-weighted return measures how the *investment* performed, ignoring when
  you added money. It is what a fund reports."
- **mwr.body**: "Money-weighted return (IRR) measures how *you* performed, including the
  timing of your contributions. If it is lower than the time-weighted return, your money
  arrived at less fortunate moments — which is normal and mostly luck."
- **deflatedSharpe.body**: "When you try many strategies, the best-looking one is partly
  lucky. This adjusts the score for how many scenarios you have run, so a good-looking result
  has to be genuinely good rather than the best of many tries."
- **entrySensitivity.body**: "The same investment started a few weeks earlier or later. A wide
  spread means the result depends heavily on the exact day you picked — which you chose
  knowing what happened next."
- **costDrag.body**: "Trading fees, compounded. Small percentages become large amounts over
  long periods — this is the single most reliable way to improve returns, because unlike
  returns, costs are certain."

---

## Part 6 — Config

```python
SCENARIO_TRACKING_ENABLED: bool = True
SCENARIO_VALUATION_HOUR_UTC: int = 22
SCENARIO_MAX_PER_USER: int = 200
SCENARIO_DEFAULT_COST_BPS: float = 10.0
SCENARIO_MAX_CONTRIBUTIONS: int = 600
```

`backend/tests/conftest.py` forces `INVESTMENT_SYNC_ENABLED=false` before app import so the
module-level scheduler does not hit the network. Add `SCENARIO_TRACKING_ENABLED=false` there
for the same reason — the new cron job must not start under `TestClient`.

---

## Part 7 — Tests

`test_backtest_engine.py`, all with a monkeypatched `get_price_history` returning synthetic
frames (no network):

1. **Lump sum, no costs, flat price** → final value == initial, return 0, Sharpe `None`.
2. **Lump sum, price doubles over exactly 365 days** → return 100%, CAGR ≈ 100%, TWR == MWR.
3. **DCA, rising market** → MWR < TWR (money arrived late into a rise); the inequality is the
   assertion, not a magic number.
4. **DCA, falling-then-recovering market** → MWR > TWR (dollar-cost averaging's actual
   benefit). These two together pin the unit-value construction.
5. **Costs** → 10 bps on 12 monthly contributions of €200 gives exactly €2.40 of cumulative
   cost.
6. **Weekend start date** → resolves forward, `start_note` populated.
7. **Start before first bar** → raises the typed error the router maps to 422.
8. **Contribution on a market holiday** → resolves to the next trading day, no double count.
9. **Benchmark cashflow parity** → with an identical symbol and benchmark, excess return is
   exactly 0.
10. **Drawdown window** → a scripted price path with a known trough gives exact peak/trough/
    recovery dates.
11. **Entry sensitivity** → returns 9 runs, all with the same shares-math, chosen percentile
    correct.
12. **Idempotent valuation tick** → running it twice writes no duplicate rows and changes no
    values; running it after deleting a fortnight of rows backfills exactly those rows.

`test_scenarios_api.py`: ownership isolation (user B gets 404 on user A's scenario), spec
immutability (PATCH of `start_date` is ignored/422), the per-user cap, and the track-record
endpoint with a seeded set.

---

## Part 8 — Build order

1. Models + migration.
2. `backtest_service` with tests 1–11 — **test-first**, this is the correctness core.
3. `scenario_service` + router + API tests.
4. Scheduler job + idempotency test.
5. Backtest page + JourneyChart (ship-able alone; it answers the headline question).
6. Save/library/detail.
7. Sensitivity, deflated Sharpe, track record — the honesty layer.

## Part 9 — Definition of done

- `uv run pytest backend/tests -v` green; `npm run build` clean.
- A backtest of MSFT from 2022-01-15 with €5,000 renders the plain-language sentence,
  the benchmark line, the shaded drawdown window and the honesty panel.
- A forward scenario created today shows a valuation row tomorrow without any user action,
  and survives a 3-day container outage by backfilling.
- The library shows an aggregate track record with a p-value, and it is phrased as a
  measurement, not a judgement.
- Nowhere does the feature suggest an action, and every result states its cost, data and
  hindsight assumptions.
