import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  BellRingIcon,
  Delete02Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ListCard } from '../ui/ListCard'
import { Select } from '../ui/Select'
import { useConfirm } from '../ui/useConfirm'
import { formatCurrency } from '../lib/format'
import { useAccounts } from '../accounts/useAccounts'
import { useBudgets } from '../budgets/useBudgets'
import { isPushSupported, isPushSubscribed, subscribePush, unsubscribePush } from './pushNotifications'
import * as notificationsApi from './notificationsApi'
import {
  useDeleteNotificationRule,
  useNotificationRules,
  useNotificationSettings,
  usePushStatus,
  useUpdateNotificationSettings,
} from './useNotificationSettings'
import { RuleFormDialog } from './RuleFormDialog'
import type { NotificationRule } from './notificationsApi'

const HOUR_OPTIONS = [
  { value: 'none', label: 'None' },
  ...Array.from({ length: 24 }, (_, h) => ({
    value: String(h),
    label: `${String(h).padStart(2, '0')}:00`,
  })),
]

const RULE_TYPE_LABEL: Record<string, string> = {
  balance_below: 'Balance',
  budget_percent: 'Budget',
  scheduled_report: 'Report',
}

function describeRule(
  rule: NotificationRule,
  accountName: (id: number) => string,
  budgetName: (id: number) => string,
): string {
  if (rule.type === 'balance_below') {
    const target = rule.target_id != null ? accountName(rule.target_id) : `Account #${rule.target_id}`
    return `${target} below ${formatCurrency(rule.threshold ?? 0)}`
  }
  if (rule.type === 'budget_percent') {
    const target = rule.target_id != null ? budgetName(rule.target_id) : `Budget #${rule.target_id}`
    return `${target} at ${rule.threshold ?? 0}%`
  }
  if (rule.type === 'scheduled_report') {
    const schedule =
      rule.schedule_kind === 'every_n_days'
        ? `every ${rule.schedule_value || 7} days`
        : rule.schedule_kind || 'scheduled'
    return `${rule.report_type || 'report'}, ${schedule}`
  }
  return ''
}

export function NotificationsPage() {
  const { data: settings, isLoading: settingsLoading } = useNotificationSettings()
  const { data: rules = [], isLoading: rulesLoading } = useNotificationRules()
  const { data: accounts = [] } = useAccounts()
  const { data: budgets = [] } = useBudgets(false)
  const { data: pushStatus, refetch: refetchPushStatus } = usePushStatus()
  const updateSettings = useUpdateNotificationSettings()
  const deleteRule = useDeleteNotificationRule()
  const { confirm, confirmDialog } = useConfirm()

  const [generalForm, setGeneralForm] = useState({
    defaultDaysBefore: '3',
    quietHoursStart: 'none',
    quietHoursEnd: 'none',
  })
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: '',
    user: '',
    password: '',
    from: '',
    useTls: true,
  })
  const [browserSubscribed, setBrowserSubscribed] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [runningRules, setRunningRules] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [testingPush, setTestingPush] = useState(false)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null)

  useEffect(() => {
    if (!settings) return
    setGeneralForm({
      defaultDaysBefore: String(settings.default_days_before ?? 3),
      quietHoursStart: settings.quiet_hours_start != null ? String(settings.quiet_hours_start) : 'none',
      quietHoursEnd: settings.quiet_hours_end != null ? String(settings.quiet_hours_end) : 'none',
    })
    setSmtpForm({
      host: settings.smtp_host ?? '',
      port: settings.smtp_port != null ? String(settings.smtp_port) : '',
      user: settings.smtp_user ?? '',
      password: '',
      from: settings.smtp_from ?? '',
      useTls: settings.smtp_use_tls !== false,
    })
  }, [settings])

  useEffect(() => {
    isPushSubscribed().then(setBrowserSubscribed)
  }, [pushStatus])

  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? `Account #${id}`
  const budgetName = (id: number) => budgets.find((b) => b.id === id)?.name ?? `Budget #${id}`

  async function handleToggleChannel(channel: 'email_enabled' | 'push_enabled', value: boolean) {
    try {
      await updateSettings.mutateAsync({ [channel]: value })
      toast.success('Channel preferences updated')
    } catch {
      toast.error('Failed to update channels')
    }
  }

  async function handleSaveGeneral() {
    try {
      await updateSettings.mutateAsync({
        default_days_before: Number.parseInt(generalForm.defaultDaysBefore, 10) || 3,
        quiet_hours_start: generalForm.quietHoursStart === 'none' ? null : Number(generalForm.quietHoursStart),
        quiet_hours_end: generalForm.quietHoursEnd === 'none' ? null : Number(generalForm.quietHoursEnd),
      })
      toast.success('Notification settings saved')
    } catch {
      toast.error('Failed to save settings')
    }
  }

  async function handleSaveSmtp() {
    try {
      await updateSettings.mutateAsync({
        smtp_host: smtpForm.host.trim() || null,
        smtp_port: smtpForm.port ? Number.parseInt(smtpForm.port, 10) : null,
        smtp_user: smtpForm.user.trim() || null,
        smtp_from: smtpForm.from.trim() || null,
        smtp_use_tls: smtpForm.useTls,
        ...(smtpForm.password ? { smtp_password: smtpForm.password } : {}),
      })
      setSmtpForm((f) => ({ ...f, password: '' }))
      toast.success('SMTP settings saved')
    } catch {
      toast.error('Failed to save SMTP settings')
    }
  }

  async function handleEnableDesktop() {
    setPushBusy(true)
    try {
      await subscribePush({ forceRefresh: true })
      await updateSettings.mutateAsync({ push_enabled: true })
      toast.success('Desktop notifications enabled')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to enable desktop notifications')
    } finally {
      setBrowserSubscribed(await isPushSubscribed())
      await refetchPushStatus()
      setPushBusy(false)
    }
  }

  async function handleDisableDesktop() {
    setPushBusy(true)
    try {
      await unsubscribePush()
      await updateSettings.mutateAsync({ push_enabled: false })
      toast.success('Desktop notifications disabled')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to disable desktop notifications')
    } finally {
      setBrowserSubscribed(await isPushSubscribed())
      await refetchPushStatus()
      setPushBusy(false)
    }
  }

  async function handleRunRules() {
    setRunningRules(true)
    try {
      const result = await notificationsApi.runNotificationsNow()
      toast[result.sent > 0 ? 'success' : 'info'](result.message)
    } catch {
      toast.error('Failed to check rules')
    } finally {
      setRunningRules(false)
    }
  }

  async function handleTestEmail() {
    setTestingEmail(true)
    try {
      const result = await notificationsApi.sendTestNotification('email')
      if (result.email) toast.success('Test email sent — check your inbox')
      else toast.error(`Test email failed: ${result.email_detail || 'check SMTP settings'}`)
    } catch {
      toast.error('Test failed')
    } finally {
      setTestingEmail(false)
    }
  }

  async function handleTestPush() {
    setTestingPush(true)
    try {
      const result = await notificationsApi.sendTestNotification('push')
      if (result.push) toast.success('Test desktop notification sent')
      else toast.error(`Test push failed: ${result.push_detail || 'check configuration'}`)
    } catch {
      toast.error('Test failed')
    } finally {
      setTestingPush(false)
    }
  }

  function handleAddRule() {
    setEditingRule(null)
    setRuleDialogOpen(true)
  }

  function handleEditRule(rule: NotificationRule) {
    setEditingRule(rule)
    setRuleDialogOpen(true)
  }

  async function handleDeleteRule(rule: NotificationRule) {
    const ok = await confirm({
      title: `Delete ${rule.name}?`,
      description: 'This notification rule will stop running immediately.',
      confirmLabel: 'Delete rule',
    })
    if (!ok) return
    try {
      await deleteRule.mutateAsync(rule.id)
      toast.success('Rule deleted')
    } catch {
      toast.error('Failed to delete rule')
    }
  }

  const desktopReady = browserSubscribed && (pushStatus?.subscription_count ?? 0) > 0
  const desktopStatusText = !pushStatus?.vapid_configured
    ? 'Server push not configured — set VAPID keys on the backend'
    : desktopReady
      ? 'Desktop notifications are enabled for this browser'
      : browserSubscribed
        ? 'Browser subscribed but not registered on server — click Enable again'
        : 'Click Enable to allow browser notifications'

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title="Notifications"
        description="Choose how you want to be alerted about balances, budgets, and scheduled reports."
      />

      {/* Channels */}
      <ListCard as="div">
        <h2 className="font-heading text-lg font-semibold">Notification channels</h2>

        {settingsLoading ? (
          <div className="mt-4 flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <p className="font-medium text-sm">Email notifications</p>
                <p className="text-xs text-muted-foreground">Send alerts to your account email address</p>
              </div>
              <Switch
                checked={!!settings?.email_enabled}
                onCheckedChange={(v) => void handleToggleChannel('email_enabled', v)}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <p className="font-medium text-sm">Push notifications</p>
                <p className="text-xs text-muted-foreground">Desktop browser notifications when enabled</p>
              </div>
              <Switch
                checked={!!settings?.push_enabled}
                onCheckedChange={(v) => void handleToggleChannel('push_enabled', v)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {isPushSupported() ? (
                desktopReady ? (
                  <Button type="button" variant="ghost" size="sm" disabled={pushBusy} onClick={() => void handleDisableDesktop()}>
                    Disable desktop notifications
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled={pushBusy} onClick={() => void handleEnableDesktop()}>
                    Enable desktop notifications
                  </Button>
                )
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  Desktop notifications not supported
                </Button>
              )}
              <span className="text-xs text-muted-foreground">{desktopStatusText}</span>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" size="sm" disabled={runningRules} onClick={() => void handleRunRules()}>
                Check rules now
              </Button>
              <Button type="button" size="sm" disabled={testingPush} onClick={() => void handleTestPush()}>
                Send test desktop notification
              </Button>
            </div>
          </div>
        )}
      </ListCard>

      {/* General settings */}
      <ListCard as="div">
        <h2 className="font-heading text-lg font-semibold">General settings</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="default-days-before">Default days before</Label>
            <Input
              id="default-days-before"
              type="number"
              min={1}
              max={90}
              value={generalForm.defaultDaysBefore}
              onChange={(e) => setGeneralForm((f) => ({ ...f, defaultDaysBefore: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">For recurring expenses and debt reminders</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Quiet hours start</Label>
            <Select
              value={generalForm.quietHoursStart}
              onValueChange={(v) => setGeneralForm((f) => ({ ...f, quietHoursStart: v }))}
              options={HOUR_OPTIONS}
              placeholder="None"
            />
            <p className="text-xs text-muted-foreground">Hour (0–23), no notifications sent</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Quiet hours end</Label>
            <Select
              value={generalForm.quietHoursEnd}
              onValueChange={(v) => setGeneralForm((f) => ({ ...f, quietHoursEnd: v }))}
              options={HOUR_OPTIONS}
              placeholder="None"
            />
            <p className="text-xs text-muted-foreground">Hour (0–23)</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" disabled={updateSettings.isPending} onClick={() => void handleSaveGeneral()}>
            Save settings
          </Button>
        </div>
      </ListCard>

      {/* SMTP override */}
      <ListCard as="div">
        <h2 className="font-heading text-lg font-semibold">SMTP override</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional per-user SMTP settings. Unset fields fall back to server configuration.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp-host">SMTP host</Label>
            <Input
              id="smtp-host"
              placeholder="smtp.example.com"
              value={smtpForm.host}
              onChange={(e) => setSmtpForm((f) => ({ ...f, host: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp-port">SMTP port</Label>
            <Input
              id="smtp-port"
              type="number"
              min={1}
              max={65535}
              placeholder="587"
              value={smtpForm.port}
              onChange={(e) => setSmtpForm((f) => ({ ...f, port: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp-user">SMTP user</Label>
            <Input
              id="smtp-user"
              autoComplete="username"
              value={smtpForm.user}
              onChange={(e) => setSmtpForm((f) => ({ ...f, user: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp-password">SMTP password</Label>
            <Input
              id="smtp-password"
              type="password"
              autoComplete="new-password"
              placeholder="Leave blank to keep current"
              value={smtpForm.password}
              onChange={(e) => setSmtpForm((f) => ({ ...f, password: e.target.value }))}
            />
            {settings?.smtp_password_set && !smtpForm.password && (
              <p className="text-xs text-muted-foreground">A password is already saved</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp-from">From address</Label>
            <Input
              id="smtp-from"
              type="email"
              placeholder="noreply@example.com"
              value={smtpForm.from}
              onChange={(e) => setSmtpForm((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Use TLS</Label>
            <label className="mt-1 flex cursor-pointer items-center gap-3">
              <Switch
                checked={smtpForm.useTls}
                onCheckedChange={(v) => setSmtpForm((f) => ({ ...f, useTls: v }))}
              />
              <span className="text-sm">Enable TLS</span>
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={testingEmail} onClick={() => void handleTestEmail()}>
            Send test email
          </Button>
          <Button size="sm" disabled={updateSettings.isPending} onClick={() => void handleSaveSmtp()}>
            Save SMTP settings
          </Button>
        </div>
      </ListCard>

      {/* Rules */}
      <ListCard as="div">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-lg font-semibold">Notification rules</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Custom alerts for low balances, budget usage, and scheduled reports.
            </p>
          </div>
          <Button size="sm" className="shrink-0" onClick={handleAddRule}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Add rule
          </Button>
        </div>

        <div className="mt-4">
          {rulesLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rules.length === 0 ? (
            <Empty className="border border-dashed py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={BellRingIcon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>No notification rules yet</EmptyTitle>
                <EmptyDescription>Add one to get alerted about balances, budgets, or reports.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={handleAddRule}>
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                  Add your first rule
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{RULE_TYPE_LABEL[rule.type] ?? rule.type}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm text-muted-foreground">
                      {describeRule(rule, accountName, budgetName)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{rule.channels || 'email'}</TableCell>
                    <TableCell>
                      <Badge variant={rule.is_active ? 'secondary' : 'outline'}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`${rule.name} actions`}>
                            <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => handleEditRule(rule)}>
                              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
                              Edit
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem variant="destructive" onClick={() => void handleDeleteRule(rule)}>
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </ListCard>

      <RuleFormDialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen} rule={editingRule} />
      {confirmDialog}
    </PageContainer>
  )
}
