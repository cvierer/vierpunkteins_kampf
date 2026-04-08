import OBR from '@owlbear-rodeo/sdk'
import { isGmSync } from './editAccess.js'
import {
  compareInitiativeRows,
  compareInitiativeRowsWithTieOrder,
} from './initiativeSort.js'
import {
  collectSortedParticipants,
  TRACKER_ID,
  TRACKER_ITEM_META_KEY,
} from './participants.js'

const ZAO_ROOT_TIE_ORDER_KEY = `${TRACKER_ID}/zaoRootTieOrder`

/** Synthetischer Zug „Ende der Kampfrunde“ (INI intern 0); kein Szenen-Token. */
export const ROUND_END_STEP_ID = `${TRACKER_ID}/roundEndStep`
export const LH_DONE_STEP_ID = `${TRACKER_ID}/lhDoneStep`
const LH_DONE_ROUND = 'lhDoneRound'
const LH_DONE_INI = 'lhDoneIni'

/** @type {Record<string, string[]>} INI-Schlüssel (formatIniForSort) → Reihenfolge der 2.A.-Wurzeln ownerId:linkId */
let zaoRootTieOrderByIniCache = {}

const zaoOrderListeners = new Set()

function notifyZaoRootTieOrder() {
  for (const fn of zaoOrderListeners) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
}

export function getZaoRootTieOrderByIni() {
  return zaoRootTieOrderByIniCache
}

export function onZaoRootTieOrderChange(fn) {
  zaoOrderListeners.add(fn)
  return () => zaoOrderListeners.delete(fn)
}

function normalizeZaoOrderRoom(raw) {
  /** @type {Record<string, string[]>} */
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [iniK, arr] of Object.entries(raw)) {
    if (typeof iniK !== 'string') continue
    if (!Array.isArray(arr)) continue
    out[iniK] = arr.filter((k) => typeof k === 'string')
  }
  return out
}

export async function pullZaoRootTieOrderFromRoom() {
  const meta = await OBR.room.getMetadata()
  const next = normalizeZaoOrderRoom(meta[ZAO_ROOT_TIE_ORDER_KEY])
  const prevKeys = JSON.stringify(zaoRootTieOrderByIniCache)
  const nextKeys = JSON.stringify(next)
  if (prevKeys === nextKeys) return
  zaoRootTieOrderByIniCache = next
  notifyZaoRootTieOrder()
}

export function zaoRootKey(ownerId, linkId) {
  return `${ownerId}:${linkId}`
}

/**
 * Zwei direkt untereinander stehende 2.A.-Wurzeln mit gleicher Ziel-INI tauschen (Kampflisten-Reihenfolge).
 */
export async function swapAdjacentZaoRootKeys(
  keyUpper,
  keyLower,
  items,
  tieOrderIds
) {
  if (!isGmSync()) return
  const tokenRows = collectSortedParticipants(items, tieOrderIds)
  const merged = buildMergedDisplayRows(tokenRows, items, tieOrderIds)
  const zaoIdx = (k) =>
    merged.findIndex(
      (e) =>
        e.kind === 'phase' &&
        e.link.parentId === null &&
        zaoRootKey(e.ownerId, e.link.id) === k
    )
  const iu = zaoIdx(keyUpper)
  const il = zaoIdx(keyLower)
  if (iu < 0 || il < 0 || il !== iu + 1) return
  const eu = merged[iu]
  const el = merged[il]
  if (eu.kind !== 'phase' || el.kind !== 'phase') return
  if (formatIniForSort(eu.hookIni) !== formatIniForSort(el.hookIni)) return
  const iniK = formatIniForSort(eu.hookIni)
  const keysInMerged = merged
    .filter(
      (e) =>
        e.kind === 'phase' &&
        e.link.parentId === null &&
        formatIniForSort(e.hookIni) === iniK
    )
    .map((e) => zaoRootKey(e.ownerId, e.link.id))
  let bucket = [...(zaoRootTieOrderByIniCache[iniK] ?? [])].filter((k) =>
    keysInMerged.includes(k)
  )
  if (bucket.length === 0) bucket = [...keysInMerged]
  const posU = bucket.indexOf(keyUpper)
  const posL = bucket.indexOf(keyLower)
  if (posU !== posL - 1) return
  ;[bucket[posU], bucket[posL]] = [bucket[posL], bucket[posU]]
  const next = { ...zaoRootTieOrderByIniCache, [iniK]: bucket }
  await OBR.room.setMetadata({ [ZAO_ROOT_TIE_ORDER_KEY]: next })
  await pullZaoRootTieOrderFromRoom()
}

export const DEFAULT_PHASE_OFFSET = 8
export const DEFAULT_SECOND_ACTION_STEP = DEFAULT_PHASE_OFFSET

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
    const parentId = typeof l.parentId === 'string' ? l.parentId : null
    const entry = {
      id: l.id,
      parentId,
      offset: clampStoredOffset(l.offset),
    }
    if (parentId === null) {
      entry.expiresNextRound = l.expiresNextRound === false ? false : true
    }
    links.push(entry)
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
  const indexById = new Map(links.map((l, i) => [l.id, i]))
  return [...links].sort(
    (a, b) =>
      linkDepth(a.id, map) - linkDepth(b.id, map) ||
      (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0)
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
  return DEFAULT_PHASE_OFFSET
}

/** Aktuell globaler Standard (8); später pro Held erweiterbar. */
export function secondActionStepForOwnerIni(_ownerIniStr) {
  return DEFAULT_SECOND_ACTION_STEP
}

/** Darf eine 2.A.-Wurzel erzeugt werden? (Ziel-INI der 2.A. muss >= 0 sein) */
export function canCreateSecondActionRoot(ownerIniStr) {
  const base = iniNumeric(ownerIniStr)
  if (!Number.isFinite(base)) return false
  const step = secondActionStepForOwnerIni(ownerIniStr)
  return base - step >= 0
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
    if (!canCreateSecondActionRoot(ownerIniStr)) {
      return p
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
    const nextLinks = p.links.filter((l) => !cut.has(l.id))
    return {
      ...p,
      links: nextLinks,
      rowPanelOpen: nextLinks.length === 0 ? false : p.rowPanelOpen,
    }
  })
}

/**
 * Entfernt die zuletzt angelegte 2.-A.-Wurzel (letzte Wurzel in der Link-Liste)
 * inkl. angehängter Phasen – entspricht Umkehrung von wiederholtem „+“.
 */
export function removeLastZaoRoot(itemId) {
  return patchItemPhases(itemId, (p) => {
    let lastRootId = null
    let bestIdx = -1
    for (let i = 0; i < p.links.length; i++) {
      const l = p.links[i]
      if (l.parentId === null && i > bestIdx) {
        bestIdx = i
        lastRootId = l.id
      }
    }
    if (!lastRootId) return p
    const cut = collectSubtreeIds(p.links, lastRootId)
    const nextLinks = p.links.filter((l) => !cut.has(l.id))
    return {
      ...p,
      links: nextLinks,
      rowPanelOpen: nextLinks.length === 0 ? false : p.rowPanelOpen,
    }
  })
}

export function togglePhaseLinkExpiresNextRound(itemId, linkId) {
  return patchItemPhases(itemId, (p) => {
    const link = p.links.find((l) => l.id === linkId)
    if (!link || link.parentId !== null) return p
    return {
      ...p,
      links: p.links.map((l) =>
        l.id === linkId
          ? { ...l, expiresNextRound: !l.expiresNextRound }
          : l
      ),
    }
  })
}

function linksWithoutEphemeralRoots(links) {
  const roots = links.filter(
    (l) => l.parentId === null && l.expiresNextRound
  )
  if (roots.length === 0) return links
  const cut = new Set()
  for (const r of roots) {
    for (const id of collectSubtreeIds(links, r.id)) {
      cut.add(id)
    }
  }
  return links.filter((l) => !cut.has(l.id))
}

/**
 * Entfernt Wurzel-Links mit expiresNextRound (offenes Schloss), z. B. nach Kampfrundenwechsel.
 */
export async function clearEphemeralExtraIniRows() {
  const items = await OBR.scene.items.getItems((item) =>
    Boolean(item.metadata?.[TRACKER_ITEM_META_KEY])
  )
  const updates = []
  for (const item of items) {
    const meta = item.metadata[TRACKER_ITEM_META_KEY]
    if (!meta) continue
    const p = normalizePhases(meta.phases)
    if (p.links.length === 0) continue
    const nextLinks = linksWithoutEphemeralRoots(p.links)
    if (nextLinks.length === p.links.length) continue
    updates.push({
      id: item.id,
      phases: {
        ...p,
        links: nextLinks,
        rowPanelOpen: nextLinks.length === 0 ? false : p.rowPanelOpen,
      },
    })
  }
  if (updates.length === 0) return
  const byId = new Map(updates.map((u) => [u.id, u]))
  await OBR.scene.items.updateItems(updates.map((u) => u.id), (drafts) => {
    for (const d of drafts) {
      const u = byId.get(d.id)
      if (!u) continue
      const m = d.metadata[TRACKER_ITEM_META_KEY]
      if (m) m.phases = normalizePhases(u.phases)
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
  if (off < 0) return Promise.resolve({ ok: false, reason: 'NEG_INI' })

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
 * @param {string[]} tieOrderIds manuelle Reihenfolge bei gleicher INI (Token-Zeilen)
 */
export function buildMergedDisplayRows(tokenRows, items, tieOrderIds = []) {
  const metaOf = (id) => {
    const it = items.find((i) => i.id === id)
    return it?.metadata?.[TRACKER_ITEM_META_KEY]
  }
  const rootOrderByOwner = new Map()

  const tokenIds = new Set(tokenRows.map((r) => r.id))
  const tieFiltered = tieOrderIds.filter((id) => tokenIds.has(id))

  const entries = []

  for (const row of tokenRows) {
    entries.push({ kind: 'token', row })
    const meta = metaOf(row.id)
    const phases = normalizePhases(meta?.phases)
    const roots = sortedLinksForLayout(phases.links).filter(
      (l) => l.parentId === null
    )
    rootOrderByOwner.set(
      row.id,
      new Map(roots.map((l, i) => [l.id, i]))
    )

    if (phases.rowPanelOpen && phases.links.length > 0) {
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

    const doneRound = Math.floor(Number(meta?.[LH_DONE_ROUND]))
    const doneIni = Number(meta?.[LH_DONE_INI])
    const ownerIni = iniNumeric(row.initiative)
    if (
      Number.isFinite(doneRound) &&
      doneRound >= 1 &&
      Number.isFinite(doneIni) &&
      doneIni >= 0 &&
      (!Number.isFinite(ownerIni) || doneIni !== ownerIni)
    ) {
      entries.push({
        kind: 'lhDone',
        ownerId: row.id,
        ownerName: row.name,
        ownerIniStr: row.initiative,
        hookIni: doneIni,
      })
    }
  }

  entries.sort((a, b) => {
    if (a.kind === 'token' && b.kind === 'token') {
      return compareInitiativeRowsWithTieOrder(
        {
          id: a.row.id,
          initiative: a.row.initiative,
          name: a.row.name,
        },
        {
          id: b.row.id,
          initiative: b.row.initiative,
          name: b.row.name,
        },
        tieFiltered
      )
    }
    if (a.kind === 'phase' && b.kind === 'phase') {
      const ha = formatIniForSort(a.hookIni)
      const hb = formatIniForSort(b.hookIni)
      if (ha === hb) {
        if (a.ownerId === b.ownerId) {
          const ord = rootOrderByOwner.get(a.ownerId)
          const oa = ord?.get(a.link.id)
          const ob = ord?.get(b.link.id)
          if (
            typeof oa === 'number' &&
            typeof ob === 'number' &&
            oa !== ob
          ) {
            return oa - ob
          }
        }
        const bucket = zaoRootTieOrderByIniCache[ha]
        const ka = zaoRootKey(a.ownerId, a.link.id)
        const kb = zaoRootKey(b.ownerId, b.link.id)
        if (bucket?.length) {
          const ia = bucket.indexOf(ka)
          const ib = bucket.indexOf(kb)
          const ma = ia === -1 ? 1e9 : ia
          const mb = ib === -1 ? 1e9 : ib
          if (ma !== mb) return ma - mb
        }
      }
    }
    const sa =
      a.kind === 'token'
        ? { initiative: a.row.initiative, name: a.row.name }
        : a.kind === 'lhDone'
          ? {
              initiative: formatIniForSort(a.hookIni),
              name: `${a.ownerName}\u0000~lhdone`,
            }
          : {
              initiative: formatIniForSort(a.hookIni),
              name: `${a.ownerName}\u0000${a.link.id}`,
            }
    const sb =
      b.kind === 'token'
        ? { initiative: b.row.initiative, name: b.row.name }
        : b.kind === 'lhDone'
          ? {
              initiative: formatIniForSort(b.hookIni),
              name: `${b.ownerName}\u0000~lhdone`,
            }
          : {
              initiative: formatIniForSort(b.hookIni),
              name: `${b.ownerName}\u0000${b.link.id}`,
            }
    return compareInitiativeRows(sa, sb)
  })

  if (tokenRows.length > 0) {
    entries.push({ kind: 'roundEnd' })
  }

  return entries
}

/**
 * Zug-Reihenfolge für Kampf-Navigation (Token-Zeilen und zusätzliche INI-Zeilen).
 * Reihenfolge entspricht der angezeigten Liste.
 */
export function buildCombatTurnSteps(tokenRows, items, tieOrderIds = []) {
  return buildMergedDisplayRows(tokenRows, items, tieOrderIds).map((e) =>
    e.kind === 'token'
      ? { kind: 'token', id: e.row.id }
      : e.kind === 'roundEnd'
        ? { kind: 'roundEnd', id: ROUND_END_STEP_ID }
        : e.kind === 'lhDone'
          ? { kind: 'lhDone', ownerId: e.ownerId, linkId: LH_DONE_STEP_ID }
        : { kind: 'phase', ownerId: e.ownerId, linkId: e.link.id }
  )
}

export function combatPatchForStep(step) {
  if (step.kind === 'token') {
    return { currentItemId: step.id, currentPhaseLinkId: null }
  }
  if (step.kind === 'roundEnd') {
    return { currentItemId: step.id, currentPhaseLinkId: null }
  }
  return { currentItemId: step.ownerId, currentPhaseLinkId: step.linkId }
}

export function findCombatStepIndex(steps, combat) {
  const phaseId = combat.currentPhaseLinkId
  return steps.findIndex((s) => {
    if (s.kind === 'roundEnd') {
      return s.id === combat.currentItemId && !phaseId
    }
    if (s.kind === 'token') {
      return s.id === combat.currentItemId && !phaseId
    }
    return s.ownerId === combat.currentItemId && s.linkId === phaseId
  })
}
