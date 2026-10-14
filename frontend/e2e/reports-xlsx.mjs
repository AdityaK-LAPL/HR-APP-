// Real-stack check of the attendance reports feature (post-Prompt 18): work mode at punch-in, half-day
// and comp-off leave, the four Excel downloads (opened and read back), the Owner-granted permission,
// the analytics screen and the company settings screen - API first, then the real browser.
// Needs a database holding only the Owner (see README). Reads the workbooks with openpyxl:
// XLSX_PYTHON points at a python that has it (default ~/.venvs/uat-tools/bin/python).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { BASE, Matrix, PW, eventually, launch, seedCompany } from './lib.mjs'

const m = new Matrix()
const PY = process.env.XLSX_PYTHON ?? join(homedir(), '.venvs/uat-tools/bin/python')
const dir = mkdtempSync(join(tmpdir(), 'xlsx-'))
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Every cell of every sheet as one text blob (so a check can look for words), plus the sheet names. */
function readWorkbook(bytes, name) {
  const file = join(dir, name)
  writeFileSync(file, bytes)
  const code = 'import sys,json,openpyxl\nwb=openpyxl.load_workbook(sys.argv[1])\nprint(json.dumps({"sheets":wb.sheetnames,"text":" | ".join(str(c.value) for ws in wb for r in ws.iter_rows() for c in r if c.value is not None),"formulas":sum(1 for ws in wb for r in ws.iter_rows() for c in r if c.data_type=="f")}))'
  return JSON.parse(execFileSync(PY, ['-I', '-c', code, file], { encoding: 'utf8' }))
}
const bytesOf = async (api, path) => {
  const res = await api.ctx.fetch(`/api/v1${path}`, { timeout: 120000 })
  return { status: res.status(), headers: res.headers(), body: Buffer.from(await res.body()) }
}

const { apis, data } = await seedCompany()
const { OWN001: owner, MGRA, MGRB, EMPA1, EMPA2, EMPB1 } = apis
const { users, today } = data
const month = today.slice(0, 7)

// ------------------------------------------------------------------ employee side
await m.check('Employee', 'EMPA2', 'punch in on duty with a place', async () => {
  const r = await EMPA2.post('/attendance/punch-in', { work_mode: 'on_duty', remark: 'Acme Forgings', latitude: 13.0, longitude: 77.5 })
  return r.status === 201 || r.status === 200 ? r.body.work_mode === 'on_duty' && r.body.remark === 'Acme Forgings' : `FAIL ${r.status} ${JSON.stringify(r.body)}`
})
await m.check('Employee', 'EMPB1', 'a punch-in with a made-up work mode is refused', async () => (await EMPB1.post('/attendance/punch-in', { work_mode: 'moon_base' })).status === 422)
await m.check('Employee', 'EMPA2', 'a half day and a comp-off are accepted, approved by the manager', async () => {
  const half = await EMPA2.post('/leaves', { start_date: '2026-12-21', end_date: '2026-12-21', leave_kind: 'half_day', reason: 'Bank visit' })
  const comp = await EMPA2.post('/leaves', { start_date: '2026-12-22', end_date: '2026-12-22', leave_kind: 'comp_off', reason: 'Worked Saturday' })
  if (half.status !== 201 || comp.status !== 201) return `FAIL ${half.status}/${comp.status} ${JSON.stringify(half.body)}`
  const ok = half.body.days === 0.5 && comp.body.days === 0
  await MGRA.post(`/leaves/${half.body.id}/approve`, {})
  await MGRA.post(`/leaves/${comp.body.id}/approve`, {})
  return ok || `FAIL days ${half.body.days}/${comp.body.days}`
})
await m.check('Employee', 'EMPA2', 'a half day over two dates is refused', async () => (await EMPA2.post('/leaves', { start_date: '2026-12-23', end_date: '2026-12-24', leave_kind: 'half_day' })).status === 422)

// ------------------------------------------------------------------ access
const paths = [`/reports/attendance-analytics?month=${month}`, '/reports/leave-analytics', `/reports/exports/attendance-monthly?employee_id=${users.EMPA1.id}&month=${month}`, `/reports/exports/attendance-daily?date=${today}`, `/reports/exports/leave-card?employee_id=${users.EMPA1.id}`, `/reports/exports/attendance-summary?month=${month}`]
for (const [who, api] of [['EMPA1', EMPA1], ['MGRA', MGRA], ['MGRB', MGRB]]) {
  await m.check('Access', who, 'every company report route is 403 before the Owner grants anything', async () => {
    const codes = []
    for (const p of paths) codes.push((await api.get(p)).status)
    return codes.every((c) => c === 403) || `FAIL ${codes}`
  })
}
await m.check('Access', 'anonymous', 'no session, no report', async () => {
  const { Api } = await import('./lib.mjs'); const a = await Api.anonymous()
  return (await a.get(paths[0])).status === 401
})

// ------------------------------------------------------------------ the Owner's downloads
const files = {}
for (const [key, path, namePattern, sheetWords] of [
  ['monthly', `/reports/exports/attendance-monthly?employee_id=${users.EMPA2.id}&month=${month}`, /^attachment; filename=.*Attendance_Abe_Technician_.*\.xlsx/, ['Abe Technician', 'OD', 'Acme Forgings']],
  ['daily', `/reports/exports/attendance-daily?date=${today}`, new RegExp(`DayReport_${today}\\.xlsx`), ['Ann Engineer', 'Abe Technician', 'Acme Forgings']],
  ['card', `/reports/exports/leave-card?employee_id=${users.EMPA2.id}`, /LeaveCard_Abe_Technician\.xlsx/, ['Abe Technician', 'Bank visit']],
  ['summary', `/reports/exports/attendance-summary?month=${month}`, /AttendanceSummary_.*\.xlsx/, ['Ann Engineer', 'Ben Engineer', 'Abe Technician']],
]) {
  await m.check('Owner downloads', 'OWN001', `${key}: a real .xlsx with the right name and content`, async () => {
    const r = await bytesOf(owner, path)
    if (r.status !== 200) return `FAIL status ${r.status}`
    if (!r.headers['content-type']?.startsWith(XLSX)) return `FAIL type ${r.headers['content-type']}`
    if (!namePattern.test(r.headers['content-disposition'] ?? '')) return `FAIL name ${r.headers['content-disposition']}`
    if (!/no-store/.test(r.headers['cache-control'] ?? '')) return `FAIL cache ${r.headers['cache-control']}`
    if (r.body.subarray(0, 2).toString() !== 'PK') return 'FAIL not a zip'
    const wb = readWorkbook(r.body, `${key}.xlsx`)
    files[key] = wb
    const missing = sheetWords.filter((w) => !wb.text.includes(w))
    return missing.length === 0 && wb.formulas === 0 ? true : `FAIL missing ${missing} formulas ${wb.formulas}`
  })
}
await m.check('Owner downloads', 'OWN001', 'the summary has the day-by-day register as a second sheet', async () => files.summary.sheets.length >= 2 || `FAIL ${files.summary.sheets}`)
await m.check('Owner downloads', 'OWN001', 'a hostile name is stored as text, never a formula, and cannot break the sheet name', async () => {
  const evil = await owner.post('/users', { employee_code: 'EVIL1', name: '=HYPERLINK("http://evil/x","y")', designation: '@SUM(1)', role: 'employee', manager_id: users.MGRA.id, initial_password: 'Zq!8wLm#Plant' })
  if (evil.status !== 201) return `FAIL create ${evil.status} ${JSON.stringify(evil.body)}`
  const checks = []
  for (const path of [`/reports/exports/attendance-monthly?employee_id=${evil.body.id}&month=${month}`, `/reports/exports/leave-card?employee_id=${evil.body.id}`, `/reports/exports/attendance-daily?date=${today}`, `/reports/exports/attendance-summary?month=${month}`]) {
    const r = await bytesOf(owner, path)
    checks.push(r.status === 200 ? readWorkbook(r.body, 'evil.xlsx').formulas : `status ${r.status}`)
  }
  return checks.every((c) => c === 0) || `FAIL ${checks}`
})
await m.check('Owner downloads', 'OWN001', 'bad input is refused cleanly', async () => {
  const a = await owner.get('/reports/exports/attendance-monthly?employee_id=00000000-0000-4000-8000-000000000000&month=' + month)
  const b = await owner.get('/reports/attendance-analytics?month=2026-13')
  return a.status === 404 && b.status === 422 || `FAIL ${a.status}/${b.status}`
})
await m.check('Owner analytics', 'OWN001', 'analytics cover the whole company', async () => {
  const r = await owner.get(`/reports/attendance-analytics?month=${month}`)
  const names = r.body.people.map((p) => p.name)
  return r.status === 200 && ['Ann Engineer', 'Abe Technician', 'Ben Engineer'].every((n) => names.includes(n)) && r.body.by_type.length > 0 || `FAIL ${r.status} ${names}`
})
await m.check('Owner analytics', 'OWN001', 'the leave analytics count the half day as 0.5 and the comp-off as 0', async () => {
  const r = await owner.get('/reports/leave-analytics?financial_year=2026')
  const row = r.body.people.find((p) => p.name === 'Abe Technician')
  return !!row && row.half_days === 1 && row.comp_off_days === 1 && row.leave_days === 0.5 || `FAIL ${JSON.stringify(row)}`
})
await m.check('Audit', 'OWN001', 'every download is in the audit trail', async () => {
  const r = await owner.get('/audit-logs?action=report.downloaded&page_size=50')
  return (r.body.items?.length ?? 0) >= 5 || `FAIL ${r.body?.items?.length}`
})

// ------------------------------------------------------------------ the permission
let grantId
await m.check('Permission', 'OWN001', 'grant MGRA "Download company attendance reports"', async () => {
  const r = await owner.post('/permissions/grants', { grantee_user_id: users.MGRA.id, permission_key: 'download_company_reports', scope_type: 'global', scope_id: null, effect: 'allow' })
  grantId = r.body?.id
  return r.status === 201 || `FAIL ${r.status} ${JSON.stringify(r.body)}`
})
await m.check('Permission', 'MGRA', 'now sees the whole company in the analytics, including the other branch', async () => {
  const r = await MGRA.get(`/reports/attendance-analytics?month=${month}`)
  return r.status === 200 && r.body.people.some((p) => p.name === 'Ben Engineer') || `FAIL ${r.status}`
})
await m.check('Permission', 'MGRA', 'can download, and the download is audited under MGRA', async () => {
  const r = await bytesOf(MGRA, `/reports/exports/attendance-daily?date=${today}`)
  const log = await owner.get('/audit-logs?action=report.downloaded&page_size=50')
  return r.status === 200 && log.body.items.some((i) => i.actor_user_id === users.MGRA.id) || `FAIL ${r.status}`
})
await m.check('Permission', 'MGRA', 'still sees only her own branch everywhere else', async () => {
  const r = await MGRA.get('/users?page_size=100')
  const names = (r.body.items ?? []).map((u) => u.name)
  return !names.includes('Ben Engineer') && names.includes('Ann Engineer') || `FAIL ${names}`
})
await m.check('Permission', 'MGRB', 'a different manager gets nothing from MGRA\'s grant', async () => (await MGRB.get(paths[0])).status === 403)
await m.check('Permission', 'OWN001', 'a revoke closes it again', async () => {
  const r = await owner.del(`/permissions/grants/${grantId}`)
  return r.status === 204 && (await MGRA.get(paths[0])).status === 403 || `FAIL ${r.status}`
})
await m.check('Permission', 'OWN001', 'a deny beats an allow', async () => {
  await owner.post('/permissions/grants', { grantee_user_id: users.MGRA.id, permission_key: 'download_company_reports', scope_type: 'global', scope_id: null, effect: 'allow' })
  const deny = await owner.post('/permissions/grants', { grantee_user_id: users.MGRA.id, permission_key: 'download_company_reports', scope_type: 'global', scope_id: null, effect: 'deny' })
  const status = (await MGRA.get(paths[0])).status
  return status === 403 || `FAIL ${status} (deny ${deny.status})`
})

// ------------------------------------------------------------------ company settings (API)
await m.check('Company', 'OWN001', 'settings and holidays: owner writes, others read, manager refused', async () => {
  const s = await owner.patch('/company/settings', { late_after: '09:45' })
  const read = await EMPA1.get('/company/settings')
  const denied = await MGRA.patch('/company/settings', { late_after: '08:00' })
  const hol = await owner.post('/company/holidays', { holiday_date: '2026-12-25', name: 'Christmas' })
  const dup = await owner.post('/company/holidays', { holiday_date: '2026-12-25', name: 'Again' })
  const mgrHol = await MGRA.post('/company/holidays', { holiday_date: '2026-12-26', name: 'Nope' })
  const list = await EMPA1.get('/company/holidays?year=2026')
  const rm = await owner.del(`/company/holidays/${hol.body.id}`)
  await owner.patch('/company/settings', { late_after: '09:30' })
  return s.status === 200 && read.body.late_after.startsWith('09:45') && denied.status === 403 && hol.status === 201 && dup.status === 409 && mgrHol.status === 403 && list.body.some((h) => h.name === 'Christmas') && rm.status === 204 || `FAIL ${[s.status, read.status, denied.status, hol.status, dup.status, mgrHol.status, rm.status]}`
})

// ------------------------------------------------------------------ browser
const browser = await launch()
const sign = async (code) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, acceptDownloads: true, serviceWorkers: 'block' })
  ctx.setDefaultTimeout(45000)
  const p = await ctx.newPage()
  await p.goto(`${BASE}/login`)
  await p.locator('input[name="employee_code"]').fill(code)
  await p.locator('input[name="password"]').fill(PW(code))
  await p.getByRole('button', { name: 'Sign in' }).click()
  await p.getByRole('navigation', { name: /Main menu|Tab bar/ }).first().waitFor({ state: 'attached' })
  return p
}
const text = (p) => p.locator('main').innerText()

{
  const p = await sign('OWN001')
  await m.check('Screens', 'OWN001', 'Attendance analytics shows the month and the people', async () => {
    await p.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Attendance analytics' }).click()
    await p.getByRole('heading', { level: 1, name: 'Attendance analytics' }).waitFor()
    return eventually(async () => { const t = await text(p); return t.includes('Ann Engineer') && t.includes('Abe Technician') && /late arrivals/i.test(t) })
  })
  await m.check('Screens', 'OWN001', 'the four buttons download real files', async () => {
    await p.getByLabel('Employee', { exact: true }).selectOption({ label: 'Abe Technician (EMPA2)' })
    const got = []
    for (const name of ['Monthly attendance', 'Leave card', 'Daily report', 'Monthly summary (everyone)']) {
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name, exact: true }).click()])
      const file = join(dir, dl.suggestedFilename())
      await dl.saveAs(file)
      got.push(dl.suggestedFilename())
    }
    return got.every((n) => n.endsWith('.xlsx')) && got.length === 4 || `FAIL ${got}`
  })
  await m.check('Screens', 'OWN001', 'Company settings: save, add a holiday, remove it after confirming', async () => {
    await p.goto(`${BASE}/company-settings`)
    await p.getByLabel(/^Company name/).waitFor()
    await p.getByLabel(/Late after/).fill('09:40')
    await p.getByRole('button', { name: 'Save settings' }).click()
    if (!(await eventually(async () => /Company settings saved/.test(await p.locator('body').innerText())))) return 'FAIL not saved'
    await p.getByLabel(/^Date/).fill('2026-12-30')
    await p.getByLabel(/Holiday name/).fill('Year end')
    await p.getByRole('button', { name: 'Add holiday' }).click()
    await p.getByRole('cell', { name: 'Year end', exact: true }).waitFor()
    await p.getByRole('button', { name: 'Remove Year end' }).click()
    await p.getByRole('dialog').getByRole('button', { name: 'Remove holiday' }).click()
    await p.getByRole('cell', { name: 'Year end', exact: true }).waitFor({ state: 'detached' })
    await owner.patch('/company/settings', { late_after: '09:30' })
    return true
  })
  await p.context().close()
}
{
  const p = await sign('MGRB')
  await m.check('Screens', 'MGRB', 'a manager without the permission has no menu entry and is told why', async () => {
    const links = await p.getByRole('navigation', { name: 'Main menu' }).getByRole('link').allInnerTexts()
    await p.goto(`${BASE}/attendance-analytics`)
    const told = await eventually(async () => /has not allowed you to download company attendance reports/i.test(await text(p)))
    return !links.includes('Attendance analytics') && told || `FAIL ${links}`
  })
  await p.context().close()
}
{
  await owner.post('/permissions/grants', { grantee_user_id: users.MGRB.id, permission_key: 'download_company_reports', scope_type: 'global', scope_id: null, effect: 'allow' })
  const p = await sign('MGRB')
  await m.check('Screens', 'MGRB', 'once allowed: the entry appears and the whole company shows', async () => {
    await p.goto(`${BASE}/attendance-analytics`)
    const seen = await eventually(async () => { const t = await text(p); return t.includes('Ann Engineer') && t.includes('Ben Engineer') })
    const links = await p.getByRole('navigation', { name: 'Main menu' }).getByRole('link').allInnerTexts()
    return seen && links.includes('Attendance analytics') || `FAIL ${links}`
  })
  await p.context().close()
}
{
  const p = await sign('EMPA1')
  await m.check('Screens', 'EMPA1', 'an employee typing the address gets "Not available"', async () => {
    await p.goto(`${BASE}/attendance-analytics`)
    return eventually(async () => /not available/i.test(await text(p)))
  })
  await m.check('Screens', 'EMPA1', 'punch card asks how you are working', async () => {
    await p.goto(`${BASE}/attendance`)
    await p.getByRole('group', { name: 'Where are you working today?' }).waitFor().catch(() => {})
    const t = await text(p)
    return /Where are you working today\?|Punched in|Day complete/.test(t) || `FAIL ${t.slice(0, 200)}`
  })
  await p.context().close()
}
await browser.close()
await Promise.all(Object.values(apis).map((a) => a.dispose()))

m.print('Attendance reports - real stack')
m.save(join(dir, 'matrix.json'))
process.exit(m.failed.length ? 1 : 0)
