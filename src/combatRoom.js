import OBR from '@owlbear-rodeo/sdk'

const ID = 'vierpunkteins_kampf.tracker'
export const COMBAT_KEY = `${ID}/combat`

const listeners = new Set()

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

function notify() {
  for (const fn of listeners) {
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

export async function initCombatRoom() {
  await pullFromRoom()
  return OBR.room.onMetadataChange(() => {
    void pullFromRoom()
  })
}

export async function patchCombat(partial) {
  const next = normalize({ ...cache, ...partial })
  await OBR.room.setMetadata({ [COMBAT_KEY]: next })
  await pullFromRoom()
}
