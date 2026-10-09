/** Tells other open tabs that this browser logged out, so none keeps showing a stale session. */

const CHANNEL_NAME = 'opsflow-auth'

/** Identifies this tab, so a tab ignores its own announcements. */
const THIS_TAB = crypto.randomUUID()

export interface SessionChannel {
  announceLogout: () => void
  /** Listen for a logout in ANOTHER tab; returns the unsubscribe function. */
  onLogout: (handler: () => void) => () => void
}

interface Message {
  type: 'logout'
  from: string
}

export function createSessionChannel(tabId: string = THIS_TAB): SessionChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return { announceLogout: () => undefined, onLogout: () => () => undefined }
  }
  return {
    // A short-lived sender: keeping one channel object for both directions breaks when React
    // re-runs effect cleanups (it would be closed while still needed for sending).
    announceLogout: () => {
      const sender = new BroadcastChannel(CHANNEL_NAME)
      sender.postMessage({ type: 'logout', from: tabId } satisfies Message)
      sender.close()
    },
    onLogout: (handler) => {
      const receiver = new BroadcastChannel(CHANNEL_NAME)
      receiver.onmessage = (event: MessageEvent<Message>) => {
        if (event.data?.type === 'logout' && event.data.from !== tabId) handler()
      }
      return () => receiver.close()
    },
  }
}
