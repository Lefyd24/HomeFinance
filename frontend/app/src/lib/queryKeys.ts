export const queryKeys = {
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  transactions: (filters?: object) => ['transactions', filters] as const,
  budgets: ['budgets'] as const,
  goals: ['goals'] as const,
  debts: ['debts'] as const,
  upcomingDebtPayments: ['upcomingDebtPayments'] as const,
  upcomingRecurringPayments: ['upcomingRecurringPayments'] as const,
  spendingReport: (params?: object) => ['spendingReport', params] as const,
  cashflowReport: (params?: object) => ['cashflowReport', params] as const,
  netWorthReport: (params?: object) => ['netWorthReport', params] as const,
  bankConnections: ['bankConnections'] as const,
  bankInstitutions: (country: string) => ['bankInstitutions', country] as const,
  investmentAccounts: ['investmentAccounts'] as const,
  investmentPositions: (accountId: number) => ['investmentPositions', accountId] as const,
  investmentTransactions: (accountId: number) => ['investmentTransactions', accountId] as const,
  investmentHistory: (accountId: number, range?: object) =>
    ['investmentHistory', accountId, range] as const,
  // Market data is not account-scoped — see investmentsApi.searchSymbols.
  investmentSymbolSearch: (query: string, provider?: string) =>
    ['investmentSymbolSearch', provider ?? 'yahoo', query] as const,
  investmentNews: (options?: object) => ['investmentNews', options ?? {}] as const,
  investmentNewsStory: (storyId: string, provider?: string) =>
    ['investmentNewsStory', provider ?? 'yahoo', storyId] as const,
  investmentCompany: (symbol: string) => ['investmentCompany', symbol] as const,
}
