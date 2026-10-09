import { KeyRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Section } from '@/components/ui/PageHeader'
import { useAuth } from '@/features/auth/authContext'
import { usePeople } from '@/features/people/usePeople'
import { labelOfRole } from './roles'

/** Basic account information. Read-only: profile changes are made by the Owner. */
export function ProfilePage() {
  const { user } = useAuth()
  const { nameOf, isLoading } = usePeople([user?.manager_id])
  if (!user) return null
  return (
    <section>
      <PageHeader title="My profile" description="Your account details." />
      <Section title="Account">
        <dl className="facts">
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Employee ID</dt>
          <dd>{user.employee_code}</dd>
          <dt>Role</dt>
          <dd>{labelOfRole(user.role)}</dd>
          <dt>Designation</dt>
          <dd>{user.designation ?? '—'}</dd>
          <dt>Reports to</dt>
          <dd>{user.manager_id ? (isLoading ? 'Loading…' : nameOf(user.manager_id)) : '—'}</dd>
          <dt>Account</dt>
          <dd>{user.is_active ? 'Active' : 'Deactivated'}</dd>
        </dl>
      </Section>
      <Section title="Security">
        <p style={{ marginBottom: 12, fontSize: 14 }}>Changing your password signs you out everywhere.</p>
        <Link to="/change-password" className="btn btn-outline">
          <KeyRound size={16} aria-hidden="true" /> Change password
        </Link>
      </Section>
      <p style={{ fontSize: 13 }}>Need your name, role or manager changed? Ask the company Owner.</p>
    </section>
  )
}
