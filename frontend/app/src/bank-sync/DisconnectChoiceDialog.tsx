import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, Unlink01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Dialog } from '../ui/Dialog'

export type DisconnectChoice = 'keep' | 'delete'

/** What is being detached — a whole bank, or one of its accounts. */
export type DisconnectTarget =
  | { kind: 'bank'; connectionId: number; name: string; accountCount: number }
  | { kind: 'account'; accountId: number; name: string }

/**
 * Second step of disconnecting: what happens to the data.
 *
 * Deliberately not a confirm dialog. There are three outcomes here — keep,
 * delete, or back out — and a yes/no prompt would have to encode "delete
 * everything" as the yes, which is exactly the sort of ambiguity that gets a
 * year of transactions thrown away by someone clicking through.
 *
 * Shared by both scopes so the two paths cannot drift apart in wording or in
 * which option is styled as destructive.
 */
export function DisconnectChoiceDialog({
  target,
  onChoose,
  onCancel,
}: {
  target: DisconnectTarget | null
  onChoose: (choice: DisconnectChoice) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('bankSync')
  const isBank = target?.kind === 'bank'
  const count = target?.kind === 'bank' ? target.accountCount : 1

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
      title={t('disconnectChoice.title', { name: target?.name ?? '' })}
      description={
        isBank
          ? t('disconnectChoice.descriptionBank', { count })
          : t('disconnectChoice.descriptionAccount')
      }
      icon={Unlink01Icon}
      tone="warning"
    >
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onChoose('keep')}
          className="flex items-start gap-3 rounded-lg border border-border p-3 text-start transition-colors hover:bg-muted/60"
        >
          <HugeiconsIcon
            icon={Unlink01Icon}
            strokeWidth={2}
            className="mt-0.5 size-5 shrink-0 text-flow-in"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              {isBank
                ? t('disconnectChoice.keep.titleBank')
                : t('disconnectChoice.keep.titleAccount')}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t('disconnectChoice.keep.description')}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onChoose('delete')}
          className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-start transition-colors hover:bg-destructive/10"
        >
          <HugeiconsIcon
            icon={Delete02Icon}
            strokeWidth={2}
            className="mt-0.5 size-5 shrink-0 text-destructive"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-destructive">
              {isBank
                ? t('disconnectChoice.delete.titleBank', { count })
                : t('disconnectChoice.delete.titleAccount')}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t('disconnectChoice.delete.description')}
            </span>
          </span>
        </button>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {t('disconnectChoice.cancel')}
        </Button>
      </div>
    </Dialog>
  )
}
