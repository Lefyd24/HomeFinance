import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { AccountCard } from './AccountCard'
import type { PortfolioScope } from '../portfolioInsights'
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

  return (
    // Bleeds to the screen edges on phones so a card can sit flush while the
    // row scrolls, and snaps so a swipe lands on a card rather than between two.
    <div className="-mx-3 flex snap-x snap-mandatory items-start gap-2.5 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
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
        className="h-auto min-h-24 w-[7.5rem] shrink-0 snap-start flex-col gap-1.5 self-stretch border-dashed text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-5" />
        <span className="text-wrap text-xs font-medium">{t('page.connectAccount')}</span>
      </Button>
    </div>
  )
}
