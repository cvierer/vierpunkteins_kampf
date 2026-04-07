import OBR from '@owlbear-rodeo/sdk'
import { isGmSync } from './editAccess.js'
import { getCombat } from './combatRoom.js'
import {
  buildMergedDisplayRows,
  findCombatStepIndex,
} from './phaseLinks.js'
import {
  collectSortedParticipants,
  TRACKER_ITEM_META_KEY,
} from './participants.js'

export const LH_MAX = 'lhMax'
export const LH_REM = 'lhRemaining'
export const LH_P2_ROUND = 'lhPendingSecondRound'
export const LH_P2_TARGET_INI = 'lhPendingSecondTargetIni'

let lhPrevCombat = null

function combatSnapshot(c) {
  return {
    started: Boolean(c.started),
    round: c.round,
    roundIntroPending: Boolean(c.roundIntroPending),
    currentItemId: c.currentItemId,
    currentPhaseLinkId: c.currentPhaseLinkId,
  }
}

function stepActiveForOwner(combat, ownerId) {
  if (!combat.started || combat.roundIntroPending) return false
  if (!combat.currentItemId) return false
  return combat.currentItemId === ownerId
}

function transitionedToOwner(prev, curr, ownerId) {
  return (
    stepActiveForOwner(curr, ownerId) && !stepActiveForOwner(prev, ownerId)
  )
}

function parseIni(value) {
  const n = Number(String(value ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function getCurrentStepContext(rows, items, tieOrderIds, combat) {
  const merged = buildMergedDisplayRows(rows, items, tieOrderIds)
  const steps = merged.map((e) =>
    e.kind === 'token'
      ? { kind: 'token', id: e.row.id }
      : { kind: 'phase', ownerId: e.ownerId, linkId: e.link.id }
  )
  const idx = findCombatStepIndex(steps, combat)
  const ownerIniById = new Map(rows.map((r) => [r.id, parseIni(r.initiative)]))
  if (idx < 0 || idx >= merged.length) {
    return { idx: -1, activeIni: null, ownerIniById }
  }
  const current = merged[idx]
  const activeIni =
    current.kind === 'token'
      ? parseIni(current.row.initiative)
      : Number.isFinite(current.hookIni)
        ? current.hookIni
        : null
  return { idx, activeIni, ownerIniById }
}

function isBackward(prev, curr, prevIdx, currIdx) {
  if (!prev) return false
  if (curr.round < prev.round) return true
  if (curr.round > prev.round) return false
  if (currIdx >= 0 && prevIdx >= 0) return currIdx < prevIdx
  return false
}

function normalizeP2Round(raw) {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : null
}

function normalizeP2TargetIni(raw) {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function readPending(meta) {
  if (!meta || typeof meta !== 'object') return { p2Round: null, p2Ini: null }
  return {
    p2Round: normalizeP2Round(meta[LH_P2_ROUND]),
    p2Ini: normalizeP2TargetIni(meta[LH_P2_TARGET_INI]),
  }
}

export function readLhState(meta) {
  if (!meta || typeof meta !== 'object') {
    return { max: 0, rem: 0 }
  }
  const max = Math.max(0, Math.floor(Number(meta[LH_MAX])) || 0)
  let rem = Math.max(0, Math.floor(Number(meta[LH_REM])) || 0)
  if (rem > max && max > 0) rem = max
  return { max, rem }
}

/**
 * L.H.-Wert setzen (leer / 0 = aus). Setzt max = rem = n und löscht ausstehenden 2. Abzug.
 */
export async function commitLhValue(itemId, text) {
  const trimmed = String(text ?? '').trim()
  const n =
    trimmed === '' ? 0 : Math.floor(Number(trimmed.replace(',', '.')))
  if (trimmed !== '' && (!Number.isFinite(n) || n < 0)) return
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const d of drafts) {
      const m = d.metadata[TRACKER_ITEM_META_KEY]
      if (!m) continue
      if (n <= 0) {
        m[LH_MAX] = 0
        m[LH_REM] = 0
        delete m[LH_P2_ROUND]
        delete m[LH_P2_TARGET_INI]
      } else {
        m[LH_MAX] = n
        m[LH_REM] = n
        delete m[LH_P2_ROUND]
        delete m[LH_P2_TARGET_INI]
      }
    }
  })
}

/**
 * Nach Kampf-Metadaten-Update: 2. Abzug (8 Schritte später), dann 1. Abzug beim „Dran“-Wechsel.
 * Nur GM schreibt; Zähler bleiben über Kampfrunden erhalten.
 */
export async function runLongHandlungAfterCombatUpdate(items, tieOrderIds) {
  const curr = getCombat()
  const prev = lhPrevCombat

  if (!curr.started || curr.roundIntroPending) {
    lhPrevCombat = combatSnapshot(curr)
    return
  }

  const rows = collectSortedParticipants(items, tieOrderIds)
  const currCtx = getCurrentStepContext(rows, items, tieOrderIds, curr)

  if (currCtx.idx < 0 || !isGmSync()) {
    lhPrevCombat = combatSnapshot(curr)
    return
  }

  if (!prev || !prev.started) {
    lhPrevCombat = combatSnapshot(curr)
    return
  }

  const prevCtx = getCurrentStepContext(rows, items, tieOrderIds, prev)
  const movedBack = isBackward(prev, curr, prevCtx.idx, currCtx.idx)
  const trackerItems = items.filter((i) => i.metadata?.[TRACKER_ITEM_META_KEY])

  /** @type {Map<string, { max: number, rem: number, p2Round: number | null, p2Ini: number | null }>} */
  const byId = new Map()

  const setState = (id, max, rem, p2Round, p2Ini) => {
    let nextMax = max
    let nextRem = Math.max(0, rem)
    let nextRound = p2Round
    let nextIni = p2Ini
    if (nextRem <= 0) {
      nextMax = 0
      nextRem = 0
      nextRound = null
      nextIni = null
    }
    byId.set(id, {
      max: nextMax,
      rem: nextRem,
      p2Round: nextRound,
      p2Ini: nextIni,
    })
  }

  const getState = (item) => {
    const ex = byId.get(item.id)
    if (ex) return ex
    const meta = item.metadata[TRACKER_ITEM_META_KEY]
    return { ...readLhState(meta), ...readPending(meta) }
  }

  if (movedBack) {
    for (const item of trackerItems) {
      const st = getState(item)
      if (st.max <= 0) continue
      setState(item.id, st.max, st.max, null, null)
    }
  }

  for (const item of trackerItems) {
    const st = getState(item)
    if (st.max <= 0 || st.rem <= 0 || st.p2Round == null || st.p2Ini == null) continue
    if (curr.round !== st.p2Round) continue
    if (currCtx.activeIni == null || currCtx.activeIni > st.p2Ini) continue
    setState(item.id, st.max, st.rem - 1, null, null)
  }

  for (const item of trackerItems) {
    const st = getState(item)
    if (st.max <= 0 || st.rem <= 0) continue
    if (!transitionedToOwner(prev, curr, item.id)) continue
    const ownerIni = currCtx.ownerIniById.get(item.id)
    if (ownerIni == null) continue
    const stNow = getState(item)
    const newRem = stNow.rem - 1
    const clamped = Math.max(0, newRem)
    const p2Ini = ownerIni - 8
    const shouldArmSecond = clamped > 0 && Number.isFinite(p2Ini)
    setState(
      item.id,
      stNow.max,
      clamped,
      shouldArmSecond ? curr.round : null,
      shouldArmSecond ? p2Ini : null
    )
  }

  const changed = []
  for (const item of trackerItems) {
    if (!byId.has(item.id)) continue
    const next = byId.get(item.id)
    const prevSt = readLhState(item.metadata[TRACKER_ITEM_META_KEY])
    const prevPending = readPending(item.metadata[TRACKER_ITEM_META_KEY])
    if (
      next.rem === prevSt.rem &&
      next.max === prevSt.max &&
      next.p2Round === prevPending.p2Round &&
      next.p2Ini === prevPending.p2Ini
    ) {
      continue
    }
    changed.push({ id: item.id, ...next })
  }

  if (changed.length > 0) {
    const byIdPatch = new Map(changed.map((c) => [c.id, c]))
    await OBR.scene.items.updateItems(changed.map((c) => c.id), (drafts) => {
      for (const d of drafts) {
        const p = byIdPatch.get(d.id)
        if (!p) continue
        const m = d.metadata[TRACKER_ITEM_META_KEY]
        if (!m) continue
        m[LH_MAX] = p.max
        m[LH_REM] = p.rem
        if (p.p2Round == null) delete m[LH_P2_ROUND]
        else m[LH_P2_ROUND] = p.p2Round
        if (p.p2Ini == null) delete m[LH_P2_TARGET_INI]
        else m[LH_P2_TARGET_INI] = p.p2Ini
      }
    })
  }

  lhPrevCombat = combatSnapshot(curr)
}
