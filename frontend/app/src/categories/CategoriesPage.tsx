import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCategories } from './useCategories'
import { CategoryFormDialog } from './CategoryFormDialog'
import type { CategoryType } from './categoriesApi'

const SECTION_ORDER: { type: CategoryType; label: string }[] = [
  { type: 'expense', label: 'Expense categories' },
  { type: 'income', label: 'Income categories' },
  { type: 'transfer', label: 'Transfer categories' },
]

export function CategoriesPage() {
  const { data: categories } = useCategories()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Categories</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={16} /> Add category
        </Button>
      </div>

      {SECTION_ORDER.map(({ type, label }) => {
        const items = categories?.filter((c) => c.type === type) ?? []
        if (items.length === 0) return null
        return (
          <section key={type} className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">{label}</h2>
            <ul className="flex flex-col gap-2">
              {items.map((category) => (
                <li key={category.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
                  <span className="text-foreground">{category.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <CategoryFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
