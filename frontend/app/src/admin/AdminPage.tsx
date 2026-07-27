import { useQuery } from '@tanstack/react-query'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { ListCard } from '../ui/ListCard'
import * as adminApi from './adminApi'

export function AdminPage() {
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminApi.listUsers,
  })
  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: adminApi.listInvites,
  })

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader title="Admin" description="Manage users and invite codes." />

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Users</h2>
        {usersLoading && <p className="text-muted-foreground text-sm">Loading users…</p>}
        <ul className="flex flex-col gap-2">
          {users?.map((user) => (
            <ListCard key={user.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{user.email}</p>
                {user.full_name && (
                  <p className="text-xs text-muted-foreground truncate">{user.full_name}</p>
                )}
              </div>
              {user.is_admin && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                  Admin
                </span>
              )}
            </ListCard>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Invite codes</h2>
        {invitesLoading && <p className="text-muted-foreground text-sm">Loading invites…</p>}
        <ul className="flex flex-col gap-2">
          {invites?.map((invite) => (
            <ListCard key={invite.id} className="flex items-center justify-between gap-3 py-3">
              <span className="font-mono text-xs text-foreground truncate">
                {invite.label || `Invite #${invite.id}`}
              </span>
              <span className="text-xs text-muted-foreground capitalize">{invite.status}</span>
            </ListCard>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}
