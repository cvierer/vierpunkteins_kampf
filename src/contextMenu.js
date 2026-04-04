import OBR from '@owlbear-rodeo/sdk'

const ID = 'dsa-owlbear.tracker'

function iconUrl(file) {
  return `${import.meta.env.BASE_URL}${file}`.replace(/\/{2,}/g, '/')
}

export function setupContextMenu() {
  OBR.contextMenu.create({
    id: `${ID}/context-menu`,
    icons: [
      {
        icon: iconUrl('add.svg'),
        label: 'Zur Initiative hinzufügen',
        filter: {
          every: [
            { key: 'layer', value: 'CHARACTER' },
            { key: ['metadata', `${ID}/metadata`], value: undefined },
          ],
        },
      },
      {
        icon: iconUrl('remove.svg'),
        label: 'entfernen',
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
        const initiative = window.prompt('Initiative-Wert eingeben')
        OBR.scene.items.updateItems(context.items, (items) => {
          for (const item of items) {
            item.metadata[`${ID}/metadata`] = {
              initiative,
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
