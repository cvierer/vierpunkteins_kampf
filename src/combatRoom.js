import OBR from '@owlbear-rodeo/sdk'
import { isGmSync } from './editAccess.js'
import {
  clearEphemeralExtraIniRows,
  pullFullIniTieOrderFromRoom,
  pullZaoRootTieOrderFromRoom,
} from './phaseLinks.js'
import { pullRoomSettingsFromRoom } from './roomSettings.js'
import {
  collectSortedParticipants,
  INI_TIE_ORDER_KEY as INI_TIE_ORDER_KEY_PARTICIPANTS,
} from './participants.js'
import {
  compareInitiativeRowsWithTieOrder,
  initiativeCompareOnlyIni,
} from './initiativeSort.js'

const ID = 'vierpunkteins_kampf.tracker'
export const COMBAT_KEY = `${ID}/combat`
export const INI_TIE_ORDER_KEY = INI_TIE_ORDER_KEY_PARTICIPANTS
export const ACTION_STAMPS_KEY = `${ID}/actionStamps`

const listeners = new Set()
const tieListeners = new Set()

function defaultCombat() {
  return {
    started: false,
    round: 1,
    currentItemId: null,
    currentPhaseLinkId: null,
    roundIntroPending: false,
    roundIntroPrevRound: null,
    roundIntroPrevItemId: null,
    roundIntroPrevPhaseLinkId: null,
  }
}

/** Felder zurücksetzen, wenn Runden-Zwischenbildschirm nicht aktiv sein soll. */
export const RESET_ROUND_INTRO = Object.freeze({
  roundIntroPending: false,
  roundIntroPrevRound: null,
  roundIntroPrevItemId: null,
  roundIntroPrevPhaseLinkId: null,
})

function normalize(raw) {
  const d = defaultCombat()
  if (!raw || typeof raw !== 'object') return d
  const pr =
    typeof raw.roundIntroPrevRound === 'number' &&
    Number.isFinite(raw.roundIntroPrevRound)
      ? Math.max(1, Math.floor(raw.roundIntroPrevRound))
      : null
  return {
    started: Boolean(raw.started),
    round: Math.max(1, Math.floor(Number(raw.round)) || 1),
    currentItemId:
      typeof raw.currentItemId === 'string' ? raw.currentItemId : null,
    currentPhaseLinkId:
      typeof raw.currentPhaseLinkId === 'string'
        ? raw.currentPhaseLinkId
        : null,
    roundIntroPending: Boolean(raw.roundIntroPending),
    roundIntroPrevRound: pr,
    roundIntroPrevItemId:
      typeof raw.roundIntroPrevItemId === 'string'
        ? raw.roundIntroPrevItemId
        : null,
    roundIntroPrevPhaseLinkId:
      typeof raw.roundIntroPrevPhaseLinkId === 'string'
        ? raw.roundIntroPrevPhaseLinkId
        : null,
  }
}

let cache = defaultCombat()
let tieOrderCache = []
let actionStampsCache = { anchorId: null, entries: [] }

/** Bei Runden+1 während ephemerer 2.A.-Entfernung vor Raum-Metadaten: reconcile nicht gegen alte KR patchen. */
let combatNavMutationDepth = 0

export function beginCombatNavMutation() {
  combatNavMutationDepth++
}

export function endCombatNavMutation() {
  combatNavMutationDepth = Math.max(0, combatNavMutationDepth - 1)
}

export function isCombatNavMutationActive() {
  return combatNavMutationDepth > 0
}

function notify() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
}

function notifyTie() {
  for (const fn of tieListeners) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
}

export function getCombat() {
  return cache
}

export function onCombatChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getIniTieOrder() {
  return tieOrderCache
}

export function getActionStamps() {
  return actionStampsCache
}

export function onIniTieOrderChange(fn) {
  tieListeners.add(fn)
  return () => tieListeners.delete(fn)
}

async function pullFromRoom() {
  const meta = await OBR.room.getMetadata()
  const next = normalize(meta[COMBAT_KEY])
  const same =
    next.started === cache.started &&
    next.round === cache.round &&
    next.currentItemId === cache.currentItemId &&
    next.currentPhaseLinkId === cache.currentPhaseLinkId &&
    next.roundIntroPending === cache.roundIntroPending &&
    next.roundIntroPrevRound === cache.roundIntroPrevRound &&
    next.roundIntroPrevItemId === cache.roundIntroPrevItemId &&
    next.roundIntroPrevPhaseLinkId === cache.roundIntroPrevPhaseLinkId
  if (same) return
  cache = next
  notify()
}

async function pullIniTieOrderFromRoom() {
  const meta = await OBR.room.getMetadata()
  const raw = meta[INI_TIE_ORDER_KEY]
  const next = Array.isArray(raw)
    ? raw.filter((id) => typeof id === 'string')
    : []
  const same =
    next.length === tieOrderCache.length &&
    next.every((id, i) => id === tieOrderCache[i])
  if (same) return
  tieOrderCache = next
  notifyTie()
}

function normalizeActionStampEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id : null
  const itemId = typeof raw.itemId === 'string' ? raw.itemId : null
  const ownerName = typeof raw.ownerName === 'string' ? raw.ownerName : ''
  const field = typeof raw.field === 'string' ? raw.field : null
  if (!id || !itemId || !field) return null
  const anchorRowId =
    typeof raw.anchorRowId === 'string' ? raw.anchorRowId : null
  const anchorPhaseLinkId =
    typeof raw.anchorPhaseLinkId === 'string' ? raw.anchorPhaseLinkId : null
  return { id, itemId, ownerName, field, anchorRowId, anchorPhaseLinkId }
}

export function normalizeActionStamps(raw) {
  const anchorId = typeof raw?.anchorId === 'string' ? raw.anchorId : null
  const entriesRaw = Array.isArray(raw?.entries) ? raw.entries : []
  const entries = []
  for (const r of entriesRaw) {
    const e = normalizeActionStampEntry(r)
    if (e) entries.push(e)
  }
  return { anchorId, entries }
}

async function pullActionStampsFromRoom() {
  const meta = await OBR.room.getMetadata()
  const next = normalizeActionStamps(meta[ACTION_STAMPS_KEY])
  const same =
    actionStampsCache.anchorId === next.anchorId &&
    actionStampsCache.entries.length === next.entries.length &&
    actionStampsCache.entries.every(
      (e, i) =>
        e.id === next.entries[i].id &&
        e.itemId === next.entries[i].itemId &&
        e.ownerName === next.entries[i].ownerName &&
        e.field === next.entries[i].field &&
        e.anchorRowId === next.entries[i].anchorRowId &&
        e.anchorPhaseLinkId === next.entries[i].anchorPhaseLinkId
    )
  if (same) return
  actionStampsCache = next
  notify()
}

export async function patchActionStamps(mutator, opts = {}) {
  const skipGmCheck = Boolean(opts.skipGmCheck)
  if (!skipGmCheck && !isGmSync()) return
  const meta = await OBR.room.getMetadata()
  const cur = normalizeActionStamps(meta[ACTION_STAMPS_KEY])
  const proposed = mutator(cur)
  const next = normalizeActionStamps(proposed)
  await OBR.room.setMetadata({ [ACTION_STAMPS_KEY]: next })
  await pullActionStampsFromRoom()
}

function ensureFullTieOrder(existing, sortedIds) {
  const allowed = new Set(sortedIds)
  const out = existing.filter((id) => allowed.has(id))
  const seen = new Set(out)
  for (const id of sortedIds) {
    if (!seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  return out
}

function orderRespectsIniAndTie(orderIds, rowMap) {
  for (let i = 0; i < orderIds.length - 1; i++) {
    const a = rowMap.get(orderIds[i])
    const b = rowMap.get(orderIds[i + 1])
    if (!a || !b) return false
    if (compareInitiativeRowsWithTieOrder(a, b, orderIds) > 0) return false
  }
  return true
}

/**
 * Für Drag&Drop: erlaubte Einfüge-Indizes (0 = vor erstem Token, length = nach letztem),
 * wenn `dragId` dort eingefügt wird und die INI-Reihenfolge erhalten bleibt.
 */
export function computeValidIniTieInsertSlots(dragId, items) {
  const sortedRows = collectSortedParticipants(items, tieOrderCache)
  const sortedIds = sortedRows.map((r) => r.id)
  if (!sortedIds.includes(dragId))
    return { validSlots: [], sortedIds, without: [] }
  const without = sortedIds.filter((id) => id !== dragId)
  const rowMap = new Map(sortedRows.map((r) => [r.id, r]))
  const validSlots = []
  for (let slot = 0; slot <= without.length; slot++) {
    const next = [...without.slice(0, slot), dragId, ...without.slice(slot)]
    if (orderRespectsIniAndTie(next, rowMap)) validSlots.push(slot)
  }
  return { validSlots, sortedIds, without }
}

/**
 * Token in der Listenreihenfolge verschieben (nur wenn INI-Rang gültig bleibt;
 * gleiche INI = manuelle Reihenfolge über Raum-Metadaten).
 */
export async function reorderIniTieToken(dragId, insertBeforeIndex, items) {
  if (!isGmSync()) return
  const sortedRows = collectSortedParticipants(items, tieOrderCache)
  const sortedIds = sortedRows.map((r) => r.id)
  if (!sortedIds.includes(dragId)) return
  const without = sortedIds.filter((id) => id !== dragId)
  const slot = Math.max(0, Math.min(insertBeforeIndex, without.length))
  const next = [...without.slice(0, slot), dragId, ...without.slice(slot)]
  const rowMap = new Map(sortedRows.map((r) => [r.id, r]))
  if (!orderRespectsIniAndTie(next, rowMap)) return
  if (next.length === sortedIds.length && next.every((id, i) => id === sortedIds[i]))
    return
  const order = ensureFullTieOrder(next, sortedIds)
  await OBR.room.setMetadata({ [INI_TIE_ORDER_KEY]: order })
  await pullIniTieOrderFromRoom()
}

/**
 * Zwei in der Liste direkt aufeinanderfolgende Token mit gleicher INI tauschen.
 * `upperId` muss der obere (zuerst agierende) Eintrag sein, `lowerId` der nächste.
 */
export async function swapAdjacentIniTiePair(upperId, lowerId, items) {
  if (!isGmSync()) return
  const sortedRows = collectSortedParticipants(items, tieOrderCache)
  const sortedIds = sortedRows.map((r) => r.id)
  const i = sortedIds.indexOf(upperId)
  if (i < 0 || sortedIds[i + 1] !== lowerId) return
  const a = sortedRows[i]
  const b = sortedRows[i + 1]
  if (initiativeCompareOnlyIni(a, b) !== 0) return
  const next = [
    ...sortedIds.slice(0, i),
    lowerId,
    upperId,
    ...sortedIds.slice(i + 2),
  ]
  const rowMap = new Map(sortedRows.map((r) => [r.id, r]))
  if (!orderRespectsIniAndTie(next, rowMap)) return
  const order = ensureFullTieOrder(next, sortedIds)
  await OBR.room.setMetadata({ [INI_TIE_ORDER_KEY]: order })
  await pullIniTieOrderFromRoom()
}

export async function initCombatRoom() {
  await pullFromRoom()
  await pullIniTieOrderFromRoom()
  await pullZaoRootTieOrderFromRoom()
  await pullFullIniTieOrderFromRoom()
  await pullActionStampsFromRoom()
  await pullRoomSettingsFromRoom()
  return OBR.room.onMetadataChange(() => {
    void pullFromRoom()
    void pullIniTieOrderFromRoom()
    void pullZaoRootTieOrderFromRoom()
    void pullFullIniTieOrderFromRoom()
    void pullActionStampsFromRoom()
    void pullRoomSettingsFromRoom()
  })
}

export async function patchCombat(partial) {
  const prevRound = cache.round
  const merged = { ...cache, ...partial }
  if (
    partial.currentPhaseLinkId === undefined &&
    partial.currentItemId !== undefined &&
    partial.currentItemId !== cache.currentItemId
  ) {
    merged.currentPhaseLinkId = null
  }
  const next = normalize(merged)
  const roundIncreased = next.started && next.round > prevRound

  if (roundIncreased) {
    beginCombatNavMutation()
  }
  try {
    if (roundIncreased) {
      await clearEphemeralExtraIniRows()
    }
    await OBR.room.setMetadata({ [COMBAT_KEY]: next })
    await pullFromRoom()
  } finally {
    if (roundIncreased) {
      endCombatNavMutation()
    }
  }
}
