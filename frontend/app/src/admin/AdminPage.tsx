import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Key01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '../auth/AuthContext'
import { formatDate } from '../lib/format'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { useConfirm } from '../ui/useConfirm'
import * as adminApi from './adminApi'
import type { InviteCode } from './adminApi'

function inviteStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge variant="default">Active</Badge>
    case 'used':
      return <Badge variant="secondary">Used</Badge>
    case 'expired':
      return <Badge variant="outline">Expired</Badge>
    case 'revoked':
      return <Badge variant="destructive">Revoked</Badge>
    default:
      return <Badge variant="ghost">{status}</Badge>
  }
}

export function AdminPage() {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const { confirm, confirmDialog } = useConfirm()

  const [createInviteOpen, setCreateInviteOpen] = useState(false)
  const [inviteLabel, setInviteLabel] = useState('')
  const [inviteExpiresDays, setInviteExpiresDays] = useState('')
  const [showCodeOpen, setShowCodeOpen] = useState(false)
  const [newInviteCode, setNewInviteCode] = useState('')

  const { data: users, isLoading: usersLoading, isError: usersError } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminApi.listUsers,
  })

  const {
    data: invites,
    isLoading: invitesLoading,
    isError: invitesError,
  } = useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: adminApi.listInvites,
  })

  const invalidateInvites = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] })

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })

  const createInviteMutation = useMutation({
    mutationFn: adminApi.createInvite,
    onSuccess: (result) => {
      setCreateInviteOpen(false)
      setInviteLabel('')
      setInviteExpiresDays('')
      setNewInviteCode(result.code)
      setShowCodeOpen(true)
      invalidateInvites()
    },
    onError: () => toast.error('Failed to create invite code'),
  })

  const revokeInviteMutation = useMutation({
    mutationFn: adminApi.revokeInvite,
    onSuccess: () => {
      toast.success('Invite revoked')
      invalidateInvites()
    },
    onError: () => toast.error('Failed to revoke invite'),
  })

  const setUserActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      adminApi.setUserActive(id, isActive),
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? 'User activated' : 'User deactivated')
      invalidateUsers()
    },
    onError: () => toast.error('Failed to update user'),
  })

  const handleCreateInvite = (e: React.FormEvent) => {
    e.preventDefault()
    const label = inviteLabel.trim() || null
    const expiresRaw = inviteExpiresDays.trim()
    const expires_in_days = expiresRaw ? Number(expiresRaw) : null
    createInviteMutation.mutate({ label, expires_in_days })
  }

  const handleCopyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(newInviteCode)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy — select the code and copy manually')
    }
  }

  const handleRevokeInvite = async (invite: InviteCode) => {
    const ok = await confirm({
      title: 'Revoke invite code?',
      description: 'It will no longer be usable for registration.',
      confirmLabel: 'Revoke',
      cancelLabel: 'Keep active',
      tone: 'destructive',
    })
    if (!ok) return
    revokeInviteMutation.mutate(invite.id)
  }

  const handleToggleUserActive = async (id: number, currentlyActive: boolean) => {
    const action = currentlyActive ? 'deactivate' : 'activate'
    const ok = await confirm({
      title: currentlyActive ? 'Deactivate this user?' : 'Activate this user?',
      description: currentlyActive
        ? 'They will not be able to sign in until you activate them again.'
        : 'They will be able to sign in again.',
      confirmLabel: currentlyActive ? 'Deactivate' : 'Activate',
      cancelLabel: 'Cancel',
      tone: currentlyActive ? 'destructive' : 'default',
    })
    if (!ok) return
    setUserActiveMutation.mutate({ id, isActive: !currentlyActive })
  }

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader title="Admin" description="Manage users and invite codes." />
      {confirmDialog}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-5 text-primary" />
            Invite codes
          </CardTitle>
          <CardDescription>
            Registration is invite-only. Generate a single-use code and share it — it can only be
            used once.
          </CardDescription>
          <CardAction>
            <Button size="sm" onClick={() => setCreateInviteOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              New invite
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {invitesLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Spinner />
              Loading invite codes…
            </div>
          )}
          {invitesError && (
            <p className="text-sm text-destructive text-center py-6">Failed to load invite codes.</p>
          )}
          {!invitesLoading && !invitesError && invites?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No invite codes yet.</p>
          )}
          {!invitesLoading && !invitesError && invites && invites.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Used by</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.label ?? '—'}</TableCell>
                    <TableCell>{inviteStatusBadge(invite.status)}</TableCell>
                    <TableCell>
                      {invite.expires_at ? formatDate(invite.expires_at) : 'Never'}
                    </TableCell>
                    <TableCell>
                      {invite.used_by_user_id ? `#${invite.used_by_user_id}` : '—'}
                    </TableCell>
                    <TableCell>{formatDate(invite.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {invite.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={revokeInviteMutation.isPending}
                          onClick={() => handleRevokeInvite(invite)}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} className="size-5 text-primary" />
            Users
          </CardTitle>
          <CardDescription>
            View account status and activate or deactivate users. You cannot deactivate your own
            account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Spinner />
              Loading users…
            </div>
          )}
          {usersError && (
            <p className="text-sm text-destructive text-center py-6">Failed to load users.</p>
          )}
          {!usersLoading && !usersError && users && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>{u.full_name ?? '—'}</TableCell>
                    <TableCell>
                      {u.email_verified ? (
                        <Badge variant="default">Verified</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.is_admin ? <Badge variant="secondary">Admin</Badge> : '—'}
                    </TableCell>
                    <TableCell>
                      {u.is_active ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="ghost">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(u.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {u.id === currentUser?.id ? (
                        <span className="text-xs text-muted-foreground">You</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={u.is_active ? 'text-destructive' : 'text-primary'}
                          disabled={setUserActiveMutation.isPending}
                          onClick={() => handleToggleUserActive(u.id, u.is_active)}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createInviteOpen} onOpenChange={setCreateInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New invite code</DialogTitle>
            <DialogDescription>
              Optional label and expiry. Leave expiry blank for a code that never expires.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateInvite} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="invite-label">Label</FieldLabel>
              <Input
                id="invite-label"
                value={inviteLabel}
                onChange={(e) => setInviteLabel(e.target.value)}
                placeholder="e.g. Maria"
              />
              <FieldDescription>Optional — who this invite is for.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-expires">Expires in (days)</FieldLabel>
              <Input
                id="invite-expires"
                type="number"
                min={1}
                max={365}
                value={inviteExpiresDays}
                onChange={(e) => setInviteExpiresDays(e.target.value)}
                placeholder="e.g. 14"
              />
              <FieldDescription>Leave blank for no expiry.</FieldDescription>
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateInviteOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createInviteMutation.isPending}>
                {createInviteMutation.isPending ? <Spinner /> : 'Generate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCodeOpen}
        onOpenChange={(open) => {
          setShowCodeOpen(open)
          if (!open) setNewInviteCode('')
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
                className="size-5 text-primary"
              />
              Invite code created
            </DialogTitle>
            <DialogDescription>
              <strong className="text-destructive font-medium">Copy it now!</strong> This code will
              not be shown again — only its hash is stored.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/60 p-4">
            <Field>
              <FieldLabel htmlFor="new-invite-code">Invite code</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="new-invite-code"
                  readOnly
                  value={newInviteCode}
                  className="font-mono text-sm tracking-wide"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="default"
                  title="Copy to clipboard"
                  onClick={() => void handleCopyInviteCode()}
                >
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                  <span className="sr-only">Copy</span>
                </Button>
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                setShowCodeOpen(false)
                setNewInviteCode('')
              }}
            >
              I&apos;ve copied the code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
