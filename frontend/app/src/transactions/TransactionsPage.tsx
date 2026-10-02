import { useMemo, useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { DataTablePagination } from '@/components/data-table/data-table-pagination'
import { DataTableViewOptions } from '@/components/data-table/data-table-view-options'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader, PageHeaderActionLabel } from '../ui/PageHeader'
import { Amount, flowOfType, flowRail } from '../ui/money'
import { useConfirm } from '../ui/useConfirm'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import { useTransactions, useDeleteTransaction } from './useTransactions'
import { createColumns } from './columns'
import { TransactionFilterBar, type DatePreset } from './TransactionFilterBar'
import { TransactionFormDialog } from './TransactionFormDialog'
import { TransactionDetailDialog } from './TransactionDetailDialog'
import { MarkTransferDialog } from './MarkTransferDialog'
import { currentMonthRange, toLocalIsoDate as iso } from '../lib/format'
import { isLinkedPayment, type Transaction, type TransactionFilters } from './transactionsApi'
import { Alert01Icon } from '@hugeicons/core-free-icons'

function buildDatePresets(
  t: (key: string) => string,
  now = new Date(),
): DatePreset[] {
  const y = now.getFullYear()
  const m = now.getMonth()
  const lastMonthEnd = new Date(y, m, 0)
  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(now.getDate() - 89)

  return [
    { label: t('datePresets.thisMonth'), range: currentMonthRange(now) },
    {
      label: t('datePresets.lastMonth'),
      range: { start_date: iso(new Date(y, m - 1, 1)), end_date: iso(lastMonthEnd) },
    },
    {
      label: t('datePresets.last90Days'),
      range: { start_date: iso(ninetyDaysAgo), end_date: iso(now) },
    },
    { label: t('datePresets.thisYear'), range: { start_date: iso(new Date(y, 0, 1)), end_date: iso(now) } },
  ]
}

export function TransactionsPage() {
  const { t } = useTranslation('transactions')
  const [searchParams] = useSearchParams()
  const accountFromUrl = searchParams.get('account_id')
  const datePresets = useMemo(() => buildDatePresets(t), [t])

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
  const [markTransferDialogOpen, setMarkTransferDialogOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [linkedDeleteTarget, setLinkedDeleteTarget] = useState<Transaction | null>(null)

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

  const handleMarkTransfer = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setMarkTransferDialogOpen(true)
  }

  async function performDelete(transaction: Transaction, affectLinked: boolean) {
    try {
      await deleteTransaction.mutateAsync({ id: transaction.id, affectLinked })
      toast.success(t('page.toast.deleted'))
    } catch {
      toast.error(t('page.toast.deleteError'))
    }
  }

  const handleDelete = async (transaction: Transaction) => {
    const ok = await confirm({
      title: t('page.deleteConfirm.title'),
      description: t('page.deleteConfirm.description', { description: transaction.description }),
      confirmLabel: t('page.deleteConfirm.confirmLabel'),
    })
    if (!ok) return

    if (isLinkedPayment(transaction)) {
      setLinkedDeleteTarget(transaction)
      return
    }

    await performDelete(transaction, false)
  }

  async function confirmLinkedDelete(affectLinked: boolean) {
    if (!linkedDeleteTarget) return
    const target = linkedDeleteTarget
    setLinkedDeleteTarget(null)
    await performDelete(target, affectLinked)
  }

  function linkedDeleteDescription(tx: Transaction): string {
    const hasDebt = Boolean(tx.debt_payment_id)
    const hasRecurring = Boolean(tx.recurring_payment_id)
    if (hasDebt && hasRecurring) {
      return t('page.deleteLinkedConfirm.descriptionBoth', {
        debt: tx.debt_name || `#${tx.debt_id}`,
        recurring: tx.recurring_expense_name || `#${tx.recurring_expense_id}`,
      })
    }
    if (hasDebt) {
      return t('page.deleteLinkedConfirm.descriptionDebt', {
        name: tx.debt_name || `#${tx.debt_id}`,
      })
    }
    return t('page.deleteLinkedConfirm.descriptionRecurring', {
      name: tx.recurring_expense_name || `#${tx.recurring_expense_id}`,
    })
  }

  const columns = useMemo(
    () =>
      createColumns(
        {
          onView: handleView,
          onEdit: handleEdit,
          onDelete: handleDelete,
        },
        t,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
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
        title={t('page.title')}
        description={t('page.description')}
        className="mb-2"
        action={
          <>
            <Button variant="outline" asChild>
              <Link to="/import">
                <HugeiconsIcon icon={FileImportIcon} strokeWidth={2} data-icon="inline-start" />
                <PageHeaderActionLabel>{t('page.actions.import')}</PageHeaderActionLabel>
              </Link>
            </Button>
            <Button onClick={() => setAddDialogOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              <PageHeaderActionLabel>{t('page.actions.add')}</PageHeaderActionLabel>
            </Button>
          </>
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
            t('page.count', { count: transactionData?.total ?? 0 })
          )}
        </div>
        <DataTableViewOptions table={table} />
      </div>

      {isLoading ? (
        <div className="glass-panel flex flex-col gap-3 rounded-xl border p-6">
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
            <EmptyTitle>{t('page.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('page.empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => setAddDialogOpen(true)}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                {t('page.empty.addAction')}
              </Button>
              <Button variant="outline" asChild>
                <Link to="/import">
                  <HugeiconsIcon icon={FileImportIcon} strokeWidth={2} data-icon="inline-start" />
                  {t('page.empty.importAction')}
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
                ? t('page.empty.filteredMessage')
                : t('page.empty.noneMessage')
            }
            footer={
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 text-xs">
                <span className="text-muted-foreground">{t('page.footer.onThisPage')}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">{t('page.footer.in')}</span>
                  <Amount value={pageTotals.in} flow="in" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">{t('page.footer.out')}</span>
                  <Amount value={pageTotals.out} flow="out" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">{t('page.footer.net')}</span>
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
        onMarkTransfer={handleMarkTransfer}
      />
      <MarkTransferDialog
        open={markTransferDialogOpen}
        onOpenChange={setMarkTransferDialogOpen}
        transaction={selectedTransaction}
      />

      <AlertDialog
        open={linkedDeleteTarget != null}
        onOpenChange={(open) => !open && setLinkedDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-warning/15 text-warning">
              <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('page.deleteLinkedConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription className="flex flex-col gap-2">
              {linkedDeleteTarget && <span>{linkedDeleteDescription(linkedDeleteTarget)}</span>}
              <span>{t('page.deleteLinkedConfirm.question')}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void confirmLinkedDelete(false)}
            >
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span>{t('page.deleteLinkedConfirm.keepProgress')}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t('page.deleteLinkedConfirm.keepProgressHint')}
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => void confirmLinkedDelete(true)}
            >
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span>{t('page.deleteLinkedConfirm.undoProgress')}</span>
                <span className="text-xs font-normal text-destructive-foreground/80">
                  {t('page.deleteLinkedConfirm.undoProgressHint')}
                </span>
              </span>
            </Button>
            <AlertDialogCancel className="w-full">
              {t('page.deleteLinkedConfirm.cancel')}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {confirmDialog}
    </PageContainer>
  )
}
