# Investments

The Investments area is a self-contained workspace for your brokerage accounts plus market research tools. It's **enabled by default** and needs no server-wide API keys. Each user connects their own broker.

## Connect a broker

Supported brokers:

| Broker | Notes |
|---|---|
| **Freedom24** (Tradernet) | Balance, positions and trade history. |
| **Binance** (spot) | Cost basis is a replayed weighted average. Trade history is fetched for `*USDT` pairs only. Stablecoins count as cash. Flexible Earn positions are shown separately. |

Steps:

1. In your broker, create an **API key and secret**. Prefer read-only permissions, because Home Finance only reads.
2. In the app, open **Investments → Connect account**, choose the broker, and enter a name, currency and both keys.
3. The app syncs immediately, so bad keys fail right away.

Keys are encrypted at rest, never returned by the API, and can be rotated from the account's menu.

> Keys are encrypted with a key derived from your server settings. Don't rotate `SECRET_KEY` casually. See [rotating secrets](operations.md#rotating-secrets).

### Sync

- A scheduled job runs every `INVESTMENT_SYNC_INTERVAL_HOURS` (default 4) when `INVESTMENT_SYNC_ENABLED=true`.
- **Sync now** is throttled by `INVESTMENT_MANUAL_SYNC_COOLDOWN_SECONDS` (60).
- Each sync replaces positions and re-reads the trade history. A failure is recorded on that account and never blocks others.

### Ticker mapping

Broker tickers are mapped to Yahoo Finance tickers for prices and research (for example Freedom24 `VIO.GR` to `VIO.AT`, or Binance `BTC` to `BTC-USD`). The guess is accepted only if the symbol has price data in the same currency as your broker. Otherwise the holding falls back to the broker's own prices. You can **pin a mapping** per holding if the guess is wrong.

## What you get

| Feature | Where | What it does |
|---|---|---|
| Portfolio overview | `/investments` | Value, today's and all-time change, allocation, concentration, risk, currency exposure, top movers, trading costs, recent activity. Totals are never summed across currencies. |
| Holding history | `/investments/holdings/:account/:symbol` | The "journey" of one position: quantity from your trades against price history. |
| Market news | `/investments/news` | Headlines for your holdings and watchlist. |
| Company research | `/investments/research` | Profile, fundamentals, news, fund holdings and rolling metrics. |
| Ticker comparison | `/investments/compare` | Up to 5 symbols side by side: normalized performance, risk-adjusted returns (Sharpe, Sortino), correlation, max drawdown, versus a benchmark. Saved comparisons and PDF export. |
| Technical analysis | `/investments/technical` | Indicators, regime, support and resistance, a confluence signal panel, and a Monte Carlo fan chart. |
| Backtesting | `/investments/backtest` | Replays a strategy on history with contributions, costs, dividend handling and a benchmark. |
| Scenarios | `/investments/scenarios` | Save backtests and forward simulations. Open ones are revalued nightly, building a track record. |
| Watchlist | Investments page | Saved symbols, priced from Yahoo Finance. |

Everything here is **decision support, not advice**. It describes history and risk and never predicts prices.

## Data sources and limits

- **Prices, news and research** come from Yahoo Finance through `yfinance`. No key is needed, but the server needs outbound internet access.
- Yahoo data can be missing or inaccurate, especially for non-US and small-cap tickers. The app flags data gaps rather than hiding them.
- The AI advisor's investment tools use the same data. See [AI advisor](ai-advisor.md).
- The PDF exports for comparison and company research are generated in your browser.

## Related: trackers

**Trackers** (`/trackers`) are not investment watchlists. They are free-form buckets for spending, like "Trip to Italy", with an optional target. A transaction can belong to several trackers.

## Tuning

Analytics defaults (risk-free rate, default benchmark, simulation size and history limits) are listed in the [configuration reference](configuration.md#investments-and-analytics). To switch the AI's access to investment data off, set `AI_INVESTMENT_TOOLS_ENABLED=false`.
