import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Undo2, UserPen } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useInvestorProfileRevisions, useUndoInvestorProfileRevision } from
  '../account-settings/useInvestorProfile'
import { profileFieldLabel, profileValueText } from './aiAdvisorLabels'
import type { ProfileUpdate } from './aiChatApi'

/**
 * What the advisor changed about you, shown where it happened.
 *
 * The profile governs every future answer, so a change to it is the one thing
 * the advisor does that outlives the conversation. It is never applied silently:
 * the change, the advisor's stated reason, and a one-click undo all appear
 * inline, so the user stays the author of their own profile.
 */
export function ProfileUpdateCard({
  update,
  className,
}: {
  update: ProfileUpdate
  className?: string
}) {
  const { t } = useTranslation('advisor')
  const { data: revisions } = useInvestorProfileRevisions()
  const undo = useUndoInvestorProfileRevision()
  const [undoneFields, setUndoneFields] = useState<string[]>([])

  if (update.changes.length === 0) return null

  /**
   * Match each change to its revision row so undo has an id to act on. The
   * events carry the change, not the revision id, so the newest not-yet-undone
   * revision for that field is the one this card is about.
   */
  const revisionIdFor = (field: string) =>
    revisions?.find((revision) => revision.field === field && !revision.undone_at)?.id

  return (
    <div
      className={cn(
        // bg-background, not bg-muted: this now renders inside the muted answer
        // bubble, where a muted card would disappear into its surroundings.
        'rounded-lg border border-border/60 bg-background/70 px-3 py-2.5 text-xs',
        className,
      )}
    >
      <div className="flex items-center gap-2 font-medium text-foreground">
        <UserPen className="size-3.5 shrink-0" aria-hidden />
        <span>{t('aiAdvisor.profileUpdate.title')}</span>
      </div>

      <ul className="mt-2 flex flex-col gap-1.5">
        {update.changes.map((change) => {
          const revisionId = revisionIdFor(change.field)
          const isUndone = undoneFields.includes(change.field)
          return (
            <li key={change.field} className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">
                {profileFieldLabel(change.field, t)}:
              </span>
              <span className={cn('text-muted-foreground', isUndone && 'line-through')}>
                {profileValueText(change.old_value, t)}
              </span>
              <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className={cn('font-medium text-foreground', isUndone && 'line-through')}>
                {profileValueText(change.new_value, t)}
              </span>

              {isUndone ? (
                <span className="text-muted-foreground">{t('aiAdvisor.profileUpdate.undone')}</span>
              ) : revisionId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  disabled={undo.isPending}
                  onClick={() =>
                    undo.mutate(revisionId, {
                      onSuccess: () => setUndoneFields((current) => [...current, change.field]),
                    })
                  }
                >
                  <Undo2 className="size-3" aria-hidden />
                  {t('aiAdvisor.profileUpdate.undo')}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>

      {update.reason ? (
        <p className="mt-2 text-muted-foreground italic">“{update.reason}”</p>
      ) : null}
    </div>
  )
}
