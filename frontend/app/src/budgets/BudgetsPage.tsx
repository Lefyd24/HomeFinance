import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBudgets } from './useBudgets'
import { BudgetFormDialog } from './BudgetFormDialog'

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' })

export function BudgetsPage() {
  const { data: budgets, isLoading } = useBudgets()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Budgets</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={16} /> Add budget
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading budgets…</p>}

      <ul className="flex flex-col gap-3">
        {budgets?.map((budget) => (
          <li key={budget.id} className="p-4 rounded-xl bg-muted">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-foreground">{budget.name}</p>
              <p className="text-sm text-muted-foreground">
                {currencyFormatter.format(budget.spent)} of {currencyFormatter.format(budget.amount)}
              </p>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden border border-border">
              <div
                className={cn(
                  'h-full rounded-full',
                  budget.percentage >= 100 ? 'bg-destructive' : 'bg-primary',
                )}
                style={{ width: `${Math.min(budget.percentage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{budget.percentage}% used</p>
          </li>
        ))}
      </ul>

      <BudgetFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
