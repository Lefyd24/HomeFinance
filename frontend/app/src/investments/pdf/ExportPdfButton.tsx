import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Pdf02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/**
 * The one "Export PDF" affordance, shared by the comparison and research pages.
 *
 * Disabled while a render is in flight rather than hidden — the label switches
 * to "Preparing…" so the wait is explained where the click happened, not only
 * in the toast.
 */
export function ExportPdfButton({
  onExport,
  isExporting,
  disabled = false,
}: {
  onExport: () => void
  isExporting: boolean
  disabled?: boolean
}) {
  const { t } = useTranslation('investments')
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onExport}
      disabled={disabled || isExporting}
      aria-busy={isExporting}
    >
      {isExporting ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <HugeiconsIcon icon={Pdf02Icon} strokeWidth={2} data-icon="inline-start" />
      )}
      {isExporting ? t('pdf.exporting') : t('pdf.exportAction')}
    </Button>
  )
}
