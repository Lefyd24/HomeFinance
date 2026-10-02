import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ArrowUp, Check, Copy, Download, PenLine, RotateCcw, Square, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Message, MessageContent, MessageFooter } from '@/components/ui/message'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Marker, MarkerContent } from '@/components/ui/marker'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { getSuggestionGroups } from './aiAdvisorLabels'
import {
  conversationFilename,
  conversationToMarkdown,
  downloadConversation,
} from './exportConversation'
import { Markdown } from './Markdown'
import { formatUsd } from './format'
import { ModelPicker } from './ModelPicker'
import { ProfileUpdateCard } from './ProfileUpdateCard'
import { ToolTrail } from './ToolTrail'
import { TurnFooter } from './TurnFooter'
import type { Turn, TurnSegment } from './useAiChat'

/** Consecutive lookups render as one block — the model often batches them. */
type RenderGroup =
  | { kind: 'text'; id: string; content: string }
  | { kind: 'tools'; id: string; tools: Extract<TurnSegment, { kind: 'tool' }>[] }
  | { kind: 'profile'; id: string; update: Extract<TurnSegment, { kind: 'profile' }>['update'] }

function groupSegments(segments: TurnSegment[]): RenderGroup[] {
  const groups: RenderGroup[] = []
  for (const segment of segments) {
    if (segment.kind === 'tool') {
      const last = groups[groups.length - 1]
      if (last?.kind === 'tools') {
        last.tools.push(segment)
        continue
      }
      groups.push({ kind: 'tools', id: segment.id, tools: [segment] })
      continue
    }
    if (segment.kind === 'text') {
      groups.push({ kind: 'text', id: segment.id, content: segment.content })
      continue
    }
    groups.push({ kind: 'profile', id: segment.id, update: segment.update })
  }
  return groups
}

export function ChatWidget({
  turns,
  isStreaming,
  onSend,
  onStop,
  onRetry,
  onClear,
  onClose,
  disabled,
  disabledReason,
  showInvestmentPrompts,
  model,
  onModelChange,
}: {
  turns: Turn[]
  isStreaming: boolean
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  /** Present (and the control shown) only once there's a transcript to clear. */
  onClear?: () => void
  /** Present when the chat sits in a popup that can be dismissed. */
  onClose?: () => void
  disabled?: boolean
  disabledReason?: string
  /** Offer the portfolio openers — only when the investment tools are enabled. */
  showInvestmentPrompts?: boolean
  /** The model the next question goes to; the picker is hidden when absent. */
  model?: string | null
  onModelChange?: (model: string) => void
}) {
  const { t } = useTranslation('advisor')
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const lastTurn = turns[turns.length - 1]
  const sessionCost = turns.reduce((sum, turn) => sum + (turn.usage?.cost_usd ?? 0), 0)

  function handleExport() {
    const now = new Date()
    downloadConversation(conversationToMarkdown(turns, t, now), conversationFilename(now))
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-gradient-to-b from-primary/[0.05] via-transparent to-transparent">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3">
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-border">
          <img src="/assets/icons/icon-96.png" alt="" className="size-6" />
          <span className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full border-2 border-popover bg-emerald-500" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-sm font-semibold leading-tight text-foreground">
            {t('aiAdvisor.popup.title')}
          </h2>
          <p className="truncate text-xs text-muted-foreground">{t('aiAdvisor.popup.subtitle')}</p>
        </div>
        {turns.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleExport}
            aria-label={t('aiAdvisor.chat.export')}
            title={t('aiAdvisor.chat.export')}
          >
            <Download />
          </Button>
        )}
        {onClear && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClear}
            aria-label={t('aiAdvisor.chat.newChat')}
            title={t('aiAdvisor.chat.newChat')}
          >
            <PenLine />
          </Button>
        )}
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t('aiAdvisor.popup.close')}
            title={t('aiAdvisor.popup.close')}
          >
            <X />
          </Button>
        )}
      </header>

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent
              className={cn(
                'w-full gap-5 px-4 py-4',
                turns.length === 0 && 'flex h-full flex-col',
              )}
            >
              {turns.length === 0 ? (
                <EmptyState
                  disabled={disabled}
                  disabledReason={disabledReason}
                  onPick={(prompt) => onSend(prompt)}
                  showInvestmentPrompts={showInvestmentPrompts}
                />
              ) : (
                turns.map((turn) => (
                  <MessageScrollerItem
                    key={turn.id}
                    messageId={turn.id}
                    scrollAnchor={turn.role === 'user'}
                  >
                    {turn.role === 'user' ? (
                      <UserTurn turn={turn} />
                    ) : (
                      <AssistantTurn
                        turn={turn}
                        isLast={turn.id === lastTurn?.id}
                        onRetry={onRetry}
                      />
                    )}
                  </MessageScrollerItem>
                ))
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      {model && onModelChange && !disabled && (
        <div className="flex shrink-0 items-center gap-2 px-4 pt-1">
          <ModelPicker model={model} disabled={isStreaming} onChange={onModelChange} />
          {sessionCost > 0 && (
            <span className="ms-auto text-[11px] text-muted-foreground tabular-nums">
              {t('aiAdvisor.usage.sessionTotal', { cost: formatUsd(sessionCost) })}
            </span>
          )}
        </div>
      )}

      <Composer
        ref={composerRef}
        isStreaming={isStreaming}
        disabled={disabled}
        onSend={onSend}
        onStop={onStop}
        t={t}
      />
    </div>
  )
}

function UserTurn({ turn }: { turn: Turn }) {
  return (
    <Message align="end">
      <MessageContent>
        <Bubble align="end" variant="default">
          <BubbleContent className="whitespace-pre-wrap">{turn.content}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

function AssistantTurn({
  turn,
  isLast,
  onRetry,
}: {
  turn: Turn
  isLast: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation('advisor')
  const [copied, setCopied] = useState(false)
  const hasAnswer = turn.content.trim().length > 0
  const groups = groupSegments(turn.segments)

  async function handleCopy() {
    await navigator.clipboard.writeText(turn.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Message align="start">
      <MessageContent>
        {/* One bubble holding the whole answer — prose and lookups interleaved
            in the order they happened, so a lookup reads as a step in the
            reasoning rather than a footnote detached from it. The answer runs
            wide: the advisor replies with tables and lists, and the default
            80% bubble cap would squeeze them. */}
        {(groups.length > 0 || turn.streaming) && (
          <Bubble variant="muted" className="max-w-full">
            <BubbleContent className="flex flex-col gap-2.5 px-3.5 py-2.5">
              {groups.map((group) => {
                if (group.kind === 'text') {
                  const text = group.content.trim()
                  return text ? <Markdown key={group.id} content={text} /> : null
                }
                if (group.kind === 'tools') {
                  return <ToolTrail key={group.id} tools={group.tools} />
                }
                return <ProfileUpdateCard key={group.id} update={group.update} />
              })}

              {turn.streaming && groups.length === 0 && (
                <span className="shimmer">{t('aiAdvisor.chat.thinking')}</span>
              )}
            </BubbleContent>
          </Bubble>
        )}

        {turn.disclaimer && (
          <p className="mt-1.5 max-w-full px-1 text-[11px] leading-snug text-muted-foreground">
            {turn.disclaimer}
          </p>
        )}

        {turn.error && (
          <Alert variant="destructive" className="mt-1.5 max-w-full">
            <AlertDescription>{turn.error}</AlertDescription>
          </Alert>
        )}

        {!turn.streaming && turn.usage && (
          <div className="mt-1 px-1">
            <TurnFooter turn={turn} />
          </div>
        )}

        {!turn.streaming && (hasAnswer || turn.error) && (
          <MessageFooter className="gap-1 px-1">
            {hasAnswer && (
              <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
                {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                {copied ? t('aiAdvisor.chat.copied') : t('aiAdvisor.chat.copy')}
              </Button>
            )}
            {isLast && (
              <Button variant="ghost" size="sm" onClick={onRetry}>
                <RotateCcw data-icon="inline-start" />
                {t('aiAdvisor.chat.askAgain')}
              </Button>
            )}
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  )
}

function EmptyState({
  disabled,
  disabledReason,
  onPick,
  showInvestmentPrompts,
}: {
  disabled?: boolean
  disabledReason?: string
  onPick: (prompt: string) => void
  /** Portfolio openers are only worth offering when the tools behind them exist. */
  showInvestmentPrompts?: boolean
}) {
  const { t } = useTranslation('advisor')
  if (disabled) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Alert>
          <AlertDescription>{disabledReason}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col py-1">
      <h3 className="font-heading text-lg font-bold tracking-tight text-foreground">
        {t('aiAdvisor.chat.heading')}
      </h3>
      <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
        {t('aiAdvisor.chat.subheading')}
      </p>

      <div className="mt-4 flex w-full flex-col gap-3.5">
        {getSuggestionGroups(t, showInvestmentPrompts).map((group) => (
          <div key={group.key}>
            {/* The groups name the job, so the openers read as directions to
                take rather than an undifferentiated list of prompts. */}
            <Marker variant="separator" className="mb-1.5">
              <MarkerContent>{group.title}</MarkerContent>
            </Marker>
            <div className="flex flex-wrap gap-1.5">
              {group.prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onPick(prompt)}
                  className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent px-3 py-1.5 text-start text-[13px] leading-snug text-foreground transition-all hover:-translate-y-px hover:border-primary/35 hover:from-primary/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-0"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * One line of text plus its padding. The composer starts here and only grows
 * once the text actually wraps — a box that opens three lines tall spends the
 * whole conversation implying you should be writing more than you are.
 */
const COMPOSER_MIN_HEIGHT = 36
/** Past this it scrolls, rather than swallowing the conversation above it. */
const COMPOSER_MAX_HEIGHT = 168

function Composer({
  ref,
  isStreaming,
  disabled,
  onSend,
  onStop,
  t,
}: {
  ref: React.RefObject<HTMLTextAreaElement | null>
  isStreaming: boolean
  disabled?: boolean
  onSend: (text: string) => void
  onStop: () => void
  t: TFunction<'advisor'>
}) {
  const [value, setValue] = useState('')

  /**
   * Measured after every render rather than on each keystroke.
   *
   * Doing it in the change handler cannot shrink the field back on send: the
   * state is cleared but the element still holds the old text at that moment,
   * so `scrollHeight` reports the tall version and the composer stays expanded
   * over an empty box. Reading it after the render that emptied it is the only
   * point where the measurement is true.
   */
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    // Collapse first so scrollHeight reports the content, not the current box.
    element.style.height = 'auto'
    element.style.height = `${Math.min(Math.max(element.scrollHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT)}px`
  }, [value, ref])

  function submit() {
    const text = value.trim()
    if (!text || isStreaming || disabled) return
    onSend(text)
    setValue('')
  }

  return (
    <div className="shrink-0 px-3 pb-3 pt-1">
      <form
        className="flex w-full items-end gap-1.5 rounded-[1.5rem] border bg-muted/40 p-1.5 transition-shadow focus-within:border-primary/40 focus-within:bg-background focus-within:ring-3 focus-within:ring-ring/25"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={
            disabled ? t('aiAdvisor.chat.composerPlaceholderDisabled') : t('aiAdvisor.chat.composerPlaceholder')
          }
          aria-label={t('aiAdvisor.chat.composerAriaLabel')}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is how you write a second line.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          style={{ height: COMPOSER_MIN_HEIGHT }}
          className={cn(
            'min-h-0 resize-none overflow-y-auto border-0 bg-transparent px-3 py-1.5 shadow-none',
            'text-base leading-6 sm:text-sm',
            'focus-visible:border-0 focus-visible:ring-0',
          )}
        />

        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={onStop}
            aria-label={t('aiAdvisor.chat.stopAriaLabel')}
            className="size-9 shrink-0 rounded-full"
          >
            <Square />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={disabled || !value.trim()}
            aria-label={t('aiAdvisor.chat.sendAriaLabel')}
            className="size-9 shrink-0 rounded-full"
          >
            <ArrowUp />
          </Button>
        )}
      </form>
      {/* Keyboard help is meaningless on a touch device, and the space below
          the composer is at its most valuable there. */}
      <p className="mt-2 text-center text-[11px] text-muted-foreground max-sm:hidden">
        {t('aiAdvisor.chat.composerHint')}
      </p>
    </div>
  )
}
