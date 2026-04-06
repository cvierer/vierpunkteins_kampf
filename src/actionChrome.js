import OBR from '@owlbear-rodeo/sdk'
import { assetUrl } from './assetUrl.js'
import { getCombat, getIniTieOrder } from './combatRoom.js'
import { collectSortedParticipants } from './participants.js'

export async function syncActionChrome(items) {
  const combat = getCombat()
  const rows = collectSortedParticipants(items, getIniTieOrder())
  const activeId = combat.started ? combat.currentItemId : null
  const activeRow = activeId ? rows.find((r) => r.id === activeId) : null

  if (!combat.started || !activeId) {
    await OBR.action.setBadgeText(undefined)
    await OBR.action.setIcon(assetUrl('action-sword-idle.svg'))
    await OBR.action.setTitle('vierpunkteins_kampf')
    return
  }

  await OBR.action.setBadgeText(undefined)
  await OBR.action.setIcon(assetUrl('action-sword-active.svg'))
  const baseName = activeRow?.name?.trim() || 'Zug'
  const label = combat.currentPhaseLinkId
    ? `${baseName} · INI z. Aktion`
    : baseName
  await OBR.action.setTitle(`${label} · Runde ${combat.round}`)
}
