import OBR from '@owlbear-rodeo/sdk'
import { canEditSceneItem, isGmSync } from './editAccess.js'
import {
  getTokenListDisplayName,
  TRACKER_ITEM_META_KEY,
} from './participants.js'
import {
  ACTION_STAMPS_KEY,
  getCombat,
  normalizeActionStamps,
  patchActionStamps,
} from './combatRoom.js'
import { faMaxForInitiative, getRoomSettings } from './roomSettings.js'

export const KR_ANG = 'krAng'
export const KR_ABW = 'krAbw'
/** Sonstige reguläre Aktionen (z. B. Atem holen, Bewegen, Position, Taktik) */
export const KR_SRA = 'krSra'
export const KR_FREE_ACTION = 'krFreeAction'
/** L.H. mit genau einer Aktion: klickbarer Stempel wie Ang./Abw./S.R.A./F.A. */
export const KR_LH_ACTION = 'krLhAction'

/** @deprecated Altes Feld; wird nur noch beim Lesen für Migration genutzt. */
const LEGACY_KR_ACTION = 'krAction'

/** Obergrenze Ang./Abw./S.R.A./F.A. (zyklisch 10→0 bzw. 0→10). */
export const KR_COUNTER_MAX = 10

/** Ziffer 0…max aus gespeichertem Wert (Standard max 10). */
export function normalizeKrDigit(raw, max = KR_COUNTER_MAX) {
  const cap = Math.max(0, Math.floor(Number(max)) || KR_COUNTER_MAX)
  let n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return 0
  if (n < 0) n = 0
  if (n > cap) n = cap
  return n
}

export function readKrFreeAction(meta, faMax) {
  const cap = Math.max(1, Math.min(5, Math.floor(Number(faMax)) || 2))
  return normalizeKrDigit(meta?.[KR_FREE_ACTION], cap)
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

export function readKrLhAction(meta) {
  return normalizeKrDigit(meta?.[KR_LH_ACTION])
}

/**
 * Links +1 (10→0), Rechts −1 (0→10).
 * @param {{ stampAnchor?: { rowId: string, phaseLinkId: string | null } }} [options]
 */
export async function patchKrCounterByDelta(itemId, field, delta, options = {}) {
  const inc = delta > 0
  const items = await OBR.scene.items.getItems()
  const item = items.find((i) => i.id === itemId)
  const meta = item?.metadata?.[TRACKER_ITEM_META_KEY]
  let maxDigit = KR_COUNTER_MAX
  if (field === KR_FREE_ACTION) {
    const iniStr = meta?.initiative
    const settings = getRoomSettings()
    maxDigit = faMaxForInitiative(iniStr, settings.highIniFreeActions)
  }
  const mod = maxDigit + 1
  const cur = normalizeKrDigit(meta?.[field], maxDigit)
  const next = inc ? (cur + 1) % mod : (cur + mod - 1) % mod
  const ownerName =
    getTokenListDisplayName(item) || String(item?.name ?? '')
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const draft of drafts) {
      const m = draft.metadata[TRACKER_ITEM_META_KEY]
      if (!m) continue
      m[field] = next
    }
  })

  let addCount = 0
  let removeCount = 0
  if (inc) {
    if (next === 0 && cur > 0) removeCount = cur
    else if (next > cur) addCount = next - cur
  } else {
    if (cur === 0 && next > 0) addCount = next
    else if (next < cur) removeCount = cur - next
  }
  if (addCount <= 0 && removeCount <= 0) return

  await patchActionStamps((stamps) => {
    const entries = [...stamps.entries]
    if (removeCount > 0) {
      let remaining = removeCount
      for (let i = entries.length - 1; i >= 0 && remaining > 0; i--) {
        const e = entries[i]
        if (e.itemId !== itemId || e.field !== field) continue
        entries.splice(i, 1)
        remaining--
      }
    }
    if (addCount > 0) {
      const c = getCombat()
      let anchorRowId = itemId
      let anchorPhaseLinkId = null
      const forced = options?.stampAnchor
      if (forced && typeof forced.rowId === 'string') {
        anchorRowId = forced.rowId
        anchorPhaseLinkId =
          typeof forced.phaseLinkId === 'string' ? forced.phaseLinkId : null
      } else if (
        c.started &&
        !c.roundIntroPending &&
        typeof c.currentItemId === 'string'
      ) {
        anchorRowId = c.currentItemId
        anchorPhaseLinkId =
          typeof c.currentPhaseLinkId === 'string'
            ? c.currentPhaseLinkId
            : null
      }
      for (let i = 0; i < addCount; i++) {
        entries.push({
          id: `stamp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          itemId,
          ownerName,
          field,
          anchorRowId,
          anchorPhaseLinkId,
        })
      }
    }
    const anchorId =
      entries.length > 0
        ? stamps.anchorId ||
          (typeof getCombat().currentItemId === 'string'
            ? getCombat().currentItemId
            : itemId)
        : null
    return { anchorId, entries }
  })
}

/**
 * Einen Aktions-Stempel schließen: Zähler um eins wie Rechtsklick (−1), Stempel aus der Liste.
 */
export async function undoKrActionStamp(stampId) {
  if (typeof stampId !== 'string' || !stampId) return
  const roomMeta = await OBR.room.getMetadata()
  const curStamps = normalizeActionStamps(roomMeta[ACTION_STAMPS_KEY])
  const entry = curStamps.entries.find((e) => e.id === stampId)
  if (!entry) return

  const items = await OBR.scene.items.getItems()
  const item = items.find((i) => i.id === entry.itemId)
  if (!canEditSceneItem(item)) return

  const meta = item?.metadata?.[TRACKER_ITEM_META_KEY]
  let maxDigit = KR_COUNTER_MAX
  if (entry.field === KR_FREE_ACTION) {
    const iniStr = meta?.initiative
    const settings = getRoomSettings()
    maxDigit = faMaxForInitiative(iniStr, settings.highIniFreeActions)
  }
  const mod = maxDigit + 1
  const cur = normalizeKrDigit(meta?.[entry.field], maxDigit)
  const next = (cur + mod - 1) % mod

  await OBR.scene.items.updateItems([entry.itemId], (drafts) => {
    for (const draft of drafts) {
      const m = draft.metadata[TRACKER_ITEM_META_KEY]
      if (m) m[entry.field] = next
    }
  })

  const skipGmStamp = canEditSceneItem(item) && !isGmSync()
  await patchActionStamps(
    (stamps) => {
      const entries = stamps.entries.filter((e) => e.id !== stampId)
      const anchorId =
        entries.length > 0
          ? stamps.anchorId ||
            (typeof getCombat().currentItemId === 'string'
              ? getCombat().currentItemId
              : entry.itemId)
          : null
      return { anchorId, entries }
    },
    { skipGmCheck: skipGmStamp }
  )
}

/**
 * Letzten Stempel zu itemId+field entfernen (wie × in der Liste); sonst ein Schritt −1 am Zähler.
 */
export async function undoLastKrFieldStamp(itemId, field) {
  const roomMeta = await OBR.room.getMetadata()
  const curStamps = normalizeActionStamps(roomMeta[ACTION_STAMPS_KEY])
  for (let i = curStamps.entries.length - 1; i >= 0; i--) {
    const e = curStamps.entries[i]
    if (e.itemId === itemId && e.field === field) {
      await undoKrActionStamp(e.id)
      return
    }
  }
  const items = await OBR.scene.items.getItems()
  const item = items.find((i) => i.id === itemId)
  if (!canEditSceneItem(item)) return
  const meta = item?.metadata?.[TRACKER_ITEM_META_KEY]
  let maxDigit = KR_COUNTER_MAX
  if (field === KR_FREE_ACTION) {
    const iniStr = meta?.initiative
    const settings = getRoomSettings()
    maxDigit = faMaxForInitiative(iniStr, settings.highIniFreeActions)
  }
  const cur = normalizeKrDigit(meta?.[field], maxDigit)
  if (cur <= 0) return
  await patchKrCounterByDelta(itemId, field, -1)
}

function lhStampMatchesAnchorRemoval(e, itemId, onlyAnchorPhaseLinkId) {
  if (e.itemId !== itemId || e.field !== KR_LH_ACTION) return false
  if (onlyAnchorPhaseLinkId === undefined) return true
  const apl = e.anchorPhaseLinkId
  if (onlyAnchorPhaseLinkId === null)
    return apl == null || apl === ''
  return apl === onlyAnchorPhaseLinkId
}

/**
 * L.H.-Stempel für das Token entfernen und krLhAction an verbleibende Stempel anpassen.
 * @param {string | null | undefined} [onlyAnchorPhaseLinkId] — `undefined`: alle L.H.-Stempel; `null`: nur unter Token-Zeile; `string`: nur dieser Phasen-Link (2.A. / lhDone).
 */
export async function clearKrLhStampsForItem(itemId, onlyAnchorPhaseLinkId) {
  const items = await OBR.scene.items.getItems()
  const item = items.find((i) => i.id === itemId)
  if (!canEditSceneItem(item)) return
  const skipGmStamp = canEditSceneItem(item) && !isGmSync()
  let newLhCount = 0
  await patchActionStamps(
    (stamps) => {
      const entries = stamps.entries.filter(
        (e) =>
          !lhStampMatchesAnchorRemoval(e, itemId, onlyAnchorPhaseLinkId)
      )
      newLhCount = entries.filter(
        (e) => e.itemId === itemId && e.field === KR_LH_ACTION
      ).length
      const anchorId =
        entries.length > 0
          ? stamps.anchorId ||
            (typeof getCombat().currentItemId === 'string'
              ? getCombat().currentItemId
              : itemId)
          : null
      return { anchorId, entries }
    },
    { skipGmCheck: skipGmStamp }
  )
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const draft of drafts) {
      const m = draft.metadata[TRACKER_ITEM_META_KEY]
      if (m) m[KR_LH_ACTION] = newLhCount
    }
  })
}

/**
 * Wie einmal S.R.A. o. ä. klicken: Stempel + Zähler 1 (vorher L.H.-Stempel dieses Tokens leeren).
 * @param {string | null | undefined} [stampPhaseLinkId] — `null` = Token-Zeile; String = Phasen-Link (2.A. …); `undefined` = Anker wie aktueller Kampfschritt.
 */
export async function applyLhOneClickStamp(itemId, stampPhaseLinkId) {
  if (stampPhaseLinkId === undefined) {
    await clearKrLhStampsForItem(itemId)
  } else {
    await clearKrLhStampsForItem(itemId, stampPhaseLinkId)
  }
  const stampOpts =
    stampPhaseLinkId !== undefined
      ? {
          stampAnchor: {
            rowId: itemId,
            phaseLinkId:
              typeof stampPhaseLinkId === 'string' ? stampPhaseLinkId : null,
          },
        }
      : {}
  await patchKrCounterByDelta(itemId, KR_LH_ACTION, 1, stampOpts)
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
          m[KR_LH_ACTION] = 0
          delete m[LEGACY_KR_ACTION]
        }
      }
    }
  )
  await patchActionStamps(() => ({ anchorId: null, entries: [] }))
}
