export interface Coordinates {
  latitude: number
  longitude: number
}

export type LocationResult =
  | { ok: true; coordinates: Coordinates }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' | 'timeout' }

/**
 * One-shot location lookup, only ever called at the moment a user punches in/out or records a
 * visit (never polled). The browser asks the user for permission; every failure is reported so
 * the caller can carry on without a location.
 */
export function getCurrentLocation(timeoutMs = 8000): Promise<LocationResult> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve({ ok: false, reason: 'unsupported' })
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          coordinates: {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
          },
        }),
      (error) =>
        resolve({
          ok: false,
          reason:
            error.code === error.PERMISSION_DENIED
              ? 'denied'
              : error.code === error.TIMEOUT
                ? 'timeout'
                : 'unavailable',
        }),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

export function describeLocationFailure(reason: Extract<LocationResult, { ok: false }>['reason']): string {
  switch (reason) {
    case 'denied':
      return 'Location permission was denied, so it was not recorded.'
    case 'timeout':
      return 'Your location took too long to find, so it was not recorded.'
    case 'unsupported':
      return 'This device cannot share its location, so it was not recorded.'
    default:
      return 'Your location is unavailable, so it was not recorded.'
  }
}
