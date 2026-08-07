# Plan 1 — Ticker Comparison

**Goal**: select 2–5 instruments (stocks, ETFs, crypto, indices), get a side-by-side
analytical comparison led by risk-adjusted return, with normalised performance, correlation,
drawdown, valuation, and an always-available benchmark.

**Self-contained**: this plan also specifies the two shared modules (`market_data` price
layer, `analytics` metric library) and the plain-language glossary primitive. Plans 2 and 3
depend on the same modules and restate their contracts; **if you are implementing this plan
first, you are building them.** If they already exist, verify the signatures in §1 and §2
match and extend rather than duplicate.

Background and citations: `docs/investments/00-research-foundations.md`.

---

## Part 0 — Files touched

```
backend/app/services/market_data/__init__.py          NEW  public surface
backend/app/services/market_data/prices.py            NEW  OHLCV fetch + DB cache
backend/app/services/market_data/reference.py         NEW  risk-free rate, benchmarks, calendars, FX
backend/app/services/analytics/__init__.py            NEW
backend/app/services/analytics/returns.py             NEW  return/CAGR/drawdown primitives
backend/app/services/analytics/risk.py                NEW  Sharpe/Sortino/VaR/PSR/…
backend/app/services/analytics/relation.py            NEW  beta/correlation/capture
backend/app/services/comparison_service.py            NEW  orchestrates one comparison
backend/app/routers/investments.py                    EDIT add /compare + /compare/saved
backend/app/schemas/investment_analytics.py           NEW  Pydantic response models
backend/app/models/investment_analytics.py            NEW  MarketPriceBar, SavedComparison
backend/app/models/__init__.py                        EDIT export new models
backend/app/schemas/__init__.py                       EDIT export new schemas
backend/app/config.py                                 EDIT analytics settings
backend/alembic/versions/xxxx_market_data_cache.py    NEW  migration
backend/tests/test_analytics_metrics.py               NEW  formula unit tests (golden values)
backend/tests/test_comparison_api.py                  NEW  endpoint tests

frontend/app/src/investments/ComparisonPage.tsx           NEW
frontend/app/src/investments/comparisonApi.ts             NEW
frontend/app/src/investments/useComparison.ts             NEW
frontend/app/src/investments/metricGlossary.ts            NEW  plain-language copy registry
frontend/app/src/investments/widgets/TickerPicker.tsx     NEW
frontend/app/src/investments/widgets/NormalizedChart.tsx  NEW
frontend/app/src/investments/widgets/DrawdownChart.tsx    NEW
frontend/app/src/investments/widgets/RiskScatter.tsx      NEW
frontend/app/src/investments/widgets/CorrelationMatrix.tsx NEW
frontend/app/src/investments/widgets/MetricTable.tsx      NEW  sortable, reused by valuation + risk
frontend/app/src/investments/InvestmentPrimitives.tsx     EDIT add MetricWithHelp, ConfidenceBand, DataSourceNote
frontend/app/src/App.tsx                                  EDIT route /investments/compare
frontend/app/src/locales/{en,el}/investments.json         EDIT
```

---

## Part 1 — Shared module: `market_data`

### 1.1 Why a cache at all

`yfinance` scrapes Yahoo's public endpoints. It is rate-limited, occasionally returns empty
frames, and a comparison of 4 tickers × 5 years re-fetched on every page interaction will get
the user throttled within minutes. Every plan needs the same daily bars. So: one table, one
fetch path, one lock.

### 1.2 Model — `backend/app/models/investment_analytics.py`

```python
class MarketPriceBar(Base):
    """One adjusted daily bar per (symbol, date). Split/dividend-adjusted at write time.

    Yahoo restates the whole adjusted history when a split or dividend occurs, so a
    refresh rewrites overlapping rows rather than only appending — see prices.py.
    """
    __tablename__ = "market_price_bars"
    __table_args__ = (
        UniqueConstraint("symbol", "date", name="uq_market_bar_symbol_date"),
        Index("ix_market_bar_symbol_date", "symbol", "date"),
    )
    id       = Column(Integer, primary_key=True)
    symbol   = Column(String(50), nullable=False)
    date     = Column(Date, nullable=False)
    open     = Column(Float, nullable=False)
    high     = Column(Float, nullable=False)
    low      = Column(Float, nullable=False)
    close    = Column(Float, nullable=False)   # adjusted close (auto_adjust=True)
    volume   = Column(Float, nullable=True)    # Float: crypto volumes exceed int32 and are fractional
    currency = Column(String(10), nullable=True)


class MarketSymbolMeta(Base):
    """Per-symbol facts that decide how its series is treated. Refreshed lazily (TTL 7d)."""
    __tablename__ = "market_symbol_meta"
    symbol            = Column(String(50), primary_key=True)
    name              = Column(String(200), nullable=True)
    quote_type        = Column(String(20), nullable=True)   # stock|etf|crypto|index|…
    currency          = Column(String(10), nullable=True)
    exchange          = Column(String(30), nullable=True)
    periods_per_year  = Column(Integer, default=252)        # 365 for crypto
    first_bar_date    = Column(Date, nullable=True)
    last_bar_date     = Column(Date, nullable=True)
    refreshed_at      = Column(DateTime, default=datetime.utcnow)


class SavedComparison(Base):
    __tablename__ = "saved_comparisons"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name       = Column(String(100), nullable=False)
    symbols    = Column(Text, nullable=False)      # JSON list, order preserved
    benchmark  = Column(String(50), nullable=True)
    period     = Column(String(10), nullable=False, default="3y")
    created_at = Column(DateTime, default=datetime.utcnow)
```

Migration: one Alembic revision creating all three. Follow `backend/ALEMBIC_GUIDE.md`;
`docker-entrypoint.sh` applies it on start.

### 1.3 `prices.py` — the fetch path

```python
def get_price_history(
    symbols: Sequence[str],
    start: date,
    end: date,
    *,
    db: Session,
    refresh: bool = False,
) -> dict[str, pd.DataFrame]:
    """Adjusted daily OHLCV per symbol, indexed by date, ascending, no duplicate dates."""
```

Algorithm, per symbol:

1. Normalise the symbol (`strip().upper()`); reject anything not matching
   `^[A-Za-z0-9.\-^=&/]{1,50}$` (Yahoo symbols include `^GSPC`, `BTC-USD`, `EURUSD=X`,
   `VWCE.DE`).
2. Read cached rows for `[start, end]`. Determine coverage gaps against the *expected*
   trading calendar (see §1.5). Treat coverage as sufficient if the cached range covers
   `[start, end]` and the last cached bar is within 4 calendar days of `min(end, today)`.
3. If insufficient (or `refresh=True`), fetch with
   `yf.download(symbol, start=fetch_start, end=fetch_end + 1 day, interval="1d",
   auto_adjust=True, actions=False, progress=False, threads=False, timeout=20)`.
   - `fetch_start` = `min(start, cached_first) − 5 days` when extending backwards, else
     `cached_last − 5 days` (the overlap re-writes bars that Yahoo has re-adjusted after a
     corporate action).
   - `end` is **exclusive** in Yahoo's API — always add one day.
4. Drop rows with NaN close; coerce all values through a finite-float guard (mirror
   `_safe_float` in `services/investment_providers/yahoo.py`, which exists because Yahoo
   returns NaN/Inf that break FastAPI's JSON encoder).
5. Upsert with `sqlite_upsert(...).on_conflict_do_update(index_elements=["symbol","date"])`
   (`sqlalchemy.dialects.sqlite.insert`), in chunks of 500.
6. Return the requested window from the DB, so cached and fresh paths return identical
   objects.

**Concurrency**: a module-level `threading.Lock` keyed by symbol (`defaultdict(threading.Lock)`)
so two simultaneous requests for the same ticker do not both hit Yahoo. The scheduler thread
and the request threads share this.

**Bulk**: `yf.download` accepts a list and returns a column-MultiIndex frame. Use the list
form when ≥ 3 symbols need fetching, then split. Keep `threads=False` — yfinance's own thread
pool combined with FastAPI's worker threads is a reliable way to get rate-limited.

**Failures**: raise `MarketDataUnavailable(symbol, reason)` (new exception in
`market_data/__init__.py`). Never raise a bare yfinance error — the router maps this to 502
with the symbol named, and `main.py`'s global handler must not be the thing that catches it.

**Empty result**: an unknown ticker returns an empty frame, not an error. Map to
`SymbolNotFound(symbol)` → 404.

### 1.4 `reference.py`

- `DEFAULT_BENCHMARK = "^GSPC"`; a curated `BENCHMARKS` list surfaced to the UI:
  `^GSPC` (S&P 500), `^STOXX50E` (Euro Stoxx 50), `URTH`/`ACWI` (world), `AGG` (US bonds),
  `BTC-USD` (crypto reference), `^IXIC` (Nasdaq).
- `get_risk_free_rate(db, start, end) -> pd.Series`: daily annualised risk-free rate.
  Source `^IRX` (13-week T-bill, quoted in percent) via the same cache, divide by 100,
  reindex+forward-fill onto the target calendar. On failure fall back to the constant
  `settings.ANALYTICS_RISK_FREE_ANNUAL` and set `rf_source="fallback_constant"` on the
  response so provenance is honest. A EUR-denominated user comparing EUR assets should be
  able to override to a constant — expose `risk_free` as an optional request field.
- `periods_per_year(quote_type) -> int`: 365 for `crypto`/`currency`, else 252.
- `to_currency(prices: pd.DataFrame, from_ccy, to_ccy, db) -> pd.DataFrame`: multiplies by the
  `{FROM}{TO}=X` daily rate (inverted if only the reverse pair exists). **Necessary for
  correctness**: comparing a USD stock to a EUR-listed ETF in their native currencies silently
  compares two different things — one of the return streams contains an FX bet. The API
  exposes `currency` (default: the user's account currency if resolvable, else `USD`) and the
  response reports `fx_applied: bool` per symbol.

### 1.5 Calendars and alignment

- Each symbol's series is whatever Yahoo returned — do **not** reindex onto a synthetic
  calendar.
- For any pairwise or multi-asset computation (correlation, beta, normalised chart), take the
  **inner join of dates across all series**, then recompute returns on the joined index. This
  is the crypto-vs-equity trap: forward-filling a stock onto crypto's 365-day calendar
  injects ~110 zero-return days a year, which deflates measured volatility by ~17% and biases
  correlation toward zero. The response reports `aligned_days` and `alignment_note` when more
  than 5% of any series' days were dropped.
- Single-asset metrics (its own Sharpe, drawdown) use that asset's **own full** calendar with
  its own `periods_per_year`.

---

## Part 2 — Shared module: `analytics`

Pure functions over numpy/pandas. **No I/O, no DB, no HTTP** — this is what makes them
unit-testable against published golden values. Every function returns `None` rather than
`nan`/`inf` when undefined, and every one has an explicit minimum-observation guard.

### 2.1 `returns.py`

| Function | Signature | Definition / edge cases |
|---|---|---|
| `simple_returns` | `(prices: pd.Series) -> pd.Series` | `prices.pct_change().dropna()`. Raises if any price ≤ 0. |
| `log_returns` | `(prices) -> pd.Series` | `np.log(prices).diff().dropna()` |
| `cumulative_return` | `(returns) -> float` | `(1+r).prod() − 1` |
| `cagr` | `(prices) -> float\|None` | `(P_end/P_start)**(365.25/D) − 1`, `D` = **calendar** days between first and last index entries. `None` if `D < 30`. |
| `annualized_vol` | `(returns, A) -> float\|None` | `returns.std(ddof=1) * sqrt(A)`; `None` if `n < 20` |
| `drawdown_series` | `(returns) -> pd.Series` | `W/W.cummax() − 1` where `W = (1+r).cumprod()` |
| `max_drawdown` | `(returns) -> DrawdownStats` | dataclass: `depth` (negative float), `peak_date`, `trough_date`, `recovery_date\|None`, `days_under_water` (longest run of `dd<0`), `current_dd` |
| `ulcer_index` | `(returns) -> float` | `sqrt(mean((100*dd)**2))`, percentage points |
| `rolling_window_returns` | `(prices, months=12) -> pd.Series` | every rolling N-month total return, used for the win-rate stat |

`DrawdownStats.recovery_date` is `None` when the series never regains the prior peak; the UI
renders "not yet recovered", which is materially different from a blank.

### 2.2 `risk.py`

```python
def sharpe(returns, rf_periodic, A) -> SharpeResult | None
```
`SharpeResult = (value, se, ci_low, ci_high, n)`.
`e = returns − rf_periodic` (rf as a Series aligned to returns, or a scalar);
`value = e.mean()*A / (e.std(ddof=1)*sqrt(A))`;
`se = sqrt((1 + value**2/(2*A)) / n) * sqrt(A)` (Lo 2002); CI = `value ± 1.96*se`.
`None` if `n < 60` or `e.std() == 0`.

```python
def sortino(returns, mar_periodic=0.0, A=252) -> float | None
```
`downside = np.minimum(returns - mar, 0.0)`;
`tdd = sqrt((downside**2).sum() / len(returns))` — **divide by n, all observations**;
`(returns.mean() - mar) * A / (tdd * sqrt(A))`. `None` if `tdd == 0` or `n < 60`.
> Pin this with a test: a series of `[0.01]*90 + [-0.02]*10` must give TDD =
> `sqrt(10*0.0004/100) = 0.0063`, **not** `sqrt(10*0.0004/10) = 0.02`. Getting the divisor
> wrong inflates Sortino by `sqrt(n/k)` — here 3.16×.

```python
def calmar(cagr_value, mdd) -> float | None      # cagr / abs(mdd); None if mdd == 0
def martin_ratio(cagr_value, rf_ann, ulcer) -> float | None
def omega_curve(returns, thresholds) -> list[tuple[float, float]]
def historical_var(returns, level=0.95) -> float          # -quantile(1-level)
def cvar(returns, level=0.95) -> float
def cornish_fisher_var(returns, level=0.95) -> float      # C.11 in the research doc
def distribution_stats(returns) -> DistStats              # skew, excess kurtosis, JB p-value
def probabilistic_sharpe(sr_periodic, n, skew, kurt, sr_benchmark=0.0) -> float | None
def deflated_sharpe(sr_periodic, n, skew, kurt, n_trials, sr_variance=None) -> float | None
```

PSR and DSR exactly as research doc §C.7/§C.8. Both take the **per-period** Sharpe, not the
annualised one — annualising before feeding PSR is a silent factor-of-√252 bug. Make the
parameter name `sr_periodic` and assert `abs(sr_periodic) < 2` in debug builds.

`distribution_stats` uses `scipy.stats.skew(bias=False)`, `scipy.stats.kurtosis(fisher=True,
bias=False)`, and `statsmodels.stats.stattools.jarque_bera`. PSR needs **non-excess**
kurtosis: pass `kurtosis_fisher + 3`.

### 2.3 `relation.py`

```python
def market_model(asset_excess, bench_excess, A) -> MarketModel | None
```
`statsmodels.api.OLS(y, sm.add_constant(x)).fit(cov_type="HAC",
cov_kwds={"maxlags": max(1, int(n ** 0.25))})`.
Returns `beta`, `beta_ci`, `alpha_annual = params[0]*A`, `alpha_tstat`, `alpha_pvalue`,
`r_squared`, `n`. `None` if `n < 60`.

```python
def downside_beta(asset_excess, bench_excess, A)  # same, restricted to bench < 0, needs >= 30 pts
def capture_ratios(asset_r, bench_r) -> (up, down) | (None, None)   # >= 20 qualifying days each
def correlation_matrix(returns_df) -> pd.DataFrame                   # Pearson, inner-joined
def rolling_correlation(a, b, window=90) -> pd.Series
def downside_correlation(a, b, bench, decile=0.1) -> float | None    # bench worst-decile days, >= 20
def tracking_error(asset_r, bench_r, A) -> float
def information_ratio(asset_r, bench_r, A) -> float | None
def diversification_ratio(returns_df) -> float | None                # Σw σ_i / σ_portfolio, equal weights
```

### 2.4 Test strategy — `backend/tests/test_analytics_metrics.py`

Golden-value tests, no network. Fixtures are deterministic synthetic series
(`np.random.default_rng(42)`), plus hand-computed cases:

1. **Sortino divisor** — the 90/10 case above.
2. **Sharpe with a non-zero rf** — a constant 1%/period return with rf = 1%/period must give
   Sharpe = `None` (zero excess std), not `inf`.
3. **Max drawdown** — a scripted path `[100, 120, 60, 90, 130]` → depth −0.5, peak at index 1,
   trough at 2, recovery at 4, and `days_under_water` = the span from index 1 to 4.
4. **CAGR calendar-day basis** — a 2× gain over exactly 730 days → 41.4%, and the same 2× over
   504 *trading* days must give the *same* answer only if the calendar span matches.
5. **Wilder vs pandas-EWM** — asserts RSI(14) on a fixed series differs from
   `ewm(span=14)` output (guards against a future "simplification").
6. **PSR monotonicity** — PSR increases in n and decreases in |skew| for a fixed Sharpe.
7. **DSR** — with N = 1 raises; with N = 100 and a Sharpe at the expected-max level, DSR ≈ 0.5.
8. **Alignment** — a crypto series and an equity series inner-joined produce no zero-return
   days; correlation on the naive forward-filled version is measurably lower (regression
   test for the trap in §1.5).
9. **Empty/short inputs** — every public function returns `None` (never raises, never NaN)
   for a 5-observation input.

---

## Part 3 — Comparison service

`backend/app/services/comparison_service.py`

```python
PERIODS = {"1m":30, "3m":91, "6m":182, "ytd":None, "1y":365, "3y":1095, "5y":1825, "10y":3650, "max":None}

def build_comparison(
    db: Session,
    symbols: list[str],          # 2..5, order preserved, deduped case-insensitively
    period: str = "3y",
    benchmark: str | None = "^GSPC",
    currency: str | None = None,
    risk_free_annual: float | None = None,
) -> ComparisonResponse
```

Steps:

1. Validate: 2 ≤ len(symbols) ≤ 5 (400 otherwise). The benchmark is fetched as a sixth
   series but flagged `is_benchmark=True` — it appears in the chart and metric tables but is
   excluded from the "which won" framing. If the user puts `^GSPC` in `symbols` explicitly,
   dedupe against the benchmark and keep it as a normal series.
2. `get_price_history` for all symbols + benchmark + `^IRX`.
3. Resolve metadata (`quote_type`, currency, `periods_per_year`) per symbol.
4. FX-convert to `currency` if any symbol's native currency differs (§1.4).
5. Build `aligned` (inner join across all) and keep each symbol's `own` series.
6. Per symbol compute, on **own** calendar: CAGR, cumulative return, ann. vol, Sharpe(+CI),
   Sortino, Calmar, Martin, max-drawdown stats, Ulcer, VaR/CVaR/mVaR, distribution stats,
   PSR vs 0.
7. Per symbol compute, on the **aligned** calendar vs benchmark: beta(+CI, R²), downside beta,
   annualised alpha(+t, p), tracking error, information ratio, up/down capture, downside
   correlation.
8. Pairwise on the aligned calendar: correlation matrix, rolling-90d correlation series for
   every pair (cap at 10 pairs — 5 symbols gives 10), diversification ratio for the
   equal-weight basket.
9. **Head-to-head confidence**: for the two highest-Sharpe symbols, `probabilistic_sharpe`
   of the higher against the lower's Sharpe as `sr_benchmark`. This yields the sentence
   "roughly a 68% chance A's risk-adjusted return is genuinely better, not luck."
10. Valuation block per symbol, branched on `quote_type` (§3.2).
11. Stress episodes: cumulative return and max drawdown for each hard-coded window that the
    series covers (skip windows predating `first_bar_date`).
12. Series for charts, **downsampled server-side** — see §3.3.

### 3.1 Caching

The whole `ComparisonResponse` is expensive (multiple regressions) but deterministic given
(symbols, period, benchmark, currency, date). Cache in-process with a bounded
`OrderedDict` (max 64 entries, TTL 15 min) keyed on a hash of those inputs, mirroring the
`_story_cache` pattern already in `investment_providers/yahoo.py`. Do not persist — it is
derived data and the price cache is the durable layer.

### 3.2 Valuation block, branched by instrument type

Sourced from `yf.Ticker(sym).info` (already used by `get_company_profile`), plus
`.funds_data`, `.growth_estimates`, `.balance_sheet`, `.cashflow`, `.income_stmt`.

- **stock**: trailing P/E, forward P/E, P/B, EV/EBITDA, EV/Sales, PEG (computed as
  `forwardPE / (growth_estimates['+1y'] * 100)`, suppressed if growth ≤ 0), dividend yield,
  payout ratio, FCF yield (`freeCashflow/marketCap`), ROE, debt/equity, gross margin,
  revenue growth, market cap, sector, 52-week range position.
- **etf / mutual_fund**: **expense ratio** (`funds_data.fund_operations`), AUM, inception,
  category, top-10 concentration, sector weights, yield, and — when both compared symbols are
  funds — **holdings overlap** (weight-overlap = `Σ min(w_i^A, w_i^B)` over the union of top
  holdings; label it as top-N overlap, not full-portfolio overlap, because `funds_data`
  returns only the top holdings). Cells that do not apply (P/E, ROE) render as
  "n/a for funds", never as a blank or a zero.
- **crypto**: market cap, circulating supply, 24h volume, and an explicit "traditional
  valuation ratios do not apply" note. Do not fabricate a P/E.
- **index**: price-only; note that index levels usually exclude dividends, so an index's
  return is not directly comparable to a total-return ETF. **This matters**: `^GSPC` is a
  price index. Its measured return understates the S&P 500's total return by roughly
  1.5–2%/yr. Set `total_return: false` on the series and render a footnote; offer `SPY`/`VOO`
  in the benchmark picker as the total-return alternative and label it as such.

Missing fields are `None` and render as "—" with the tooltip "Yahoo Finance does not publish
this for this instrument."

### 3.3 Series payload and downsampling

The chart needs `normalized` (base 100), `drawdown`, and `rolling_correlation`. Ten years of
daily data × 6 series = 15k points; recharts will struggle and the JSON is ~1 MB.

Rule: if `len(index) > 750`, resample to weekly (`W-FRI`, last observation) for the
normalised and drawdown series; above 2600 (10y), resample monthly. **Compute all metrics on
daily data first**, downsample only the display series. Report `series_frequency` in the
response so the chart's axis label is honest.

Drawdown is resampled with `min()` not `last()` — otherwise the weekly resample hides the
actual trough, which is the one point on that chart that must be exact.

### 3.4 Response schema (`schemas/investment_analytics.py`)

```
ComparisonResponse
├─ meta: { period, start, end, aligned_days, currency, series_frequency,
│          risk_free_annual, risk_free_source, benchmark_symbol, alignment_note|None,
│          generated_at }
├─ instruments: [ InstrumentComparison ]
│   ├─ symbol, name, quote_type, currency, fx_applied, total_return: bool, is_benchmark
│   ├─ performance: { cumulative_return, cagr, best_month, worst_month,
│   │                 rolling_1y_win_rate_vs_benchmark, worst_rolling_1y }
│   ├─ risk: { volatility, max_drawdown: {depth, peak_date, trough_date,
│   │           recovery_date, days_under_water}, ulcer_index, var95, cvar95,
│   │           mvar95, skew, excess_kurtosis, jarque_bera_p }
│   ├─ risk_adjusted: { sharpe: {value, ci_low, ci_high, n}, sortino, calmar,
│   │                   martin, omega_curve: [[θ, Ω]], psr_vs_zero }
│   ├─ vs_benchmark: { beta, beta_ci, r_squared, downside_beta, alpha_annual,
│   │                  alpha_tstat, alpha_pvalue, tracking_error,
│   │                  information_ratio, up_capture, down_capture,
│   │                  downside_correlation }
│   ├─ valuation: { kind: "stock"|"fund"|"crypto"|"index", fields: {...}, sources: {...} }
│   └─ stress: [ { label, start, end, return, max_drawdown } ]
├─ pairwise: { correlation: {"AAPL|MSFT": 0.62, …},
│              rolling_correlation: {"AAPL|MSFT": [{date, value}]},
│              diversification_ratio, overlap: {"VOO|VTI": 0.87}|null }
├─ head_to_head: { leader, runner_up, psr_leader_vs_runner_up, verdict_key } | null
└─ series: { normalized: [{date, "AAPL": 100.0, …}], drawdown: [{date, …}] }
```

`verdict_key` is an i18n key, **never prose generated by the backend**, and never a
recommendation. Allowed values: `clearly_better_risk_adjusted` (PSR ≥ 0.9),
`likely_better` (0.75–0.9), `too_close_to_call` (0.25–0.75), and the mirror cases. The UI
renders "Over this period, X delivered better risk-adjusted returns than Y, and the gap is
large enough to be unlikely to be luck (≈92% confidence)" — a statement about the past with
its uncertainty, not about the future.

### 3.5 Endpoints — `routers/investments.py`

```
GET  /api/investments/compare
       ?symbols=AAPL,MSFT&period=3y&benchmark=^GSPC&currency=EUR&risk_free=0.02
GET  /api/investments/compare/saved            -> list SavedComparison
POST /api/investments/compare/saved            -> {name, symbols, benchmark, period}
DEL  /api/investments/compare/saved/{id}
```

All behind `Depends(get_current_user_authenticated)`. Error mapping:
`SymbolNotFound` → 404 naming the symbol; `MarketDataUnavailable` → 502 with the provider
message (matching the existing pattern in this router); insufficient history (< 60 aligned
days) → **200 with partial results**, `sharpe: null` etc. and `meta.warnings: ["short_history"]`
— a newly-listed ETF should still render its price chart rather than erroring the page.

**Rate limiting**: a comparison can trigger 6 Yahoo fetches. Reuse the app's per-user limiter
in `app/utils/rate_limit.py` — 20 comparison requests per 5 minutes per user, and rely on the
price cache to make repeat views free.

---

## Part 4 — UI

Route `/investments/compare`, sidebar entry under Investments (alongside the existing
`/investments/search`, `/investments/news`, `/investments/research` routes in `App.tsx`).
Uses `InvestmentsBreadcrumb current={t('compare.title')}`.

### 4.1 The plain-language mechanism (build this first)

`metricGlossary.ts` — one registry, every metric keyed by id, so no explanation is ever
written twice or written inconsistently:

```ts
export interface GlossaryEntry {
  labelKey: string        // 'metrics.sharpe.label'
  shortKey: string        // one line, shown in the tooltip head
  bodyKey: string         // 2-4 sentences: what it is, how to read it, when it misleads
  scaleKey?: string       // 'metrics.sharpe.scale' -> "Above 1.0 good, above 2.0 excellent"
  sourceKey?: string      // provenance: 'Computed from Yahoo Finance adjusted daily closes'
  caveatKey?: string      // when this metric breaks down
}
export const GLOSSARY: Record<MetricId, GlossaryEntry>
```

`MetricWithHelp` in `InvestmentPrimitives.tsx` wraps the existing `Metric` with a Radix
`Tooltip` (desktop) / `Popover` (touch — a tooltip is unreachable without hover, and half the
value of this feature is on a phone), triggered by a small `?` affordance that is a real
`<button>` with `aria-label`. `ConfidenceBand` renders `0.82` with a subdued `±0.41` and a
tooltip explaining the interval. `DataSourceNote` renders the provenance line at tile footers.

All copy lives in `locales/en/investments.json` and `locales/el/investments.json`. Sample
entries (English), written to the brief's standard:

- **sharpe.short**: "Return earned for each unit of risk taken."
- **sharpe.body**: "For every unit of price swing this investment put you through, it
  returned 0.82 units of return above cash. Above 1.0 is generally considered good, above 2.0
  excellent. It treats upside and downside swings as equally bad, which is why we show
  Sortino next to it."
- **sharpe.caveat**: "Sharpe ratios estimated over a few years carry a lot of uncertainty —
  the range shown after the ± is the 95% confidence interval. If two investments' ranges
  overlap heavily, the difference between them is probably noise."
- **sortino.body**: "Like Sharpe, but only counts the downward swings as risk. Upside
  surprises don't count against it. Usually higher than Sharpe; a Sortino much higher than
  the Sharpe means most of this investment's volatility was to the upside."
- **maxDrawdown.body**: "The worst peak-to-trough fall during this period. If you had bought
  at the worst possible moment, this is how far down you would have been before it recovered.
  It took 431 days to get back to even."
- **correlation.body**: "How closely these two move together, from −1 to +1. Above about 0.8
  means holding both gives you much less diversification than it looks like — they will
  usually fall at the same time."
- **downsideCorrelation.body**: "Correlation measured only on the market's worst days.
  Diversification matters most exactly when things go wrong, and correlations usually rise in
  a crash. If this number is much higher than the headline correlation, these two won't
  protect you when it counts."
- **beta.body**: "How much this moved for each 1% move in the benchmark. A beta of 1.2 means
  it typically moved 1.2% when the index moved 1%. Check the R² next to it: if R² is low, the
  index explains very little of this instrument's movement and the beta isn't telling you much."
- **expenseRatio.body**: "The annual fee, taken automatically from the fund's value. It is
  the most reliable predictor of how a fund performs against its peers — a 0.5% difference
  compounds to roughly 13% of your money over 30 years."

### 4.2 Page structure

```
┌ Breadcrumb: Investments › Compare
├ TickerPicker  [AAPL ×] [MSFT ×] [+ Add]      Benchmark: [S&P 500 ▾]
│               Period: [1M 3M 6M YTD 1Y 3Y 5Y 10Y MAX]   Currency: [EUR ▾]   [Save…]
│
├ HEADLINE ROW — one card per instrument (2–5 across, stacking to 1 on mobile)
│   Ticker · name · quote-type badge
│   Metric(lg) "Risk-adjusted return (Sortino)"  ← the headline, per the brief
│   Metric(sm) Sharpe with ConfidenceBand · CAGR · Max drawdown (DeltaPct, red)
│   DeltaPill total return
│
├ VERDICT STRIP (only when head_to_head is present)
│   "Over the last 3 years MSFT delivered better risk-adjusted returns than AAPL
│    (Sortino 1.31 vs 0.94). Confidence this reflects a real difference rather than
│    luck: 78%."   [What does this mean?]
│
├ Tile "Growth of 100"  (allowOverflow)         Tile "Drawdown"
│   NormalizedChart, all series + benchmark       DrawdownChart, filled areas below 0
│   footer: total-return note + series_frequency  footer: worst-moment callout per series
│
├ Tile "Risk vs return"                          Tile "Correlation"
│   RiskScatter: x = volatility, y = CAGR,         CorrelationMatrix heatmap
│   dot size = |max drawdown|, benchmark starred   + rolling-correlation sparkline per pair
│                                                  + downside-correlation row
│
├ Tile "Risk-adjusted metrics"   MetricTable, sortable, metrics as rows / tickers as columns
│      Sortino · Sharpe(±) · Calmar · Volatility · Max DD · Time under water · Ulcer ·
│      VaR95 · CVaR95 · Beta(R²) · Alpha · Up capture · Down capture · Info ratio
│
├ Tile "Valuation"               MetricTable, branch-aware; benchmark column shown as reference
│
├ Tile "How they behaved in past shocks"   stress episodes as a small grouped bar chart
│
└ Honesty footer (always): period, data source, total-return basis, risk-free source,
  "Past performance does not indicate future results. This is analysis, not advice."
```

### 4.3 Component notes

**TickerPicker** — reuses the existing search endpoint (`searchSymbols` in
`investmentsApi.ts`) inside a `cmdk` `Command` popover. Chips use the `Badge` component with
a series colour dot from `chartConfig.ts`'s `seriesColor(index)` so a ticker's colour is the
same in the chip, the chart, the table header and the scatter. Quick-add buttons for the
user's own top holdings (from `/investments/accounts/{id}/positions`) — the most likely thing
to compare is something you already own against an index. Max 5, with the reason stated when
the limit is hit ("beyond five lines the chart stops being readable"), not a silent disable.

**NormalizedChart** — recharts `LineChart`, `dataKey` per symbol, base 100 at the first
aligned date, log-scale toggle (defaulting to linear; a log axis is the correct way to compare
long-horizon growth and the toggle's tooltip should say so). `useChartMotion()` from
`chartConfig.ts` for reduced-motion. Shared tooltip with all series sorted by value.
`ReferenceLine y={100}`.

**DrawdownChart** — `AreaChart` with `baseValue={0}`, values ≤ 0, `flow-out` tinted fills at
low opacity. Annotate each series' trough with a `ReferenceDot`. The subtitle is the sentence
form: "MSFT's worst moment: −37.1%, from 2021-12-27 to 2022-11-03, recovered 2023-06-15."

**RiskScatter** — recharts `ScatterChart`. Volatility on x, CAGR on y, `ZAxis` bound to
`|max drawdown|`. A quadrant guide through the benchmark's point turns it into a legible
"better return, less risk" reading. Caption: "Up and to the left is better: more return for
less risk."

**CorrelationMatrix** — a plain CSS-grid heatmap (not a chart library) using
`bg-flow-out/[opacity]` for high positive correlation (high correlation is the *bad* outcome
here, which is a deliberate inversion of the usual colour intuition — the legend must say
"higher = less diversification"). Each cell is a button opening a popover with the rolling
correlation sparkline and the downside correlation.

**MetricTable** — one component used by both metric tables. Rows = metrics, columns =
tickers, because 5 columns fit and 14 rows scroll naturally. Sorting a *row* re-orders the
columns; the sort control is on the row label. Best value per row gets a subtle
`ring-1 ring-flow-in/30` — never a trophy or a "winner" label. Each row label is a
`MetricWithHelp`.

### 4.4 States

- **Empty** (fewer than 2 tickers): the `Empty` component with three preset comparisons —
  "S&P 500 vs Nasdaq 100", "VOO vs VTI (nearly identical — see why)", "Bitcoin vs Gold" —
  which double as a tutorial for what the page does.
- **Loading**: `Skeleton` matching the final layout (headline cards, then tiles). A comparison
  is 3–15 s cold; render the headline cards as soon as prices land and stream the rest? No —
  keep one request, but show a determinate progress hint ("fetching 4 price histories…") via
  a lightweight `GET /compare` that is fast on cache hits. Simplicity wins over streaming here.
- **Partial**: a symbol with < 60 aligned days renders its card with "—" for ratio metrics and
  an inline note "Only 34 days of history — risk metrics need at least 60."
- **Error**: per-symbol failures degrade to a removable chip with an error tint, not a page
  error. A total failure uses the app's standard error surface.
- **Mobile**: headline cards become a horizontal snap-scroll row; the two metric tables become
  one column per ticker in a `Tabs` switcher; charts keep full width at 220 px height. The
  correlation matrix at 5 tickers is a 5×5 grid — legible at 320 px if cells drop to the
  numeric value only.

### 4.5 Query layer

`useComparison.ts` — TanStack Query, `queryKey: ['investments','compare', symbols.join(','),
period, benchmark, currency]`, `staleTime: 5 * 60_000`, `gcTime: 30 * 60_000`. State lives in
the URL (`?symbols=AAPL,MSFT&period=3y`) so a comparison is linkable — matching the existing
convention noted in `MarketDataProviderSwitch`'s docstring.

---

## Part 5 — Config

```python
# app/config.py
ANALYTICS_ENABLED: bool = True
ANALYTICS_RISK_FREE_ANNUAL: float = 0.02        # fallback when ^IRX is unavailable
ANALYTICS_DEFAULT_BENCHMARK: str = "^GSPC"
ANALYTICS_MAX_COMPARE_SYMBOLS: int = 5
MARKET_DATA_CACHE_TTL_HOURS: int = 12           # staleness before refetching the tail
MARKET_DATA_MAX_HISTORY_YEARS: int = 15
```

`backend/tests/conftest.py` already forces `INVESTMENT_SYNC_ENABLED=false` before app import
to keep the scheduler off the network. Add `ANALYTICS_ENABLED` handling the same way if any
new startup work is introduced, and ensure no new module hits the network at import time.

---

## Part 6 — Build order

1. Models + migration + `market_data/prices.py` + `reference.py`, with a test that fetches
   nothing (seed the cache table directly).
2. `analytics/*` with the golden-value test file. **This is the highest-risk correctness
   work; do it test-first.**
3. `comparison_service.py` + schemas + endpoint + API tests with a monkeypatched price layer.
4. `metricGlossary.ts` + `MetricWithHelp` + locale entries.
5. Page shell, TickerPicker, NormalizedChart — the minimum that answers a real question.
6. Remaining tiles.
7. Saved comparisons.

## Part 7 — Definition of done

- `uv run pytest backend/tests -v` green, including the new metric tests.
- `npm run build` clean (tsc is part of the build and type errors fail it).
- Comparing `VOO` and `VTI` over 5y shows a correlation ≥ 0.98, an overlap figure, and
  expense ratios — i.e. the page tells you they are nearly the same thing.
- Comparing `BTC-USD` and `^GSPC` reports the alignment note and does not silently
  forward-fill.
- Every number on the page has a tooltip; every tile has a provenance footer.
- No string anywhere in the feature recommends an action.
