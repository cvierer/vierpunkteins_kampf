import OBR from '@owlbear-rodeo/sdk'
import {
  collectSortedParticipants,
  TRACKER_ITEM_META_KEY,
} from './participants.js'
import {
  getCombat,
  getIniTieOrder,
  onCombatChange,
  onIniTieOrderChange,
  patchCombat,
  swapIniTiedPair,
} from './combatRoom.js'
import { initiativeCompareOnlyIni } from './initiativeSort.js'
import { setTrackedParticipantIds } from './listState.js'
import {
  addPhaseChildLink,
  buildMergedDisplayRows,
  hookIniForLink,
  normalizePhases,
  onNamePhasePlusClick,
  removeLastRootPhase,
  removePhaseLink,
  tryCommitPhaseOffset,
  tryCommitPhaseTargetIni,
} from './phaseLinks.js'

function formatHookDisplay(hook) {
  if (hook === null) return ''
  return Number.isInteger(hook) ? String(hook) : String(hook)
}

export function setupInitiativeList(element, { onListChange } = {}) {
  let restoreFocusItemId = null
  let lastItems = []
  let swapPickId = null

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

  const handleTokenSwapClick = (clickedId) => {
    const items = lastItems
    if (!swapPickId) {
      swapPickId = clickedId
      renderList(items)
      return
    }
    if (swapPickId === clickedId) {
      return
    }
    const rows = collectSortedParticipants(items, getIniTieOrder())
    const first = rows.find((r) => r.id === swapPickId)
    const second = rows.find((r) => r.id === clickedId)
    if (!first || !second) {
      swapPickId = clickedId
      renderList(items)
      return
    }
    if (initiativeCompareOnlyIni(first, second) !== 0) {
      swapPickId = clickedId
      renderList(items)
      return
    }
    const a = swapPickId
    swapPickId = null
    void swapIniTiedPair(a, clickedId, items)
  }

  const renderList = (items) => {
    lastItems = items
    const tokenRows = collectSortedParticipants(items, getIniTieOrder())
    setTrackedParticipantIds(tokenRows.map((r) => r.id))
    void reconcileCombat(tokenRows)

    const combat = getCombat()
    const activeId =
      combat.started && combat.currentItemId ? combat.currentItemId : null

    const merged = buildMergedDisplayRows(tokenRows, items, getIniTieOrder())
    const frag = document.createDocumentFragment()

    for (const entry of merged) {
      if (entry.kind === 'token') {
        const row = entry.row
        const meta = items.find((i) => i.id === row.id)?.metadata?.[
          TRACKER_ITEM_META_KEY
        ]
        const phases = normalizePhases(meta?.phases)

        const li = document.createElement('li')
        li.className = 'init-row'
        if (row.id === activeId) li.classList.add('init-row--active')
        if (swapPickId === row.id) li.classList.add('init-row--swap-pick')
        li.dataset.itemId = row.id
        li.title =
          'Gleiche INI: erste Figur anklicken, zweite zum Tauschen. Escape bricht ab. Nicht auf +/− oder INI-Feld klicken.'
        li.addEventListener('click', (e) => {
          if (e.target.closest('button, input, textarea, select')) return
          handleTokenSwapClick(row.id)
        })

        const main = document.createElement('div')
        main.className = 'init-row-main'

        const btnCol = document.createElement('div')
        btnCol.className = 'init-col-btn'

        const phasePlus = document.createElement('button')
        phasePlus.type = 'button'
        phasePlus.className = 'init-row-phase-plus'
        phasePlus.textContent = '+'
        phasePlus.title =
          'INI-Phasen (4.1): öffnen / weitere Wurzel · Shift+Klick schließen'
        phasePlus.setAttribute('aria-label', 'INI-Phasen öffnen')
        phasePlus.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          void onNamePhasePlusClick(row.id, { shiftKey: e.shiftKey }, row.initiative)
        })

        btnCol.appendChild(phasePlus)

        if (phases.rowPanelOpen && phases.links.length > 0) {
          const phaseMinus = document.createElement('button')
          phaseMinus.type = 'button'
          phaseMinus.className = 'init-row-phase-minus'
          phaseMinus.textContent = '−'
          phaseMinus.title = 'Letzte Wurzel-Verknüpfung entfernen'
          phaseMinus.setAttribute('aria-label', 'Letzte INI-Phase entfernen')
          phaseMinus.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            void removeLastRootPhase(row.id)
          })
          btnCol.appendChild(phaseMinus)
        }

        const gutter = document.createElement('div')
        gutter.className = 'init-phase-gutter init-phase-gutter--empty'
        gutter.setAttribute('aria-hidden', 'true')

        const nameCol = document.createElement('div')
        nameCol.className = 'init-row-name-col'

        const nameEl = document.createElement('span')
        nameEl.className = 'init-row-name'
        nameEl.textContent = row.name
        nameEl.title = 'Doppelklick: Token fokussieren'
        nameEl.addEventListener('dblclick', () => {
          void OBR.player.select([row.id], true)
        })

        nameCol.appendChild(nameEl)

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
              const m = d.metadata[TRACKER_ITEM_META_KEY]
              if (m) m.initiative = next
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

        main.append(btnCol, gutter, nameCol, input)
        li.appendChild(main)
        frag.appendChild(li)
      } else {
        const { ownerId, ownerName, ownerIniStr, link, hookIni } = entry

        const li = document.createElement('li')
        li.className = 'init-row init-row--phase'
        li.dataset.phaseOwnerId = ownerId
        li.dataset.phaseLinkId = link.id

        const main = document.createElement('div')
        main.className = 'init-row-main init-row-main--phase'

        const btnCol = document.createElement('div')
        btnCol.className = 'init-col-btn init-col-btn--phase'

        const phaseMinus = document.createElement('button')
        phaseMinus.type = 'button'
        phaseMinus.className = 'init-row-phase-minus'
        phaseMinus.textContent = '−'
        phaseMinus.title = 'Diese INI-Phase entfernen'
        phaseMinus.setAttribute('aria-label', 'INI-Phase entfernen')
        phaseMinus.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          void removePhaseLink(ownerId, link.id)
        })

        const chainPlus = document.createElement('button')
        chainPlus.type = 'button'
        chainPlus.className = 'init-row-phase-plus init-row-phase-plus--small'
        chainPlus.textContent = '+'
        chainPlus.title = 'Weitere INI-Phase anknüpfen'
        chainPlus.setAttribute('aria-label', 'Weitere Phase')
        chainPlus.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          void addPhaseChildLink(ownerId, link.id, ownerIniStr)
        })

        btnCol.append(phaseMinus, chainPlus)

        const gutter = document.createElement('div')
        gutter.className = 'init-phase-gutter'
        const spine = document.createElement('div')
        spine.className = 'phase-spine'
        gutter.appendChild(spine)

        const offsetInput = document.createElement('input')
        offsetInput.type = 'text'
        offsetInput.inputMode = 'numeric'
        offsetInput.className = 'phase-offset-input'
        offsetInput.value = String(link.offset)
        offsetInput.setAttribute('aria-label', 'Phasen später')
        offsetInput.title = 'INI-Phasen später (4.1)'

        gutter.appendChild(offsetInput)

        const nameCol = document.createElement('div')
        nameCol.className = 'init-row-name-col'
        const nameEl = document.createElement('span')
        nameEl.className = 'init-row-name'
        nameEl.textContent = ownerName
        nameEl.title = 'Zusätzliche INI-Phase dieses Charakters'
        nameCol.appendChild(nameEl)

        const iniInput = document.createElement('input')
        iniInput.className = 'init-row-init'
        iniInput.type = 'text'
        iniInput.inputMode = 'decimal'
        iniInput.autocomplete = 'off'
        iniInput.spellcheck = false
        iniInput.value = formatHookDisplay(hookIni)
        iniInput.setAttribute('aria-label', 'Ziel-INI')

        const runRemoveAfterIniError = async () => {
          iniInput.value = 'INI < 0'
          iniInput.classList.add('init-row-init--error')
          await new Promise((r) => setTimeout(r, 420))
          void removePhaseLink(ownerId, link.id)
        }

        iniInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            iniInput.blur()
          }
        })
        iniInput.addEventListener('blur', () => {
          void OBR.scene.items.getItems().then((freshItems) => {
            const ownerRow = collectSortedParticipants(
              freshItems,
              getIniTieOrder()
            ).find((r) => r.id === ownerId)
            const ownerIni = ownerRow?.initiative ?? ownerIniStr
            const it = freshItems.find((i) => i.id === ownerId)
            const links = normalizePhases(
              it?.metadata?.[TRACKER_ITEM_META_KEY]?.phases
            ).links
            const prev = formatHookDisplay(
              hookIniForLink(link.id, ownerIni, links)
            )
            const trimmed = iniInput.value.trim()
            if (trimmed === prev) return
            return tryCommitPhaseTargetIni(
              ownerId,
              link.id,
              trimmed,
              ownerIni,
              links
            ).then(async (res) => {
              if (!res.ok && res.reason === 'NEG_INI') await runRemoveAfterIniError()
            })
          })
        })

        const runRemoveAfterOffsetError = async () => {
          offsetInput.value = 'INI < 0'
          offsetInput.classList.add('phase-offset-input--error')
          await new Promise((r) => setTimeout(r, 420))
          void removePhaseLink(ownerId, link.id)
        }

        offsetInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            offsetInput.blur()
          }
        })
        offsetInput.addEventListener('blur', () => {
          void OBR.scene.items.getItems().then((freshItems) => {
            const ownerRow = collectSortedParticipants(
              freshItems,
              getIniTieOrder()
            ).find((r) => r.id === ownerId)
            const ownerIni = ownerRow?.initiative ?? ownerIniStr
            const it = freshItems.find((i) => i.id === ownerId)
            const links = normalizePhases(
              it?.metadata?.[TRACKER_ITEM_META_KEY]?.phases
            ).links
            const trimmed = offsetInput.value.trim()
            return tryCommitPhaseOffset(
              ownerId,
              link.id,
              trimmed,
              ownerIni,
              links
            ).then(async (res) => {
              if (!res.ok && res.reason === 'NEG_INI')
                await runRemoveAfterOffsetError()
            })
          })
        })

        main.append(btnCol, gutter, nameCol, iniInput)
        li.appendChild(main)
        frag.appendChild(li)
      }
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

    onListChange?.(items)
  }

  const onEscapeSwap = (e) => {
    if (e.key !== 'Escape' || !swapPickId) return
    swapPickId = null
    renderList(lastItems)
  }
  document.addEventListener('keydown', onEscapeSwap)

  OBR.scene.items.getItems().then(renderList)
  OBR.scene.items.onChange(renderList)
  onCombatChange(() => renderList(lastItems))
  onIniTieOrderChange(() => renderList(lastItems))

  return () => {
    document.removeEventListener('keydown', onEscapeSwap)
    renderList(lastItems)
  }
}
