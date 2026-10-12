// Authorization sweep: every operation in docs/openapi.json is called as an anonymous visitor, an
// Employee and a Manager of branch A, aimed at records of branch B (and at Owner-only operations).
// Nothing in branch B may ever be readable or changeable from branch A, and Owner-only operations
// must refuse everyone else. Bodies are generated from the schemas so that a request reaches the
// authorization check instead of stopping at validation.
//   E2E_REUSE=/path/to/data.json  skips seeding and reuses a company seeded by lib.seedCompany().
import { readFileSync } from 'node:fs'
import { Api, Matrix, PW, itemsOf, seedCompany } from './lib.mjs'

const spec = JSON.parse(readFileSync(new URL('../../docs/openapi.json', import.meta.url), 'utf8'))
const m = new Matrix()
const data = process.env.E2E_REUSE ? JSON.parse(readFileSync(process.env.E2E_REUSE, 'utf8')) : (await seedCompany()).data
const { users, today } = data
const as = async (code) => { const a = await Api.anonymous(); const r = await a.login(code, PW(code)); if (r.status !== 200) throw new Error(`login ${code} ${r.status}`); return a }
const [OWN, A1, MA, MB, B1] = [await as('OWN001'), await as('EMPA1'), await as('MGRA'), await as('MGRB'), await as('EMPB1')]

// ---- records that belong to branch B (created by its own people)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const visit = await B1.must('POST', `/service-calls/${data.callB.id}/visits`, { visit_type: 'field_visit', visit_date: today, work_performed: 'B visit' })
const report = await B1.must('POST', `/service-calls/${data.callB.id}/report`, { report_datetime: new Date().toISOString(), work_performed: 'x', problem_found: 'x', action_taken: 'x', result: 'x' })
const contact = (await MB.must('POST', `/customers/${data.customerB.id}/contacts`, { name: 'B Contact', phone: '1' }))
const assignments = await MB.must('GET', `/service-calls/${data.callB.id}/assignments`)
const att = await B1.req('POST', '/attachments', { multipart: { entity_type: 'task', entity_id: data.taskB1.id, file: { name: 'b.png', mimeType: 'image/png', buffer: png } } })
const grantBody = { grantee_user_id: users.MGRB.id, permission_key: 'view_manager_team', scope_type: 'user', scope_id: users.MGRA.id, effect: 'allow' }
const made = await OWN.post('/permissions/grants', grantBody)
const grant = made.status < 300 ? made.body : itemsOf((await OWN.must('GET', '/permissions/grants'))).find((g) => g.grantee_user_id === users.MGRB.id && g.permission_key === 'view_manager_team')
const notif = itemsOf((await B1.must('GET', '/notifications')))[0]?.id ?? '00000000-0000-0000-0000-000000000001'
const ID = {
  user_id: users.EMPB1.id, task_id: data.taskB1.id, project_id: data.projectB.id, leave_id: data.leaveB1.id, eod_id: data.eodB1.id,
  service_call_id: data.callB.id, customer_id: data.customerB.id, machine_id: data.machineB.id, visit_id: visit.id, report_id: report.id,
  contact_id: contact.id, assignment_id: itemsOf(assignments)[0]?.id ?? assignments[0]?.id, attachment_id: att.body?.id, grant_id: grant.id,
  notification_id: notif, work_date: today,
}

// ---- body generator from the OpenAPI schemas
const resolve = (s) => (s?.$ref ? spec.components.schemas[s.$ref.split('/').pop()] : s)
const sample = (schema, name = '') => {
  const s = resolve(schema)
  if (!s) return null
  if (s.anyOf) return sample(s.anyOf.find((x) => x.type !== 'null') ?? s.anyOf[0], name)
  if (s.enum) return s.enum[0]
  if (s.type === 'string') {
    if (s.format === 'uuid') return name.includes('user') || name.includes('employee') || name.includes('manager') || name === 'grantee_user_id' ? users.EMPB1.id : ID.task_id
    if (s.format === 'date') return today
    if (s.format === 'date-time') return new Date().toISOString()
    return 'x'.repeat(Math.max(s.minLength ?? 1, 8))
  }
  if (s.type === 'integer' || s.type === 'number') return s.minimum ?? 1
  if (s.type === 'boolean') return false
  if (s.type === 'array') return []
  if (s.type === 'object' || s.properties) {
    const o = {}
    for (const k of s.required ?? []) o[k] = sample(s.properties[k], k)
    return o
  }
  return null
}
const OVERRIDES = {
  'POST /users': { employee_code: 'SWEEPX', name: 'Sweep', role: 'employee', manager_id: users.MGRB.id, initial_password: 'Temp#Swp-2026#x' },
  'PATCH /users/{user_id}': { name: 'Hijacked', role: 'owner' },
  'POST /users/{user_id}/reset-password': { temporary_password: 'Hack#Temp#2026' },
  'PATCH /hierarchy/{user_id}/manager': { manager_id: users.OWN001.id },
  'POST /permissions/grants': { grantee_user_id: users.EMPA1.id, permission_key: 'view_manager_reports', scope_type: 'global', effect: 'allow' },
  'PATCH /tasks/{task_id}': { title: 'Hijacked' }, 'PATCH /projects/{project_id}': { name: 'Hijacked' },
  'POST /projects/{project_id}/members': { user_id: users.EMPA1.id }, 'POST /leaves/{leave_id}/approve': {}, 'POST /leaves/{leave_id}/reject': { comments: 'no' },
  'POST /leaves/{leave_id}/cancel': {}, 'PATCH /customers/{customer_id}': { name: 'Hijacked' }, 'PATCH /machines/{machine_id}': { model_name: 'Hijacked' },
  'PATCH /service-calls/{service_call_id}': { priority: 'low' }, 'POST /service-calls/{service_call_id}/assign': { employee_id: users.EMPA2.id },
  'POST /service-calls/{service_call_id}/visits': { visit_type: 'field_visit', visit_date: today, work_performed: 'x' },
  'POST /service-reports/{report_id}/review': { comments: 'ok' }, 'PATCH /service-visits/{visit_id}': { work_performed: 'Hijacked' },
  'POST /customers/{customer_id}/contacts': { name: 'X', phone: '1' }, 'PATCH /customers/{customer_id}/contacts/{contact_id}': { name: 'Hijacked' },
}
// operations that only the Owner may perform, whoever the target is
const OWNER_ONLY = new Set(['POST /users', 'PATCH /hierarchy/{user_id}/manager', 'GET /permissions/definitions', 'GET /permissions/grants', 'POST /permissions/grants', 'DELETE /permissions/grants/{grant_id}', 'GET /audit-logs'])
// operations that are about the caller themself or are public, so a 2xx is correct
const SELF_OK = new Set(['GET /auth/me', 'POST /auth/logout', 'POST /auth/refresh', 'POST /auth/change-password', 'POST /auth/login', 'GET /health', 'GET /health/db', 'GET /config', 'GET /permissions/me', 'GET /notifications', 'POST /notifications/read-all', 'POST /notifications/{notification_id}/read', 'GET /users/directory', 'GET /calendar', 'GET /search'])

// things that are the caller's own to create, or that the contract gives every Manager
const SELF_CREATE = new Set(['POST /leaves', 'POST /eod', 'POST /attendance/punch-in', 'POST /attendance/punch-out', 'POST /projects', 'POST /customers', 'POST /machines', 'POST /service-calls'])
const MANAGER_SEES_ALL = new Set(['GET /customers', 'GET /machines', 'GET /customers/{customer_id}', 'GET /customers/{customer_id}/contacts', 'GET /machines/{machine_id}'])
const B_MARKERS = [data.taskB1.id, data.projectB.id, data.leaveB1.id, data.eodB1.id, data.callB.id, users.EMPB1.id, users.MGRB.id, 'Replace conveyor belt', 'SC-3001', 'Ben Engineer', 'Bob Manager', 'Conveyor refit']
const B_MARKERS_CATALOGUE = [data.customerB.id, data.machineB.id, 'Zenith Castings', 'MC-91']
const fill = (path) => path.replace(/\{(\w+)\}/g, (_, k) => ID[k] ?? '00000000-0000-0000-0000-000000000000')
const ops = []
for (const [path, item] of Object.entries(spec.paths)) for (const method of ['get', 'post', 'patch', 'delete']) if (item[method]) ops.push({ method: method.toUpperCase(), path: path.replace('/api/v1', ''), op: item[method] })
const query = (op) => (op.parameters ?? []).filter((p) => p.in === 'query' && p.required).map((p) => `${p.name}=${p.name === 'entity_type' ? 'task' : p.name === 'entity_id' ? data.taskB1.id : p.name.endsWith('date') ? today : '1'}`).join('&')
const bodyFor = (key, op) => {
  if (OVERRIDES[key]) return OVERRIDES[key]
  const sch = op.requestBody?.content?.['application/json']?.schema
  return sch ? sample(sch) : undefined
}

const seen = []
for (const { method, path, op } of ops) {
  const key = `${method} ${path}`
  if (path.startsWith('/auth/') || path.startsWith('/health')) continue
  if (op.requestBody?.content?.['multipart/form-data']) continue // uploads are covered by api-audit
  const url = fill(path) + (query(op) ? `?${query(op)}` : '')
  const body = bodyFor(key, op)
  // anonymous
  const anon = await Api.anonymous()
  const ra = await anon.req(method, url, { data: body, csrf: false })
  m.add('anonymous', 'visitor', key, '401/403', ra.status, ra.status === 401 || ra.status === 403 || (SELF_OK.has(key) && ra.status === 200 && key === 'GET /config'))
  await anon.dispose()
  for (const [who, api] of [['employee A', A1], ['manager A', MA]]) {
    const r = await api.req(method, url, { data: body })
    seen.push([who, key, r.status])
    const hasPathParam = path.includes('{')
    const text = JSON.stringify(r.body ?? '')
    const leaks = (list) => list.filter((x) => text.includes(x))
    if (OWNER_ONLY.has(key)) m.add('owner-only', who, key, '403', r.status, r.status === 403)
    else if (SELF_OK.has(key) || SELF_CREATE.has(key) || (!hasPathParam && method === 'GET')) {
      const bad = who === 'manager A' && MANAGER_SEES_ALL.has(key) ? leaks(B_MARKERS) : leaks([...B_MARKERS, ...B_MARKERS_CATALOGUE])
      const fine = (r.status < 300 || [403, 404, 409, 422].includes(r.status)) && bad.length === 0
      m.add('lists and own records show nothing of branch B', who, key, 'no branch B data', `${r.status}${bad.length ? ' LEAKS ' + bad.join(',') : ''}`, fine)
    } else if (who === 'manager A' && MANAGER_SEES_ALL.has(key)) m.add('catalogue (managers see all by design)', who, key, '200', r.status, r.status === 200)
    else m.add('branch B isolation', who, key, '403/404/422', r.status, [403, 404, 422].includes(r.status))
  }
}
// "caller-scoped" lists must contain nothing of branch B
for (const [who, api] of [['employee A', A1], ['manager A', MA]]) {
  const cal = await api.get(`/calendar?start_date=${today}&end_date=2026-12-31`); const txt = JSON.stringify(cal.body)
  m.add('caller-scoped', who, 'GET /calendar shows nothing of branch B', 'no B titles', cal.status, !/Replace conveyor belt/.test(txt))
  const notes = await api.get('/notifications'); m.add('caller-scoped', who, 'GET /notifications is only mine', 'ok', notes.status, notes.status === 200)
  // By design the directory resolves any id the caller already holds (they are unguessable) to a
  // display name - but only that: no contact details, hierarchy or anything else.
  const dir = await api.get(`/users/directory?ids=${users.EMPB1.id}&ids=${users.MGRB.id}`)
  const keys = new Set((Array.isArray(dir.body) ? dir.body : []).flatMap((e) => Object.keys(e)))
  const allowed = ['id', 'name', 'employee_code', 'designation', 'role', 'is_active']
  m.add('caller-scoped', who, 'GET /users/directory returns display fields only', allowed.join(','), [...keys].join(','), [...keys].every((k) => allowed.includes(k)))
}
m.print('Authorization sweep')
m.save('/tmp/authz-sweep.json')
process.exit(m.failed.length ? 1 : 0)
