import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatBalance } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import { AccountCard } from './AccountCard'
import { aggregateTotals, ALL_ACCOUNTS, type PortfolioScope } from '../portfolioInsights'
import type { InvestmentAccount } from '../investmentsApi'

/**
 * Which account the workspace is looking at.
 *
 * The rail is the page's only real navigation: every tile below answers
 * questions about whichever card is selected. The grand total across all
 * accounts lives in the page header instead — a portfolio-wide figure is a
 * different kind of thing from a per-account view, and mixing the two into one
 * row made the row read as five peers when it was really one summary and four
 * accounts.
 *
 * `items-start`, not `items-stretch`: cards size to their own content, so a
 * taller neighbour never stretches the rest into empty space.
 */
export function AccountScopeRail({
  accounts,
  scope,
  onScopeChange,
  onConnect,
  onEdit,
  onRotateKeys,
  onDelete,
  onSync,
  syncingId,
}: {
  accounts: InvestmentAccount[]
  scope: PortfolioScope
  onScopeChange: (scope: PortfolioScope) => void
  onConnect: () => void
  onEdit: (account: InvestmentAccount) => void
  onRotateKeys: (account: InvestmentAccount) => void
  onDelete: (account: InvestmentAccount) => void
  onSync: (account: InvestmentAccount) => void
  syncingId: number | null
}) {
  const { t } = useTranslation('investments')
  const { hidden } = useBalanceVisibility()
  const combined = aggregateTotals(accounts)

  return (
    // Bleeds to the screen edges on phones so a card can sit flush while the
    // row scrolls, and snaps so a swipe lands on a card rather than between two.
    // From `sm` the cards wrap into a grid instead (a clipped card on a tablet
    // gives no hint it scrolls); the single row returns once `xl` has room.
    <div className="-mx-3 flex snap-x snap-mandatory items-start gap-2.5 overflow-x-auto px-3 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:flex">
      {accounts.length > 1 && (
        <button
          type="button"
          onClick={() => onScopeChange(ALL_ACCOUNTS)}
          aria-pressed={scope.kind === 'all'}
          className={cn(
            'flex min-h-24 w-[10rem] shrink-0 snap-start flex-col justify-center gap-1 self-stretch rounded-xl border-2 bg-card p-2.5 text-start sm:w-auto xl:w-[11rem]',
            'transition-[box-shadow,border-color,opacity] duration-200 ease-out motion-reduce:transition-none',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            scope.kind === 'all'
              ? 'border-primary'
              : 'border-border/70 opacity-70 hover:border-primary/40 hover:opacity-100',
          )}
        >
          <span className="text-sm font-medium leading-tight">{t('card.allAccounts')}</span>
          {combined ? (
            <span className="font-heading text-lg font-semibold leading-none tabular-nums tracking-tight">
              {formatBalance(combined.value, combined.currency, hidden)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{t('card.mixedCurrencies')}</span>
          )}
          <span className="text-[0.7rem] text-muted-foreground">
            {t('summary.accountCount', { count: accounts.length })}
          </span>
        </button>
      )}
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          selected={scope.kind === 'account' && scope.id === account.id}
          onSelect={() => onScopeChange({ kind: 'account', id: account.id })}
          onEdit={() => onEdit(account)}
          onRotateKeys={() => onRotateKeys(account)}
          onDelete={() => onDelete(account)}
          onSync={() => onSync(account)}
          syncDisabled={syncingId === account.id}
        />
      ))}

      <Button
        variant="outline"
        onClick={onConnect}
        className="h-auto min-h-24 w-[7.5rem] shrink-0 snap-start flex-col gap-1.5 self-stretch border-dashed text-muted-foreground hover:text-foreground sm:w-auto xl:w-[7.5rem]"
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-5" />
        <span className="text-wrap text-xs font-medium">{t('page.connectAccount')}</span>
      </Button>
    </div>
  )
}
