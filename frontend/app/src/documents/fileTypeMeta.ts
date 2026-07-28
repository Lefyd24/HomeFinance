import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
} from 'lucide-react'

export type FileKind = 'pdf' | 'image' | 'word' | 'excel' | 'text' | 'zip' | 'other'

interface FileTypeMeta {
  kind: FileKind
  icon: LucideIcon
  className: string
}

const KIND_META: Record<FileKind, Omit<FileTypeMeta, 'kind'>> = {
  pdf: {
    icon: FileText,
    className: 'bg-flow-out/12 text-flow-out',
  },
  image: {
    icon: FileImage,
    className: 'bg-flow-in/12 text-flow-in',
  },
  word: {
    icon: FileText,
    className: 'bg-flow-move/12 text-flow-move',
  },
  excel: {
    icon: FileSpreadsheet,
    className: 'bg-success/12 text-success',
  },
  text: {
    icon: FileText,
    className: 'bg-warning/12 text-warning',
  },
  zip: {
    icon: FileArchive,
    className: 'bg-accent text-accent-foreground',
  },
  other: {
    icon: FileText,
    className: 'bg-muted text-muted-foreground',
  },
}

function kindFromMime(mimeType: string, filename: string): FileKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.includes('word') || ['doc', 'docx'].includes(ext)) return 'word'
  if (mimeType.includes('sheet') || mimeType.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext))
    return 'excel'
  if (mimeType === 'text/plain' || ext === 'txt') return 'text'
  if (mimeType === 'application/zip' || ext === 'zip') return 'zip'
  return 'other'
}

export function fileTypeMeta(mimeType: string, filename: string): FileTypeMeta {
  const kind = kindFromMime(mimeType, filename)
  return { kind, ...KIND_META[kind] }
}
