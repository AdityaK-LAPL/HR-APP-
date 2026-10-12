// Loads the production build under its real content-security policy (`vite preview` sends it) and
// fails if the browser blocks anything: signs in as each role, visits the main screens, uploads and
// downloads a file, punches in with a location and lets the service worker take over.
// Needs a company seeded by lib.seedCompany(); pass its data file as E2E_REUSE.
import { readFileSync } from 'node:fs'
import { BASE, PW, launch } from './lib.mjs'

const d = JSON.parse(readFileSync(process.env.E2E_REUSE ?? '/tmp/e2e-data.json', 'utf8'))
const b = await launch()
const bad = []
const routes = {
  EMPA1: ['/dashboard', '/tasks', `/tasks/${d.taskA1.id}`, '/attendance', '/service', `/service/${d.call.id}`, '/leaves', '/calendar'],
  MGRA: ['/dashboard', '/users', '/reports', '/tasks', '/service', '/customers'],
  OWN001: ['/dashboard', '/permissions', '/audit-logs', '/reports'],
}
for (const [code, list] of Object.entries(routes)) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 850 }, geolocation: { latitude: 12.9, longitude: 77.5 }, permissions: ['geolocation'] })
  ctx.setDefaultTimeout(40000)
  await ctx.addInitScript(() => {
    window.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  const p = await ctx.newPage()
  p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) bad.push(`${code} console: ${m.text().slice(0, 160)}`) })
  await p.goto(`${BASE}/login`)
  await p.locator('input[name="employee_code"]').fill(code)
  await p.locator('input[name="password"]').fill(PW(code))
  await p.getByRole('button', { name: 'Sign in' }).click()
  await p.getByRole('navigation', { name: /Main menu|Tab bar/ }).first().waitFor({ state: 'attached' })
  for (const r of list) { await p.goto(BASE + r); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(300) }
  if (code === 'EMPA1') {
    await p.goto(`${BASE}/tasks/${d.taskA1.id}`)
    await p.getByLabel(/choose a file to attach/i).setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await p.getByText('note.txt uploaded.').waitFor()
    const href = await p.getByRole('link', { name: 'Download note.txt' }).getAttribute('href')
    const status = await p.evaluate(async (u) => (await fetch(u, { credentials: 'include' })).status, href)
    if (status !== 200) bad.push(`download answered ${status}`)
    await p.goto(`${BASE}/attendance`)
    const pin = p.getByRole('button', { name: 'Punch in' })
    if (await pin.count()) { await pin.click(); await p.waitForTimeout(1500) }
    await p.evaluate(() => navigator.serviceWorker.ready)
    await p.reload(); await p.waitForTimeout(1500)
  }
  const v = await p.evaluate(() => window.__csp)
  if (v.length) bad.push(`${code}: ${[...new Set(v)].join(' | ')}`)
  await ctx.close()
}
await b.close()
console.log(bad.length ? `CSP VIOLATIONS:\n${bad.join('\n')}` : 'no content-security-policy violations')
process.exit(bad.length ? 1 : 0)
