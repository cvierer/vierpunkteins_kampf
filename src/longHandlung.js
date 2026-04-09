import OBR from '@owlbear-rodeo/sdk'
import { canEditSceneItem, isGmSync } from './editAccess.js'
import { getCombat } from './combatRoom.js'
import {
  buildCombatTurnSteps,
  buildMergedDisplayRows,
  findCombatStepIndex,
  openSecondActionPhaseForLhSingle,
} from './phaseLinks.js'
import {
  applyLhOneClickStamp,
  clearKrLhStampsForItem,
} from './krCounters.js'
import {
  collectSortedParticipants,
  TRACKER_ITEM_META_KEY,
} from './participants.js'
import {
  LH_ACTIONS_PER_KR,
  LH_DONE_INI,
  LH_DONE_ROUND,
  LH_KR_FIRED_MASK,
  LH_KR_FIRED_ROUND,
  LH_MAX,
  LH_REM,
  LH_TRIGGER_INI_STEP,
  clearLhTrackerActivity,
  lhSingleActionHookIni,
  normalizeActionsPerKrForPatch,
  normalizeTriggerStepForPatch,
  readLhMechanics,
  readLhState,
} from './lhMeta.js'

export {
  LH_MAX,
  LH_REM,
  LH_ACTIONS_PER_KR,
  LH_TRIGGER_INI_STEP,
  LH_KR_FIRED_ROUND,
  LH_KR_FIRED_MASK,
  LH_DONE_ROUND,
  LH_DONE_INI,
  DEFAULT_LH_ACTIONS_PER_KR,
  DEFAULT_LH_TRIGGER_INI_STEP,
  readLhMechanics,
  readLhState,
} from './lhMeta.js'

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

function parseIni(value) {
  const n = Number(String(value ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function getCurrentStepContext(rows, items, tieOrderIds, combat) {
  const combatRound = combat.started ? combat.round : null
  const merged = buildMergedDisplayRows(rows, items, tieOrderIds, combatRound)
  const steps = buildCombatTurnSteps(rows, items, tieOrderIds, combatRound)
  const idx = findCombatStepIndex(steps, combat)
  const ownerIniById = new Map(rows.map((r) => [r.id, parseIni(r.initiative)]))
  if (idx < 0 || idx >= merged.length) {
    return { idx: -1, activeIni: null, ownerIniById }
  }
  const current = merged[idx]
  const activeIni =
    current.kind === 'roundEnd'
      ? 0
      : current.kind === 'token'
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

function stripLegacyLhKeys(m) {
  delete m.lhPendingSecondRound
  delete m.lhPendingSecondTargetIni
}

function normalizeDoneRound(raw) {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 1 ? n : null
}

function normalizeDoneIni(raw) {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Auslöser-INI auf dem Lineal [heroIni … 0]; nur Einträge ≥ 0. */
export function lhTriggerInisOnRuler(heroIni, mechanics) {
  const H = heroIni
  if (!Number.isFinite(H)) return []
  const n = mechanics.actionsPerKr
  const step = mechanics.triggerIniStep
  const out = []
  for (let k = 0; k < n; k++) {
    const T = H + k * step
    if (Number.isFinite(T) && T >= 0) out.push(T)
  }
  return out
}

function triggerIniForIndex(heroIni, k, step) {
  return heroIni + k * step
}

function crossedForward(prevIni, currIni, T) {
  if (!Number.isFinite(T) || T < 0) return false
  if (!Number.isFinite(currIni)) return false
  const prevOk =
    Number.isFinite(prevIni) || prevIni === Number.POSITIVE_INFINITY
  if (!prevOk) return false
  return prevIni > T && currIni <= T
}

function crossedBackward(prevIni, currIni, T) {
  if (!Number.isFinite(T) || T < 0) return false
  if (!Number.isFinite(prevIni) || !Number.isFinite(currIni)) return false
  return prevIni <= T && currIni > T
}

/**
 * Nur für L.H. mit genau einer Aktion: Auslöser zählt erst, wenn die INI **unter** T fällt —
 * nicht schon beim Fokus auf der 2.A.-Zeile (INI = T), sonst verschwindet die Zeile beim Navigieren.
 */
function crossedForwardPastSingularLh(prevIni, currIni, T) {
  if (!Number.isFinite(T) || T < 0) return false
  if (!Number.isFinite(currIni)) return false
  const prevOk =
    Number.isFinite(prevIni) || prevIni === Number.POSITIVE_INFINITY
  if (!prevOk) return false
  if (prevIni === Number.POSITIVE_INFINITY) return currIni < T
  return prevIni >= T && currIni < T
}

function crossedBackwardPastSingularLh(prevIni, currIni, T) {
  if (!Number.isFinite(T) || T < 0) return false
  if (!Number.isFinite(prevIni) || !Number.isFinite(currIni)) return false
  return prevIni < T && currIni >= T
}

/**
 * L.H.-Wert setzen (leer / 0 = aus). Setzt max = rem = n; KR-Maske zurück.
 */
export async function commitLhValue(itemId, text) {
  const trimmed = String(text ?? '').trim()
  const n =
    trimmed === '' ? 0 : Math.floor(Number(trimmed.replace(',', '.')))
  if (trimmed !== '' && (!Number.isFinite(n) || n < 0)) return
  const itemsBefore = await OBR.scene.items.getItems()
  const itemBefore = itemsBefore.find((i) => i.id === itemId)
  const prevSt = readLhState(
    itemBefore?.metadata?.[TRACKER_ITEM_META_KEY]
  )
  const round = getCombat().started ? getCombat().round : 1
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const d of drafts) {
      const m = d.metadata[TRACKER_ITEM_META_KEY]
      if (!m) continue
      if (n <= 0) {
        clearLhTrackerActivity(m)
      } else {
        stripLegacyLhKeys(m)
        m[LH_MAX] = n
        m[LH_REM] = n
        m[LH_KR_FIRED_ROUND] = round
        m[LH_KR_FIRED_MASK] = 0
        delete m[LH_DONE_ROUND]
        delete m[LH_DONE_INI]
      }
    }
  })

  const itemsAfter = await OBR.scene.items.getItems()
  const itemAfter = itemsAfter.find((i) => i.id === itemId)
  if (!canEditSceneItem(itemAfter)) return

  if (n === 1) {
    const alreadyOne = prevSt.max === 1 && prevSt.rem === 1
    if (!alreadyOne) {
      await applyLhOneClickStamp(itemId)
      const iniStr =
        itemAfter.metadata?.[TRACKER_ITEM_META_KEY]?.initiative ?? ''
      await openSecondActionPhaseForLhSingle(itemId, iniStr)
    }
  } else {
    void clearKrLhStampsForItem(itemId)
  }
}

/** Entfernt die synthetische L.H.-Abschluss-Zeile (2.A.) aus den Tracker-Metadaten. */
export async function removeLhDoneRow(itemId) {
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const d of drafts) {
      const m = d.metadata[TRACKER_ITEM_META_KEY]
      if (!m) continue
      delete m[LH_DONE_ROUND]
      delete m[LH_DONE_INI]
    }
  })
}

/**
 * Ziel-INI der L.H.-Abschluss-Zeile setzen (wie 2.A.-Ziel-INI per Drag/Feld).
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function tryCommitLhDoneTargetIni(itemId, iniStr) {
  const items = await OBR.scene.items.getItems()
  const it = items.find((i) => i.id === itemId)
  const m = it?.metadata?.[TRACKER_ITEM_META_KEY]
  if (
    normalizeDoneRound(m?.[LH_DONE_ROUND]) == null ||
    normalizeDoneIni(m?.[LH_DONE_INI]) == null
  ) {
    return { ok: false }
  }
  const target = parseIni(String(iniStr ?? '').trim())
  if (target === null) return { ok: false }
  if (target < 0) return { ok: false, reason: 'NEG_INI' }
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const d of drafts) {
      const mm = d.metadata[TRACKER_ITEM_META_KEY]
      if (!mm) continue
      mm[LH_DONE_INI] = target
    }
  })
  return { ok: true }
}

/**
 * Nach Kampf-Navigation: INI-Lineal von heroIni bis 0. Pro gültigem Auslöser höchstens
 * ein Abzug pro KR; vorwärts über Stufe = −1 Rest, zurück = +1 (Maske).
 * Nur GM schreibt.
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

  const prevIniRaw = prevCtx.activeIni
  const currIni = currCtx.activeIni

  const roundAdvanced =
    Number.isFinite(curr.round) &&
    Number.isFinite(prev.round) &&
    curr.round > prev.round
  const roundDecreased =
    Number.isFinite(curr.round) &&
    Number.isFinite(prev.round) &&
    curr.round < prev.round

  const prevIni =
    roundAdvanced && Number.isFinite(currIni)
      ? Number.POSITIVE_INFINITY
      : prevIniRaw

  /** @type {Map<string, { max: number, rem: number, doneRound: number|null, doneIni: number|null, mechanics: ReturnType<typeof readLhMechanics> }>} */
  const byId = new Map()

  const getPack = (item) => {
    const ex = byId.get(item.id)
    if (ex) return ex
    const meta = item.metadata[TRACKER_ITEM_META_KEY]
    const st = readLhState(meta)
    const mech = readLhMechanics(meta)
    let doneRound = normalizeDoneRound(meta[LH_DONE_ROUND])
    let doneIni = normalizeDoneIni(meta[LH_DONE_INI])
    let firedRound = mech.firedRound
    let firedMask = mech.firedMask
    if (firedRound !== curr.round) {
      firedRound = curr.round
      firedMask = 0
    }
    const pack = {
      max: st.max,
      rem: st.rem,
      doneRound,
      doneIni,
      mechanics: {
        ...mech,
        firedRound,
        firedMask,
      },
    }
    byId.set(item.id, pack)
    return pack
  }

  for (const item of trackerItems) {
    const meta = item.metadata[TRACKER_ITEM_META_KEY]
    const st = readLhState(meta)
    const hadDoneAny =
      normalizeDoneRound(meta[LH_DONE_ROUND]) !== null &&
      normalizeDoneIni(meta[LH_DONE_INI]) !== null
    if (!st.max && !hadDoneAny) continue

    const H = currCtx.ownerIniById.get(item.id)
    if (!Number.isFinite(H)) {
      const pack = getPack(item)
      pack.doneRound = null
      pack.doneIni = null
      continue
    }

    const pack = getPack(item)

    const { actionsPerKr, triggerIniStep } = pack.mechanics
    let mask = pack.mechanics.firedMask
    let rem = pack.rem
    let completionIni = null
    const initialSingularPending = st.max === 1 && st.rem === 1
    let singularLhStrictConsumed = false

    if (roundDecreased) {
      rem = pack.max
      mask = 0
      pack.doneRound = null
      pack.doneIni = null
    } else if (movedBack) {
      const Tsingle =
        pack.max === 1 ? lhSingleActionHookIni(H, triggerIniStep) : null
      if (pack.max === 1 && Tsingle != null) {
        if (
          crossedBackwardPastSingularLh(prevIniRaw, currIni, Tsingle) &&
          (mask & 1)
        ) {
          mask &= ~1
          rem = Math.min(pack.max, rem + 1)
        }
      } else {
        for (let k = actionsPerKr - 1; k >= 0; k--) {
          const T = triggerIniForIndex(H, k, triggerIniStep)
          if (!Number.isFinite(T) || T < 0) continue
          if (!crossedBackward(prevIniRaw, currIni, T)) continue
          const bit = 1 << k
          if (!(mask & bit)) continue
          mask &= ~bit
          rem = Math.min(pack.max, rem + 1)
        }
      }
      if (rem > 0) {
        pack.doneRound = null
        pack.doneIni = null
      }
    } else {
      const Tsingle =
        pack.max === 1 ? lhSingleActionHookIni(H, triggerIniStep) : null
      if (pack.max === 1 && Tsingle != null) {
        if (
          crossedForwardPastSingularLh(prevIni, currIni, Tsingle) &&
          !(mask & 1) &&
          rem > 0
        ) {
          mask |= 1
          rem -= 1
          singularLhStrictConsumed = true
          if (rem <= 0) completionIni = Tsingle
        }
      } else {
        for (let k = 0; k < actionsPerKr; k++) {
          const T = triggerIniForIndex(H, k, triggerIniStep)
          if (!Number.isFinite(T) || T < 0) continue
          if (!crossedForward(prevIni, currIni, T)) continue
          const bit = 1 << k
          if (mask & bit) continue
          if (rem <= 0) break
          mask |= bit
          rem -= 1
          if (rem <= 0) {
            completionIni = T
            break
          }
        }
      }
    }

    if (
      rem <= 0 &&
      initialSingularPending &&
      !singularLhStrictConsumed &&
      !roundDecreased
    ) {
      rem = 1
      completionIni = null
      mask = 0
    }

    pack.mechanics.firedRound = curr.round
    pack.mechanics.firedMask = mask
    if (rem <= 0) {
      if (
        Number.isFinite(completionIni) &&
        Number.isFinite(H) &&
        completionIni !== H
      ) {
        pack.doneRound = curr.round
        pack.doneIni = completionIni
      } else if (movedBack || roundDecreased) {
        pack.doneRound = null
        pack.doneIni = null
      }
      pack.max = 0
      pack.rem = 0
      pack.mechanics.firedMask = 0
    } else {
      pack.rem = rem
      pack.doneRound = null
      pack.doneIni = null
    }
  }

  const changed = []
  for (const item of trackerItems) {
    if (!byId.has(item.id)) continue
    const p = byId.get(item.id)
    const meta = item.metadata[TRACKER_ITEM_META_KEY]
    const prevSt = readLhState(meta)
    const prevMech = readLhMechanics(meta)
    const prevDoneRound = normalizeDoneRound(meta[LH_DONE_ROUND])
    const prevDoneIni = normalizeDoneIni(meta[LH_DONE_INI])

    const sameRem = p.rem === prevSt.rem && p.max === prevSt.max
    const sameRound = p.mechanics.firedRound === prevMech.firedRound
    const sameMask = p.mechanics.firedMask === prevMech.firedMask
    const sameActions =
      normalizeActionsPerKrForPatch(meta[LH_ACTIONS_PER_KR]) ===
      p.mechanics.actionsPerKr
    const sameStep =
      normalizeTriggerStepForPatch(meta[LH_TRIGGER_INI_STEP]) ===
      p.mechanics.triggerIniStep
    const sameDoneRound = p.doneRound === prevDoneRound
    const sameDoneIni = p.doneIni === prevDoneIni

    if (
      sameRem &&
      sameRound &&
      sameMask &&
      sameActions &&
      sameStep &&
      sameDoneRound &&
      sameDoneIni
    ) {
      continue
    }

    changed.push({
      id: item.id,
      max: p.max,
      rem: p.rem,
      actionsPerKr: p.mechanics.actionsPerKr,
      triggerIniStep: p.mechanics.triggerIniStep,
      firedRound: p.mechanics.firedRound,
      firedMask: p.mechanics.firedMask,
      doneRound: p.doneRound,
      doneIni: p.doneIni,
    })
  }

  if (changed.length > 0) {
    const patch = new Map(changed.map((c) => [c.id, c]))
    await OBR.scene.items.updateItems(changed.map((c) => c.id), (drafts) => {
      for (const d of drafts) {
        const p = patch.get(d.id)
        if (!p) continue
        const m = d.metadata[TRACKER_ITEM_META_KEY]
        if (!m) continue
        stripLegacyLhKeys(m)
        m[LH_MAX] = p.max
        m[LH_REM] = p.rem
        m[LH_ACTIONS_PER_KR] = p.actionsPerKr
        m[LH_TRIGGER_INI_STEP] = p.triggerIniStep
        m[LH_KR_FIRED_ROUND] = p.firedRound
        m[LH_KR_FIRED_MASK] = p.firedMask
        if (p.doneRound && Number.isFinite(p.doneIni)) {
          m[LH_DONE_ROUND] = p.doneRound
          m[LH_DONE_INI] = p.doneIni
        } else {
          delete m[LH_DONE_ROUND]
          delete m[LH_DONE_INI]
        }
      }
    })
  }

  lhPrevCombat = combatSnapshot(curr)
}
