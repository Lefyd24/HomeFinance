import type { ReactNode } from 'react'
import {
  flexRender,
  type ColumnDef,
  type Table as TanstackTable,
  type Row,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/** Per-column presentation, read off `columnDef.meta`. */
export interface DataTableColumnMeta {
  cellClassName?: string
  headerClassName?: string
}

interface DataTableProps<TData, TValue> {
  table: TanstackTable<TData>
  columns: ColumnDef<TData, TValue>[]
  onRowClick?: (row: TData) => void
  emptyMessage?: string
  className?: string
  getRowClassName?: (row: Row<TData>) => string | undefined
  /** Alternating row tint. Turn off when rows already carry a colour cue. */
  striped?: boolean
  /** Keeps column labels visible while a long page scrolls. */
  stickyHeader?: boolean
  /** Summary strip rendered inside the table's frame, below the rows. */
  footer?: ReactNode
}

export function DataTable<TData, TValue>({
  table,
  columns,
  onRowClick,
  emptyMessage = 'No results.',
  className,
  getRowClassName,
  striped = true,
  stickyHeader = false,
  footer,
}: DataTableProps<TData, TValue>) {
  const rows = table.getRowModel().rows

  return (
    <div
      className={cn(
        'glass-panel overflow-hidden rounded-xl border',
        className,
      )}
    >
      <Table>
        <TableHeader
          className={cn(
            'bg-muted [&_tr]:border-border',
            stickyHeader && 'sticky top-0 z-10',
          )}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as DataTableColumnMeta | undefined
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'text-xs font-semibold tracking-wide text-muted-foreground uppercase',
                      meta?.headerClassName,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row, index) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                className={cn(
                  'group/row border-border',
                  striped && index % 2 === 1 && 'bg-muted/30',
                  onRowClick && 'cursor-pointer',
                  getRowClassName?.(row),
                )}
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as DataTableColumnMeta | undefined
                  return (
                    <TableCell key={cell.id} className={meta?.cellClassName}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-28 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {footer && rows.length > 0 && (
        <div className="border-t border-border bg-muted/40">{footer}</div>
      )}
    </div>
  )
}
