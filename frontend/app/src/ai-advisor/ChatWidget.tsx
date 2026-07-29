import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ArrowUp, Check, Copy, PenLine, RotateCcw, Sparkles, Square } from 'lucide-react'
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
import { Markdown } from './Markdown'
import { ToolTrail } from './ToolTrail'
import type { Turn } from './useAiChat'

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

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {onClear && (
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          className="glass-panel absolute end-4 top-3 z-10 shadow-sm"
        >
          <PenLine data-icon="inline-start" />
          {t('aiAdvisor.chat.newChat')}
        </Button>
      )}

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent
              className={cn(
                'mx-auto w-full max-w-3xl px-4 py-6',
                turns.length === 0 && 'flex h-full min-h-[26rem] flex-col',
              )}
            >
              {turns.length === 0 ? (
                <EmptyState
                  disabled={disabled}
                  disabledReason={disabledReason}
                  onPick={(prompt) => onSend(prompt)}
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

  async function handleCopy() {
    await navigator.clipboard.writeText(turn.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Message align="start">
      <MessageAvatar className="size-8 bg-primary text-primary-foreground">
        <Sparkles className="size-4" />
      </MessageAvatar>

      <MessageContent>
        {turn.tools.length > 0 && (
          <ToolTrail tools={turn.tools} className="px-3 pt-0.5" />
        )}

        {hasAnswer ? (
          // The answer runs wide: the advisor replies with tables and lists,
          // and the default 80% bubble cap would squeeze them.
          <Bubble variant="muted" className="max-w-full">
            <BubbleContent className="px-3.5 py-2.5">
              <Markdown content={turn.content} />
            </BubbleContent>
          </Bubble>
        ) : turn.streaming && turn.tools.length === 0 ? (
          <Bubble variant="muted">
            <BubbleContent>
              <span className="shimmer">{t('aiAdvisor.chat.thinking')}</span>
            </BubbleContent>
          </Bubble>
        ) : null}

        {turn.error && (
          <Alert variant="destructive" className="max-w-full">
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
}: {
  disabled?: boolean
  disabledReason?: string
  onPick: (prompt: string) => void
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
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t('aiAdvisor.chat.heading')}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        {t('aiAdvisor.chat.subheading')}
      </p>

      <div className="mt-8 flex w-full max-w-xl flex-col gap-6">
        {getSuggestionGroups(t).map((group) => (
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
                  className="rounded-full border border-border bg-card px-3.5 py-2 text-start text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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

  // Grow with the question, up to a point — past that the field scrolls
  // rather than swallowing the conversation above it.
  function resize(element: HTMLTextAreaElement | null) {
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 168)}px`
  }

  function submit() {
    const text = value.trim()
    if (!text || isStreaming || disabled) return
    onSend(text)
    setValue('')
    resize(ref.current)
  }

  return (
    <div className="shrink-0 px-4 pb-4 pt-2 sm:px-6">
      <form
        className="glass-popover mx-auto flex w-full max-w-3xl items-end gap-1.5 rounded-[1.75rem] border p-2 focus-within:border-primary/40 focus-within:ring-3 focus-within:ring-ring/25"
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
          onChange={(event) => {
            setValue(event.target.value)
            resize(event.currentTarget)
          }}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is how you write a second line.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          className={cn(
            'min-h-0 resize-none border-0 bg-transparent px-3 py-2 shadow-none',
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
            className="rounded-full"
          >
            <Square />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={disabled || !value.trim()}
            aria-label={t('aiAdvisor.chat.sendAriaLabel')}
            className="rounded-full"
          >
            <ArrowUp />
          </Button>
        )}
      </form>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
        {t('aiAdvisor.chat.composerHint')}
      </p>
    </div>
  )
}
