import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  AlarmClockIcon,
  Alert01Icon,
  BankIcon,
  PiggyBankIcon,
  TagIcon,
  TargetIcon,
  WalletIcon,
} from '@hugeicons/core-free-icons'
import { useActiveAccounts } from '../accounts/useAccounts'
import { useBankConnections } from '../bank-sync/useBankSync'
import { needsReauth } from '../bank-sync/connectionHealth'
import { useBudgets } from '../budgets/useBudgets'
import { useCategories } from '../categories/useCategories'
import { useGoals } from '../goals/useGoals'
import { useInvestmentAccounts } from '../investments/useInvestments'
import { useTransactions } from '../transactions/useTransactions'
import { queryKeys } from '../lib/queryKeys'
import { formatBalance, formatCurrency, formatDate, currentMonthRange } from '../lib/format'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ProgressBar, progressVariantForPercent } from '../ui/ProgressBar'
import { useMediaQuery } from '../ui/useMediaQuery'
import { useBalanceVisibility } from '../ui/BalanceVisibilityContext'
import { Amount, CategoryChip, flowOfType, flowRail } from '../ui/money'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { getSpendingReport } from './reportsApi'
import { listUpcomingDebtPayments, type UpcomingDebtPayment } from '../debts/debtsApi'
import {
  listUpcomingRecurringPayments,
  type UpcomingRecurringPayment,
} from '../recurring/recurringApi'
import { SpendingChart } from './SpendingChart'
import type { Account, AccountType } from '../accounts/accountsApi'
import { AccountIcon, getAccountTypeMeta } from '../accounts/bankIcons'
import type { InvestmentAccount } from '../investments/investmentsApi'
import { cn } from '@/lib/utils'

/** Consistent frame for every panel on the page: title, optional link, body. */
function Panel({
  title,
  hint,
  icon,
  to,
  linkLabel,
  children,
  className,
}: {
  title: string
  hint?: string
  icon: IconSvgElement
  to?: string
  linkLabel?: string
  children: ReactNode
  className?: string
}) {
  const { t } = useTranslation('dashboard')
  return (
    <section
      className={cn(
        'glass-panel flex min-w-0 flex-col rounded-xl border',
        className,
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <HugeiconsIcon
          icon={icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {to && (
          <Button variant="ghost" size="sm" className="-me-1.5 shrink-0" asChild>
            <Link to={to}>{linkLabel ?? t('panel.viewAll')}</Link>
          </Button>
        )}
      </header>
      <div className="min-w-0 flex-1 p-4">{children}</div>
    </section>
  )
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

/**
 * A row in the balances panel points at either a plain `Account` (its
 * transactions live in the ledger) or a broker-linked `InvestmentAccount`
 * (its own table, no ledger transactions at all) — carrying the tag through
 * lets `AccountRow` pick the right destination and subtitle per row.
 */
type DashboardAccountItem =
  | { kind: 'account'; account: Account }
  | { kind: 'investment'; account: InvestmentAccount }

function itemKey(item: DashboardAccountItem): string {
  return item.kind === 'account' ? `acc-${item.account.id}` : `inv-${item.account.id}`
}

function providerLabel(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

export function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { hidden: balancesHidden } = useBalanceVisibility()
  const monthRange = currentMonthRange()

  // Active only: a deactivated account is one the user has told us to stop
  // caring about — a closed card, a manual account superseded by its
  // bank-synced twin. Its history stays reachable from every filter, but it
  // must not skew the headline balance or pad the panel below.
  const { data: accounts, isLoading: accountsLoading } = useActiveAccounts()
  const { data: connections = [] } = useBankConnections()
  // A consent can lapse on any day — Enable Banking's own docs list several
  // ways a bank ends a session early. The Connections page explains it well,
  // but only to someone who goes there; without this the first symptom is
  // transactions silently not arriving.
  const ailingConnections = connections.filter(needsReauth)
  const { data: budgets, isLoading: budgetsLoading } = useBudgets()
  const { data: goals, isLoading: goalsLoading } = useGoals()
  const { data: categories = [] } = useCategories()
  // Linked (broker-synced) investment accounts live in their own table, not
  // in `accounts` — they still belong in the balances panel, just grouped
  // with the manually-tracked investment accounts and routed to the
  // investments workspace instead of the transaction ledger they don't have.
  const { data: investmentAccounts = [], isLoading: investmentAccountsLoading } =
    useInvestmentAccounts()

  const { data: txnData, isLoading: txnLoading } = useTransactions({
    ...monthRange,
    per_page: 100,
    page: 1,
  })

  const { data: recentTxnData, isLoading: recentTxnLoading } = useTransactions({
    page: 1,
    per_page: 6,
  })

  const { data: spendingReport, isLoading: reportLoading } = useQuery({
    queryKey: queryKeys.spendingReport(monthRange),
    queryFn: () => getSpendingReport(monthRange),
  })

  const { data: upcomingDebts, isLoading: debtsLoading } = useQuery({
    queryKey: queryKeys.upcomingDebtPayments,
    queryFn: () => listUpcomingDebtPayments(30),
  })

  const { data: upcomingRecurring, isLoading: recurringLoading } = useQuery({
    queryKey: queryKeys.upcomingRecurringPayments,
    queryFn: () => listUpcomingRecurringPayments(15),
  })

  const txns = txnData?.items ?? []
  const totalIncome = txns
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpenses = txns
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
  const netSaved = totalIncome - totalExpenses

  const totalBalance = accounts?.reduce((sum, acc) => sum + (acc.balance ?? 0), 0) ?? 0
  const accountCount = accounts?.length ?? 0

  const totalSpent = spendingReport?.data.reduce((a, b) => a + b, 0) ?? 0
  const topCategory =
    spendingReport && spendingReport.labels.length > 0
      ? { name: spendingReport.labels[0], amount: spendingReport.data[0] }
      : null
  const categoryCount = spendingReport?.labels.length ?? 0

  const categoryColors = useMemo(() => {
    const map: Record<string, string> = {}
    for (const category of categories) {
      if (category.color) map[category.name] = category.color
    }
    return map
  }, [categories])

  const activeGoals =
    goals?.filter((g) => g.status !== 'completed' && g.status !== 'cancelled').slice(0, 4) ?? []

  const upcomingPayments = useMemo(
    () =>
      [
        ...(upcomingDebts ?? []).map((d: UpcomingDebtPayment) => ({
          id: `debt-${d.debt_id}`,
          name: d.debt_name,
          amount: d.amount,
          dueDate: d.due_date,
          daysUntil: d.days_until_due,
          isOverdue: d.is_overdue,
          type: 'debt' as const,
        })),
        ...(upcomingRecurring ?? []).map((r: UpcomingRecurringPayment) => ({
          id: `recurring-${r.id}`,
          name: r.name,
          amount: r.amount,
          dueDate: r.due_date,
          daysUntil: r.days_until_due,
          isOverdue: r.is_overdue,
          type: 'recurring' as const,
        })),
      ].sort((a, b) => a.daysUntil - b.daysUntil),
    [upcomingDebts, upcomingRecurring],
  )

  const upcomingTotal = upcomingPayments.reduce((sum, p) => sum + p.amount, 0)

  // Three categories a household actually thinks in, not the five account
  // types the schema stores: checking/cash/credit read as one "spending
  // money" bucket day to day, so only savings and investments get split out.
  // Investments themselves mix two sources — manual `Account` rows and
  // broker-linked `InvestmentAccount` rows — merged here into one bucket
  // since both are "money invested" from the household's point of view.
  const accountGroups = useMemo(() => {
    const daily: DashboardAccountItem[] = []
    const savings: DashboardAccountItem[] = []
    const investmentsManual: DashboardAccountItem[] = []
    for (const account of accounts ?? []) {
      const item: DashboardAccountItem = { kind: 'account', account }
      if (account.type === 'savings') savings.push(item)
      else if (account.type === 'investment') investmentsManual.push(item)
      else daily.push(item)
    }
    const investmentsLinked: DashboardAccountItem[] = investmentAccounts
      .filter((account) => account.is_active)
      .map((account) => ({ kind: 'investment' as const, account }))

    return [
      {
        key: 'daily',
        label: t('accounts.groups.daily'),
        meta: getAccountTypeMeta('checking'),
        items: daily,
      },
      {
        key: 'savings',
        label: t('accounts.groups.savings'),
        meta: getAccountTypeMeta('savings'),
        items: savings,
      },
      {
        key: 'investments',
        label: t('accounts.groups.investments'),
        meta: getAccountTypeMeta('investment'),
        // Linked accounts first — they're the ones actively tracked by a
        // sync, so they're the more likely reason someone opens this group.
        items: [...investmentsLinked, ...investmentsManual],
      },
    ].filter((group) => group.items.length > 0)
  }, [accounts, investmentAccounts, t])

  // Built once, placed twice below: DOM order for phones (single column, top
  // to bottom) versus the two independent desktop columns need a different
  // sequence, and a plain CSS grid can't reorder without coupling row heights
  // across columns again.
  const accountsPanel = (
    <Panel
      key="accounts"
      title={t('accounts.title')}
      hint={accountsLoading || investmentAccountsLoading ? undefined : t('accounts.hint')}
      icon={WalletIcon}
      to="/accounts"
    >
      {accountsLoading || investmentAccountsLoading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : accountGroups.length === 0 ? (
        <EmptyLine>{t('accounts.empty')}</EmptyLine>
      ) : (
        // All categories visible at once — a thin labeled rule per group
        // rather than a full panel each, so three categories cost three
        // one-line headers, not three separated cards.
        <div className="flex flex-col gap-2">
          {accountGroups.map((group, index) => (
            <div key={group.key}>
              {index > 0 && <Separator className="mb-2" />}
              <div className="mb-1 flex items-center gap-1.5 px-1">
                <span className={cn('size-1.5 shrink-0 rounded-full', group.meta.fill)} />
                <p className="truncate text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {group.label}
                </p>
                <span className="text-[0.65rem] text-muted-foreground/60">
                  {group.items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                {group.items.map((item) => (
                  <AccountRow key={itemKey(item)} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )

  const duePanel = (
    <Panel
      key="due"
      title={t('due.title')}
      hint={
        debtsLoading || recurringLoading
          ? undefined
          : upcomingPayments.length === 0
            ? t('due.hintEmpty')
            : t('due.hintSummary', {
                amount: formatCurrency(upcomingTotal),
                count: upcomingPayments.length,
              })
      }
      icon={AlarmClockIcon}
      to="/recurring"
    >
      {debtsLoading || recurringLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : upcomingPayments.length === 0 ? (
        <EmptyLine>{t('due.empty')}</EmptyLine>
      ) : (
        <ul className="flex flex-col">
          {upcomingPayments.slice(0, 5).map((payment) => (
            <li
              key={payment.id}
              className={cn(
                'flex items-center justify-between gap-3 border-b border-border/60 py-2 ps-2.5 last:border-b-0',
                
                payment.isOverdue ? 'border-s-destructive' : 'border-s-flow-out',
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{payment.name}</p>
                <p className="text-xs text-muted-foreground">
                  {payment.isOverdue ? (
                    <span className="font-medium text-destructive">{t('due.overdue')}</span>
                  ) : payment.daysUntil === 0 ? (
                    t('due.dueToday')
                  ) : (
                    `${t('due.inDays', { count: payment.daysUntil })} · ${formatDate(payment.dueDate)}`
                  )}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <Amount value={payment.amount} flow="out" signed={false} className="text-sm" />
                <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  {t(`due.types.${payment.type}`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )

  const spendingPanel = (
    <Panel
      key="spending"
      title={t('spending.title')}
      hint={
        reportLoading
          ? undefined
          : `${t('spending.hintSummary', {
              amount: formatCurrency(totalSpent),
              count: categoryCount,
            })}${topCategory ? t('spending.mostOn', { category: topCategory.name }) : ''}`
      }
      icon={TagIcon}
      to="/reports"
      linkLabel={t('spending.reportsLink')}
    >
      {reportLoading ? (
        <Skeleton className="h-[280px] w-full" />
      ) : (
        <SpendingChart report={spendingReport} colorByLabel={categoryColors} height={280} />
      )}
    </Panel>
  )

  const budgetsPanel = (
    <Panel
      key="budgets"
      title={t('budgets.title')}
      hint={budgetsLoading ? undefined : t('budgets.hint')}
      icon={PiggyBankIcon}
      to="/budgets"
    >
      {budgetsLoading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (budgets?.length ?? 0) === 0 ? (
        <EmptyLine>{t('budgets.empty')}</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {budgets?.slice(0, 4).map((budget) => (
            <li key={budget.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">{budget.name}</p>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                </p>
              </div>
              <ProgressBar
                value={budget.percentage}
                variant={progressVariantForPercent(budget.percentage)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )

  const recentPanel = (
    <Panel
      key="recent"
      title={t('recent.title')}
      hint={t('recent.hint')}
      icon={BankIcon}
      to="/transactions"
    >
      {recentTxnLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (recentTxnData?.items.length ?? 0) === 0 ? (
        <EmptyLine>{t('recent.empty')}</EmptyLine>
      ) : (
        <ul className="flex flex-col">
          {recentTxnData?.items.map((txn) => {
            const flow = flowOfType(txn.type)
            return (
              <li
                key={txn.id}
                className={cn(
                  'flex items-center justify-between gap-3 border-b border-border/60 py-2 ps-2.5 last:border-b-0',
                  flowRail[flow],
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{txn.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(txn.date)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {txn.type !== 'transfer' && (
                    <CategoryChip
                      name={txn.category_name}
                      color={txn.category_color}
                      className="hidden sm:inline-flex"
                    />
                  )}
                  <Amount value={txn.amount} flow={flow} className="text-sm" />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )

  const goalsPanel = (
    <Panel
      key="goals"
      title={t('goals.title')}
      hint={goalsLoading ? undefined : t('goals.hint')}
      icon={TargetIcon}
      to="/goals"
    >
      {goalsLoading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : activeGoals.length === 0 ? (
        <EmptyLine>{t('goals.empty')}</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {activeGoals.map((goal) => (
            <li key={goal.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">{goal.name}</p>
                <Badge variant="outline" className="shrink-0 text-xs tabular-nums">
                  {Math.round(goal.progress_percentage ?? 0)}%
                </Badge>
              </div>
              <ProgressBar
                value={goal.progress_percentage ?? 0}
                variant={progressVariantForPercent(goal.progress_percentage ?? 0)}
              />
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {t('goals.progressAmount', {
                  current: formatCurrency(goal.current_amount),
                  target: formatCurrency(goal.target_amount),
                })}
                {goal.target_date
                  ? t('goals.targetDate', { date: formatDate(goal.target_date) })
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        className="mb-0"
      />

      {ailingConnections.length > 0 && (
        <Link
          to="/connections"
          className="flex items-start gap-2.5 rounded-2xl bg-warning/10 p-4 text-sm text-warning transition-colors hover:bg-warning/15"
        >
          <HugeiconsIcon
            icon={Alert01Icon}
            strokeWidth={2}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="font-medium">
              {t('bankAlert.title', {
                banks: ailingConnections.map((c) => c.aspsp_name).join(', '),
                count: ailingConnections.length,
              })}
            </span>{' '}
            <span className="opacity-90">{t('bankAlert.action')}</span>
          </span>
        </Link>
      )}

      {/* The month in four figures. Everything below explains it. */}
      <section
        aria-label={t('summary.ariaLabel')}
        className={`rounded-3xl ${isDesktop ? 'bg-gradient-to-l from-sidebar via-secondary/5 to-primary/90' : ''} p-5 glass-panel`}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div>
            <p className={`text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${isDesktop ? 'text-white' : 'text-muted-foreground'}`}>
              {t('summary.totalBalance')}
            </p>
            <p className={`mt-1 font-heading text-4xl font-bold tabular-nums tracking-tight ${isDesktop ? 'text-white' : 'text-muted-foreground'}`}>
              {accountsLoading ? '…' : formatBalance(totalBalance, undefined, balancesHidden)}
            </p>
            <p className={`mt-0.5 text-xs ${isDesktop ? 'text-white' : 'text-muted-foreground'}`}>
              {t('summary.accountsCount', { count: accountCount })}
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-4">
            <Figure
              label={t('summary.incomeThisMonth')}
              value={txnLoading ? '…' : formatCurrency(totalIncome)}
              tone="in"
            />
            <Figure
              label={t('summary.expensesThisMonth')}
              value={txnLoading ? '…' : formatCurrency(totalExpenses)}
              tone="out"
            />
            <Figure
              label={t('summary.netSaved')}
              value={txnLoading ? '…' : formatCurrency(netSaved)}
              tone={netSaved >= 0 ? 'in' : 'out'}
            />
          </dl>
        </div>
      </section>

      {isDesktop ? (
        // Two independent columns rather than a shared grid — each column
        // stacks its own cards back-to-back, so a tall card in one column
        // never leaves a gap above the next card in the other column.
        <div className="grid items-start gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            {accountsPanel}
            {spendingPanel}
            {recentPanel}
          </div>
          <div className="flex flex-col gap-5">
            {duePanel}
            {budgetsPanel}
            {goalsPanel}
          </div>
        </div>
      ) : (
        // Phone: one column, in the same row-by-row order the desktop grid reads in.
        <div className="flex flex-col gap-5">
          {accountsPanel}
          {duePanel}
          {spendingPanel}
          {budgetsPanel}
          {recentPanel}
          {goalsPanel}
        </div>
      )}
    </PageContainer>
  )
}

function Figure({
  label,
  value,
  tone = 'plain',
}: {
  label: string
  value: string
  tone?: 'plain' | 'in' | 'out'
}) {
  return (
    <div>
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1 font-heading text-2xl font-bold tabular-nums tracking-tight',
          tone === 'in' && 'text-flow-in',
          tone === 'out' && 'text-flow-out',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function AccountRow({ item }: { item: DashboardAccountItem }) {
  const { t } = useTranslation('dashboard')
  const { hidden } = useBalanceVisibility()
  const account = item.account
  const type: AccountType = item.kind === 'investment' ? 'investment' : item.account.type
  const meta = getAccountTypeMeta(type)
  const balance = account.balance ?? 0
  const href =
    item.kind === 'investment'
      ? `/investments?account=${account.id}`
      : `/transactions?account_id=${account.id}`
  // A linked account has no ledger — its subtitle names the broker instead
  // of the account type, which is always "Investment" and so redundant here.
  const subtitle =
    item.kind === 'investment'
      ? `${providerLabel(item.account.provider)} · ${t('accounts.linked')}`
      : meta.label

  return (
    <Item asChild size="xs" className="rounded-lg transition-colors hover:bg-primary/10">
      <Link to={href}>
        <ItemMedia>
          <AccountIcon
            icon={account.icon}
            type={type}
            className="size-8 rounded-lg"
            imageClassName="size-6"
          />
        </ItemMedia>
        <ItemContent>
          <ItemTitle title={account.name}>{account.name}</ItemTitle>
          <ItemDescription className={meta.text}>{subtitle}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <span
            className={cn(
              'shrink-0 text-sm font-semibold tabular-nums',
              balance >= 0 ? 'text-foreground' : 'text-flow-out',
            )}
          >
            {formatBalance(balance, account.currency, hidden)}
          </span>
        </ItemActions>
      </Link>
    </Item>
  )
}
