import OBR from '@owlbear-rodeo/sdk'
import { isGmSync } from './editAccess.js'
import { TRACKER_ID } from './participants.js'

export const ROOM_SETTINGS_KEY = `${TRACKER_ID}/roomSettings`

function initiativeNumeric(iniStr) {
  const n = Number(String(iniStr ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/**
 * Optionalregel WdS: bei INI > 20 / 30 / 40 je eine zusätzliche Freie Aktion (max. 5).
 * Ohne Regel: maximal 2 „Klicks“ (Zyklus 0…2).
 */
export function faMaxForInitiative(iniStr, highIniFreeActionsEnabled) {
  if (!highIniFreeActionsEnabled) return 2
  const n = initiativeNumeric(iniStr)
  if (!Number.isFinite(n)) return 2
  let x = 2
  if (n > 20) x++
  if (n > 30) x++
  if (n > 40) x++
  return Math.min(5, x)
}

function defaultSettings() {
  return {
    /** Wege des Schwertes: zusätzliche F.A. bei hoher Initiative */
    highIniFreeActions: false,
  }
}

function normalize(raw) {
  const d = defaultSettings()
  if (!raw || typeof raw !== 'object') return d
  return {
    ...d,
    highIniFreeActions: Boolean(raw.highIniFreeActions),
  }
}

let cache = defaultSettings()
const listeners = new Set()

function notify() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
}

export function getRoomSettings() {
  return cache
}

export function onRoomSettingsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function pullRoomSettingsFromRoom() {
  const meta = await OBR.room.getMetadata()
  const next = normalize(meta[ROOM_SETTINGS_KEY])
  const same =
    next.highIniFreeActions === cache.highIniFreeActions
  if (same) return
  cache = next
  notify()
}

export async function patchRoomSettings(mutator) {
  if (!isGmSync()) return
  const meta = await OBR.room.getMetadata()
  const cur = normalize(meta[ROOM_SETTINGS_KEY])
  const proposed = mutator({ ...cur })
  const next = normalize(proposed)
  await OBR.room.setMetadata({ [ROOM_SETTINGS_KEY]: next })
  await pullRoomSettingsFromRoom()
}
