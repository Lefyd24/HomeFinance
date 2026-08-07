# Plan 3 — Technical Analysis & Predictive Analytics

**Goal**: for any ticker, a dashboard of technical indicators and a *distributional* forward
view. Indicators are presented as a panel of confirming/conflicting signals with contextual
explanations — never as buy/sell instructions — and the forward view is a Monte Carlo fan
with explicit uncertainty, never a point forecast.

**Self-contained**: depends on the shared `market_data` and `analytics` modules (contract in
§1). If plan 1 has not been implemented, build them here.

Background and citations: `docs/investments/00-research-foundations.md` — especially A.1
(Jegadeesh & Titman on why momentum indicators have *some* basis), A.2 (why no ML forecaster,
why the block bootstrap over GBM, Cont's stylised facts), B.5 (the indicator inventory and
what was rejected).

---

## Part 0 — Files touched

```
backend/app/services/market_data/prices.py              NEW/EDIT  shared price cache (§1)
backend/app/services/analytics/indicators.py            NEW       SMA/EMA/RSI/MACD/BB/ATR/OBV/ADX/Stoch
backend/app/services/analytics/levels.py                NEW       pivots + support/resistance clustering
backend/app/services/analytics/simulation.py            NEW       block bootstrap + GBM Monte Carlo
backend/app/services/analytics/regime.py                NEW       variance ratio, EWMA vol, Parkinson
backend/app/services/technical_service.py               NEW       orchestration + signal panel
backend/app/routers/investments.py                      EDIT      /technical/{symbol}, /simulate/{symbol}
backend/app/schemas/investment_analytics.py             NEW/EDIT  response models
backend/app/config.py                                   EDIT
backend/tests/test_indicators.py                        NEW       golden values vs published series
backend/tests/test_simulation.py                        NEW       statistical properties
backend/tests/test_technical_api.py                     NEW

frontend/app/src/investments/TechnicalPage.tsx              NEW
frontend/app/src/investments/technicalApi.ts                NEW
frontend/app/src/investments/useTechnical.ts                NEW
frontend/app/src/investments/widgets/PriceChart.tsx         NEW  price + MAs + BB + levels
frontend/app/src/investments/widgets/IndicatorPane.tsx      NEW  RSI / MACD / OBV sub-charts
frontend/app/src/investments/widgets/SignalPanel.tsx        NEW  confluence view
frontend/app/src/investments/widgets/MonteCarloFan.tsx      NEW
frontend/app/src/investments/widgets/OutcomeHistogram.tsx    NEW
frontend/app/src/investments/widgets/RegimeStrip.tsx        NEW  trend/range + volatility regime
frontend/app/src/App.tsx                                    EDIT route
frontend/app/src/locales/{en,el}/investments.json           EDIT
```

---

## Part 1 — Shared dependency contract

```python
# app/services/market_data/prices.py
get_price_history(symbols, start, end, *, db, refresh=False) -> dict[str, pd.DataFrame]
#   adjusted daily OHLCV, ascending date index, cached in `market_price_bars`,
#   fetched via yf.download(..., auto_adjust=True, actions=False, threads=False)
# app/services/market_data/reference.py
periods_per_year(quote_type) -> int      # 365 crypto, 252 otherwise
```

**One critical caveat this plan must handle that plan 1 does not**: `auto_adjust=True`
back-adjusts the *whole* OHLC history for dividends. That is correct for return metrics, but
it means the price levels shown are not the prices that traded, and **support/resistance
levels computed on adjusted data will not match the round numbers the user sees on any
charting site**. Since support/resistance is explicitly about "where other market participants
placed orders", this feature must use **unadjusted** prices for levels and for the price
chart, while indicators computed on returns-like quantities may use either.

Decision: `technical_service` fetches **both**:
- `df_adj` (`auto_adjust=True`) — used for volatility, the variance ratio and the Monte Carlo
  (a dividend drop is not a real price shock and must not inflate measured volatility).
- `df_raw` (`auto_adjust=False`, `Close`) — used for the price chart, moving averages,
  Bollinger Bands, RSI, MACD, ATR, OBV, and support/resistance, so the numbers match what the
  rest of the world sees.

Store raw bars under the cache key `f"{symbol}::RAW"` to keep the `(symbol, date)` unique
constraint intact, and document the split. Never mix the two in one computation.

---

## Part 2 — Indicators (`analytics/indicators.py`)

Pure functions, `pd.Series`/`pd.DataFrame` in and out, no I/O. Every function returns a
series the same length as its input, with `NaN` for the warm-up period — **never** drop the
warm-up and re-index, which silently shifts everything by `n` bars.

### 2.1 Wilder smoothing — get this right first

RSI, ATR and ADX all use Wilder's smoothing, which is an EMA with `α = 1/n`, **not**
`pandas.ewm(span=n)` (which is `α = 2/(n+1)`). Using the wrong one produces RSI values that
differ from every charting package by 2–5 points — close enough to look plausible, far enough
to be wrong.

```python
def wilder_smooth(x: pd.Series, n: int) -> pd.Series:
    """Seed with the simple mean of the first n values, then recursive smoothing."""
    out = pd.Series(np.nan, index=x.index, dtype="float64")
    if len(x) < n:
        return out
    out.iloc[n - 1] = x.iloc[:n].mean()
    prev = out.iloc[n - 1]
    for i in range(n, len(x)):
        prev = prev + (x.iloc[i] - prev) / n
        out.iloc[i] = prev
    return out
```
(Equivalently `x.ewm(alpha=1/n, adjust=False).mean()` after seeding — but the explicit seed is
what makes it match TradingView/StockCharts, so keep the seeded form and pin it with a test.)

### 2.2 The set

| Indicator | Params | Formula | Edge cases |
|---|---|---|---|
| `sma(close, n)` | 20/50/200 | `close.rolling(n).mean()` | needs `n` bars |
| `ema(close, n)` | 12/26/20/50 | seed with `SMA(n)` at bar `n−1`, then `α=2/(n+1)`, `adjust=False` | |
| `rsi(close, 14)` | 14 | `Δ = close.diff()`; `gain = Δ.clip(lower=0)`, `loss = (−Δ).clip(lower=0)`; `RS = wilder_smooth(gain,14)/wilder_smooth(loss,14)`; `RSI = 100 − 100/(1+RS)` | `loss == 0` → RSI = 100 (guard the divide, do not emit `inf`) |
| `macd(close, 12, 26, 9)` | | `line = ema12 − ema26`; `signal = ema(line, 9)`; `hist = line − signal` | signal EMA is seeded from the MACD line's own first 9 values |
| `bollinger(close, 20, 2)` | | `mid = sma20`; `sd = close.rolling(20).std(ddof=0)`; `upper/lower = mid ± 2·sd`; `%B = (close−lower)/(upper−lower)`; `bandwidth = (upper−lower)/mid` | **`ddof=0`** — Bollinger's original definition is the population std; `ddof=1` is a common and visible off-by-a-bit error. `%B` undefined when `upper==lower` |
| `bollinger_squeeze(bandwidth, lookback=120)` | | percentile rank of current bandwidth within the trailing window | squeeze flagged below the 10th percentile |
| `atr(high, low, close, 14)` | | `TR = max(H−L, |H−C_prev|, |L−C_prev|)`; `ATR = wilder_smooth(TR,14)`; `ATR% = ATR/close` | first TR uses `H−L` only |
| `obv(close, volume)` | | `(np.sign(close.diff()) * volume).fillna(0).cumsum()` | zero-volume days contribute nothing; if `volume` is entirely missing (some indices), return `None` and hide the pane |
| `obv_divergence(close, obv, window=60)` | | sign of the OLS slope of each over the window, on z-scored values; divergence when the signs differ **and** both \|t\| > 2 | requires the significance test, or every wiggle is a "divergence" |
| `adx(high, low, close, 14)` | | `+DM = H−H_prev` when `> L_prev−L` and `> 0`, else 0; `−DM` symmetric; `+DI = 100·wilder(+DM)/ATR`; `−DI` symmetric; `DX = 100·|+DI − −DI|/(+DI + −DI)`; `ADX = wilder_smooth(DX, 14)` | needs ~2n bars to stabilise; mark the first `2n` as NaN |
| `stochastic(high, low, close, 14, 3)` | | `%K = 100·(C − minL14)/(maxH14 − minL14)`; `%D = SMA(%K, 3)` | flat range → `NaN`, not 50 |
| `ma_crossovers(fast, slow)` | 50/200 | dates where `sign(fast−slow)` changes; label golden/death | ignore crossings where either MA is NaN |

### 2.3 Regime (`analytics/regime.py`) — the contextualisers

```python
def variance_ratio(log_returns, q=5) -> VRResult      # Lo–MacKinlay (1988)
```
`VR(q) = Var(q-period return)/(q · Var(1-period return))` using the overlapping-observations
estimator with the heteroskedasticity-robust standard error; return `vr`, `z_stat`, `p_value`.
`VR > 1` with `|z| > 1.96` → statistically trending; `< 1` → mean-reverting; otherwise
indistinguishable from a random walk. Compute at `q ∈ {2, 5, 10, 20}` and report the set.

```python
def ewma_volatility(returns, lam=0.94, A=252) -> pd.Series   # RiskMetrics
def parkinson_volatility(high, low, A=252, window=20) -> pd.Series
def volatility_percentile(current, history, lookback=756) -> float
```
Parkinson: `σ = sqrt( (1/(4 ln2 · n)) · Σ ln(H/L)² ) · sqrt(A)` — ~5× more efficient than
close-to-close, and we already have the OHLC.

The volatility percentile is what makes the Monte Carlo honest: "current volatility is in the
18th percentile of the last three years — this fan is drawn from an unusually calm period and
will understate the range if conditions normalise."

### 2.4 Support and resistance (`analytics/levels.py`)

1. **Pivots**: fractal highs/lows with order `k` (default 5): bar `i` is a pivot high if
   `high[i]` is the max of `high[i−k : i+k+1]`. Use `scipy.signal.argrelextrema` or a rolling
   comparison. Exclude the last `k` bars (they cannot yet be confirmed — including them
   invents levels that vanish tomorrow).
2. **Cluster** pivot prices with `sklearn.cluster.AgglomerativeClustering(n_clusters=None,
   distance_threshold=τ, linkage="average")` on the 1-D price array, where
   `τ = 1.5 · ATR14_median` — an ATR-scaled tolerance, so a €500 stock and a €5 stock get
   proportionate zones rather than a fixed percentage that is too tight for one and too loose
   for the other.
3. **Score** each cluster: `score = touches × recency_weight × volume_weight`, with
   `recency_weight = Σ exp(−age_days/365)` over its pivots and `volume_weight` = the mean
   volume on pivot days ÷ the period's mean volume. Keep clusters with ≥ 2 touches.
4. **Emit** the top 6 by score as zones (`low`, `high`, `centre`, `touches`, `last_touch`,
   `score`, `kind`), where `kind` is `support` if the current price is above the centre and
   `resistance` if below — a level flips role when price crosses it, which is exactly how
   practitioners describe it.
5. Return `distance_pct` from the current price to each zone.

Never present a level as a target or a trigger. The copy is descriptive: "price has reversed
near $165 four times since 2024; the market has repeatedly treated this area as significant."

---

## Part 3 — Monte Carlo (`analytics/simulation.py`)

### 3.1 Engine choice

**Primary: stationary block bootstrap (Politis & Romano, 1994).** Resamples overlapping blocks
of *actual historical log returns*, preserving fat tails, volatility clustering and
autocorrelation — three of Cont's (2001) stylised facts that GBM destroys by assumption.

```python
def block_bootstrap_paths(log_returns: np.ndarray, horizon: int, n_paths: int,
                          mean_block: int | None = None, rng=None) -> np.ndarray:
    """(n_paths, horizon) matrix of simulated log returns."""
```
- `mean_block = mean_block or max(5, int(round(len(log_returns) ** (1/3))))`
  (~9 for 750 observations; Politis–White automatic selection is an optional refinement).
- Geometric block lengths: at each step, continue the current block with probability
  `1 − 1/L`, else jump to a new uniform random start. Indices wrap circularly.
- Vectorise: draw a `(n_paths, horizon)` matrix of "new block" Bernoulli flags and starting
  indices, then build the index matrix with a cumulative construction — a Python loop over
  10,000 × 252 is ~30 s and unacceptable inside a request; the vectorised form is ~50 ms.

**Secondary: GBM**, `ℓ ~ N(μ − σ²/2, σ²)` per step. Offered explicitly as "the textbook
model" so the user can see how much thinner the normal-assumption tails are. Also a
**Student-t** variant with `ν` fitted by `scipy.stats.t.fit` on standardised returns, scaled
to match `σ` — a middle ground that keeps the closed-form feel but restores fat tails.

Expose `model: "bootstrap" | "gbm" | "student_t"`, default `bootstrap`.

### 3.2 Drift — the honesty crux

The expected return dominates any long-horizon simulation, and it is the parameter we know
least about. `SE(μ̂_ann) = σ_ann/√years`: for a 25%-volatility stock with 3 years of data,
the standard error on the annual drift is ~14 percentage points. An estimate of "+18%/yr"
therefore has a 95% CI of roughly −10% to +46%.

Therefore:
- **Default `drift_mode = "zero"`** — simulate around no expected drift. The fan then shows
  *volatility* honestly and makes no claim about direction.
- `drift_mode = "historical"` — use the trailing-window mean, and **always** display the
  standard error and CI beside it.
- `drift_mode = "risk_free"` — drift at the risk-free rate, the risk-neutral convention.
- For the bootstrap, drift is implicit in the resampled returns. To honour `drift_mode`,
  **demean the historical log returns and add back the chosen per-period drift**, preserving
  the shape of the distribution while controlling the location. Document this — a bootstrap
  that silently carries the historical drift is the same overconfidence in a different coat.

### 3.3 Outputs

```python
def simulate(prices, horizon_days, *, n_paths=10_000, model="bootstrap",
             drift_mode="zero", lookback_days=756, seed=None) -> SimulationResult
```

- `percentiles`: for each future day, the 5/10/25/50/75/90/95th percentile of the price
  distribution → the fan.
- `terminal`: the horizon-end distribution — the same percentiles, plus mean and the
  histogram (50 bins) for `OutcomeHistogram`.
- `probabilities`:
  - `p_above_today` — P(price at horizon > today's price)
  - `p_above_target` — for a user-supplied target price
  - `p_drawdown_20` — the fraction of paths whose *path-wise* max drawdown exceeds 20%
    (computed on the path, not just the endpoint; this is why we keep full paths)
  - `expected_shortfall_5` — the mean terminal value across the worst 5% of paths
- `calibration`: `lookback_start`, `lookback_end`, `n_observations`, `annualized_vol_used`,
  `vol_percentile_vs_3y`, `drift_used`, `drift_se`, `mean_block`, `model`, `seed`.

`seed` is stored and returned so a fan is reproducible — a user reloading the page and seeing
different numbers destroys trust in the whole feature. Derive a stable default seed from
`hash((symbol, horizon, model, drift_mode, last_bar_date))`.

Memory: 10,000 × 252 float64 = 20 MB, fine. Cap `n_paths ≤ 20_000` and `horizon ≤ 504`
(two years — beyond that the fan is so wide it conveys nothing, and saying so is better than
drawing it).

### 3.4 What must be refused

No ARIMA/ETS/LSTM/gradient-boosted price forecast, no "predicted price", no confidence
interval presented around a single number. The research doc (A.2) records why: for daily
single-name equity prices there is no published, replicated out-of-sample edge over a random
walk, and building one would breach both the honesty principle and the dependency constraint.
If a future contributor asks for it, this paragraph is the answer.

---

## Part 4 — The signal panel

`technical_service.build_signal_panel(...)` — the "confluence, never one indicator in
isolation" requirement, made structural.

Each indicator emits a **state**, not an action:

```python
Signal = {
  "id": "rsi", "state": "elevated" | "neutral" | "depressed",
  "value": 71.4, "detail_key": "signals.rsi.elevated",
  "direction": +1 | 0 | -1,     # for the confluence count only
  "confidence": "low"|"medium"|"high",   # from the regime context
}
```

States (all thresholds are conventional, and the UI says so):

| Indicator | Bullish-leaning | Neutral | Bearish-leaning |
|---|---|---|---|
| Price vs SMA200 | above | within ±1% | below |
| SMA50 vs SMA200 | above (golden-cross regime) | — | below |
| RSI(14) | < 30 (depressed) | 30–70 | > 70 (elevated) |
| MACD histogram | > 0 and rising | — | < 0 and falling |
| %B | < 0 (below lower band) | 0–1 | > 1 (above upper band) |
| OBV slope | rising with price | — | falling while price rises (divergence) |
| ADX | *not directional* — a context field | | |

**The confluence readout** is a count with the disagreement made visible:
"4 of 7 indicators lean positive, 2 lean negative, 1 is neutral." Never a score out of 10,
never a gauge with a needle pointing at "BUY". A composite score is a recommendation wearing
a number's clothing.

**Context-aware explanations — the requirement the brief singles out.** The RSI explanation is
selected by ADX and the variance ratio, not by RSI alone:

- ADX > 25 (trending) and RSI > 70:
  > "RSI is 71, above the conventional 70 'overbought' line. But ADX is 32, which says this
  > instrument is in a strong trend — and in strong trends RSI routinely stays above 70 for
  > weeks or months. In this context an elevated RSI is much weaker evidence than it would be
  > in a sideways market."
- ADX < 20 (range-bound) and RSI > 70:
  > "RSI is 71 and ADX is 14, meaning price has been moving sideways rather than trending.
  > Overbought readings have historically been more meaningful in range-bound conditions than
  > in trending ones — but 'more meaningful' is not the same as reliable."
- Variance ratio not significant:
  > "Statistically, this instrument's recent price movements are indistinguishable from a
  > random walk (variance-ratio test, p = 0.41). Trend-following indicators assume the
  > opposite. Treat what follows as description, not prediction."

That last one is the most valuable sentence in the feature and the reason `regime.py` exists.

Every signal carries `confidence`, downgraded to `low` when: the variance-ratio test is
insignificant, the sample has < 250 bars, average volume is very low, or (for OBV) volume data
is absent. `confidence` drives a visual weight in the UI, not a hidden filter.

---

## Part 5 — API

```
GET /api/investments/technical/{symbol}?period=1y&indicators=all
      -> TechnicalResponse
GET /api/investments/simulate/{symbol}?horizon=30&model=bootstrap&drift=zero
      &paths=10000&target_price=200
      -> SimulationResponse
```

Both `Depends(get_current_user_authenticated)`, added to the existing
`routers/investments.py` alongside `/company/{symbol}`, and following that file's error
mapping: `LookupError` → 404, provider failure → 502 with the message, `NotImplementedError`
→ 501.

`TechnicalResponse`:
```
meta: { symbol, name, quote_type, currency, period, last_bar_date, stale: bool,
        price_basis: "unadjusted", bars, warnings: [] }
price: [ { date, open, high, low, close, volume } ]        # downsampled for long periods
overlays: { sma20, sma50, sma200, ema20, bb_upper, bb_mid, bb_lower }   # date-aligned arrays
panes: { rsi, macd: {line, signal, hist}, obv, adx: {adx, plus_di, minus_di},
         stochastic: {k, d}, atr, atr_pct }
levels: [ { kind, low, high, centre, touches, last_touch, score, distance_pct } ]
crossovers: [ { date, kind: "golden"|"death", fast: 50, slow: 200 } ]
regime: { trend: "up"|"down"|"sideways", adx, variance_ratio: [{q, vr, z, p}],
          vol_annualized, vol_percentile_3y, vol_regime: "low"|"normal"|"elevated",
          bollinger_squeeze: bool, squeeze_percentile }
signals: [ Signal ]
confluence: { positive: 4, negative: 2, neutral: 1, note_key: "…" }
```

Series downsampling: daily up to 2 years; beyond that the price chart resamples to weekly OHLC
(`open=first, high=max, low=min, close=last, volume=sum`) while **indicators are always
computed on daily data first and then sampled**. Computing RSI on weekly bars gives a
different (and unrequested) indicator.

Caching: keyed on `(symbol, period, last_bar_date)`, bounded `OrderedDict`, TTL 15 min — the
same pattern as `_story_cache` in `investment_providers/yahoo.py`. The simulation endpoint
caches on the seed inputs, which makes reproducibility free.

Rate limiting: 60 technical requests / 5 min / user; 20 simulations / 5 min (10k paths ×
252 days is ~150 ms of CPU, and a tight loop from the UI would matter).

---

## Part 6 — UI

Route `/investments/technical?symbol=AAPL`, reachable from the ticker search results, the
company research page, and each holding row in the portfolio. Breadcrumb via
`InvestmentsBreadcrumb`.

### 6.1 Layout

```
┌ Header: AAPL · Apple Inc · $224.31 (DeltaPill +1.2%) · [period 3M 6M 1Y 2Y 5Y]
│
├ RegimeStrip  (full width, the framing that comes before any indicator)
│   [Trend: Up ▲]  [Strength: ADX 32 — strong]  [Volatility: 18% — 24th percentile, calm]
│   [Random-walk test: trending (p=0.02)]      [Bollinger: no squeeze]
│   caption: "This is the context every indicator below should be read in."
│
├ Tile "Price" (allowOverflow, tall — 2 rows on desktop)
│   PriceChart: candles or line, SMA20/50/200, Bollinger band ribbon,
│   support/resistance zones as horizontal bands, golden/death cross markers
│   Legend doubles as visibility toggles.
│
├ Tile "Momentum — RSI"    Tile "Momentum — MACD"    Tile "Volume — OBV"
│   IndicatorPane each, x-axis synchronised with the price chart (recharts `syncId`)
│
├ Tile "What the indicators are saying together"  (SignalPanel — full width)
│   7 rows: indicator · state chip · value · one-sentence context-aware explanation
│   header: "4 lean positive · 2 lean negative · 1 neutral"
│   footer: "Professional analysts look for agreement across several indicators.
│            Disagreement is information too — it usually means no clear signal."
│
├ Tile "Possible paths from here" (MonteCarloFan — full width, allowOverflow)
│   controls: horizon [30d 90d 180d 1y] · model [Historical patterns ▾] · drift [No drift ▾]
│   fan chart + the probability readout + calibration footnote
│
├ Tile "Where it could end up"  OutcomeHistogram + probability statements
├ Tile "Key price levels"       the level table with distance-from-price
└ Honesty footer
```

### 6.2 PriceChart

recharts `ComposedChart` with `syncId="ta"` shared by every pane so the crosshair tracks
across all of them — this is what makes a multi-pane technical view usable and it is one prop.

- Price as a `Line` (default) with a candlestick toggle. Recharts has no candlestick primitive;
  implement with a `Bar` for the high-low wick plus a custom `shape` for the body, or ship
  line-only in v1 and add candles later. **Line-first is the right call** — the audience is a
  retail investor learning, not a scalper reading wicks.
- SMA20/50/200 as thin lines from `SERIES_COLORS`; the 200 is heaviest visually because it is
  the one that matters most.
- Bollinger Bands as an `Area` between upper and lower at ~10% opacity with the mid as a
  dashed line.
- Support/resistance as `ReferenceArea` bands spanning the full width, opacity scaled by
  score, labelled at the right edge.
- Crossovers as `ReferenceDot` with a small marker and a tooltip giving the date and type.
- `useChartMotion()` for reduced motion.

### 6.3 IndicatorPane

Compact (120 px) sub-charts sharing the price chart's x-domain.
- **RSI**: line with `ReferenceLine` at 30/70 (and 50 dashed); the zones above 70 and below 30
  tinted. When ADX > 25, the 70/30 lines are drawn *dashed and muted*, with the caption
  explaining that they are less meaningful in a trend — the chart itself encodes the context.
- **MACD**: histogram `Bar` with polarity colouring via `polarityColor()` from `chartConfig.ts`,
  plus the line and signal.
- **OBV**: line, with the price line ghosted behind it at low opacity so divergence is
  *visible*, not just asserted. Highlight the divergence window with a `ReferenceArea` when
  one is detected.

### 6.4 MonteCarloFan

recharts `AreaChart` with nested bands. Recharts supports array-valued `dataKey`
(`[low, high]`) for a range `Area`, so:
- Outer band 5–95% at ~10% opacity,
- inner band 25–75% at ~20%,
- median as a solid line,
- the historical price for the trailing 90 days as a continuous line joining the fan at
  "today" — the join is what makes the fan legible as a continuation rather than a
  free-floating shape.

Beneath, the probability readout in sentences:

> "Based on how AAPL has actually behaved over the past 3 years, in 30 trading days:
> • the middle half of simulated outcomes land between **$212 and $238**
> • about **1 in 20** simulations end below **$189**
> • **54%** of paths finish above today's price
> • in **7%** of paths, the price fell more than 20% at some point along the way"

And immediately below, the calibration note — non-collapsible:

> "This is not a forecast. It resamples AAPL's actual daily moves from 2023-08 to 2026-08 in
> blocks, which preserves its real pattern of calm and turbulent stretches. It assumes no
> expected drift, so it says nothing about direction. It cannot know about anything that has
> not happened before — an earnings surprise, a takeover, a market crash of a new kind.
> Current volatility is in the 24th percentile of the last three years, so if conditions
> return to normal, the real range would be **wider** than shown."

The model selector's options are labelled in plain language, not jargon:
"Historical patterns (recommended)" / "Simple bell curve (textbook)" / "Fat-tailed bell curve",
each with a tooltip explaining the trade-off — and switching to the bell curve visibly narrows
the tails, which is itself the lesson.

### 6.5 Glossary additions

Into `metricGlossary.ts` (plan 1 §4.1):

- **rsi.body**: "A 0–100 momentum gauge comparing recent gains to recent losses. Above 70 is
  conventionally called 'overbought', below 30 'oversold'. These are conventions, not laws —
  in a strong trend RSI can sit above 70 for months while the price keeps rising. Read it
  alongside the trend strength shown above."
- **macd.body**: "The gap between a fast and a slow moving average. When the bars flip from
  below to above zero, short-term momentum has turned upward relative to the longer term. It
  is a lagging measure by construction — it describes what has already changed."
- **bollinger.body**: "A moving average with bands two standard deviations above and below.
  Price spends about 95% of its time inside the bands, so touching a band is common, not
  exceptional. When the bands squeeze tight, the instrument has been unusually calm — and calm
  periods have historically been more often followed by large moves, in either direction."
- **atr.body**: "The typical size of a day's price range, in currency. AAPL's ATR of $4.20
  means a $4 move on a given day is ordinary, not news. Traders use it to size stop-losses;
  long-term investors can use it to calibrate what 'normal' looks like."
- **obv.body**: "Adds the day's volume when price closes up and subtracts it when price closes
  down. If price is making new highs while this line is not, the move is happening on thinner
  trading than the previous one."
- **adx.body**: "Measures how *strongly* price is trending, without saying in which direction.
  Below 20 means sideways; above 25 means a real trend is in place. It is the context that
  decides how much weight to give the other indicators."
- **varianceRatio.body**: "A statistical test of whether price movements have any memory. If
  the result is not significant, this instrument's recent movements are indistinguishable
  from coin flips — which is what most academic finance predicts, and it means trend
  indicators have little to work with here."
- **monteCarlo.body**: "Thousands of simulated futures built by reshuffling this
  instrument's own historical daily moves. It shows the *range* of what its past behaviour
  makes plausible — not a prediction. The width of the fan is the message."
- **supportResistance.body**: "Price areas where this instrument has repeatedly stopped and
  turned around. They matter because other market participants watch them and place orders
  around them, which can make them partly self-fulfilling. They are not floors or ceilings —
  they break regularly."

### 6.6 States

- **Loading**: skeletons matching each tile; the regime strip loads first (it is one small
  computation) so the framing appears before the detail.
- **Insufficient history** (< 200 bars): SMA200, ADX and the variance ratio are suppressed with
  "needs at least 200 days of history — this instrument has 87." Never a blank line on a chart.
- **No volume** (many indices): the OBV pane is hidden entirely, with one line explaining why.
- **Crypto**: `periods_per_year=365` and a note that 24/7 trading makes daily-bar indicators
  behave differently from equities.
- **Mobile**: panes stack; the sync crosshair still works; the fan chart keeps full width at
  200 px; the signal panel becomes an accordion with the confluence header always visible.

---

## Part 7 — Config

```python
TECHNICAL_ANALYSIS_ENABLED: bool = True
SIMULATION_DEFAULT_PATHS: int = 10_000
SIMULATION_MAX_PATHS: int = 20_000
SIMULATION_MAX_HORIZON_DAYS: int = 504
SIMULATION_DEFAULT_LOOKBACK_DAYS: int = 756
```

---

## Part 8 — Tests

`test_indicators.py` — golden values on a fixed 300-bar synthetic OHLCV frame, with the
expected arrays committed as fixtures:

1. **Wilder vs EWM**: `wilder_smooth(x, 14)` ≠ `x.ewm(span=14).mean()`, and equals
   `x.ewm(alpha=1/14, adjust=False).mean()` after the seed. Regression guard.
2. **RSI**: a monotonically rising series gives RSI = 100; monotonically falling gives 0;
   an alternating series gives ~50. Plus one published worked example (Wilder's own
   14-period table from *New Concepts in Technical Trading Systems* is the standard reference).
3. **Bollinger `ddof=0`**: computed against a hand-calculated 20-value window.
4. **MACD**: `line = ema12 − ema26` reproduced independently.
5. **ATR**: the first TR uses `H−L`; a gap-up day uses `H − C_prev`.
6. **ADX**: `+DI`/`−DI` non-negative, `ADX ∈ [0,100]`, and the first `2n` values are NaN.
7. **OBV**: an unchanged close contributes zero (`np.sign(0) == 0`).
8. **Warm-up alignment**: every indicator's output index equals the input index and the count
   of leading NaNs is exactly the documented warm-up.
9. **Levels**: a synthetic series that bounces three times off 100 produces a cluster centred
   near 100 with `touches == 3`; the last `k` bars produce no pivot.

`test_simulation.py` — statistical properties, all seeded:

1. **Bootstrap preserves moments**: with `drift_mode="historical"`, the simulated 1-day return
   distribution matches the historical mean and std to within Monte Carlo error (3 SE).
2. **Bootstrap preserves kurtosis**: simulated kurtosis is much closer to historical than GBM's
   (which is ~3 by construction). Pins the engine-choice rationale.
3. **Zero drift**: median terminal price ≈ today's price (within 1%).
4. **Reproducibility**: the same seed gives bit-identical percentiles.
5. **Block length**: `mean_block=1` degenerates to an IID bootstrap and destroys
   autocorrelation; `mean_block=20` preserves more of it. Asserts the block mechanism does
   something.
6. **Performance**: 10,000 × 252 completes in < 1 s (guards against a reintroduced Python loop).
7. **Path-wise drawdown**: `p_drawdown_20` is computed from the paths, not the endpoints —
   a synthetic case with a deep mid-path dip that recovers must register.

`test_technical_api.py`: a monkeypatched price layer; assert suppression of SMA200 on short
history, the OBV pane's absence without volume, context-selection of the RSI explanation key
under high vs low ADX, and that no response field ever contains a recommendation vocabulary
(a test asserting the serialised response matches no `/\b(buy|sell|should)\b/i` outside
glossary text — cheap and it will catch a well-meaning future contributor).

---

## Part 9 — Build order

1. `indicators.py` + `test_indicators.py`, **test-first**. This is where subtle wrongness
   hides.
2. `regime.py` + `levels.py`.
3. `simulation.py` + `test_simulation.py`, vectorised from the start.
4. `technical_service.py` signal panel with context-aware explanation selection.
5. Endpoints + schemas.
6. RegimeStrip + PriceChart — ship-able alone.
7. Indicator panes + SignalPanel.
8. MonteCarloFan + OutcomeHistogram.

## Part 10 — Definition of done

- `uv run pytest backend/tests -v` green; `npm run build` clean.
- RSI/MACD/ATR for AAPL match a public charting site to within rounding — if they do not, the
  smoothing is wrong.
- The regime strip appears above every indicator, and the RSI explanation text differs
  between a trending and a range-bound instrument.
- The Monte Carlo fan is reproducible across reloads and states its calibration window,
  volatility percentile and drift assumption on screen.
- Switching from "historical patterns" to "simple bell curve" visibly narrows the tails.
- No element of the feature emits a buy/sell signal, a score, or a price target.
