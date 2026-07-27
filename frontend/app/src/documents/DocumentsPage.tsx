import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { ListCard } from '../ui/ListCard'
import * as documentsApi from './documentsApi'

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentsPage() {
  const queryClient = useQueryClient()
  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: documentsApi.listDocuments,
  })
  const isEmpty = !isLoading && (documents?.length ?? 0) === 0

  async function handleUpload(file: File) {
    await documentsApi.uploadDocument(file)
    await queryClient.invalidateQueries({ queryKey: ['documents'] })
  }

  return (
    <PageContainer>
      <PageHeader
        title="Documents"
        description="Upload and download personal finance files."
        action={
          <div>
            <Button size="sm" asChild>
              <Label htmlFor="doc-upload" className="cursor-pointer">
                Upload
              </Label>
            </Button>
            <input
              id="doc-upload"
              type="file"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
                e.target.value = ''
              }}
            />
          </div>
        }
      />

      {isLoading && <p className="text-muted-foreground">Loading documents…</p>}

      {isEmpty && (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload PDFs, images, or spreadsheets to keep them with your finances."
        />
      )}

      <ul className="flex flex-col gap-2">
        {documents?.map((doc) => (
          <ListCard key={doc.id} className="flex items-center gap-3 py-3">
            <FileText size={20} className="text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-foreground">{doc.title || doc.filename}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(doc.size)}</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href={documentsApi.getDownloadUrl(doc.id)}>Download</a>
            </Button>
          </ListCard>
        ))}
      </ul>
    </PageContainer>
  )
}
