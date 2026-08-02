import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Delete02Icon,
  FlashIcon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  RepeatIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
import { PageHeader, PageHeaderActionLabel } from '../ui/PageHeader'
import { ListCard } from '../ui/ListCard'
import { Dialog } from '../ui/Dialog'
import { useConfirm } from '../ui/useConfirm'
import { useAccounts } from '../accounts/useAccounts'
import {
  useApplyAllRules,
  useApplyRule,
  useDeleteRule,
  useRules,
  useUpdateRule,
} from './useRules'
import { RuleFormDialog } from './RuleFormDialog'
import { describeRule } from './ruleSummary'
import type { CategoryRule } from './rulesApi'

export function RulesPage() {
  const { t } = useTranslation('rules')
  const { data: rules = [], isLoading } = useRules()
  const { data: accounts = [] } = useAccounts()
  const updateRule = useUpdateRule()
  const deleteRule = useDeleteRule()
  const applyRule = useApplyRule()
  const applyAll = useApplyAllRules()
  const { confirm, confirmDialog } = useConfirm()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryRule | null>(null)
  const [applyTarget, setApplyTarget] = useState<CategoryRule | 'all' | null>(null)
  const [includeCategorised, setIncludeCategorised] = useState(false)

  const accountName = (id: number) =>
    accounts.find((a) => a.id === id)?.name ?? String(id)

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(rule: CategoryRule) {
    setEditing(rule)
    setFormOpen(true)
  }

  async function handleDelete(rule: CategoryRule) {
    if (
      !(await confirm({
        title: t('actions.delete'),
        description: rule.name,
        confirmLabel: t('actions.delete'),
        tone: 'destructive',
      }))
    ) {
      return
    }
    try {
      await deleteRule.mutateAsync(rule.id)
      toast.success(t('toast.deleted'))
    } catch {
      toast.error(t('toast.deleteError'))
    }
  }

  async function handleToggle(rule: CategoryRule, active: boolean) {
    try {
      await updateRule.mutateAsync({
        id: rule.id,
        payload: { is_active: active },
      })
    } catch {
      toast.error(t('toast.updateError'))
    }
  }

  async function confirmApply() {
    if (!applyTarget) return
    try {
      const result =
        applyTarget === 'all'
          ? await applyAll.mutateAsync(includeCategorised)
          : await applyRule.mutateAsync({
              id: applyTarget.id,
              includeCategorised,
            })
      if (result.updated === 0) {
        toast.message(t('apply.none'))
      } else {
        toast.success(t('apply.success', { count: result.updated }))
      }
      setApplyTarget(null)
      setIncludeCategorised(false)
    } catch {
      toast.error(t('toast.applyError'))
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setIncludeCategorised(false)
                setApplyTarget('all')
              }}
              disabled={!rules.some((r) => r.is_active)}
            >
              <HugeiconsIcon icon={FlashIcon} strokeWidth={2} data-icon="inline-start" />
              <PageHeaderActionLabel>{t('actions.applyAll')}</PageHeaderActionLabel>
            </Button>
            <Button onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              <PageHeaderActionLabel>{t('actions.add')}</PageHeaderActionLabel>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : rules.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={RepeatIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={openCreate}>{t('empty.cta')}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <ListCard key={rule.id} as="div">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-foreground truncate">{rule.name}</h2>
                    <Badge variant={rule.is_active ? 'secondary' : 'outline'}>
                      {rule.is_active ? t('list.active') : t('list.inactive')}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {describeRule(rule, t, accountName)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {rule.times_applied > 0
                      ? t('list.applied', { count: rule.times_applied })
                      : t('list.neverApplied')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(checked) => void handleToggle(rule, checked)}
                    aria-label={rule.is_active ? t('list.active') : t('list.inactive')}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={rule.name}>
                        <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => {
                            setIncludeCategorised(false)
                            setApplyTarget(rule)
                          }}
                        >
                          <HugeiconsIcon icon={FlashIcon} strokeWidth={2} />
                          {t('actions.apply')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(rule)}>
                          <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                          {t('actions.edit')}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => void handleDelete(rule)}>
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                        {t('actions.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </ListCard>
          ))}
        </div>
      )}

      <RuleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editing}
      />

      <Dialog
        open={applyTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setApplyTarget(null)
            setIncludeCategorised(false)
          }
        }}
        title={
          applyTarget === 'all' ? t('apply.applyAllTitle') : t('apply.title')
        }
        description={
          applyTarget === 'all'
            ? t('apply.applyAllDescription')
            : applyTarget
              ? t('apply.description', { name: applyTarget.name })
              : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setApplyTarget(null)
                setIncludeCategorised(false)
              }}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void confirmApply()}
              disabled={applyRule.isPending || applyAll.isPending}
            >
              {t('apply.confirm')}
            </Button>
          </>
        }
      >
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={includeCategorised}
            onCheckedChange={(v) => setIncludeCategorised(Boolean(v))}
            className="mt-0.5"
          />
          <span>{t('apply.includeCategorised')}</span>
        </label>
      </Dialog>

      {confirmDialog}
    </PageContainer>
  )
}
