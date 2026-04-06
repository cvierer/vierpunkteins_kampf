import OBR from '@owlbear-rodeo/sdk'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const KR_ACTION = 'krAction'
export const KR_FREE_ACTION = 'krFreeAction'

/** Ziffer 0–9 aus gespeichertem Wert. */
export function normalizeKrDigit(raw) {
  let n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return 0
  n %= 10
  return n < 0 ? n + 10 : n
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

/** Alle Kampfteilnehmer: A. und F.A. auf 0 (neue Kampfrunde / Kampfstart). */
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
          m[KR_ACTION] = 0
          m[KR_FREE_ACTION] = 0
        }
      }
    }
  )
}
