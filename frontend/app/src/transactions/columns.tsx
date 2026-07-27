import type { ColumnDef } from '@tanstack/react-table'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  MoreVerticalIcon,
  Delete02Icon,
  PencilEdit02Icon,
  ViewIcon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { formatDate, formatSignedCurrency } from '../lib/format'
import type { Transaction } from './transactionsApi'

interface ColumnHandlers {
  onView: (transaction: Transaction) => void
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
}

export function createColumns(handlers: ColumnHandlers): ColumnDef<Transaction>[] {
  return [
    {
      accessorKey: 'date',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => {
        const date = row.original.date
        return <div className="text-sm">{formatDate(date)}</div>
      },
      enableSorting: true,
    },
    {
      accessorKey: 'description',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
      cell: ({ row }) => {
        const { description, notes } = row.original
        return (
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="font-medium text-sm truncate">{description}</div>
            {notes && <div className="text-xs text-muted-foreground truncate">{notes}</div>}
          </div>
        )
      },
    },
    {
      accessorKey: 'category_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => {
        const { category_name, category_color, type } = row.original
        if (type === 'transfer') {
          return <Badge variant="outline">Transfer</Badge>
        }
        if (!category_name) return <span className="text-muted-foreground text-sm">—</span>
        return (
          <Badge variant="outline" className="gap-1.5">
            {category_color && (
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: category_color }}
              />
            )}
            <span>{category_name}</span>
          </Badge>
        )
      },
    },
    {
      accessorKey: 'account_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
      cell: ({ row }) => {
        const { account_name, destination_account_name, type } = row.original
        if (type === 'transfer' && destination_account_name) {
          return (
            <div className="flex items-center gap-1.5 text-sm">
              <span className="truncate">{account_name}</span>
              <HugeiconsIcon icon={ArrowRight01Icon} className="shrink-0 size-3" strokeWidth={2} />
              <span className="truncate">{destination_account_name}</span>
            </div>
          )
        }
        return <div className="text-sm truncate">{account_name}</div>
      },
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => {
        const { amount, type } = row.original
        const formatted = formatSignedCurrency(amount, type)
        return (
          <div
            className={`text-sm font-medium tabular-nums ${
              type === 'income'
                ? 'text-success'
                : type === 'expense'
                  ? 'text-destructive'
                  : 'text-foreground'
            }`}
          >
            {formatted}
          </div>
        )
      },
      enableSorting: true,
    },
    {
      accessorKey: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => {
        const type = row.original.type
        const variant =
          type === 'income' ? 'default' : type === 'expense' ? 'destructive' : 'secondary'
        return (
          <Badge variant={variant} className="capitalize">
            {type}
          </Badge>
        )
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const transaction = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8"
                onClick={(e) => e.stopPropagation()}
              >
                <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => handlers.onView(transaction)}>
                  <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlers.onEdit(transaction)}>
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => handlers.onDelete(transaction)}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}
