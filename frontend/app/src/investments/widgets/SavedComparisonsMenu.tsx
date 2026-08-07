import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, FavouriteIcon, FloppyDiskIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog } from '../../ui/Dialog'
import {
  useCreateSavedComparison,
  useDeleteSavedComparison,
  useSavedComparisons,
} from '../useComparison'
import type { ComparisonPeriod, SavedComparison } from '../comparisonApi'

/**
 * The two saved-comparison affordances, grouped into one control so the page
 * header has a single, deliberate cluster on its right — a bookmark list and
 * a save action — rather than the header trailing off into empty space next
 * to the title.
 */
export function SavedComparisonsControl({
  symbols,
  benchmark,
  period,
  onLoad,
}: {
  symbols: string[]
  benchmark: string | null
  period: ComparisonPeriod
  onLoad: (saved: SavedComparison) => void
}) {
  const { t } = useTranslation('investments')
  const [saveOpen, setSaveOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [name, setName] = useState('')

  const { data: saved } = useSavedComparisons()
  const createSaved = useCreateSavedComparison()
  const deleteSaved = useDeleteSavedComparison()

  function submitSave() {
    const trimmed = name.trim()
    if (!trimmed || symbols.length < 2) return
    createSaved.mutate(
      { name: trimmed, symbols, benchmark, period },
      {
        onSuccess: () => {
          toast.success(t('compare.saveDialog.toasts.saved'))
          setSaveOpen(false)
          setName('')
        },
        onError: () => toast.error(t('compare.saveDialog.toasts.saveFailed')),
      },
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={listOpen} onOpenChange={setListOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <HugeiconsIcon icon={FavouriteIcon} strokeWidth={2} className="size-4" />
            <span className="hidden sm:inline">{t('compare.saved.title')}</span>
            {saved && saved.length > 0 && (
              <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary/12 text-[0.65rem] font-semibold text-primary tabular-nums">
                {saved.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="flex flex-col gap-1">
            <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {t('compare.saved.title')}
            </p>
            {!saved || saved.length === 0 ? (
              <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                {t('compare.saved.empty')}
              </p>
            ) : (
              <ul className="flex flex-col">
                {saved.map((entry) => (
                  <li
                    key={entry.id}
                    className="group flex items-center gap-1 rounded-md px-1 py-1 hover:bg-muted/60"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onLoad(entry)
                        setListOpen(false)
                      }}
                      className="min-w-0 flex-1 rounded-sm px-1.5 py-1 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block truncate text-sm font-medium">{entry.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {entry.symbols.join(' · ')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSaved.mutate(entry.id)}
                      aria-label={t('compare.saved.delete', { name: entry.name })}
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-flow-out/10 hover:text-flow-out focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={symbols.length < 2}
        onClick={() => setSaveOpen(true)}
      >
        <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} className="size-4" />
        <span className="hidden sm:inline">{t('compare.saveDialog.trigger')}</span>
      </Button>

      <Dialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title={t('compare.saveDialog.title')}
        description={t('compare.saveDialog.description')}
        icon={FloppyDiskIcon}
        size="md"
        footer={
          <Button onClick={submitSave} disabled={!name.trim() || createSaved.isPending}>
            {createSaved.isPending ? t('compare.saveDialog.saving') : t('compare.saveDialog.save')}
          </Button>
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="save-comparison-name">{t('compare.saveDialog.nameLabel')}</Label>
          <Input
            id="save-comparison-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('compare.saveDialog.namePlaceholder', { symbols: symbols.join(' vs ') })}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSave()
            }}
          />
        </div>
      </Dialog>
    </div>
  )
}
