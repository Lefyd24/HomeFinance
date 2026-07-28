import { useState } from 'react'
import { FolderPlus } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { DocumentFolder } from './documentsApi'

const NEW_FOLDER_SENTINEL = '__new__'

/** Folder select with a free-text "create new folder" escape hatch inline. */
export function FolderPicker({
  value,
  onChange,
  folders,
}: {
  value: string
  onChange: (folder: string) => void
  folders: DocumentFolder[]
}) {
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="New folder name…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (draftName.trim()) onChange(draftName.trim())
              setCreating(false)
            }
            if (e.key === 'Escape') setCreating(false)
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (draftName.trim()) onChange(draftName.trim())
            setCreating(false)
          }}
        >
          Add
        </Button>
      </div>
    )
  }

  return (
    <Select
      value={value === '' ? '__root__' : value}
      onValueChange={(v) => {
        if (v === NEW_FOLDER_SENTINEL) {
          setDraftName('')
          setCreating(true)
          return
        }
        onChange(v === '__root__' ? '' : v)
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="No folder" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>
          <SelectItem value="__root__">No folder</SelectItem>
          {folders.map((folder) => (
            <SelectItem key={folder.name} value={folder.name}>
              {folder.name}
            </SelectItem>
          ))}
          <SelectItem value={NEW_FOLDER_SENTINEL}>
            <FolderPlus className="text-primary" />
            <span className="text-primary">Create new folder…</span>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
