import { useMemo, useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/react-table'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, FileImportIcon, Invoice01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { Amount, flowOfType, flowRail } from '../ui/money'
import { useConfirm } from '../ui/useConfirm'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import { useTransactions, useDeleteTransaction } from './useTransactions'
import { createColumns } from './columns'
import { TransactionFilterBar, type DatePreset } from './TransactionFilterBar'
import { TransactionFormDialog } from './TransactionFormDialog'
import { TransactionDetailDialog } from './TransactionDetailDialog'
import { currentMonthRange } from '../lib/format'
import type { Transaction, TransactionFilters } from './transactionsApi'

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`

function buildDatePresets(now = new Date()): DatePreset[] {
  const y = now.getFullYear()
  const m = now.getMonth()
  const lastMonthEnd = new Date(y, m, 0)
  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(now.getDate() - 89)

  return [
    { label: 'This month', range: currentMonthRange(now) },
    {
      label: 'Last month',
      range: { start_date: iso(new Date(y, m - 1, 1)), end_date: iso(lastMonthEnd) },
    },
    { label: 'Last 90 days', range: { start_date: iso(ninetyDaysAgo), end_date: iso(now) } },
    { label: 'This year', range: { start_date: iso(new Date(y, 0, 1)), end_date: iso(now) } },
  ]
}

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  const accountFromUrl = searchParams.get('account_id')
  const datePresets = useMemo(() => buildDatePresets(), [])

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
  const { confirm, confirmDialog } = useConfirm()

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
    const ok = await confirm({
      title: 'Delete this transaction?',
      description: `“${transaction.description}” will be removed from your ledger. Balances recalculate immediately and this cannot be undone.`,
      confirmLabel: 'Delete transaction',
    })
    if (!ok) return
    try {
      await deleteTransaction.mutateAsync(transaction.id)
      toast.success('Transaction deleted')
    } catch {
      toast.error('Could not delete the transaction. Try again.')
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

  const accountOptions = accounts.map((acc) => ({ value: String(acc.id), label: acc.name }))
  const categoryOptions = categories.map((cat) => ({
    value: String(cat.id),
    label: cat.name,
    color: cat.color,
  }))

  const handleClearFilters = () => {
    setFilters({
      ...currentMonthRange(),
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

  // Totals for the rows actually on screen. Labelled as such — the server
  // paginates, so this is deliberately not presented as a period total.
  const pageTotals = useMemo(() => {
    const items = transactionData?.items ?? []
    return items.reduce(
      (acc, t) => {
        if (t.type === 'income') acc.in += t.amount
        else if (t.type === 'expense') acc.out += t.amount
        return acc
      },
      { in: 0, out: 0 },
    )
  }, [transactionData])

  return (
    <PageContainer wide className="flex flex-col gap-4">
      <PageHeader
        title="Transactions"
        description="Every euro in, out, and moved between your accounts."
        className="mb-2"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/import">
                <HugeiconsIcon icon={FileImportIcon} strokeWidth={2} data-icon="inline-start" />
                Import
              </Link>
            </Button>
            <Button onClick={() => setAddDialogOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Add transaction
            </Button>
          </div>
        }
      />

      <TransactionFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        accounts={accountOptions}
        categories={categoryOptions}
        datePresets={datePresets}
        onClearAll={handleClearFilters}
        resultCount={transactionData?.total}
        isLoading={isLoading}
      />

      <div className="flex items-center justify-between gap-3">
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
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : transactionData && transactionData.total === 0 && !hasActiveFilters ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Invoice01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>Nothing recorded yet</EmptyTitle>
            <EmptyDescription>
              Add a transaction by hand, or bring in a bank export from the Import page.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => setAddDialogOpen(true)}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                Add transaction
              </Button>
              <Button variant="outline" asChild>
                <Link to="/import">
                  <HugeiconsIcon icon={FileImportIcon} strokeWidth={2} data-icon="inline-start" />
                  Import a bank export
                </Link>
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <DataTable
            table={table}
            columns={columns}
            onRowClick={handleView}
            striped={false}
            stickyHeader
            getRowClassName={(row) => flowRail[flowOfType(row.original.type)]}
            emptyMessage={
              hasActiveFilters
                ? 'No transactions match these filters. Try widening the period or clearing a chip above.'
                : 'No transactions yet'
            }
            footer={
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 text-xs">
                <span className="text-muted-foreground">On this page</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">In</span>
                  <Amount value={pageTotals.in} flow="in" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Out</span>
                  <Amount value={pageTotals.out} flow="out" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Net</span>
                  <Amount
                    value={Math.abs(pageTotals.in - pageTotals.out)}
                    flow={pageTotals.in - pageTotals.out >= 0 ? 'in' : 'out'}
                    className="font-semibold"
                  />
                </span>
              </div>
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
      {confirmDialog}
    </PageContainer>
  )
}
