import { isImage, isLabel } from '@owlbear-rodeo/sdk'
import { compareInitiativeRowsWithTieOrder } from './initiativeSort.js'

export const TRACKER_ID = 'vierpunkteins_kampf.tracker'
export const TRACKER_ITEM_META_KEY = `${TRACKER_ID}/metadata`
const META_KEY = TRACKER_ITEM_META_KEY

/** Wie auf der Karte sichtbar: Token-Text (Beschriftung), sonst Item-Name. */
export function getTokenListDisplayName(item) {
  if (isImage(item) || isLabel(item)) {
    const t = item.text?.plainText?.trim()
    if (t) return t
  }
  return item.name ?? ''
}

export function collectSortedParticipants(items, tieOrderIds = []) {
  const rows = []
  for (const item of items) {
    const metadata = item.metadata[META_KEY]
    if (metadata) {
      rows.push({
        id: item.id,
        initiative:
          metadata.initiative === undefined || metadata.initiative === null
            ? ''
            : String(metadata.initiative),
        name: getTokenListDisplayName(item),
      })
    }
  }
  const ids = new Set(rows.map((r) => r.id))
  const tieFiltered = tieOrderIds.filter((id) => ids.has(id))
  rows.sort((a, b) => compareInitiativeRowsWithTieOrder(a, b, tieFiltered))
  return rows
}
