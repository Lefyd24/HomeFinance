import { apiFetch } from '../lib/apiClient'

export type InvestmentProvider = 'freedom24' | 'binance'
export type SyncStatus = 'pending' | 'ok' | 'error'

/** Backends that can power ticker search / market news (broker proxy or Yahoo). */
export type MarketDataProviderId = 'freedom24' | 'binance' | 'yahoo'

export const DEFAULT_MARKET_DATA_PROVIDER: MarketDataProviderId = 'yahoo'

export const MARKET_DATA_PROVIDERS: ReadonlyArray<{
  id: MarketDataProviderId
  ready: boolean
}> = [
  { id: 'yahoo', ready: true },
  { id: 'freedom24', ready: true },
  { id: 'binance', ready: true },
]

export function parseMarketDataProvider(value: string | null): MarketDataProviderId {
  if (value === 'freedom24') return 'freedom24'
  if (value === 'binance') return 'binance'
  if (value === 'yahoo') return 'yahoo'
  return DEFAULT_MARKET_DATA_PROVIDER
}

export function isMarketDataProviderReady(id: MarketDataProviderId): boolean {
  return MARKET_DATA_PROVIDERS.find((p) => p.id === id)?.ready ?? false
}

export interface InvestmentAccount {
  id: number
  user_id: number
  name: string
  provider: InvestmentProvider
  currency: string
  balance: number
  icon: string | null
  is_active: boolean
  last_synced_at: string | null
  sync_status: SyncStatus
  sync_error: string | null
  /** All totals are in `currency` — converted from each instrument's own currency on sync. */
  total_cost_basis: number
  total_market_value: number
  total_return_pct: number | null
  total_unrealized_pnl: number
  cash_balance: number
  positions_value: number
  day_change: number | null
  day_change_pct: number | null
  position_count: number
  created_at: string
  updated_at: string
}

export interface ConnectInvestmentAccountInput {
  name: string
  provider: InvestmentProvider
  currency: string
  public_key: string
  private_key: string
  icon?: string
}

export interface UpdateInvestmentAccountInput {
  name?: string
  description?: string
  icon?: string
}

export interface PortfolioPosition {
  id: number
  account_id: number
  symbol: string
  name: string | null
  quantity: number
  avg_price: number | null
  current_price: number | null
  market_value: number
  currency: string
  synced_at: string
  cost_basis: number | null
  unrealized_pnl: number | null
  unrealized_return_pct: number | null
  /** Same figures in the account's currency, for totals and share-of-portfolio. */
  market_value_base: number | null
  cost_basis_base: number | null
  unrealized_pnl_base: number | null
  fx_rate: number
  day_change: number | null
  day_change_pct: number | null
  exchange: string | null
  weight_pct: number | null
}

export type InvestmentTransactionType =
  | 'buy'
  | 'sell'
  | 'fx'
  | 'dividend'
  | 'fee'
  | 'deposit'
  | 'withdrawal'
  | 'tax'

export interface InvestmentTransaction {
  id: number
  account_id: number
  external_id: string
  type: InvestmentTransactionType
  symbol: string | null
  quantity: number | null
  price: number | null
  /** Signed from the account's side: negative when cash leaves, positive when it arrives. */
  amount: number
  currency: string
  date: string
}

export type EarnPositionKind = 'flexible' | 'locked'

/** A yield-bearing balance outside the regular position list (Binance Simple Earn). */
export interface EarnPosition {
  asset: string
  amount: number
  kind: EarnPositionKind
  apr: number | null
  accrued_yield: number | null
  lock_end_time: string | null
}

export interface PortfolioSnapshot {
  date: string
  total_value: number
  cash_balance: number
  positions_value: number
  currency: string
}

export interface InvestmentSyncResult {
  account_id: number
  sync_status: SyncStatus
  sync_error: string | null
  balance: number
  last_synced_at: string | null
}

export interface SymbolSearchResult {
  symbol: string
  name: string | null
  exchange: string | null
  instrument_type: string | null
  currency: string | null
  isin: string | null
  last_price: number | null
  day_change_pct: number | null
}

export type NewsSentiment = 'positive' | 'negative' | 'neutral'

export interface NewsItem {
  story_id: string
  title: string
  summary: string | null
  url: string | null
  source: string | null
  published_at: string | null
  sentiment: NewsSentiment | null
  image_url: string | null
  symbols: string[]
  /** Article body (HTML). Only the single-story endpoint returns it. */
  body_html: string | null
}

export interface NewsPage {
  items: NewsItem[]
  total: number
  limit: number
  offset: number
}

export function listInvestmentAccounts(): Promise<InvestmentAccount[]> {
  return apiFetch<InvestmentAccount[]>('/investments/accounts')
}

export function connectInvestmentAccount(
  input: ConnectInvestmentAccountInput,
): Promise<InvestmentAccount> {
  return apiFetch<InvestmentAccount>('/investments/accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateInvestmentAccount(
  accountId: number,
  input: UpdateInvestmentAccountInput,
): Promise<InvestmentAccount> {
  return apiFetch<InvestmentAccount>(`/investments/accounts/${accountId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function getInvestmentPositions(accountId: number): Promise<PortfolioPosition[]> {
  return apiFetch<PortfolioPosition[]>(`/investments/accounts/${accountId}/positions`)
}

export function getInvestmentTransactions(accountId: number): Promise<InvestmentTransaction[]> {
  return apiFetch<InvestmentTransaction[]>(`/investments/accounts/${accountId}/transactions`)
}

/**
 * Yield-bearing balances outside the regular position list. Live-fetched, not
 * every provider has these — a provider without one (Freedom24) answers 501,
 * which `useEarnPositions` treats as "no earn positions" rather than an error.
 */
export function getEarnPositions(accountId: number): Promise<EarnPosition[]> {
  return apiFetch<EarnPosition[]>(`/investments/accounts/${accountId}/earn`)
}

export function getInvestmentHistory(
  accountId: number,
  range?: { start_date?: string; end_date?: string },
): Promise<PortfolioSnapshot[]> {
  const params = new URLSearchParams()
  if (range?.start_date) params.set('start_date', range.start_date)
  if (range?.end_date) params.set('end_date', range.end_date)
  const qs = params.toString()
  return apiFetch<PortfolioSnapshot[]>(
    `/investments/accounts/${accountId}/history${qs ? `?${qs}` : ''}`,
  )
}

export function syncInvestmentAccount(accountId: number): Promise<InvestmentSyncResult> {
  return apiFetch<InvestmentSyncResult>(`/investments/accounts/${accountId}/sync`, {
    method: 'POST',
  })
}

export function updateInvestmentCredentials(
  accountId: number,
  input: { public_key: string; private_key: string },
): Promise<InvestmentAccount> {
  return apiFetch<InvestmentAccount>(`/investments/accounts/${accountId}/credentials`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/**
 * Market data (ticker search, news, company research) is a property of the
 * market rather than of one portfolio. Yahoo needs no broker account;
 * Freedom24 still proxies through a connected account when selected.
 */
export function searchSymbols(
  query: string,
  options?: { accountId?: number; provider?: MarketDataProviderId },
): Promise<SymbolSearchResult[]> {
  const params = new URLSearchParams({ q: query })
  if (options?.accountId != null) params.set('account_id', String(options.accountId))
  if (options?.provider) params.set('provider', options.provider)
  return apiFetch<SymbolSearchResult[]>(`/investments/search?${params}`)
}

export function getNews(options?: {
  query?: string
  symbol?: string
  limit?: number
  offset?: number
  language?: string
  accountId?: number
  provider?: MarketDataProviderId
}): Promise<NewsPage> {
  const params = new URLSearchParams()
  if (options?.query) params.set('q', options.query)
  if (options?.symbol) params.set('symbol', options.symbol)
  if (options?.limit != null) params.set('limit', String(options.limit))
  if (options?.offset != null) params.set('offset', String(options.offset))
  if (options?.language) params.set('language', options.language)
  if (options?.accountId != null) params.set('account_id', String(options.accountId))
  if (options?.provider) params.set('provider', options.provider)
  const qs = params.toString()
  return apiFetch<NewsPage>(`/investments/news${qs ? `?${qs}` : ''}`)
}

export function getNewsStory(
  storyId: string,
  options?: { accountId?: number; provider?: MarketDataProviderId },
): Promise<NewsItem> {
  const params = new URLSearchParams()
  if (options?.accountId != null) params.set('account_id', String(options.accountId))
  if (options?.provider) params.set('provider', options.provider)
  const qs = params.toString()
  return apiFetch<NewsItem>(
    `/investments/news/${encodeURIComponent(storyId)}${qs ? `?${qs}` : ''}`,
  )
}

export interface PriceBar {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  sma50: number | null
  sma200: number | null
}

export interface EarningsSurprise {
  quarter: string
  eps_actual: number | null
  eps_estimate: number | null
  surprise_pct: number | null
}

export interface EtfHolding {
  symbol: string
  name: string | null
  weight: number | null
}

export interface SectorWeight {
  sector: string
  weight: number
}

export interface AssetClassMix {
  stock: number | null
  bond: number | null
  cash: number | null
  preferred: number | null
  other: number | null
}

export interface HorizonStats {
  horizon: string
  annualized_return: number | null
  volatility: number | null
  sharpe: number | null
  sortino: number | null
  max_drawdown: number | null
  days_under_water: number | null
  beta: number | null
  alpha: number | null
  up_capture: number | null
  down_capture: number | null
}

export interface RollingPoint {
  date: string
  value: number | null
}

export interface HistogramBin {
  lower: number
  upper: number
  count: number
}

export const HISTORY_PERIODS = ['1m', '3m', '6m', 'ytd', '1y', '5y', 'max'] as const
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number]

export interface CompanyHistory {
  symbol: string
  period: HistoryPeriod
  currency: string | null
  benchmark_symbol: string
  bars: PriceBar[]
  horizons: HorizonStats[]
  rolling_volatility: RollingPoint[]
  rolling_beta: RollingPoint[]
  rolling_sharpe: RollingPoint[]
  return_histogram: HistogramBin[]
  return_observations: number
}

export interface CompanyProfile {
  symbol: string
  name: string | null
  short_name: string | null
  exchange: string | null
  quote_type: string | null
  currency: string | null
  sector: string | null
  industry: string | null
  website: string | null
  summary: string | null
  city: string | null
  state: string | null
  country: string | null
  employees: number | null
  market_cap: number | null
  trailing_pe: number | null
  forward_pe: number | null
  dividend_yield: number | null
  beta: number | null
  fifty_two_week_high: number | null
  fifty_two_week_low: number | null
  previous_close: number | null
  open: number | null
  day_high: number | null
  day_low: number | null
  volume: number | null
  average_volume: number | null
  current_price: number | null
  day_change_pct: number | null
  target_mean_price: number | null
  recommendation: string | null
  first_trade_date: string | null
  // Valuation
  price_to_book: number | null
  ev_to_ebitda: number | null
  ev_to_sales: number | null
  peg_ratio: number | null
  price_to_sales: number | null
  fcf_yield: number | null
  // Profitability
  roe: number | null
  return_on_assets: number | null
  gross_margin: number | null
  operating_margin: number | null
  profit_margin: number | null
  revenue_growth: number | null
  earnings_growth: number | null
  payout_ratio: number | null
  // Balance sheet
  debt_to_equity: number | null
  debt_to_ebitda: number | null
  current_ratio: number | null
  quick_ratio: number | null
  total_cash: number | null
  total_debt: number | null
  book_value: number | null
  // Earnings & estimates
  total_revenue: number | null
  ebitda: number | null
  trailing_eps: number | null
  forward_eps: number | null
  analyst_count: number | null
  earnings_history: EarningsSurprise[]
  // Fund-specific
  expense_ratio: number | null
  aum: number | null
  category: string | null
  yield_: number | null
  fund_family: string | null
  top_holdings: EtfHolding[]
  sector_weightings: SectorWeight[]
  asset_classes: AssetClassMix | null
  // Crypto-specific
  circulating_supply: number | null
  volume_24h: number | null
}

export function getCompanyProfile(
  symbol: string,
  provider: MarketDataProviderId = 'yahoo',
): Promise<CompanyProfile> {
  const params = new URLSearchParams({ provider })
  return apiFetch<CompanyProfile>(
    `/investments/company/${encodeURIComponent(symbol)}?${params}`,
  )
}

export function getCompanyHistory(
  symbol: string,
  period: HistoryPeriod = '1y',
): Promise<CompanyHistory> {
  const params = new URLSearchParams({ provider: 'yahoo', period })
  return apiFetch<CompanyHistory>(
    `/investments/company/${encodeURIComponent(symbol)}/history?${params}`,
  )
}

export interface SavedWatch {
  id: number
  symbol: string
  name: string | null
  last_price: number | null
  day_change_pct: number | null
  last_updated: string | null
  notes: string | null
  created_at: string
}

export function listWatches(): Promise<SavedWatch[]> {
  return apiFetch<SavedWatch[]>('/investments/watchlist')
}

export function saveWatch(input: { symbol: string; name?: string; notes?: string }): Promise<SavedWatch> {
  return apiFetch<SavedWatch>('/investments/watchlist', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteWatch(id: number): Promise<void> {
  return apiFetch<void>(`/investments/watchlist/${id}`, { method: 'DELETE' })
}

export function updateWatch(id: number, input: { name?: string; notes?: string }): Promise<SavedWatch> {
  return apiFetch<SavedWatch>(`/investments/watchlist/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}
