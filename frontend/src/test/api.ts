import { HttpResponse, http } from 'msw'
import type { UserProfile } from '@/api/types'
import { server } from './server'

export const BASE = 'http://localhost/api/v1'

export const owner: UserProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  employee_code: 'OWN001',
  name: 'Olivia Owner',
  designation: 'Owner',
  role: 'owner',
  manager_id: null,
  is_active: true,
  must_reset: false,
}
export const manager: UserProfile = {
  ...owner,
  id: '22222222-2222-4222-8222-222222222222',
  employee_code: 'MGR001',
  name: 'Manny Manager',
  designation: 'Service Manager',
  role: 'manager',
  manager_id: owner.id,
}
export const employee: UserProfile = {
  ...owner,
  id: '33333333-3333-4333-8333-333333333333',
  employee_code: 'EMP001',
  name: 'Erin Employee',
  designation: null,
  role: 'employee',
  manager_id: manager.id,
}

export const apiError = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status })

/** Public endpoints every screen needs. */
export function mockConfig() {
  server.use(
    http.get(`${BASE}/config`, () =>
      HttpResponse.json({
        company_timezone: 'Asia/Kolkata',
        utc_offset_minutes: 330,
        today: '2026-03-05',
      }),
    ),
  )
}

/** Cookies are not modelled: `signedInAs` controls what /auth/me answers. */
export function mockSession(user: UserProfile | null) {
  mockConfig()
  server.use(
    http.get(`${BASE}/auth/me`, () =>
      user ? HttpResponse.json(user) : apiError(401, 'authentication_failed', 'Not authenticated.'),
    ),
    http.get(`${BASE}/permissions/me`, () =>
      HttpResponse.json({
        role: user?.role ?? 'employee',
        unrestricted: user?.role === 'owner',
        role_defaults: [{ permission_key: 'create_project', allow: user?.role === 'manager' }],
        grants: [],
      }),
    ),
    http.get(`${BASE}/users/directory`, ({ request }) => {
      const ids = new URL(request.url).searchParams.getAll('ids')
      const known = [owner, manager, employee].filter((u) => ids.includes(u.id))
      return HttpResponse.json(
        known.map(({ id, name, employee_code, designation, role, is_active }) => ({
          id, name, employee_code, designation, role, is_active,
        })),
      )
    }),
  )
}
