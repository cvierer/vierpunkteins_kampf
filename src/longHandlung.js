import OBR from '@owlbear-rodeo/sdk'
import { isGmSync } from './editAccess.js'
import { getCombat } from './combatRoom.js'
import {
  buildCombatTurnSteps,
  findCombatStepIndex,
} from './phaseLinks.js'
import {
  collectSortedParticipants,
  TRACKER_ITEM_META_KEY,
} from './participants.js'

export const LH_MAX = 'lhMax'
export const LH_REM = 'lhRemaining'
export const LH_P2 = 'lhPendingSecondOrdinal'

const LH_STEPS_DELAY = 8

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

function combatOrdinal(combat, steps) {
  const n = steps.length
  if (n === 0) return 0
  const idx = findCombatStepIndex(steps, combat)
  const i = idx >= 0 ? idx : 0
  return (combat.round - 1) * n + i
}

export function readLhState(meta) {
  if (!meta || typeof meta !== 'object') {
    return { max: 0, rem: 0, p2: null }
  }
  const max = Math.max(0, Math.floor(Number(meta[LH_MAX])) || 0)
  let rem = Math.max(0, Math.floor(Number(meta[LH_REM])) || 0)
  if (rem > max && max > 0) rem = max
  const p2raw = meta[LH_P2]
  const p2 =
    typeof p2raw === 'number' && Number.isFinite(p2raw) ? p2raw : null
  return { max, rem, p2 }
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
        delete m[LH_P2]
      } else {
        m[LH_MAX] = n
        m[LH_REM] = n
        delete m[LH_P2]
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
  const steps = buildCombatTurnSteps(rows, items, tieOrderIds)

  if (steps.length === 0 || !isGmSync()) {
    lhPrevCombat = combatSnapshot(curr)
    return
  }

  if (!prev || !prev.started || prev.roundIntroPending) {
    lhPrevCombat = combatSnapshot(curr)
    return
  }

  const ordCurr = combatOrdinal(curr, steps)
  const trackerItems = items.filter((i) => i.metadata?.[TRACKER_ITEM_META_KEY])

  /** @type {Map<string, { max: number, rem: number, p2: number | null }>} */
  const byId = new Map()

  const setState = (id, max, rem, p2) => {
    byId.set(id, {
      max,
      rem: Math.max(0, rem),
      p2,
    })
  }

  const getState = (item) => {
    const ex = byId.get(item.id)
    if (ex) return ex
    return readLhState(item.metadata[TRACKER_ITEM_META_KEY])
  }

  for (const item of trackerItems) {
    const st = getState(item)
    if (st.max <= 0 || st.rem <= 0 || st.p2 == null) continue
    if (ordCurr < st.p2) continue
    setState(item.id, st.max, st.rem - 1, null)
  }

  for (const item of trackerItems) {
    const st = getState(item)
    if (st.max <= 0 || st.rem <= 0) continue
    if (!transitionedToOwner(prev, curr, item.id)) continue
    const stNow = getState(item)
    const newRem = stNow.rem - 1
    const clamped = Math.max(0, newRem)
    const p2Next =
      clamped > 0 ? ordCurr + LH_STEPS_DELAY : null
    setState(item.id, stNow.max, clamped, p2Next)
  }

  const changed = []
  for (const item of trackerItems) {
    if (!byId.has(item.id)) continue
    const next = byId.get(item.id)
    const prevSt = readLhState(item.metadata[TRACKER_ITEM_META_KEY])
    if (
      next.rem === prevSt.rem &&
      next.max === prevSt.max &&
      next.p2 === prevSt.p2
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
        if (p.p2 == null) delete m[LH_P2]
        else m[LH_P2] = p.p2
      }
    })
  }

  lhPrevCombat = combatSnapshot(curr)
}
