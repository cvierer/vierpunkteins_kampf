import OBR from '@owlbear-rodeo/sdk'
import { collectSortedParticipants } from './participants.js'
import { initiativeCompareOnlyIni } from './initiativeSort.js'

const ID = 'vierpunkteins_kampf.tracker'
export const COMBAT_KEY = `${ID}/combat`
export const INI_TIE_ORDER_KEY = `${ID}/iniTieOrder`

const listeners = new Set()
const tieListeners = new Set()

function defaultCombat() {
  return {
    started: false,
    round: 1,
    currentItemId: null,
  }
}

function normalize(raw) {
  const d = defaultCombat()
  if (!raw || typeof raw !== 'object') return d
  return {
    started: Boolean(raw.started),
    round: Math.max(1, Math.floor(Number(raw.round)) || 1),
    currentItemId:
      typeof raw.currentItemId === 'string' ? raw.currentItemId : null,
  }
}

let cache = defaultCombat()
let tieOrderCache = []

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
    next.currentItemId === cache.currentItemId
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

/**
 * Zwei Figuren mit gleicher INI in der Listenreihenfolge tauschen; Reihenfolge
 * bleibt im Raum gespeichert (u. a. über Kampfrunden).
 */
export async function swapIniTiedPair(idA, idB, items) {
  if (idA === idB) return
  const sortedRows = collectSortedParticipants(items, tieOrderCache)
  const rowA = sortedRows.find((r) => r.id === idA)
  const rowB = sortedRows.find((r) => r.id === idB)
  if (!rowA || !rowB) return
  if (initiativeCompareOnlyIni(rowA, rowB) !== 0) return

  const sortedIds = sortedRows.map((r) => r.id)
  let order = ensureFullTieOrder([...tieOrderCache], sortedIds)
  const ia = order.indexOf(idA)
  const ib = order.indexOf(idB)
  if (ia < 0 || ib < 0) return
  ;[order[ia], order[ib]] = [order[ib], order[ia]]
  await OBR.room.setMetadata({ [INI_TIE_ORDER_KEY]: order })
  await pullIniTieOrderFromRoom()
}

export async function initCombatRoom() {
  await pullFromRoom()
  await pullIniTieOrderFromRoom()
  return OBR.room.onMetadataChange(() => {
    void pullFromRoom()
    void pullIniTieOrderFromRoom()
  })
}

export async function patchCombat(partial) {
  const next = normalize({ ...cache, ...partial })
  await OBR.room.setMetadata({ [COMBAT_KEY]: next })
  await pullFromRoom()
}
