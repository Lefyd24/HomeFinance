import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { Select } from '../ui/Select'
import { useAccounts } from '../accounts/useAccounts'
import { useCategories } from '../categories/useCategories'
import * as importApi from './importApi'
import type { DateFormat, ImportColumns, ImportPreviewRow, UploadResult } from './importApi'
import { ImportFormatGuide } from './ImportFormatGuide'
import { ImportPreviewRows } from './ImportPreviewRows'
import { useConfirmImport, useImportPreview } from './useImport'

type Done = { count: number; accountName: string }

// Numeric examples need no translation and show the order at a glance.
const DATE_FORMAT_EXAMPLES: Record<DateFormat, string> = {
  dmy: '31/12/2026',
  mdy: '12/31/2026',
  ymd: '2026-12-31',
}

const COLUMN_FIELDS = ['date', 'description', 'amount', 'debit', 'credit'] as const

export function ImportWizardPage() {
  const { t } = useTranslation('import')
  // Deliberately no default: the user must say how their bank writes dates
  // before anything is parsed.
  const [dateFormat, setDateFormat] = useState<DateFormat | null>(null)
  const [columns, setColumns] = useState<ImportColumns>({})
  const [upload, setUpload] = useState<UploadResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const [chosenAccountId, setChosenAccountId] = useState<number | null>(null)
  const [invertSigns, setInvertSigns] = useState(false)
  const [included, setIncluded] = useState<Record<number, boolean>>({})
  const [categoryOverrides, setCategoryOverrides] = useState<Record<number, number | null>>({})

  const accountsQuery = useAccounts()
  const categoriesQuery = useCategories()
  const eligibleAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.is_active && !a.is_linked),
    [accountsQuery.data],
  )
  // With a single eligible account there is nothing to choose.
  const accountId = chosenAccountId ?? (eligibleAccounts.length === 1 ? eligibleAccounts[0].id : null)
  const account = eligibleAccounts.find((a) => a.id === accountId) ?? null

  const preview = useImportPreview(upload?.batch_id ?? null, accountId, invertSigns)
  const confirm = useConfirmImport()
  const rows = preview.data?.transactions ?? []

  const isIncluded = (row: ImportPreviewRow) => included[row.id] ?? !row.is_duplicate
  const categoryFor = (row: ImportPreviewRow) =>
    row.id in categoryOverrides ? categoryOverrides[row.id] : row.category_id
  const selectedRows = rows.filter(isIncluded)
  const duplicateCount = rows.filter((r) => r.is_duplicate).length

  function reset() {
    setUpload(null)
    setUploadError(null)
    setDone(null)
    setInvertSigns(false)
    setIncluded({})
    setCategoryOverrides({})
    confirm.reset()
  }

  async function handleFileSelected(file: File) {
    if (!dateFormat) return
    reset()
    setUploading(true)
    try {
      const named = Object.values(columns).some((value) => value?.trim())
      setUpload(
        await (named
          ? importApi.uploadImportFile(file, dateFormat, columns)
          : importApi.uploadImportFile(file, dateFormat)),
      )
    } catch (err) {
      setUploadError(err instanceof Error && err.message ? err.message : t('upload.failed'))
    } finally {
      setUploading(false)
    }
  }

  function handleConfirm() {
    if (!upload || !account || selectedRows.length === 0) return
    confirm.mutate(
      {
        batch_id: upload.batch_id,
        account_id: account.id,
        invert_signs: invertSigns,
        rows: selectedRows.map((row) => ({ row_id: row.id, category_id: categoryFor(row) })),
      },
      { onSuccess: (result) => setDone({ count: result.imported_count, accountName: account.name }) },
    )
  }

  if (done) {
    return (
      <PageContainer>
        <PageHeader title={t('title')} />
        <div className="glass-panel rounded-xl p-6 flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="text-primary" size={28} />
          <h2 className="font-medium text-foreground">{t('done.title', { count: done.count })}</h2>
          <p className="text-sm text-muted-foreground">{t('done.description', { account: done.accountName })}</p>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            <Button asChild>
              <Link to="/transactions">{t('done.viewTransactions')}</Link>
            </Button>
            <Button variant="outline" onClick={reset}>
              {t('done.another')}
            </Button>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('title')} description={t('description')} />

      {!upload && <ImportFormatGuide />}

      {!upload && (
        <fieldset className="glass-panel rounded-xl p-4 mb-4">
          <legend className="sr-only">{t('dateFormat.legend')}</legend>
          <p aria-hidden="true" className="font-medium text-foreground">
            {t('dateFormat.legend')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t('dateFormat.help')}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {importApi.DATE_FORMATS.map((format) => (
              <label
                key={format}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer',
                  dateFormat === format && 'border-primary bg-primary/5',
                )}
              >
                <input
                  type="radio"
                  name="import-date-format"
                  value={format}
                  checked={dateFormat === format}
                  onChange={() => setDateFormat(format)}
                  className="accent-primary"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{t(`dateFormat.${format}`)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{DATE_FORMAT_EXAMPLES[format]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {!upload && (
        <details className="glass-panel rounded-xl p-4 mb-4">
          <summary className="cursor-pointer font-medium text-foreground">{t('columns.title')}</summary>
          <p className="text-xs text-muted-foreground mt-2">{t('columns.help')}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {COLUMN_FIELDS.map((field) => (
              <div key={field} className="flex flex-col gap-1.5">
                <Label htmlFor={`import-column-${field}`}>{t(`columns.${field}`)}</Label>
                <Input
                  id={`import-column-${field}`}
                  value={columns[field] ?? ''}
                  onChange={(e) => setColumns((prev) => ({ ...prev, [field]: e.target.value }))}
                  placeholder={t('columns.auto')}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
        </details>
      )}

      {!upload && (
        <div className="mb-6">
          <Label
            htmlFor="import-file"
            className={cn(
              'glass-panel flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10',
              dateFormat ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
            )}
          >
            <Upload className="text-primary" size={22} />
            <span className="font-medium text-foreground">
              {uploading ? t('upload.uploading') : t('upload.choose')}
            </span>
            <span className="text-xs text-muted-foreground">
              {dateFormat ? t('upload.types') : t('upload.pickFormatFirst')}
            </span>
            <input
              id="import-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              disabled={uploading || !dateFormat}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void handleFileSelected(file)
              }}
            />
          </Label>
          {uploadError && (
            <p role="alert" className="text-destructive text-sm mt-3">
              {uploadError}
            </p>
          )}
        </div>
      )}

      {upload && (
        <div className="flex flex-col gap-4">
          <div className="glass-panel rounded-xl p-4 flex flex-col gap-4">
            <div>
              <h2 className="font-medium text-foreground">
                {t('review.title', { count: upload.total_rows, file: upload.filename })}
              </h2>
              {dateFormat && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('dateFormat.chosen', { format: t(`dateFormat.${dateFormat}`) })} ({DATE_FORMAT_EXAMPLES[dateFormat]})
                </p>
              )}
            </div>

            {eligibleAccounts.length === 0 && !accountsQuery.isLoading ? (
              <p className="text-sm text-destructive">{t('review.noAccounts')}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('review.account')}</Label>
                  <Select
                    value={accountId == null ? undefined : String(accountId)}
                    onValueChange={(value) => setChosenAccountId(Number(value))}
                    options={eligibleAccounts.map((a) => ({ value: String(a.id), label: a.name }))}
                    placeholder={t('review.accountPlaceholder')}
                  />
                </div>
                <div className="flex items-start gap-3">
                  <Switch
                    id="import-invert"
                    checked={invertSigns}
                    onCheckedChange={setInvertSigns}
                    aria-describedby="import-invert-help"
                  />
                  <div>
                    <Label htmlFor="import-invert">{t('review.invert')}</Label>
                    <p id="import-invert-help" className="text-xs text-muted-foreground mt-0.5">
                      {t('review.invertHelp')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {upload.skipped.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  {t('review.skipped', { count: upload.skipped.length })}
                </summary>
                <ul className="mt-2 pl-4 list-disc text-xs text-muted-foreground space-y-0.5">
                  {upload.skipped.map((s) => (
                    <li key={s.line}>{t(`review.skipReason.${s.reason}`, { line: s.line, value: s.value })}</li>
                  ))}
                </ul>
              </details>
            )}

            {duplicateCount > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {t('review.duplicatesNote', { count: duplicateCount })}
              </p>
            )}
          </div>

          {preview.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('review.loading')}</p>
          ) : (
            <ImportPreviewRows
              rows={rows}
              categories={categoriesQuery.data ?? []}
              currency={account?.currency ?? 'EUR'}
              isIncluded={isIncluded}
              categoryFor={categoryFor}
              onToggle={(rowId, value) => setIncluded((prev) => ({ ...prev, [rowId]: value }))}
              onToggleMany={(rowIds, value) =>
                setIncluded((prev) => ({ ...prev, ...Object.fromEntries(rowIds.map((id) => [id, value])) }))
              }
              onCategoryChange={(rowId, categoryId) =>
                setCategoryOverrides((prev) => ({ ...prev, [rowId]: categoryId }))
              }
            />
          )}

          {confirm.isError && (
            <p role="alert" className="text-destructive text-sm">
              {confirm.error instanceof Error && confirm.error.message
                ? confirm.error.message
                : t('review.confirmFailed')}
            </p>
          )}

          <div className="sticky bottom-0 -mx-4 pl-4 pr-20 py-3 bg-background/90 backdrop-blur flex flex-wrap gap-2 justify-end border-t sm:static sm:mx-0 sm:px-0 sm:bg-transparent sm:border-0">
            <Button variant="outline" onClick={reset} disabled={confirm.isPending}>
              {t('review.startOver')}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!account || selectedRows.length === 0 || confirm.isPending || preview.isFetching}
            >
              {confirm.isPending ? t('review.importing') : t('review.confirm', { count: selectedRows.length })}
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
