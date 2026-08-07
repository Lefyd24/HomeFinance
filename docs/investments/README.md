# Investment Analytics — planning documents

Response to `INVESTMENT_MODULE_ENHANCEMENT.md`. Read in this order.

| Doc | What it is |
|---|---|
| [`00-research-foundations.md`](./00-research-foundations.md) | Steps 1–2. The literature (classic and post-2015), what professionals actually use, the graded metric inventory (CORE / SECOND / SKIP), exact mathematics for every formula, and the deliberate exclusions with their reasons. |
| [`01-ticker-comparison.md`](./01-ticker-comparison.md) | Feature 1. **Also specifies the two shared modules** (`market_data` price cache, `analytics` metric library) and the plain-language glossary primitive that plans 2 and 3 depend on. Implement first. |
| [`02-backtesting-sandbox.md`](./02-backtesting-sandbox.md) | Feature 2. Backtest engine, forward sandbox with a nightly scheduler job, scenario library, and the honesty instruments (entry-date sensitivity, deflated Sharpe, track record). |
| [`03-technical-analysis.md`](./03-technical-analysis.md) | Feature 3. Indicators with correct Wilder smoothing, regime contextualisers (ADX, variance ratio), support/resistance clustering, and the block-bootstrap Monte Carlo. |
| [`04-ai-market-research.md`](./04-ai-market-research.md) | Feature 4. Evidence-pack collection, structured DeepSeek synthesis, and the citation/advice validator that keeps it honest. |

Each of `01`–`04` is self-contained — a separate agent can implement any one without reading
the others. `01` builds the shared foundation; `02` and `03` restate its contract and build it
themselves if it is not there yet.

**Constraints honoured throughout**: numpy / pandas / statsmodels / scikit-learn / scipy only
(all already in `pyproject.toml`); no new heavy dependencies; shadcn/Radix + recharts +
the existing `Tile` / `Metric` / `DeltaPct` / `DeltaPill` primitives on the frontend; and no
feature anywhere emits a recommendation.
