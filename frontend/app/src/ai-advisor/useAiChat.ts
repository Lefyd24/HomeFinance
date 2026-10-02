/**
 * Conversation state for the advisor.
 *
 * Holds the transcript, drives one streaming turn at a time, and records what
 * the advisor did **in the order it did it**. The transcript survives navigating
 * to another page and back — losing a long analysis because you clicked through
 * to Transactions to check something would be its own bug.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  AdvisorStreamError,
  streamChat,
  type ChatMessage,
  type ProfileUpdate,
  type Skill,
  type ToolCall,
  type TurnUsage,
} from './aiChatApi'

const STORAGE_KEY = 'ai-advisor:transcript'
const MODEL_STORAGE_KEY = 'ai-advisor:model'

function loadSelectedModel(): string | null {
  try {
    return window.localStorage.getItem(MODEL_STORAGE_KEY) || null
  } catch {
    return null
  }
}

/**
 * One thing that happened during an answer, in sequence.
 *
 * An answer is not a block of prose with a list of lookups bolted on top: the
 * advisor reasons, looks something up, writes about it, looks up the next thing.
 * Keeping the pieces in order lets the UI show that — a lookup appears between
 * the paragraph that motivated it and the paragraph that used its result, which
 * is where the reader expects it and what makes the reasoning followable.
 */
export type TurnSegment =
  | { kind: 'text'; id: string; content: string }
  | {
      kind: 'tool'
      id: string
      name: string
      state: 'running' | 'done'
      args?: Record<string, unknown>
    }
  | { kind: 'profile'; id: string; update: ProfileUpdate }
  // A skill the advisor switched on mid-answer, shown in the trail as "Using skill: …".
  | { kind: 'skill'; id: string; name: string; title: string }

export interface Turn {
  id: string
  role: 'user' | 'assistant'
  /**
   * The full prose of the turn. For an assistant turn this is every text
   * segment joined — kept alongside `segments` because the model's history, the
   * copy button and the markdown export all want the answer as one string.
   */
  content: string
  /** What happened, in order. Empty for user turns. */
  segments: TurnSegment[]
  /** Server-generated, appended after the answer. */
  disclaimer?: string
  /** Set when the turn failed; the partial answer above it is still shown. */
  error?: string
  streaming?: boolean
  /** The model that wrote this answer. Absent on transcripts saved before models were selectable. */
  model?: string
  /** What the answer cost. Absent on older transcripts and on turns that failed. */
  usage?: TurnUsage
  /** The model's context window, for the footer's fill indicator. */
  contextWindow?: number
  /** Skills active when the answer finished; echoed on the next request. Absent on older transcripts. */
  activeSkills?: string[]
}

/** The skill a leading "/command" in the message points at, if the server has one by that name. */
export function parseSlashCommand(text: string, skills: Skill[]): Skill | null {
  const match = /^\s*\/([A-Za-z0-9_-]+)(?=\s|$)/.exec(text)
  if (!match) return null
  const command = match[1].toLowerCase()
  return skills.find((skill) => skill.command?.toLowerCase() === command) ?? null
}

function lastActiveSkills(turns: Turn[]): string[] {
  const last = [...turns].reverse().find((turn) => turn.role === 'assistant')
  return last?.activeSkills ?? []
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Every tool the turn used, for callers that want them without the ordering. */
export function turnTools(turn: Turn): ToolCall[] {
  return turn.segments.filter((segment) => segment.kind === 'tool')
}

export function turnProfileUpdates(turn: Turn): ProfileUpdate[] {
  return turn.segments
    .filter((segment) => segment.kind === 'profile')
    .map((segment) => segment.update)
}

/**
 * Append streamed text to the turn, extending the trailing text segment when
 * there is one and starting a new one when a lookup interrupted the prose.
 */
function appendText(segments: TurnSegment[], text: string): TurnSegment[] {
  const last = segments[segments.length - 1]
  if (last?.kind === 'text') {
    return [...segments.slice(0, -1), { ...last, content: last.content + text }]
  }
  return [...segments, { kind: 'text', id: newId(), content: text }]
}

function formatAdvisorError(error: unknown, t: TFunction<'advisor'>): string {
  if (error instanceof AdvisorStreamError) {
    // A 422 / 429 carries the server's own explanation (unknown model, budget reached).
    if (error.detail) return error.detail
    if (error.code === 'unreachable') {
      return t('aiAdvisor.chat.unreachableError', { status: error.status ?? '?' })
    }
    return t('aiAdvisor.chat.emptyResponseError')
  }
  if (error instanceof Error) return error.message
  return t('aiAdvisor.chat.streamError')
}

/**
 * A transcript stored before segments existed, brought forward.
 *
 * Those turns recorded the tools as a flat list with no position, so the true
 * order is unrecoverable — the honest reconstruction puts the lookups first and
 * the prose after, which is exactly how they were displayed at the time.
 */
export function migrateTurn(turn: Turn & { tools?: ToolCall[]; profileUpdates?: ProfileUpdate[] }): Turn {
  const activeSkills = turn.role === 'assistant' ? (turn.activeSkills ?? []) : undefined
  if (Array.isArray(turn.segments)) return { ...turn, streaming: false, activeSkills }

  const segments: TurnSegment[] = [
    ...(turn.tools ?? []).map((tool) => ({
      kind: 'tool' as const,
      id: newId(),
      name: tool.name,
      state: 'done' as const,
      args: tool.args,
    })),
    ...(turn.content ? [{ kind: 'text' as const, id: newId(), content: turn.content }] : []),
    ...(turn.profileUpdates ?? []).map((update) => ({
      kind: 'profile' as const,
      id: newId(),
      update,
    })),
  ]
  return { ...turn, segments, streaming: false, activeSkills }
}

function loadTranscript(): Turn[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Anything still marked as streaming was interrupted by the reload.
    return (parsed as Turn[]).map(migrateTurn)
  } catch {
    return []
  }
}

export function useAiChat(defaultModel?: string, skills: Skill[] = []) {
  const { t } = useTranslation('advisor')
  const [turns, setTurns] = useState<Turn[]>(loadTranscript)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(loadSelectedModel)
  /** What the next question will be sent to: the user's pick, else the server default. */
  const model = selectedModel ?? defaultModel ?? null
  const modelRef = useRef(model)
  modelRef.current = model

  const skillsRef = useRef(skills)
  skillsRef.current = skills
  const [activeSkills, setActiveSkills] = useState<string[]>(() => lastActiveSkills(loadTranscript()))
  const activeSkillsRef = useRef(activeSkills)
  activeSkillsRef.current = activeSkills
  /** A model a just-loaded skill would rather run on; offered, never applied. */
  const [modelHint, setModelHint] = useState<{ model: string; skillTitle: string } | null>(null)

  const dismissSkill = useCallback((name: string) => {
    setActiveSkills((current) => current.filter((skill) => skill !== name))
  }, [])
  const dismissModelHint = useCallback(() => setModelHint(null), [])

  const selectModel = useCallback((id: string) => {
    setModelHint(null)
    setSelectedModel(id)
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, id)
    } catch {
      // Not remembering the choice is fine; it still applies for this session.
    }
  }, [])

  /**
   * The transcript as of right now. `send` builds the model's history from
   * this rather than from the `turns` it closed over, so retrying — which
   * trims the transcript and immediately re-sends — cannot replay the turns it
   * just dropped.
   */
  const turnsRef = useRef(turns)
  turnsRef.current = turns

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns))
    } catch {
      // A full or blocked session store should never break the conversation.
    }
  }, [turns])

  // Abandon an in-flight answer if the page goes away mid-stream.
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || abortRef.current) return

      // A leading "/command" switches that skill on for this request; the text
      // itself goes through unchanged.
      const slashSkill = parseSlashCommand(content, skillsRef.current)
      const requestSkills = Array.from(
        new Set([...activeSkillsRef.current, ...(slashSkill ? [slashSkill.name] : [])]),
      )
      if (slashSkill) setActiveSkills(requestSkills)
      setModelHint(null)

      const userTurn: Turn = { id: newId(), role: 'user', content, segments: [] }
      const answerId = newId()

      // The model needs the history, but only the roles and text — tool
      // bookkeeping is ours, not part of the conversation it sees.
      // A stopped or failed answer has no text and nothing for the model to read.
      const history: ChatMessage[] = [...turnsRef.current, userTurn]
        .filter((turn) => turn.content.trim())
        .map((turn) => ({ role: turn.role, content: turn.content }))

      setTurns((current) => [
        ...current,
        userTurn,
        { id: answerId, role: 'assistant', content: '', segments: [], streaming: true },
      ])
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      const patchAnswer = (patch: (turn: Turn) => Turn) =>
        setTurns((current) => current.map((turn) => (turn.id === answerId ? patch(turn) : turn)))

      try {
        await streamChat(
          history,
          (event) => {
            switch (event.type) {
              case 'token':
                patchAnswer((turn) => ({
                  ...turn,
                  content: turn.content + event.content,
                  segments: appendText(turn.segments, event.content),
                }))
                break
              case 'tool_call_start':
                patchAnswer((turn) => ({
                  ...turn,
                  segments: [
                    ...turn.segments,
                    {
                      kind: 'tool',
                      id: newId(),
                      name: event.tool,
                      state: 'running',
                      args: event.args,
                    },
                  ],
                }))
                break
              case 'tool_call_result':
                patchAnswer((turn) => {
                  // Settle the most recent still-running call of that name:
                  // the same tool can legitimately be used more than once in a
                  // turn, and settling the first would leave a later one
                  // spinning forever.
                  const index = turn.segments.findLastIndex(
                    (segment) =>
                      segment.kind === 'tool' &&
                      segment.name === event.tool &&
                      segment.state === 'running',
                  )
                  if (index === -1) return turn
                  const segments = [...turn.segments]
                  segments[index] = { ...(segments[index] as TurnSegment & { kind: 'tool' }), state: 'done' }
                  return { ...turn, segments }
                })
                break
              case 'reasoning':
                // Reasoning deltas are not shown; the answer itself is what matters.
                break
              case 'done':
                patchAnswer((turn) => {
                  // `content` here is only the final round's prose, so it must
                  // not replace what already streamed — it is a fallback for
                  // the case where no token events arrived at all.
                  const hasText = turn.segments.some((segment) => segment.kind === 'text')
                  const segments =
                    !hasText && event.content
                      ? appendText(turn.segments, event.content)
                      : turn.segments
                  return {
                    ...turn,
                    content: turn.content || event.content || '',
                    segments: segments.map((segment) =>
                      segment.kind === 'tool' ? { ...segment, state: 'done' } : segment,
                    ),
                    streaming: false,
                    model: event.model ?? turn.model,
                    usage: event.usage ?? turn.usage,
                    contextWindow: event.context_window ?? turn.contextWindow,
                    activeSkills: event.active_skills ?? turn.activeSkills,
                  }
                })
                if (event.active_skills) setActiveSkills(event.active_skills)
                break
              case 'profile_update':
                patchAnswer((turn) => ({
                  ...turn,
                  segments: [
                    ...turn.segments,
                    {
                      kind: 'profile',
                      id: newId(),
                      update: { changes: event.changes, reason: event.reason },
                    },
                  ],
                }))
                break
              case 'skill_loaded':
                setActiveSkills((current) =>
                  current.includes(event.name) ? current : [...current, event.name],
                )
                if (event.suggested_model && event.suggested_model !== modelRef.current) {
                  setModelHint({ model: event.suggested_model, skillTitle: event.title })
                }
                patchAnswer((turn) => ({
                  ...turn,
                  segments: [
                    ...turn.segments,
                    { kind: 'skill', id: newId(), name: event.name, title: event.title },
                  ],
                }))
                break
              case 'disclaimer':
                patchAnswer((turn) => ({ ...turn, disclaimer: event.text }))
                break
              case 'error':
                patchAnswer((turn) => ({
                  ...turn,
                  error: event.message || t('aiAdvisor.chat.genericError'),
                  streaming: false,
                }))
                break
            }
          },
          controller.signal,
          modelRef.current,
          requestSkills,
        )
      } catch (error) {
        const stopped = controller.signal.aborted
        patchAnswer((turn) => ({
          ...turn,
          streaming: false,
          error: stopped
            ? undefined
            : formatAdvisorError(error, t),
        }))
      } finally {
        abortRef.current = null
        setIsStreaming(false)
        // However the turn ended — finished, failed or stopped — nothing may be
        // left spinning.
        patchAnswer((turn) => ({
          ...turn,
          streaming: false,
          segments: turn.segments.map((segment) =>
            segment.kind === 'tool' ? { ...segment, state: 'done' } : segment,
          ),
        }))
      }
    },
    [t],
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setTurns([])
    setActiveSkills([])
    setModelHint(null)
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing to do — the in-memory transcript is already empty.
    }
  }, [])

  /** Re-ask the last question, dropping the answer that came back. */
  const retry = useCallback(() => {
    const current = turnsRef.current
    const lastUser = [...current].reverse().find((turn) => turn.role === 'user')
    if (!lastUser || abortRef.current) return

    const trimmed = current.slice(0, current.findIndex((turn) => turn.id === lastUser.id))
    turnsRef.current = trimmed
    setTurns(trimmed)
    setActiveSkills(lastActiveSkills(trimmed))
    activeSkillsRef.current = lastActiveSkills(trimmed)
    void send(lastUser.content)
  }, [send])

  return {
    turns,
    isStreaming,
    send,
    stop,
    clear,
    retry,
    model,
    selectModel,
    skills,
    activeSkills,
    dismissSkill,
    modelHint: modelHint && modelHint.model !== model ? modelHint : null,
    dismissModelHint,
  }
}
