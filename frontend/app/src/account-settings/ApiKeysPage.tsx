import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, CheckmarkCircle02Icon, Copy01Icon, Key01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '../lib/format'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { useConfirm } from '../ui/useConfirm'
import { ApiKeyGuide } from './ApiKeyGuide'
import * as apiKeysApi from './apiKeysApi'
import type { ApiKey, ApiKeyScope } from './apiKeysApi'

const SCOPE_OPTIONS: { value: ApiKeyScope; label: string; help: string }[] = [
  { value: 'read', label: 'Read-only', help: 'Can only fetch data (GET). Safest for dashboards.' },
  { value: 'full', label: 'Full access', help: 'Can also create, edit and delete your data.' },
]

function formatDateTime(value: string) {
  return formatDate(value, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function ApiKeysPage() {
  const queryClient = useQueryClient()
  const { confirm, confirmDialog } = useConfirm()

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<ApiKeyScope>('read')
  const [newKey, setNewKey] = useState<string | null>(null)

  const { data: keys, isLoading, isError } = useQuery({
    queryKey: ['api-keys'],
    queryFn: apiKeysApi.listApiKeys,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] })

  const createMutation = useMutation({
    mutationFn: apiKeysApi.createApiKey,
    onSuccess: (result) => {
      setCreateOpen(false)
      setName('')
      setScope('read')
      setNewKey(result.key)
      void invalidate()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create API key'),
  })

  const revokeMutation = useMutation({
    mutationFn: apiKeysApi.revokeApiKey,
    onSuccess: () => {
      toast.success('API key revoked')
      void invalidate()
    },
    onError: () => toast.error('Failed to revoke API key'),
  })

  const atLimit = (keys?.length ?? 0) >= apiKeysApi.MAX_API_KEYS

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    createMutation.mutate({ name: trimmed, scope })
  }

  const handleCopy = async () => {
    if (!newKey) return
    try {
      await navigator.clipboard.writeText(newKey)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy — select the key and copy manually')
    }
  }

  const handleRevoke = async (key: ApiKey) => {
    const ok = await confirm({
      title: `Revoke "${key.name}"?`,
      description: 'Anything using this key stops working immediately. This cannot be undone.',
      confirmLabel: 'Revoke key',
      cancelLabel: 'Keep key',
      tone: 'destructive',
    })
    if (!ok) return
    revokeMutation.mutate(key.id)
  }

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="API Keys"
        description="Create keys so scripts and integrations can use your data. Each key is shown only once."
      />
      {confirmDialog}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-5 text-primary" />
            Your keys
          </CardTitle>
          <CardDescription>
            {keys ? `${keys.length} of ${apiKeysApi.MAX_API_KEYS} keys in use.` : 'Name each key after what uses it.'}
          </CardDescription>
          <CardAction>
            <Button size="sm" disabled={atLimit} onClick={() => setCreateOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              New key
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Spinner />
              Loading keys…
            </div>
          )}
          {isError && <p className="text-sm text-destructive text-center py-6">Failed to load API keys.</p>}
          {!isLoading && !isError && keys?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No API keys yet. Create one to get started — see the guide below for what it can do.
            </p>
          )}
          {!isLoading && !isError && keys && keys.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      {key.scope === 'full' ? (
                        <Badge variant="destructive">Full access</Badge>
                      ) : (
                        <Badge variant="secondary">Read-only</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {key.key_prefix}…{key.last_four}
                    </TableCell>
                    <TableCell>{formatDate(key.created_at)}</TableCell>
                    <TableCell>{key.last_used_at ? formatDateTime(key.last_used_at) : 'Never'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={revokeMutation.isPending}
                        onClick={() => void handleRevoke(key)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ApiKeyGuide />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription>Give it a name and choose what it is allowed to do.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="api-key-name">Name</FieldLabel>
              <Input
                id="api-key-name"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Home dashboard"
                autoFocus
              />
              <FieldDescription>So you know which integration uses it.</FieldDescription>
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium mb-1">Access</legend>
              {SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="api-key-scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.help}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
                {createMutation.isPending ? <Spinner /> : 'Create key'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newKey !== null}
        onOpenChange={(open) => {
          if (!open) setNewKey(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-5 text-primary" />
              API key created
            </DialogTitle>
            <DialogDescription>
              <strong className="text-destructive font-medium">Copy it now!</strong> This key will not be
              shown again — only a hash is stored.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/60 p-4">
            <Field>
              <FieldLabel htmlFor="new-api-key">API key</FieldLabel>
              <div className="flex gap-2">
                <Input id="new-api-key" readOnly value={newKey ?? ''} className="font-mono text-sm" />
                <Button type="button" size="icon" title="Copy to clipboard" onClick={() => void handleCopy()}>
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                  <span className="sr-only">Copy</span>
                </Button>
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setNewKey(null)}>
              I&apos;ve copied the key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
