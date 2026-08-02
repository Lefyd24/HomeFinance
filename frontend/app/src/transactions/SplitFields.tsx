import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Select } from '../ui/Select'

export interface SplitPartDraft {
  amount: string
  categoryId: string
}

/** Cents, so 0.1 + 0.2 never lands at 0.30000000000000004. */
export function toCents(value: string): number {
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

export function splitRemainderCents(parts: SplitPartDraft[], totalCents: number): number {
  return totalCents - parts.reduce((sum, part) => sum + toCents(part.amount), 0)
}

/**
 * Editor for breaking one transaction into parts.
 *
 * A bank reports a single charge, but the money can belong to several
 * categories — and the amount of a synced transaction cannot be edited, because
 * the next sync would contradict it. Splitting is the sanctioned way to
 * categorise the pieces without inventing transactions the bank never reported.
 *
 * The parts must add up to the original exactly; the running remainder is shown
 * so that is obvious before submitting rather than after a rejected request.
 */
export function SplitFields({
  parts,
  onChange,
  totalCents,
  categoryOptions,
  currency,
}: {
  parts: SplitPartDraft[]
  onChange: (parts: SplitPartDraft[]) => void
  totalCents: number
  categoryOptions: Array<{ value: string; label: string }>
  currency: string
}) {
  const { t } = useTranslation('transactions')
  const remainder = splitRemainderCents(parts, totalCents)
  const balanced = remainder === 0

  function update(index: number, patch: Partial<SplitPartDraft>) {
    onChange(parts.map((part, i) => (i === index ? { ...part, ...patch } : part)))
  }

  function addPart() {
    // Seed the new row with whatever is still unallocated — usually exactly
    // what the user was about to type.
    const seed = remainder > 0 ? (remainder / 100).toFixed(2) : ''
    onChange([...parts, { amount: seed, categoryId: '' }])
  }

  function removePart(index: number) {
    onChange(parts.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      {parts.map((part, index) => (
        <div key={index} className="flex items-end gap-2">
          <div className="w-28 shrink-0">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`split-amount-${index}`}>
              {t('form.split.amount')}
            </label>
            <Input
              id={`split-amount-${index}`}
              type="text"
              inputMode="decimal"
              value={part.amount}
              onChange={(event) => update(index, { amount: event.target.value })}
              className="tabular-nums"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">
              {t('form.split.category')}
            </label>
            <Select
              value={part.categoryId}
              onValueChange={(value) => update(index, { categoryId: value })}
              options={categoryOptions}
              placeholder={t('form.split.uncategorised')}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            // Two parts is the minimum that still counts as a split.
            disabled={parts.length <= 2}
            aria-label={t('form.split.remove')}
            onClick={() => removePart(index)}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addPart}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          {t('form.split.addPart')}
        </Button>
        <span
          className={cn(
            'text-xs font-medium tabular-nums',
            balanced ? 'text-flow-in' : 'text-destructive',
          )}
        >
          {balanced
            ? t('form.split.balanced')
            : t('form.split.remaining', {
                amount: (remainder / 100).toFixed(2),
                currency,
              })}
        </span>
      </div>
    </div>
  )
}
