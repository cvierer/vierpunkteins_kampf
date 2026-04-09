/**
 * UI-Kennung „V.xxx“: unter GitHub Actions = `GITHUB_RUN_NUMBER` (Vite `define`),
 * lokal = BUILD_VERSION_FALLBACK.
 */
export const BUILD_VERSION_FALLBACK = 64

// eslint-disable-next-line no-undef -- ersetzt beim Build durch Vite `define`
const raw = typeof __CI_BUILD_NUM__ !== 'undefined' ? __CI_BUILD_NUM__ : ''

export const BUILD_VERSION =
  typeof raw === 'string' &&
  raw !== '' &&
  Number.isFinite(Number(raw)) &&
  Number(raw) > 0
    ? Number(raw)
    : BUILD_VERSION_FALLBACK
