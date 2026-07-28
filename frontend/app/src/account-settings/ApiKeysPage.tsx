import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ListCard } from '../ui/ListCard'
import * as apiKeysApi from './apiKeysApi'

export function ApiKeysPage() {
  const queryClient = useQueryClient()
  const { data: status, isLoading } = useQuery({
    queryKey: ['api-key-status'],
    queryFn: apiKeysApi.getApiKeyStatus,
  })
  const [newKey, setNewKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleGenerate() {
    setBusy(true)
    try {
      const result = await apiKeysApi.generateApiKey()
      setNewKey(result.api_key)
      await queryClient.invalidateQueries({ queryKey: ['api-key-status'] })
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke() {
    setBusy(true)
    try {
      await apiKeysApi.revokeApiKey()
      setNewKey(null)
      await queryClient.invalidateQueries({ queryKey: ['api-key-status'] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="API Keys"
        description="Generate a personal API key for integrations. The full key is shown only once."
      />

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {newKey && (
        <ListCard as="div" className="mb-4 border-amber-500/40 bg-amber-500/10">
          <p className="text-sm font-medium text-foreground mb-2">
            Copy this key now — it won&apos;t be shown again
          </p>
          <code className="block font-mono text-sm break-all bg-background/80 rounded-lg p-3 border border-border">
            {newKey}
          </code>
        </ListCard>
      )}

      {status?.has_api_key ? (
        <ListCard as="div" className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Key size={18} className="text-primary shrink-0" />
            <span className="text-foreground">
              Active key ending in •••• {status.api_key_last_four}
            </span>
          </div>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void handleRevoke()}>
            Revoke
          </Button>
        </ListCard>
      ) : (
        !isLoading && (
          <Button disabled={busy} onClick={() => void handleGenerate()}>
            Generate API key
          </Button>
        )
      )}
    </PageContainer>
  )
}
