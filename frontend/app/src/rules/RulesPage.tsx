import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, FlashIcon, RepeatIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { DataTable } from '@/components/data-table/data-table'
import { DataTablePagination } from '@/components/data-table/data-table-pagination'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader, PageHeaderActionLabel } from '../ui/PageHeader'
import { Dialog } from '../ui/Dialog'
import { useConfirm } from '../ui/useConfirm'
import { useAccounts } from '../accounts/useAccounts'
import {
  useApplyAllRules,
  useApplyRule,
  useDeleteRule,
  useRules,
  useUpdateRule,
} from './useRules'
import { RuleFormDialog } from './RuleFormDialog'
import { createRuleColumns } from './columns'
import { describeRule } from './ruleSummary'
import type { CategoryRule } from './rulesApi'

export function RulesPage() {
  const { t } = useTranslation('rules')
  const { data: rules = [], isLoading } = useRules()
  const { data: accounts = [] } = useAccounts()
  const updateRule = useUpdateRule()
  const deleteRule = useDeleteRule()
  const applyRule = useApplyRule()
  const applyAll = useApplyAllRules()
  const { confirm, confirmDialog } = useConfirm()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryRule | null>(null)
  const [applyTarget, setApplyTarget] = useState<CategoryRule | 'all' | null>(null)
  const [includeCategorised, setIncludeCategorised] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const accountName = (id: number) =>
    accounts.find((a) => a.id === id)?.name ?? String(id)

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(rule: CategoryRule) {
    setEditing(rule)
    setFormOpen(true)
  }

  async function handleDelete(rule: CategoryRule) {
    if (
      !(await confirm({
        title: t('actions.delete'),
        description: rule.name,
        confirmLabel: t('actions.delete'),
        tone: 'destructive',
      }))
    ) {
      return
    }
    try {
      await deleteRule.mutateAsync(rule.id)
      toast.success(t('toast.deleted'))
    } catch {
      toast.error(t('toast.deleteError'))
    }
  }

  async function handleToggle(rule: CategoryRule, active: boolean) {
    try {
      await updateRule.mutateAsync({
        id: rule.id,
        payload: { is_active: active },
      })
    } catch {
      toast.error(t('toast.updateError'))
    }
  }

  async function confirmApply() {
    if (!applyTarget) return
    try {
      const result =
        applyTarget === 'all'
          ? await applyAll.mutateAsync(includeCategorised)
          : await applyRule.mutateAsync({
              id: applyTarget.id,
              includeCategorised,
            })
      if (result.updated === 0) {
        toast.message(t('apply.none'))
      } else {
        toast.success(t('apply.success', { count: result.updated }))
      }
      setApplyTarget(null)
      setIncludeCategorised(false)
    } catch {
      toast.error(t('toast.applyError'))
    }
  }

  const columns = useMemo(
    () =>
      createRuleColumns(t, {
        onEdit: openEdit,
        onDelete: (rule) => void handleDelete(rule),
        onApply: (rule) => {
          setIncludeCategorised(false)
          setApplyTarget(rule)
        },
        onToggle: (rule, active) => void handleToggle(rule, active),
        accountName,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over latest mutations/t
    [t, accounts],
  )

  const table = useReactTable({
    data: rules,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? '')
        .trim()
        .toLowerCase()
      if (!q) return true
      const rule = row.original
      const haystack = [
        rule.name,
        rule.category_name ?? '',
        describeRule(rule, t, accountName),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })

  return (
    <PageContainer>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setIncludeCategorised(false)
                setApplyTarget('all')
              }}
              disabled={!rules.some((r) => r.is_active)}
            >
              <HugeiconsIcon icon={FlashIcon} strokeWidth={2} data-icon="inline-start" />
              <PageHeaderActionLabel>{t('actions.applyAll')}</PageHeaderActionLabel>
            </Button>
            <Button onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              <PageHeaderActionLabel>{t('actions.add')}</PageHeaderActionLabel>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : rules.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={RepeatIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={openCreate}>{t('empty.cta')}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <InputGroup className="max-w-sm bg-muted/50">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </InputGroupAddon>
            <InputGroupInput
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value)
                table.setPageIndex(0)
              }}
              placeholder={t('table.searchPlaceholder')}
              aria-label={t('table.searchPlaceholder')}
            />
          </InputGroup>

          <DataTable
            table={table}
            columns={columns}
            emptyMessage={t('table.noMatches')}
            onRowClick={openEdit}
          />

          <DataTablePagination table={table} />
        </div>
      )}

      <RuleFormDialog open={formOpen} onOpenChange={setFormOpen} rule={editing} />

      <Dialog
        open={applyTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setApplyTarget(null)
            setIncludeCategorised(false)
          }
        }}
        title={applyTarget === 'all' ? t('apply.applyAllTitle') : t('apply.title')}
        description={
          applyTarget === 'all'
            ? t('apply.applyAllDescription')
            : applyTarget
              ? t('apply.description', { name: applyTarget.name })
              : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setApplyTarget(null)
                setIncludeCategorised(false)
              }}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void confirmApply()}
              disabled={applyRule.isPending || applyAll.isPending}
            >
              {t('apply.confirm')}
            </Button>
          </>
        }
      >
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={includeCategorised}
            onCheckedChange={(v) => setIncludeCategorised(Boolean(v))}
            className="mt-0.5"
          />
          <span>{t('apply.includeCategorised')}</span>
        </label>
      </Dialog>

      {confirmDialog}
    </PageContainer>
  )
}
