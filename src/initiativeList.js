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
  swapAdjacentIniTiePair,
} from './combatRoom.js'
import { setTrackedParticipantIds } from './listState.js'
import {
  compareInitiativeRowsWithTieOrder,
  initiativeCompareOnlyIni,
  initiativeRank,
} from './initiativeSort.js'
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

/**
 * INI aus Y: gesamte Listenhöhe (+ Rand) linear auf [max+spread, min−spread].
 * t ist unbegrenzt, damit Ziehen über/unter der Liste weiter extrapoliert.
 * Bei mehreren gleichen INIs in der Liste liefert spread trotzdem nutzbare Steigung.
 */
function lerpIniFromClientY(clientY, knots, listUl) {
  if (knots.length === 0) return null
  const ur = listUl.getBoundingClientRect()
  const vs = knots.map((k) => k.v)
  const minV = Math.min(...vs)
  const maxV = Math.max(...vs)
  const marginY = Math.max(56, ur.height * 0.45)
  const yTop = ur.top - marginY
  const yBot = ur.bottom + marginY
  const range = maxV - minV
  const spread = Math.max(12, range * 0.55 + 8)
  const vHigh = maxV + spread
  const vLow = Math.max(0, minV - spread)
  const t = (clientY - yTop) / Math.max(yBot - yTop, 1e-6)
  return vHigh + t * (vLow - vHigh)
}

function clampIniContinuous(continuous) {
  if (continuous == null || !Number.isFinite(continuous)) return null
  return Math.max(0, continuous)
}

/** Konsistentes Runden für INI ≥ 0 (ohne JS „half-to-even“ bei .5). */
function roundHalfUpNonNegative(n) {
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.floor(n + 0.5))
}

function iniBaseIntFromLerp(continuous) {
  return roundHalfUpNonNegative(continuous)
}

function formatIniStorage(n) {
  if (!Number.isFinite(n)) return '0'
  const x = Math.max(0, n)
  let s = x.toFixed(4).replace(/\.?0+$/, '')
  if (s === '' || s === '-') s = '0'
  return s
}

/**
 * Ganzzahliger „Kampfwert“-Anteil aus vertikalem Lerp; Nachkomma wie bisher am Token.
 * newNum = Ersatz-Ganzzahlanteil + (aktueller Wert − trunc-Anteil aus initiativeRank).
 */
function composeProposedIniFromDragIntPart(replacementIntPart, currentIniStr) {
  const cur = parseIniNumber(currentIniStr)
  const r = initiativeRank(currentIniStr)
  if (cur === null || r === null) {
    return formatIniStorage(Math.max(0, replacementIntPart))
  }
  const newNum = Math.max(0, replacementIntPart + (cur - r.intPart))
  return formatIniStorage(newNum)
}

function dragProposesIniChange(proposedStr, curStr, dragRow, dragId) {
  if (!dragRow) return false
  return (
    initiativeCompareOnlyIni(
      { id: dragId, initiative: proposedStr, name: dragRow.name },
      { id: dragId, initiative: curStr, name: dragRow.name }
    ) !== 0
  )
}

function computeDropProposal(
  clientY,
  dragId,
  items,
  tieOrderIds,
  tokenEls,
  wheelNudge,
  listUl
) {
  const rows = collectSortedParticipants(items, tieOrderIds)
  const rowMap = new Map(rows.map((r) => [r.id, r]))
  const dragRow = rowMap.get(dragId)
  const curStr = dragRow?.initiative ?? ''
  const knots = buildIniKnotsExcluding(tokenEls, rowMap, dragId)
  const previewCont = clampIniContinuous(
    lerpIniFromClientY(clientY, knots, listUl)
  )
  let baseInt = iniBaseIntFromLerp(previewCont)
  if (baseInt == null) {
    const r = initiativeRank(curStr)
    baseInt = r ? Math.max(0, r.intPart) : 0
  }
  const intPart = Math.max(0, baseInt + wheelNudge)
  const proposedStr = composeProposedIniFromDragIntPart(intPart, curStr)
  const willIni = dragProposesIniChange(proposedStr, curStr, dragRow, dragId)
  return { proposedStr, willIni, knots, dragRow, curStr }
}

function sortedTokenIdsWithVirtualDragIni(items, tieOrderIds, dragId, iniStr) {
  const sortedRows = collectSortedParticipants(items, tieOrderIds)
  const idSet = new Set(sortedRows.map((r) => r.id))
  const tieFiltered = tieOrderIds.filter((id) => idSet.has(id))
  const mod = sortedRows.map((r) =>
    r.id === dragId ? { ...r, initiative: iniStr } : r
  )
  mod.sort((a, b) =>
    compareInitiativeRowsWithTieOrder(a, b, tieFiltered)
  )
  return mod.map((r) => r.id)
}

function virtualOrderToLineTopPx(order, dragId, tokenEls, listHost, listUl) {
  const hr = listHost.getBoundingClientRect()
  const ur = listUl.getBoundingClientRect()
  const pad = 2
  const rectFor = (id) => {
    const el = tokenEls.find((e) => e.dataset.itemId === id)
    return el?.getBoundingClientRect()
  }
  const k = order.indexOf(dragId)
  if (k < 0 || order.length === 0) {
    return Math.max(pad, ur.top - hr.top + pad)
  }
  if (order.length === 1) {
    return Math.max(pad, ur.top - hr.top + pad)
  }
  if (k === 0) {
    return Math.max(pad, ur.top - hr.top + pad)
  }
  if (k === order.length - 1) {
    const prevR = rectFor(order[k - 1])
    if (prevR) {
      return Math.max(pad, (prevR.bottom + ur.bottom) / 2 - hr.top)
    }
    return Math.max(pad, ur.bottom - hr.top - pad)
  }
  const prevR = rectFor(order[k - 1])
  const nextR = rectFor(order[k + 1])
  if (prevR && nextR) {
    return Math.max(pad, (prevR.bottom + nextR.top) / 2 - hr.top)
  }
  if (prevR) return Math.max(pad, (prevR.bottom + ur.top) / 2 - hr.top)
  if (nextR) return Math.max(pad, (ur.bottom + nextR.top) / 2 - hr.top)
  return Math.max(pad, ur.top - hr.top + ur.height / 2)
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

function insertSlotToLineTopPx(slot, tokenEls, listHost, listUl) {
  const hr = listHost.getBoundingClientRect()
  const ur = listUl.getBoundingClientRect()
  const n = tokenEls.length
  const pad = 2
  if (n === 0) {
    return Math.max(pad, ur.top - hr.top + ur.height / 2)
  }
  const rects = tokenEls.map((el) => el.getBoundingClientRect())
  if (slot <= 0) return Math.max(pad, ur.top - hr.top + pad)
  if (slot >= n) return Math.max(pad, ur.bottom - hr.top - pad)
  return Math.max(pad, (rects[slot - 1].bottom + rects[slot].top) / 2 - hr.top)
}

/** Tausch-Button exakt im Flex-Gap zwischen zwei `li` (einheitlich für alle Zeilen). */
function layoutIniSwapBetween(ul, host, overlay) {
  if (!host || !overlay) return
  const hostR = host.getBoundingClientRect()
  for (const btn of overlay.querySelectorAll('.init-row-ini-swap[data-ini-swap-upper]')) {
    const upperId = btn.dataset.iniSwapUpper
    const lowerId = btn.dataset.iniSwapLower
    const upperLi = ul.querySelector(
      `li.init-row--token-draggable[data-item-id="${CSS.escape(upperId)}"]`
    )
    const lowerLi = ul.querySelector(
      `li.init-row--token-draggable[data-item-id="${CSS.escape(lowerId)}"]`
    )
    const refCol = upperLi?.querySelector('.init-col-swap')
    const prev = lowerLi?.previousElementSibling
    if (!upperLi || !lowerLi || !refCol || !prev) {
      btn.style.display = 'none'
      continue
    }
    btn.style.display = ''
    const gapTop = prev.getBoundingClientRect().bottom
    const gapBot = lowerLi.getBoundingClientRect().top
    const h = Math.max(0, gapBot - gapTop)
    if (h < 1) {
      btn.style.display = 'none'
      continue
    }
    const col = refCol.getBoundingClientRect()
    btn.style.position = 'absolute'
    btn.style.left = `${col.left - hostR.left}px`
    btn.style.width = `${col.width}px`
    btn.style.top = `${gapTop - hostR.top}px`
    btn.style.height = `${h}px`
  }
}

export function setupInitiativeList(element, { onListChange } = {}) {
  let restoreFocusItemId = null
  let lastItems = []

  const listHost = element.parentElement
  const dropLine = document.createElement('div')
  dropLine.className = 'init-list-drop-line'
  dropLine.setAttribute('aria-hidden', 'true')
  if (listHost) listHost.appendChild(dropLine)

  const swapOverlay = document.createElement('div')
  swapOverlay.className = 'init-ini-swap-overlay'
  swapOverlay.setAttribute('aria-hidden', 'true')
  if (listHost) listHost.appendChild(swapOverlay)

  const iniFloat = document.createElement('div')
  iniFloat.className = 'init-drag-ini-float'
  iniFloat.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iniFloat)

  let rowDragActive = false
  let dragWheelNudge = 0
  let activeDragRowId = null
  let lastDragClientX = 0
  let lastDragClientY = 0
  /** Feste X-Position der INI-Vorschau (nur Y folgt dem Zeiger). */
  let dragFloatAnchorX = 0

  let swapLayoutRo = null

  const hideDropLine = () => {
    dropLine.classList.remove(
      'init-list-drop-line--active',
      'init-list-drop-line--ini',
      'init-list-drop-line--reorder'
    )
  }

  const hideIniFloat = () => {
    iniFloat.classList.remove('init-drag-ini-float--visible')
    iniFloat.replaceChildren()
  }

  const computeDropLineTopPx = (
    clientY,
    dragId,
    proposedStr,
    willCommitIni,
    items,
    tieOrderIds,
    tokenEls
  ) => {
    if (!listHost) return null
    if (willCommitIni) {
      const order = sortedTokenIdsWithVirtualDragIni(
        items,
        tieOrderIds,
        dragId,
        proposedStr
      )
      return virtualOrderToLineTopPx(order, dragId, tokenEls, listHost, element)
    }
    const { validSlots } = computeValidIniTieInsertSlots(dragId, items)
    if (validSlots.length === 0) return null
    const raw = clientYToInsertSlot(clientY, tokenEls)
    const slot = pickNearestValidSlot(raw, validSlots)
    if (slot == null) return null
    return insertSlotToLineTopPx(slot, tokenEls, listHost, element)
  }

  const updateDragSession = (clientX, clientY, dragId) => {
    lastDragClientX = clientX
    lastDragClientY = clientY
    const tokenEls = [
      ...element.querySelectorAll('li.init-row:not(.init-row--phase)'),
    ]
    const { proposedStr, willIni, dragRow } = computeDropProposal(
      clientY,
      dragId,
      lastItems,
      getIniTieOrder(),
      tokenEls,
      dragWheelNudge,
      element
    )

    if (dragRow && rowDragActive) {
      iniFloat.replaceChildren()
      const nameEl = document.createElement('div')
      nameEl.className = 'init-drag-ini-float-name'
      nameEl.textContent = dragRow.name || '—'
      nameEl.title = dragRow.name || ''
      const main = document.createElement('div')
      main.className = 'init-drag-ini-float-main'
      main.textContent = `INI ${proposedStr}`
      const mode = document.createElement('div')
      mode.className = 'init-drag-ini-float-mode'
      mode.textContent = willIni
        ? 'Loslassen: neuen Wert übernehmen'
        : 'Loslassen: Reihenfolge tauschen'
      iniFloat.append(nameEl, main, mode)
      iniFloat.style.left = `${dragFloatAnchorX}px`
      iniFloat.style.top = `${clientY + 12}px`
      iniFloat.classList.add('init-drag-ini-float--visible')
    } else {
      hideIniFloat()
    }

    const topPx = computeDropLineTopPx(
      clientY,
      dragId,
      proposedStr,
      willIni,
      lastItems,
      getIniTieOrder(),
      tokenEls
    )
    if (topPx != null) {
      dropLine.style.top = `${topPx}px`
      dropLine.classList.add('init-list-drop-line--active')
      dropLine.classList.toggle('init-list-drop-line--ini', willIni)
      dropLine.classList.toggle('init-list-drop-line--reorder', !willIni)
    } else {
      hideDropLine()
    }
  }

  const applyTokenDragRelease = (dragId, clientY, wheelAtDrop) => {
    hideDropLine()
    hideIniFloat()
    if (!dragId || !listHost) return
    void OBR.scene.items.getItems().then((fresh) => {
      const tokenElsFresh = [
        ...element.querySelectorAll('li.init-row:not(.init-row--phase)'),
      ]
      const { proposedStr, willIni } = computeDropProposal(
        clientY,
        dragId,
        fresh,
        getIniTieOrder(),
        tokenElsFresh,
        wheelAtDrop,
        element
      )
      if (willIni) {
        restoreFocusItemId = dragId
        void OBR.scene.items
          .updateItems([dragId], (drafts) => {
            for (const d of drafts) {
              const m = d.metadata[TRACKER_ITEM_META_KEY]
              if (m) m.initiative = proposedStr
            }
          })
          .then(() => OBR.scene.items.getItems())
          .then((afterIni) => {
            renderList(afterIni)
            const els = [
              ...element.querySelectorAll('li.init-row:not(.init-row--phase)'),
            ]
            const { validSlots } = computeValidIniTieInsertSlots(
              dragId,
              afterIni
            )
            if (validSlots.length === 0) return
            const raw = clientYToInsertSlot(clientY, els)
            const slot = pickNearestValidSlot(raw, validSlots)
            if (slot == null) return
            void reorderIniTieToken(dragId, slot, afterIni)
          })
        return
      }
      const { validSlots } = computeValidIniTieInsertSlots(dragId, fresh)
      if (validSlots.length === 0) return
      const raw = clientYToInsertSlot(clientY, tokenElsFresh)
      const slot = pickNearestValidSlot(raw, validSlots)
      if (slot == null) return
      void reorderIniTieToken(dragId, slot, fresh)
    })
  }

  const wheelListenerOpts = { passive: false }

  const onDocumentDragOverWhileRow = (e) => {
    if (!rowDragActive || activeDragRowId == null) return
    if (!isTokenDragTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    updateDragSession(e.clientX, e.clientY, activeDragRowId)
  }

  const onDocumentDropWhileRow = (e) => {
    if (!rowDragActive || activeDragRowId == null) return
    if (!isTokenDragTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    const dragId =
      e.dataTransfer.getData(TOKEN_DRAG_MIME) ||
      e.dataTransfer.getData('text/plain')
    if (dragId !== activeDragRowId) return
    const wheelAtDrop = dragWheelNudge
    applyTokenDragRelease(dragId, e.clientY, wheelAtDrop)
  }

  const onDocumentWheelWhileRow = (e) => {
    if (!rowDragActive || activeDragRowId == null) return
    e.preventDefault()
    e.stopPropagation()
    dragWheelNudge += e.deltaY < 0 ? 1 : -1
    updateDragSession(lastDragClientX, lastDragClientY, activeDragRowId)
  }

  const attachGlobalDragListeners = () => {
    document.addEventListener('dragover', onDocumentDragOverWhileRow, true)
    document.addEventListener('drop', onDocumentDropWhileRow, true)
    document.addEventListener('wheel', onDocumentWheelWhileRow, wheelListenerOpts)
  }

  const detachGlobalDragListeners = () => {
    document.removeEventListener('dragover', onDocumentDragOverWhileRow, true)
    document.removeEventListener('drop', onDocumentDropWhileRow, true)
    document.removeEventListener('wheel', onDocumentWheelWhileRow, wheelListenerOpts)
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
    const swapLowerByUpper = new Map()
    for (let ti = 0; ti < tokenRows.length - 1; ti++) {
      const a = tokenRows[ti]
      const b = tokenRows[ti + 1]
      if (initiativeCompareOnlyIni(a, b) === 0) {
        swapLowerByUpper.set(a.id, b.id)
      }
    }

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
          'Zeile ziehen: auch weit über/unter der Liste loslassen (INI-Extrapolation). Mausrad ±1. INI-Hinweis links fest, nur vertikal. Nicht von +/− oder INI-Feld ziehen.'
        li.addEventListener('dragstart', (e) => {
          if (e.target.closest('button, input, textarea, select')) {
            e.preventDefault()
            return
          }
          e.dataTransfer.setData(TOKEN_DRAG_MIME, row.id)
          e.dataTransfer.setData('text/plain', row.id)
          e.dataTransfer.effectAllowed = 'move'
          rowDragActive = true
          dragWheelNudge = 0
          activeDragRowId = row.id
          lastDragClientX = e.clientX
          lastDragClientY = e.clientY
          const hr = listHost?.getBoundingClientRect()
          dragFloatAnchorX = hr
            ? Math.round(hr.left + 8)
            : Math.round(li.getBoundingClientRect().left)
          const dragImg = document.createElement('canvas')
          dragImg.width = 1
          dragImg.height = 1
          e.dataTransfer.setDragImage(dragImg, 0, 0)
          li.classList.add('init-row--dragging')
          attachGlobalDragListeners()
          requestAnimationFrame(() => {
            updateDragSession(e.clientX, e.clientY, row.id)
          })
        })
        li.addEventListener('drag', (e) => {
          if (!li.classList.contains('init-row--dragging')) return
          updateDragSession(e.clientX, e.clientY, row.id)
        })
        li.addEventListener('dragend', () => {
          detachGlobalDragListeners()
          rowDragActive = false
          dragWheelNudge = 0
          activeDragRowId = null
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

        const swapCol = document.createElement('div')
        swapCol.className = 'init-col-swap'
        main.append(btnCol, gutter, nameCol, input, swapCol)
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

        const swapSpacer = document.createElement('div')
        swapSpacer.className = 'init-col-swap init-col-swap--phase'
        swapSpacer.setAttribute('aria-hidden', 'true')

        main.append(btnCol, gutter, nameCol, iniInput, swapSpacer)
        li.appendChild(main)
        frag.appendChild(li)
      }
    }

    element.replaceChildren(frag)

    swapOverlay.replaceChildren()
    for (const [upperId, lowerId] of swapLowerByUpper.entries()) {
      const swapBtn = document.createElement('button')
      swapBtn.type = 'button'
      swapBtn.className = 'init-row-ini-swap'
      swapBtn.dataset.iniSwapUpper = upperId
      swapBtn.dataset.iniSwapLower = lowerId
      const arrUp = document.createElement('span')
      arrUp.className = 'init-row-ini-swap__arr init-row-ini-swap__arr--up'
      arrUp.setAttribute('aria-hidden', 'true')
      arrUp.textContent = '↑'
      const arrDown = document.createElement('span')
      arrDown.className = 'init-row-ini-swap__arr init-row-ini-swap__arr--down'
      arrDown.setAttribute('aria-hidden', 'true')
      arrDown.textContent = '↓'
      swapBtn.append(arrUp, arrDown)
      swapBtn.title =
        'Reihenfolge mit dem nächsten Eintrag tauschen (gleiche INI)'
      swapBtn.setAttribute(
        'aria-label',
        'Gleiche INI: mit darunterliegendem Eintrag die Reihenfolge tauschen'
      )
      swapBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        void OBR.scene.items.getItems().then((fresh) => {
          void swapAdjacentIniTiePair(upperId, lowerId, fresh)
        })
      })
      swapOverlay.appendChild(swapBtn)
    }

    const runSwapLayout = () => layoutIniSwapBetween(element, listHost, swapOverlay)
    requestAnimationFrame(() => {
      runSwapLayout()
      requestAnimationFrame(runSwapLayout)
    })
    if (typeof ResizeObserver !== 'undefined') {
      if (!swapLayoutRo) {
        swapLayoutRo = new ResizeObserver(runSwapLayout)
        swapLayoutRo.observe(element)
        if (listHost) swapLayoutRo.observe(listHost)
      }
    }

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
    swapLayoutRo?.disconnect()
    swapLayoutRo = null
    detachGlobalDragListeners()
    dropLine.remove()
    swapOverlay.remove()
    iniFloat.remove()
  }
}
