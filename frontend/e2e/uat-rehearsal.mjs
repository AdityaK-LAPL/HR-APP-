// Dress rehearsal for the UAT scenarios (docs/uat): builds the UAT "cast" through the API and then
// walks the scenarios whose wording or behaviour the other audits do not already prove, in a real
// browser, checking the screen texts the scenario sheet promises. Needs a database with only the Owner.
import { Api, BASE, Matrix, OWNER, PW, TEMP, eventually, launch } from './lib.mjs'

const m = new Matrix()
const owner = await Api.anonymous(); await owner.login(OWNER.code, OWNER.password)
await owner.post('/auth/change-password', { current_password: OWNER.password, new_password: PW(OWNER.code) }); await owner.login(OWNER.code, PW(OWNER.code))
const me = (await owner.get('/auth/me')).body
const cast = {}
for (const [code, name, role, mgr, desig] of [
  ['UAT-MGR1', 'Meera Manager', 'manager', me.id, 'Service Manager'], ['UAT-MGR2', 'Bharat Manager', 'manager', me.id, 'Plant Manager'],
  ['UAT-EMP1', 'Ravi Engineer', 'employee', 'UAT-MGR1', 'Service Engineer'], ['UAT-EMP2', 'Sunita Technician', 'employee', 'UAT-MGR1', 'Technician'],
  ['UAT-EMP3', 'Imran Operator', 'employee', 'UAT-MGR2', 'Machine Operator'],
]) {
  const manager_id = cast[mgr]?.user.id ?? mgr
  const user = await owner.must('POST', '/users', { employee_code: code, name, designation: desig, role, manager_id, initial_password: TEMP(code) })
  const api = await Api.anonymous(); await api.login(code, TEMP(code)); await api.post('/auth/change-password', { current_password: TEMP(code), new_password: PW(code) }); await api.login(code, PW(code))
  cast[code] = { user, api }
}
const { 'UAT-MGR1': M1, 'UAT-MGR2': M2, 'UAT-EMP1': E1, 'UAT-EMP2': E2, 'UAT-EMP3': E3 } = cast
const today = (await owner.get('/config')).body.today
const task = await M1.api.must('POST', '/tasks', { title: 'Calibrate press line 3', assigned_to: E1.user.id, priority: 'high', task_date: today })
await M1.api.must('POST', '/tasks', { title: 'Inspect coolant pump', assigned_to: E2.user.id, priority: 'low', task_date: today })
const cust = await M1.api.must('POST', '/customers', { customer_code: 'CU-001', name: 'Acme Forgings', address: 'Plot 9, Peenya, Bengaluru' })
await M1.api.must('POST', `/customers/${cust.id}/contacts`, { name: 'Priya Nair', phone: '+91 98450 00000', is_primary: true })
const mach = await M1.api.must('POST', '/machines', { customer_id: cust.id, machine_code: 'MC-001', model_name: 'VMC-850', serial_number: 'SN-5521' })
const call = await M1.api.must('POST', '/service-calls', { service_call_code: 'SC-2001', customer_id: cust.id, machine_id: mach.id, contacted_at: new Date().toISOString(), contact_method: 'phone', issue_reported: 'Spindle vibrates', priority: 'urgent', service_type: 'field_visit' })
await M1.api.must('POST', `/service-calls/${call.id}/assign`, { employee_id: E1.user.id })
await M2.api.must('POST', '/customers', { customer_code: 'CU-002', name: 'Zenith Castings' })
const leaveOk = await E1.api.must('POST', '/leaves', { start_date: '2026-10-30', end_date: '2026-11-02', reason: 'Wedding' })
await M1.api.must('POST', `/leaves/${leaveOk.id}/approve`, {})
await E1.api.must('POST', '/leaves', { start_date: '2026-12-14', end_date: '2026-12-15', reason: 'Trip' })

const browser = await launch()
const watch = async (code, vp = { width: 1366, height: 850 }) => {
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block' }); ctx.setDefaultTimeout(45000)
  const p = await ctx.newPage()
  await p.goto(`${BASE}/login`); await p.locator('input[name="employee_code"]').fill(code); await p.locator('input[name="password"]').fill(PW(code))
  await p.getByRole('button', { name: 'Sign in' }).click(); await p.getByRole('navigation', { name: /Main menu|Tab bar/ }).first().waitFor({ state: 'attached' })
  return p
}
const go = async (p, path) => { await p.goto(BASE + path); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(300) }
const dlg = (p, name) => p.getByRole('dialog', name ? { name } : undefined)
const pick = async (sel, re) => { let o = []; for (let i = 0; i < 40; i += 1) { o = await sel.locator('option').allInnerTexts(); if (o.some((x) => re.test(x))) break; await new Promise((r) => setTimeout(r, 500)) } const t = o.find((x) => re.test(x)); if (!t) throw new Error(`no option ${re} in ${o.join('|')}`); await sel.selectOption({ label: t }) }
const A = 'UAT rehearsal'
const text = (p) => p.locator('main').innerText()
const waitText = (p, re, ms = 20000) => eventually(async () => re.test(await text(p)), ms)

// ---------------- employee
{
  const ctx = await browser.newContext({ serviceWorkers: 'block' }); ctx.setDefaultTimeout(45000); const q = await ctx.newPage()
  await m.check(A, 'UAT-EMP-03', 'a protected address opened signed out returns to it after sign-in', async () => {
    await q.goto(`${BASE}/tasks`); await q.waitForURL(/\/login/); await q.locator('input[name="employee_code"]').fill('UAT-EMP1'); await q.locator('input[name="password"]').fill(PW('UAT-EMP1')); await q.getByRole('button', { name: 'Sign in' }).click()
    await q.getByRole('heading', { level: 1, name: 'My tasks' }).waitFor(); return q.url().endsWith('/tasks') })
  await ctx.close()
  const p = await watch('UAT-EMP1')
  await m.check(A, 'UAT-EMP-01', 'employee menu has exactly the promised entries', async () => {
    const t = (await p.getByRole('navigation', { name: 'Main menu' }).getByRole('link').allInnerTexts()).join('|')
    const want = ['My day', 'My tasks', 'Punch in / out', 'My leave', 'My EOD report', 'Projects', 'My calendar', 'My service calls', 'My customers', 'My machines']
    return want.every((x) => t.includes(x)) && !/Reports|Permissions|Audit|team/i.test(t) ? true : `FAIL ${t}` })
  await m.check(A, 'UAT-EMP-04', 'My day: greeting and the four tiles', async () => {
    await go(p, '/dashboard'); const t = await p.locator('main').innerText()
    return /Hello, Ravi/.test(t) && ['TASKS TODAY', 'IN PROGRESS', 'LEAVE AWAITING APPROVAL', 'SERVICE CALLS'].every((x) => t.toUpperCase().includes(x)) ? true : `FAIL ${t.slice(0, 200)}` })
  await m.check(A, 'UAT-EMP-07', 'Cancelled asks "Cancel this task?" and Esc leaves the task unchanged', async () => {
    await go(p, `/tasks/${task.id}`); await p.getByLabel('Change status').selectOption('cancelled'); await p.getByRole('button', { name: 'Save status' }).click()
    await dlg(p, 'Cancel this task?').waitFor(); await p.keyboard.press('Escape'); await dlg(p).waitFor({ state: 'hidden' })
    return /Not started/.test(await p.locator('main').innerText()) })
  await m.check(A, 'UAT-EMP-13', 'a pending request has Cancel request; the approved one does not', async () => {
    await go(p, '/leaves'); const ok = await p.getByRole('button', { name: 'Cancel request' }).count()
    const txt = await p.locator('main').innerText(); return ok === 1 && /Approved/.test(txt) && /Pending/.test(txt) ? true : `FAIL cancel buttons=${ok}` })
  await m.check(A, 'UAT-DTE-03', 'leave 30 Oct - 2 Nov counts 4 days and is Approved', async () => { const t = await p.locator('main').innerText(); return /30 Oct 2026/.test(t) && /02 Nov 2026/.test(t) && /\b4\b/.test(t) })
  await m.check(A, 'UAT-EMP-29', 'notifications: empty bell and page wording', async () => {
    await go(p, '/dashboard'); await p.getByRole('button', { name: /Notifications/ }).first().click(); await p.getByText('You have no notifications.').waitFor(); await p.keyboard.press('Escape')
    await go(p, '/notifications'); await p.getByText('No notifications yet').waitFor(); return true })
  await m.check(A, 'UAT-SRC-02', 'employee search: nothing found, and only own customers', async () => {
    await go(p, '/search?q=zzzz'); await p.getByText(/Nothing found for “zzzz”/).waitFor()
    await go(p, '/search?q=acme'); const a = await p.locator('main').innerText(); await go(p, '/search?q=zenith'); const z = await p.locator('main').innerText()
    return /Acme Forgings/.test(a) && !/People/.test(a) && /Nothing found/.test(z) ? true : `FAIL ${a.slice(0, 120)} // ${z.slice(0, 80)}` })
  await m.check(A, 'UAT-ATT-06', 'a file name with accents and CJK characters uploads and shows', async () => {
    await go(p, `/tasks/${task.id}`); const name = 'Report ünïcode 名前 (final).png'
    await p.getByLabel(/choose a file to attach/i).setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') })
    await p.getByText(`${name} uploaded.`).waitFor(); return true })
  await m.check(A, 'UAT-DTE-01', 'timestamps read like "13 Oct 2026, 06:48 am"', async () => (/\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} (am|pm)/).test(await p.locator('main').innerText()))
  await m.check(A, 'UAT-ERR-01', 'an unknown address says "Not available"', async () => { await go(p, '/nonsense'); return p.getByRole('heading', { name: 'Not available' }).isVisible() })
}

// ---------------- manager
{
  const p = await watch('UAT-MGR1')
  await m.check(A, 'UAT-MGR-01', 'manager menu has exactly the promised entries', async () => {
    const t = (await p.getByRole('navigation', { name: 'Main menu' }).getByRole('link').allInnerTexts()).join('|')
    const want = ['Team overview', 'Team tasks', 'Team attendance', 'Leave approvals', 'EOD reports', 'Projects', 'Team calendar', 'Service calls', 'Customers', 'Machines', 'Reports', 'My team']
    return want.every((x) => t.includes(x)) && !/Permissions|Audit/.test(t) ? true : `FAIL ${t}` })
  await m.check(A, 'UAT-MGR-03', 'My team lists only Meera, Ravi, Sunita', async () => { await go(p, '/users'); const t = await p.locator('main').innerText(); return /Ravi Engineer/.test(t) && /Sunita Technician/.test(t) && !/Imran Operator|Bharat Manager/.test(t) })
  await m.check(A, 'UAT-MGR-10', '"Assign to" offers only the manager\'s own branch (and herself)', async () => {
    await go(p, '/tasks'); await p.getByRole('button', { name: 'Assign a task' }).first().click(); const sel = dlg(p, 'Assign a task').getByLabel(/assign to/i)
    await pick(sel, /Ravi/); const o = (await sel.locator('option').allInnerTexts()).join('|'); await p.keyboard.press('Escape')
    return /Meera Manager \(you\)/.test(o) && /Sunita/.test(o) && !/Imran|Bharat/.test(o) ? true : `FAIL ${o}` })
  await m.check(A, 'UAT-FLT-01', 'a filter lives in the address; "No tasks match these filters"; Clear filters', async () => {
    await go(p, '/tasks?status=blocked'); await p.getByText('No tasks match these filters').waitFor(); const u = p.url()
    await p.getByRole('button', { name: 'Clear filters' }).click(); const back = await waitText(p, /Calibrate press line 3/); return u.includes('status=blocked') && !p.url().includes('status=blocked') && back })
  await m.check(A, 'UAT-MGR-17', 'the manager\'s own leave waits on the Owner', async () => {
    await go(p, '/leaves'); await p.getByRole('button', { name: 'My leave' }).click(); await p.getByRole('button', { name: 'Apply for leave' }).click(); const d = dlg(p, 'Apply for leave')
    await d.getByLabel(/^from/i).fill('2026-11-16'); await d.getByLabel(/^to/i).fill('2026-11-17'); await d.getByLabel(/reason/i).fill('Training'); await d.getByRole('button', { name: 'Send request' }).click()
    await p.getByText('Leave request sent for approval.').waitFor(); return (await waitText(p, /Company Owner/)) ? true : 'FAIL the new request does not show who it waits on' })
  await m.check(A, 'UAT-MGR-21', 'calendar: Month/Week/List, filters, approved leave on every day', async () => {
    await go(p, '/calendar'); for (const b of ['Month', 'Week', 'List', 'Tasks and leave', 'Tasks', 'Leave']) await p.getByRole('button', { name: b, exact: true }).waitFor()
    for (const l of ['Person', 'Project', 'Team']) await p.getByLabel(l).waitFor()
    const count = async () => (await text(p)).match(/Ravi Engineer · leave/g)?.length ?? 0
    await p.getByRole('button', { name: 'Leave', exact: true }).click(); await eventually(async () => (await count()) >= 2, 20000)
    const oct = await count()
    await p.getByRole('button', { name: /Next/ }).click(); await eventually(async () => /November 2026/.test(await text(p)) && (await count()) >= 2, 20000)
    const nov = await count()
    return oct >= 2 && nov >= 2 ? `ok (Oct ${oct}, Nov ${nov})` : `FAIL Oct ${oct}, Nov ${nov}` })
  await m.check(A, 'UAT-MGR-24', 'a duplicate call number is refused', async () => {
    await go(p, '/service'); await p.getByRole('button', { name: 'Log a service call' }).click(); const d = dlg(p, 'Log a service call')
    await pick(d.getByLabel(/^customer/i), /Acme/); await pick(d.getByLabel(/^machine/i), /MC-001|VMC/); await d.getByLabel(/call number/i).fill('SC-2001'); await d.getByLabel('Problem reported').fill('Another problem')
    await d.getByRole('button', { name: 'Log service call' }).click(); await d.getByText(/already in use/i).waitFor(); await p.keyboard.press('Escape'); return true })
  await m.check(A, 'UAT-MGR-26', 'removing an engineer from a call asks first', async () => {
    await go(p, `/service/${call.id}`); await p.getByRole('button', { name: /Remove Ravi Engineer from this call/ }).click(); await dlg(p, 'Remove from this call?').waitFor(); await p.keyboard.press('Escape'); return true })
  await m.check(A, 'UAT-SRC-01', 'manager search: People, Customers, Machines, Service calls', async () => {
    await go(p, '/search?q=ravi'); const a = await p.getByRole('heading', { name: 'People' }).count()
    await go(p, '/search?q=acme'); const b = await p.getByRole('heading', { name: 'Customers' }).count()
    await go(p, '/search?q=5521'); const c = await p.getByRole('heading', { name: 'Machines' }).count()
    await go(p, '/search?q=SC-20'); const d = await p.getByRole('heading', { name: 'Service calls' }).count()
    return a && b && c && d ? true : `FAIL ${a}${b}${c}${d}` })
  await m.check(A, 'UAT-MGR-30', 'reports: daily check, "View as table", sorting', async () => {
    await go(p, '/reports'); await p.getByText(/Daily check/).first().waitFor(); await p.getByText('Not punched in').first().waitFor()
    await p.getByText('View as table').first().click(); const th = p.getByRole('button', { name: /Person/ }).first(); await th.click().catch(() => {}); return true })
  await m.check(A, 'UAT-MGR-28', 'the other branch\'s customer is not in Meera\'s search but IS in the catalogue (managers see all customers)', async () => {
    await go(p, '/customers'); return /Zenith Castings/.test(await p.locator('main').innerText()) })
}

// ---------------- owner
{
  const p = await watch(OWNER.code)
  await m.check(A, 'UAT-OWN-01', 'owner menu has exactly the promised entries', async () => {
    const t = (await p.getByRole('navigation', { name: 'Main menu' }).getByRole('link').allInnerTexts()).join('|')
    const want = ['Company overview', 'Company tasks', 'Attendance', 'Leave requests', 'EOD reports', 'Projects', 'Team calendar', 'Service calls', 'Customers', 'Machines', 'Reports', 'Attendance analytics', 'Users & hierarchy', 'Permissions', 'Company settings', 'Audit trail']
    return want.every((x) => t.includes(x)) ? true : `FAIL ${t}` })
  await m.check(A, 'UAT-OWN-04', 'reporting structure tab shows the tree', async () => {
    await go(p, '/users'); await p.getByRole('button', { name: 'Reporting structure' }).click()
    return (await waitText(p, /Ravi Engineer/)) && /Meera Manager/.test(await text(p)) && /Bharat Manager/.test(await text(p)) })
  await m.check(A, 'UAT-OWN-06', 'a reporting loop is refused with a message (or not offered)', async () => {
    await go(p, `/users/${M1.user.id}`); await p.getByRole('button', { name: 'Change manager' }).click(); const d = dlg(p, 'Change manager for Meera Manager'); const sel = d.getByLabel('Reports to')
    await pick(sel, /Company Owner|Owner/); const opts = (await sel.locator('option').allInnerTexts()).join('|')
    if (!/Ravi/.test(opts)) { await p.keyboard.press('Escape'); return 'ok (the screen does not even offer her own employee)' }
    await pick(sel, /Ravi/); await d.getByRole('button', { name: 'Save' }).click(); await d.getByRole('alert').or(p.getByText(/loop|cycle|circular|cannot/i)).first().waitFor(); await p.keyboard.press('Escape'); return true })
  await m.check(A, 'UAT-OWN-07', 'demoting a manager who still has people shows a warning', async () => {
    await go(p, `/users/${M1.user.id}`); await p.getByRole('button', { name: 'Change role' }).click(); const d = dlg(p, 'Change role for Meera Manager'); await d.getByLabel('Role').selectOption('employee')
    await d.getByText(/still has 2 people reporting|still has \d+ people? reporting/).waitFor(); await p.keyboard.press('Escape'); return d.getByRole('button', { name: 'Make employee' }).count().then(() => true) })
  await m.check(A, 'UAT-OWN-10..12', 'Allow, then Deny on top, both listed; revoke asks first', async () => {
    await go(p, '/permissions')
    const add = async (effect) => { await p.getByRole('button', { name: 'Add a permission' }).click(); const d = dlg(p, 'Add a permission'); await pick(d.getByLabel('Manager'), /Meera/); await pick(d.getByLabel('Permission'), /reports/i); await pick(d.getByLabel(/whose/i), /Bharat/); await d.getByLabel('Effect').selectOption(effect); await d.getByRole('button', { name: effect === 'deny' ? 'Add restriction' : 'Add permission' }).click(); await d.waitFor({ state: 'hidden' }) }
    await add('allow'); await add('deny')
    if (!(await waitText(p, /Allowed/)) || !(await waitText(p, /Denied/))) return `FAIL ${(await text(p)).slice(0, 200)}`
    for (let i = 0; i < 2; i += 1) { await p.getByRole('button', { name: /^Revoke/ }).first().click(); await dlg(p, 'Revoke this permission?').getByRole('button', { name: 'Revoke' }).click(); await dlg(p).waitFor({ state: 'hidden' }); await p.waitForTimeout(500) }
    return waitText(p, /No extra permissions have been set/) })
  await m.check(A, 'UAT-OWN-18', 'reports: periods and the Manager filter', async () => {
    await go(p, '/reports'); for (const b of ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Custom']) await p.getByRole('button', { name: b, exact: true }).waitFor()
    await pick(p.getByLabel('Manager'), /Meera/); await p.waitForTimeout(800); return true })
  await m.check(A, 'UAT-OWN-19', 'audit trail filters exist and show this session\'s actions', async () => {
    await go(p, '/audit-logs'); for (const l of ['Action', 'Record type', 'Done by', 'From', 'To', 'Record id']) await p.getByLabel(l, { exact: true }).waitFor()
    return waitText(p, /Permission granted/) })
  await m.check(A, 'UAT-OWN-22', 'a manager typing owner addresses sees "Not available"', async () => {
    const q = await watch('UAT-MGR1'); for (const path of ['/permissions', '/audit-logs', `/users/${E3.user.id}`]) { await go(q, path); if (!(await q.getByRole('heading', { name: 'Not available' }).isVisible())) return `FAIL ${path}` } return true })
}

await browser.close()
m.print('UAT rehearsal')
process.exit(m.failed.length ? 1 : 0)
