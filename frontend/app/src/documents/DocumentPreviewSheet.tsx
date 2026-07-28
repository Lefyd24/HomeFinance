import { Download, PencilLine, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { fileTypeMeta } from './fileTypeMeta'
import * as documentsApi from './documentsApi'
import type { DocumentItem } from './documentsApi'
import { formatDate } from '../lib/format'

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

interface DocumentPreviewSheetProps {
  document: DocumentItem | null
  onOpenChange: (open: boolean) => void
  onEdit: (document: DocumentItem) => void
  onDelete: (document: DocumentItem) => void
}

export function DocumentPreviewSheet({
  document,
  onOpenChange,
  onEdit,
  onDelete,
}: DocumentPreviewSheetProps) {
  const meta = document ? fileTypeMeta(document.mime_type, document.filename) : null

  return (
    <Sheet open={!!document} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg" side="right">
        {document && meta && (
          <>
            <SheetHeader className="flex-row items-start gap-3 border-b pe-12">
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', meta.className)}>
                <meta.icon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate">{document.title}</SheetTitle>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatBytes(document.size)} · {formatDate(document.uploaded_at)}
                  {document.folder && ` · ${document.folder}`}
                </p>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex min-h-64 items-center justify-center bg-muted/40">
                {meta.kind === 'image' ? (
                  <img
                    src={documentsApi.getPreviewUrl(document.id)}
                    alt={document.title}
                    className="max-h-[60vh] w-full object-contain"
                  />
                ) : meta.kind === 'pdf' ? (
                  <iframe
                    src={documentsApi.getPreviewUrl(document.id)}
                    title={document.title}
                    className="h-[60vh] w-full border-0"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 py-16">
                    <span className={cn('flex size-16 items-center justify-center rounded-2xl', meta.className)}>
                      <meta.icon size={30} />
                    </span>
                    <p className="text-sm text-muted-foreground">No inline preview for this file type</p>
                  </div>
                )}
              </div>

              {document.description && (
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Description
                  </p>
                  <p className="mt-1 text-sm text-foreground">{document.description}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                <Badge variant="outline">{document.filename}</Badge>
                {document.folder && <Badge variant="outline">{document.folder}</Badge>}
              </div>
            </div>

            <SheetFooter className="flex-row border-t pt-4">
              <Button asChild className="flex-1">
                <a href={documentsApi.getDownloadUrl(document.id)}>
                  <Download data-icon="inline-start" />
                  Download
                </a>
              </Button>
              <Button variant="outline" size="icon" onClick={() => onEdit(document)} aria-label="Edit">
                <PencilLine />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => onDelete(document)}
                aria-label="Delete"
              >
                <Trash2 />
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
