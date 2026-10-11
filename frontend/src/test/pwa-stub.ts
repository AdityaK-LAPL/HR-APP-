// Stand-in for the build-time "virtual:pwa-register/react" module in unit tests.
export function useRegisterSW(_options?: unknown) {
  return {
    needRefresh: [false, () => undefined] as const,
    offlineReady: [false, () => undefined] as const,
    updateServiceWorker: async () => undefined,
  }
}
