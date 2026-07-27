import { type Column } from '@tanstack/react-table'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUp01Icon, ArrowDown01Icon, UnfoldMoreIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  const sorted = column.getIsSorted()

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ms-2 h-8"
        onClick={() => column.toggleSorting(sorted === 'asc')}
      >
        <span>{title}</span>
        {sorted === 'desc' ? (
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} data-icon="inline-end" />
        ) : sorted === 'asc' ? (
          <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} data-icon="inline-end" />
        ) : (
          <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} data-icon="inline-end" />
        )}
      </Button>
    </div>
  )
}
