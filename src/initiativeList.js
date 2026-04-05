import OBR from '@owlbear-rodeo/sdk'
import {
  collectSortedParticipants,
  TRACKER_ITEM_META_KEY,
} from './participants.js'
import { getCombat, onCombatChange, patchCombat } from './combatRoom.js'
import { setTrackedParticipantIds } from './listState.js'
import {
  bindPhaseOverlayHandlers,
  layoutPhaseOverlay,
  onNamePhasePlusClick,
} from './phaseLinks.js'

export function setupInitiativeList(element, { onListChange } = {}) {
  let restoreFocusItemId = null
  let lastItems = []
  const host = document.getElementById('initiative-list-host')
  const overlay = document.getElementById('phase-overlay')

  let layoutFrame = 0
  const schedulePhaseLayout = (rows, items) => {
    if (!host || !overlay) return
    cancelAnimationFrame(layoutFrame)
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0
      const itemMetaById = new Map()
      for (const item of items) {
        const m = item.metadata?.[TRACKER_ITEM_META_KEY]
        if (m) itemMetaById.set(item.id, m)
      }
      layoutPhaseOverlay(host, overlay, element, rows, itemMetaById)
      overlay.style.height = `${element.offsetHeight}px`
    })
  }

  if (host && overlay) {
    bindPhaseOverlayHandlers(overlay)
    const ro = new ResizeObserver(() => {
      const rows = collectSortedParticipants(lastItems)
      schedulePhaseLayout(rows, lastItems)
    })
    ro.observe(host)
    ro.observe(element)
  }

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

      const main = document.createElement('div')
      main.className = 'init-row-main'

      const nameCol = document.createElement('div')
      nameCol.className = 'init-row-name-col'

      const nameEl = document.createElement('span')
      nameEl.className = 'init-row-name'
      nameEl.textContent = row.name
      nameEl.title = 'Doppelklick: Token fokussieren'
      nameEl.addEventListener('dblclick', () => {
        void OBR.player.select([row.id], true)
      })

      const phasePlus = document.createElement('button')
      phasePlus.type = 'button'
      phasePlus.className = 'init-row-phase-plus'
      phasePlus.textContent = '+'
      phasePlus.title =
        'INI-Phasen (4.1): Klick öffnen / weitere Wurzel · Shift+Klick schließen'
      phasePlus.setAttribute('aria-label', 'INI-Phasen')
      phasePlus.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        void onNamePhasePlusClick(row.id, { shiftKey: e.shiftKey })
      })

      const rootAnchor = document.createElement('span')
      rootAnchor.className = 'phase-root-anchor'
      rootAnchor.setAttribute('aria-hidden', 'true')

      nameCol.append(nameEl, phasePlus, rootAnchor)

      const input = document.createElement('input')
      input.className = 'init-row-init'
      input.type = 'text'
      input.inputMode = 'decimal'
      input.autocomplete = 'off'
      input.spellcheck = false
      input.value = row.initiative
      input.setAttribute('aria-label', 'INI')

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

      main.append(nameCol, input)
      li.appendChild(main)
      frag.appendChild(li)
    }

    element.replaceChildren(frag)

    if (restoreFocusItemId) {
      const inp = element.querySelector(
        `li[data-item-id="${CSS.escape(restoreFocusItemId)}"] .init-row-init`
      )
      if (inp) {
        inp.focus()
        const len = inp.value.length
        inp.setSelectionRange(len, len)
      }
      restoreFocusItemId = null
    }

    schedulePhaseLayout(rows, items)
    onListChange?.(items)
  }

  OBR.scene.items.getItems().then(renderList)
  OBR.scene.items.onChange(renderList)
  onCombatChange(() => renderList(lastItems))

  return () => renderList(lastItems)
}
