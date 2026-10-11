import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The tests run from the frontend folder (or its colon-free mirror), so paths start at the working directory.
const file = (path: string) => readFileSync(resolve(process.cwd(), 'public', path))
const png = (path: string) => {
  const bytes = file(path)
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a') // a real PNG, not a renamed file
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('app icons', () => {
  it('ship as real PNGs at the sizes the manifest and the platforms ask for', () => {
    expect(png('icons/icon-192.png')).toEqual({ width: 192, height: 192 })
    expect(png('icons/icon-512.png')).toEqual({ width: 512, height: 512 })
    expect(png('icons/icon-maskable-512.png')).toEqual({ width: 512, height: 512 })
    expect(png('icons/apple-touch-icon.png')).toEqual({ width: 180, height: 180 })
    expect(png('icons/favicon-32.png')).toEqual({ width: 32, height: 32 })
  })

  it('the page and the manifest point at files that exist', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    expect(html).toContain('/icons/apple-touch-icon.png')
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/) // no third-party font request: the font is bundled
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
    for (const icon of config.match(/\/icons\/[\w-]+\.png/g) ?? []) expect(() => file(icon.slice(1))).not.toThrow()
    expect(config).toContain("purpose: 'maskable'")
  })
})
