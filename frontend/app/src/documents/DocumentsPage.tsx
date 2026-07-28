import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  FileText,
  Folder,
  FolderPlus,
  Grid2x2,
  List,
  MoreVertical,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { useConfirm } from '../ui/useConfirm'
import { cn } from '@/lib/utils'
import { formatDate } from '../lib/format'
import { fileTypeMeta } from './fileTypeMeta'
import type { DocumentItem } from './documentsApi'
import {
  useCreateFolder,
  useDeleteDocument,
  useDeleteFolder,
  useDocumentFolders,
  useDocuments,
} from './useDocuments'
import { DocumentUploadDialog } from './DocumentUploadDialog'
import { DocumentEditDialog } from './DocumentEditDialog'
import { DocumentPreviewSheet } from './DocumentPreviewSheet'

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

type ViewMode = 'grid' | 'list'

export function DocumentsPage() {
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>('grid')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null)
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null)
  const [addingFolder, setAddingFolder] = useState(false)
  const [folderDraft, setFolderDraft] = useState('')
  const folderInputRef = useRef<HTMLInputElement>(null)

  const { confirm, confirmDialog } = useConfirm()

  const { data: documents, isLoading } = useDocuments(
    selectedFolder ? { folder: selectedFolder } : {},
  )
  const { data: foldersData, isLoading: foldersLoading } = useDocumentFolders()
  const deleteDocument = useDeleteDocument()
  const createFolder = useCreateFolder()
  const deleteFolderMutation = useDeleteFolder()

  const filtered = useMemo(() => {
    if (!documents) return []
    const q = search.trim().toLowerCase()
    if (!q) return documents
    return documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.description.toLowerCase().includes(q) ||
        doc.filename.toLowerCase().includes(q),
    )
  }, [documents, search])

  const folders = foldersData?.folders ?? []
  const totalCount = foldersData?.total ?? documents?.length ?? 0

  async function handleDeleteDoc(doc: DocumentItem) {
    const ok = await confirm({
      title: `Delete "${doc.title}"?`,
      description: 'This permanently removes the file. This cannot be undone.',
      confirmLabel: 'Delete document',
    })
    if (!ok) return
    try {
      await deleteDocument.mutateAsync(doc.id)
      toast.success('Document deleted')
      if (previewDoc?.id === doc.id) setPreviewDoc(null)
    } catch {
      toast.error('Failed to delete document')
    }
  }

  async function handleDeleteFolder(name: string) {
    const ok = await confirm({
      title: `Delete folder "${name}"?`,
      description: 'Documents inside move to "All documents" — nothing is deleted.',
      confirmLabel: 'Delete folder',
    })
    if (!ok) return
    try {
      await deleteFolderMutation.mutateAsync(name)
      toast.success('Folder deleted')
      if (selectedFolder === name) setSelectedFolder('')
    } catch {
      toast.error('Failed to delete folder')
    }
  }

  function submitFolderDraft() {
    const name = folderDraft.trim()
    setAddingFolder(false)
    setFolderDraft('')
    if (!name) return
    createFolder.mutate(name, {
      onSuccess: () => toast.success('Folder created'),
      onError: () => toast.error('Could not create folder — it may already exist'),
    })
  }

  const isEmpty = !isLoading && filtered.length === 0

  return (
    <PageContainer wide>
      <PageHeader
        title="Documents"
        description="Store and organize financial documents such as bank agreements, insurance policies, bills, and receipts."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAddingFolder(true)
                requestAnimationFrame(() => folderInputRef.current?.focus())
              }}
            >
              <FolderPlus data-icon="inline-start" />
              New folder
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <FileText data-icon="inline-start" />
              Upload
            </Button>
          </div>
        }
      />

      <div className="glass-panel flex flex-col overflow-hidden rounded-xl border lg:flex-row">
        {/* Folder rail — horizontal chips on mobile, sidebar on desktop */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b p-3 lg:w-56 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-e lg:p-3">
          <FolderRailItem
            label="All documents"
            count={totalCount}
            active={selectedFolder === ''}
            onClick={() => setSelectedFolder('')}
          />
          {foldersLoading &&
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full shrink-0 rounded-lg lg:w-full" />)}
          {folders.map((folder) => (
            <FolderRailItem
              key={folder.name}
              label={folder.name}
              count={folder.count}
              active={selectedFolder === folder.name}
              onClick={() => setSelectedFolder(folder.name)}
              onDelete={() => handleDeleteFolder(folder.name)}
            />
          ))}
          {addingFolder && (
            <div className="flex shrink-0 items-center gap-1 lg:w-full">
              <input
                ref={folderInputRef}
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitFolderDraft()
                  if (e.key === 'Escape') {
                    setAddingFolder(false)
                    setFolderDraft('')
                  }
                }}
                onBlur={submitFolderDraft}
                placeholder="Folder name…"
                className="h-8 w-36 min-w-0 rounded-lg border border-primary bg-muted px-2.5 text-sm outline-none lg:w-full"
              />
            </div>
          )}
        </div>

        {/* Documents area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <InputGroup className="h-8 max-w-xs flex-1">
              <InputGroupAddon>
                <Search size={15} />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search documents…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton onClick={() => setSearch('')} aria-label="Clear search">
                    <X size={13} />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>

            <div className="ms-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {isLoading ? '' : `${filtered.length} document${filtered.length === 1 ? '' : 's'}`}
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={view}
                onValueChange={(v) => v && setView(v as ViewMode)}
              >
                <ToggleGroupItem value="grid" aria-label="Grid view" size="icon-sm">
                  <Grid2x2 size={14} />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List view" size="icon-sm">
                  <List size={14} />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          <div className="flex-1 p-4">
            {isLoading && (
              <div
                className={
                  view === 'grid'
                    ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5'
                    : 'flex flex-col gap-2'
                }
              >
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className={view === 'grid' ? 'h-32 w-full rounded-xl' : 'h-14 w-full rounded-lg'} />
                ))}
              </div>
            )}

            {isEmpty && (
              <EmptyState
                icon={FileText}
                title={search ? 'No documents match your search' : 'No documents yet'}
                description={
                  search
                    ? 'Try a different search term or clear the filter.'
                    : 'Upload PDFs, images, or spreadsheets to keep them with your finances.'
                }
                action={
                  !search && (
                    <Button size="sm" onClick={() => setUploadOpen(true)}>
                      <FileText data-icon="inline-start" />
                      Upload your first document
                    </Button>
                  )
                }
              />
            )}

            {!isLoading && filtered.length > 0 && view === 'grid' && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {filtered.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onOpen={() => setPreviewDoc(doc)}
                    onEdit={() => setEditingDoc(doc)}
                    onDelete={() => handleDeleteDoc(doc)}
                  />
                ))}
              </div>
            )}

            {!isLoading && filtered.length > 0 && view === 'list' && (
              <div className="flex flex-col gap-1.5">
                {filtered.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    onOpen={() => setPreviewDoc(doc)}
                    onEdit={() => setEditingDoc(doc)}
                    onDelete={() => handleDeleteDoc(doc)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <DocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} defaultFolder={selectedFolder} />
      <DocumentEditDialog document={editingDoc} onOpenChange={(open) => !open && setEditingDoc(null)} />
      <DocumentPreviewSheet
        document={previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        onEdit={(doc) => {
          setPreviewDoc(null)
          setEditingDoc(doc)
        }}
        onDelete={handleDeleteDoc}
      />
      {confirmDialog}
    </PageContainer>
  )
}

function FolderRailItem({
  label,
  count,
  active,
  onClick,
  onDelete,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  onDelete?: () => void
}) {
  return (
    <div
      className={cn(
        'group/folder flex shrink-0 items-center gap-1 rounded-lg lg:w-full',
        active ? 'bg-primary/12' : 'hover:bg-muted',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-sm transition-colors',
          active ? 'font-medium text-primary' : 'text-foreground',
        )}
      >
        <Folder size={15} className="shrink-0" />
        <span className="truncate">{label}</span>
        <Badge
          variant="outline"
          className={cn('ms-auto shrink-0', active && 'border-primary/30 bg-primary/10 text-primary')}
        >
          {count}
        </Badge>
      </button>
      {onDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="me-1 shrink-0 opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100"
              aria-label={`Folder options for ${label}`}
            >
              <MoreVertical size={13} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              Delete folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

function DocumentActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon-xs"
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
          aria-label="Document options"
        >
          <MoreVertical size={13} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onEdit}>Edit details</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DocumentCard({
  doc,
  onOpen,
  onEdit,
  onDelete,
}: {
  doc: DocumentItem
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = fileTypeMeta(doc.mime_type, doc.filename)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group/card relative flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border border-border bg-card p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
    >
      <div className="absolute end-2 top-2 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100">
        <DocumentActionsMenu onEdit={onEdit} onDelete={onDelete} />
      </div>
      <span className={cn('flex h-16 w-14 items-center justify-center rounded-lg', meta.className)}>
        <meta.icon size={26} />
      </span>
      <p className="line-clamp-2 w-full text-xs font-medium leading-tight text-foreground" title={doc.title}>
        {doc.title}
      </p>
      <p className="text-[0.65rem] text-muted-foreground">{formatBytes(doc.size)}</p>
    </div>
  )
}

function DocumentRow({
  doc,
  onOpen,
  onEdit,
  onDelete,
}: {
  doc: DocumentItem
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = fileTypeMeta(doc.mime_type, doc.filename)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group/row flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/50"
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', meta.className)}>
        <meta.icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
        {doc.folder && <p className="truncate text-xs text-muted-foreground">{doc.folder}</p>}
      </div>
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {formatDate(doc.uploaded_at)}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(doc.size)}</span>
      <DocumentActionsMenu onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}
