import OBR, { isLabel } from '@owlbear-rodeo/sdk'

const TRACKER = 'vierpunkteins_kampf.tracker'
const TURN_MARKER_META = `${TRACKER}/turnMarker`
const TURN_MARKER_NAME = 'vierpunkteins_kampf: Zug'

/**
 * Entfernt alte Zug-Sprechblasen („!“), die früher von der Extension angelegt wurden.
 * Nur GM (wie beim früheren Zugmarker), damit deleteItems zuverlässig erlaubt ist.
 */
export async function cleanupLegacyTurnMarkers() {
  try {
    if ((await OBR.player.getRole()) !== 'GM') return

    const items = await OBR.scene.items.getItems()
    const ids = []
    for (const item of items) {
      if (!isLabel(item)) continue
      if (item.metadata?.[TURN_MARKER_META] === true) {
        ids.push(item.id)
        continue
      }
      if (item.name === TURN_MARKER_NAME) {
        ids.push(item.id)
      }
    }
    if (ids.length === 0) return
    await OBR.scene.items.deleteItems(ids)
  } catch (e) {
    console.warn('[vierpunkteins_kampf] Alte Zug-Sprechblasen entfernen', e)
  }
}
