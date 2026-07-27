import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTransactions, useDeleteTransaction } from './useTransactions'
import { TransactionFormDialog } from './TransactionFormDialog'

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' })

export function TransactionsPage() {
  const { data, isLoading } = useTransactions({ page: 1, per_page: 50 })
  const deleteTransaction = useDeleteTransaction()
  const [dialogOpen, setDialogOpen] = useState(false)

  const items = data?.items ?? []

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Transactions</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={16} /> Add transaction
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading transactions…</p>}

      <ul className="flex flex-col gap-2">
        {items.map((tx) => (
          <li
            key={tx.id}
            className="flex items-center gap-3 p-4 rounded-xl bg-muted"
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{tx.description}</p>
              <p className="text-xs text-muted-foreground truncate">{tx.account_name}</p>
            </div>
            <p
              className={`font-semibold shrink-0 ${
                tx.type === 'income' ? 'text-green-600' : 'text-foreground'
              }`}
            >
              {tx.type === 'expense' ? '−' : tx.type === 'income' ? '+' : ''}
              {currencyFormatter.format(tx.amount)}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Delete ${tx.description}`}
              onClick={() => deleteTransaction.mutate(tx.id)}
            >
              <Trash2 size={16} />
            </Button>
          </li>
        ))}
      </ul>

      <TransactionFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
