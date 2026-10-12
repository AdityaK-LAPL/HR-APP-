// Shared helpers for the end-to-end audit scripts (see README.md).
// They drive the real stack: the production build served by `vite preview` (which proxies /api)
// in front of the FastAPI backend and the real database. Nothing is mocked.
import { chromium, request as pwRequest } from 'playwright'
import { writeFileSync } from 'node:fs'

export const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:4173'
export const OWNER = { code: 'OWN001', password: process.env.OWNER_PASSWORD ?? 'TempOwner#2026a' }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const eventually = async (fn, ms = 30000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { /* retry */ }
    await sleep(300)
  }
  return false
}

/** One row per check: the audit's workflow matrix. */
export class Matrix {
  rows = []
  problems = []
  add(area, role, scenario, expected, actual, pass) {
    this.rows.push({ area, role, scenario, expected, actual: String(actual), pass: !!pass })
    if (process.env.E2E_LIVE) console.error(`${pass ? 'pass' : 'FAIL'} [${area}] ${role}: ${scenario}${pass ? '' : ` -- got ${String(actual).slice(0, 160)}`}`)
  }
  /** Run a check; a thrown error is a failure. */
  async check(area, role, scenario, fn) {
    try {
      const v = await fn()
      this.add(area, role, scenario, 'ok', v === true || v === undefined ? 'ok' : v, v !== false && !(typeof v === 'string' && v.startsWith('FAIL')))
    } catch (e) {
      this.add(area, role, scenario, 'ok', e.message.split('\n')[0].slice(0, 220), false)
    }
  }
  /** Expect an HTTP status (or one of several). */
  expectStatus(area, role, scenario, res, ...allowed) {
    this.add(area, role, scenario, allowed.join('/'), res.status, allowed.includes(res.status))
    return res
  }
  get failed() { return this.rows.filter((r) => !r.pass) }
  print(title) {
    const areas = [...new Set(this.rows.map((r) => r.area))]
    console.log(`\n===== ${title} =====`)
    for (const a of areas) {
      const rs = this.rows.filter((r) => r.area === a)
      console.log(`\n## ${a}  (${rs.filter((r) => r.pass).length}/${rs.length})`)
      for (const r of rs) console.log(`${r.pass ? 'PASS' : 'FAIL'}  [${r.role}] ${r.scenario}${r.pass ? '' : `  -- expected ${r.expected}, got ${r.actual}`}`)
    }
    console.log(`\n${this.rows.filter((r) => r.pass).length}/${this.rows.length} checks passed; ${this.failed.length} failed`)
  }
  save(file) { writeFileSync(file, JSON.stringify(this.rows, null, 1)) }
}

/** An API session with its own cookie jar; mirrors what the browser does (cookies + CSRF header). */
export class Api {
  constructor(ctx, who) { this.ctx = ctx; this.who = who }
  static async anonymous() { return new Api(await pwRequest.newContext({ baseURL: BASE }), 'anonymous') }
  async csrf() { return (await this.ctx.storageState()).cookies.find((c) => c.name === 'csrf_token')?.value ?? '' }
  async cookies() { return (await this.ctx.storageState()).cookies }
  async req(method, path, { data, headers = {}, csrf = true, multipart, tries = 3 } = {}) {
    for (let i = 1; ; i += 1) {
      const h = { ...headers }
      if (csrf && method !== 'GET' && !('X-CSRF-Token' in h)) h['X-CSRF-Token'] = await this.csrf()
      let res
      try { res = await this.ctx.fetch(`/api/v1${path}`, { method, data, multipart, headers: h, timeout: 120000 }) } catch (e) { if (i >= tries) throw e; await sleep(2000); continue }
      if (res.status() >= 502 && res.status() <= 504 && i < tries) { await sleep(2000); continue }
      // like the browser: an expired access token (15 min) is renewed once with the refresh cookie
      if (res.status() === 401 && !path.startsWith('/auth/') && !this.refreshing) {
        this.refreshing = true
        const rr = await this.ctx.fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'X-CSRF-Token': await this.csrf() } }).finally(() => { this.refreshing = false })
        if (rr.status() === 200) continue
      }
      let body = null
      const text = await res.text().catch(() => '')
      try { body = text ? JSON.parse(text) : null } catch { body = text }
      return { status: res.status(), body, headers: res.headers() }
    }
  }
  get(path, o) { return this.req('GET', path, o) }
  post(path, data, o) { return this.req('POST', path, { ...o, data }) }
  patch(path, data, o) { return this.req('PATCH', path, { ...o, data }) }
  del(path, o) { return this.req('DELETE', path, o) }
  async login(code, password) {
    for (let i = 0; i < 4; i += 1) {
      const r = await this.req('POST', '/auth/login', { data: { employee_code: code, password }, csrf: false })
      if (r.status < 500) return r
      await sleep(2500)
    }
    throw new Error(`login ${code} kept failing`)
  }
  /** Succeeds or throws - for seeding. */
  async must(method, path, data, o) {
    const r = await this.req(method, path, { ...o, data })
    if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
    return r.body
  }
  async dispose() { await this.ctx.dispose() }
}

export const itemsOf = (body) => (Array.isArray(body) ? body : (body?.items ?? []))
export const idsOf = (body) => itemsOf(body).map((x) => x.id)

export async function launch() { return chromium.launch() }

/** Fixed passwords for the seeded audit company (changed from their temporary ones on first login). */
const mix = (code) => [...code].reverse().join('')
export const TEMP = (code) => `Temp#${mix(code)}#2026`
export const PW = (code) => `Audit#${mix(code)}#2026`

/**
 * Seeds a company through the real API: Owner -> two peer branches.
 *   Branch A: manager MGRA with employees EMPA1, EMPA2.   Branch B: manager MGRB with employee EMPB1.
 * plus tasks, a project, leave, EOD, attendance, a customer/machine/service call, and an attachment.
 * Expects a freshly seeded Owner (python -m scripts.seed_owner) whose password is OWNER_PASSWORD.
 */
export async function seedCompany() {
  const apis = {}
  const login = async (code, temp) => {
    const a = await Api.anonymous()
    let r = await a.login(code, temp)
    if (r.status !== 200) throw new Error(`login ${code}: ${r.status} ${JSON.stringify(r.body)}`)
    const cp = await a.post('/auth/change-password', { current_password: temp, new_password: PW(code) })
    if (cp.status >= 400) throw new Error(`change-password ${code}: ${cp.status} ${JSON.stringify(cp.body)}`)
    r = await a.login(code, PW(code))
    if (r.status !== 200) throw new Error(`relogin ${code}: ${r.status}`)
    return a
  }
  apis.OWN001 = await login(OWNER.code, OWNER.password)
  const me = await apis.OWN001.must('GET', '/auth/me')
  const mk = (code, name, designation, role, manager_id) => apis.OWN001.must('POST', '/users', { employee_code: code, name, designation, role, manager_id, initial_password: TEMP(code) })
  const users = {}
  users.OWN001 = me
  users.MGRA = await mk('MGRA', 'Alice Manager', 'Service Manager', 'manager', me.id)
  users.MGRB = await mk('MGRB', 'Bob Manager', 'Plant Manager', 'manager', me.id)
  users.EMPA1 = await mk('EMPA1', 'Ann Engineer', 'Service Engineer', 'employee', users.MGRA.id)
  users.EMPA2 = await mk('EMPA2', 'Abe Technician', 'Technician', 'employee', users.MGRA.id)
  users.EMPB1 = await mk('EMPB1', 'Ben Engineer', 'Service Engineer', 'employee', users.MGRB.id)
  for (const code of ['MGRA', 'MGRB', 'EMPA1', 'EMPA2', 'EMPB1']) apis[code] = await login(code, TEMP(code))

  const cfg = (await apis.OWN001.must('GET', '/config'))
  const today = cfg.today
  const data = { users, today }
  data.taskA1 = await apis.MGRA.must('POST', '/tasks', { title: 'Calibrate press line 3', assigned_to: users.EMPA1.id, priority: 'high', task_date: today, due_date: today })
  data.taskA2 = await apis.MGRA.must('POST', '/tasks', { title: 'Inspect coolant pump', assigned_to: users.EMPA2.id, priority: 'medium', task_date: today })
  data.taskB1 = await apis.MGRB.must('POST', '/tasks', { title: 'Replace conveyor belt', assigned_to: users.EMPB1.id, priority: 'medium', task_date: today })
  data.projectA = await apis.MGRA.must('POST', '/projects', { name: 'Line 3 upgrade', description: 'Upgrade the third line', status: 'in_progress', start_date: today })
  await apis.MGRA.must('POST', `/projects/${data.projectA.id}/members`, { user_id: users.EMPA1.id, role_in_project: 'engineer' })
  data.projectB = await apis.MGRB.must('POST', '/projects', { name: 'Conveyor refit', status: 'planning' })
  await apis.MGRB.must('POST', `/projects/${data.projectB.id}/members`, { user_id: users.EMPB1.id })
  data.leaveA1 = await apis.EMPA1.must('POST', '/leaves', { start_date: '2026-12-07', end_date: '2026-12-08', reason: 'Family function' })
  data.leaveB1 = await apis.EMPB1.must('POST', '/leaves', { start_date: '2026-12-09', end_date: '2026-12-09', reason: 'Medical' })
  data.eodA1 = await apis.EMPA1.must('POST', '/eod', { report_date: today, work_completed: 'Calibrated the press', work_remaining: 'Final test', issues: 'None' })
  data.eodB1 = await apis.EMPB1.must('POST', '/eod', { report_date: today, work_completed: 'Belt measured', work_remaining: 'Order belt' })
  await apis.EMPA1.must('POST', '/attendance/punch-in', { latitude: 12.97, longitude: 77.59 })
  await apis.EMPB1.must('POST', '/attendance/punch-in', {})
  data.customer = await apis.MGRA.must('POST', '/customers', { customer_code: 'CU-7', name: 'Acme Forgings', address: 'Plot 9, Peenya' })
  await apis.MGRA.must('POST', `/customers/${data.customer.id}/contacts`, { name: 'Priya Nair', phone: '+91 98450 00000', is_primary: true })
  data.machine = await apis.MGRA.must('POST', '/machines', { customer_id: data.customer.id, machine_code: 'MC-88', model_name: 'VMC-850', serial_number: 'SN-5521' })
  data.call = await apis.MGRA.must('POST', '/service-calls', { service_call_code: 'SC-2001', customer_id: data.customer.id, machine_id: data.machine.id, contacted_at: new Date().toISOString(), contact_method: 'phone', issue_reported: 'Spindle vibrates', priority: 'urgent', service_type: 'field_visit' })
  data.assignment = await apis.MGRA.must('POST', `/service-calls/${data.call.id}/assign`, { employee_id: users.EMPA1.id })
  data.customerB = await apis.MGRB.must('POST', '/customers', { customer_code: 'CU-9', name: 'Zenith Castings' })
  data.machineB = await apis.MGRB.must('POST', '/machines', { customer_id: data.customerB.id, machine_code: 'MC-91', model_name: 'HMC-500' })
  data.callB = await apis.MGRB.must('POST', '/service-calls', { service_call_code: 'SC-3001', customer_id: data.customerB.id, machine_id: data.machineB.id, contacted_at: new Date().toISOString(), contact_method: 'email', issue_reported: 'Tool changer jams', priority: 'high', service_type: 'field_visit' })
  await apis.MGRB.must('POST', `/service-calls/${data.callB.id}/assign`, { employee_id: users.EMPB1.id })
  return { apis, data }
}
