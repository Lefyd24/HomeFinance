import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { BankIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog } from '../ui/Dialog'
import { useInstitutions, useStartConnection } from './useBankSync'

interface ConnectBankDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  country?: string
}

export function ConnectBankDialog({
  open,
  onOpenChange,
  country = 'GR',
}: ConnectBankDialogProps) {
  const { t } = useTranslation('bankSync')
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const { data: institutions = [], isLoading, error } = useInstitutions(country, open)
  const startConnection = useStartConnection()

  const matches = institutions.filter((institution) =>
    institution.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  async function handleConnect(name: string) {
    setPending(name)
    try {
      const { authorization_url } = await startConnection.mutateAsync({
        aspsp_name: name,
        aspsp_country: country,
      })
      // Full navigation, not a new tab: the bank's SCA flow often refuses to
      // run in a popup, and the return trip is a redirect back to this app.
      window.location.assign(authorization_url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.startFailed'))
      setPending(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dialog.title')}
      description={t('dialog.description')}
      icon={BankIcon}
      tone="primary"
    >
      <div className="flex flex-col gap-4">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('dialog.search')}
            className="pl-9"
            autoFocus
          />
        </div>

        {isLoading && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : t('dialog.loadFailed')}
          </p>
        )}

        {!isLoading && !error && matches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('dialog.noMatches', { query: search })}
          </p>
        )}

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {matches.map((institution) => (
            <button
              key={`${institution.name}-${institution.country}`}
              type="button"
              disabled={pending !== null}
              onClick={() => void handleConnect(institution.name)}
              className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              {institution.logo ? (
                <img
                  src={institution.logo}
                  alt=""
                  className="size-8 shrink-0 rounded object-contain"
                />
              ) : (
                <HugeiconsIcon
                  icon={BankIcon}
                  strokeWidth={2}
                  className="size-8 shrink-0 text-muted-foreground"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-foreground">{institution.name}</span>
              {pending === institution.name && (
                <span className="text-xs text-muted-foreground">{t('dialog.redirecting')}</span>
              )}
            </button>
          ))}
        </div>

        {/* Restricted (free tier) mode only returns accounts that were
            whitelisted in the Enable Banking Control Panel first. Without this
            note, a successful bank login that yields nothing reads as a bug. */}
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          {t('dialog.whitelistNote')}
        </p>

        {/* Read-only access and the two policies, stated before the user commits
            to their bank's SCA rather than after. */}
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="dialog.readOnlyNote"
            components={{
              privacy: (
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                />
              ),
              terms: (
                <a
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                />
              ),
            }}
          />
        </p>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t('dialog.cancel')}
        </Button>
      </div>
    </Dialog>
  )
}
