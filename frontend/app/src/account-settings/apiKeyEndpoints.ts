/**
 * Curated reference of endpoints an API key can call. Paths are relative to the
 * API base (`/api`). Every entry here is served by a router that accepts the
 * `X-API-Key` header; read-only keys are limited to GET.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface ApiEndpoint {
  method: HttpMethod
  path: string
  description: string
}

export interface ApiEndpointGroup {
  title: string
  endpoints: ApiEndpoint[]
}

export const API_ENDPOINT_GROUPS: ApiEndpointGroup[] = [
  {
    title: 'Accounts',
    endpoints: [
      { method: 'GET', path: '/accounts/', description: 'List your accounts with balances.' },
      { method: 'GET', path: '/accounts/{id}/balance', description: 'Current balance of one account.' },
      { method: 'POST', path: '/accounts/', description: 'Create an account.' },
    ],
  },
  {
    title: 'Transactions',
    endpoints: [
      { method: 'GET', path: '/transactions/', description: 'List transactions (paginated, filterable).' },
      { method: 'GET', path: '/transactions/income-vs-spending', description: 'Income versus spending summary.' },
      { method: 'POST', path: '/transactions/', description: 'Record a new transaction.' },
      { method: 'PUT', path: '/transactions/{id}', description: 'Edit a transaction.' },
      { method: 'DELETE', path: '/transactions/{id}', description: 'Delete a transaction.' },
    ],
  },
  {
    title: 'Budgets',
    endpoints: [
      { method: 'GET', path: '/budgets/', description: 'List budgets.' },
      { method: 'GET', path: '/budgets/{id}/progress', description: 'How much of a budget is spent.' },
    ],
  },
  {
    title: 'Debts',
    endpoints: [
      { method: 'GET', path: '/debts/', description: 'List debts.' },
      { method: 'GET', path: '/debts/summary', description: 'Total owed, minimum payments and more.' },
      { method: 'GET', path: '/debts/upcoming-payments', description: 'Payments coming due.' },
    ],
  },
  {
    title: 'Goals',
    endpoints: [
      { method: 'GET', path: '/goals/', description: 'List savings goals.' },
      { method: 'GET', path: '/goals/summary', description: 'Progress across all goals.' },
    ],
  },
  {
    title: 'Categories & recurring',
    endpoints: [
      { method: 'GET', path: '/categories/', description: 'List categories.' },
      { method: 'GET', path: '/recurring-expenses/', description: 'List recurring expenses.' },
      { method: 'GET', path: '/recurring-expenses/upcoming', description: 'Recurring expenses due soon.' },
    ],
  },
  {
    title: 'Reports',
    endpoints: [
      { method: 'GET', path: '/reports/spending', description: 'Spending report.' },
      { method: 'GET', path: '/reports/cashflow', description: 'Cash flow report.' },
      { method: 'GET', path: '/reports/net-worth', description: 'Net worth over time.' },
      { method: 'GET', path: '/reports/savings-rate', description: 'Savings rate.' },
    ],
  },
  {
    title: 'Investments',
    endpoints: [
      { method: 'GET', path: '/investments/accounts', description: 'List investment accounts.' },
      {
        method: 'GET',
        path: '/investments/accounts/{id}/positions',
        description: 'Holdings of an investment account.',
      },
    ],
  },
]

/** A copy-pasteable curl command for an endpoint. `origin` is e.g. https://finance.example.com. */
export function curlExample(endpoint: ApiEndpoint, origin: string, key = 'YOUR_API_KEY'): string {
  const url = `${origin}/api${endpoint.path}`
  const lines = [`curl${endpoint.method === 'GET' ? '' : ` -X ${endpoint.method}`} "${url}"`, `  -H "X-API-Key: ${key}"`]
  if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
    lines.push(`  -H "Content-Type: application/json"`, `  -d '{ ... }'`)
  }
  return lines.join(' \\\n')
}
