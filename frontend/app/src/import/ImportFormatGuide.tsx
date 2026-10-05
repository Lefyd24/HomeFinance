import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadImportTemplate } from './importTemplate'

const COLUMN_KEYS = ['date', 'description', 'amount', 'debitCredit'] as const
const NOTE_KEYS = ['header', 'dates', 'amounts', 'linked'] as const

export function ImportFormatGuide() {
  const { t } = useTranslation('import')
  return (
    <section aria-labelledby="import-format-title" className="glass-panel rounded-xl p-4 sm:p-5 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="import-format-title" className="font-medium text-foreground">
            {t('guide.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('guide.intro')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadImportTemplate}>
          <Download size={16} />
          {t('guide.template')}
        </Button>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {COLUMN_KEYS.map((key) => (
          <div key={key}>
            <dt className="text-sm font-medium text-foreground">{t(`guide.columns.${key}.label`)}</dt>
            <dd className="text-xs text-muted-foreground mt-0.5">{t(`guide.columns.${key}.help`)}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-4 list-disc pl-5 text-xs text-muted-foreground space-y-1">
        {NOTE_KEYS.map((key) => (
          <li key={key}>{t(`guide.notes.${key}`)}</li>
        ))}
      </ul>
    </section>
  )
}
