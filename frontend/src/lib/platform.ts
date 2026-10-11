/** iPhone / iPad Safari cannot install from a button: the person has to use Share -> Add to Home Screen. */
export function isIosSafari(userAgent: string = navigator.userAgent, maxTouchPoints: number = navigator.maxTouchPoints): boolean {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  const webkitSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)
  return ios && webkitSafari
}
