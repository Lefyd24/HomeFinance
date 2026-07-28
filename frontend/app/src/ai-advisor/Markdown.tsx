import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { cn } from '@/lib/utils'

/**
 * Renders the advisor's answer.
 *
 * The model replies in markdown and leans on tables for anything numeric, so
 * rendering it properly is not a nicety — a monthly breakdown as raw pipes is
 * unreadable. Everything is sanitised before it reaches the DOM: this is
 * model output shaped by the user's own transaction descriptions, and neither
 * is trusted.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => {
    const parsed = marked.parse(content, { breaks: true, gfm: true, async: false })
    return DOMPurify.sanitize(parsed as string, { USE_PROFILES: { html: true } })
  }, [content])

  return (
    <div
      className={cn(
        'text-sm leading-relaxed',
        // Spacing between blocks, but never above the first or below the last —
        // the bubble already owns its padding.
        '[&>*]:my-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        '[&_p]:leading-relaxed',
        '[&_strong]:font-semibold',
        '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:ps-5 [&_ol]:ps-5 [&_li]:my-1',
        '[&_h1]:font-heading [&_h2]:font-heading [&_h3]:font-heading',
        '[&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm',
        '[&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold',
        '[&_a]:underline [&_a]:underline-offset-2',
        '[&_code]:rounded [&_code]:bg-foreground/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
        '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-foreground/10 [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_blockquote]:border-s-2 [&_blockquote]:border-current/25 [&_blockquote]:ps-3 [&_blockquote]:opacity-80',
        // Tables scroll inside the bubble rather than stretching it.
        '[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs',
        '[&_th]:border-b [&_th]:border-current/20 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-start [&_th]:font-semibold',
        '[&_td]:border-b [&_td]:border-current/10 [&_td]:px-2 [&_td]:py-1.5',
        '[&_td]:tabular-nums',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
