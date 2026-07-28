import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared two-column shell for a calculator: inputs on the left, results on the right. */
export function ToolPanel({
  title,
  description,
  form,
  results,
  chart,
}: {
  title: string
  description: string
  form: ReactNode
  results: ReactNode
  chart?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <section className="glass-panel rounded-xl border p-4 sm:p-5 lg:sticky lg:top-4">
          <h2 className="font-heading text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          <div className="mt-4">{form}</div>
        </section>

        <section className="glass-panel rounded-xl border p-4 sm:p-5">
          <h2 className="font-heading text-lg font-semibold">Results</h2>
          <div className="mt-4 max-h-[70vh] overflow-y-auto">{results}</div>
        </section>
      </div>

      {chart && <section className="glass-panel rounded-xl border p-4 sm:p-5">{chart}</section>}
    </div>
  )
}

export function EmptyResults({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export function InfoBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg bg-info/10 p-3 text-xs text-muted-foreground', className)}>
      {children}
    </div>
  )
}

export function FieldGroup2({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
}
