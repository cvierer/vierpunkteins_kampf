import OBR from '@owlbear-rodeo/sdk'
import {
  collectSortedParticipants,
  TRACKER_ITEM_META_KEY,
} from './participants.js'
import {
  computeValidIniTieInsertSlots,
  getCombat,
  getIniTieOrder,
  onCombatChange,
  onIniTieOrderChange,
  patchCombat,
  reorderIniTieToken,
} from './combatRoom.js'
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

const TOKEN_DRAG_MIME = 'application/x-vierpunkteins-token'

function isTokenDragTransfer(dataTransfer) {
  return (
    dataTransfer?.types &&
    Array.from(dataTransfer.types).includes(TOKEN_DRAG_MIME)
  )
}

function formatHookDisplay(hook) {
  if (hook === null) return ''
  return Number.isInteger(hook) ? String(hook) : String(hook)
}

function parseIniNumber(s) {
  const n = Number(String(s ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function formatDragIniValue(n) {
  if (!Number.isFinite(n)) return ''
  const rounded = Math.round(n * 1000) / 1000
  const asInt = Math.round(rounded)
  if (Math.abs(rounded - asInt) < 1e-4) return String(asInt)
  const oneDec = Math.round(rounded * 10) / 10
  return String(oneDec)
}

function buildIniKnotsExcluding(tokenEls, rowMap, excludeId) {
  const knots = []
  for (const el of tokenEls) {
    const id = el.dataset.itemId
    if (!id || id === excludeId) continue
    const row = rowMap.get(id)
    const v = parseIniNumber(row?.initiative)
    if (v === null) continue
    const r = el.getBoundingClientRect()
    const mid = r.top + r.height / 2
    knots.push({ y: mid, v })
  }
  knots.sort((a, b) => a.y - b.y)
  return knots
}

function lerpIniFromClientY(clientY, knots) {
  if (knots.length === 0) return null
  if (knots.length === 1) return knots[0].v
  if (clientY <= knots[0].y) {
    const k0 = knots[0]
    const k1 = knots[1]
    const denom = Math.max(k1.y - k0.y, 1e-6)
    const t = (clientY - k0.y) / denom
    return k0.v + t * (k1.v - k0.v)
  }
  const last = knots.length - 1
  if (clientY >= knots[last].y) {
    const k0 = knots[last - 1]
    const k1 = knots[last]
    const denom = Math.max(k1.y - k0.y, 1e-6)
    const t = (clientY - k1.y) / denom
    return k1.v + t * (k1.v - k0.v)
  }
  for (let i = 0; i < last; i++) {
    if (clientY <= knots[i + 1].y) {
      const k0 = knots[i]
      const k1 = knots[i + 1]
      const denom = Math.max(k1.y - k0.y, 1e-6)
      const t = (clientY - k0.y) / denom
      return k0.v + t * (k1.v - k0.v)
    }
  }
  return knots[last].v
}

function shouldCommitIniFromDrag(previewNum, currentIniStr) {
  if (previewNum == null || !Number.isFinite(previewNum)) return false
  const cur = parseIniNumber(currentIniStr)
  if (cur == null) return true
  return Math.abs(previewNum - cur) > 1e-3
}

function clientYToInsertSlot(clientY, tokenEls) {
  const n = tokenEls.length
  if (n === 0) return 0
  let slot = 0
  for (let i = 0; i < n; i++) {
    const r = tokenEls[i].getBoundingClientRect()
    const mid = r.top + r.height / 2
    if (clientY >= mid) slot = i + 1
  }
  return slot
}

function pickNearestValidSlot(rawSlot, validSlots) {
  if (validSlots.length === 0) return null
  let best = validSlots[0]
  let bestD = Math.abs(rawSlot - best)
  for (const s of validSlots) {
    const d = Math.abs(rawSlot - s)
    if (d < bestD || (d === bestD && s < best)) {
      best = s
      bestD = d
    }
  }
  return best
}

function insertSlotToLineTopPx(slot, tokenEls, listHost) {
  const hr = listHost.getBoundingClientRect()
  const n = tokenEls.length
  if (n === 0) return Math.max(4, hr.height * 0.08)
  const rects = tokenEls.map((el) => el.getBoundingClientRect())
  if (slot <= 0) return Math.max(0, rects[0].top - hr.top - 4)
  if (slot >= n) return Math.max(0, rects[n - 1].bottom - hr.top + 4)
  return Math.max(0, (rects[slot - 1].bottom + rects[slot].top) / 2 - hr.top)
}

export function setupInitiativeList(element, { onListChange } = {}) {
  let restoreFocusItemId = null
  let lastItems = []

  const listHost = element.parentElement
  const dropLine = document.createElement('div')
  dropLine.className = 'init-list-drop-line'
  dropLine.setAttribute('aria-hidden', 'true')
  if (listHost) listHost.appendChild(dropLine)

  const iniFloat = document.createElement('div')
  iniFloat.className = 'init-drag-ini-float'
  iniFloat.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iniFloat)

  const hideDropLine = () => {
    dropLine.classList.remove('init-list-drop-line--active')
  }

  const hideIniFloat = () => {
    iniFloat.classList.remove('init-drag-ini-float--visible')
    iniFloat.textContent = ''
  }

  const updateDropLine = (clientY, dragId) => {
    if (!listHost) return
    const { validSlots } = computeValidIniTieInsertSlots(dragId, lastItems)
    if (validSlots.length === 0) {
      hideDropLine()
      return
    }
    const tokenEls = [
      ...element.querySelectorAll('li.init-row:not(.init-row--phase)'),
    ]
    const raw = clientYToInsertSlot(clientY, tokenEls)
    const slot = pickNearestValidSlot(raw, validSlots)
    if (slot == null) {
      hideDropLine()
      return
    }
    const top = insertSlotToLineTopPx(slot, tokenEls, listHost)
    dropLine.style.top = `${top}px`
    dropLine.classList.add('init-list-drop-line--active')
  }

  const updateDragSession = (clientX, clientY, dragId) => {
    const tokenEls = [
      ...element.querySelectorAll('li.init-row:not(.init-row--phase)'),
    ]
    const rows = collectSortedParticipants(lastItems, getIniTieOrder())
    const rowMap = new Map(rows.map((r) => [r.id, r]))
    const knots = buildIniKnotsExcluding(tokenEls, rowMap, dragId)
    const previewNum = lerpIniFromClientY(clientY, knots)
    const dragRow = rowMap.get(dragId)
    const curStr = dragRow?.initiative ?? ''

    if (previewNum != null && knots.length > 0) {
      iniFloat.textContent = formatDragIniValue(previewNum)
      iniFloat.style.left = `${clientX + 14}px`
      iniFloat.style.top = `${clientY + 14}px`
      iniFloat.classList.add('init-drag-ini-float--visible')
    } else {
      hideIniFloat()
    }

    if (shouldCommitIniFromDrag(previewNum, curStr)) {
      hideDropLine()
    } else {
      updateDropLine(clientY, dragId)
    }
  }

  const onHostDragOver = (e) => {
    if (!isTokenDragTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const dragId =
      e.dataTransfer.getData(TOKEN_DRAG_MIME) ||
      e.dataTransfer.getData('text/plain')
    if (!dragId) return
    updateDragSession(e.clientX, e.clientY, dragId)
  }

  const onHostDrop = (e) => {
    if (!isTokenDragTransfer(e.dataTransfer)) return
    e.preventDefault()
    const dragId =
      e.dataTransfer.getData(TOKEN_DRAG_MIME) ||
      e.dataTransfer.getData('text/plain')
    hideDropLine()
    hideIniFloat()
    if (!dragId || !listHost) return
    const tokenEls = [
      ...element.querySelectorAll('li.init-row:not(.init-row--phase)'),
    ]
    const clientY = e.clientY
    void OBR.scene.items.getItems().then((fresh) => {
      const rows = collectSortedParticipants(fresh, getIniTieOrder())
      const rowMap = new Map(rows.map((r) => [r.id, r]))
      const knots = buildIniKnotsExcluding(tokenEls, rowMap, dragId)
      const previewNum = lerpIniFromClientY(clientY, knots)
      const curStr = rowMap.get(dragId)?.initiative ?? ''
      if (shouldCommitIniFromDrag(previewNum, curStr)) {
        const s = formatDragIniValue(previewNum)
        restoreFocusItemId = dragId
        OBR.scene.items.updateItems([dragId], (drafts) => {
          for (const d of drafts) {
            const m = d.metadata[TRACKER_ITEM_META_KEY]
            if (m) m.initiative = s
          }
        })
        return
      }
      const { validSlots } = computeValidIniTieInsertSlots(dragId, fresh)
      if (validSlots.length === 0) return
      const raw = clientYToInsertSlot(clientY, tokenEls)
      const slot = pickNearestValidSlot(raw, validSlots)
      if (slot == null) return
      void reorderIniTieToken(dragId, slot, fresh)
    })
  }

  const onHostDragLeave = (e) => {
    if (!isTokenDragTransfer(e.dataTransfer)) return
    const rel = e.relatedTarget
    if (rel && listHost?.contains(rel)) return
    hideDropLine()
    hideIniFloat()
  }

  if (listHost) {
    listHost.addEventListener('dragover', onHostDragOver)
    listHost.addEventListener('drop', onHostDrop)
    listHost.addEventListener('dragleave', onHostDragLeave)
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
        li.className = 'init-row init-row--token-draggable'
        if (row.id === activeId) li.classList.add('init-row--active')
        li.dataset.itemId = row.id
        li.draggable = true
        li.title =
          'Zeile ziehen: Zahl folgt dem Zeiger – zwischen zwei INIs interpolieren, loslassen übernimmt. Gleiche INI: goldene Linie = Reihenfolge. Nicht von +/− oder INI-Feld ziehen.'
        li.addEventListener('dragstart', (e) => {
          if (e.target.closest('button, input, textarea, select')) {
            e.preventDefault()
            return
          }
          e.dataTransfer.setData(TOKEN_DRAG_MIME, row.id)
          e.dataTransfer.setData('text/plain', row.id)
          e.dataTransfer.effectAllowed = 'move'
          const emptyImg = new Image()
          emptyImg.src =
            'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
          e.dataTransfer.setDragImage(emptyImg, 0, 0)
          li.classList.add('init-row--dragging')
          requestAnimationFrame(() => {
            updateDragSession(e.clientX, e.clientY, row.id)
          })
        })
        li.addEventListener('drag', (e) => {
          if (!li.classList.contains('init-row--dragging')) return
          updateDragSession(e.clientX, e.clientY, row.id)
        })
        li.addEventListener('dragend', () => {
          li.classList.remove('init-row--dragging')
          hideDropLine()
          hideIniFloat()
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

  OBR.scene.items.getItems().then(renderList)
  OBR.scene.items.onChange(renderList)
  onCombatChange(() => renderList(lastItems))
  onIniTieOrderChange(() => renderList(lastItems))

  return () => {
    if (listHost) {
      listHost.removeEventListener('dragover', onHostDragOver)
      listHost.removeEventListener('drop', onHostDrop)
      listHost.removeEventListener('dragleave', onHostDragLeave)
    }
    dropLine.remove()
    iniFloat.remove()
    renderList(lastItems)
  }
}
