import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { ListCard } from '../ui/ListCard'
import * as notificationsApi from './notificationsApi'

export function NotificationsPage() {
  const { data: log, isLoading } = useQuery({
    queryKey: ['notifications', 'log'],
    queryFn: notificationsApi.getNotificationLog,
  })
  const isEmpty = !isLoading && (log?.length ?? 0) === 0

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Recent alerts from budgets, debts, and recurring expenses."
      />

      {isLoading && <p className="text-muted-foreground">Loading notifications…</p>}

      {isEmpty && (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="Alerts will appear here when budget or bill rules fire."
        />
      )}

      <ul className="flex flex-col gap-2">
        {log?.map((entry) => (
          <ListCard key={entry.id}>
            <p className="font-medium text-foreground">{entry.title}</p>
            {entry.body && <p className="text-sm text-muted-foreground mt-1">{entry.body}</p>}
            <p className="text-xs text-muted-foreground mt-2">
              {new Date(entry.created_at).toLocaleString()}
            </p>
          </ListCard>
        ))}
      </ul>
    </PageContainer>
  )
}
