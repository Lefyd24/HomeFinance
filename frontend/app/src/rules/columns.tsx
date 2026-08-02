import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  FlashIcon,
  MoreVerticalIcon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { describeRule } from './ruleSummary'
import type { CategoryRule } from './rulesApi'

export interface RuleColumnActions {
  onEdit: (rule: CategoryRule) => void
  onDelete: (rule: CategoryRule) => void
  onApply: (rule: CategoryRule) => void
  onToggle: (rule: CategoryRule, active: boolean) => void
  accountName: (id: number) => string
}

export function createRuleColumns(
  t: TFunction<'rules'>,
  actions: RuleColumnActions,
): ColumnDef<CategoryRule>[] {
  return [
    {
      accessorKey: 'name',
      header: t('table.name'),
      cell: ({ row }) => {
        const rule = row.original
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground truncate">{rule.name}</span>
              <Badge variant={rule.is_active ? 'secondary' : 'outline'}>
                {rule.is_active ? t('list.active') : t('list.inactive')}
              </Badge>
            </div>
            <span className="text-sm text-muted-foreground wrap-break-word">
              {describeRule(rule, t, actions.accountName)}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'category_name',
      header: t('table.category'),
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.category_name || `#${row.original.category_id}`}
        </span>
      ),
      meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
    },
    {
      accessorKey: 'times_applied',
      header: t('table.applied'),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
          {row.original.times_applied > 0
            ? t('list.applied', { count: row.original.times_applied })
            : t('list.neverApplied')}
        </span>
      ),
      meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
    },
    {
      id: 'active',
      header: t('table.active'),
      cell: ({ row }) => {
        const rule = row.original
        return (
          <Switch
            checked={rule.is_active}
            onCheckedChange={(checked) => actions.onToggle(rule, checked)}
            aria-label={rule.is_active ? t('list.active') : t('list.inactive')}
            onClick={(e) => e.stopPropagation()}
          />
        )
      },
      enableSorting: false,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">{t('table.actions')}</span>,
      cell: ({ row }) => {
        const rule = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={rule.name}
                onClick={(e) => e.stopPropagation()}
              >
                <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    actions.onApply(rule)
                  }}
                >
                  <HugeiconsIcon icon={FlashIcon} strokeWidth={2} />
                  {t('actions.apply')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    actions.onEdit(rule)
                  }}
                >
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                  {t('actions.edit')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  void actions.onDelete(rule)
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                {t('actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      enableSorting: false,
    },
  ]
}
