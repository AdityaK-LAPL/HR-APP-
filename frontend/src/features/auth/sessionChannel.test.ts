import { describe, expect, it, vi } from 'vitest'
import { createSessionChannel } from './sessionChannel'

describe('session channel', () => {
  it('delivers a logout announced elsewhere to a listener', async () => {
    const handler = vi.fn()
    const listening = createSessionChannel('tab-a')
    const unsubscribe = listening.onLogout(handler)

    createSessionChannel('tab-b').announceLogout() // another tab
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))

    unsubscribe()
  })

  it('ignores its own announcements', async () => {
    const handler = vi.fn()
    const channel = createSessionChannel('same-tab')
    const unsubscribe = channel.onLogout(handler)
    channel.announceLogout()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(handler).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('can announce repeatedly and after listeners were torn down (React effect re-runs)', async () => {
    const channel = createSessionChannel()
    channel.onLogout(() => undefined)()
    expect(() => {
      channel.announceLogout()
      channel.announceLogout()
    }).not.toThrow()
  })

  it('stops delivering after unsubscribe', async () => {
    const handler = vi.fn()
    const channel = createSessionChannel('tab-a')
    channel.onLogout(handler)()
    createSessionChannel('tab-b').announceLogout()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(handler).not.toHaveBeenCalled()
  })
})
