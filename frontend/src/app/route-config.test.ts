import { describe, expect, it } from 'vitest'
import { ALL_ROLES, ROUTES, mobileBarForRole, navGroupsForRole, routeLabel, routesForRole } from './route-config'

describe('route config', () => {
  it('has unique paths', () => {
    expect(new Set(ROUTES.map((r) => r.path)).size).toBe(ROUTES.length)
  })

  it('shows administration screens to the owner only', () => {
    const paths = (role: 'owner' | 'manager' | 'employee') => routesForRole(role).map((r) => r.path)
    expect(paths('owner')).toEqual(expect.arrayContaining(['permissions', 'audit-logs', 'users']))
    expect(paths('manager')).toContain('users')
    expect(paths('manager')).not.toContain('permissions')
    expect(paths('employee')).not.toEqual(expect.arrayContaining(['users']))
    expect(paths('employee')).not.toContain('audit-logs')
  })

  it('lets employees reach the assignment-scoped customers and machines screens', () => {
    const employeePaths = routesForRole('employee').map((r) => r.path)
    expect(employeePaths).toEqual(expect.arrayContaining(['customers', 'machines']))
    const customers = ROUTES.find((r) => r.path === 'customers')!
    expect(routeLabel(customers, 'employee')).toBe('My customers')
    expect(routeLabel(customers, 'owner')).toBe('Customers')
  })

  it('gives every role a dashboard and at most four phone tabs, with Home first', () => {
    for (const role of ALL_ROLES) {
      const bar = mobileBarForRole(role)
      expect(bar.length).toBeGreaterThan(0)
      expect(bar.length).toBeLessThanOrEqual(4)
      expect(bar[0]?.path).toBe('dashboard')
    }
  })

  it('uses role-specific wording where defined', () => {
    const tasks = ROUTES.find((r) => r.path === 'tasks')!
    expect(routeLabel(tasks, 'employee')).toBe('My tasks')
    expect(routeLabel(tasks, 'owner')).toBe('Company tasks')
  })

  it('groups navigation by section without empty groups', () => {
    for (const role of ALL_ROLES) {
      for (const group of navGroupsForRole(role)) expect(group.routes.length).toBeGreaterThan(0)
    }
  })
})
