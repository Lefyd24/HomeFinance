import { useTranslation } from 'react-i18next'
import { Check, Sparkles } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { toolDescription } from './aiAdvisorLabels'
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
export interface SkillTrailItem {
  kind: 'skill'
  name: string
  title: string
}

function isSkillItem(item: ToolCall | SkillTrailItem): item is SkillTrailItem {
  return 'kind' in item && item.kind === 'skill'
}

export function ToolTrail({
  tools,
  className,
}: {
  tools: Array<ToolCall | SkillTrailItem>
  className?: string
}) {
  const { t } = useTranslation('advisor')
  // load_skill_tool is bookkeeping: the skill entry that follows is its receipt,
  // so the raw call only shows while it is still in flight.
  const visible = tools.filter(
    (item) => isSkillItem(item) || !(item.name === 'load_skill_tool' && item.state === 'done'),
  )
  if (visible.length === 0) return null

  return (
    <ul
      className={cn(
        'flex flex-col gap-1 border-s-2 border-border/70 ps-3',
        className,
      )}
    >
      {visible.map((tool, index) => {
        if (isSkillItem(tool)) {
          return (
            <li
              key={`skill-${tool.name}-${index}`}
              className="flex items-center gap-2 text-xs font-medium text-primary"
            >
              <Sparkles className="size-3 shrink-0" />
              <span className="min-w-0 truncate">
                {t('aiAdvisor.toolTrail.usingSkill', { title: tool.title })}
              </span>
            </li>
          )
        }
        const { label, subject } = toolDescription(tool.name, tool.args, t)
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
              {label}
              {subject ? <span className="text-muted-foreground"> · {subject}</span> : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
