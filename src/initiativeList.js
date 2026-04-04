import OBR from '@owlbear-rodeo/sdk'
import {
  collectSortedParticipants,
  TRACKER_ITEM_META_KEY,
} from './participants.js'
import { getCombat, onCombatChange, patchCombat } from './combatRoom.js'
import { setTrackedParticipantIds } from './listState.js'

export function setupInitiativeList(element, { onListChange } = {}) {
  let restoreFocusItemId = null
  let lastItems = []

  const reconcileCombat = async (rows) => {
    const c = getCombat()
    if (!c.started) return
    const ids = rows.map((r) => r.id)
    if (ids.length === 0) {
      await patchCombat({ started: false, currentItemId: null, round: 1 })
      return
    }
    if (!c.currentItemId || !ids.includes(c.currentItemId)) {
      await patchCombat({ currentItemId: ids[0] })
    }
  }

  const renderList = (items) => {
    lastItems = items
    const rows = collectSortedParticipants(items)
    setTrackedParticipantIds(rows.map((r) => r.id))
    void reconcileCombat(rows)

    const combat = getCombat()
    const activeId =
      combat.started && combat.currentItemId ? combat.currentItemId : null

    const frag = document.createDocumentFragment()
    for (const row of rows) {
      const li = document.createElement('li')
      li.className = 'init-row'
      if (row.id === activeId) li.classList.add('init-row--active')
      li.dataset.itemId = row.id

      const nameEl = document.createElement('span')
      nameEl.className = 'init-row-name'
      nameEl.textContent = row.name
      nameEl.title = 'Doppelklick: Token fokussieren'
      nameEl.addEventListener('dblclick', () => {
        void OBR.player.select([row.id], true)
      })

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
            const meta = d.metadata[TRACKER_ITEM_META_KEY]
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

    onListChange?.(items)
  }

  OBR.scene.items.getItems().then(renderList)
  OBR.scene.items.onChange(renderList)
  onCombatChange(() => renderList(lastItems))

  return () => renderList(lastItems)
}
