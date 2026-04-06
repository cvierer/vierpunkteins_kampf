import OBR, { buildLabel } from '@owlbear-rodeo/sdk'
import { getCombat, onCombatChange } from './combatRoom.js'

const TRACKER = 'vierpunkteins_kampf.tracker'
const TURN_MARKER_META = `${TRACKER}/turnMarker`

let debounceTimer = null

export function setupTurnMarkerSync() {
  const schedule = () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void applyTurnMarker(), 100)
  }

  const unsubCombat = onCombatChange(schedule)
  const unsubItems = OBR.scene.items.onChange(schedule)
  schedule()

  return () => {
    clearTimeout(debounceTimer)
    unsubCombat()
    unsubItems()
  }
}

async function applyTurnMarker() {
  try {
    if ((await OBR.player.getRole()) !== 'GM') return

    const combat = getCombat()
    const markers = await OBR.scene.items.getItems(
      (item) => item.metadata?.[TURN_MARKER_META] === true
    )
    const markerIds = markers.map((m) => m.id)

    if (
      !combat.started ||
      !combat.currentItemId ||
      combat.roundIntroPending
    ) {
      if (markerIds.length > 0) {
        await OBR.scene.items.deleteItems(markerIds)
      }
      return
    }

    if (
      markers.length === 1 &&
      markers[0].attachedTo === combat.currentItemId
    ) {
      return
    }

    if (markerIds.length > 0) {
      await OBR.scene.items.deleteItems(markerIds)
    }

    const items = await OBR.scene.items.getItems([combat.currentItemId])
    if (items.length === 0) return

    const label = buildLabel()
      .plainText('!')
      .layer('ATTACHMENT')
      .attachedTo(combat.currentItemId)
      .position({ x: 0, y: -0.7 })
      .scale({ x: 1, y: 1 })
      .fillColor('#e53935')
      .fontSize(22)
      .fontWeight(800)
      .fontFamily('Roboto')
      .padding(6)
      .textAlign('CENTER')
      .textAlignVertical('MIDDLE')
      .backgroundColor('#fff8f0')
      .backgroundOpacity(0.5)
      .cornerRadius(10)
      .pointerDirection('DOWN')
      .pointerWidth(9)
      .pointerHeight(8)
      .maxViewScale(6)
      .minViewScale(0.12)
      .disableHit(true)
      .metadata({ [TURN_MARKER_META]: true })
      .name('vierpunkteins_kampf: Zug')
      .build()

    await OBR.scene.items.addItems([label])
  } catch (e) {
    console.warn('[vierpunkteins_kampf] Zugmarker', e)
  }
}
