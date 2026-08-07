# Investment Module Enhancement — Agent Briefing

> **To the agent reading this**: This document describes the features I want you to research, plan, and ultimately implement. I am talking directly to you. There is no "client" or "user" — just me telling you what I want to achieve, why, and what quality bar I expect. At the end of this document, I give you specific instructions for your next steps. Follow them carefully.

---

## What We Have Today

I run a self-hosted personal finance app. It already has an investments module: I can connect brokerage accounts (Freedom24, Binance), sync holdings and transactions, and see a monitoring dashboard. It also pulls market data from Yahoo Finance — ticker search, company profiles, and news.

But the module is purely descriptive. It tells me what my portfolio *is*. It cannot help me answer the harder questions I face as an investor:

- "Should I put more money into this stock or that ETF?"
- "What would have happened if I'd made a different decision two years ago?"
- "How do I compare these two investments properly, beyond just looking at a price chart?"
- "What does the data actually say about where this instrument might be heading?"
- "Can I get a structured research report on a company without spending hours reading scattered news articles?"

The four features described below turn the investments module from a monitoring dashboard into a decision-support tool. The goal is NOT to tell me what to do — that would be investment advice, and I don't want that. The goal is to give me analytical firepower so I can make my own informed decisions, with the same kind of rigor a professional would apply.

---

## Feature 1: Ticker Comparison

### What I want to do

Select two or more tickers — stocks, ETFs, bonds, crypto — and see a side-by-side analytical comparison that helps me understand how these instruments differ as investment opportunities. This is for when I'm trying to decide between alternatives: "Should I add more Apple, diversify into an S&P 500 ETF, or pick up some Microsoft?"

### Why this matters to me

Like most retail investors, I face "this or that" decisions constantly. Most people compare by glancing at a price chart and maybe a P/E ratio. That's not real comparison — it's two numbers next to each other. I want to understand which investment would genuinely have been better *adjusted for risk*, not just which one had the flashier return.

A stock that returned 40% but dropped 60% at one point is a worse investment for someone like me than one that returned 25% with a smooth ride. Risk-adjusted metrics exist precisely to answer this — they measure return *per unit of risk taken*. That's what I want to see.

### What good looks like

- **Risk-adjusted returns are the headline**, not raw returns. Show me Sharpe ratio, Sortino ratio, not just "AAPL went up 45%." The Sortino ratio matters more to me because it only penalizes downside — I don't mind upside surprises.

- **Performance is normalized.** If I'm comparing a $500 stock to a $20 stock, overlay their price lines on the same chart both starting at 100. Without normalization, the comparison is visually meaningless.

- **Correlation tells me about diversification.** If two stocks have a 0.92 correlation, adding both to my portfolio doesn't actually diversify — they move together. Surface this explicitly so I understand what I'm really buying.

- **Risk metrics I can feel.** Maximum drawdown — "what was the worst peak-to-trough drop in this period" — is more intuitive to me than standard deviation. People understand "you would have been down 52% at one point" better than "annualized volatility was 28%." Show both, but make drawdown prominent.

- **Valuation context in a sortable table.** P/E, P/B, EV/EBITDA, dividend yield, price-to-book, PEG ratio. Let me rank by whatever metric I care about that day.

- **Benchmark comparison is always available.** Let me throw the S&P 500 (^GSPC) into the comparison as if it were another ticker. This answers the most important question in investing: "Would I have been better off just buying the index?"

### What this is NOT

Not a stock screener. Not a portfolio optimizer solving for the efficient frontier. Not giving me a recommendation — it presents numbers, I interpret them.

---

## Feature 2: Backtesting & Forward Sandbox

### What I want to do

**Backtesting (retrospective)**: "If I had invested €5,000 in Microsoft on January 15, 2022, what would my position be worth today?" I want to see the full journey — the chart of what happened month by month, the worst moment (maximum drawdown), and a comparison against what would have happened if I'd put the same money in a broad market index instead.

**Forward sandbox (prospective)**: "I'm thinking of investing €5,000 in Microsoft today. Let me track what would happen from now on, day by day, without committing real money." I want the app to track this hypothetical position, updating its value with real market prices daily, so over weeks and months I can see whether my instinct was right.

**Persistence for both**: I want to save these scenarios with a name. Build a personal library of "what if" scenarios I can revisit. Over time, this becomes a decision journal — I can look back and see which of my hypothetical choices worked out and which didn't.

### Why this matters to me

The biggest gap in my investing decision-making is that I never learn from the road not taken. I only experience the path I actually chose. I never see what would have happened if I'd made a different call. Backtesting lets me explore those counterfactuals. Forward sandboxing lets me place a bet against myself — "let's see if my gut feeling was right" — without any financial risk.

There's a psychological benefit too. I know I tend to overestimate my ability to pick winners (everyone does — this is well-documented in behavioral economics). A library of forward sandbox scenarios that underperformed the index is a powerful corrective. It turns "I knew I should have bought that" into "actually, my hypothetical picks underperformed the S&P 500 by 4% on average." That kind of honest feedback is worth more than any amount of advice.

### What good looks like

- **Honesty about cherry-picking.** If I pick specific entry and exit dates and ask "what if," the result is inherently overfitted — I literally chose the dates after seeing what happened. The tool should acknowledge this: "You selected these dates. This shows what actually happened during this period, not what will happen in the future."

- **Benchmark comparison is mandatory.** Every backtest result must include the S&P 500 over the same period. A gain of 15% sounds great until I see the index gained 22%. The benchmark keeps me honest.

- **Acknowledge survivorship bias.** I can only backtest stocks that still exist. Delisted stocks — the ones that went to zero — are invisible. Note this limitation.

- **Account for transaction costs.** Even a simple assumption — 0.1% per trade or a flat €5 fee — makes the result more grounded in reality than a frictionless theoretical trade.

- **The forward sandbox updates automatically.** Once I create a forward scenario, a background job updates its value daily with real market prices. I shouldn't have to remember to refresh it.

- **The library shows me my track record.** When I browse my saved scenarios, show me aggregate stats: how many outperformed the benchmark, my average return vs the index, my best and worst calls. This is the learning loop.

### What this is NOT

Not a strategy optimizer. Not a trading simulator with limit orders and stop-losses. Not predicting the future — it's exploring hypotheticals and tracking what actually happens.

---

## Feature 3: Technical Analysis & Predictive Analytics

### What I want to do

For any ticker, see a dashboard of technical indicators and predictive analytics that help me understand price behavior, trends, momentum, and volatility. This is not about magically predicting tomorrow's price. It's about surfacing the patterns and signals that professional traders and analysts look at, while being intellectually honest about what these signals can and cannot tell me.

### Why this matters to me

I hear terms like "RSI indicates oversold," "golden cross," "Bollinger Bands are squeezing" on financial media. I want to understand what these mean and be able to check them myself. Technical analysis is controversial in academic finance — the efficient market hypothesis says it shouldn't work — but real traders use it daily, and behavioral finance research suggests why: markets aren't perfectly rational, and indicators can become self-fulfilling when enough people believe in them.

More importantly, I want the app to help me think probabilistically about investments rather than in binary "will it go up or down" terms. Monte Carlo simulation, which shows a distribution of possible future outcomes rather than a single point prediction, is how professional risk managers think. I want that mindset available to me.

### What good looks like

- **Multiple confirming signals, never one in isolation.** Professional analysts never trade on a single indicator. They look for confluence — RSI AND MACD AND volume all pointing the same direction. Present indicators as a panel of signals, not as individual "buy/sell" traffic lights.

- **The indicators that have real market significance:**
  - Trend: Simple and exponential moving averages (20, 50, 200-day). The 50/200-day crossover ("golden cross" / "death cross") is one of the most widely followed signals in global markets.
  - Momentum: RSI for overbought/oversold conditions. MACD for momentum shifts.
  - Volatility: Bollinger Bands (price relative to standard deviation bands). When bands contract, breakouts tend to follow. ATR (Average True Range) for understanding typical daily movement — useful for setting stop-losses.
  - Volume: On-Balance Volume (OBV) to confirm whether price movements are backed by real trading activity.

- **Explanation, not just numbers.** An RSI of 72 means nothing without context. Explain: "RSI above 70 typically suggests the instrument may be overbought. However, in strong uptrends, RSI can remain elevated for weeks. This is a caution signal, not a sell order."

- **Monte Carlo simulation, not point forecasts.** A single "predicted price: €185.40" is dishonest — nobody can predict prices with that precision. Monte Carlo is honest: it simulates thousands of possible future paths based on historical volatility and drift, then shows the distribution. "Based on this instrument's historical behavior, there's roughly a 50% probability the price lands between €170 and €210 in 30 days, but a 5% chance it falls below €140." This is how professionals think about risk.

- **Auto-detected support and resistance levels.** These are price zones where the instrument has repeatedly reversed direction in the past. They're visualizations of where other market participants have placed orders. "AAPL has bounced off approximately $165 four times in the last year. The market treats this level as significant."

### What this is NOT

Not a trading signal generator. Never says "BUY" or "SELL." Not claiming to predict the future — every forward-looking analysis comes with confidence intervals and a clear statement about uncertainty. Not a replacement for a professional trading platform — this is analytical context, not execution.

---

## Feature 4: AI-Powered Market Research

### What I want to do

Request a deep research report on any ticker. The app gathers everything available — company fundamentals, recent news, analyst ratings, market data — and uses the existing AI integration (DeepSeek) to synthesize it into a structured, readable research report. The report should read like an analyst's morning brief: factual, balanced, with clear sections and cited sources.

### Why this matters to me

I don't have a research department. I read a few news headlines, maybe glance at a P/E ratio, and make decisions based on fragments. A Bloomberg terminal costs $24,000/year. Professional analysts spend hours compiling the kind of overview an AI can generate in seconds by synthesizing information that's already public but scattered across dozens of sources.

The AI's value is not in being smarter than the market — it can't be. Its value is as a research assistant: gather, organize, contextualize, present. The synthesis is the product, not original insight.

### What good looks like

- **Executive summary first.** Two to three sentences: what the company does, what's happening right now, the key question. I should understand the thesis in 15 seconds, then decide whether to read deeper.

- **The sections a real analyst would include:**
  - Company fundamentals (market cap, sector, revenue trajectory, P/E, forward P/E, dividend yield, beta, 52-week range) — with context, not just numbers. "P/E of 28.5 is above the sector average of 22.1, suggesting the market is pricing in growth expectations."
  - Recent developments synthesized from news — not a list of headlines but identified themes: "Three of the last ten articles discuss EU regulatory action, suggesting this is the dominant narrative."
  - Analyst consensus: average price target, buy/hold/sell distribution, recent rating changes.
  - Risk factors: 3–5 specific, named risks drawn from the data. Not generic ("market risk") but specific ("40% of revenue from one client," "regulatory deadline in Q3 2025").
  - Bull case and bear case: one paragraph each, fairly argued. This section is the most valuable — seeing the argument for and against, side by side.

- **Sources are cited.** Every factual claim references where it came from — a specific news article, a metric from the company profile, an analyst rating. I should be able to verify anything the report tells me.

- **The AI is honest about uncertainty.** When data is mixed or insufficient, the report says so. "Analyst opinions are split: 12 buy, 11 hold, 5 sell. There is no clear consensus." That's more useful than confidently picking a side with weak evidence.

- **The report ends with a disclaimer.** It makes clear this is information synthesis, not investment advice. The decision belongs to me.

- **I can switch between quick and deep.** Quick mode uses 5–10 articles and core fundamentals, takes seconds. Deep mode uses 30+ articles, earnings history, takes longer but provides richer context. I choose based on how important the decision is.

### What this is NOT

Not a robo-advisor. Not claiming AI can beat the market. Not a real-time news feed — these are on-demand reports, not streaming analysis. Not financial advice.

---

## Principles That Apply to Everything

These are non-negotiable. Every feature must embody these.

**Honesty about uncertainty.** Every predictive or analytical feature communicates its limitations. A backtest reminds me it's historical, not predictive. A Monte Carlo simulation shows the range of outcomes, not a single number. A technical indicator comes with a note about its reliability. Financial data is noisy, and tools that pretend otherwise are harmful to the people using them.

**Risk-adjusted thinking.** Raw returns are easy to compute and easy to misinterpret. Every comparison, every backtest, every analysis leads with risk-adjusted metrics — Sharpe ratio, Sortino ratio, max drawdown, volatility. This is how professionals evaluate investments, and it's the single biggest upgrade I can get over what typical retail tools offer.

**Benchmark everything.** No return number stands alone. A 12% annual return is meaningless without knowing the S&P 500 returned 15% over the same period. Every feature that shows performance includes a benchmark comparison.

**The tool educates, it doesn't command.** Never say "buy this" or "sell that." Say: "Here's what the data shows. Here's what professionals look at. Here's what happened historically. Here's what could happen based on this instrument's past behavior. The decision is yours." The educational value — me learning to think more rigorously about investments — is as important as the analytical value.

**Data provenance.** Where did each number come from? A P/E ratio from Yahoo Finance. A news headline from Reuters via Yahoo's feed. An analyst rating from consensus estimates. Every claim should be traceable to its source. This separates a research tool from a black box.

**Plain language in the UI.** I am not a professional portfolio manager. Every metric, every module, every indicator in the UI should include a plain-language explanation of what it means and why it matters. Don't just show "Sharpe Ratio: 0.82" — add a tooltip or caption: "For every unit of risk taken, this investment returned 0.82 units of excess return. Above 1.0 is considered good, above 2.0 is excellent." An average person should be able to use this app and learn from it without a finance degree.

---

## Your Instructions

Here is what I need you to do, in this exact order. Do not skip steps.

### Step 1: Become an expert

Before you write a single line of code or draw a single wireframe, I need you to do deep research. I am not asking you to Google a few terms and summarize. I am asking you to:

- **Study the academic literature.** Find the key papers in financial economics that are relevant to what we're building. Markowitz on portfolio theory (1952). Sharpe on the ratio that bears his name (1966, revised 1994). Sortino on downside risk (1994). Fama and French on factor models (1993, 2015). Jegadeesh and Titman on momentum (1993). The behavioral finance canon — Kahneman and Tversky (1979) on prospect theory, Barber and Odean on retail investor behavior. What does the academic consensus actually say about which metrics matter, which strategies persist, and which are statistical artifacts?

- **Study what professional analysts and investors actually use.** What metrics do CFA charterholders look at? What does a Morningstar analyst report contain? What does a Bloomberg terminal show on its comparison screen? What do hedge fund risk managers monitor daily? Don't guess — find real examples, templates, and frameworks.

- **Identify state-of-the-art techniques from bibliographies and publications.** What's the current best practice for backtesting methodology? What's replaced simple ARIMA in time-series forecasting? What risk decomposition methods are used in 2024? What are the latest factor models beyond Fama-French five-factor? Look at papers from the last 5–10 years, not just the classics.

- **Find more indices and evaluation frameworks than what I listed.** I mentioned Sharpe ratio, Sortino ratio, max drawdown, P/E, P/B, EV/EBITDA, beta. That's a starting point, not an exhaustive list. What about: Calmar ratio, Omega ratio, Treynor ratio, information ratio, Jensen's alpha, ulcer index, value at risk (VaR), conditional VaR (CVaR), maximum favorable excursion, maximum adverse excursion, Ulcer Performance Index, Martin ratio, Sterling ratio, Burke ratio? Which of these actually add value for a retail investor, and which are only useful for institutional portfolio managers?

- **Identify the mathematical formulas and algorithms.** For every metric, every indicator, every model: what is the exact formula? What are the inputs? What assumptions does it make? When does it break down? You need to understand the math before you can implement it correctly.

- **Read top investor opinions and publications.** What does Warren Buffett actually look at (not the folk wisdom, the actual metrics)? What does Howard Marks write about in his memos regarding risk assessment? What does Ray Dalio's "All Weather" portfolio framework suggest about diversification? What do the Bogleheads (followers of Jack Bogle's index investing philosophy) consider essential knowledge?

### Step 2: Identify additional evaluation methods

Based on your research, identify evaluation methodologies, metrics, and analytical frameworks beyond what I've described that would genuinely help a retail investor evaluate opportunities. For each one, explain:

- What it measures and why it matters
- The mathematical foundation (formula, inputs, assumptions)
- Whether it's appropriate for a retail audience or only for professionals
- How it could be presented in the UI so an average person understands it

### Step 3: Build four separate, detailed plans

Create one implementation plan for each of the four features. Each plan must cover:

**Backend**: The data sources, computations, models, API endpoints, and persistence strategy. What gets computed on-the-fly vs cached vs stored. How the scheduler should handle forward sandbox updates. Error handling for missing data, rate limits, non-trading days.

**UI**: The pages, components, layouts, navigation structure. How each metric is visually explained. What charts, tables, and interactive elements are needed. Mobile vs desktop considerations. Loading, empty, and error states. The user flow from landing on the page to getting an answer.

**Mathematical correctness**: For every computation, specify the exact formula and edge cases. For Monte Carlo: what's the stochastic process (Geometric Brownian Motion? Something else?), how many simulations, what distribution assumptions? For technical indicators: exact window sizes, exact formulas, how to handle gaps in data.

**Plain-language explanations**: For every metric and visualization, specify what the plain-language tooltip, caption, or helper text should communicate. An RSI of 65 means something different in a bull market than in a range-bound market — the explanation should account for context.

Each plan should be self-contained. Another agent should be able to pick up any one plan and implement it without reading the others.

### Step 4: Constraints

- **No superpowers.** Do not use superpowers skills for this.

- **Every formula must be implementable in Python with numpy + pandas + statsmodels + scikit-learn.** These are already in the project's dependencies. Do not introduce new heavy dependencies (no TensorFlow, no PyTorch, no Rust extensions, no C libraries) unless you can justify that what we need is genuinely impossible without them.

- **The UI must use the existing design system.** shadcn/ui components, glass-panel surfaces, the existing Tile component pattern, recharts for charts, the Metric/DeltaPct/DeltaPill primitives from InvestmentPrimitives.tsx. Do not invent a new design language.

---

## Success Criteria

When all four features are built, here's what should be true:

1. I can compare two ETFs and immediately see which one delivered better risk-adjusted returns — and understand *why*.

2. I can create a backtest, see the full journey including the worst moment, compare it to the index, and come away with an honest picture of what that investment's path actually looked like.

3. I can look at a technical analysis dashboard and understand what the professionals are looking at, even if I don't trade on it myself. The indicators are explained, not just displayed.

4. I can request an AI research report on a company and get a structured, balanced analysis with cited sources in under a minute.

5. An average person with no finance background can use every feature and learn from the explanations provided in the UI. Nothing feels like a black box.

6. The app never crosses the line into giving investment advice. Every feature communicates its limitations.
