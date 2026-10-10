/** A link that opens an address in the phone's/desktop's maps app. Nothing about the address leaves the page until the user taps it. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
