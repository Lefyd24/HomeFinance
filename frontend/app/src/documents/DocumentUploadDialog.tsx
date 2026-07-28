import { useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { FileUp } from 'lucide-react'
import { FileImportIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Dialog } from '../ui/Dialog'
import { cn } from '@/lib/utils'
import { FolderPicker } from './FolderPicker'
import { fileTypeMeta } from './fileTypeMeta'
import { useDocumentFolders, useUploadDocument } from './useDocuments'

const MAX_SIZE = 50 * 1024 * 1024
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip'

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

interface DocumentUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-selects the folder the user was browsing when they clicked Upload. */
  defaultFolder?: string
}

export function DocumentUploadDialog({
  open,
  onOpenChange,
  defaultFolder = '',
}: DocumentUploadDialogProps) {
  const { data: foldersData } = useDocumentFolders()
  const uploadDocument = useUploadDocument()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [folder, setFolder] = useState(defaultFolder)
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  function reset() {
    setFile(null)
    setTitle('')
    setDescription('')
    setFolder(defaultFolder)
    setFileError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function pickFile(candidate: File) {
    if (candidate.size > MAX_SIZE) {
      setFileError('File exceeds the 50 MB limit.')
      return
    }
    setFileError(null)
    setFile(candidate)
    if (!title) setTitle(candidate.name.replace(/\.[^/.]+$/, ''))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || !title.trim()) return
    try {
      await uploadDocument.mutateAsync({
        file,
        input: { title: title.trim(), description: description.trim(), folder },
      })
      toast.success('Document uploaded')
      handleOpenChange(false)
    } catch {
      toast.error('Failed to upload document')
    }
  }

  const formId = 'document-upload-form'
  const preview = file ? fileTypeMeta(file.type, file.name) : null

  return (
    <Dialog
      open={open}
      title="Upload document"
      description="PDF, images, Word, Excel, and text files up to 50 MB."
      icon={FileImportIcon}
      onOpenChange={handleOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={!file || !title.trim() || uploadDocument.isPending}>
            {uploadDocument.isPending && <Spinner data-icon="inline-start" />}
            Upload
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const dropped = e.dataTransfer.files?.[0]
                if (dropped) pickFile(dropped)
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
            >
              {file && preview ? (
                <>
                  <div className={cn('flex size-12 items-center justify-center rounded-lg', preview.className)}>
                    <preview.icon size={22} />
                  </div>
                  <p className="max-w-xs truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </>
              ) : (
                <>
                  <FileUp size={32} className="text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Drop a file here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    PDF, JPG, PNG, DOCX, XLSX, TXT, CSV…
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept={ACCEPT}
              onChange={(e) => {
                const picked = e.target.files?.[0]
                if (picked) pickFile(picked)
                e.target.value = ''
              }}
            />
            <FieldError>{fileError}</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor="doc-title">
              Title <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Bank Agreement March 2026"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="doc-description">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </FieldLabel>
            <Textarea
              id="doc-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief note about this document…"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="doc-folder">Folder</FieldLabel>
            <FolderPicker value={folder} onChange={setFolder} folders={foldersData?.folders ?? []} />
          </Field>
        </FieldGroup>
      </form>
    </Dialog>
  )
}
