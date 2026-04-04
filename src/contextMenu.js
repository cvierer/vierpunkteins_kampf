import OBR from '@owlbear-rodeo/sdk'
import { assetUrl } from './assetUrl.js'

const ID = 'dsa-owlbear.tracker'

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
      const addToInitiative = context.items.every(
        (item) => item.metadata[`${ID}/metadata`] === undefined
      )
      if (addToInitiative) {
        OBR.scene.items.updateItems(context.items, (items) => {
          for (const item of items) {
            item.metadata[`${ID}/metadata`] = {
              initiative: '',
            }
          }
        })
      } else {
        OBR.scene.items.updateItems(context.items, (items) => {
          for (const item of items) {
            delete item.metadata[`${ID}/metadata`]
          }
        })
      }
    },
  })
}
