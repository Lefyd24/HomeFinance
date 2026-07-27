import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/react-table'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Cancel01Icon,
  Search01Icon,
  FilterHorizontalIcon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { DataTable } from '@/components/data-table/data-table'
import { DataTablePagination } from '@/components/data-table/data-table-pagination'
import { DataTableViewOptions } from '@/components/data-table/data-table-view-options'
import { PageHeader } from '../ui/PageHeader'
import { Select } from '../ui/Select'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import { useTransactions, useDeleteTransaction } from './useTransactions'
import { createColumns } from './columns'
import { TransactionFormDialog } from './TransactionFormDialog'
import { TransactionDetailDialog } from './TransactionDetailDialog'
import { currentMonthRange } from '../lib/format'
import { cn } from '@/lib/utils'
import type { Transaction, TransactionFilters, TransactionType } from './transactionsApi'

function FilterField({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5',
        className,
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  const accountFromUrl = searchParams.get('account_id')

  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    ...currentMonthRange(),
    page: 1,
    per_page: 20,
    search: '',
    account_id: accountFromUrl ? Number(accountFromUrl) : undefined,
    category_id: undefined,
    type: undefined,
  }))

  useEffect(() => {
    if (!accountFromUrl) return
    const id = Number(accountFromUrl)
    if (Number.isNaN(id)) return
    setFilters((prev) => ({ ...prev, account_id: id, page: 1 }))
  }, [accountFromUrl])

  const [searchInput, setSearchInput] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)

  const { data: transactionData, isLoading } = useTransactions(filters)
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const deleteTransaction = useDeleteTransaction()

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput, page: 1 }))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const handleView = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setDetailDialogOpen(true)
  }

  const handleEdit = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setEditDialogOpen(true)
  }

  const handleDelete = async (transaction: Transaction) => {
    if (!confirm(`Delete transaction "${transaction.description}"?`)) return
    try {
      await deleteTransaction.mutateAsync(transaction.id)
      toast.success('Transaction deleted')
    } catch {
      toast.error('Failed to delete transaction')
    }
  }

  const columns = useMemo(
    () =>
      createColumns({
        onView: handleView,
        onEdit: handleEdit,
        onDelete: handleDelete,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const pageCount = transactionData
    ? Math.max(1, Math.ceil(transactionData.total / filters.per_page!))
    : 1

  const table = useReactTable({
    data: transactionData?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount,
    state: {
      sorting,
      pagination: {
        pageIndex: (filters.page ?? 1) - 1,
        pageSize: filters.per_page ?? 20,
      },
    },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function'
          ? updater({ pageIndex: (filters.page ?? 1) - 1, pageSize: filters.per_page ?? 20 })
          : updater
      setFilters((prev) => ({
        ...prev,
        page: newPagination.pageIndex + 1,
        per_page: newPagination.pageSize,
      }))
    },
  })

  const accountOptions = [
    { value: '', label: 'All Accounts' },
    ...accounts.map((acc) => ({ value: String(acc.id), label: acc.name })),
  ]

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...categories.map((cat) => ({ value: String(cat.id), label: cat.name })),
  ]

  const typeOptions = [
    { value: '', label: 'All Types' },
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
    { value: 'transfer', label: 'Transfer' },
  ]

  const handleClearFilters = () => {
    const defaultRange = currentMonthRange()
    setFilters({
      ...defaultRange,
      page: 1,
      per_page: 20,
      search: '',
      account_id: undefined,
      category_id: undefined,
      type: undefined,
    })
    setSearchInput('')
  }

  const hasActiveFilters = Boolean(
    filters.account_id || filters.category_id || filters.type || searchInput,
  )

  const filterControlClass =
    'h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent'

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Transactions"
        description="Track your income, expenses, and transfers"
        action={
          <Button onClick={() => setAddDialogOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Add Transaction
          </Button>
        }
      />

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2 lg:flex-nowrap">
          <FilterField label="Search" className="min-w-[10rem] flex-1">
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={2}
                className="pointer-events-none absolute start-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="search"
                placeholder="Description…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={cn(filterControlClass, 'ps-5')}
              />
            </div>
          </FilterField>

          <FilterField label="From" className="w-[9.5rem] shrink-0">
            <Input
              id="start_date"
              type="date"
              value={filters.start_date || ''}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, start_date: e.target.value, page: 1 }))
              }
              className={filterControlClass}
            />
          </FilterField>

          <FilterField label="To" className="w-[9.5rem] shrink-0">
            <Input
              id="end_date"
              type="date"
              value={filters.end_date || ''}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, end_date: e.target.value, page: 1 }))
              }
              className={filterControlClass}
            />
          </FilterField>

          <FilterField label="Account" className="min-w-[8.5rem] flex-1">
            <Select
              value={filters.account_id ? String(filters.account_id) : ''}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  account_id: value ? Number(value) : undefined,
                  page: 1,
                }))
              }
              options={accountOptions}
              placeholder="All Accounts"
              triggerClassName="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </FilterField>

          <FilterField label="Category" className="min-w-[8.5rem] flex-1">
            <Select
              value={filters.category_id ? String(filters.category_id) : ''}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  category_id: value ? Number(value) : undefined,
                  page: 1,
                }))
              }
              options={categoryOptions}
              placeholder="All Categories"
              triggerClassName="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </FilterField>

          <FilterField label="Type" className="min-w-[7.5rem] flex-1">
            <Select
              value={filters.type || ''}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  type: (value as TransactionType) || undefined,
                  page: 1,
                }))
              }
              options={typeOptions}
              placeholder="All Types"
              triggerClassName="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </FilterField>

          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              className="h-[3.25rem] shrink-0"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} data-icon="inline-start" />
              Clear
            </Button>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {isLoading ? (
            <Skeleton className="h-5 w-32" />
          ) : (
            `${transactionData?.total ?? 0} transaction${transactionData?.total === 1 ? '' : 's'}`
          )}
        </div>
        <DataTableViewOptions table={table} />
      </div>

      {isLoading ? (
        <Card className="p-6">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      ) : transactionData && transactionData.total === 0 && !hasActiveFilters ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No transactions yet</EmptyTitle>
            <EmptyDescription>
              Start tracking your finances by adding your first transaction
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setAddDialogOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Add Transaction
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <DataTable
            table={table}
            columns={columns}
            onRowClick={handleView}
            getRowClassName={(row) => {
              const type = row.original.type
              if (type === 'income') return 'border-s-2 border-s-success'
              if (type === 'expense') return 'border-s-2 border-s-destructive'
              if (type === 'transfer') return 'border-s-2 border-s-primary'
              return undefined
            }}
            emptyMessage={
              hasActiveFilters
                ? 'No transactions found matching your filters'
                : 'No transactions yet'
            }
          />
          <DataTablePagination table={table} total={transactionData?.total} serverSide />
        </>
      )}

      <TransactionFormDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        transaction={null}
      />
      <TransactionFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        transaction={selectedTransaction}
      />
      <TransactionDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        transaction={selectedTransaction}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  )
}
