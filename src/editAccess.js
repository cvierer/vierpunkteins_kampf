import OBR from '@owlbear-rodeo/sdk'

let playerId = ''
let gm = false
let ready = false
let unsub = null

/**
 * Spielerrolle und -id für Sichtbarkeit im Tracker (sync, nach initEditAccess).
 */
export async function initEditAccess() {
  playerId = await OBR.player.getId()
  gm = (await OBR.player.getRole()) === 'GM'
  ready = true
  unsub?.()
  unsub = OBR.player.onChange((p) => {
    playerId = p.id
    gm = p.role === 'GM'
  })
}

export function isGmSync() {
  return ready && gm
}

export function isEditAccessReady() {
  return ready
}

/**
 * Szene-Item bearbeiten: SL alles, Spieler nur eigene Tokens (createdUserId).
 */
export function canEditSceneItem(item) {
  if (!item || !ready) return false
  if (gm) return true
  return item.createdUserId === playerId
}

export function cleanupEditAccess() {
  unsub?.()
  unsub = null
  ready = false
}
