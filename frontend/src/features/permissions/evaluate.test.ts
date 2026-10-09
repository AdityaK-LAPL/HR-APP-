import { describe, expect, it } from 'vitest'
import type { MyPermissions } from '@/api/types'
import { evaluatePermission } from './evaluate'

const base: MyPermissions = {
  role: 'manager',
  unrestricted: false,
  role_defaults: [
    { permission_key: 'create_project', allow: true },
    { permission_key: 'modify_project', allow: false },
  ],
  grants: [],
}
const grant = (over: Partial<MyPermissions['grants'][number]>): MyPermissions['grants'][number] => ({
  permission_key: 'modify_project',
  scope_type: 'project',
  scope_id: 'p1',
  effect: 'allow',
  expires_at: null,
  ...over,
})

describe('evaluatePermission (UX hint only)', () => {
  it('is false until permissions have loaded', () => {
    expect(evaluatePermission(undefined, 'create_project')).toBe(false)
  })
  it('lets the Owner do everything', () => {
    expect(evaluatePermission({ ...base, role: 'owner', unrestricted: true }, 'anything')).toBe(true)
  })
  it('falls back to the role default', () => {
    expect(evaluatePermission(base, 'create_project')).toBe(true)
    expect(evaluatePermission(base, 'modify_project')).toBe(false)
    expect(evaluatePermission(base, 'unknown_key')).toBe(false)
  })
  it('an explicit allow for that scope beats a false default, but only for that scope', () => {
    const p = { ...base, grants: [grant({})] }
    expect(evaluatePermission(p, 'modify_project', { type: 'project', id: 'p1' })).toBe(true)
    expect(evaluatePermission(p, 'modify_project', { type: 'project', id: 'p2' })).toBe(false)
    expect(evaluatePermission(p, 'modify_project')).toBe(false)
  })
  it('an explicit deny beats an allow and a true default', () => {
    const p = {
      ...base,
      grants: [
        grant({ permission_key: 'create_project', scope_type: 'global', scope_id: null, effect: 'deny' }),
        grant({ permission_key: 'create_project', scope_type: 'global', scope_id: null, effect: 'allow' }),
      ],
    }
    expect(evaluatePermission(p, 'create_project')).toBe(false)
  })
  it('a global grant applies to any scope', () => {
    const p = { ...base, grants: [grant({ scope_type: 'global', scope_id: null })] }
    expect(evaluatePermission(p, 'modify_project', { type: 'project', id: 'anything' })).toBe(true)
  })
})
