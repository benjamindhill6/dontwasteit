/** The app's home is https://dontwasteit.net. The old dontwasteit.pages.dev address keeps working
 *  (installed copies and push alerts still point at it), but it shows this banner so people move over.
 *  Branch previews (<branch>.dontwasteit.pages.dev) don't show it. */
const OLD_HOST = 'dontwasteit.pages.dev'
const NEW_ORIGIN = 'https://dontwasteit.net'

export default function MovedBanner() {
  if (window.location.hostname !== OLD_HOST) return null
  const href = NEW_ORIGIN + window.location.pathname + window.location.search
  return (
    <a className="moved-banner" href={href}>
      <strong>We moved to dontwasteit.net</strong>
      <span>Tap here to open it. Sign in there once, turn alerts back on in Profile, and add it to your home screen in place of this one.</span>
    </a>
  )
}
