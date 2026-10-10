import { Link } from 'react-router-dom'
import { QueryBoundary } from '@/components/data/QueryBoundary'
import { EmptyState } from '@/components/ui/EmptyState'
import { labelOfRole } from '@/features/profile/roles'
import { useAuth } from '@/features/auth/authContext'
import { ArrowRightLeft } from 'lucide-react'
import { useState } from 'react'
import { ChangeManagerDialog } from '@/features/admin/PersonAdmin'
import { Button } from '@/components/ui/Button'
import { buildTree, type TreeNode } from './tree'
import { useHierarchy } from './queries'

function Branch({ node, selfId, onMove }: { node: TreeNode; selfId: string | undefined; onMove: ((node: TreeNode) => void) | undefined }) {
  return (
    <li>
      <Link className="inline-link" to={`/users/${node.id}`}>{node.name}</Link>
      {node.id === selfId ? ' (you)' : ''} <span className="badge badge-neutral">{labelOfRole(node.role)}</span>{' '}
      <span style={{ color: 'var(--text-muted)' }}>{node.employee_code}</span>
      {onMove && node.role !== 'owner' && (
        <>
          {' '}
          <Button size="sm" variant="ghost" icon={<ArrowRightLeft size={14} />} onClick={() => onMove(node)} aria-label={`Change manager for ${node.name}`}>
            Move
          </Button>
        </>
      )}
      {node.children.length > 0 && (
        <ul className="org-tree">
          {node.children.map((child) => (
            <Branch key={child.id} node={child} selfId={selfId} onMove={onMove} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function OrgStructure() {
  const { user } = useAuth()
  const query = useHierarchy()
  const [moving, setMoving] = useState<TreeNode | null>(null)
  const isOwner = user?.role === 'owner'
  return (
    <QueryBoundary
      query={query}
      isEmpty={(nodes) => nodes.length <= 1}
      empty={<EmptyState title="No reporting structure yet" description="When people are assigned to you, they appear here." />}
    >
      {(nodes) => (
        <div className="glass-card" style={{ padding: 16 }}>
          <ul className="org-tree org-root" aria-label="Reporting structure">
            {buildTree(nodes).map((root) => (
              <Branch key={root.id} node={root} selfId={user?.id} onMove={isOwner ? setMoving : undefined} />
            ))}
          </ul>
          {moving && <ChangeManagerDialog person={moving} open onClose={() => setMoving(null)} />}
        </div>
      )}
    </QueryBoundary>
  )
}
