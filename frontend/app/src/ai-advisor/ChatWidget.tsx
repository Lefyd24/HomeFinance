import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ArrowUp, Check, Copy, Download, PenLine, RotateCcw, Sparkles, Square } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from '@/components/ui/message'
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
import { ProfileUpdateCard } from './ProfileUpdateCard'
import { ToolTrail } from './ToolTrail'
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
  disabled,
  disabledReason,
  initialPrompt,
  showInvestmentPrompts,
}: {
  turns: Turn[]
  isStreaming: boolean
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  /** Present (and the control shown) only once there's a transcript to clear. */
  onClear?: () => void
  disabled?: boolean
  disabledReason?: string
  /** A question handed over from another page, asked once on arrival. */
  initialPrompt?: string
  /** Offer the portfolio openers — only when the investment tools are enabled. */
  showInvestmentPrompts?: boolean
}) {
  const { t } = useTranslation('advisor')
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const sentInitial = useRef(false)

  useEffect(() => {
    if (!initialPrompt || disabled || sentInitial.current) return
    sentInitial.current = true
    onSend(initialPrompt)
  }, [initialPrompt, disabled, onSend])

  const lastTurn = turns[turns.length - 1]

  function handleExport() {
    const now = new Date()
    downloadConversation(conversationToMarkdown(turns, t, now), conversationFilename(now))
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* A real bar rather than a floating button: on a phone an absolutely
          positioned control sits on top of the first message. */}
      {turns.length > 0 && (
        <div className="flex shrink-0 items-center justify-end gap-1.5 px-3 pt-2 sm:px-4 lg:px-6">
          <Button variant="ghost" size="sm" onClick={handleExport}>
            <Download data-icon="inline-start" />
            {/* The label costs more than it earns on a narrow screen. */}
            <span className="max-sm:sr-only">{t('aiAdvisor.chat.export')}</span>
          </Button>
          {onClear && (
            <Button variant="outline" size="sm" onClick={onClear}>
              <PenLine data-icon="inline-start" />
              <span className="max-sm:sr-only">{t('aiAdvisor.chat.newChat')}</span>
            </Button>
          )}
        </div>
      )}

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent
              className={cn(
                'mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6 lg:px-6',
                turns.length === 0 && 'flex h-full min-h-[26rem] flex-col',
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
      <MessageAvatar className="size-8 bg-primary text-primary-foreground max-sm:hidden">
        <Sparkles className="size-4" />
      </MessageAvatar>

      <MessageContent>
        {/* One bubble holding the whole answer — prose and lookups interleaved
            in the order they happened, so a lookup reads as a step in the
            reasoning rather than a footnote detached from it. The answer runs
            wide: the advisor replies with tables and lists, and the default
            80% bubble cap would squeeze them. */}
        {(groups.length > 0 || turn.streaming) && (
          <Bubble variant="muted" className="max-w-full">
            <BubbleContent className="flex flex-col gap-2.5 px-3 py-2.5 sm:px-3.5">
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
        <Alert className="max-w-md">
          <AlertDescription>{disabledReason}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
      <h2 className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t('aiAdvisor.chat.heading')}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        {t('aiAdvisor.chat.subheading')}
      </p>

      <div className="mt-6 flex w-full max-w-2xl flex-col gap-5 sm:mt-8 sm:gap-6">
        {getSuggestionGroups(t, showInvestmentPrompts).map((group) => (
          <div key={group.key}>
            {/* The groups name the job, so the openers read as directions to
                take rather than an undifferentiated list of prompts. */}
            <Marker variant="separator" className="mb-2 justify-center">
              <MarkerContent>{group.title}</MarkerContent>
            </Marker>
            <div className="flex flex-wrap justify-center gap-2">
              {group.prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onPick(prompt)}
                  // A full-width row per prompt on a phone: wrapped chips of
                  // sentence-length text turn into ragged, hard-to-hit shapes.
                  className="w-full rounded-2xl bg-card px-3.5 py-2.5 text-start text-sm text-foreground shadow-xs transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto sm:rounded-full sm:py-2"
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
    <div className="shrink-0 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 lg:px-6">
      <form
        className="glass-popover mx-auto flex w-full max-w-5xl items-end gap-1.5 rounded-[1.5rem] border p-1.5 focus-within:border-primary/40 focus-within:ring-3 focus-within:ring-ring/25"
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
      <p className="mx-auto mt-2 max-w-5xl text-center text-xs text-muted-foreground max-sm:hidden">
        {t('aiAdvisor.chat.composerHint')}
      </p>
    </div>
  )
}
