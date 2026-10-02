import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'
import { formatDuration, formatTokens, formatUsd, shortModel } from './format'
import type { Turn } from './useAiChat'

/** What one turn cost: a compact line under the answer, the full breakdown on hover. */
export function TurnFooter({ turn }: { turn: Turn }) {
  const { t } = useTranslation('advisor')
  const { usage } = turn
  if (!usage) return null

  const model = turn.model ? shortModel(turn.model) : null
  const cost = `${usage.cost_estimated ? '≈ ' : ''}${formatUsd(usage.cost_usd)}`
  const window = turn.contextWindow
  const peak = window
    ? `${formatTokens(usage.peak_context_tokens)} / ${formatTokens(window)} (${Math.max(
        1,
        Math.round((usage.peak_context_tokens / window) * 100),
      )}%)`
    : formatTokens(usage.peak_context_tokens)

  const breakdown = [
    t('aiAdvisor.usage.title'),
    model ? `${t('aiAdvisor.usage.model')}: ${model}` : null,
    `${t('aiAdvisor.usage.steps')}: ${usage.steps}`,
    `${t('aiAdvisor.usage.toolCalls')}: ${usage.tool_calls}`,
    `${t('aiAdvisor.usage.input')}: ${formatTokens(usage.prompt_tokens)}`,
    `${t('aiAdvisor.usage.cached')}: ${formatTokens(usage.cached_tokens)}`,
    `${t('aiAdvisor.usage.output')}: ${formatTokens(usage.completion_tokens)}`,
    `${t('aiAdvisor.usage.peakContext')}: ${peak}`,
    `${t('aiAdvisor.usage.cost')}: ${cost}`,
    `${t('aiAdvisor.usage.duration')}: ${formatDuration(usage.duration_ms)}`,
    usage.cost_estimated ? t('aiAdvisor.usage.estimated') : null,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <p
      title={breakdown}
      data-testid="turn-footer"
      className="inline-flex w-fit max-w-full flex-wrap items-center gap-x-1.5 rounded-md px-1 text-[11px] text-muted-foreground tabular-nums"
    >
      <Coins className="size-3 shrink-0" aria-hidden />
      {model && <span className="truncate">{model}</span>}
      {model && <span aria-hidden>·</span>}
      <span>
        {formatTokens(usage.prompt_tokens)} → {formatTokens(usage.completion_tokens)}{' '}
        {t('aiAdvisor.usage.tokens')}
      </span>
      <span aria-hidden>·</span>
      <span>{cost}</span>
      <span aria-hidden>·</span>
      <span>{formatDuration(usage.duration_ms)}</span>
    </p>
  )
}
