import OBR from '@owlbear-rodeo/sdk'
import {
  applyHitZoneBundle,
  HIT_ZONE_DEFS,
  readHitZoneBundle,
} from './hitZoneMeta.js'

/** Info-Symbol (Kreis mit i), passend zum Erweiterungs-Stil. */
export const HIT_ZONE_INFO_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
  <circle cx="12" cy="12" r="9.5"/>
  <path d="M12 10v6M12 7.5h.01" stroke-width="2.2"/>
</svg>`.trim()

const RS_TITLE =
  'Rüstungsschutz (RS) dieser Trefferzone nach WdS (Zonenrüstung).'
const W_TITLE =
  'Zonenwunden 0–4 (WdS): Linksklick +1, Rechtsklick −1. 0 = leer, ohne Kennfarbe.'

function parseRsInput(raw) {
  const t = String(raw ?? '').trim()
  if (t === '') return ''
  if (!/^\d{1,2}$/.test(t)) return null
  const n = parseInt(t, 10)
  if (!Number.isFinite(n) || n < 0 || n > 99) return null
  return t
}

function applyWoundVisual(btn, v) {
  btn.classList.remove(
    'hit-zone-w--1',
    'hit-zone-w--2',
    'hit-zone-w--3',
    'hit-zone-w--4'
  )
  if (v >= 1) btn.classList.add(`hit-zone-w--${v}`)
  const dig = btn.querySelector('.hit-zone-w__digit')
  if (dig) dig.textContent = v >= 1 ? String(v) : ''
  btn.setAttribute('aria-label', v === 0 ? 'Wunde: keine (0)' : `Wunde: ${v}`)
}

/**
 * @param {{ trackerMetaKey: string }} opts
 */
export function createHitZoneOverlay(opts) {
  const { trackerMetaKey } = opts

  let openItemId = null
  let openCanEdit = false
  let focusReturnEl = null

  const zoneRefs = new Map()

  const backdrop = document.createElement('div')
  backdrop.className =
    'kampf-settings-backdrop kampf-hit-zone-backdrop'
  backdrop.hidden = true
  backdrop.setAttribute('aria-hidden', 'true')
  backdrop.style.display = 'none'

  const panel = document.createElement('div')
  panel.className = 'kampf-settings-panel kampf-hit-zone-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-labelledby', 'kampf-hit-zone-title')

  const title = document.createElement('h2')
  title.className = 'kampf-settings-panel__title'
  title.id = 'kampf-hit-zone-title'
  title.textContent = 'Trefferzonen'

  const hint = document.createElement('p')
  hint.className = 'kampf-settings-panel__hint'
  hint.textContent =
    'Optional WdS: Trefferzonen und Zonenrüstung. W20-Bereiche für Fußkampf (Zufall).'

  const layout = document.createElement('div')
  layout.className = 'kampf-hit-zone-layout'

  const figWrap = document.createElement('div')
  figWrap.className = 'kampf-hit-zone-figure-wrap'

  const svgNs = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('viewBox', '0 0 120 200')
  svg.setAttribute('class', 'kampf-hit-zone-svg')
  svg.setAttribute('aria-hidden', 'true')

  const g = document.createElementNS(svgNs, 'g')
  g.setAttribute('fill', 'rgba(139, 105, 20, 0.08)')
  g.setAttribute('stroke', 'rgba(201, 162, 39, 0.55)')
  g.setAttribute('stroke-width', '1.2')

  const head = document.createElementNS(svgNs, 'ellipse')
  head.setAttribute('cx', '60')
  head.setAttribute('cy', '22')
  head.setAttribute('rx', '13')
  head.setAttribute('ry', '15')

  const torso = document.createElementNS(svgNs, 'path')
  torso.setAttribute(
    'd',
    'M 60 38 L 78 42 L 82 95 L 75 118 L 45 118 L 38 95 L 42 42 Z'
  )

  const pelvis = document.createElementNS(svgNs, 'path')
  pelvis.setAttribute(
    'd',
    'M 45 118 L 75 118 L 72 138 L 48 138 Z'
  )

  const armL = document.createElementNS(svgNs, 'path')
  armL.setAttribute(
    'd',
    'M 42 44 L 22 52 L 18 88 L 26 90 L 32 58 L 44 50 Z'
  )

  const armR = document.createElementNS(svgNs, 'path')
  armR.setAttribute(
    'd',
    'M 78 44 L 98 52 L 102 88 L 94 90 L 88 58 L 76 50 Z'
  )

  const legL = document.createElementNS(svgNs, 'path')
  legL.setAttribute(
    'd',
    'M 48 138 L 42 195 L 52 198 L 58 142 Z'
  )

  const legR = document.createElementNS(svgNs, 'path')
  legR.setAttribute(
    'd',
    'M 72 138 L 78 195 L 68 198 L 62 142 Z'
  )

  g.append(head, torso, pelvis, armL, armR, legL, legR)
  svg.appendChild(g)
  figWrap.appendChild(svg)

  const anchors = document.createElement('div')
  anchors.className = 'kampf-hit-zone-anchors'

  for (const z of HIT_ZONE_DEFS) {
    const w = document.createElement('div')
    w.className = 'kampf-hit-zone-widget'
    Object.assign(w.style, z.pos)

    const w20 = document.createElement('div')
    w20.className = 'kampf-hit-zone-w20'
    w20.textContent = z.w20
    w20.title = z.w20Title

    const pair = document.createElement('div')
    pair.className = 'kampf-hit-zone-pair'

    const cellRs = document.createElement('div')
    cellRs.className = 'kampf-hit-zone-cell'
    const labRs = document.createElement('span')
    labRs.className = 'kampf-hit-zone-lbl'
    labRs.textContent = 'RS'
    labRs.title = RS_TITLE
    const inpRs = document.createElement('input')
    inpRs.type = 'text'
    inpRs.className = 'kampf-hit-zone-rs'
    inpRs.maxLength = 2
    inpRs.inputMode = 'numeric'
    inpRs.autocomplete = 'off'
    inpRs.spellcheck = false
    inpRs.title = RS_TITLE
    inpRs.setAttribute('aria-label', `${z.short}: RS`)
    cellRs.append(labRs, inpRs)

    const cellW = document.createElement('div')
    cellW.className = 'kampf-hit-zone-cell'
    const labW = document.createElement('span')
    labW.className = 'kampf-hit-zone-lbl'
    labW.textContent = 'W'
    labW.title = W_TITLE
    const btnW = document.createElement('button')
    btnW.type = 'button'
    btnW.className = 'kampf-hit-zone-w'
    btnW.title = W_TITLE
    const digit = document.createElement('span')
    digit.className = 'hit-zone-w__digit'
    digit.setAttribute('aria-hidden', 'true')
    btnW.appendChild(digit)
    applyWoundVisual(btnW, 0)
    cellW.append(labW, btnW)

    pair.append(cellRs, cellW)
    w.append(w20, pair)
    anchors.appendChild(w)

    zoneRefs.set(z.id, { inpRs, btnW, z })
  }

  figWrap.appendChild(anchors)

  const notesCol = document.createElement('div')
  notesCol.className = 'kampf-hit-zone-notes'
  const notesLab = document.createElement('label')
  notesLab.className = 'kampf-hit-zone-notes__label'
  notesLab.htmlFor = 'kampf-hit-zone-notiz'
  notesLab.textContent = 'Kampfnotizen'
  notesLab.title = 'Freitext zu diesem Token im Kampf.'
  const notesTa = document.createElement('textarea')
  notesTa.id = 'kampf-hit-zone-notiz'
  notesTa.className = 'kampf-hit-zone-notes__ta'
  notesTa.rows = 14
  notesTa.spellcheck = false
  notesTa.title = 'Kampfnotizen'
  notesCol.append(notesLab, notesTa)

  layout.append(figWrap, notesCol)

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'btn kampf-settings-panel__close'
  closeBtn.textContent = 'Schließen'
  closeBtn.dataset.kampfHitZoneClose = ''

  panel.append(title, hint, layout, closeBtn)
  backdrop.appendChild(panel)
  document.body.appendChild(backdrop)

  const gather = () => {
    const zones = {}
    for (const [id, ref] of zoneRefs.entries()) {
      zones[id] = {
        rs: ref.inpRs.value,
        w: Number(ref.btnW.dataset.wound || '0') || 0,
      }
    }
    return {
      notiz: notesTa.value,
      zones,
    }
  }

  const commit = () => {
    if (!openItemId || !openCanEdit) return
    void applyHitZoneBundle(openItemId, gather(), trackerMetaKey)
  }

  const syncFromMeta = (meta) => {
    const b = readHitZoneBundle(meta, trackerMetaKey)
    notesTa.value = b.notiz
    for (const z of HIT_ZONE_DEFS) {
      const ref = zoneRefs.get(z.id)
      if (!ref) continue
      ref.inpRs.value = b.zones[z.id]?.rs ?? ''
      const w = b.zones[z.id]?.w ?? 0
      ref.btnW.dataset.wound = String(w)
      applyWoundVisual(ref.btnW, w)
    }
  }

  for (const [, ref] of zoneRefs.entries()) {
    const { inpRs, btnW } = ref
    inpRs.addEventListener('blur', () => {
      if (!openItemId || !openCanEdit) return
      const parsed = parseRsInput(inpRs.value)
      if (parsed === null) {
        void OBR.scene.items.getItems().then((items) => {
          const it = items.find((i) => i.id === openItemId)
          const b = readHitZoneBundle(
            it?.metadata?.[trackerMetaKey],
            trackerMetaKey
          )
          for (const z of HIT_ZONE_DEFS) {
            const r = zoneRefs.get(z.id)
            if (r?.inpRs === inpRs) {
              inpRs.value = b.zones[z.id]?.rs ?? ''
              break
            }
          }
        })
        return
      }
      inpRs.value = parsed
      commit()
    })

    btnW.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!openCanEdit) return
      let v = Number(btnW.dataset.wound || '0') || 0
      v = Math.min(4, v + 1)
      btnW.dataset.wound = String(v)
      applyWoundVisual(btnW, v)
      commit()
    })
    btnW.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!openCanEdit) return
      let v = Number(btnW.dataset.wound || '0') || 0
      v = Math.max(0, v - 1)
      btnW.dataset.wound = String(v)
      applyWoundVisual(btnW, v)
      commit()
    })
  }

  notesTa.addEventListener('blur', () => {
    commit()
  })

  const close = () => {
    backdrop.hidden = true
    backdrop.style.display = 'none'
    backdrop.setAttribute('aria-hidden', 'true')
    openItemId = null
    openCanEdit = false
    focusReturnEl?.focus()
    focusReturnEl = null
  }

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault()
    close()
  })

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })

  const onDocKey = (e) => {
    if (e.key === 'Escape' && !backdrop.hidden) {
      e.preventDefault()
      close()
    }
  }
  document.addEventListener('keydown', onDocKey)

  const open = (itemId, displayName, meta, canEdit) => {
    openItemId = itemId
    openCanEdit = canEdit
    title.textContent = `Trefferzonen: ${displayName}`
    syncFromMeta(meta)
    for (const [, ref] of zoneRefs.entries()) {
      ref.inpRs.disabled = !canEdit
      ref.btnW.disabled = !canEdit
    }
    notesTa.readOnly = !canEdit
    backdrop.hidden = false
    backdrop.style.display = 'flex'
    backdrop.setAttribute('aria-hidden', 'false')
    closeBtn.focus()
  }

  const destroy = () => {
    document.removeEventListener('keydown', onDocKey)
    backdrop.remove()
  }

  return {
    open,
    close,
    syncFromItems(items) {
      if (!openItemId || backdrop.hidden) return
      const it = items.find((i) => i.id === openItemId)
      if (!it) {
        close()
        return
      }
      syncFromMeta(it.metadata?.[trackerMetaKey])
    },
    setFocusReturn(el) {
      focusReturnEl = el
    },
    getOpenItemId: () => openItemId,
    destroy,
  }
}
