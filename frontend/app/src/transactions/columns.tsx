import type { ColumnDef } from '@tanstack/react-table'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDownLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Delete02Icon,
  Exchange01Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { Amount, CategoryChip, flowOfType, flowSurface } from '../ui/money'
import { cn } from '@/lib/utils'
import type { Transaction } from './transactionsApi'

interface ColumnHandlers {
  onView: (transaction: Transaction) => void
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
}

type Translate = (key: string, options?: Record<string, unknown>) => string

const FLOW_ICON = {
  in: ArrowDownLeft01Icon,
  out: ArrowUpRight01Icon,
  move: Exchange01Icon,
} as const

function splitDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { day: iso, weekday: '' }
  return {
    day: new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: 'short' }).format(date),
    weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date),
  }
}

export function createColumns(
  handlers: ColumnHandlers,
  t: Translate,
): ColumnDef<Transaction>[] {
  const FLOW_LABEL = {
    in: t('columns.flowLabel.in'),
    out: t('columns.flowLabel.out'),
    move: t('columns.flowLabel.move'),
  } as const

  return [
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.date')} />,
      cell: ({ row }) => {
        const { day, weekday } = splitDate(row.original.date)
        return (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium tabular-nums">{day}</span>
            <span className="text-[0.7rem] text-muted-foreground">{weekday}</span>
          </div>
        )
      },
      enableSorting: true,
      meta: {
        cellClassName: 'hidden sm:table-cell w-24 ps-4',
        headerClassName: 'hidden sm:table-cell',
      },
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.description')} />
      ),
      cell: ({ row }) => {
        const { description, notes, type, is_imported, is_pending, debt_name } = row.original
        const flow = flowOfType(type)
        return (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <span
              title={FLOW_LABEL[flow]}
              aria-label={FLOW_LABEL[flow]}
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md border sm:size-7',
                flowSurface[flow],
              )}
            >
              <HugeiconsIcon icon={FLOW_ICON[flow]} strokeWidth={2} className="size-3 sm:size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium">{description}</span>
                {/* Pending entries are replaced wholesale on every sync — flag
                    them so a figure that later changes is not a surprise. */}
                {is_pending && (
                  <span
                    title={t('columns.pendingHint')}
                    className="shrink-0 rounded-full bg-warning/20 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-warning"
                  >
                    {t('columns.pending')}
                  </span>
                )}
              </div>
              {(notes || debt_name || is_imported) && (
                <span className="truncate text-xs text-muted-foreground">
                  {[
                    debt_name && t('columns.debtPrefix', { name: debt_name }),
                    notes,
                    is_imported && t('columns.imported'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
          </div>
        )
      },
      meta: { cellClassName: 'max-w-[9.5rem] sm:max-w-[22rem]' },
    },
    {
      accessorKey: 'category_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.category')} />
      ),
      cell: ({ row }) => {
        const { category_name, category_color, type } = row.original
        if (type === 'transfer') {
          return (
            <span className="text-xs text-muted-foreground">{t('columns.betweenAccounts')}</span>
          )
        }
        return <CategoryChip name={category_name} color={category_color} />
      },
      meta: { cellClassName: 'hidden sm:table-cell', headerClassName: 'hidden sm:table-cell' },
    },
    {
      accessorKey: 'account_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.account')} />,
      cell: ({ row }) => {
        const { account_name, destination_account_name, type } = row.original
        if (type === 'transfer' && destination_account_name) {
          return (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="truncate">{account_name}</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-3.5 shrink-0 text-flow-move"
              />
              <span className="truncate text-foreground">{destination_account_name}</span>
            </div>
          )
        }
        return <span className="truncate text-sm text-muted-foreground">{account_name}</span>
      },
      meta: { cellClassName: 'hidden sm:table-cell', headerClassName: 'hidden sm:table-cell' },
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('columns.amount')} className="justify-end" />
      ),
      cell: ({ row }) => {
        const { amount, type, date } = row.original
        const { day } = splitDate(date)
        return (
          <div className="flex flex-col items-end gap-0.5">
            <Amount value={amount} flow={flowOfType(type)} className="text-sm font-semibold" />
            {/* Mobile only — the date column is hidden below `sm`, so it rides
                along here instead of disappearing. */}
            <span className="text-[0.7rem] tabular-nums text-muted-foreground sm:hidden">
              {day}
            </span>
          </div>
        )
      },
      enableSorting: true,
      meta: { cellClassName: 'text-end pe-3 sm:pe-4', headerClassName: 'text-end' },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">{t('columns.actions')}</span>,
      cell: ({ row }) => {
        const transaction = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8 opacity-100 transition-opacity md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100 md:aria-expanded:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
                <span className="sr-only">
                  {t('columns.actionsFor', { description: transaction.description })}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => handlers.onView(transaction)}>
                  <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                  {t('columns.menu.view')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlers.onEdit(transaction)}>
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                  {t('common:actions.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => handlers.onDelete(transaction)}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  {t('common:actions.delete')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      meta: {
        cellClassName: 'hidden w-12 pe-3 sm:table-cell',
        headerClassName: 'hidden sm:table-cell',
      },
    },
  ]
}
