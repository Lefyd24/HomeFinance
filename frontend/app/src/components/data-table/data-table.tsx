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

interface DataTableProps<TData, TValue> {
  table: TanstackTable<TData>
  columns: ColumnDef<TData, TValue>[]
  onRowClick?: (row: TData) => void
  emptyMessage?: string
  className?: string
  getRowClassName?: (row: Row<TData>) => string | undefined
}

export function DataTable<TData, TValue>({
  table,
  columns,
  onRowClick,
  emptyMessage = 'No results.',
  className,
  getRowClassName,
}: DataTableProps<TData, TValue>) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-sm', className)}>
      <Table>
        <TableHeader className="bg-muted/70 [&_tr]:border-border">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent border-border">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="font-semibold text-foreground">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row, index) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                className={cn(
                  'border-border',
                  index % 2 === 1 && 'bg-muted/30',
                  onRowClick && 'cursor-pointer',
                  getRowClassName?.(row),
                )}
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-28 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
