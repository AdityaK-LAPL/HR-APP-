// Runs Vitest. Vite/Vitest cannot resolve modules when the project path contains a ":" (this
// repository currently lives in ".../antigravity-ide:/HR APP Antigravity"). In that case the tests
// run from a throw-away mirror in the OS temp directory (src, config and the OpenAPI file are
// copied; node_modules is symlinked). Move the project to a path without ":" and this
// script simply runs Vitest in place.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const frontend = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
let cwd = frontend

if (frontend.includes(':')) {
  const mirror = join(tmpdir(), 'hr-app-frontend-test')
  const mirrorFrontend = join(mirror, 'frontend')
  rmSync(mirror, { recursive: true, force: true })
  mkdirSync(mirrorFrontend, { recursive: true })
  mkdirSync(join(mirror, 'docs'), { recursive: true })
  for (const entry of ['src', 'package.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'index.html', 'public']) {
    if (existsSync(join(frontend, entry))) cpSync(join(frontend, entry), join(mirrorFrontend, entry), { recursive: true })
  }
  cpSync(join(frontend, '..', 'docs', 'openapi.json'), join(mirror, 'docs', 'openapi.json'))
  symlinkSync(join(frontend, 'node_modules'), join(mirrorFrontend, 'node_modules'))
  cwd = mirrorFrontend
  console.log(`[run-tests] path contains ":" - running in mirror ${mirrorFrontend}`)
}

const result = spawnSync(join(cwd, 'node_modules', '.bin', 'vitest'), args.length ? args : ['run'], {
  cwd,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
