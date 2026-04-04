import OBR from '@owlbear-rodeo/sdk'

const ID = 'dsa-owlbear.tracker'

export function setupInitiativeList(element) {
  const renderList = (items) => {
    const initiativeItems = []
    for (const item of items) {
      const metadata = item.metadata[`${ID}/metadata`]
      if (metadata) {
        initiativeItems.push({
          initiative: metadata.initiative,
          name: item.name,
        })
      }
    }
    const sortedItems = initiativeItems.sort(
      (a, b) => parseFloat(b.initiative) - parseFloat(a.initiative)
    )
    const nodes = []
    for (const initiativeItem of sortedItems) {
      const node = document.createElement('li')
      node.textContent = `${initiativeItem.name} (${initiativeItem.initiative})`
      nodes.push(node)
    }
    element.replaceChildren(...nodes)
  }
  OBR.scene.items.onChange(renderList)
}
