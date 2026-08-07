# Investment Analytics — Research Foundations

**Scope**: Steps 1 and 2 of the enhancement brief. What the literature and the profession
actually say, which metrics earn their place in a retail tool, and the exact mathematics
each of the four feature plans will implement.

The four implementation plans (`01`–`04` in this directory) are self-contained. This
document is the *why*: it is the reference you consult when a formula in a plan looks
arbitrary, or when you want to know what was deliberately left out and on what grounds.

---

## Part A — What the academic literature establishes

### A.1 The foundations that still hold

**Markowitz (1952), "Portfolio Selection", *Journal of Finance* 7(1).** The one idea that
survives everything: risk and return must be evaluated *jointly*, and the risk of an asset
in a portfolio is not its own volatility but its covariance with everything else you own.
This is the entire justification for putting correlation on the comparison screen. Markowitz
also gives us the failure mode to avoid: mean–variance optimisation is famously unstable
because expected returns are estimated with enormous error (Michaud's "error maximisation"
critique, 1989). **Implication for us**: show the correlation matrix, do *not* build an
optimiser. The brief already says "not a portfolio optimizer" — the literature agrees, and
the reason is that the optimiser's output is dominated by estimation noise.

**Sharpe (1966, 1994), "Mutual Fund Performance" and "The Sharpe Ratio", *JPM* 21(1).**
The 1994 revision matters more than the 1966 original for implementation, because it fixes
the definition to use *excess* returns throughout — the numerator is the mean of
`r_t − r_f,t`, and the denominator is the standard deviation of that same excess series, not
of the raw return series. Most retail sites get this wrong. The distinction is small when the
risk-free rate is stable and large when it is not (2022–2024, when the front-end T-bill went
from 0% to 5%+, is exactly when it matters).

Sharpe's own caveats, from the 1994 paper, are the ones we surface in the UI: the ratio
assumes returns are IID and approximately normal; it is a *ranking* device, not a cardinal
measure; and its standard error is large. For n observations and a true Sharpe of S, the
approximate standard error of the estimate is `SE(Ŝ) ≈ √((1 + S²/2)/n)`. With three years
of daily data (n ≈ 756) and a daily-frequency Sharpe, that is not reassuring — annualised,
the 95% CI on a Sharpe of 0.8 estimated over three years spans roughly 0.0 to 1.6. **This
is the single most important honesty fact in the whole project**, and it is why plan `01`
requires a confidence band on every Sharpe ratio displayed.

**Sortino & van der Meer (1991); Sortino & Satchell (2001), *Managing Downside Risk in
Financial Markets*.** Replaces the denominator with *target downside deviation* below a
minimum acceptable return (MAR). The universally-botched detail, confirmed against the
performance-measurement literature and Rollinger & Hoffman's CME note ("Sortino: A 'Sharper'
Ratio"): the sum of squared shortfalls is divided by **the total number of observations n,
not by the count of observations below the target**. Dividing by the below-target count
makes an asset that rarely loses money look *riskier*, which inverts the metric's meaning.
Plan `01` §M4 specifies the correct form and the unit test that pins it.

**Fama & French (1993, 2015); Carhart (1997).** The three-, four- and five-factor models
establish that most of what looks like skill is exposure to size, value, momentum,
profitability and investment. For a retail comparison tool the actionable consequence is
modest but real: a single-factor alpha versus the S&P 500 is not evidence of anything, and
we should say so rather than printing "Jensen's alpha: +3.2%" as if it were a discovery.

**Hou, Xue & Zhang (2015, 2020, 2021) — the q-factor and q⁵ models.** Post-2015 work that
should temper how much authority we give FF5. Hou/Xue/Zhang's large-scale replication
("Replicating Anomalies", *RFS* 2020) found that a majority of published anomalies fail to
replicate at conventional significance once microcaps are handled properly and value-weighting
is used; their q-factor model, augmented with an expected-growth factor (q⁵), subsumes the
FF5/FF6 premia in Gibbons–Ross–Shanken tests. **Implication for us**: we do not implement
factor regressions beyond market beta. A five-factor decomposition would require factor
return series we cannot source reliably for European/crypto instruments, and the profession
itself has not settled on which model is right. We give market beta (well-defined, cheaply
sourced) and we explicitly label it as *one* factor.

**Jegadeesh & Titman (1993), "Returns to Buying Winners and Selling Losers".** Twelve-month
momentum is the most robust cross-sectional anomaly ever documented and it survives out of
sample and out of country. It is also the intellectual justification for *any* trend
indicator in feature 3: moving-average crossovers are a crude, path-dependent proxy for
time-series momentum. Moskowitz, Ooi & Pedersen (2012) on time-series momentum is the closer
analogue to what a 50/200-day cross is doing. This is the honest framing for the technical
analysis dashboard: "there is real published evidence for momentum as a phenomenon; the
specific 50/200 crossover rule is a folk implementation of it with far weaker evidence."

**Lo & MacKinlay (1988), variance ratio test.** Underused and perfect for this project. The
variance-ratio statistic tests whether a price series is a random walk; VR > 1 indicates
positive autocorrelation (trending), VR < 1 mean reversion. It is ~15 lines of numpy. Plan
`03` uses it as a *meta-indicator*: it tells the user whether trend-following indicators are
even applicable to this instrument in this period, which is a far more honest thing to show
than another oscillator.

**Kahneman & Tversky (1979), prospect theory; Tversky & Kahneman (1992).** Losses hurt
roughly 2–2.5× as much as equivalent gains please. This is the empirical basis for leading
with **maximum drawdown** rather than standard deviation — the brief's instinct is correct
and has a citation behind it. It also justifies the Sortino ratio's asymmetry and the Ulcer
Index (which squares drawdown depth, penalising deep losses super-linearly, matching the
concavity of the value function).

**Barber & Odean (2000), "Trading Is Hazardous to Your Wealth"; (2001) "Boys Will Be Boys";
Barber, Lee, Liu & Odean (2009, 2014) on Taiwanese day traders.** The households that traded
most earned ~6.5 percentage points per year less than the market. Overconfidence is the
mechanism. **This is the direct justification for feature 2's forward sandbox track record**:
the literature says the user's picks will, on average, underperform, and the single most
valuable thing the app can do is measure that honestly rather than let memory curate it.
Barber & Odean (2008) on attention-driven buying is why the AI research report in feature 4
must present a bear case with equal weight — retail investors systematically over-weight
salient positive news.

**Bessembinder (2018), "Do Stocks Outperform Treasury Bills?", *JFE*.** Only ~4% of US
listed companies account for the entire net wealth creation of the market above T-bills; the
median stock underperforms. This is the empirical backbone of the survivorship-bias warning
in feature 2 and of the "would the index have done better?" benchmark requirement everywhere.

### A.2 The methodology literature — how not to fool yourself

This is the part most retail tools skip entirely, and it is where the project can be
genuinely better than what is on the market.

**Bailey & López de Prado (2014), "The Deflated Sharpe Ratio", *Journal of Portfolio
Management* 40(5); and Bailey, Borwein, López de Prado & Zhu (2014, 2017) on the probability
of backtest overfitting.** Two constructs we implement directly:

- **Probabilistic Sharpe Ratio (PSR)** — the probability that the true Sharpe exceeds a
  benchmark Sharpe, given the estimate, sample length, skewness and kurtosis. It converts
  "Sharpe 1.1 vs Sharpe 0.9" into "68% confident A is genuinely better", which is the honest
  version of the comparison the user is asking for in feature 1.
- **Deflated Sharpe Ratio (DSR)** — PSR evaluated against the Sharpe you would *expect to
  see by chance* given N independent trials. Feature 2 knows exactly how many backtests the
  user has run, because it stores them. Using that count as N is a genuinely novel and
  entirely honest application: "you have run 23 scenarios; the best of 23 random strategies
  with zero skill would show a Sharpe of about 0.6 by luck alone."

Both formulas are given in Part C and are pure numpy + `scipy.stats.norm`.

**Harvey, Liu & Zhu (2016), "…and the Cross-Section of Expected Returns", *RFS*.** With
hundreds of factors tested, a t-statistic of 2.0 is not a discovery; they argue the hurdle
should be ~3.0. Generalised: any single backtest result should be treated as a hypothesis,
not a finding. Feeds the copy in feature 2's honesty panel.

**López de Prado (2018), *Advances in Financial Machine Learning*.** Purged k-fold and
combinatorial purged cross-validation are the current standard for evaluating anything
fitted to financial time series, precisely because ordinary k-fold leaks information across
the temporal boundary. **We do not fit predictive models**, so we do not need CPCV — but the
underlying principle (never evaluate on data that overlaps the estimation window) governs
plan `03`: the Monte Carlo simulation is parameterised on a *trailing* window and the UI must
state which window, because a fan chart calibrated on 2020–2022 volatility and shown in a
calm 2026 is silently misleading.

**Politis & Romano (1994), stationary bootstrap; Politis & White (2004), automatic block
length.** The current best practice for resampling a dependent time series. This replaces
GBM as our *primary* Monte Carlo engine (plan `03`). Resampling overlapping blocks of actual
historical returns preserves fat tails, volatility clustering and autocorrelation — all three
of which GBM destroys by assumption. GBM is retained as a secondary, explicitly-labelled
"textbook model" so the user can see how much the normality assumption flatters the picture.

**What replaced ARIMA.** For the honest answer the brief asks for: in point forecasting,
ARIMA has been displaced in practice by (a) exponential-smoothing state-space models and
Theta for short univariate series, (b) gradient-boosted trees on engineered features for
tabular/multi-series problems, and (c) global deep models (N-BEATS, N-HiTS, TFT, PatchTST,
TimesFM/Chronos foundation models) for large panels. **None of these should be built here.**
The M4/M5 competition literature and Makridakis' repeated finding is that for *financial
price series specifically* — as opposed to demand or energy series — the gain over a random
walk is statistically indistinguishable from zero at daily horizons. Building an LSTM price
forecaster would be the single most dishonest thing this project could do. The correct
modern answer for "where might this be heading" is a **distributional** one: bootstrap/Monte
Carlo fans, quantile bands, and probability statements. That is what plan `03` implements,
and it needs nothing beyond numpy.

**Cont (2001), "Empirical properties of asset returns: stylized facts".** The checklist any
simulation must respect: returns are approximately uncorrelated but not independent; volatility
clusters; unconditional distributions are leptokurtic with tail index ~3–5; there is a
leverage effect (negative returns raise future volatility); and aggregational Gaussianity
(normality improves at longer horizons). The block bootstrap reproduces 1, 2, 3 and 5 for
free. Plain GBM reproduces only 5. This is the technical argument for the engine choice.

### A.3 What professionals actually look at

**CFA Institute curriculum (Level II/III, Portfolio Management).** The performance-appraisal
set is small and specific: Sharpe, Treynor, Jensen's alpha, information ratio, M², plus
appraisal ratio. The risk set is standard deviation, downside deviation, beta, tracking error,
VaR/CVaR, and drawdown. The GIPS standards add the requirement that returns be *time-weighted*
for manager evaluation and *money-weighted* (IRR) when the investor controls the cash flows —
which matters directly for feature 2's DCA backtests, where TWR and MWR genuinely differ and
reporting only one is misleading.

**Morningstar analyst reports** are the closest template for feature 4. Their structure:
Business Strategy & Outlook → Economic Moat (with a rating and its rationale) → Fair Value
Estimate & valuation drivers → Risk & Uncertainty (an explicit *Uncertainty Rating*, not a
prose hedge) → Capital Allocation → Bulls Say / Bears Say (three bullets each). Two
transferable design choices: (a) the **bull/bear bullets are symmetric and length-capped**,
which forces balance structurally rather than asking the model nicely; (b) **uncertainty is a
first-class rated field**, not a footnote. Plan `04` adopts both.

**Bloomberg terminal comparison screens.** `COMP` (comparative returns, normalised to 100 —
exactly what the brief asks for), `RV` / `EQRV` (relative valuation: a peer table of P/E,
P/B, EV/EBITDA, EV/Sales, margins, growth, with the peer *median* as a row so every cell is
readable against a reference), `PORT` for attribution and risk decomposition, `MRR` for
multi-asset risk, `HRA` for historical regression (beta, alpha, R², with the scatter shown).
Two transferable choices: **a median/benchmark row inside the valuation table** (so the user
never has to hold "is 28× high?" in their head), and **showing R² next to every beta** (a beta
from a regression with R² = 0.08 is noise, and Bloomberg shows it because professionals check).

**Hedge fund risk managers, daily.** Gross/net exposure, factor and sector exposures, VaR and
expected shortfall with the backtest of VaR exceptions, stress/scenario P&L against named
historical episodes (2008-09, Mar-2020, 2022 rates), liquidity (days-to-liquidate), and
concentration. The retail-transferable pieces are **named historical stress episodes** — "in
the Feb–Mar 2020 drawdown this instrument fell 34% while the index fell 34%" is far more
legible than a VaR number — and **drawdown-recovery time**, which is the thing that actually
determines whether a retail investor capitulates.

**Howard Marks (Oaktree memos, esp. "Risk Revisited", "Dare to Be Great II").** Risk is the
probability of permanent loss of capital, not volatility; and it is unobservable ex post,
because "we only ever see the one history that happened". The memos are the strongest
non-technical argument for showing a *distribution* of outcomes rather than the single
realised path — which is precisely feature 2's counterfactual framing and feature 3's Monte
Carlo fan. Marks' "second-level thinking" also frames feature 4 correctly: the value of a
research report is not the consensus, it is seeing what the consensus is so you can ask
whether it is already in the price.

**Warren Buffett, actual metrics (from the shareholder letters, not the folklore).**
Owner earnings (net income + D&A − maintenance capex), return on *unleveraged* net tangible
assets, look-through earnings, growth in book value per share (retired as the headline metric
in the 2018 letter in favour of market value), and — repeatedly — the ratio of total US market
cap to GNP as a valuation thermometer. What is implementable from Yahoo data: ROE, ROIC-ish
proxies, debt/equity, free cash flow yield, gross margin stability, and the multi-year
*trend* in these rather than the point value. Plan `04` includes a five-year fundamentals
trend block for exactly this reason.

**Ray Dalio, All Weather / risk parity.** The transferable insight is not the portfolio: it
is that **diversification should be measured in risk contribution, not in dollar weights**,
and that correlations are regime-dependent — they rise toward 1 in crises, exactly when
diversification is needed. This is the argument for plan `01`'s **downside correlation**
metric (correlation computed only on the benchmark's worst decile of days), which is far more
informative than the headline Pearson correlation and is almost never shown to retail users.

**Bogleheads / Jack Bogle (*Common Sense on Mutual Funds*).** The cost matters hypothesis:
in any market, net returns equal gross returns minus costs, so the low-cost fund wins on
average by arithmetic rather than by skill. Concretely: **expense ratio is the single most
predictive fund-level variable for future relative return** (Morningstar's own studies
confirm this repeatedly). Any ETF appearing in the comparison table without its expense ratio
is a serious omission — plan `01` treats it as a mandatory column for funds. Bogle's other
transferable point is the tyranny of compounding costs: a 1%/yr fee over 30 years consumes
roughly a quarter of the terminal wealth. Feature 2's cost model should show cumulative
cost drag as a line, not just subtract it silently.

---

## Part B — Step 2: the metric inventory

Each metric is graded:
**[CORE]** — show by default, retail-appropriate, well-understood.
**[SECOND]** — show behind a disclosure/advanced toggle; useful but needs context.
**[SKIP]** — institutional-only or dominated by a simpler metric; documented so a future
reader knows it was considered and rejected rather than forgotten.

### B.1 Risk-adjusted return

| Metric | Grade | Measures | Formula sketch | Why / why not |
|---|---|---|---|---|
| **Sharpe** | CORE | Excess return per unit of total volatility | `(E[r−r_f]·A) / (σ(r−r_f)·√A)` | Universal vocabulary. Must ship with a confidence band. |
| **Sortino** | CORE | Excess return per unit of *downside* volatility | `(E[r]−MAR)·A / (TDD·√A)` | Matches loss aversion. The n-divisor detail is the implementation trap. |
| **Calmar** | CORE | CAGR per unit of worst drawdown | `CAGR / |MDD|` | The most intuitive risk-adjusted ratio for retail: "return per unit of worst pain". Conventionally 36-month; we label the window. |
| **Martin (UPI)** | SECOND | CAGR per unit of Ulcer Index | `(CAGR − r_f) / UI` | Strictly better than Calmar statistically (uses the whole drawdown path, not one point) but needs the Ulcer Index explained first. |
| **Omega(θ)** | SECOND | Ratio of probability-weighted gains to losses above/below a threshold | `Σmax(r−θ,0) / Σmax(θ−r,0)` | Uses the entire return distribution, no normality assumption. Elegant, but "Omega of 1.35" means nothing to a novice without a chart. Show as a *curve* over θ, not a number. |
| **Treynor** | SECOND | Excess return per unit of *market* risk | `E[r−r_f]·A / β` | Only meaningful for something held inside a diversified portfolio; misleading for a single stock viewed alone. Gate behind R² ≥ 0.3. |
| **Information ratio** | SECOND | Active return per unit of tracking error | `E[r−r_b]·A / (σ(r−r_b)·√A)` | The right way to answer "was this better than the index?" — but the concept only clicks once the user has seen active return. |
| **Jensen's alpha** | SECOND | Return unexplained by market exposure | `α from r−r_f = α + β(r_b−r_f) + ε` | Must display with its own t-stat/CI and R². Alone it is the most over-interpreted number in finance. |
| **M² (Modigliani)** | SKIP | Sharpe restated in return units | `r_f + Sharpe·σ_b` | Genuinely retail-friendly (answers in %, not ratio units) — reconsider as a *presentation* of Sharpe rather than a separate metric. Listed as an optional caption in plan `01`. |
| **Probabilistic Sharpe (PSR)** | CORE (as a band, not a number) | P(true Sharpe > benchmark Sharpe) | See C.7 | Converts a ranking into a confidence statement. This is the honesty differentiator. |
| **Deflated Sharpe (DSR)** | CORE in feature 2 | PSR adjusted for number of trials | See C.8 | The antidote to a scenario library full of cherry-picked winners. |
| **Sterling / Burke** | SKIP | Return per average-of-N-largest-drawdowns / per RMS drawdown | — | Dominated by Calmar + Ulcer for our audience; definitional variants are inconsistent across vendors, which makes them a support burden. |
| **Appraisal ratio** | SKIP | α / σ(ε) | — | Manager-selection metric; no meaning for a single instrument. |

### B.2 Risk and drawdown

| Metric | Grade | Notes |
|---|---|---|
| **Maximum drawdown** | CORE | Lead with it. Report depth, peak date, trough date, and — critically — **recovery date and time-under-water**, which most tools omit and which is the number that predicts capitulation. |
| **Time under water / longest drawdown** | CORE | "You would have waited 4 years and 2 months to get back to even" is the most behaviourally relevant sentence the app can produce. |
| **Ulcer Index** | SECOND | `√(mean(dd_t²))` over the period. Penalises deep *and* long drawdowns. Feeds the Martin ratio. |
| **Annualised volatility** | CORE | Shown, but deliberately subordinated to drawdown per the brief and per prospect theory. |
| **Downside deviation** | SECOND | The Sortino denominator; shown in the Sortino explainer. |
| **Historical VaR(95, 1d)** | SECOND | Empirical 5th percentile of daily returns. Trivially computed, easy to explain as "on the worst 1 day in 20…". |
| **Cornish–Fisher modified VaR** | SECOND | Adjusts the normal quantile for skew and kurtosis. Worth it because the normal VaR is *visibly* wrong for equities and the correction is 5 lines. |
| **CVaR / Expected shortfall (95)** | SECOND | Mean of the tail beyond VaR. Answers "and when it is that bad, how bad on average?" — strictly more informative than VaR and equally easy. |
| **Skewness / excess kurtosis** | SECOND | Needed as PSR inputs anyway; display in the "is Sharpe trustworthy here?" explainer rather than as standalone stats. |
| **Beta (+ R²)** | CORE | Never show beta without R². Add **downside beta** (Bawa–Lindenberg) as a SECOND metric: beta estimated only on days the benchmark fell. |
| **Up/down capture** | CORE | `mean(r | r_b>0)/mean(r_b | r_b>0)` and the analogous down version. Extremely legible: "captures 105% of the up moves and 118% of the down moves." |
| **Named stress episodes** | CORE | Return and max drawdown over hard-coded windows: GFC (2007-10-09→2009-03-09), COVID crash (2020-02-19→2020-03-23), 2022 rate shock (2022-01-03→2022-10-12), plus SVB-Mar-2023. Concrete beats abstract. |
| **Rolling 1y return distribution** | CORE | The percentage of all rolling 12-month windows in which the instrument beat the benchmark, and the worst such window. Neutralises start-date cherry-picking. |
| **Days-to-liquidate / ADV concentration** | SKIP | Institutional; irrelevant at retail size. |
| **MFE / MAE** | SKIP | Trade-level excursion metrics for active traders; no meaning for a buy-and-hold hypothetical. Reconsider only if position-level trade analysis is ever added. |

### B.3 Diversification and relationship

| Metric | Grade | Notes |
|---|---|---|
| **Pearson correlation of daily returns** | CORE | The headline. Must state the window. |
| **Rolling 90-day correlation** | CORE | A single correlation number hides regime change; the rolling line is where the user learns that correlations move. |
| **Downside / tail correlation** | CORE (differentiator) | Correlation computed on the subset of days where the benchmark was in its worst decile. Typically much higher than the headline. This is the honest answer to "does this diversify me?" |
| **Diversification ratio** | SECOND | `Σw_iσ_i / σ_portfolio` for the equal-weight combination of the compared tickers. One number for "how much did combining these actually help?" |
| **ETF holdings overlap** | SECOND | Jaccard/weight overlap between two funds' top holdings via `yfinance` `funds_data`. For "VOO vs VTI" this is the *only* comparison that matters and no retail tool shows it. |
| **Cointegration / Engle–Granger** | SKIP | Pairs-trading tool; not a retail decision aid. |
| **Principal component / risk decomposition** | SKIP | Requires a portfolio, not a pair. Revisit if portfolio-level analytics are ever added. |

### B.4 Valuation and fundamentals

All sourced from `yfinance` `.info`, `.income_stmt`, `.balance_sheet`, `.cashflow`,
`.funds_data`, `.growth_estimates`.

| Metric | Grade | Notes |
|---|---|---|
| **Trailing & forward P/E** | CORE | Always paired with a peer/sector reference so the number is interpretable. |
| **P/B** | CORE | Flag that it is close to meaningless for asset-light software and for financials it is the primary metric — context-dependence must be in the tooltip. |
| **EV/EBITDA** | CORE | Capital-structure-neutral; the multiple professionals actually use for cross-company comparison. |
| **EV/Sales** | SECOND | The fallback when earnings are negative — which is exactly when P/E goes blank and a naive UI shows "—". |
| **PEG** | SECOND | Growth-adjusted P/E. Yahoo's `pegRatio` field is unreliable across versions; compute `forwardPE / (forward earnings growth ×100)` from `growth_estimates` and label the source. Breaks (and must be suppressed) when growth ≤ 0. |
| **Dividend yield + payout ratio** | CORE | Yield alone invites the yield trap; the payout ratio is what says whether it is sustainable. Always show as a pair. |
| **FCF yield** | CORE | `freeCashflow / marketCap`. Harder to manipulate than earnings; Buffett-adjacent; and it is defined when P/E is not. |
| **ROE, ROIC proxy** | CORE | Quality. ROE must be shown alongside debt/equity, since leverage inflates ROE mechanically. |
| **Debt/Equity, Net debt/EBITDA, interest coverage** | CORE | Solvency. The single best predictor of permanent capital loss (Marks' definition of risk). |
| **Gross & operating margin, 5y trend** | SECOND | Trend beats level. Direction of margin is the cheapest moat proxy available from public data. |
| **Revenue/EPS 5y CAGR** | CORE | Trajectory, which the brief explicitly asks for. |
| **Expense ratio (funds)** | CORE **mandatory for funds** | Bogle. The highest-signal fund field. |
| **Fund AUM, inception, top-10 concentration** | SECOND | Liquidity/closure risk and the "is this really diversified?" question. |
| **Short interest, insider transactions** | SECOND | Available via `yfinance`; interesting colour for feature 4, weak signal, must not be framed as predictive. |
| **Altman Z-score** | SECOND | Computable from the balance sheet; a genuinely good distress screen. Only valid for non-financial, non-fund issuers — must be suppressed otherwise. |
| **Piotroski F-score** | SECOND | Nine binary accounting tests, all computable from the three statements. Excellent teaching device because each of the nine is individually explicable. Good candidate for feature 4's fundamentals block. |
| **DCF fair value** | SKIP | The output is a function of assumptions the user cannot calibrate; presenting a single fair value would be exactly the false precision the brief prohibits. |

### B.5 Technical and time-series

| Metric | Grade | Notes |
|---|---|---|
| **SMA/EMA 20/50/200 + cross detection** | CORE | The brief's request; widely watched. |
| **RSI(14) Wilder** | CORE | Must be contextualised by trend strength — see ADX below. |
| **MACD(12,26,9)** | CORE | |
| **Bollinger(20,2) + %B + bandwidth + squeeze percentile** | CORE | |
| **ATR(14) + ATR%** | CORE | Frame as "typical daily range", which is useful even to a non-trader for sizing expectations. |
| **OBV + OBV divergence** | CORE | The brief's request; the divergence detection is what makes it more than a squiggle. |
| **ADX/DMI(14)** | CORE (added) | **The missing contextualiser.** ADX < 20 means range-bound (oscillators like RSI are more meaningful); ADX > 25 means trending (RSI overbought can persist for months). Without ADX, the RSI explanation the brief asks for cannot actually be made context-aware. |
| **Stochastic %K/%D(14,3)** | SECOND | Largely redundant with RSI; include for familiarity, not for extra information. |
| **Variance ratio (Lo–MacKinlay)** | SECOND (differentiator) | Does this series trend or mean-revert, statistically? The honest meta-answer to "do these indicators apply here?" |
| **Hurst exponent (R/S or DFA)** | SECOND | Same purpose as VR, less rigorous inference. Pick VR; mention Hurst only if a second opinion is wanted. |
| **EWMA volatility (RiskMetrics λ=0.94)** | CORE | Current volatility regime, and the correct default parameterisation for the Monte Carlo. |
| **Parkinson / Garman–Klass volatility** | SECOND | High/low-based estimators, ~5× more efficient than close-to-close. Cheap accuracy win since we already have OHLC. |
| **Support/resistance clustering** | CORE | Fractal pivots + agglomerative clustering (sklearn) + touch/recency/volume scoring. |
| **GARCH(1,1)** | SKIP | Would require the `arch` package. EWMA captures ~most of the volatility-clustering benefit with zero new dependencies. |
| **Ichimoku, Elliott waves, Fibonacci, candlestick patterns** | SKIP | Either unfalsifiable or with published evidence indistinguishable from noise. Including them would undercut the project's credibility. |
| **LSTM/Transformer price forecast** | SKIP — hard no | See A.2. No published evidence of out-of-sample edge at daily horizons for single-name equities; would violate the honesty principle and the dependency constraint simultaneously. |

### B.6 Backtest-honesty instruments

| Metric | Grade | Notes |
|---|---|---|
| **Benchmark-matched cashflows** | CORE | The benchmark must receive *identical* contributions on identical dates, or DCA comparisons are meaningless. |
| **TWR and MWR (IRR) both** | CORE | GIPS logic. With DCA they differ, and the difference *is* the timing luck. |
| **Entry-date sensitivity band** | CORE (differentiator) | Re-run the backtest for entry dates in ±30 calendar days and show the distribution of outcomes. Directly quantifies the cherry-picking the brief worries about. |
| **Rolling-window win rate vs benchmark** | CORE | Removes the single-start-date artefact. |
| **DSR over the user's own trial count** | CORE (differentiator) | See A.2. |
| **Cost drag as a cumulative line** | CORE | Bogle. Shows compounding of fees rather than a one-off subtraction. |
| **Survivorship-bias disclosure** | CORE | Static copy, tied to Bessembinder (2018). |
| **Hit-rate binomial test on the sandbox library** | CORE | With n < 20 scenarios, a 60% hit rate is not evidence of anything; state the p-value rather than implying skill. |

---

## Part C — Exact mathematics

Conventions used by every plan. `A` is the annualisation factor: **252** for equities/ETFs,
**365** for crypto (24/7 markets), resolved per-symbol from the instrument type and stored
alongside the price series.

**C.1 Returns.** Simple daily returns from adjusted closes,
`r_t = P_t/P_{t−1} − 1`, dropping the first NaN. Log returns `ℓ_t = ln(P_t/P_{t−1})` are used
only for simulation and aggregation. Prices come from `yfinance` with `auto_adjust=True`, so
they are split- and dividend-adjusted; every return figure is therefore a **total return**,
and the UI must say so.

**C.2 CAGR.** `CAGR = (P_end/P_start)^(365.25/D) − 1`, where `D` is the count of **calendar**
days between the first and last observation. Using trading days introduces a systematic bias
when comparing a crypto series to an equity series. Undefined for `D < 30`; return `None` and
show the cumulative return instead.

**C.3 Annualised volatility.** `σ_ann = std(r, ddof=1) · √A`.

**C.4 Sharpe.** Convert the annual risk-free rate to a per-period rate geometrically:
`r_f,period = (1 + r_f,ann)^(1/A) − 1`. Then with `e_t = r_t − r_f,period`:
`Sharpe = (mean(e)·A) / (std(e, ddof=1)·√A)`.
Confidence interval via the Lo (2002) standard error `SE(Ŝ_ann) ≈ √((1 + Ŝ_ann²/(2A))/n) · √A`
— report the 95% interval `Ŝ ± 1.96·SE`. Return `None` when `n < 60`.

**C.5 Sortino.** With MAR expressed per period (default MAR = 0):
`TDD = √( (1/n) · Σ_t min(r_t − MAR, 0)² )` — **divisor n, all observations**.
`Sortino = ((mean(r) − MAR)·A) / (TDD·√A)`. If `TDD == 0` (no period below MAR), return
`None` and render "no downside in this period" rather than `∞`.

**C.6 Drawdown.** `W_t = Π(1+r_i)`; `peak_t = cummax(W_t)`; `dd_t = W_t/peak_t − 1`;
`MDD = min(dd_t)`. Peak date = argmax of `W` before the trough; recovery date = first `t >
trough` with `W_t ≥ W_peak`, else `None` (still under water). Time-under-water = the longest
run of consecutive `dd_t < 0`. `UlcerIndex = √(mean((100·dd_t)²))` in percentage points.

**C.7 Probabilistic Sharpe Ratio.** With the **non-annualised** (per-period) Sharpe `Ŝ`,
sample skewness `γ₃`, sample kurtosis `γ₄` (non-excess, i.e. 3 for a normal), n observations,
and a benchmark Sharpe `S*` (per-period, default 0):

```
PSR(S*) = Φ( (Ŝ − S*)·√(n−1) / √(1 − γ₃·Ŝ + ((γ₄−1)/4)·Ŝ²) )
```

Guard: if the radicand ≤ 0 (possible with extreme kurtosis and short samples), return `None`.

**C.8 Deflated Sharpe Ratio.** With `N` independent trials and `V = Var(Ŝ_n)` across those
trials (or, when unavailable, the analytic `√((1+Ŝ²/2)/n)`), the expected maximum Sharpe
under the null of zero skill is

```
S₀ = √V · [ (1−γ)·Φ⁻¹(1 − 1/N) + γ·Φ⁻¹(1 − 1/(N·e)) ],  γ = 0.5772156649 (Euler–Mascheroni)
```

and `DSR = PSR(S₀)`. Requires `N ≥ 2`.

**C.9 Beta, alpha, R².** OLS of excess asset returns on excess benchmark returns via
`statsmodels.api.OLS(...).fit(cov_type='HAC', cov_kwds={'maxlags': int(n**0.25)})` — the
Newey–West correction matters because daily returns are heteroskedastic. Report `β`, its
95% CI, annualised `α = α_daily · A`, `α`'s t-stat and p-value, and `R²`. Suppress the
Treynor ratio and de-emphasise `α` when `R² < 0.3`.
**Downside beta**: the same regression restricted to days where `r_b < 0`.

**C.10 Up/down capture.**
`UpCapture = mean(r_t | r_b,t > 0) / mean(r_b,t | r_b,t > 0)`, and symmetrically for down
days. Require ≥ 20 qualifying days or return `None`.

**C.11 VaR / CVaR.** Historical: `VaR₉₅ = −quantile(r, 0.05)`;
`CVaR₉₅ = −mean(r | r ≤ quantile(r, 0.05))`. Cornish–Fisher modified VaR with `z = Φ⁻¹(0.05)`,
skew `S`, excess kurtosis `K`:
`z_cf = z + (z²−1)S/6 + (z³−3z)K/24 − (2z³−5z)S²/36`, then `mVaR = −(μ + z_cf·σ)`.

**C.12 Correlation.** Pearson on the **intersection of trading days** (inner join — never
forward-fill one series onto another market's calendar, which manufactures zero returns and
biases correlation toward 0). Rolling 90-day via `.rolling(90).corr()`. Downside correlation:
restrict to days where `r_b` is in its worst decile over the window; require ≥ 20 such days.

**C.13 Wilder smoothing** (RSI, ATR, ADX): `x̄_t = x̄_{t−1} + (x_t − x̄_{t−1})/n`, equivalent
to an EMA with `α = 1/n`, seeded with the simple mean of the first `n` values. This is *not*
`pandas.ewm(span=n)` — using the wrong smoothing is the most common technical-indicator bug
and produces visibly different RSI values from every charting package.

**C.14 Stationary block bootstrap** (Politis–Romano 1994). Given `n` historical log returns
and mean block length `L` (default `L = max(5, round(n^(1/3)))`, Politis–White automatic
selection optional): to build a simulated path of `H` steps, repeatedly pick a uniform random
start index, then extend the block with probability `1 − 1/L` at each step (circularly
wrapping) and start a new random block with probability `1/L`. Concatenate to length `H`.
Simulated price path `P_H = P_0 · exp(Σ ℓ)`.

**C.15 GBM (secondary/teaching model).** `ℓ_t ~ N(μ − σ²/2, σ²)` per step, with `μ`, `σ`
estimated from the trailing window. Report the standard error of the drift estimate,
`SE(μ̂_ann) = σ_ann/√(n/A)` — for a 25%-volatility stock with 3 years of data, `SE ≈ 14%/yr`,
which is the honest reason we default the drift to **zero**.

**C.16 Money-weighted return (IRR).** Solve `Σ CF_i/(1+irr)^(t_i/365.25) = 0` for `irr` using
`scipy.optimize.brentq` over `[-0.9999, 10.0]`, with the terminal value entered as a positive
final cash flow. Fall back to `None` if the function does not change sign over the bracket.

---

## Part D — Deliberate exclusions

Recorded so a future reader knows these were decided, not overlooked.

1. **No price point-forecasts of any kind.** Distributions only. (A.2)
2. **No neural or gradient-boosted forecasting models.** No published edge at this horizon;
   would breach the dependency constraint and the honesty principle.
3. **No portfolio optimiser / efficient frontier.** Estimation error dominates. (A.1)
4. **No multi-factor (FF3/FF5/q) regressions.** Factor return series are not reliably
   sourceable for this instrument universe, and the profession has not converged. (A.1)
5. **No DCF fair value.** False precision.
6. **No GARCH.** Would add the `arch` dependency for a marginal gain over EWMA.
7. **No pattern-recognition technicals** (Elliott, Ichimoku, candlestick patterns).
8. **No buy/sell signals, scores, or ratings generated by the app.** The app may report that
   *an external analyst consensus exists*; it never produces one.

---

## Part E — Sources

Academic and practitioner works cited above are given inline by author and year. Web sources
consulted while preparing this document:

- [The Deflated Sharpe Ratio (Bailey & López de Prado), SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551)
- [Deflated Sharpe ratio — Wikipedia](https://en.wikipedia.org/wiki/Deflated_Sharpe_ratio)
- [Statistical Overfitting and Backtest Performance (Bailey et al., LBL)](https://sdm.lbl.gov/oapapers/ssrn-id2507040-bailey.pdf)
- [Sortino: A 'Sharper' Ratio — Rollinger & Hoffman, CME Group](https://www.cmegroup.com/education/files/rr-sortino-a-sharper-ratio.pdf)
- [Sortino Ratio — performance-measurement.org](http://www.performance-measurement.org/sortino.html)
- [An Intuitive Examination of Downside Risk — FPA Journal](https://www.financialplanningassociation.org/article/journal/JUN13-intuitive-examination-downside-risk)
- [q⁵ model (Hou, Mo, Xue & Zhang), NBER w24709](https://www.nber.org/system/files/working_papers/w24709/w24709.pdf)
- [Which Factors? — global-q.org lecture notes](https://global-q.org/uploads/1/2/2/6/122679606/slides_whichfactors_2021may.pdf)
- [Building a Better q-Factor Asset Pricing Model — Alpha Architect](https://alphaarchitect.com/building-a-better-q-factor-asset-pricing-model/)
- [Bootstrap simulation for financial planning — Portfolio Optimizer](https://portfoliooptimizer.io/blog/bootstrap-simulation-with-portfolio-optimizer-usage-for-financial-planning/)
