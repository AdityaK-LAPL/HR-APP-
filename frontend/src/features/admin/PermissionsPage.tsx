import { Plus, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { RecordList, type Column } from '@/components/data/RecordList'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/fields'
import { usePeople } from '@/features/people/usePeople'
import { useProjects } from '@/features/projects/queries'
import { personLabel, useVisibleUsers } from '@/features/team/queries'
import { formatDate } from '@/lib/dates'
import { useUrlParams } from '@/lib/useUrlParams'
import { GrantDialog } from './GrantDialog'
import { PERMISSION_BY_KEY, PERMISSION_UI, permissionLabel } from './permissionCatalog'
import { useGrants, useRevokeGrant, type Grant } from './queries'

const isExpired = (grant: Grant) => grant.expires_at !== null && new Date(grant.expires_at).getTime() <= Date.now()

/**
 * What the Owner has granted or restricted, manager by manager. Owner-only (the API refuses anyone
 * else). Grants are soft-revoked, so revoking keeps the history in the audit trail.
 */
export function PermissionsPage() {
  const toast = useToast()
  const [params, setParams] = useUrlParams({ manager: '', permission: '', effect: '' })
  const [adding, setAdding] = useState(false)
  const [toRevoke, setToRevoke] = useState<Grant | null>(null)
  const revoke = useRevokeGrant()
  const managers = useVisibleUsers({ role: 'manager', is_active: true, page: 1, page_size: 100 })
  const projects = useProjects({ page: 1, page_size: 100 })
  const query = useGrants({
    ...(params.manager ? { grantee_user_id: params.manager } : {}),
    ...(params.permission ? { permission_key: params.permission } : {}),
  })
  const rows = (query.data ?? []).filter((grant) => !params.effect || grant.effect === params.effect)
  const { nameOf } = usePeople((query.data ?? []).flatMap((grant) => [grant.grantee_user_id, grant.granted_by, grant.scope_type === 'user' ? grant.scope_id : null]))
  const projectName = (id: string | null) => (id ? (projects.data?.items.find((project) => project.id === id)?.name ?? 'Project') : '—')
  const filtered = Boolean(params.manager || params.permission || params.effect)

  const scopeText = (grant: Grant) => {
    if (grant.scope_type === 'global') return 'Company-wide'
    if (grant.scope_type === 'project') return projectName(grant.scope_id)
    if (grant.scope_type === 'user') return nameOf(grant.scope_id, '…')
    return grant.scope_type
  }

  const scopeSuffix = (grant: Grant) => (PERMISSION_BY_KEY.get(grant.permission_key)?.scope === 'global' ? '' : ` for ${scopeText(grant)}`)

  const columns: Column<Grant>[] = [
    {
      key: 'who',
      header: 'Manager',
      primary: true,
      cell: (g) => <Link to={`/users/${g.grantee_user_id}`}>{nameOf(g.grantee_user_id, '…')}</Link>,
    },
    { key: 'permission', header: 'Permission', cell: (g) => permissionLabel(g.permission_key) },
    { key: 'scope', header: 'Applies to', cell: scopeText },
    {
      key: 'effect',
      header: 'Setting',
      cell: (g) => (
        <>
          <span className={`badge ${g.effect === 'allow' ? 'badge-success' : 'badge-danger'}`}>{g.effect === 'allow' ? 'Allowed' : 'Denied'}</span>
          {isExpired(g) && (
            <>
              {' '}
              <span className="badge badge-neutral">Expired</span>
            </>
          )}
        </>
      ),
    },
    { key: 'until', header: 'Until', hideOnPhone: true, cell: (g) => (g.expires_at ? formatDate(g.expires_at.slice(0, 10)) : 'No end date') },
    { key: 'by', header: 'Granted by', hideOnPhone: true, cell: (g) => nameOf(g.granted_by, '…') },
    { key: 'on', header: 'Granted', hideOnPhone: true, cell: (g) => formatDate(g.created_at.slice(0, 10)) },
    {
      key: 'actions',
      header: 'Actions',
      cell: (g) => (
        <Button size="sm" variant="outline" onClick={() => setToRevoke(g)} aria-label={`Revoke ${permissionLabel(g.permission_key)} for ${nameOf(g.grantee_user_id, 'manager')}`}>
          Revoke
        </Button>
      ),
    },
  ]

  return (
    <section>
      <PageHeader
        title="Permissions"
        description="What each manager can see and do beyond their own reporting line. Without a permission here, a manager works with their own team and projects only."
        actions={
          <Button icon={<Plus size={18} />} onClick={() => setAdding(true)}>
            Add a permission
          </Button>
        }
      />
      <div className="toolbar">
        <Select
          label="Manager"
          value={params.manager}
          onChange={(event) => setParams({ manager: event.target.value })}
          options={(managers.data?.items ?? []).map((person) => ({ value: person.id, label: personLabel(person) }))}
          placeholder="All managers"
        />
        <Select
          label="Permission"
          value={params.permission}
          onChange={(event) => setParams({ permission: event.target.value })}
          options={PERMISSION_UI.map((entry) => ({ value: entry.key, label: entry.label }))}
          placeholder="All permissions"
        />
        <Select
          label="Setting"
          value={params.effect}
          onChange={(event) => setParams({ effect: event.target.value })}
          options={[
            { value: 'allow', label: 'Allowed' },
            { value: 'deny', label: 'Denied' },
          ]}
          placeholder="Allowed and denied"
        />
        {filtered && (
          <Button variant="ghost" onClick={() => setParams({ manager: '', permission: '', effect: '' })}>
            Clear filters
          </Button>
        )}
      </div>

      <QueryBoundary
        query={query}
        isEmpty={() => rows.length === 0}
        empty={
          <EmptyState
            icon={<ShieldCheck size={24} />}
            title={filtered ? 'No permissions match these filters' : 'No extra permissions have been set'}
            description={filtered ? 'Clear the filters to see everything.' : 'Every manager currently works within their own reporting line. Use “Add a permission” to open access or add a restriction.'}
          />
        }
      >
        {() => (
          <>
            <p aria-live="polite" style={{ marginBottom: 10 }}>
              {rows.length} {rows.length === 1 ? 'permission' : 'permissions'} in force. A denial always wins over an allowance.
            </p>
            <RecordList rows={rows} columns={columns} rowKey={(g) => g.id} caption="Permissions in force" />
          </>
        )}
      </QueryBoundary>

      {adding && <GrantDialog open onClose={() => setAdding(false)} existing={query.data ?? []} defaultGrantee={params.manager || undefined} />}
      <ConfirmDialog
        open={toRevoke !== null}
        tone="danger"
        title="Revoke this permission?"
        message={
          toRevoke
            ? `${
                toRevoke.effect === 'deny'
                  ? `The restriction “${permissionLabel(toRevoke.permission_key)}”${scopeSuffix(toRevoke)} on ${nameOf(toRevoke.grantee_user_id, 'the manager')} will be lifted`
                  : `${nameOf(toRevoke.grantee_user_id, 'The manager')} will lose “${permissionLabel(toRevoke.permission_key)}”${scopeSuffix(toRevoke)}`
              }. The change is recorded in the audit trail and takes effect immediately.`
            : ''
        }
        confirmLabel="Revoke"
        busy={revoke.isPending}
        onCancel={() => setToRevoke(null)}
        onConfirm={() => {
          if (!toRevoke) return
          revoke.mutate(toRevoke.id, {
            onSuccess: () => toast.success('Permission revoked.'),
            onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not revoke the permission.'),
            onSettled: () => setToRevoke(null),
          })
        }}
      />
    </section>
  )
}
