import OBR from '@owlbear-rodeo/sdk'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const DEFAULT_PHASE_OFFSET = 8

export function defaultPhases() {
  return { links: [], rowPanelOpen: false }
}

function clampOffset(o) {
  const n = Number(String(o ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return DEFAULT_PHASE_OFFSET
  return Math.max(0, Math.min(99, Math.round(n)))
}

export function normalizePhases(raw) {
  const d = defaultPhases()
  if (!raw || typeof raw !== 'object') return d
  const linksIn = Array.isArray(raw.links) ? raw.links : []
  const ids = new Set()
  const links = []
  for (const l of linksIn) {
    if (!l || typeof l !== 'object' || typeof l.id !== 'string') continue
    ids.add(l.id)
    links.push({
      id: l.id,
      parentId: typeof l.parentId === 'string' ? l.parentId : null,
      offset: clampOffset(l.offset),
    })
  }
  const valid = new Set(
    links.filter((l) => l.parentId === null || ids.has(l.parentId)).map((l) => l.id)
  )
  const pruned = links.filter(
    (l) => valid.has(l.id) && (l.parentId === null || valid.has(l.parentId))
  )
  return {
    links: pruned,
    rowPanelOpen: Boolean(raw.rowPanelOpen),
  }
}

export function iniNumeric(s) {
  const n = Number(String(s ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function buildLinkMap(links) {
  return new Map(links.map((l) => [l.id, l]))
}

/** Ziel-INI der Verknüpfung: Basis (Helden-INI bzw. Eltern-Hook) minus Offset. */
export function hookIniForLink(linkId, ownerIniStr, links) {
  const map = buildLinkMap(links)
  function hookFor(id) {
    const link = map.get(id)
    if (!link) return null
    const base =
      link.parentId === null
        ? iniNumeric(ownerIniStr)
        : hookFor(link.parentId)
    if (base === null) return null
    const off = Number(link.offset)
    const o = Number.isFinite(off) ? off : DEFAULT_PHASE_OFFSET
    return base - o
  }
  return hookFor(linkId)
}

export function findRowForHookIni(rows, hookIni) {
  if (hookIni === null || !Number.isFinite(hookIni)) return null
  const tol = 1e-6
  for (const row of rows) {
    const n = iniNumeric(row.initiative)
    if (n !== null && Math.abs(n - hookIni) < tol) return row
  }
  return null
}

function linkDepth(linkId, map) {
  let d = 0
  let cur = map.get(linkId)
  while (cur?.parentId) {
    d += 1
    cur = map.get(cur.parentId)
  }
  return d
}

export function sortedLinksForLayout(links) {
  const map = buildLinkMap(links)
  return [...links].sort(
    (a, b) => linkDepth(a.id, map) - linkDepth(b.id, map) || a.id.localeCompare(b.id)
  )
}

function uuid() {
  return crypto.randomUUID()
}

export function patchItemPhases(itemId, updater) {
  return OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const d of drafts) {
      const meta = d.metadata[TRACKER_ITEM_META_KEY]
      if (!meta) continue
      const prev = normalizePhases(meta.phases)
      meta.phases = normalizePhases(updater(prev))
    }
  })
}

/**
 * Klick: Panel öffnen (erster Link mit 8) bzw. weitere Wurzel-Verknüpfung.
 * Shift+Klick: Panel schließen (Links bleiben erhalten).
 */
export function onNamePhasePlusClick(itemId, { shiftKey }) {
  return patchItemPhases(itemId, (p) => {
    if (shiftKey) {
      return { ...p, rowPanelOpen: false }
    }
    if (!p.rowPanelOpen) {
      const nextLinks =
        p.links.length === 0
          ? [{ id: uuid(), parentId: null, offset: DEFAULT_PHASE_OFFSET }]
          : p.links
      return { ...p, rowPanelOpen: true, links: nextLinks }
    }
    return {
      ...p,
      links: [
        ...p.links,
        { id: uuid(), parentId: null, offset: DEFAULT_PHASE_OFFSET },
      ],
    }
  })
}

export function addPhaseChildLink(itemId, parentLinkId) {
  return patchItemPhases(itemId, (p) => ({
    ...p,
    links: [
      ...p.links,
      { id: uuid(), parentId: parentLinkId, offset: DEFAULT_PHASE_OFFSET },
    ],
  }))
}

export function updatePhaseLinkOffset(itemId, linkId, offsetStr) {
  const off = clampOffset(offsetStr)
  return patchItemPhases(itemId, (p) => ({
    ...p,
    links: p.links.map((l) => (l.id === linkId ? { ...l, offset: off } : l)),
  }))
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} overlay
 * @param {HTMLElement} ul
 * @param {Array<{id:string,initiative:string,name:string}>} rows
 * @param {Map<string, object>} itemMetaById metadata[TRACKER_ITEM_META_KEY] per item
 */
export function layoutPhaseOverlay(host, overlay, ul, rows, itemMetaById) {
  overlay.replaceChildren()
  overlay.style.pointerEvents = 'none'

  const hostR = host.getBoundingClientRect()
  if (hostR.width <= 0 || hostR.height <= 0) return

  const relRect = (el) => {
    const r = el.getBoundingClientRect()
    return {
      left: r.left - hostR.left,
      top: r.top - hostR.top,
      right: r.right - hostR.left,
      bottom: r.bottom - hostR.top,
      width: r.width,
      height: r.height,
    }
  }

  const liForItem = (itemId) => ul.querySelector(`li[data-item-id="${CSS.escape(itemId)}"]`)

  for (const row of rows) {
    const meta = itemMetaById.get(row.id)
    if (!meta) continue
    const phases = normalizePhases(meta.phases)
    if (!phases.rowPanelOpen || phases.links.length === 0) continue

    const ownerLi = liForItem(row.id)
    if (!ownerLi) continue

    const rootAnchor = ownerLi.querySelector('.phase-root-anchor')
    if (!rootAnchor) continue

    const ownerIniStr = row.initiative
    const ordered = sortedLinksForLayout(phases.links)
    const rootLinks = phases.links.filter((l) => l.parentId === null)

    for (const link of ordered) {
      const hookIni = hookIniForLink(link.id, ownerIniStr, phases.links)
      const targetRow = findRowForHookIni(rows, hookIni)
      const targetLi = targetRow ? liForItem(targetRow.id) : null

      let ax
      let ayStart

      if (link.parentId === null) {
        const ar = relRect(rootAnchor)
        const ri = rootLinks.findIndex((r) => r.id === link.id)
        const spread = Math.max(0, ri) * 16
        ax = ar.left + spread
        ayStart = ar.top
      } else {
        const hookEl = overlay.querySelector(`[data-phase-hook="${CSS.escape(link.parentId)}"]`)
        if (!hookEl) continue
        const hr = relRect(hookEl)
        ax = hr.left + hr.width / 2
        ayStart = hr.top + hr.height / 2
      }

      let ty
      let iniRight

      if (targetLi) {
        const tr = relRect(targetLi)
        ty = tr.top + tr.height / 2
        const iniEl = targetLi.querySelector('.init-row-init')
        if (iniEl) {
          const ir = relRect(iniEl)
          iniRight = ir.right
        } else {
          iniRight = tr.right
        }
      } else {
        ty = ayStart + Math.max(36, Math.abs((hookIni ?? 0) % 7) * 4)
        iniRight = ax + 52
      }

      const vTop = Math.min(ayStart, ty)
      const vHeight = Math.max(2, Math.abs(ty - ayStart))
      const vLeft = ax

      const vBar = document.createElement('div')
      vBar.className = 'phase-line-v'
      vBar.style.left = `${vLeft}px`
      vBar.style.top = `${vTop}px`
      vBar.style.height = `${vHeight}px`
      overlay.appendChild(vBar)

      const hStart = Math.min(ax, iniRight)
      const hWidth = Math.max(2, Math.abs(iniRight - ax))
      const hBar = document.createElement('div')
      hBar.className = 'phase-line-h'
      hBar.style.left = `${hStart}px`
      hBar.style.top = `${ty - 1}px`
      hBar.style.width = `${hWidth}px`
      overlay.appendChild(hBar)

      const inputTop = vTop + vHeight / 2 - 11
      const input = document.createElement('input')
      input.type = 'text'
      input.inputMode = 'numeric'
      input.className = 'phase-offset-input'
      input.value = String(link.offset)
      input.setAttribute('aria-label', 'INI-Phasen später')
      input.dataset.phaseLinkId = link.id
      input.dataset.ownerItemId = row.id
      input.style.left = `${vLeft + 5}px`
      input.style.top = `${inputTop}px`
      input.style.pointerEvents = 'auto'
      overlay.appendChild(input)

      const hookX = iniRight - 2
      const hook = document.createElement('span')
      hook.className = 'phase-hook-anchor'
      hook.dataset.phaseHook = link.id
      hook.style.left = `${hookX - 6}px`
      hook.style.top = `${ty - 6}px`
      overlay.appendChild(hook)

      const addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.className = 'phase-line-plus'
      addBtn.textContent = '+'
      addBtn.title = 'Weitere INI-Phase'
      addBtn.style.left = `${hookX - 8}px`
      addBtn.style.top = `${ty - 10}px`
      addBtn.style.pointerEvents = 'auto'
      addBtn.dataset.ownerItemId = row.id
      addBtn.dataset.parentLinkId = link.id
      overlay.appendChild(addBtn)

      if (!targetLi) {
        const miss = document.createElement('span')
        miss.className = 'phase-miss-label'
        miss.textContent =
          hookIni === null
            ? '—'
            : `INI ${Number.isInteger(hookIni) ? hookIni : hookIni.toFixed(1)}?`
        miss.style.left = `${hStart + hWidth + 4}px`
        miss.style.top = `${ty - 9}px`
        overlay.appendChild(miss)
      }
    }
  }
}

export function bindPhaseOverlayHandlers(overlay) {
  const onBlur = (e) => {
    const t = e.target
    if (!(t instanceof HTMLInputElement) || !t.classList.contains('phase-offset-input')) return
    const itemId = t.dataset.ownerItemId
    const linkId = t.dataset.phaseLinkId
    if (!itemId || !linkId) return
    void updatePhaseLinkOffset(itemId, linkId, t.value)
  }

  const onClick = (e) => {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    const btn = t.closest('.phase-line-plus')
    if (!btn) return
    const itemId = btn.dataset.ownerItemId
    const parentLinkId = btn.dataset.parentLinkId
    if (!itemId || !parentLinkId) return
    e.preventDefault()
    e.stopPropagation()
    void addPhaseChildLink(itemId, parentLinkId)
  }

  overlay.addEventListener('blur', onBlur, true)
  overlay.addEventListener('click', onClick)
  return () => {
    overlay.removeEventListener('blur', onBlur, true)
    overlay.removeEventListener('click', onClick)
  }
}
