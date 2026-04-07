import OBR from '@owlbear-rodeo/sdk'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const KR_ANG = 'krAng'
export const KR_ABW = 'krAbw'
/** Sonstige reguläre Aktionen (z. B. Atem holen, Bewegen, Position, Taktik) */
export const KR_SRA = 'krSra'
export const KR_FREE_ACTION = 'krFreeAction'

/** @deprecated Altes Feld; wird nur noch beim Lesen für Migration genutzt. */
const LEGACY_KR_ACTION = 'krAction'

/** Obergrenze Ang./Abw./S.R.A./F.A. (zyklisch 10→0 bzw. 0→10). */
export const KR_COUNTER_MAX = 10

/** Ziffer 0–10 aus gespeichertem Wert. */
export function normalizeKrDigit(raw) {
  let n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return 0
  if (n < 0) n = 0
  if (n > KR_COUNTER_MAX) n = KR_COUNTER_MAX
  return n
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

export function readKrSra(meta) {
  return normalizeKrDigit(meta?.[KR_SRA])
}

/**
 * Links +1 (10→0), Rechts −1 (0→10).
 */
export async function patchKrCounterByDelta(itemId, field, delta) {
  const inc = delta > 0
  const mod = KR_COUNTER_MAX + 1
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const draft of drafts) {
      const m = draft.metadata[TRACKER_ITEM_META_KEY]
      if (!m) continue
      const cur = normalizeKrDigit(m[field])
      m[field] = inc ? (cur + 1) % mod : (cur + mod - 1) % mod
    }
  })
}

/** Alle Kampfteilnehmer: Ang./Abw./S.R.A./F.A. auf 0 (neue Kampfrunde / Kampfstart). */
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
          m[KR_SRA] = 0
          m[KR_FREE_ACTION] = 0
          delete m[LEGACY_KR_ACTION]
        }
      }
    }
  )
}
