import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as documentsApi from './documentsApi'
import type {
  DocumentFilters,
  UpdateDocumentInput,
  UploadDocumentInput,
} from './documentsApi'

const documentKeys = {
  list: (filters: DocumentFilters) => ['documents', filters] as const,
  folders: ['documents', 'folders'] as const,
}

function invalidateDocuments(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['documents'] })
}

export function useDocuments(filters: DocumentFilters = {}) {
  return useQuery({
    queryKey: documentKeys.list(filters),
    queryFn: () => documentsApi.listDocuments(filters),
  })
}

export function useDocumentFolders() {
  return useQuery({
    queryKey: documentKeys.folders,
    queryFn: () => documentsApi.listFolders(),
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, input }: { file: File; input: UploadDocumentInput }) =>
      documentsApi.uploadDocument(file, input),
    onSuccess: () => invalidateDocuments(queryClient),
  })
}

export function useUpdateDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDocumentInput }) =>
      documentsApi.updateDocument(id, input),
    onSuccess: () => invalidateDocuments(queryClient),
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => documentsApi.deleteDocument(id),
    onSuccess: () => invalidateDocuments(queryClient),
  })
}

export function useCreateFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => documentsApi.createFolder(name),
    onSuccess: () => invalidateDocuments(queryClient),
  })
}

export function useDeleteFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => documentsApi.deleteFolder(name),
    onSuccess: () => invalidateDocuments(queryClient),
  })
}
