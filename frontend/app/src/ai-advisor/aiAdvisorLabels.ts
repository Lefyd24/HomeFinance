import type { TFunction } from 'i18next'

const TOOL_I18N_KEYS: Record<string, string> = {
  get_transactions_tool: 'aiAdvisor.toolTrail.labels.getTransactions',
  get_totals_tool: 'aiAdvisor.toolTrail.labels.getTotals',
  get_account_balances_tool: 'aiAdvisor.toolTrail.labels.getAccountBalances',
  get_budgets_status_tool: 'aiAdvisor.toolTrail.labels.getBudgetsStatus',
  get_recurring_expenses_tool: 'aiAdvisor.toolTrail.labels.getRecurringExpenses',
  get_debts_tool: 'aiAdvisor.toolTrail.labels.getDebts',
  send_analysis_email_tool: 'aiAdvisor.toolTrail.labels.sendAnalysisEmail',
  get_investor_profile_tool: 'aiAdvisor.toolTrail.labels.getInvestorProfile',
  update_investor_profile_tool: 'aiAdvisor.toolTrail.labels.updateInvestorProfile',
  // Portfolio
  get_portfolio_overview_tool: 'aiAdvisor.toolTrail.labels.getPortfolioOverview',
  get_positions_tool: 'aiAdvisor.toolTrail.labels.getPositions',
  get_portfolio_allocation_tool: 'aiAdvisor.toolTrail.labels.getPortfolioAllocation',
  get_portfolio_risk_tool: 'aiAdvisor.toolTrail.labels.getPortfolioRisk',
  get_investment_transactions_tool: 'aiAdvisor.toolTrail.labels.getInvestmentTransactions',
  get_position_history_tool: 'aiAdvisor.toolTrail.labels.getPositionHistory',
  get_watchlist_tool: 'aiAdvisor.toolTrail.labels.getWatchlist',
  // Research
  search_symbols_tool: 'aiAdvisor.toolTrail.labels.searchSymbols',
  get_company_research_tool: 'aiAdvisor.toolTrail.labels.getCompanyResearch',
  compare_symbols_tool: 'aiAdvisor.toolTrail.labels.compareSymbols',
  get_technical_tool: 'aiAdvisor.toolTrail.labels.getTechnical',
  simulate_symbol_tool: 'aiAdvisor.toolTrail.labels.simulateSymbol',
  // Planning
  get_net_worth_tool: 'aiAdvisor.toolTrail.labels.getNetWorth',
  get_emergency_fund_status_tool: 'aiAdvisor.toolTrail.labels.getEmergencyFund',
  get_goals_tool: 'aiAdvisor.toolTrail.labels.getGoals',
  get_investable_surplus_tool: 'aiAdvisor.toolTrail.labels.getInvestableSurplus',
  get_recurring_commitments_tool: 'aiAdvisor.toolTrail.labels.getRecurringCommitments',
  project_investment_tool: 'aiAdvisor.toolTrail.labels.projectInvestment',
  compare_invest_vs_debt_payoff_tool: 'aiAdvisor.toolTrail.labels.compareInvestVsPayoff',
}

/**
 * The argument worth showing beside each tool's label, in preference order.
 *
 * "Researching AAPL" is a receipt; "Using get_company_research_tool" is noise.
 * Only ever a symbol or a plain list of them — never a date range or a limit,
 * which add length without telling the reader anything they wanted to know.
 */
const SUBJECT_ARG_KEYS = ['symbol', 'symbols', 'query'] as const

const SUGGESTION_GROUP_KEYS = ['findLeak', 'checkPlan', 'getOutOfDebt'] as const
const INVESTMENT_SUGGESTION_GROUP_KEYS = ['portfolioHealth', 'investDecision'] as const

export function toolLabel(name: string, t: TFunction<'advisor'>): string {
  const key = TOOL_I18N_KEYS[name]
  if (key) return t(key)
  const fallbackName = name.replace(/_tool$/, '').replace(/_/g, ' ')
  return t('aiAdvisor.toolTrail.usingFallback', { name: fallbackName })
}

/** The subject of a tool call — a ticker or search term — or null if it has none. */
export function toolSubject(args?: Record<string, unknown>): string | null {
  if (!args) return null
  for (const key of SUBJECT_ARG_KEYS) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === 'string' && !!item.trim())
      if (items.length) return items.join(', ')
    }
  }
  return null
}

/** Human-readable name for an investor-profile field the advisor changed. */
export function profileFieldLabel(field: string, t: TFunction<'advisor'>): string {
  const key = `aiAdvisor.profileUpdate.fields.${field}`
  const label = t(key)
  // i18next returns the key itself when there's no translation for it.
  return label === key ? field.replace(/_/g, ' ') : label
}

/** Render a profile value for display — objects and lists included. */
export function profileValueText(value: unknown, t: TFunction<'advisor'>): string {
  if (value === null || value === undefined || value === '') return t('aiAdvisor.profileUpdate.notSet')
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : t('aiAdvisor.profileUpdate.notSet')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key} ${entry}%`)
      .join(', ')
  }
  return String(value)
}

export function getSuggestionGroups(t: TFunction<'advisor'>, includeInvestments = false) {
  const keys = includeInvestments
    ? [...SUGGESTION_GROUP_KEYS, ...INVESTMENT_SUGGESTION_GROUP_KEYS]
    : SUGGESTION_GROUP_KEYS
  return keys.map((groupKey) => ({
    key: groupKey,
    title: t(`aiAdvisor.chat.suggestionGroups.${groupKey}.title`),
    prompts: t(`aiAdvisor.chat.suggestionGroups.${groupKey}.prompts`, {
      returnObjects: true,
    }) as string[],
  }))
}
