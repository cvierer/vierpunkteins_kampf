import OBR from '@owlbear-rodeo/sdk'
import { assetUrl } from './assetUrl.js'
import { canEditSceneItem, isEditAccessReady } from './editAccess.js'

const ID = 'vierpunkteins_kampf.tracker'

export function setupContextMenu() {
  OBR.contextMenu.create({
    id: `${ID}/context-menu`,
    icons: [
      {
        icon: assetUrl('add.svg'),
        label: 'Zum Kampf hinzufügen',
        filter: {
          every: [
            { key: 'layer', value: 'CHARACTER' },
            { key: ['metadata', `${ID}/metadata`], value: undefined },
          ],
        },
      },
      {
        icon: assetUrl('remove.svg'),
        label: 'Vom Kampf entfernen',
        filter: {
          every: [{ key: 'layer', value: 'CHARACTER' }],
        },
      },
    ],
    onClick(context) {
      if (!isEditAccessReady()) return
      const allowed = context.items.filter(canEditSceneItem)
      if (allowed.length === 0) return
      const addToInitiative = allowed.every(
        (item) => item.metadata[`${ID}/metadata`] === undefined
      )
      if (addToInitiative) {
        OBR.scene.items.updateItems(allowed, (items) => {
          for (const item of items) {
            item.metadata[`${ID}/metadata`] = {
              initiative: '',
              krAction: 0,
              krFreeAction: 0,
            }
          }
        })
      } else {
        OBR.scene.items.updateItems(allowed, (items) => {
          for (const item of items) {
            delete item.metadata[`${ID}/metadata`]
          }
        })
      }
    },
  })
}
