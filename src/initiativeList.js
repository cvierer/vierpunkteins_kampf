import OBR from '@owlbear-rodeo/sdk'
import { canEditSceneItem, isGmSync } from './editAccess.js'
import {
  collectSortedParticipants,
  TRACKER_ITEM_META_KEY,
} from './participants.js'
import {
  computeValidIniTieInsertSlots,
  getCombat,
  getIniTieOrder,
  isCombatNavMutationActive,
  onCombatChange,
  onIniTieOrderChange,
  patchCombat,
  reorderIniTieToken,
  RESET_ROUND_INTRO,
  swapAdjacentIniTiePair,
} from './combatRoom.js'
import { setTrackedParticipantIds } from './listState.js'
import {
  initiativeCompareOnlyIni,
  initiativeRank,
} from './initiativeSort.js'
import {
  addPhaseChildLink,
  buildCombatTurnSteps,
  buildMergedDisplayRows,
  combatPatchForStep,
  findCombatStepIndex,
  formatIniForSort,
  hookIniForLink,
  normalizePhases,
  onNamePhasePlusClick,
  onZaoRootTieOrderChange,
  removeLastZaoRoot,
  removePhaseLink,
  LH_DONE_STEP_ID,
  ROUND_END_STEP_ID,
  sortedLinksForLayout,
  swapAdjacentZaoRootKeys,
  togglePhaseLinkExpiresNextRound,
  tryCommitPhaseOffset,
  tryCommitPhaseTargetIni,
  zaoRootKey,
} from './phaseLinks.js'
import { zaoPadlockInnerHtml } from './zaoPadlockIcons.js'
import {
  KR_ABW,
  KR_ANG,
  KR_FREE_ACTION,
  KR_SRA,
  normalizeKrDigit,
  patchKrCounterByDelta,
  readKrAbw,
  readKrAng,
  readKrSra,
} from './krCounters.js'
import { commitLhValue, readLhState, runLongHandlungAfterCombatUpdate } from './longHandlung.js'

/** Letzter L.H.-Stand pro Token (für kurzes „fertig“ nach rem→0). */
const lhRenderPrev = new Map()

const TOKEN_DRAG_MIME = 'application/x-vierpunkteins-token'

const PHASE_DRAG_MARK = 'vierpphase|'

function applyAngAbwCounterVisual(btn, v) {
  const fill = btn.querySelector('.init-row-kr-counter__fill')
  const digit = btn.querySelector('.init-row-kr-counter__digit')
  if (!fill || !digit) return
  fill.classList.toggle('init-row-kr-counter__fill--on', v >= 1)
  btn.classList.toggle('init-row-kr-counter--has-digit', v >= 2)
  digit.textContent = v >= 2 ? String(v) : ''
}

function applyFaCounterVisual(btn, v) {
  const fill = btn.querySelector('.init-row-kr-counter__fill')
  const digit = btn.querySelector('.init-row-kr-counter__digit')
  if (!fill || !digit) return
  fill.classList.remove(
    'init-row-kr-counter__fill--half',
    'init-row-kr-counter__fill--full',
    'init-row-kr-counter__fill--on'
  )
  btn.classList.remove('init-row-kr-counter--has-digit')
  digit.textContent = ''
  if (v === 0) return
  if (v === 1) {
    fill.classList.add('init-row-kr-counter__fill--half')
    return
  }
  fill.classList.add('init-row-kr-counter__fill--full')
  if (v >= 3) {
    digit.textContent = String(v)
    btn.classList.add('init-row-kr-counter--has-digit')
  }
}

function splitCounterAria(v, labelDe) {
  if (v === 0) return `${labelDe}, leer`
  if (v === 1) return `${labelDe}, markiert`
  return `${labelDe}, ${v}`
}

function faCounterAria(v) {
  if (v === 0) return 'Freie Aktion, leer'
  if (v === 1) return 'Freie Aktion, zur Hälfte gefüllt'
  if (v === 2) return 'Freie Aktion, voll gefüllt'
  return `Freie Aktion, ${v}`
}

function actionPhaseRangeLabel(rootCount) {
  if (rootCount <= 0) return '2. Aktionsphase'
  if (rootCount === 1) return '2. Aktionsphase'
  return `2.–${rootCount + 1}. Aktionsphase`
}

function appendSplitKrCounter(
  container,
  ownerItemId,
  field,
  kind,
  value,
  canEdit,
  labelDe,
  titleExtra = ''
) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = `init-row-kr-counter init-row-kr-counter--split init-row-kr-counter--${kind}`
  const fill = document.createElement('span')
  fill.className = 'init-row-kr-counter__fill'
  fill.setAttribute('aria-hidden', 'true')
  const digit = document.createElement('span')
  digit.className = 'init-row-kr-counter__digit'
  digit.setAttribute('aria-hidden', 'true')
  b.append(fill, digit)
  const v = normalizeKrDigit(value)
  applyAngAbwCounterVisual(b, v)
  const baseTitle = `${labelDe}: Linksklick +1, Rechtsklick −1 (0–10, 1 = nur Farbe, 2–10 Zahl)`
  b.title = titleExtra ? `${baseTitle} ${titleExtra}` : baseTitle
  b.setAttribute('aria-label', splitCounterAria(v, labelDe))
  b.disabled = !canEdit
  if (canEdit) {
    b.addEventListener('click', (e) => {
      e.preventDefault()
      void patchKrCounterByDelta(ownerItemId, field, 1)
    })
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      void patchKrCounterByDelta(ownerItemId, field, -1)
    })
  }
  container.appendChild(b)
}

function appendFaCounter(container, ownerItemId, trackerMeta, canEdit) {
  const val = normalizeKrDigit(trackerMeta?.[KR_FREE_ACTION])
  const b = document.createElement('button')
  b.type = 'button'
  b.className =
    'init-row-kr-counter init-row-kr-counter--split init-row-kr-counter--fa'
  const fill = document.createElement('span')
  fill.className = 'init-row-kr-counter__fill'
  fill.setAttribute('aria-hidden', 'true')
  const digit = document.createElement('span')
  digit.className = 'init-row-kr-counter__digit'
  digit.setAttribute('aria-hidden', 'true')
  b.append(fill, digit)
  applyFaCounterVisual(b, val)
  b.title =
    'Freie Aktion: 1 = halb (links), 2 = voll, ab 3 Zahl · Linksklick +1, Rechtsklick −1 (0–10)'
  b.setAttribute('aria-label', faCounterAria(val))
  b.disabled = !canEdit
  if (canEdit) {
    b.addEventListener('click', (e) => {
      e.preventDefault()
      void patchKrCounterByDelta(ownerItemId, KR_FREE_ACTION, 1)
    })
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      void patchKrCounterByDelta(ownerItemId, KR_FREE_ACTION, -1)
    })
  }
  container.appendChild(b)
}

function appendKrCounterPair(container, ownerItemId, trackerMeta, canEdit) {
  appendSplitKrCounter(
    container,
    ownerItemId,
    KR_ANG,
    'ang',
    readKrAng(trackerMeta),
    canEdit,
    'Angriffsaktion'
  )
  appendSplitKrCounter(
    container,
    ownerItemId,
    KR_ABW,
    'abw',
    readKrAbw(trackerMeta),
    canEdit,
    'Abwehraktion'
  )
  appendSplitKrCounter(
    container,
    ownerItemId,
    KR_SRA,
    'sra',
    readKrSra(trackerMeta),
    canEdit,
    'Sonstige reguläre Aktionen',
    '— Dazu zählen: Atem Holen, Bewegen, Position, Taktik.'
  )
  appendFaCounter(container, ownerItemId, trackerMeta, canEdit)
  appendLhCell(container, ownerItemId, trackerMeta, canEdit)
}

function applyLhVisual(wrap, max, rem) {
  const pie = wrap.querySelector('.init-lh-cell__pie')
  if (!pie) return
  if (max <= 0) {
    pie.style.setProperty('--lh-consumed', '0deg')
    return
  }
  const frac = Math.max(0, Math.min(1, (max - rem) / max))
  pie.style.setProperty('--lh-consumed', `${frac * 360}deg`)
}

function appendLhCell(container, ownerItemId, trackerMeta, canEdit) {
  const st = readLhState(trackerMeta)
  const prev = lhRenderPrev.get(ownerItemId)
  lhRenderPrev.set(ownerItemId, { max: st.max, rem: st.rem })

  const wrap = document.createElement('div')
  wrap.className =
    'init-lh-cell' + (st.max > 0 ? ' init-lh-cell--active' : ' init-lh-cell--empty')

  const pieWrap = document.createElement('div')
  pieWrap.className = 'init-lh-cell__pie-wrap'
  const pie = document.createElement('div')
  pie.className = 'init-lh-cell__pie'
  pie.setAttribute('aria-hidden', 'true')
  pieWrap.appendChild(pie)

  const fraction = document.createElement('span')
  fraction.className = 'init-lh-cell__fraction'
  fraction.setAttribute('aria-hidden', 'true')
  if (st.max > 0) {
    fraction.textContent = `${st.rem}/${st.max}`
  }

  const inp = document.createElement('input')
  inp.type = 'text'
  inp.className = 'init-lh-cell__input'
  inp.inputMode = 'numeric'
  inp.autocomplete = 'off'
  inp.spellcheck = false
  inp.maxLength = 3
  inp.value = st.max > 0 ? String(st.rem) : ''

  const lhTitleActive =
    'Längerfristige Handlung: Rest / Gesamt in Aktionen (unten). Klick zum Bearbeiten; Rechtsklick löscht. Neue Zahl beim Speichern setzt die Handlung neu (Rest = Ziel). Pro KR bis zu zwei Abzüge an den INI-Stufen des Tokens und (Standard: 8 darunter, ≥ 0). Leer = aus.'
  inp.title = lhTitleActive
  inp.setAttribute(
    'aria-label',
    st.max > 0
      ? `Längerfristige Handlung, ${st.rem} von ${st.max} Aktionen`
      : 'Längerfristige Handlung, inaktiv'
  )
  inp.readOnly = !canEdit
  if (!canEdit) {
    inp.title =
      'Nur Spielleitung oder Besitzer dieses Tokens (Längerfristige Handlung)'
  }

  wrap.append(pieWrap, fraction, inp)

  applyLhVisual(wrap, st.max, st.rem)

  if (
    prev &&
    prev.max > 0 &&
    prev.rem > 0 &&
    st.max === 0 &&
    st.rem === 0
  ) {
    wrap.classList.add('init-lh-cell--completed-flash')
    window.setTimeout(() => {
      wrap.classList.remove('init-lh-cell--completed-flash')
    }, 2200)
  }

  if (canEdit) {
    let dirty = false
    inp.addEventListener('focus', () => {
      dirty = false
      wrap.classList.add('init-lh-cell--input-focus')
    })
    inp.addEventListener('input', () => {
      dirty = true
    })
    inp.addEventListener('blur', () => {
      wrap.classList.remove('init-lh-cell--input-focus')
      if (!dirty) return
      dirty = false
      void commitLhValue(ownerItemId, inp.value)
    })
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        inp.blur()
      }
    })
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      void commitLhValue(ownerItemId, '')
    })
  }
  container.appendChild(wrap)
}

function encodePhaseDrag(ownerId, linkId) {
  return `${PHASE_DRAG_MARK}${ownerId}|${linkId}`
}

function parsePhaseDrag(dragId) {
  if (typeof dragId !== 'string' || !dragId.startsWith(PHASE_DRAG_MARK)) {
    return null
  }
  const rest = dragId.slice(PHASE_DRAG_MARK.length)
  const i = rest.indexOf('|')
  if (i < 0) return null
  return { ownerId: rest.slice(0, i), linkId: rest.slice(i + 1) }
}

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

/** INI-Stützpunkte für vertikales Lerp: Token + Phasen-Zeilen (Ziel-INI). */
function buildDragKnots(listElement, items, tieOrderIds, dragId) {
  const rows = collectSortedParticipants(items, tieOrderIds)
  const rowMap = new Map(rows.map((r) => [r.id, r]))
  const phaseRef = parsePhaseDrag(dragId)
  const knots = []
  for (const el of listElement.querySelectorAll(
    'li.init-row--token-draggable, li.init-row--phase, li.init-row--round-end'
  )) {
    const itemId = el.dataset.itemId
    const linkId = el.dataset.phaseLinkId
    const ownerId = el.dataset.phaseOwnerId
    if (itemId) {
      if (!phaseRef && itemId === dragId) continue
      const row = rowMap.get(itemId)
      const v = parseIniNumber(row?.initiative)
      if (v === null) continue
      const r = el.getBoundingClientRect()
      knots.push({ y: r.top + r.height / 2, v })
    } else if (el.classList.contains('init-row--round-end')) {
      const v = parseIniNumber(el.dataset.dragKnotIni)
      if (v === null) continue
      const r = el.getBoundingClientRect()
      knots.push({ y: r.top + r.height / 2, v })
    } else if (linkId && ownerId) {
      if (
        phaseRef &&
        ownerId === phaseRef.ownerId &&
        linkId === phaseRef.linkId
      ) {
        continue
      }
      const v = parseIniNumber(el.dataset.dragKnotIni)
      if (v === null) continue
      const r = el.getBoundingClientRect()
      knots.push({ y: r.top + r.height / 2, v })
    }
  }
  knots.sort((a, b) => a.y - b.y)
  return knots
}

/** Ganzzahliger Kampfwert-Anteil beim Drag: -99 … 99. */
const DRAG_INI_INT_MIN = -99
const DRAG_INI_INT_MAX = 99

/** Vertikaler Lerp: Oberkante der Liste → INI, Unterkante → (keine extremen Werte aus max(INI) der Tabelle). */
const DRAG_INI_LERP_AT_LIST_TOP = 20
const DRAG_INI_LERP_AT_LIST_BOTTOM = 8
/** Beim Ziehen über die Liste hinaus: Vorschlag nicht höher als dieser Wert. */
const DRAG_INI_LERP_EXTRAPOLATE_CEIL = 26

const INI_DRAG_FLOAT_HINT = 'LOSLASSEN: NEUEN WERT ÜBERNEHMEN'

/** Dwell-Zeit in ms pro ±1 INI, wenn die Maus in der INI-Spalte über/unter der Liste bleibt. */
const INI_LIST_EDGE_DWELL_MS = 240

function getIniColumnBoundsFromList(listUl) {
  const inputs = listUl.querySelectorAll('.init-row-init')
  if (inputs.length === 0) return null
  let left = Infinity
  let right = -Infinity
  for (const el of inputs) {
    const r = el.getBoundingClientRect()
    left = Math.min(left, r.left)
    right = Math.max(right, r.right)
  }
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null
  return { left, right }
}

/**
 * Zusätzliche INI-Schritte, wenn die Maus oberhalb/unterhalb des Float-Fensters bleibt.
 */
function extraIniStepsOutsideFloat(clientY, floatRect, pxPerStep = 26) {
  if (!floatRect || floatRect.width <= 0 || floatRect.height <= 0) return 0
  let s = 0
  if (clientY < floatRect.top) {
    s += Math.ceil((floatRect.top - clientY) / pxPerStep)
  }
  if (clientY > floatRect.bottom) {
    s -= Math.ceil((clientY - floatRect.bottom) / pxPerStep)
  }
  return s
}

function positionAndClampIniFloat(el, leftPx, topPx) {
  el.style.left = `${leftPx}px`
  el.style.top = `${topPx}px`
  el.classList.add('init-drag-ini-float--visible')
  const pad = 8
  for (let i = 0; i < 4; i++) {
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = parseFloat(el.style.left) || 0
    const top = parseFloat(el.style.top) || 0
    let dx = 0
    let dy = 0
    if (r.left < pad) dx = pad - r.left
    if (r.right > vw - pad) dx = vw - pad - r.right
    if (r.top < pad) dy = pad - r.top
    if (r.bottom > vh - pad) dy = vh - pad - r.bottom
    if (dx === 0 && dy === 0) break
    el.style.left = `${left + dx}px`
    el.style.top = `${top + dy}px`
  }
}

/**
 * INI aus Y: Oberkante der sichtbaren Liste → DRAG_INI_LERP_AT_LIST_TOP, Unterkante →
 * DRAG_INI_LERP_AT_LIST_BOTTOM (linear), weiter extrapolieren mit gleicher Steigung,
 * nach oben begrenzt durch DRAG_INI_LERP_EXTRAPOLATE_CEIL.
 */
function lerpIniFromClientY(clientY, knots, listUl) {
  if (knots.length === 0) return null
  const scrollEl = listUl.closest('.initiative-list-scroll')
  const ur =
    scrollEl?.getBoundingClientRect() ?? listUl.getBoundingClientRect()
  const h = Math.max(ur.height, 1e-6)
  const slope =
    (DRAG_INI_LERP_AT_LIST_BOTTOM - DRAG_INI_LERP_AT_LIST_TOP) / h
  const raw = DRAG_INI_LERP_AT_LIST_TOP + (clientY - ur.top) * slope
  return Math.min(DRAG_INI_LERP_EXTRAPOLATE_CEIL, raw)
}

function clampIniContinuous(continuous) {
  if (continuous == null || !Number.isFinite(continuous)) return null
  return continuous
}

/** Konsistentes Runden (ohne JS „half-to-even“ bei .5). */
function roundHalfUp(n) {
  if (!Number.isFinite(n)) return null
  return Math.floor(n + 0.5)
}

function iniBaseIntFromLerp(continuous) {
  return roundHalfUp(continuous)
}

function formatIniStorage(n) {
  if (!Number.isFinite(n)) return '0'
  const x = n
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
    return formatIniStorage(replacementIntPart)
  }
  const newNum = replacementIntPart + (cur - r.intPart)
  return formatIniStorage(newNum)
}

function dragProposesIniChange(proposedStr, curStr, dragRow, dragId, phaseRef) {
  if (phaseRef) {
    if (!dragRow) return false
    const id = phaseRef.linkId
    return (
      initiativeCompareOnlyIni(
        { id, initiative: proposedStr, name: dragRow.name },
        { id, initiative: curStr, name: dragRow.name }
      ) !== 0
    )
  }
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
  listElement,
  wheelNudge,
  listUl
) {
  const rows = collectSortedParticipants(items, tieOrderIds)
  const rowMap = new Map(rows.map((r) => [r.id, r]))
  const phaseRef = parsePhaseDrag(dragId)
  let dragRow
  let curStr
  if (phaseRef) {
    dragRow = rowMap.get(phaseRef.ownerId)
    const it = items.find((i) => i.id === phaseRef.ownerId)
    const links = normalizePhases(
      it?.metadata?.[TRACKER_ITEM_META_KEY]?.phases
    ).links
    const h = hookIniForLink(
      phaseRef.linkId,
      dragRow?.initiative ?? '',
      links
    )
    curStr = formatHookDisplay(h)
  } else {
    dragRow = rowMap.get(dragId)
    curStr = dragRow?.initiative ?? ''
  }
  const knots = buildDragKnots(listElement, items, tieOrderIds, dragId)
  const previewCont = clampIniContinuous(
    lerpIniFromClientY(clientY, knots, listUl)
  )
  let baseInt = iniBaseIntFromLerp(previewCont)
  if (baseInt == null) {
    const r = initiativeRank(curStr)
    baseInt = r ? r.intPart : 0
  }
  let intPart = baseInt + wheelNudge
  intPart = Math.max(DRAG_INI_INT_MIN, Math.min(DRAG_INI_INT_MAX, intPart))
  const proposedStr = composeProposedIniFromDragIntPart(intPart, curStr)
  const willIni = dragProposesIniChange(
    proposedStr,
    curStr,
    dragRow,
    dragId,
    phaseRef
  )
  return { proposedStr, willIni, knots, dragRow, curStr }
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

/** Tausch-Button exakt im Flex-Gap zwischen zwei `li` (Token oder 2.A.-Wurzel). */
function layoutIniSwapBetween(ul, host, overlay) {
  if (!host || !overlay) return
  const hostR = host.getBoundingClientRect()
  for (const btn of overlay.querySelectorAll('.init-row-ini-swap')) {
    const zU = btn.dataset.zaoSwapUpper
    const zL = btn.dataset.zaoSwapLower
    let upperLi
    let lowerLi
    if (zU && zL) {
      upperLi = ul.querySelector(
        `li.init-row--phase-zao[data-zao-swap-key="${CSS.escape(zU)}"]`
      )
      lowerLi = ul.querySelector(
        `li.init-row--phase-zao[data-zao-swap-key="${CSS.escape(zL)}"]`
      )
    } else {
      const upperId = btn.dataset.iniSwapUpper
      const lowerId = btn.dataset.iniSwapLower
      if (!upperId || !lowerId) continue
      upperLi = ul.querySelector(
        `li.init-row--token-draggable[data-item-id="${CSS.escape(upperId)}"]`
      )
      lowerLi = ul.querySelector(
        `li.init-row--token-draggable[data-item-id="${CSS.escape(lowerId)}"]`
      )
    }
    const refCol = upperLi?.querySelector('.init-col-swap')
    const prev = lowerLi?.previousElementSibling
    if (!upperLi || !lowerLi || !refCol || !prev) {
      btn.style.display = 'none'
      continue
    }
    btn.style.display = ''
    const gapTop = prev.getBoundingClientRect().bottom
    const gapBot = lowerLi.getBoundingClientRect().top
    const gapH = Math.max(0, gapBot - gapTop)
    if (gapH < 1) {
      btn.style.display = 'none'
      continue
    }
    const col = refCol.getBoundingClientRect()
    const hitH = 22
    const hitW = Math.max(col.width + 10, 24)
    const midY = (gapTop + gapBot) / 2
    btn.style.position = 'absolute'
    btn.style.left = `${col.left - hostR.left - (hitW - col.width) / 2}px`
    btn.style.width = `${hitW}px`
    btn.style.top = `${midY - hostR.top - hitH / 2}px`
    btn.style.height = `${hitH}px`
  }
}

export function setupInitiativeList(element, { onListChange } = {}) {
  let restoreFocusItemId = null
  let lastItems = []

  const roundIntroBoard = document.querySelector('[data-kampf-round-intro]')
  const roundIntroLabel = document.querySelector('[data-kampf-round-intro-label]')

  /** Enthält `ul` + Swap-Overlay, scrollt gemeinsam mit `.initiative-list-scroll`. */
  const listContentRoot = element.parentElement
  const listScrollEl = listContentRoot?.parentElement ?? null

  const swapOverlay = document.createElement('div')
  swapOverlay.className = 'init-ini-swap-overlay'
  swapOverlay.setAttribute('aria-hidden', 'true')
  if (listContentRoot) listContentRoot.appendChild(swapOverlay)

  const runSwapLayout = () =>
    layoutIniSwapBetween(element, listContentRoot, swapOverlay)

  if (listScrollEl) {
    listScrollEl.addEventListener('scroll', runSwapLayout, { passive: true })
  }

  const iniFloat = document.createElement('div')
  iniFloat.className = 'init-drag-ini-float'
  iniFloat.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iniFloat)

  let rowDragActive = false
  let dragWheelNudge = 0
  /** Letzter effektiver Rad-+Außerhalb-Schritte-Wert (für Drop ohne verpasstes dragover). */
  let lastCombinedWheelNudge = 0
  /** Langsame ±1-Schritte bei Maus in INI-Spalte über/unter der Liste. */
  let dragEdgeSlowSteps = 0
  let dragEdgeAccumMs = 0
  let dragEdgeZone = null
  let dragSessionLastTs = 0
  let activeDragRowId = null
  let lastDragClientX = 0
  let lastDragClientY = 0
  /** Feste X-Position der INI-Vorschau (nur Y folgt dem Zeiger). */
  let dragFloatAnchorX = 0

  let swapLayoutRo = null
  /** Nur bei geändertem Zug/Runde scrollen, nicht bei jedem List-Update. */
  let lastTurnScrollKey = ''

  const hideIniFloat = () => {
    iniFloat.classList.remove('init-drag-ini-float--visible')
    iniFloat.replaceChildren()
  }

  const updateDragSession = (clientX, clientY, dragId) => {
    lastDragClientX = clientX
    lastDragClientY = clientY
    if (!dragId || !rowDragActive) {
      hideIniFloat()
      return
    }

    const now = performance.now()
    if (dragSessionLastTs <= 0) dragSessionLastTs = now
    const dt = Math.min(80, Math.max(0, now - dragSessionLastTs))
    dragSessionLastTs = now

    const iniCol = getIniColumnBoundsFromList(element)
    const listRect =
      listScrollEl?.getBoundingClientRect() ?? element.getBoundingClientRect()
    let iniEdgeZone = null
    if (
      iniCol &&
      clientX >= iniCol.left - 4 &&
      clientX <= iniCol.right + 4
    ) {
      if (clientY > listRect.bottom) iniEdgeZone = 'below'
      else if (clientY < listRect.top) iniEdgeZone = 'above'
    }
    if (iniEdgeZone !== dragEdgeZone) {
      dragEdgeZone = iniEdgeZone
      dragEdgeAccumMs = 0
    }
    if (iniEdgeZone === 'below') {
      dragEdgeAccumMs += dt
      while (dragEdgeAccumMs >= INI_LIST_EDGE_DWELL_MS) {
        dragEdgeSlowSteps--
        dragEdgeAccumMs -= INI_LIST_EDGE_DWELL_MS
      }
    } else if (iniEdgeZone === 'above') {
      dragEdgeAccumMs += dt
      while (dragEdgeAccumMs >= INI_LIST_EDGE_DWELL_MS) {
        dragEdgeSlowSteps++
        dragEdgeAccumMs -= INI_LIST_EDGE_DWELL_MS
      }
    } else {
      dragEdgeAccumMs = 0
    }

    let combinedNudge = dragWheelNudge + dragEdgeSlowSteps
    let proposedStr = ''
    let dragRow = null
    const draggingPhase = Boolean(parsePhaseDrag(dragId))

    for (let iter = 0; iter < 5; iter++) {
      ;({ proposedStr, dragRow } = computeDropProposal(
        clientY,
        dragId,
        lastItems,
        getIniTieOrder(),
        element,
        combinedNudge,
        element
      ))
      if (!dragRow) {
        hideIniFloat()
        lastCombinedWheelNudge = dragWheelNudge + dragEdgeSlowSteps
        return
      }

      iniFloat.replaceChildren()
      const nameEl = document.createElement('div')
      nameEl.className = 'init-drag-ini-float-name'
      nameEl.textContent = dragRow.name || '—'
      nameEl.title = dragRow.name || ''
      const main = document.createElement('div')
      main.className = 'init-drag-ini-float-main'
      main.textContent = draggingPhase
        ? `2.A. INI ${proposedStr}`
        : `INI ${proposedStr}`
      const mode = document.createElement('div')
      mode.className = 'init-drag-ini-float-mode'
      mode.textContent = INI_DRAG_FLOAT_HINT
      iniFloat.append(nameEl, main, mode)

      positionAndClampIniFloat(iniFloat, dragFloatAnchorX, clientY + 12)
      const outside = extraIniStepsOutsideFloat(
        clientY,
        iniFloat.getBoundingClientRect()
      )
      const next = dragWheelNudge + dragEdgeSlowSteps + outside
      if (next === combinedNudge) break
      combinedNudge = next
    }
    lastCombinedWheelNudge = combinedNudge
  }

  const applyTokenDragRelease = (dragId, clientY, wheelAtDrop) => {
    hideIniFloat()
    if (!dragId || !listContentRoot) return
    void OBR.scene.items.getItems().then((fresh) => {
      const phaseRef = parsePhaseDrag(dragId)
      if (phaseRef) {
        const ownerIt = fresh.find((i) => i.id === phaseRef.ownerId)
        if (!canEditSceneItem(ownerIt)) return
      } else {
        const tokenIt = fresh.find((i) => i.id === dragId)
        if (!canEditSceneItem(tokenIt)) return
      }
      const tokenElsFresh = [
        ...element.querySelectorAll('li.init-row:not(.init-row--phase)'),
      ]
      const { proposedStr, willIni } = computeDropProposal(
        clientY,
        dragId,
        fresh,
        getIniTieOrder(),
        element,
        wheelAtDrop,
        element
      )
      if (phaseRef) {
        if (willIni) {
          const ownerRow = collectSortedParticipants(
            fresh,
            getIniTieOrder()
          ).find((r) => r.id === phaseRef.ownerId)
          const ownerIni = ownerRow?.initiative ?? ''
          const it = fresh.find((i) => i.id === phaseRef.ownerId)
          const links = normalizePhases(
            it?.metadata?.[TRACKER_ITEM_META_KEY]?.phases
          ).links
          void tryCommitPhaseTargetIni(
            phaseRef.ownerId,
            phaseRef.linkId,
            proposedStr,
            ownerIni,
            links
          ).then(async (res) => {
            if (!res.ok && res.reason === 'NEG_INI') {
              void removePhaseLink(phaseRef.ownerId, phaseRef.linkId)
            }
          })
        }
        return
      }
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
    updateDragSession(e.clientX, e.clientY, activeDragRowId)
    applyTokenDragRelease(dragId, e.clientY, lastCombinedWheelNudge)
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

  const phaseLinkExistsOnItem = (items, ownerId, linkId) => {
    const it = items.find((i) => i.id === ownerId)
    if (!it) return false
    const p = normalizePhases(
      it.metadata?.[TRACKER_ITEM_META_KEY]?.phases
    )
    return p.links.some((l) => l.id === linkId)
  }

  const reconcileCombat = async (rows, items) => {
    if (!isGmSync()) return
    if (isCombatNavMutationActive()) return
    const c = getCombat()
    if (!c.started) return
    if (c.roundIntroPending) return
    const steps = buildCombatTurnSteps(rows, items, getIniTieOrder())
    if (steps.length === 0) {
      await patchCombat({
        started: false,
        currentItemId: null,
        currentPhaseLinkId: null,
        round: 1,
        ...RESET_ROUND_INTRO,
      })
      return
    }
    if (findCombatStepIndex(steps, c) >= 0) return

    const phaseId = c.currentPhaseLinkId
    const ownerStillThere = rows.some((r) => r.id === c.currentItemId)

    if (phaseId && ownerStillThere) {
      const linkStillInMeta = phaseLinkExistsOnItem(
        items,
        c.currentItemId,
        phaseId
      )
      if (!linkStillInMeta) {
        await patchCombat({
          ...combatPatchForStep(steps[0]),
          round: c.round,
        })
        return
      }
      const cTokenOnly = { ...c, currentPhaseLinkId: null }
      if (findCombatStepIndex(steps, cTokenOnly) >= 0) {
        await patchCombat({ currentPhaseLinkId: null })
        return
      }
    }

    await patchCombat({
      ...combatPatchForStep(steps[0]),
      round: c.round,
    })
  }

  const renderList = (items) => {
    lastItems = items
    const tokenRows = collectSortedParticipants(items, getIniTieOrder())
    setTrackedParticipantIds(tokenRows.map((r) => r.id))
    void reconcileCombat(tokenRows, items)

    const combat = getCombat()
    const introActive = Boolean(combat.started && combat.roundIntroPending)
    if (roundIntroBoard && roundIntroLabel) {
      roundIntroBoard.hidden = !introActive
      if (introActive) {
        const nr =
          typeof combat.roundIntroPrevRound === 'number' &&
          combat.roundIntroPrevRound >= 1
            ? combat.roundIntroPrevRound + 1
            : combat.round + 1
        roundIntroLabel.textContent = `Kampfrunde ${nr}`
      } else {
        roundIntroLabel.textContent = ''
      }
    }
    const activeId =
      combat.started &&
      combat.currentItemId &&
      !combat.roundIntroPending
        ? combat.currentItemId
        : null
    const activePhaseLinkId =
      combat.started && !combat.roundIntroPending
        ? combat.currentPhaseLinkId
        : null

    const merged = buildMergedDisplayRows(tokenRows, items, getIniTieOrder())
    const swapLowerByUpper = new Map()
    for (let ti = 0; ti < tokenRows.length - 1; ti++) {
      const a = tokenRows[ti]
      const b = tokenRows[ti + 1]
      if (initiativeCompareOnlyIni(a, b) === 0) {
        swapLowerByUpper.set(a.id, b.id)
      }
    }

    const zaoSwapLowerByUpper = new Map()
    for (let mi = 0; mi < merged.length - 1; mi++) {
      const u = merged[mi]
      const l = merged[mi + 1]
      if (u.kind !== 'phase' || l.kind !== 'phase') continue
      if (u.link.parentId !== null || l.link.parentId !== null) continue
      if (
        initiativeCompareOnlyIni(
          { initiative: formatIniForSort(u.hookIni), name: '' },
          { initiative: formatIniForSort(l.hookIni), name: '' }
        ) !== 0
      ) {
        continue
      }
      zaoSwapLowerByUpper.set(
        zaoRootKey(u.ownerId, u.link.id),
        zaoRootKey(l.ownerId, l.link.id)
      )
    }

    const frag = document.createDocumentFragment()

    for (const entry of merged) {
      if (entry.kind === 'token') {
        const row = entry.row
        const tokenSceneItem = items.find((i) => i.id === row.id)
        const canEdit = canEditSceneItem(tokenSceneItem)
        const meta = tokenSceneItem?.metadata?.[TRACKER_ITEM_META_KEY]
        const phases = normalizePhases(meta?.phases)

        const li = document.createElement('li')
        li.className = 'init-row init-row--token-draggable'
        if (!canEdit) li.classList.add('init-row--locked')
        if (row.id === activeId && !activePhaseLinkId) {
          li.classList.add('init-row--active')
        }
        li.dataset.itemId = row.id
        li.draggable = false

        const main = document.createElement('div')
        main.className = 'init-row-main'

        const btnCol = document.createElement('div')
        btnCol.className = 'init-col-btn init-col-btn--phase-slot'

        const slotRow = document.createElement('div')
        slotRow.className = 'init-phase-slot-row'
        appendKrCounterPair(slotRow, row.id, meta, canEdit)

        const plusAnchor = document.createElement('div')
        plusAnchor.className = 'init-phase-plus-anchor'

        const rootCount = phases.links.filter((l) => l.parentId === null).length

        const phasePlus = document.createElement('button')
        phasePlus.type = 'button'
        phasePlus.className = 'init-row-phase-plus init-row-phase-plus--in-slot'
        phasePlus.textContent = '+'
        phasePlus.title =
          '2. Aktionsphase (4.1): Klick öffnen / weitere · Rechtsklick entfernt zuletzt angelegte · Shift+Klick schließen'
        phasePlus.setAttribute(
          'aria-label',
          rootCount > 0
            ? actionPhaseRangeLabel(rootCount)
            : '2. Aktionsphase öffnen'
        )
        phasePlus.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!canEdit) return
          void onNamePhasePlusClick(row.id, { shiftKey: e.shiftKey }, row.initiative)
        })
        phasePlus.addEventListener('contextmenu', (e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!canEdit) return
          if (rootCount <= 0) return
          void removeLastZaoRoot(row.id)
        })
        phasePlus.disabled = !canEdit
        if (!canEdit) {
          phasePlus.title =
            'Nur Spielleitung oder Besitzer dieses Tokens (2. Aktionsphase / Phasen)'
        }

        plusAnchor.appendChild(phasePlus)
        if (rootCount > 0) {
          const countEl = document.createElement('span')
          countEl.className = 'init-phase-root-count'
          countEl.textContent = String(rootCount + 1)
          countEl.title = actionPhaseRangeLabel(rootCount)
          countEl.setAttribute('aria-hidden', 'true')
          plusAnchor.appendChild(countEl)
        }

        slotRow.appendChild(plusAnchor)
        btnCol.appendChild(slotRow)

        const gutter = document.createElement('div')
        gutter.className = 'init-phase-gutter init-phase-gutter--empty'
        gutter.setAttribute('aria-hidden', 'true')

        const nameCol = document.createElement('div')
        nameCol.className = 'init-row-name-col'

        const nameEl = document.createElement('span')
        nameEl.className = 'init-row-name'
        if (canEdit) {
          nameEl.classList.add('init-row-name--drag-ini')
          nameEl.draggable = true
          nameEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData(TOKEN_DRAG_MIME, row.id)
            e.dataTransfer.setData('text/plain', row.id)
            e.dataTransfer.effectAllowed = 'move'
            rowDragActive = true
            dragWheelNudge = 0
            dragEdgeSlowSteps = 0
            dragEdgeAccumMs = 0
            dragEdgeZone = null
            dragSessionLastTs = 0
            activeDragRowId = row.id
            lastDragClientX = e.clientX
            lastDragClientY = e.clientY
            const hr =
              listScrollEl?.getBoundingClientRect() ??
              listContentRoot?.getBoundingClientRect()
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
          nameEl.addEventListener('drag', (e) => {
            if (!li.classList.contains('init-row--dragging')) return
            updateDragSession(e.clientX, e.clientY, row.id)
          })
          nameEl.addEventListener('dragend', () => {
            detachGlobalDragListeners()
            rowDragActive = false
            dragWheelNudge = 0
            dragEdgeSlowSteps = 0
            dragEdgeAccumMs = 0
            dragEdgeZone = null
            dragSessionLastTs = 0
            activeDragRowId = null
            li.classList.remove('init-row--dragging')
            hideIniFloat()
          })
        }
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
        input.readOnly = !canEdit
        if (!canEdit) {
          input.title = 'Nur Besitzer dieses Tokens oder Spielleitung'
        }

        const commit = () => {
          if (!canEdit) return
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
      } else if (entry.kind === 'roundEnd') {
        const li = document.createElement('li')
        li.className = 'init-row init-row--round-end'
        li.dataset.dragKnotIni = '0'
        if (activeId === ROUND_END_STEP_ID && !activePhaseLinkId) {
          li.classList.add('init-row--active')
        }
        const bar = document.createElement('div')
        bar.className = 'init-row-round-end-bar'
        const ruleL = document.createElement('span')
        ruleL.className = 'init-row-round-end-rule'
        ruleL.setAttribute('aria-hidden', 'true')
        const label = document.createElement('span')
        label.className = 'init-row-round-end-label'
        label.textContent = `Ende positiver INI Bereich ${combat.round}`
        const ruleR = document.createElement('span')
        ruleR.className = 'init-row-round-end-rule'
        ruleR.setAttribute('aria-hidden', 'true')
        bar.append(ruleL, label, ruleR)
        li.appendChild(bar)
        frag.appendChild(li)
      } else if (entry.kind === 'lhDone') {
        const { ownerId, ownerName, hookIni } = entry
        const ownerSceneItem = items.find((i) => i.id === ownerId)
        const canEdit = canEditSceneItem(ownerSceneItem)
        const ownerTrackerMeta =
          ownerSceneItem?.metadata?.[TRACKER_ITEM_META_KEY]

        const li = document.createElement('li')
        li.className = 'init-row init-row--phase init-row--phase-zao init-row--phase-lhdone'
        if (!canEdit) li.classList.add('init-row--locked')
        li.dataset.phaseOwnerId = ownerId
        li.dataset.phaseLinkId = LH_DONE_STEP_ID
        li.dataset.dragKnotIni = formatHookDisplay(hookIni)

        const main = document.createElement('div')
        main.className = 'init-row-main init-row-main--phase init-row-main--phase-zao'

        const btnCol = document.createElement('div')
        btnCol.className = 'init-col-btn init-col-btn--phase init-col-btn--zao'
        appendKrCounterPair(btnCol, ownerId, ownerTrackerMeta, canEdit)

        const phaseMeta = document.createElement('div')
        phaseMeta.className = 'init-phase-zao-meta'
        const label = document.createElement('span')
        label.className = 'init-phase-zao-ini-label'
        label.textContent = 'LH'
        label.title = 'Längerfristige Handlung abgeschlossen: Zusatz-Aktion'
        const nameEl = document.createElement('span')
        nameEl.className = 'init-row-name'
        nameEl.textContent = ownerName
        nameEl.title = 'Längerfristige Handlung abgeschlossen (Zusatz-Aktion)'
        phaseMeta.append(label, nameEl)

        const iniInput = document.createElement('input')
        iniInput.className = 'init-row-init'
        iniInput.type = 'text'
        iniInput.inputMode = 'decimal'
        iniInput.autocomplete = 'off'
        iniInput.spellcheck = false
        iniInput.value = formatHookDisplay(hookIni)
        iniInput.setAttribute('aria-label', 'Ziel-INI')
        iniInput.readOnly = true
        iniInput.title = 'Automatisch aus L.H.-Abschluss erzeugt'

        const swapSpacer = document.createElement('div')
        swapSpacer.className = 'init-col-swap init-col-swap--phase'
        swapSpacer.setAttribute('aria-hidden', 'true')

        if (
          activeId &&
          activePhaseLinkId &&
          ownerId === activeId &&
          activePhaseLinkId === LH_DONE_STEP_ID
        ) {
          li.classList.add('init-row--active')
        }

        main.append(btnCol, phaseMeta, iniInput, swapSpacer)
        li.appendChild(main)
        frag.appendChild(li)
      } else {
        const { ownerId, ownerName, ownerIniStr, link, hookIni } = entry
        const ownerSceneItem = items.find((i) => i.id === ownerId)
        const canEdit = canEditSceneItem(ownerSceneItem)
        const isZaoRoot = link.parentId === null

        const li = document.createElement('li')
        li.className =
          'init-row init-row--phase' +
          (isZaoRoot ? ' init-row--phase-zao init-row--phase-draggable' : '')
        if (!canEdit) li.classList.add('init-row--locked')
        li.dataset.phaseOwnerId = ownerId
        li.dataset.phaseLinkId = link.id
        li.dataset.dragKnotIni = formatHookDisplay(hookIni)
        if (isZaoRoot) {
          li.dataset.zaoSwapKey = zaoRootKey(ownerId, link.id)
        }

        const main = document.createElement('div')
        main.className =
          'init-row-main init-row-main--phase' +
          (isZaoRoot ? ' init-row-main--phase-zao' : '')

        const btnCol = document.createElement('div')
        btnCol.className = isZaoRoot
          ? 'init-col-btn init-col-btn--phase init-col-btn--zao'
          : 'init-col-btn init-col-btn--phase'

        const ownerTrackerMeta =
          ownerSceneItem?.metadata?.[TRACKER_ITEM_META_KEY]
        appendKrCounterPair(btnCol, ownerId, ownerTrackerMeta, canEdit)

        if (isZaoRoot) {
          const ephemeral = Boolean(link.expiresNextRound)
          const zaoRemove = document.createElement('button')
          zaoRemove.type = 'button'
          zaoRemove.className = 'init-row-zao-remove'
          zaoRemove.textContent = '×'
          zaoRemove.title = '2. Aktionsphase entfernen'
          zaoRemove.setAttribute('aria-label', '2. Aktionsphase entfernen')
          zaoRemove.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!canEdit) return
            void removePhaseLink(ownerId, link.id)
          })
          zaoRemove.disabled = !canEdit
          const padlockBtn = document.createElement('button')
          padlockBtn.type = 'button'
          padlockBtn.className = 'init-row-zao-padlock'
          padlockBtn.innerHTML = zaoPadlockInnerHtml(ephemeral)
          padlockBtn.title = ephemeral
            ? 'Einmalig: wird zu Beginn der nächsten Kampfrunde entfernt'
            : 'Dauerhaft: bleibt in weiteren Kampfrunden erhalten'
          padlockBtn.setAttribute(
            'aria-label',
            ephemeral
              ? 'Einmalig, entfernt sich zu Beginn der nächsten Kampfrunde'
              : 'Dauerhaft über Kampfrunden behalten'
          )
          padlockBtn.setAttribute('aria-pressed', ephemeral ? 'true' : 'false')
          padlockBtn.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!canEdit) return
            void togglePhaseLinkExpiresNextRound(ownerId, link.id)
          })
          padlockBtn.disabled = !canEdit
          btnCol.append(zaoRemove, padlockBtn)
        } else {
          const phaseMinus = document.createElement('button')
          phaseMinus.type = 'button'
          phaseMinus.className = 'init-row-phase-minus'
          phaseMinus.textContent = '−'
          phaseMinus.title = 'Diese INI-Phase entfernen'
          phaseMinus.setAttribute('aria-label', 'INI-Phase entfernen')
          phaseMinus.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!canEdit) return
            void removePhaseLink(ownerId, link.id)
          })
          phaseMinus.disabled = !canEdit

          const chainPlus = document.createElement('button')
          chainPlus.type = 'button'
          chainPlus.className = 'init-row-phase-plus'
          chainPlus.textContent = '+'
          chainPlus.title = 'Weitere INI-Phase anknüpfen'
          chainPlus.setAttribute('aria-label', 'Weitere Phase')
          chainPlus.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!canEdit) return
            void addPhaseChildLink(ownerId, link.id, ownerIniStr)
          })
          chainPlus.disabled = !canEdit

          btnCol.append(phaseMinus, chainPlus)
        }

        const offsetInput = document.createElement('input')
        offsetInput.type = 'text'
        offsetInput.inputMode = 'numeric'
        offsetInput.className = isZaoRoot
          ? 'phase-offset-input phase-offset-input--zao-inline'
          : 'phase-offset-input'
        offsetInput.value = String(link.offset)
        offsetInput.setAttribute('aria-label', 'Phasen später')
        offsetInput.title = canEdit
          ? 'INI-Phasen später (4.1)'
          : 'Nur Besitzer dieses Tokens oder Spielleitung'
        offsetInput.readOnly = !canEdit

        let phaseZaoMeta = null
        let phaseGutter = null
        let phaseNameCol = null
        /** @type {HTMLSpanElement | null} */
        let zaoIniDragNameEl = null
        if (isZaoRoot) {
          phaseZaoMeta = document.createElement('div')
          phaseZaoMeta.className = 'init-phase-zao-meta'
          const iniActLabel = document.createElement('span')
          iniActLabel.className = 'init-phase-zao-ini-label'
          const ownerPhases = normalizePhases(ownerTrackerMeta?.phases)
          const rootLinks = sortedLinksForLayout(ownerPhases.links).filter(
            (l) => l.parentId === null
          )
          const rootIdx = rootLinks.findIndex((l) => l.id === link.id)
          const phaseNum = rootIdx >= 0 ? rootIdx + 2 : 2
          iniActLabel.textContent = `${phaseNum}.A.`
          const nameEl = document.createElement('span')
          nameEl.className = 'init-row-name'
          if (canEdit) {
            nameEl.classList.add('init-row-name--drag-ini')
            nameEl.draggable = true
          }
          nameEl.textContent = ownerName
          nameEl.title = `${phaseNum}. Aktionsphase · ${ownerName}`
          zaoIniDragNameEl = nameEl
          phaseZaoMeta.append(offsetInput, iniActLabel, nameEl)
        } else {
          phaseGutter = document.createElement('div')
          phaseGutter.className = 'init-phase-gutter'
          const spine = document.createElement('div')
          spine.className = 'phase-spine'
          phaseGutter.append(spine, offsetInput)
          phaseNameCol = document.createElement('div')
          phaseNameCol.className = 'init-row-name-col'
          const nameEl = document.createElement('span')
          nameEl.className = 'init-row-name'
          nameEl.textContent = ownerName
          nameEl.title = 'Weitere INI-Phase dieses Charakters'
          phaseNameCol.appendChild(nameEl)
        }

        if (
          activeId &&
          activePhaseLinkId &&
          ownerId === activeId &&
          link.id === activePhaseLinkId
        ) {
          li.classList.add('init-row--active')
        }

        const iniInput = document.createElement('input')
        iniInput.className = 'init-row-init'
        iniInput.type = 'text'
        iniInput.inputMode = 'decimal'
        iniInput.autocomplete = 'off'
        iniInput.spellcheck = false
        iniInput.value = formatHookDisplay(hookIni)
        iniInput.setAttribute('aria-label', 'Ziel-INI')
        iniInput.readOnly = !canEdit
        if (!canEdit) {
          iniInput.title = 'Nur Besitzer dieses Tokens oder Spielleitung'
        }

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
          if (!canEdit) return
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
          offsetInput.value = 'Offset < 0'
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
          if (!canEdit) return
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

        const zaoSwapCol = document.createElement('div')
        zaoSwapCol.className = 'init-col-swap'

        if (isZaoRoot) {
          main.append(btnCol, phaseZaoMeta, iniInput, zaoSwapCol)
        } else {
          main.append(btnCol, phaseGutter, phaseNameCol, iniInput, swapSpacer)
        }
        li.appendChild(main)

        if (isZaoRoot) {
          const phasePayload = encodePhaseDrag(ownerId, link.id)
          li.draggable = false
          if (canEdit && zaoIniDragNameEl) {
            zaoIniDragNameEl.addEventListener('dragstart', (e) => {
              e.dataTransfer.setData(TOKEN_DRAG_MIME, phasePayload)
              e.dataTransfer.setData('text/plain', phasePayload)
              e.dataTransfer.effectAllowed = 'move'
              rowDragActive = true
              dragWheelNudge = 0
              dragEdgeSlowSteps = 0
              dragEdgeAccumMs = 0
              dragEdgeZone = null
              dragSessionLastTs = 0
              activeDragRowId = phasePayload
              lastDragClientX = e.clientX
              lastDragClientY = e.clientY
              const hr =
                listScrollEl?.getBoundingClientRect() ??
                listContentRoot?.getBoundingClientRect()
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
                updateDragSession(e.clientX, e.clientY, phasePayload)
              })
            })
            zaoIniDragNameEl.addEventListener('drag', (e) => {
              if (!li.classList.contains('init-row--dragging')) return
              updateDragSession(e.clientX, e.clientY, phasePayload)
            })
            zaoIniDragNameEl.addEventListener('dragend', () => {
              detachGlobalDragListeners()
              rowDragActive = false
              dragWheelNudge = 0
              dragEdgeSlowSteps = 0
              dragEdgeAccumMs = 0
              dragEdgeZone = null
              dragSessionLastTs = 0
              activeDragRowId = null
              li.classList.remove('init-row--dragging')
              hideIniFloat()
            })
          }
        }

        frag.appendChild(li)
      }
    }

    element.replaceChildren(frag)

    swapOverlay.replaceChildren()
    if (isGmSync()) {
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

      for (const [upperKey, lowerKey] of zaoSwapLowerByUpper.entries()) {
      const swapBtn = document.createElement('button')
      swapBtn.type = 'button'
      swapBtn.className = 'init-row-ini-swap'
      swapBtn.dataset.zaoSwapUpper = upperKey
      swapBtn.dataset.zaoSwapLower = lowerKey
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
          'Reihenfolge mit dem nächsten 2.A.-Eintrag tauschen (gleiche INI)'
      swapBtn.setAttribute(
        'aria-label',
          'Gleiche INI: 2. Aktionsphase mit darunterliegendem 2.A.-Eintrag tauschen'
      )
      swapBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        void OBR.scene.items.getItems().then((fresh) => {
          void swapAdjacentZaoRootKeys(
            upperKey,
            lowerKey,
            fresh,
            getIniTieOrder()
          )
        })
      })
        swapOverlay.appendChild(swapBtn)
      }
    }

    const scrollActiveRowIfTurnChanged = () => {
      const cNow = getCombat()
      if (!cNow.started) {
        lastTurnScrollKey = ''
        return
      }
      const turnKey = `${cNow.roundIntroPending ? 'i' : 'z'}\0${cNow.currentItemId ?? ''}\0${cNow.currentPhaseLinkId ?? ''}\0${cNow.round}`
      if (turnKey === lastTurnScrollKey) return
      lastTurnScrollKey = turnKey
      const active = element.querySelector('li.init-row--active')
      if (!active) return
      active.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      })
    }

    requestAnimationFrame(() => {
      runSwapLayout()
      requestAnimationFrame(() => {
        runSwapLayout()
        scrollActiveRowIfTurnChanged()
      })
    })
    if (typeof ResizeObserver !== 'undefined') {
      if (!swapLayoutRo) {
        swapLayoutRo = new ResizeObserver(runSwapLayout)
        swapLayoutRo.observe(element)
        if (listContentRoot) swapLayoutRo.observe(listContentRoot)
        if (listScrollEl) swapLayoutRo.observe(listScrollEl)
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
  onCombatChange(() => {
    void (async () => {
      const items = await OBR.scene.items.getItems()
      await runLongHandlungAfterCombatUpdate(items, getIniTieOrder())
      const fresh = await OBR.scene.items.getItems()
      renderList(fresh)
    })()
  })
  onIniTieOrderChange(() => renderList(lastItems))
  const offZaoTie = onZaoRootTieOrderChange(() => renderList(lastItems))
  const offPlayer = OBR.player.onChange(() => {
    void OBR.scene.items.getItems().then(renderList)
  })

  return () => {
    offPlayer()
    offZaoTie()
    if (listScrollEl) {
      listScrollEl.removeEventListener('scroll', runSwapLayout, { passive: true })
    }
    swapLayoutRo?.disconnect()
    swapLayoutRo = null
    detachGlobalDragListeners()
    swapOverlay.remove()
    iniFloat.remove()
  }
}
