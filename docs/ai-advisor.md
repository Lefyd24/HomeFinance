# AI advisor

Home Finance includes two kinds of advice:

- **Calculators** (`/advisor`): deterministic financial calculators that run entirely on your server. No external service.
- **AI chat**: a conversational assistant that looks up your real data before answering. **Optional** and off until you add an API key.

## The calculators

Always available, no setup. They run on your own numbers with plain math:

- Compound growth, retirement, comparison and self-sustaining-withdrawal projections
- Loan and mortgage amortization, early payoff, refinance comparison
- Emergency-fund size recommended from your real spending
- Net worth now, over time, and projected

The API also exposes a basic Greek income-tax estimator (2024 brackets: 9, 22, 28, 36 and 44 percent, with deductions). It is an estimate, not tax advice, and has no UI panel yet.

## AI chat

### Set up

1. Create an API key at [openrouter.ai/keys](https://openrouter.ai/keys).
2. Add it to `.env`:

   ```dotenv
   OPENROUTER_API_KEY=sk-or-...
   ```

3. `docker compose restart app`.

The chat is a floating panel (open it from the round button or the quick-action dial). Without a key, the app works normally and the chat reports that it isn't configured.

[OpenRouter](https://openrouter.ai) is the only provider. It's a gateway to many models, so you choose which one answers.

### Model picker

Each user chooses a model in the chat. The list is OpenRouter's catalogue, filtered to models that support tools, with context length and price per million tokens. It's cached for 24 hours, with a refresh button, and if the catalogue is unreachable the last copy is used. When no model is picked, `AI_DEFAULT_MODEL` (`deepseek/deepseek-chat-v3.1`) is used.

### Cost controls

Every answer shows its token count and cost in USD (marked as an estimate when the provider didn't report a price).

| Control | Default | Effect |
|---|---|---|
| `AI_TURN_COST_CAP_USD` | `0.25` | Stops a single answer that runs up too much cost. Checked after each tool round. |
| `AI_MONTHLY_CAP_USD` | none | Household-wide monthly cap. Once reached, new chats are refused until next month. |
| `AI_CHAT_PER_HOUR` | `60` | Messages per user per hour. |
| `AI_CHAT_MAX_TOOL_ROUNDS` | `10` | Data look-ups the assistant may chain for one question. |
| `AI_MAX_OUTPUT_TOKENS` | `4096` | Maximum answer length. |

`GET /api/ai/usage` reports the current month's spend per model. Details for every variable are in the [configuration reference](configuration.md#ai-advisor-openrouter).

### What it can do

The assistant answers from your data by calling tools. It never guesses figures.

- **Money**: transactions, totals, account balances, budgets, recurring expenses, debts, goals, net worth, emergency-fund status, investable surplus.
- **Planning**: project an investment, compare investing against paying down debt.
- **Investments** (when `AI_INVESTMENT_TOOLS_ENABLED=true`): portfolio overview, positions, allocation, risk, trade history, watchlist, symbol search, company research, symbol comparison, technical analysis and Monte Carlo simulation.
- **Email**: send you a written summary on request. It always goes to your own address.
- **Profile**: read your investor profile, and update it when you tell it something relevant.

### Skills

Skills are guided workflows the assistant loads on demand. Start one with a slash command:

| Command | Skill | Requires |
|---|---|---|
| `/review` | Financial health review: category trends, cash-flow trend, anomalies, subscription audit | nothing |
| `/portfolio` | Portfolio review: rebalance plan, fund costs | investment tools |
| `/research` | Equity research: statements, estimates, peers, DCF valuation, news | investment tools |
| `/opportunities` | Opportunity screening for stocks and ETFs, checked against your portfolio | investment tools |
| `/email` | Email a formatted report, optionally with a PDF | SMTP and email notifications on |
| `/web` | Web research | `AI_WEB_SEARCH_ENABLED=true` (billed extra) |

Skills whose requirement isn't met are hidden. Skills are built into the app, and there is no user-installable skill mechanism.

### Guardrails

- It looks things up with tools instead of answering from memory.
- **It never does arithmetic.** Every figure comes from a deterministic calculation on the server.
- It never predicts prices, attributes analyst opinions to their source, and states the main risk and what would make its advice wrong.
- It respects your investor-profile limits and flags anything that would breach them.
- A fixed disclaimer is appended by the server to answers. The model can't remove or reword it.
- Tools never take a user id, so a tool can only ever see the signed-in user's data.
- It can't trade. Tools read data, apart from the profile update and the emails.

It gives direct recommendations, but it is **not financial advice**. You stay responsible for your decisions.

### Investor profile

Under your user menu (`/investor-profile`): risk tolerance, objective, horizon, liquidity needs, target allocation, maximum single-position size, excluded sectors and tickers, income stability, experience, base currency, tax residency and notes.

- The profile is included in every prompt, and flagged as stale after about six months.
- The assistant can update it, but only through a whitelisted tool with per-field validation and a mandatory reason quoting what you said. It's told never to infer your risk tolerance from behaviour.
- Every change creates a **revision**. The chat shows a card with the reasoning and a one-click **Undo**, and the profile page keeps the full history.

### Privacy: what leaves your server

When you chat, OpenRouter and the provider of the chosen model receive:

- your conversation,
- a system prompt (today's date, an account summary, your investor profile),
- every tool result the model sees, such as transactions, balances, budgets, debts, goals and holdings.

Nothing is sent until you send a message. The `/web` skill additionally sends its search query. Market-data tools separately call Yahoo Finance. Choose a model and provider whose data policy you're comfortable with, and see [Security and privacy](security.md).
