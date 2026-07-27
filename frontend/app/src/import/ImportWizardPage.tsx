import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { ListCard } from '../ui/ListCard'
import { formatCurrency } from '../lib/format'
import * as importApi from './importApi'
import type { ImportPreview } from './importApi'

export function ImportWizardPage() {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFileSelected(file: File) {
    setError(null)
    setUploading(true)
    try {
      const { batch_id } = await importApi.uploadImportFile(file)
      const previewData = await importApi.getImportPreview(batch_id)
      setPreview(previewData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Import Transactions"
        description="Upload a CSV or Excel bank export to preview rows before importing."
      />

      <div className="mb-6">
        <Label
          htmlFor="import-file"
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-10 cursor-pointer hover:bg-muted/40 transition-colors"
        >
          <Upload className="text-primary" size={22} />
          <span className="font-medium text-foreground">
            {uploading ? 'Uploading…' : 'Choose file'}
          </span>
          <span className="text-xs text-muted-foreground">CSV, XLSX, or XLS</span>
          <input
            id="import-file"
            type="file"
            accept=".csv,.xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFileSelected(file)
            }}
          />
        </Label>
      </div>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {!preview && !uploading && !error && (
        <EmptyState
          icon={Upload}
          title="No file selected"
          description="Choose a bank export to see a transaction preview."
        />
      )}

      {preview && (
        <ul className="flex flex-col gap-2">
          {preview.transactions.map((row, i) => (
            <ListCard key={row.id ?? i} className="flex items-center justify-between gap-3 py-3">
              <span className="truncate text-foreground">{row.description}</span>
              <span className="tabular-nums shrink-0">{formatCurrency(row.amount)}</span>
            </ListCard>
          ))}
        </ul>
      )}

      {preview && preview.transactions.length === 0 && (
        <EmptyState title="No rows in preview" description="The file uploaded but contained no transactions." />
      )}

      {preview && (
        <p className="text-xs text-muted-foreground mt-4">
          Preview only — confirm/import step comes in a follow-up.
        </p>
      )}

      {preview && (
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => {
            setPreview(null)
            setError(null)
          }}
        >
          Clear preview
        </Button>
      )}
    </PageContainer>
  )
}
