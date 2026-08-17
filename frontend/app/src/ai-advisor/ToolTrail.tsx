import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { toolLabel, toolSubject } from './aiAdvisorLabels'
import type { ToolCall } from './aiChatApi'

/**
 * What the advisor looked up, shown where it looked.
 *
 * An answer about your money is only worth as much as the data behind it, so
 * the lookups are part of the answer, not hidden machinery. They sit at the
 * point in the reply where they happened — between the paragraph that prompted
 * the lookup and the paragraph that uses its result — because a batch of
 * lookups hoisted to the top tells you what was consulted but not what for.
 *
 * Each row settles from a spinner to a tick in place, and stays afterwards as
 * the receipt for that step of the reasoning.
 */
export function ToolTrail({ tools, className }: { tools: ToolCall[]; className?: string }) {
  const { t } = useTranslation('advisor')
  if (tools.length === 0) return null

  return (
    <ul
      className={cn(
        'flex flex-col gap-1 border-s-2 border-border/70 ps-3',
        className,
      )}
    >
      {tools.map((tool, index) => {
        const subject = toolSubject(tool.args)
        const running = tool.state === 'running'
        return (
          <li
            key={`${tool.name}-${index}`}
            className={cn(
              'flex items-center gap-2 text-xs',
              running ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {running ? (
              <Spinner className="size-3 shrink-0" />
            ) : (
              <Check className="size-3 shrink-0 text-success" />
            )}
            {/* min-w-0 lets the label truncate instead of forcing the bubble
                wider than the viewport on a phone. */}
            <span className={cn('min-w-0 truncate', running && 'shimmer')}>
              {toolLabel(tool.name, t)}
              {subject ? <span className="text-muted-foreground"> · {subject}</span> : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
