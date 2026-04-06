import OBR from '@owlbear-rodeo/sdk'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const KR_ANG = 'krAng'
export const KR_ABW = 'krAbw'
export const KR_FREE_ACTION = 'krFreeAction'

/** @deprecated Altes Feld; wird nur noch beim Lesen für Migration genutzt. */
const LEGACY_KR_ACTION = 'krAction'

/** Ziffer 0–9 aus gespeichertem Wert. */
export function normalizeKrDigit(raw) {
  let n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return 0
  n %= 10
  return n < 0 ? n + 10 : n
}

export function readKrAng(meta) {
  if (meta && meta[KR_ANG] != null) return normalizeKrDigit(meta[KR_ANG])
  if (meta && meta[LEGACY_KR_ACTION] != null)
    return normalizeKrDigit(meta[LEGACY_KR_ACTION])
  return 0
}

export function readKrAbw(meta) {
  return normalizeKrDigit(meta?.[KR_ABW])
}

/**
 * Links +1 (9→0), Rechts −1 (0→9).
 */
export async function patchKrCounterByDelta(itemId, field, delta) {
  const inc = delta > 0
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const draft of drafts) {
      const m = draft.metadata[TRACKER_ITEM_META_KEY]
      if (!m) continue
      const cur = normalizeKrDigit(m[field])
      m[field] = inc ? (cur + 1) % 10 : (cur + 9) % 10
    }
  })
}

/** Alle Kampfteilnehmer: Ang./Abw./F.A. auf 0 (neue Kampfrunde / Kampfstart). */
export async function resetAllKrCountersInScene() {
  const items = await OBR.scene.items.getItems((item) =>
    Boolean(item.metadata?.[TRACKER_ITEM_META_KEY])
  )
  if (items.length === 0) return
  await OBR.scene.items.updateItems(
    items.map((i) => i.id),
    (drafts) => {
      for (const draft of drafts) {
        const m = draft.metadata[TRACKER_ITEM_META_KEY]
        if (m) {
          m[KR_ANG] = 0
          m[KR_ABW] = 0
          m[KR_FREE_ACTION] = 0
          delete m[LEGACY_KR_ACTION]
        }
      }
    }
  )
}
