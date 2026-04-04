export function assetUrl(file) {
  return `${import.meta.env.BASE_URL}${file}`.replace(/\/{2,}/g, '/')
}
