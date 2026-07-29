import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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

function describeRule(
  rule: NotificationRule,
  accountName: (id: number) => string,
  budgetName: (id: number) => string,
  t: TFunction<'notifications'>,
): string {
  if (rule.type === 'balance_below') {
    const target =
      rule.target_id != null
        ? accountName(rule.target_id)
        : t('rules.describe.accountFallback', { id: rule.target_id })
    return t('rules.describe.balanceBelow', {
      target,
      amount: formatCurrency(rule.threshold ?? 0),
    })
  }
  if (rule.type === 'budget_percent') {
    const target =
      rule.target_id != null
        ? budgetName(rule.target_id)
        : t('rules.describe.budgetFallback', { id: rule.target_id })
    return t('rules.describe.budgetPercent', {
      target,
      percent: rule.threshold ?? 0,
    })
  }
  if (rule.type === 'scheduled_report') {
    const schedule =
      rule.schedule_kind === 'every_n_days'
        ? t('rules.describe.scheduleEveryNDays', { count: rule.schedule_value || 7 })
        : rule.schedule_kind || t('rules.describe.scheduleFallback')
    const reportLabel = rule.report_type
      ? t(`ruleForm.reportTypes.${rule.report_type}` as 'ruleForm.reportTypes.spending')
      : t('rules.typeLabels.scheduled_report')
    return t('rules.describe.scheduledReport', { report: reportLabel, schedule })
  }
  return ''
}

export function NotificationsPage() {
  const { t } = useTranslation('notifications')

  const hourOptions = useMemo(
    () => [
      { value: 'none', label: t('hourNone') },
      ...Array.from({ length: 24 }, (_, h) => ({
        value: String(h),
        label: `${String(h).padStart(2, '0')}:00`,
      })),
    ],
    [t],
  )
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
      toast.success(t('toasts.channelsUpdated'))
    } catch {
      toast.error(t('toasts.channelsFailed'))
    }
  }

  async function handleSaveGeneral() {
    try {
      await updateSettings.mutateAsync({
        default_days_before: Number.parseInt(generalForm.defaultDaysBefore, 10) || 3,
        quiet_hours_start: generalForm.quietHoursStart === 'none' ? null : Number(generalForm.quietHoursStart),
        quiet_hours_end: generalForm.quietHoursEnd === 'none' ? null : Number(generalForm.quietHoursEnd),
      })
      toast.success(t('toasts.generalSaved'))
    } catch {
      toast.error(t('toasts.generalFailed'))
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
      toast.success(t('toasts.smtpSaved'))
    } catch {
      toast.error(t('toasts.smtpFailed'))
    }
  }

  async function handleEnableDesktop() {
    setPushBusy(true)
    try {
      await subscribePush({ forceRefresh: true })
      await updateSettings.mutateAsync({ push_enabled: true })
      toast.success(t('toasts.desktopEnabled'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toasts.desktopEnableFailed'))
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
      toast.success(t('toasts.desktopDisabled'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toasts.desktopDisableFailed'))
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
      toast.error(t('toasts.rulesCheckFailed'))
    } finally {
      setRunningRules(false)
    }
  }

  async function handleTestEmail() {
    setTestingEmail(true)
    try {
      const result = await notificationsApi.sendTestNotification('email')
      if (result.email) toast.success(t('toasts.testEmailSent'))
      else
        toast.error(
          t('toasts.testEmailFailed', {
            detail: result.email_detail || t('toasts.testEmailFailedGeneric'),
          }),
        )
    } catch {
      toast.error(t('toasts.testFailed'))
    } finally {
      setTestingEmail(false)
    }
  }

  async function handleTestPush() {
    setTestingPush(true)
    try {
      const result = await notificationsApi.sendTestNotification('push')
      if (result.push) toast.success(t('toasts.testPushSent'))
      else
        toast.error(
          t('toasts.testPushFailed', {
            detail: result.push_detail || t('toasts.testPushFailedGeneric'),
          }),
        )
    } catch {
      toast.error(t('toasts.testFailed'))
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
      title: t('deleteConfirm.title', { name: rule.name }),
      description: t('deleteConfirm.description'),
      confirmLabel: t('deleteConfirm.confirmLabel'),
    })
    if (!ok) return
    try {
      await deleteRule.mutateAsync(rule.id)
      toast.success(t('toasts.ruleDeleted'))
    } catch {
      toast.error(t('toasts.ruleDeleteFailed'))
    }
  }

  const desktopReady = browserSubscribed && (pushStatus?.subscription_count ?? 0) > 0
  const desktopStatusText = !pushStatus?.vapid_configured
    ? t('channels.status.vapidNotConfigured')
    : desktopReady
      ? t('channels.status.enabled')
      : browserSubscribed
        ? t('channels.status.subscribedNotRegistered')
        : t('channels.status.clickEnable')

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
      />

      {/* Channels */}
      <ListCard as="div">
        <h2 className="font-heading text-lg font-semibold">{t('channels.title')}</h2>

        {settingsLoading ? (
          <div className="mt-4 flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <p className="font-medium text-sm">{t('channels.email.title')}</p>
                <p className="text-xs text-muted-foreground">{t('channels.email.description')}</p>
              </div>
              <Switch
                checked={!!settings?.email_enabled}
                onCheckedChange={(v) => void handleToggleChannel('email_enabled', v)}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <p className="font-medium text-sm">{t('channels.push.title')}</p>
                <p className="text-xs text-muted-foreground">{t('channels.push.description')}</p>
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
                    {t('channels.disableDesktop')}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled={pushBusy} onClick={() => void handleEnableDesktop()}>
                    {t('channels.enableDesktop')}
                  </Button>
                )
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  {t('channels.notSupported')}
                </Button>
              )}
              <span className="text-xs text-muted-foreground">{desktopStatusText}</span>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" size="sm" disabled={runningRules} onClick={() => void handleRunRules()}>
                {t('channels.checkRulesNow')}
              </Button>
              <Button type="button" size="sm" disabled={testingPush} onClick={() => void handleTestPush()}>
                {t('channels.sendTestPush')}
              </Button>
            </div>
          </div>
        )}
      </ListCard>

      {/* General settings */}
      <ListCard as="div">
        <h2 className="font-heading text-lg font-semibold">{t('general.title')}</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="default-days-before">{t('general.defaultDaysBefore')}</Label>
            <Input
              id="default-days-before"
              type="number"
              min={1}
              max={90}
              value={generalForm.defaultDaysBefore}
              onChange={(e) => setGeneralForm((f) => ({ ...f, defaultDaysBefore: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t('general.defaultDaysBeforeHint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('general.quietHoursStart')}</Label>
            <Select
              value={generalForm.quietHoursStart}
              onValueChange={(v) => setGeneralForm((f) => ({ ...f, quietHoursStart: v }))}
              options={hourOptions}
              placeholder={t('hourNone')}
            />
            <p className="text-xs text-muted-foreground">{t('general.quietHoursStartHint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('general.quietHoursEnd')}</Label>
            <Select
              value={generalForm.quietHoursEnd}
              onValueChange={(v) => setGeneralForm((f) => ({ ...f, quietHoursEnd: v }))}
              options={hourOptions}
              placeholder={t('hourNone')}
            />
            <p className="text-xs text-muted-foreground">{t('general.quietHoursEndHint')}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" disabled={updateSettings.isPending} onClick={() => void handleSaveGeneral()}>
            {t('general.save')}
          </Button>
        </div>
      </ListCard>

      {/* SMTP override */}
      <ListCard as="div">
        <h2 className="font-heading text-lg font-semibold">{t('smtp.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('smtp.description')}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp-host">{t('smtp.host')}</Label>
            <Input
              id="smtp-host"
              placeholder={t('smtp.hostPlaceholder')}
              value={smtpForm.host}
              onChange={(e) => setSmtpForm((f) => ({ ...f, host: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp-port">{t('smtp.port')}</Label>
            <Input
              id="smtp-port"
              type="number"
              min={1}
              max={65535}
              placeholder={t('smtp.portPlaceholder')}
              value={smtpForm.port}
              onChange={(e) => setSmtpForm((f) => ({ ...f, port: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp-user">{t('smtp.user')}</Label>
            <Input
              id="smtp-user"
              autoComplete="username"
              value={smtpForm.user}
              onChange={(e) => setSmtpForm((f) => ({ ...f, user: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp-password">{t('smtp.password')}</Label>
            <Input
              id="smtp-password"
              type="password"
              autoComplete="new-password"
              placeholder={t('smtp.passwordPlaceholder')}
              value={smtpForm.password}
              onChange={(e) => setSmtpForm((f) => ({ ...f, password: e.target.value }))}
            />
            {settings?.smtp_password_set && !smtpForm.password && (
              <p className="text-xs text-muted-foreground">{t('smtp.passwordSaved')}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp-from">{t('smtp.from')}</Label>
            <Input
              id="smtp-from"
              type="email"
              placeholder={t('smtp.fromPlaceholder')}
              value={smtpForm.from}
              onChange={(e) => setSmtpForm((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('smtp.useTls')}</Label>
            <label className="mt-1 flex cursor-pointer items-center gap-3">
              <Switch
                checked={smtpForm.useTls}
                onCheckedChange={(v) => setSmtpForm((f) => ({ ...f, useTls: v }))}
              />
              <span className="text-sm">{t('smtp.enableTls')}</span>
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={testingEmail} onClick={() => void handleTestEmail()}>
            {t('smtp.sendTestEmail')}
          </Button>
          <Button size="sm" disabled={updateSettings.isPending} onClick={() => void handleSaveSmtp()}>
            {t('smtp.save')}
          </Button>
        </div>
      </ListCard>

      {/* Rules */}
      <ListCard as="div">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-lg font-semibold">{t('rules.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('rules.description')}</p>
          </div>
          <Button size="sm" className="shrink-0" onClick={handleAddRule}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            {t('rules.add')}
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
                <EmptyTitle>{t('rules.empty.title')}</EmptyTitle>
                <EmptyDescription>{t('rules.empty.description')}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={handleAddRule}>
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                  {t('rules.empty.addFirst')}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('rules.table.name')}</TableHead>
                  <TableHead>{t('rules.table.type')}</TableHead>
                  <TableHead>{t('rules.table.details')}</TableHead>
                  <TableHead>{t('rules.table.channels')}</TableHead>
                  <TableHead>{t('rules.table.status')}</TableHead>
                  <TableHead className="text-end">{t('rules.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`rules.typeLabels.${rule.type}` as 'rules.typeLabels.balance_below')}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm text-muted-foreground">
                      {describeRule(rule, accountName, budgetName, t)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{rule.channels || 'email'}</TableCell>
                    <TableCell>
                      <Badge variant={rule.is_active ? 'secondary' : 'outline'}>
                        {rule.is_active ? t('rules.statusActive') : t('rules.statusInactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t('rules.actionsFor', { name: rule.name })}>
                            <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => handleEditRule(rule)}>
                              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
                              {t('actions.edit')}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem variant="destructive" onClick={() => void handleDeleteRule(rule)}>
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
                              {t('actions.delete')}
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
