/**
 * Turn a conversation into a Markdown document.
 *
 * The export keeps the lookups in place rather than stripping them to prose.
 * An answer about your money is worth what the data behind it is worth, so a
 * saved copy that dropped "this came from your actual positions on 17 August"
 * would be a weaker document than what you read on screen.
 */
import type { TFunction } from 'i18next'

import { profileFieldLabel, profileValueText, toolLabel, toolSubject } from './aiAdvisorLabels'
import type { Turn } from './useAiChat'

function formatTimestamp(date: Date): string {
  // Locale-formatted for the reader, since this is a document, not a filename.
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** `ai-advisor-2026-08-17-1432.md` — sorts chronologically in a file listing. */
export function conversationFilename(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    'ai-advisor-',
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    '.md',
  ].join('')
}

export function conversationToMarkdown(
  turns: Turn[],
  t: TFunction<'advisor'>,
  now = new Date(),
): string {
  const lines: string[] = [
    `# ${t('aiAdvisor.export.title')}`,
    '',
    `_${t('aiAdvisor.export.exportedAt', { when: formatTimestamp(now) })}_`,
    '',
  ]

  for (const turn of turns) {
    if (turn.role === 'user') {
      lines.push('---', '', `## ${t('aiAdvisor.export.you')}`, '', turn.content.trim(), '')
      continue
    }

    lines.push(`## ${t('aiAdvisor.export.advisor')}`, '')

    for (const segment of turn.segments) {
      if (segment.kind === 'text') {
        const text = segment.content.trim()
        if (text) lines.push(text, '')
        continue
      }

      if (segment.kind === 'tool') {
        const subject = toolSubject(segment.args)
        // Blockquoted so a lookup reads as an aside in the reasoning rather
        // than as something the advisor asserted.
        lines.push(
          `> 🔍 ${toolLabel(segment.name, t)}${subject ? ` · ${subject}` : ''}`,
          '',
        )
        continue
      }

      const changes = segment.update.changes
        .map(
          (change) =>
            `${profileFieldLabel(change.field, t)}: ${profileValueText(change.old_value, t)} → ${profileValueText(change.new_value, t)}`,
        )
        .join('; ')
      lines.push(`> ✏️ **${t('aiAdvisor.profileUpdate.title')}** — ${changes}`)
      if (segment.update.reason) lines.push(`> _${segment.update.reason}_`)
      lines.push('')
    }

    if (turn.error) {
      lines.push(`> ⚠️ ${turn.error}`, '')
    }

    if (turn.disclaimer) {
      lines.push(`_${turn.disclaimer}_`, '')
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

/** Hand the markdown to the browser as a download. */
export function downloadConversation(markdown: string, filename: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the navigation to have been picked up.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
