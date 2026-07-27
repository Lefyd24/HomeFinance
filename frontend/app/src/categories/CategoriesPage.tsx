import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  MoreVerticalIcon,
  PencilEdit02Icon,
  Delete02Icon,
  Add01Icon,
  MoneyReceive01Icon,
  ShoppingCartIcon,
  ArrowUpDownIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageContainer } from '@/ui/PageContainer'
import { PageHeader } from '@/ui/PageHeader'
import { StatStrip, StatCard } from '@/ui/StatStrip'
import { useCategories, useDeleteCategory } from './useCategories'
import { CategoryFormDialog } from './CategoryFormDialog'
import { CategoryIcon } from './categoryIcons'
import { cn } from '@/lib/utils'
import type { Category, CategoryType } from './categoriesApi'

const TYPE_META: Record<
  CategoryType,
  { label: string; description: string; icon: typeof MoneyReceive01Icon; accent: string }
> = {
  income: {
    label: 'Income',
    description: 'Money coming in',
    icon: MoneyReceive01Icon,
    accent: 'border-success/40 bg-success/10',
  },
  expense: {
    label: 'Expense',
    description: 'Everyday spending',
    icon: ShoppingCartIcon,
    accent: 'border-destructive/40 bg-destructive/10',
  },
  transfer: {
    label: 'Transfer',
    description: 'Between accounts',
    icon: ArrowUpDownIcon,
    accent: 'border-primary/40 bg-primary/10',
  },
}

export function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategories()
  const deleteMutation = useDeleteCategory()

  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | CategoryType>('all')

  const incomeCategories = categories.filter((cat) => cat.type === 'income')
  const expenseCategories = categories.filter((cat) => cat.type === 'expense')
  const transferCategories = categories.filter((cat) => cat.type === 'transfer')
  const customCategories = categories.filter((cat) => !cat.is_system)

  const visibleCategories = useMemo(() => {
    if (activeTab === 'all') return categories
    return categories.filter((cat) => cat.type === activeTab)
  }, [activeTab, categories])

  const handleAdd = () => {
    setEditingCategory(null)
    setFormOpen(true)
  }

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    setFormOpen(true)
  }

  const handleDelete = async (category: Category) => {
    if (category.is_system) {
      toast.error('System categories cannot be deleted')
      return
    }

    const confirmed = window.confirm(
      `Delete "${category.name}"?\n\nAny transactions using this category will need to be reassigned.`,
    )

    if (!confirmed) return

    try {
      await deleteMutation.mutateAsync(category.id)
      toast.success('Category deleted')
    } catch {
      toast.error('Failed to delete category')
    }
  }

  return (
    <PageContainer wide>
      <PageHeader
        title="Categories"
        description="Organize your transactions with colorful, icon-backed labels"
        action={
          <Button onClick={handleAdd} size="sm">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Add
          </Button>
        }
      />

      {isLoading ? (
        <>
          <StatStrip className="mb-6">
            <StatCard label="Total" value={<Skeleton className="h-8 w-16" />} />
            <StatCard label="Income" value={<Skeleton className="h-8 w-16" />} />
            <StatCard label="Expense" value={<Skeleton className="h-8 w-16" />} />
            <StatCard label="Custom" value={<Skeleton className="h-8 w-16" />} />
          </StatStrip>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        </>
      ) : (
        <>
          <StatStrip className="mb-6">
            <StatCard label="Total" value={categories.length} />
            <StatCard label="Income" value={incomeCategories.length} tone="success" />
            <StatCard label="Expense" value={expenseCategories.length} tone="destructive" />
            <StatCard label="Custom" value={customCategories.length} />
          </StatStrip>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as 'all' | CategoryType)}
            className="flex flex-col gap-4"
          >
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="all">All ({categories.length})</TabsTrigger>
              <TabsTrigger value="income">Income ({incomeCategories.length})</TabsTrigger>
              <TabsTrigger value="expense">Expense ({expenseCategories.length})</TabsTrigger>
              <TabsTrigger value="transfer">Transfer ({transferCategories.length})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              {visibleCategories.length === 0 ? (
                <Empty className="border border-dashed py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HugeiconsIcon icon={TYPE_META.expense.icon} strokeWidth={2} />
                    </EmptyMedia>
                    <EmptyTitle>No categories here</EmptyTitle>
                    <EmptyDescription>Create a category to start organizing transactions.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {visibleCategories.map((category) => (
                    <CategoryTile
                      key={category.id}
                      category={category}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {activeTab === 'all' && (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              {(Object.keys(TYPE_META) as CategoryType[]).map((type) => {
                const meta = TYPE_META[type]
                const count =
                  type === 'income'
                    ? incomeCategories.length
                    : type === 'expense'
                      ? expenseCategories.length
                      : transferCategories.length
                return (
                  <Card key={type} className={cn('border', meta.accent)}>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <HugeiconsIcon icon={meta.icon} strokeWidth={2} />
                        <CardTitle>{meta.label}</CardTitle>
                      </div>
                      <CardDescription>{meta.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-heading font-bold tabular-nums">{count}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editingCategory} />
    </PageContainer>
  )
}

interface CategoryTileProps {
  category: Category
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
}

function CategoryTile({ category, onEdit, onDelete }: CategoryTileProps) {
  return (
    <Card
      size="sm"
      className="group relative overflow-hidden transition-colors hover:bg-muted/40"
      style={{ borderColor: `${category.color}55` }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: category.color }}
        aria-hidden
      />
      <CardContent className="flex flex-col items-center gap-3 pt-4 text-center">
        <CategoryIcon icon={category.icon} color={category.color} className="size-12" size={24} />
        <div className="min-w-0 w-full">
          <p className="font-medium text-sm truncate" title={category.name}>
            {category.name}
          </p>
          <div className="mt-1.5 flex items-center justify-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] capitalize">
              {category.type}
            </Badge>
            {category.is_system && (
              <Badge variant="secondary" className="text-[10px]">
                System
              </Badge>
            )}
          </div>
        </div>
        {!category.is_system && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute end-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Actions"
              >
                <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onEdit(category)}>
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(category)}>
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {category.is_system && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onEdit(category)}
          >
            View
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
