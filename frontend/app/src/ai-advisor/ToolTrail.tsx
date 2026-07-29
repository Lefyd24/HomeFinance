import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { toolLabel } from './aiAdvisorLabels'
import type { ToolCall } from './aiChatApi'

/**
 * What the advisor looked up, shown while it looks.
 *
 * An answer about your money is only worth as much as the data behind it, so
 * the lookups are part of the answer, not hidden machinery. Each row settles
 * from a spinner to a tick in place — the trail stays put once the turn ends,
 * as the receipt for what the answer was built from.
 */
export function ToolTrail({ tools, className }: { tools: ToolCall[]; className?: string }) {
  const { t } = useTranslation('advisor')
  if (tools.length === 0) return null

  return (
    <ul className={cn('flex flex-col gap-1', className)}>
      {tools.map((tool, index) => (
        <li
          key={`${tool.name}-${index}`}
          className={cn(
            'flex items-center gap-2 text-xs',
            tool.state === 'running' ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {tool.state === 'running' ? (
            <Spinner className="size-3 shrink-0" />
          ) : (
            <Check className="size-3 shrink-0 text-success" />
          )}
          <span className={cn(tool.state === 'running' && 'shimmer')}>{toolLabel(tool.name, t)}</span>
        </li>
      ))}
    </ul>
  )
}
