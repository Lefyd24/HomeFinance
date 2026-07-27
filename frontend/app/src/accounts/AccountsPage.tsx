import { useState } from 'react'
import { Plus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAccounts } from './useAccounts'
import { AccountFormDialog } from './AccountFormDialog'

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' })

export function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Accounts</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={16} /> Add account
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading accounts…</p>}

      <ul className="flex flex-col gap-2">
        {accounts?.map((account) => (
          <li key={account.id} className="flex items-center gap-3 p-4 rounded-xl bg-muted">
            <Wallet size={20} className="text-primary" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{account.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{account.type}</p>
            </div>
            <p className="font-semibold text-foreground">{currencyFormatter.format(account.balance)}</p>
          </li>
        ))}
      </ul>

      <AccountFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
