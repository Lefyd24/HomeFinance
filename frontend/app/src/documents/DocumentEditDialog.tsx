import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { PencilEdit02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Dialog } from '../ui/Dialog'
import { FolderPicker } from './FolderPicker'
import { useDocumentFolders, useUpdateDocument } from './useDocuments'
import type { DocumentItem } from './documentsApi'

interface DocumentEditDialogProps {
  document: DocumentItem | null
  onOpenChange: (open: boolean) => void
}

export function DocumentEditDialog({ document, onOpenChange }: DocumentEditDialogProps) {
  const { data: foldersData } = useDocumentFolders()
  const updateDocument = useUpdateDocument()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [folder, setFolder] = useState('')

  useEffect(() => {
    if (document) {
      setTitle(document.title)
      setDescription(document.description)
      setFolder(document.folder)
    }
  }, [document])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!document || !title.trim()) return
    try {
      await updateDocument.mutateAsync({
        id: document.id,
        input: { title: title.trim(), description: description.trim(), folder },
      })
      toast.success('Document updated')
      onOpenChange(false)
    } catch {
      toast.error('Failed to update document')
    }
  }

  const formId = 'document-edit-form'

  return (
    <Dialog
      open={!!document}
      title="Edit document"
      icon={PencilEdit02Icon}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={!title.trim() || updateDocument.isPending}>
            {updateDocument.isPending && <Spinner data-icon="inline-start" />}
            Save changes
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-doc-title">Title</FieldLabel>
            <Input id="edit-doc-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-doc-description">Description</FieldLabel>
            <Textarea
              id="edit-doc-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-doc-folder">Folder</FieldLabel>
            <FolderPicker value={folder} onChange={setFolder} folders={foldersData?.folders ?? []} />
          </Field>
        </FieldGroup>
      </form>
    </Dialog>
  )
}
