import OBR from '@owlbear-rodeo/sdk'
import { compareInitiativeRows } from './initiativeSort.js'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const DEFAULT_PHASE_OFFSET = 8

export function defaultPhases() {
  return { links: [], rowPanelOpen: false }
}

function clampStoredOffset(o) {
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
      offset: clampStoredOffset(l.offset),
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

/** Basis-INI für das Offset-Feld dieser Verknüpfung (Helden-INI oder Ziel-INI der Eltern-Verknüpfung). */
export function baseIniBeforeLink(linkId, ownerIniStr, links) {
  const map = buildLinkMap(links)
  const link = map.get(linkId)
  if (!link) return null
  if (link.parentId === null) return iniNumeric(ownerIniStr)
  return hookIniForLink(link.parentId, ownerIniStr, links)
}

/** Ziel-INI: Basis minus Offset. */
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

function collectSubtreeIds(links, rootId) {
  const out = new Set([rootId])
  let added = true
  while (added) {
    added = false
    for (const l of links) {
      if (l.parentId && out.has(l.parentId) && !out.has(l.id)) {
        out.add(l.id)
        added = true
      }
    }
  }
  return out
}

function uuid() {
  return crypto.randomUUID()
}

function safeDefaultOffset(ownerIniStr) {
  const b = iniNumeric(ownerIniStr)
  if (b === null) return DEFAULT_PHASE_OFFSET
  return Math.min(DEFAULT_PHASE_OFFSET, Math.max(0, Math.floor(b)))
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
 * Klick: Panel öffnen (erster Link) bzw. weitere Wurzel.
 * Shift+Klick: Panel schließen.
 */
export function onNamePhasePlusClick(itemId, { shiftKey }, ownerIniStr) {
  return patchItemPhases(itemId, (p) => {
    if (shiftKey) {
      return { ...p, rowPanelOpen: false }
    }
    if (!p.rowPanelOpen) {
      const nextLinks =
        p.links.length === 0
          ? [
              {
                id: uuid(),
                parentId: null,
                offset: safeDefaultOffset(ownerIniStr),
              },
            ]
          : p.links
      return { ...p, rowPanelOpen: true, links: nextLinks }
    }
    return {
      ...p,
      links: [
        ...p.links,
        {
          id: uuid(),
          parentId: null,
          offset: safeDefaultOffset(ownerIniStr),
        },
      ],
    }
  })
}

export function addPhaseChildLink(itemId, parentLinkId, ownerIniStr) {
  return patchItemPhases(itemId, (p) => {
    const parentHook = hookIniForLink(parentLinkId, ownerIniStr, p.links)
    const baseStr =
      parentHook === null ? ownerIniStr : formatIniForSort(parentHook)
    return {
      ...p,
      links: [
        ...p.links,
        {
          id: uuid(),
          parentId: parentLinkId,
          offset: safeDefaultOffset(baseStr),
        },
      ],
    }
  })
}

export function removePhaseLink(itemId, linkId) {
  return patchItemPhases(itemId, (p) => {
    const cut = collectSubtreeIds(p.links, linkId)
    return {
      ...p,
      links: p.links.filter((l) => !cut.has(l.id)),
    }
  })
}

/** Entfernt die zuletzt angelegte Wurzel-Verknüpfung (inkl. Kinder). */
export function removeLastRootPhase(itemId) {
  return patchItemPhases(itemId, (p) => {
    const roots = p.links.filter((l) => l.parentId === null)
    if (roots.length === 0) return p
    const victim = roots[roots.length - 1]
    const cut = collectSubtreeIds(p.links, victim.id)
    return {
      ...p,
      links: p.links.filter((l) => !cut.has(l.id)),
    }
  })
}

function parseOffsetCommit(s) {
  const n = Number(String(s ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

/**
 * Offset setzen. hookIni muss ≥ 0 sein, sonst { ok:false }.
 */
export function tryCommitPhaseOffset(itemId, linkId, offsetStr, ownerIniStr, links) {
  const link = links.find((l) => l.id === linkId)
  if (!link) return Promise.resolve({ ok: false })

  const base = baseIniBeforeLink(linkId, ownerIniStr, links)
  if (base === null) return Promise.resolve({ ok: false })

  let off = parseOffsetCommit(offsetStr)
  if (off === null) off = clampStoredOffset(link.offset)
  off = Math.max(0, off)

  const hook = base - off
  if (hook < 0) return Promise.resolve({ ok: false, reason: 'NEG_INI' })

  const stored = Math.min(99, off)
  return patchItemPhases(itemId, (p) => ({
    ...p,
    links: p.links.map((l) => (l.id === linkId ? { ...l, offset: stored } : l)),
  })).then(() => ({ ok: true }))
}

/**
 * Ziel-INI aus dem großen INI-Feld; setzt Offset = Basis − Ziel.
 */
export function tryCommitPhaseTargetIni(itemId, linkId, iniStr, ownerIniStr, links) {
  const link = links.find((l) => l.id === linkId)
  if (!link) return Promise.resolve({ ok: false })

  const base = baseIniBeforeLink(linkId, ownerIniStr, links)
  if (base === null) return Promise.resolve({ ok: false })

  const target = iniNumeric(iniStr)
  if (target === null) return Promise.resolve({ ok: false })

  if (target < 0) return Promise.resolve({ ok: false, reason: 'NEG_INI' })

  const off = Math.round(base - target)
  if (off < 0 || base - off < 0)
    return Promise.resolve({ ok: false, reason: 'NEG_INI' })

  const stored = Math.min(99, Math.max(0, off))
  return patchItemPhases(itemId, (p) => ({
    ...p,
    links: p.links.map((l) => (l.id === linkId ? { ...l, offset: stored } : l)),
  })).then(() => ({ ok: true }))
}

export function formatIniForSort(n) {
  if (n === null) return ''
  if (Number.isInteger(n)) return String(n)
  return String(n)
}

/**
 * Token-Zeilen + Phasen-Zeilen, nach INI sortiert (wie Kampfliste).
 */
export function buildMergedDisplayRows(tokenRows, items) {
  const metaOf = (id) => {
    const it = items.find((i) => i.id === id)
    return it?.metadata?.[TRACKER_ITEM_META_KEY]
  }

  const entries = []

  for (const row of tokenRows) {
    entries.push({ kind: 'token', row })
    const meta = metaOf(row.id)
    const phases = normalizePhases(meta?.phases)
    if (!phases.rowPanelOpen || phases.links.length === 0) continue

    for (const link of sortedLinksForLayout(phases.links)) {
      const hook = hookIniForLink(link.id, row.initiative, phases.links)
      if (hook === null || hook < 0) continue
      entries.push({
        kind: 'phase',
        ownerId: row.id,
        ownerName: row.name,
        ownerIniStr: row.initiative,
        link,
        hookIni: hook,
      })
    }
  }

  entries.sort((a, b) => {
    const sa =
      a.kind === 'token'
        ? { initiative: a.row.initiative, name: a.row.name }
        : {
            initiative: formatIniForSort(a.hookIni),
            name: `${a.ownerName}\u0000${a.link.id}`,
          }
    const sb =
      b.kind === 'token'
        ? { initiative: b.row.initiative, name: b.row.name }
        : {
            initiative: formatIniForSort(b.hookIni),
            name: `${b.ownerName}\u0000${b.link.id}`,
          }
    return compareInitiativeRows(sa, sb)
  })

  return entries
}
