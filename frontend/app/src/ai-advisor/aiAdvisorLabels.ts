import type { TFunction } from 'i18next'

const TOOL_I18N_KEYS: Record<string, string> = {
  get_transactions_tool: 'aiAdvisor.toolTrail.labels.getTransactions',
  get_totals_tool: 'aiAdvisor.toolTrail.labels.getTotals',
  get_account_balances_tool: 'aiAdvisor.toolTrail.labels.getAccountBalances',
  get_budgets_status_tool: 'aiAdvisor.toolTrail.labels.getBudgetsStatus',
  get_recurring_expenses_tool: 'aiAdvisor.toolTrail.labels.getRecurringExpenses',
  get_debts_tool: 'aiAdvisor.toolTrail.labels.getDebts',
  send_analysis_email_tool: 'aiAdvisor.toolTrail.labels.sendAnalysisEmail',
}

const SUGGESTION_GROUP_KEYS = ['findLeak', 'checkPlan', 'getOutOfDebt'] as const

export function toolLabel(name: string, t: TFunction<'advisor'>): string {
  const key = TOOL_I18N_KEYS[name]
  if (key) return t(key)
  const fallbackName = name.replace(/_tool$/, '').replace(/_/g, ' ')
  return t('aiAdvisor.toolTrail.usingFallback', { name: fallbackName })
}

export function getSuggestionGroups(t: TFunction<'advisor'>) {
  return SUGGESTION_GROUP_KEYS.map((groupKey) => ({
    key: groupKey,
    title: t(`aiAdvisor.chat.suggestionGroups.${groupKey}.title`),
    prompts: t(`aiAdvisor.chat.suggestionGroups.${groupKey}.prompts`, {
      returnObjects: true,
    }) as string[],
  }))
}
