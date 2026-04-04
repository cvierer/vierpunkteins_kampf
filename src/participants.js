import { compareInitiativeRows } from './initiativeSort.js'

export const TRACKER_ID = 'dsa-owlbear.tracker'
export const TRACKER_ITEM_META_KEY = `${TRACKER_ID}/metadata`
const META_KEY = TRACKER_ITEM_META_KEY

export function collectSortedParticipants(items) {
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
        name: item.name,
      })
    }
  }
  rows.sort(compareInitiativeRows)
  return rows
}
