import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  Delete02Icon,
  ArrowDataTransferHorizontalIcon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { StatCard, StatStrip } from '../ui/StatStrip'
import { formatCurrency } from '../lib/format'
import { cn } from '@/lib/utils'
import { useAccounts, useDeleteAccount } from './useAccounts'
import { AccountFormDialog } from './AccountFormDialog'
import { AccountIcon, getAccountTypeMeta } from './bankIcons'
import type { Account, AccountType } from './accountsApi'

export function AccountsPage() {
  const { data: accounts = [], isLoading } = useAccounts()
  const deleteAccount = useDeleteAccount()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)

  const summary = useMemo(() => {
    const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance ?? 0), 0)
    const byType = accounts.reduce(
      (acc, account) => {
        acc[account.type] = (acc[account.type] ?? 0) + 1
        return acc
      },
      {} as Partial<Record<AccountType, number>>,
    )
    const creditBalance = accounts
      .filter((a) => a.type === 'credit')
      .reduce((sum, a) => sum + (a.balance ?? 0), 0)
    return {
      totalBalance,
      count: accounts.length,
      active: accounts.filter((a) => a.is_active).length,
      creditBalance,
      byType,
    }
  }, [accounts])

  const handleAdd = () => {
    setEditingAccount(null)
    setDialogOpen(true)
  }

  const handleEdit = (account: Account) => {
    setEditingAccount(account)
    setDialogOpen(true)
  }

  const handleDelete = async (account: Account) => {
    if (!confirm(`Delete "${account.name}"? This cannot be undone.`)) return
    try {
      await deleteAccount.mutateAsync(account.id)
      toast.success('Account deleted')
    } catch {
      toast.error('Failed to delete account')
    }
  }

  return (
    <PageContainer wide>
      <PageHeader
        title="Accounts"
        description="Manage bank accounts, cards, and portfolios with live balances."
        action={
          <Button size="sm" onClick={handleAdd}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Add account
          </Button>
        }
      />

      {isLoading ? (
        <>
          <StatStrip className="mb-6">
            {[1, 2, 3, 4].map((i) => (
              <StatCard key={i} label="…" value={<Skeleton className="h-8 w-24" />} />
            ))}
          </StatStrip>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-52 w-full rounded-xl" />
            ))}
          </div>
        </>
      ) : accounts.length === 0 ? (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Wallet01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No accounts yet</EmptyTitle>
            <EmptyDescription>
              Add your first account to start tracking balances and linking transactions.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={handleAdd}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Add account
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <StatStrip className="mb-6">
            <StatCard
              label="Total Balance"
              value={formatCurrency(summary.totalBalance)}
              hint={`${summary.active} active account${summary.active === 1 ? '' : 's'}`}
              tone="primary"
            />
            <StatCard label="Accounts" value={summary.count} />
            <StatCard
              label="Checking & Savings"
              value={(summary.byType.checking ?? 0) + (summary.byType.savings ?? 0)}
              tone="success"
            />
            <StatCard
              label="Credit Exposure"
              value={formatCurrency(summary.creditBalance)}
              hint={`${summary.byType.credit ?? 0} credit account${(summary.byType.credit ?? 0) === 1 ? '' : 's'}`}
              tone={summary.creditBalance < 0 ? 'destructive' : 'default'}
            />
          </StatStrip>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}

      <AccountFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editingAccount}
      />
    </PageContainer>
  )
}

function AccountCard({
  account,
  onEdit,
  onDelete,
}: {
  account: Account
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
}) {
  const meta = getAccountTypeMeta(account.type)
  const balance = account.balance ?? 0

  return (
    <Card className="h-full transition-colors hover:bg-muted/20">
      <CardHeader>
        <div className="flex items-start gap-3 min-w-0">
          <AccountIcon icon={account.icon} type={account.type} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{account.name}</CardTitle>
            <CardDescription className="flex items-center gap-2 flex-wrap mt-1">
              <Badge variant="outline" className="capitalize text-xs">
                {meta.label}
              </Badge>
              <span className="text-xs">{account.currency}</span>
              {!account.is_active && (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Account actions">
                <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onEdit(account)}>
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={`/transactions?account_id=${account.id}`}>
                    <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} />
                    Transactions
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(account)}>
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      <CardContent>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Current balance
        </p>
        <p
          className={cn(
            'mt-1 text-3xl font-heading font-bold tabular-nums tracking-tight',
            balance >= 0 ? 'text-success' : 'text-destructive',
          )}
        >
          {formatCurrency(balance, account.currency)}
        </p>
        {account.description && (
          <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{account.description}</p>
        )}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => onEdit(account)}>
          <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
          Edit
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/transactions?account_id=${account.id}`}>View transactions</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
