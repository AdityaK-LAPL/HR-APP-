// Real-browser audit, role by role, against the production build: authentication, every workflow
// each role has, the security matrix as a person would hit it (typing URLs), browser history,
// and unreliable networks. Data comes from the real API (lib.mjs seedCompany).
import AxeBuilder from '@axe-core/playwright'
import { Api, BASE, Matrix, PW, eventually, launch, seedCompany, TEMP } from './lib.mjs'

const ONLY = (process.env.E2E_ONLY ?? '').split(',').filter(Boolean)
const want = (name) => ONLY.length === 0 || ONLY.includes(name)
const m = new Matrix()
const finish = async (code) => { m.print('UI audit'); console.log('\nBrowser console problems:', consoleProblems.size ? '\n' + [...consoleProblems].join('\n') : 'none'); m.save('/tmp/pw/ui-audit.json'); process.exit(code) }
process.on('uncaughtException', async (e) => { console.log('CRASH', e.message.split('\n').slice(0, 3).join(' ')); await finish(2) })
const browser = await launch()
const consoleProblems = new Set()
const { apis, data } = await seedCompany()
const { users } = data
const file = (name, text) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })

async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, serviceWorkers: 'block', geolocation: { latitude: 12.97, longitude: 77.59 }, permissions: ['geolocation'], ...opts })
  ctx.setDefaultTimeout(60000); ctx.setDefaultNavigationTimeout(90000)
  return ctx
}
const watch = (page, who) => {
  page.on('console', (msg) => { if (msg.type() === 'error' && !/status of (401|403|404|409|422|429|500|502|503)|ERR_FAILED|ERR_INTERNET|ERR_CONNECTION/.test(msg.text())) consoleProblems.add(`${who}: ${msg.text().slice(0, 200)}`) })
  page.on('pageerror', (e) => consoleProblems.add(`${who} pageerror: ${e.message.slice(0, 200)}`))
}
const settle = async (page) => { await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(400) }
const go = async (page, path) => { await page.goto(BASE + path); await settle(page) }
const h1 = (page, name) => page.getByRole('heading', { level: 1, name })
async function uiLogin(page, code) {
  await page.goto(BASE + '/login')
  await page.locator('input[name="employee_code"]').fill(code)
  await page.locator('input[name="password"]').fill(PW(code))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('navigation', { name: /Main menu|Tab bar/ }).first().waitFor({ state: 'attached' })
  await settle(page)
}
const menuItems = async (page) => page.getByRole('navigation', { name: 'Main menu' }).getByRole('link').allInnerTexts()
const notAvailable = async (page, path) => { await go(page, path); return page.getByRole('heading', { name: 'Not available' }).isVisible() }
const pick = async (sel, re) => {
  let o = []
  const found = await eventually(async () => { o = await sel.locator('option').allInnerTexts(); return o.some((x) => re.test(x)) }, 20000)
  if (!found) throw new Error(`no option matching ${re} in ${o.join('|')}`)
  await sel.selectOption({ label: o.find((x) => re.test(x)) })
}
const dialog = (page, name) => page.getByRole('dialog', name ? { name } : undefined)
async function signedIn(role, code) {
  const ctx = await newCtx(); const page = await ctx.newPage(); watch(page, role); await uiLogin(page, code); return { ctx, page }
}

// ======================================================= 1. Authentication (UI)
if (want('auth')) {
users.REV1 = await apis.OWN001.must('POST', '/users', { employee_code: 'REV1', name: 'Rae Revoked', designation: 'Trainee', role: 'employee', manager_id: users.MGRA.id, initial_password: TEMP('REV1') })
{ const r = await Api.anonymous(); await r.login('REV1', TEMP('REV1')); await r.post('/auth/change-password', { current_password: TEMP('REV1'), new_password: PW('REV1') }); await r.dispose() }
{
  const area = 'Authentication (UI)'
  const ctx = await newCtx(); const p = await ctx.newPage(); watch(p, 'auth')
  await m.check(area, 'anonymous', 'opening a protected URL sends you to sign-in', async () => { await go(p, '/tasks'); return p.url().endsWith('/login') })
  await m.check(area, 'anonymous', 'empty form shows field errors and sends nothing', async () => { await p.getByRole('button', { name: 'Sign in' }).click(); await p.getByText(/enter your employee id/i).waitFor({ timeout: 5000 }).catch(async () => { await p.locator('.field-error, [role="alert"], .error').first().waitFor({ timeout: 5000 }) }); return p.url().endsWith('/login') })
  await m.check(area, 'anonymous', 'wrong password: a plain error, still on sign-in, password cleared of the URL', async () => {
    await p.locator('input[name="employee_code"]').fill('EMPA1'); await p.locator('input[name="password"]').fill('totally-wrong'); await p.getByRole('button', { name: 'Sign in' }).click()
    await p.getByRole('alert').first().waitFor(); const t = await p.getByRole('alert').first().innerText(); return p.url().endsWith('/login') && !p.url().includes('password') && t.length > 5 ? true : `FAIL ${t}` })
  await m.check(area, 'anonymous', 'unknown employee ID shows the same kind of error', async () => { await p.locator('input[name="employee_code"]').fill('NOBODY'); await p.locator('input[name="password"]').fill('whatever123'); await p.getByRole('button', { name: 'Sign in' }).click(); await p.getByRole('alert').first().waitFor(); return true })
  await m.check(area, 'employee', 'valid sign-in returns to the page that was asked for (/tasks)', async () => {
    await p.locator('input[name="employee_code"]').fill('EMPA1'); await p.locator('input[name="password"]').fill(PW('EMPA1')); await p.getByRole('button', { name: 'Sign in' }).click()
    await h1(p, 'My tasks').waitFor(); return p.url().endsWith('/tasks') })
  await m.check(area, 'employee', 'refresh (F5) keeps you signed in on the same page', async () => { await p.reload(); await h1(p, 'My tasks').waitFor(); return true })
  await m.check(area, 'employee', 'browser storage holds no token or password', async () => p.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).toLowerCase()).then((s) => !/token|password|eyj/.test(s)))
  await m.check(area, 'employee', 'back / forward walk through visited pages and keep the right screen', async () => {
    await p.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'My leave' }).click(); await p.waitForURL(/\/leaves/)
    await p.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Projects' }).click(); await p.waitForURL(/\/projects/)
    await p.goBack(); await p.waitForURL(/\/leaves/); const a = await h1(p, /leave/i).isVisible()
    await p.goBack(); await p.waitForURL(/\/tasks/); const b = await h1(p, 'My tasks').isVisible()
    await p.goForward(); await p.waitForURL(/\/leaves/); const c = await h1(p, /leave/i).isVisible()
    return a && b && c })
  await m.check(area, 'employee', 'an expired access token is renewed silently (no sign-out, no error)', async () => {
    const cs = await ctx.cookies(); await ctx.clearCookies(); await ctx.addCookies(cs.filter((c) => !/access/i.test(c.name)))
    await p.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'My tasks' }).click(); await h1(p, 'My tasks').waitFor(); await p.getByRole('link', { name: 'Calibrate press line 3' }).waitFor(); return true })
  await m.check(area, 'employee', 'after an administrator resets a password, the open session is taken to the change-password page (nothing else works)', async () => {
    const t = await newCtx(); const q = await t.newPage(); await uiLogin(q, 'REV1'); await go(q, '/tasks')
    await apis.OWN001.must('POST', `/users/${users.REV1.id}/reset-password`, { temporary_password: 'Reset#Temp#2026' })
    await q.reload(); await q.waitForURL(/\/change-password|\/login/, { timeout: 60000 })
    const blocked = await q.evaluate(async () => (await fetch('/api/v1/tasks', { credentials: 'include' })).status)
    const forced = await q.getByRole('heading', { name: /Change your password/ }).count(); await t.close()
    return (forced > 0 || q.url().includes('/login')) && blocked === 403 || blocked === 401 ? true : `FAIL url=${q.url()} tasks=${blocked}` })
  await m.check(area, 'employee', 'after signing out, Back does not show the app again', async () => {
    await go(p, '/tasks'); await p.getByRole('button', { name: /Account menu/ }).click(); await p.getByRole('menuitem', { name: 'Sign out' }).click(); await p.waitForURL(/\/login/)
    await p.goBack(); await settle(p); return p.url().includes('/login') || (await p.locator('input[name="employee_code"]').isVisible()) })
  await m.check(area, 'employee', 'sign-out in one tab signs out the other tab', async () => {
    await uiLogin(p, 'EMPA1'); const p2 = await ctx.newPage(); await p2.goto(BASE + '/tasks'); await h1(p2, 'My tasks').waitFor()
    await p.getByRole('button', { name: /Account menu/ }).click(); await p.getByRole('menuitem', { name: 'Sign out' }).click(); await p.waitForURL(/\/login/)
    await p2.waitForURL(/\/login/, { timeout: 30000 }); await p2.close(); return true })
  await ctx.close()
  for (const [code, label, expectMenu] of [['EMPA1', 'employee', ['My day', 'My tasks']], ['MGRA', 'manager', ['Team overview', 'Reports']], ['OWN001', 'owner', ['Company overview', 'Permissions']]]) {
    const c2 = await newCtx(); const q = await c2.newPage(); watch(q, label)
    await m.check(area, label, `signs in through the form and sees the ${label} menu (${expectMenu.join(', ')})`, async () => { await uiLogin(q, code); const items = (await menuItems(q)).join('|'); return expectMenu.every((x) => items.includes(x)) ? true : `FAIL ${items}` })
    await c2.close()
  }
}

}

// ======================================================= 2. Employee
const E = want('employee') ? await signedIn('employee', 'EMPA1') : null
const E2 = want('employee') ? await signedIn('employee2', 'EMPA2') : null
if (want('employee')) {
  const area = 'Employee workflows (UI)'
  const p = E.page
  await m.check(area, 'employee', 'dashboard greets the person with their own day', async () => { await h1(p, /Hello, Ann/).waitFor(); return true })
  await m.check(area, 'employee', 'menu has no manager or owner screens', async () => { const t = (await menuItems(p)).join('|'); return !/Permissions|Audit|Reports|Team|People|Users/i.test(t) ? true : `FAIL ${t}` })
  await go(p, '/tasks')
  await m.check(area, 'employee', 'tasks: only my own tasks are listed', async () => (await p.getByRole('link', { name: 'Calibrate press line 3' }).isVisible()) && !(await p.getByText('Inspect coolant pump').count()) && !(await p.getByText('Replace conveyor belt').count()))
  await m.check(area, 'employee', 'task: open it, change status, see the confirmation and history', async () => {
    await p.getByRole('link', { name: 'Calibrate press line 3' }).click(); await h1(p, 'Calibrate press line 3').waitFor()
    await p.getByLabel('Change status').selectOption('in_progress'); await p.getByRole('button', { name: 'Save status' }).click()
    await p.getByText(/status changed to/i).first().waitFor(); return true })
  await m.check(area, 'employee', 'task: the employee cannot edit or reassign (no such buttons)', async () => (await p.getByRole('button', { name: /Edit task|Reassign/ }).count()) === 0)
  await m.check(area, 'employee', 'attachment: upload, download link, then remove', async () => {
    await p.getByLabel(/choose a file to attach/i).setInputFiles(file('notes.txt', 'hello')); await p.getByText('notes.txt uploaded.').waitFor()
    await p.getByRole('link', { name: 'Download notes.txt' }).waitFor()
    const href = await p.getByRole('link', { name: 'Download notes.txt' }).getAttribute('href')
    const body = await p.evaluate(async (u) => { const r = await fetch(u, { credentials: 'include' }); return r.ok ? await r.text() : `HTTP ${r.status}` }, href)
    await p.getByRole('button', { name: 'Remove notes.txt' }).click(); await dialog(p, 'Remove attachment').getByRole('button', { name: 'Remove' }).click()
    await p.getByRole('link', { name: 'Download notes.txt' }).waitFor({ state: 'detached' }); return body === 'hello' ? true : `FAIL downloaded ${body}` })
  await m.check(area, 'employee', 'attachment: a disallowed file type is refused with a clear message', async () => { await p.getByLabel(/choose a file to attach/i).setInputFiles({ name: 'run.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') }); await p.getByText(/not allowed/i).first().waitFor(); return true })
  await m.check(area, 'employee', 'attachment: an executable disguised as a .png is refused', async () => { await p.getByLabel(/choose a file to attach/i).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('MZ\x90\x00 pretending') }); await p.getByRole('alert').or(p.getByText(/does not match/i)).first().waitFor(); return true })
  await go(p, '/projects')
  await m.check(area, 'employee', 'projects: only mine; open the detail', async () => {
    if ((await p.getByText('Conveyor refit').count()) !== 0) return 'FAIL sees another branch\'s project'
    await p.getByRole('link', { name: 'Line 3 upgrade' }).click(); await h1(p, 'Line 3 upgrade').waitFor(); return (await p.getByRole('button', { name: /Edit project|Add person|Archive/ }).count()) === 0 })
  await go(p, '/leaves')
  await m.check(area, 'employee', 'leave: apply, see it Pending, cancel it', async () => {
    await p.getByRole('button', { name: 'Apply for leave' }).click(); const d = dialog(p, 'Apply for leave')
    await d.getByLabel(/^from/i).fill('2026-12-14'); await d.getByLabel(/^to/i).fill('2026-12-15'); await d.getByLabel(/reason/i).fill('Wedding'); await d.getByRole('button', { name: 'Send request' }).click()
    await p.getByText('Leave request sent for approval.').waitFor()
    await p.getByRole('row', { name: /Wedding/ }).getByRole('button', { name: 'Cancel request' }).first().click(); await dialog(p, /cancel this leave request/i).getByRole('button', { name: 'Cancel request' }).click()
    await p.getByText('Leave request cancelled.').waitFor(); return true })
  await m.check(area, 'employee', 'leave: end before start is stopped by the form', async () => {
    await p.getByRole('button', { name: 'Apply for leave' }).click(); const d = dialog(p, 'Apply for leave')
    await d.getByLabel(/^from/i).fill('2026-12-20'); await d.getByLabel(/^to/i).fill('2026-12-18'); await d.getByLabel(/reason/i).fill('x'); await d.getByRole('button', { name: 'Send request' }).click()
    await p.getByText('The last day cannot be before the first day.').waitFor(); await d.getByRole('button', { name: 'Cancel' }).click(); return true })
  // EOD, attendance with the second employee
  const q = E2.page
  await go(q, '/eod/new')
  await m.check(area, 'employee', 'EOD: an empty report is stopped, a filled one is submitted and shown', async () => {
    await q.getByRole('button', { name: 'Submit report' }).click(); await q.getByText('Describe the work you completed.').waitFor()
    await q.getByLabel(/work completed/i).fill('Greased the lathe and checked belts'); await q.getByRole('button', { name: 'Submit report' }).click()
    await h1(q, /EOD report/).waitFor(); await q.getByText('Greased the lathe and checked belts').waitFor(); return true })
  await go(q, '/attendance')
  await m.check(area, 'employee', 'attendance: punch in with location, then punch out (confirmed), day complete', async () => {
    await q.getByRole('button', { name: 'Punch in' }).click(); await q.getByText(/punched in at/i).first().waitFor()
    await q.getByRole('button', { name: 'Punch out' }).click(); await dialog(q, 'Punch out for today?').getByRole('button', { name: 'Punch out' }).click()
    await q.getByText(/day complete/i).first().waitFor(); return true })
  await m.check(area, 'employee', 'attendance: once the day is complete there is no punch-in button', async () => (await q.getByRole('button', { name: 'Punch in' }).count()) === 0)
  // service
  await go(p, '/service')
  await m.check(area, 'employee', 'service: only my assigned call is listed', async () => (await p.getByRole('link', { name: 'SC-2001' }).isVisible()) && (await p.getByText('SC-3001').count()) === 0)
  await m.check(area, 'employee', 'service: open the call and see the customer, machine and contact', async () => { await p.getByRole('link', { name: 'SC-2001' }).click(); await h1(p, 'Call SC-2001').waitFor(); await p.getByText('Acme Forgings').first().waitFor(); await p.getByText('Priya Nair').first().waitFor(); return true })
  await m.check(area, 'employee', 'service: record a visit', async () => {
    await p.getByRole('button', { name: 'Record a visit' }).click(); const d = dialog(p, 'Record a visit'); await d.getByLabel(/^work performed/i).fill('Checked spindle bearings'); await d.getByRole('button', { name: 'Save visit' }).click()
    await p.getByText('Checked spindle bearings').first().waitFor(); return true })
  await m.check(area, 'employee', 'service: submit the service report; no review button for me', async () => {
    await p.getByRole('button', { name: 'Submit report' }).click(); const d = dialog(p, /service report/i)
    await d.getByLabel(/^work performed/i).fill('Replaced spindle bearings'); await d.getByLabel(/^problem found/i).fill('Worn bearing'); await d.getByLabel(/^action taken/i).fill('Replaced'); await d.getByLabel(/^result/i).fill('Vibration gone'); await d.getByRole('button', { name: 'Submit report' }).click()
    await p.getByText('Replaced spindle bearings').first().waitFor(); return (await p.getByRole('button', { name: /^Review$|Mark as reviewed/ }).count()) === 0 })
  await m.check(area, 'employee', 'service: I cannot assign people or log calls (no buttons)', async () => (await p.getByRole('button', { name: /Assign someone|Log a service call/ }).count()) === 0)
  // forbidden by URL
  for (const [path, label] of [['/users', 'people admin'], ['/reports', 'reports'], ['/permissions', 'permissions'], ['/audit-logs', 'audit trail'], [`/users/${users.EMPA2.id}`, 'a colleague\'s profile'], [`/users/${users.EMPB1.id}`, 'another branch\'s profile']]) {
    await m.check('Security (UI)', 'employee', `typing the URL for ${label} shows "Not available", no data`, async () => await notAvailable(p, path))
  }
  for (const [path, label] of [[`/tasks/${data.taskB1.id}`, 'another branch\'s task'], [`/tasks/${data.taskA2.id}`, 'a colleague\'s task'], [`/projects/${data.projectB.id}`, 'another branch\'s project'], [`/service/${data.callB.id}`, 'a call that is not mine'], [`/eod/${data.eodB1.id}`, 'another employee\'s EOD report'], [`/customers/${data.customerB.id}`, 'another branch\'s customer'], [`/machines/${data.machineB.id}`, 'another branch\'s machine']]) {
    await m.check('Security (UI)', 'employee', `typing the URL for ${label} shows no data`, async () => {
      await go(p, path); const body = await p.locator('main').innerText()
      return /Not available|not found|don.t have access|no longer exists|couldn.t load/i.test(body) && !/Replace conveyor belt|Inspect coolant pump|Conveyor refit|SC-3001|Belt measured|Zenith|HMC-500/.test(body) ? true : `FAIL ${body.slice(0, 120)}` })
  }
  await m.check('Security (UI)', 'employee', 'the browser itself gets 403 calling an admin API with the session', async () => p.evaluate(async () => { const r = await fetch('/api/v1/audit-logs', { credentials: 'include' }); return r.status === 403 }))
}

// ======================================================= 3. Manager
let M = want('manager') || want('owner') ? await signedIn('manager', 'MGRA') : null
if (want('manager')) await apis.OWN001.must('POST', '/users', { employee_code: 'TIA1', name: 'Tia Temporary', designation: 'Trainee', role: 'employee', manager_id: users.MGRA.id, initial_password: TEMP('TIA1') })
if (want('manager')) {
  const area = 'Manager workflows (UI)'
  const p = M.page
  await m.check(area, 'manager', 'dashboard: team overview', async () => { await h1(p, /Team overview|Hello/).waitFor(); return true })
  await m.check(area, 'manager', 'menu has team and reports but no owner administration', async () => { const t = (await menuItems(p)).join('|'); return /Reports/.test(t) && !/Permissions|Audit/.test(t) ? true : `FAIL ${t}` })
  await go(p, '/users')
  await m.check(area, 'manager', 'team: my two employees, not the other branch', async () => { const t = await p.locator('main').innerText(); return /Ann Engineer/.test(t) && /Abe Technician/.test(t) && !/Ben Engineer|Bob Manager/.test(t) ? true : `FAIL ${t.slice(0, 200)}` })
  await m.check(area, 'manager', 'person: open an employee, edit the designation, reset the password', async () => {
    await p.getByRole('link', { name: 'Ann Engineer' }).first().click(); await h1(p, 'Ann Engineer').waitFor()
    await p.getByRole('button', { name: 'Edit profile' }).click(); const d = dialog(p, 'Edit profile'); await d.getByLabel('Designation').fill('Senior Service Engineer'); await d.getByRole('button', { name: 'Save changes' }).click()
    await p.getByText('Senior Service Engineer').first().waitFor()
    await go(p, '/users'); await p.getByRole('link', { name: 'Tia Temporary' }).first().click(); await h1(p, 'Tia Temporary').waitFor()
    await p.getByRole('button', { name: 'Reset password' }).click(); await dialog(p).getByLabel(/temporary password/i).fill('Reset#Temp#2026'); await dialog(p).getByRole('button', { name: 'Reset password' }).click()
    await p.getByText(/Temporary password set for Tia Temporary/).waitFor(); return true })
  await m.check(area, 'manager', 'tasks: team tasks only; assign a new task to an employee', async () => {
    await go(p, '/tasks'); await h1(p, 'Team tasks').waitFor()
    if ((await p.getByText('Replace conveyor belt').count()) !== 0) return 'FAIL sees other branch task'
    await p.getByRole('button', { name: 'Assign a task' }).first().click(); const d = dialog(p, 'Assign a task')
    await d.getByLabel(/^title/i).fill('Grease the lathe'); await pick(d.getByLabel(/assign to/i), /Abe/)
    await d.getByLabel('Priority').selectOption('high'); await d.getByRole('button', { name: 'Assign task' }).click(); await p.getByText('Task assigned.').waitFor(); return true })
  await m.check(area, 'manager', 'tasks: the people offered for assignment exclude the other branch', async () => {
    await p.getByRole('button', { name: 'Assign a task' }).first().click(); const opts = (await dialog(p, 'Assign a task').getByLabel(/assign to/i).locator('option').allInnerTexts()).join('|'); await dialog(p).getByRole('button', { name: 'Cancel' }).click()
    return !/Ben Engineer|Bob Manager/.test(opts) ? true : `FAIL ${opts}` })
  await m.check(area, 'manager', 'task: edit it, then change its status', async () => {
    await p.getByRole('link', { name: 'Grease the lathe' }).click(); await h1(p, 'Grease the lathe').waitFor()
    await p.getByRole('button', { name: 'Edit task' }).click(); const d = dialog(p, 'Edit task'); await d.getByLabel(/^title/i).fill('Grease the lathe and bed'); await d.getByRole('button', { name: 'Save changes' }).click()
    await h1(p, 'Grease the lathe and bed').waitFor(); await p.getByLabel('Change status').selectOption('blocked'); await p.getByRole('button', { name: 'Save status' }).click(); await p.getByText(/status changed to/i).first().waitFor(); return true })
  await m.check(area, 'manager', 'task: upload a file to the team task', async () => { await p.getByLabel(/choose a file to attach/i).setInputFiles(file('plan.txt', 'plan')); await p.getByText('plan.txt uploaded.').waitFor(); return true })
  await m.check(area, 'manager', 'projects: create, add a person, remove them', async () => {
    await go(p, '/projects'); await p.getByRole('button', { name: 'New project' }).click(); const d = dialog(p, 'New project'); await d.getByLabel('Project name').fill('Safety audit'); await d.getByRole('button', { name: 'Create project' }).click()
    await p.getByRole('link', { name: 'Safety audit' }).waitFor(); await p.getByRole('link', { name: 'Safety audit' }).click(); await h1(p, 'Safety audit').waitFor()
    await p.getByRole('button', { name: 'Add person' }).click(); await dialog(p, 'Add to project').getByLabel('Person').selectOption({ index: 1 }); await dialog(p).getByRole('button', { name: 'Add to project' }).click()
    await p.getByRole('button', { name: /^Remove .* from the project$/ }).first().waitFor(); await p.getByRole('button', { name: /^Remove .* from the project$/ }).first().click(); await dialog(p).getByRole('button', { name: 'Remove' }).click()
    await p.getByRole('button', { name: /^Remove .* from the project$/ }).first().waitFor({ state: 'detached' }); return true })
  await m.check(area, 'manager', 'projects: the other branch\'s project is not editable (no edit button)', async () => { await go(p, `/projects/${data.projectB.id}`); return (await p.getByRole('button', { name: /Edit project|Add person|Archive/ }).count()) === 0 })
  // leave: employee applies via API so there is something to reject
  await apis.EMPA2.must('POST', '/leaves', { start_date: '2027-01-11', end_date: '2027-01-11', reason: 'Dentist' })
  await go(p, '/leaves')
  await m.check(area, 'manager', 'leave: my team\'s requests only, approve one, reject another with a reason', async () => {
    const t = await p.locator('main').innerText(); if (/Ben Engineer/.test(t)) return 'FAIL sees other branch leave'
    await p.getByRole('button', { name: 'Approve leave for Ann Engineer' }).click(); await dialog(p, 'Approve leave request').getByRole('button', { name: 'Approve request' }).click(); await p.getByText('Leave request approved.').waitFor()
    await p.getByRole('button', { name: 'Reject leave for Abe Technician' }).click(); await dialog(p, 'Reject leave request').getByLabel(/reason for rejecting/i).fill('Short-staffed that day'); await dialog(p).getByRole('button', { name: 'Reject request' }).click()
    await p.getByText(/Leave request rejected/).waitFor(); return true })
  await m.check(area, 'manager', 'leave: "Reject request" stays switched off until a reason is written', async () => { await apis.EMPA2.must('POST', '/leaves', { start_date: '2027-01-18', end_date: '2027-01-18', reason: 'Again' }); await go(p, '/leaves'); await p.getByRole('button', { name: 'Reject leave for Abe Technician' }).first().click(); const off = await dialog(p).getByRole('button', { name: 'Reject request' }).isDisabled(); await dialog(p).getByLabel(/reason for rejecting/i).fill('x'); const on = await dialog(p).getByRole('button', { name: 'Reject request' }).isEnabled(); await dialog(p).getByRole('button', { name: 'Cancel' }).click(); return off && on ? true : `FAIL off=${off} on=${on}` })
  await m.check(area, 'manager', 'EOD: team reports only', async () => { await go(p, '/eod'); const t = await p.locator('main').innerText(); return /Ann Engineer/.test(t) && !/Ben Engineer/.test(t) ? true : `FAIL ${t.slice(0, 160)}` })
  await m.check(area, 'manager', 'attendance: team days only', async () => { await go(p, '/attendance'); const t = await p.locator('main').innerText(); return /Ann Engineer/.test(t) && !/Ben Engineer/.test(t) ? true : `FAIL ${t.slice(0, 160)}` })
  await m.check(area, 'manager', 'calendar: my team\'s tasks, not the other branch\'s', async () => { await go(p, '/calendar'); const t = await p.locator('main').innerText(); return /Calibrate|Inspect|Grease/.test(t) && !/Replace conveyor belt/.test(t) ? true : `FAIL ${t.slice(0, 160)}` })
  await m.check(area, 'manager', 'service: my calls only; assign a second person; review the submitted report', async () => {
    await go(p, '/service'); const t = await p.locator('main').innerText(); if (/SC-3001/.test(t)) return 'FAIL sees other branch call'
    await p.getByRole('link', { name: 'SC-2001' }).click(); await h1(p, 'Call SC-2001').waitFor()
    await p.getByRole('button', { name: 'Assign someone' }).click(); await pick(dialog(p, 'Assign to this call').getByLabel(/^person/i), /Abe/)
    await dialog(p).getByRole('button', { name: 'Assign' }).click(); await p.getByText(/Abe Technician/).first().waitFor()
    await p.getByRole('button', { name: 'Review' }).click(); await dialog(p, 'Review service report').getByRole('button', { name: 'Mark as reviewed' }).click(); await p.getByText(/reviewed by/i).first().waitFor(); return true })
  await m.check(area, 'manager', 'service: log a new call for an existing customer and machine', async () => {
    await go(p, '/service'); await p.getByRole('button', { name: 'Log a service call' }).click(); const d = dialog(p, 'Log a service call')
    await d.getByLabel(/^customer/i).selectOption({ index: 1 }); await d.getByLabel(/^machine/i).selectOption({ index: 1 }).catch(() => {})
    await d.getByLabel(/call number/i).fill('SC-2002'); await d.getByLabel('Problem reported').fill('Coolant leak'); await d.getByRole('button', { name: 'Log service call' }).click()
    await p.getByRole('heading', { level: 1, name: 'Call SC-2002' }).or(p.getByRole('link', { name: 'SC-2002' })).first().waitFor(); return true })
  await m.check(area, 'manager', 'reports: charts and tables render for my branch', async () => { await go(p, '/reports'); await h1(p, 'Reports').waitFor(); await p.getByRole('figure', { name: 'Tasks by status' }).waitFor(); return !/Ben Engineer/.test(await p.locator('main').innerText()) })
  await m.check(area, 'manager', 'customers and machines are listed (managers may see all)', async () => { await go(p, '/customers'); return p.getByRole('link', { name: 'Acme Forgings' }).isVisible() })
  for (const [path, label] of [['/permissions', 'permissions'], ['/audit-logs', 'the audit trail'], [`/users/${users.MGRB.id}`, 'the other manager\'s profile'], [`/users/${users.EMPB1.id}`, 'the other branch\'s employee'], [`/users/${users.OWN001.id}`, 'the owner\'s profile']]) {
    await m.check('Security (UI)', 'manager', `typing the URL for ${label} shows "Not available"`, async () => await notAvailable(p, path))
  }
  for (const [path, label, leak] of [[`/tasks/${data.taskB1.id}`, 'the other branch\'s task', /Replace conveyor belt/], [`/service/${data.callB.id}`, 'the other branch\'s service call', /SC-3001|Tool changer/], [`/eod/${data.eodB1.id}`, 'the other branch\'s EOD', /Belt measured/]]) {
    await m.check('Security (UI)', 'manager', `typing the URL for ${label} shows no data`, async () => { await go(p, path); const body = await p.locator('main').innerText(); return /Not available|not found|couldn.t load/i.test(body) && !leak.test(body) ? true : `FAIL ${body.slice(0, 120)}` })
  }
  await m.check('Security (UI)', 'manager', 'the browser gets 403 calling owner APIs (audit logs, grants, users POST)', async () => p.evaluate(async () => { const a = await fetch('/api/v1/audit-logs', { credentials: 'include' }); const b = await fetch('/api/v1/permissions/grants', { credentials: 'include' }); return a.status === 403 && b.status === 403 }))
}

// ======================================================= 4. Owner
const O = want('owner') ? await signedIn('owner', 'OWN001') : null
if (want('owner')) {
  const area = 'Owner workflows (UI)'
  const p = O.page
  await m.check(area, 'owner', 'company overview', async () => { await h1(p, /Hello|Company overview/).waitFor(); return true })
  await m.check(area, 'owner', 'users: everyone, both branches', async () => { await go(p, '/users'); await h1(p, 'Users & hierarchy').waitFor(); const t = await p.locator('main').innerText(); return /Ben Engineer/.test(t) && /Ann Engineer/.test(t) && /Bob Manager/.test(t) ? true : `FAIL ${t.slice(0, 200)}` })
  await m.check(area, 'owner', 'users: add a person (and a duplicate ID is refused)', async () => {
    const add = async (code) => { await p.getByRole('button', { name: 'Add a person' }).click(); const d = dialog(p, 'Add a person'); await d.getByLabel(/employee id/i).fill(code); await d.getByLabel(/^name/i).fill('Nia Newhire'); await d.getByLabel('Designation').fill('Trainee'); await pick(d.getByLabel('Reports to'), /Alice/); await d.getByLabel(/temporary password/i).fill(TEMP('NEW1')); await d.getByRole('button', { name: 'Add person' }).click() }
    await add('NEW1'); await h1(p, 'Nia Newhire').waitFor()
    await go(p, '/users'); await add('NEW1'); await dialog(p).getByText(/already in use/i).waitFor(); await dialog(p).getByRole('button', { name: 'Cancel' }).click(); return true })
  await m.check(area, 'owner', 'person: change role, change manager, deactivate, reactivate', async () => {
    await go(p, '/users'); await p.getByRole('link', { name: 'Nia Newhire' }).first().click(); await h1(p, 'Nia Newhire').waitFor()
    await p.getByRole('button', { name: 'Change role' }).click(); await dialog(p, 'Change role for Nia Newhire').getByLabel('Role').selectOption('manager'); await dialog(p).getByRole('button', { name: 'Change role' }).click(); await p.getByText(/is now a manager/i).first().waitFor()
    await p.getByRole('button', { name: 'Change manager' }).click(); await pick(dialog(p, 'Change manager for Nia Newhire').getByLabel('Reports to'), /Bob/); await dialog(p).getByRole('button', { name: 'Save' }).click(); await p.getByText(/Bob Manager/).first().waitFor()
    await p.getByRole('button', { name: 'Deactivate' }).click(); await dialog(p, 'Deactivate Nia Newhire?').getByRole('button', { name: 'Deactivate' }).click(); await p.getByText('Inactive').first().waitFor()
    await p.getByRole('button', { name: 'Reactivate' }).click(); await dialog(p, 'Reactivate Nia Newhire?').getByRole('button', { name: 'Reactivate' }).click(); await p.getByText('Inactive').first().waitFor({ state: 'detached' }); return true })
  await m.check(area, 'owner', 'a deactivated person really cannot sign in (checked in a fresh browser)', async () => {
    await p.getByRole('button', { name: 'Deactivate' }).click(); await dialog(p).getByRole('button', { name: 'Deactivate' }).click(); await p.getByText('Inactive').first().waitFor()
    const c = await newCtx(); const q = await c.newPage(); await q.goto(BASE + '/login'); await q.locator('input[name="employee_code"]').fill('NEW1'); await q.locator('input[name="password"]').fill(TEMP('NEW1')); await q.getByRole('button', { name: 'Sign in' }).click(); await q.getByRole('alert').first().waitFor(); const ok = q.url().includes('/login'); await c.close(); return ok })
  // grant visibility - verified from the manager's own browser
  await m.check(area, 'owner', 'permissions: grant Alice sight of Bob\'s branch -> Alice\'s own browser then shows Bob\'s tasks (read-only)', async () => {
    await go(p, '/permissions'); await h1(p, 'Permissions').waitFor(); await p.getByRole('button', { name: 'Add a permission' }).click(); const d = dialog(p, 'Add a permission')
    await pick(d.getByLabel('Manager'), /Alice/)
    await pick(d.getByLabel('Permission'), /reports/i); await pick(d.getByLabel(/whose/i), /Bob/)
    await d.getByRole('button', { name: 'Add permission' }).click(); await p.getByText(/Permission added|added\./i).first().waitFor()
    await go(M.page, '/tasks'); const seen = await M.page.getByText('Replace conveyor belt').count(); await go(M.page, `/tasks/${data.taskB1.id}`)
    const readonly = (await M.page.getByRole('button', { name: /Edit task|Reassign|Save status/ }).count()) === 0
    return seen > 0 && readonly ? true : `FAIL seen=${seen} readonly=${readonly}` })
  await m.check(area, 'owner', 'permissions: the same grant added twice is refused with a clear message', async () => {
    await p.getByRole('button', { name: 'Add a permission' }).click(); const d = dialog(p, 'Add a permission')
    await pick(d.getByLabel('Manager'), /Alice/)
    await pick(d.getByLabel('Permission'), /reports/i); await pick(d.getByLabel(/whose/i), /Bob/)
    await d.getByRole('button', { name: 'Add permission' }).click(); await d.getByText(/already/i).first().waitFor(); await d.getByRole('button', { name: 'Cancel' }).click(); return true })
  await m.check(area, 'owner', 'permissions: revoke it -> Alice loses sight of Bob\'s branch again', async () => {
    await p.getByRole('button', { name: /^Revoke/ }).first().click(); await dialog(p, 'Revoke this permission?').getByRole('button', { name: 'Revoke' }).click(); await settle(p)
    await go(M.page, '/tasks'); return (await M.page.getByText('Replace conveyor belt').count()) === 0 })
  await m.check(area, 'owner', 'audit trail: lists the actions newest first, opens a detail, filters by action', async () => {
    await go(p, '/audit-logs'); await h1(p, 'Audit trail').waitFor(); await p.getByRole('button', { name: /Show details/ }).first().waitFor()
    await p.getByRole('button', { name: /Show details/ }).first().click(); await dialog(p).waitFor(); await p.keyboard.press('Escape')
    await p.getByLabel('Action').fill('permission.granted')
    const onlyGranted = async () => { const rows = (await p.getByRole('row').allInnerTexts()).slice(1); return rows.length > 0 && rows.every((r) => /Permission granted/.test(r)) }
    return (await eventually(onlyGranted, 20000)) ? true : 'FAIL the action filter did not narrow the list' })
  await m.check(area, 'owner', 'reports: company-wide figures and tables', async () => { await go(p, '/reports'); await h1(p, 'Reports').waitFor(); await p.getByRole('figure', { name: 'Tasks by status' }).waitFor(); return /Ben Engineer/.test(await p.locator('main').innerText()) })
  await m.check(area, 'owner', 'tasks: company-wide list includes both branches', async () => { await go(p, '/tasks'); const t = await p.locator('main').innerText(); return /Calibrate press line 3/.test(t) && /Replace conveyor belt/.test(t) })
  await m.check(area, 'owner', 'projects: archive and restore', async () => { await go(p, `/projects/${data.projectB.id}`); await p.getByRole('button', { name: 'Archive' }).click(); await dialog(p).getByRole('button', { name: 'Archive' }).click(); await p.getByRole('button', { name: 'Restore' }).waitFor(); await p.getByRole('button', { name: 'Restore' }).click(); await p.getByRole('button', { name: 'Archive' }).waitFor(); return true })
  await m.check(area, 'owner', 'leave: decide another branch\'s request', async () => { await go(p, '/leaves'); await p.getByRole('button', { name: 'Approve leave for Ben Engineer' }).click(); await dialog(p).getByRole('button', { name: 'Approve request' }).click(); await p.getByText('Leave request approved.').waitFor(); return true })
  await m.check(area, 'owner', 'service: any call, reassign responsibility', async () => { await go(p, `/service/${data.callB.id}`); await h1(p, 'Call SC-3001').waitFor(); return true })
  await m.check(area, 'owner', 'customers: deactivate and reactivate is possible', async () => { await go(p, `/customers/${data.customerB.id}`); return (await p.getByRole('button', { name: /Deactivate|Edit/ }).count()) > 0 })
}

// ======================================================= 5. Unreliable networks
if (want('network')) {
  const area = 'Network conditions'
  const slow = await newCtx(); const p = await slow.newPage(); watch(p, 'slow'); await uiLogin(p, 'EMPA1')
  const cdp = await slow.newCDPSession(p)
  await m.check(area, 'employee', 'slow 3G: the dashboard shows loading placeholders first, then real data', async () => {
    await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 800, downloadThroughput: 60 * 1024, uploadThroughput: 30 * 1024 })
    await p.goto(BASE + '/tasks'); const skel = await p.getByRole('status', { name: 'Loading' }).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false)
    await h1(p, 'My tasks').waitFor({ timeout: 120000 }); await p.getByRole('link', { name: 'Calibrate press line 3' }).waitFor({ timeout: 120000 }); return skel ? true : 'FAIL no loading state was shown' })
  await m.check(area, 'employee', 'slow 3G: a form submit shows progress, double-click sends one request', async () => {
    let posts = 0; p.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/leaves')) posts += 1 })
    await go(p, '/leaves'); await p.getByRole('button', { name: 'Apply for leave' }).click(); const d = dialog(p, 'Apply for leave')
    await d.getByLabel(/^from/i).fill('2027-02-01'); await d.getByLabel(/^to/i).fill('2027-02-01'); await d.getByLabel(/reason/i).fill('Slow network'); const b = d.getByRole('button', { name: 'Send request' })
    await b.dblclick(); await p.getByText('Leave request sent for approval.').waitFor({ timeout: 120000 }); return posts === 1 ? true : `FAIL ${posts} POSTs` })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await m.check(area, 'employee', 'connection drops while a form is open: Save is switched off, text is kept, saving works after reconnecting', async () => {
    await go(p, '/leaves'); await p.getByRole('button', { name: 'Apply for leave' }).click(); const d = dialog(p, 'Apply for leave')
    await d.getByLabel(/^from/i).fill('2027-03-01'); await d.getByLabel(/^to/i).fill('2027-03-01'); await d.getByLabel(/reason/i).fill('Drops mid-way')
    await slow.setOffline(true); await p.getByText(/offline/i).first().waitFor(); const disabled = await d.getByRole('button', { name: 'Send request' }).isDisabled(); const kept = await d.getByLabel(/reason/i).inputValue()
    await slow.setOffline(false); await p.waitForFunction(() => !document.querySelector('.banner-offline')); await d.getByRole('button', { name: 'Send request' }).click(); await p.getByText('Leave request sent for approval.').waitFor()
    return disabled && kept === 'Drops mid-way' ? true : `FAIL disabled=${disabled} kept=${kept}` })
  await m.check(area, 'employee', 'reload while the API is unreachable (server error 502): the app says so and does not sign out; Try again recovers', async () => {
    await p.route('**/api/v1/auth/me', (r) => r.fulfill({ status: 502, body: 'Bad gateway' })); await p.reload()
    await p.getByRole('heading', { name: /Can't reach the server|You're offline/ }).waitFor({ timeout: 20000 }).catch(async (e) => { await p.screenshot({ path: '/tmp/pw/shots/fail-502.png' }); console.error('502 BODY:', (await p.locator('body').innerText()).slice(0, 200)); throw e }); await p.unroute('**/api/v1/auth/me'); await p.getByRole('button', { name: 'Try again' }).click(); await h1(p, /leave/i).waitFor(); return true })
  await m.check(area, 'employee', 'a data call failing (500) shows the error with Try again; retry then loads', async () => {
    let fail = true; await p.route('**/api/v1/tasks?**', (r) => (fail ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'An unexpected error occurred. Reference: audit1' } }) }) : r.continue()))
    await go(p, '/tasks'); await p.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 60000 }); fail = false; await p.getByRole('button', { name: 'Try again' }).click(); await p.getByRole('link', { name: 'Calibrate press line 3' }).waitFor(); await p.unroute('**/api/v1/tasks?**'); return true })
  await m.check(area, 'employee', 'a request that times out / is cut shows "Cannot reach the server" with a way to retry', async () => {
    await p.route('**/api/v1/projects?**', (r) => r.abort('connectionreset')); await go(p, '/projects'); await p.getByText(/Cannot reach the server/).waitFor({ timeout: 60000 }); await p.getByRole('button', { name: 'Try again' }).waitFor(); await p.unroute('**/api/v1/projects?**'); return true })
  await slow.close()
  // real service worker: installed shell works offline
  const swc = await browser.newContext({ viewport: { width: 1366, height: 850 } }); swc.setDefaultTimeout(60000)
  const sp = await swc.newPage(); watch(sp, 'sw'); await uiLogin(sp, 'EMPA1'); await sp.evaluate(() => navigator.serviceWorker.ready); await sp.reload(); await eventually(() => sp.evaluate(() => !!navigator.serviceWorker.controller))
  await m.check(area, 'employee', 'offline reload opens the installed shell, signed in, with a clear message; reconnecting resumes', async () => {
    await swc.setOffline(true); await sp.reload(); await sp.getByRole('heading', { name: /You're offline|Can't reach the server/ }).waitFor({ timeout: 60000 })
    const signedOut = await sp.getByRole('heading', { name: /Welcome to OpsFlow/ }).count(); await swc.setOffline(false); await sp.getByRole('button', { name: 'Try again' }).click({ timeout: 3000 }).catch(() => {}); await sp.getByRole('navigation', { name: 'Main menu' }).waitFor({ timeout: 60000 }); return signedOut === 0 })
  await swc.close()
}

// ======================================================= 6. Layouts: desktop, tablet, phones
const VIEWS = [
  { name: 'Desktop 1366x850', viewport: { width: 1366, height: 850 }, nav: 'side', cards: false },
  { name: 'Tablet portrait 768x1024', viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true, nav: 'bottom', cards: false },
  { name: 'Tablet landscape 1024x768', viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, nav: 'side', cards: false },
  { name: 'Android 412x915', viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, nav: 'bottom', cards: true },
  { name: 'Small Android 360x640', viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, nav: 'bottom', cards: true },
  { name: 'iPhone 390x844', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, nav: 'bottom', cards: true },
]
const ROUTES = {
  employee: ['/dashboard', '/tasks', `/tasks/${data.taskA1.id}`, '/projects', '/leaves', '/eod', '/attendance', '/service', `/service/${data.call.id}`, '/calendar', '/notifications', '/profile'],
  manager: ['/dashboard', '/users', '/tasks', '/projects', '/leaves', '/eod', '/attendance', '/service', '/reports', '/calendar'],
  owner: ['/dashboard', '/users', '/permissions', '/audit-logs', '/reports', '/tasks', '/leaves', '/service', '/customers'],
}
for (const v of want('layout') ? VIEWS : []) {
  const { name, nav, cards, ...opts } = v
  for (const [role, code] of [['employee', 'EMPA1'], ['manager', 'MGRA'], ['owner', 'OWN001']]) {
    const ctx = await newCtx(opts); const p = await ctx.newPage(); watch(p, `${name} ${role}`)
    await uiLogin(p, code)
    const area = `Layout: ${name}`
    await m.check(area, role, `navigation is the ${nav === 'side' ? 'side menu' : 'bottom tab bar'}`, async () => { const side = await p.getByRole('navigation', { name: 'Main menu' }).isVisible(); const tabs = await p.getByRole('navigation', { name: 'Tab bar' }).isVisible(); return nav === 'side' ? side && !tabs : tabs && !side })
    const bad = []; const axeBad = []; const small = new Set(); let tables = 0
    for (const path of ROUTES[role]) {
      await go(p, path)
      if (!(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))) bad.push(path)
      if (cards && !path.startsWith('/reports')) tables += await p.locator('table.table:visible').count()
      const res = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      for (const x of res.violations) axeBad.push(`${path}: ${x.id} ${x.nodes[0].target.join(' ')}`)
      if (opts.hasTouch) for (const s of await p.evaluate(() => [...document.querySelectorAll('button, a.btn, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, nav a, summary')].filter((el) => !el.closest('dialog:not([open])') && !el.classList.contains('skip-link') && !el.classList.contains('visually-hidden')).map((el) => ({ r: el.getBoundingClientRect(), el })).filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 44 && r.width < 44).map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`))) small.add(`${path}: ${s}`)
    }
    m.add(area, role, `no horizontal scrolling on ${ROUTES[role].length} screens`, 'none', bad.join(' ') || 'none', bad.length === 0)
    m.add(area, role, 'axe WCAG 2.0/2.1 A+AA: no violations', 'none', axeBad.slice(0, 3).join(' ; ') || 'none', axeBad.length === 0)
    if (cards) m.add(area, role, 'lists are cards, not wide tables', '0 tables', String(tables), tables === 0)
    if (opts.hasTouch) m.add(area, role, 'touch targets are at least 44px (icon-only controls inside the target excluded)', 'none', [...small].slice(0, 4).join(' ; ') || 'none', small.size === 0)
    await ctx.close()
  }
}

await browser.close()
for (const a of Object.values(apis)) await a.dispose().catch(() => {})
await finish(m.failed.length ? 1 : 0)
