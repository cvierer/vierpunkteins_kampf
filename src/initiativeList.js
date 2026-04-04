import OBR from '@owlbear-rodeo/sdk'
import { compareInitiativeRows } from './initiativeSort.js'

const ID = 'dsa-owlbear.tracker'

export function setupInitiativeList(element) {
  let restoreFocusItemId = null

  const renderList = (items) => {
    const rows = []
    for (const item of items) {
      const metadata = item.metadata[`${ID}/metadata`]
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

    const frag = document.createDocumentFragment()
    for (const row of rows) {
      const li = document.createElement('li')
      li.className = 'init-row'
      li.dataset.itemId = row.id

      const nameEl = document.createElement('span')
      nameEl.className = 'init-row-name'
      nameEl.textContent = row.name

      const input = document.createElement('input')
      input.className = 'init-row-init'
      input.type = 'text'
      input.inputMode = 'decimal'
      input.autocomplete = 'off'
      input.spellcheck = false
      input.value = row.initiative
      input.setAttribute('aria-label', 'Initiative')

      const commit = () => {
        const next = input.value.trim()
        if (next === row.initiative) return
        restoreFocusItemId = row.id
        OBR.scene.items.updateItems([row.id], (drafts) => {
          for (const d of drafts) {
            const meta = d.metadata[`${ID}/metadata`]
            if (meta) meta.initiative = next
          }
        })
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          input.blur()
        }
      })
      input.addEventListener('blur', commit)

      li.append(nameEl, input)
      frag.appendChild(li)
    }

    element.replaceChildren(frag)

    if (restoreFocusItemId) {
      const inp = element.querySelector(
        `li[data-item-id="${restoreFocusItemId}"] .init-row-init`
      )
      if (inp) {
        inp.focus()
        const len = inp.value.length
        inp.setSelectionRange(len, len)
      }
      restoreFocusItemId = null
    }
  }

  OBR.scene.items.getItems().then(renderList)
  OBR.scene.items.onChange(renderList)
}
