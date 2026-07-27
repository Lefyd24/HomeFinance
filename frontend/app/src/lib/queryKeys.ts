export const queryKeys = {
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  transactions: (filters?: Record<string, unknown>) => ['transactions', filters] as const,
  budgets: ['budgets'] as const,
  spendingReport: (params?: Record<string, unknown>) => ['spendingReport', params] as const,
}
