import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, Route01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader, PageHeaderActionLabel } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { useConfirm } from '../ui/useConfirm'
import { useDeleteTracker, useTrackers, useUpdateTracker } from './useTrackers'
import { TrackerCard } from './TrackerCard'
import { TrackerDetailsSheet } from './TrackerDetailsSheet'
import { TrackerFormDialog } from './TrackerFormDialog'
import { TrackerTransactionDialog } from './TrackerTransactionDialog'
import type { Tracker } from './trackersApi'

type FilterTab = 'active' | 'inactive' | 'all'

export function TrackersPage() {
  const { t } = useTranslation(['trackers', 'common'])
  const { data: trackers = [], isLoading } = useTrackers()
  const updateTracker = useUpdateTracker()
  const deleteTracker = useDeleteTracker()
  const { confirm, confirmDialog } = useConfirm()

  const [filter, setFilter] = useState<FilterTab>('active')
  const [formOpen, setFormOpen] = useState(false)
  const [editingTracker, setEditingTracker] = useState<Tracker | null>(null)
  const [detailsTracker, setDetailsTracker] = useState<Tracker | null>(null)
  const [transactionTracker, setTransactionTracker] = useState<Tracker | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'active') return trackers.filter((tracker) => tracker.is_active)
    if (filter === 'inactive') return trackers.filter((tracker) => !tracker.is_active)
    return trackers
  }, [trackers, filter])

  // The sheet holds a snapshot, so re-read the fresh row after a mutation
  // (adding a transaction changes the totals it is displaying).
  const openDetailsTracker = detailsTracker
    ? (trackers.find((tracker) => tracker.id === detailsTracker.id) ?? detailsTracker)
    : null

  const openCreate = () => {
    setEditingTracker(null)
    setFormOpen(true)
  }

  const openEdit = (tracker: Tracker) => {
    setDetailsTracker(null)
    setEditingTracker(tracker)
    setFormOpen(true)
  }

  const openAddTransaction = (tracker: Tracker) => {
    setTransactionTracker(tracker)
  }

  const handleToggleActive = async (tracker: Tracker) => {
    try {
      await updateTracker.mutateAsync({
        id: tracker.id,
        input: { is_active: !tracker.is_active },
      })
      toast.success(tracker.is_active ? t('page.toasts.deactivated') : t('page.toasts.activated'))
    } catch {
      toast.error(t('page.toasts.updateFailed'))
    }
  }

  const handleDelete = async (tracker: Tracker) => {
    const ok = await confirm({
      title: t('page.deleteDialog.title', { name: tracker.name }),
      description: t('page.deleteDialog.description'),
      confirmLabel: t('page.deleteDialog.confirmLabel'),
    })
    if (!ok) return
    try {
      await deleteTracker.mutateAsync(tracker.id)
      toast.success(t('page.toasts.deleted'))
      if (detailsTracker?.id === tracker.id) setDetailsTracker(null)
    } catch {
      toast.error(t('page.toasts.deleteFailed'))
    }
  }

  return (
    <PageContainer wide>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        action={
          <Button size="sm" onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            <PageHeaderActionLabel>{t('page.addTracker')}</PageHeaderActionLabel>
          </Button>
        }
      />

      {isLoading ? (
        <TrackersSkeleton />
      ) : trackers.length === 0 ? (
        <EmptyState
          icon={<HugeiconsIcon icon={Route01Icon} strokeWidth={2} />}
          title={t('page.empty.title')}
          description={t('page.empty.description')}
          action={
            <Button size="sm" onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('page.createFirst')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-heading text-lg font-semibold tracking-tight">
                {t('page.yourTrackers')}
              </h2>
              <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterTab)}>
                <TabsList>
                  <TabsTrigger value="active">{t('page.tabs.active')}</TabsTrigger>
                  <TabsTrigger value="inactive">{t('page.tabs.inactive')}</TabsTrigger>
                  <TabsTrigger value="all">{t('page.tabs.all')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t(`page.noneInView.${filter}`)}
              </p>
            ) : (
              // Two across at most: these cards carry a ring, a total and a
              // meta line, and a third column squeezed all three.
              <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {filtered.map((tracker) => (
                  <TrackerCard
                    key={tracker.id}
                    tracker={tracker}
                    onOpen={() => setDetailsTracker(tracker)}
                    onAddTransaction={() => openAddTransaction(tracker)}
                    onEdit={() => openEdit(tracker)}
                    onToggleActive={() => void handleToggleActive(tracker)}
                    onDelete={() => void handleDelete(tracker)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <TrackerFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingTracker(null)
        }}
        tracker={editingTracker}
      />
      <TrackerDetailsSheet
        open={!!detailsTracker}
        onOpenChange={(open) => {
          if (!open) setDetailsTracker(null)
        }}
        tracker={openDetailsTracker}
        onAddTransaction={openAddTransaction}
        onEdit={openEdit}
      />
      <TrackerTransactionDialog
        open={!!transactionTracker}
        onOpenChange={(open) => {
          if (!open) setTransactionTracker(null)
        }}
        tracker={transactionTracker}
      />
      {confirmDialog}
    </PageContainer>
  )
}

function TrackersSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
