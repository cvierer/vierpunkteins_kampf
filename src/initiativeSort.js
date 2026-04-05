/**
 * Reihenfolge wie Battle Board: höhere Ganzzahl zuerst, bei gleicher Ganzzahl
 * kleinere Nachkommastellen zuerst (z. B. 15 → 14 → 13.1 → 13.9 → 12).
 * Leere oder ungültige Werte sortieren ans Ende, danach Name.
 */

export function initiativeRank(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(',', '.')
  if (normalized === '') return null
  const n = Number(normalized)
  if (Number.isNaN(n)) return null
  const intPart = Math.trunc(n)
  const frac = Math.abs(n - intPart)
  return { intPart, frac }
}

export function compareInitiativeRows(a, b) {
  const ra = initiativeRank(a.initiative)
  const rb = initiativeRank(b.initiative)
  if (ra === null && rb === null)
    return (a.name || '').localeCompare(b.name || '', undefined, {
      sensitivity: 'base',
    })
  if (ra === null) return 1
  if (rb === null) return -1
  if (ra.intPart !== rb.intPart) return rb.intPart - ra.intPart
  if (ra.frac !== rb.frac) return ra.frac - rb.frac
  return (a.name || '').localeCompare(b.name || '', undefined, {
    sensitivity: 'base',
  })
}

/** Nur INI-Rang (Ganzzahl + Bruch), 0 = gleiche Kampfstufe. */
export function initiativeCompareOnlyIni(a, b) {
  const ra = initiativeRank(a.initiative)
  const rb = initiativeRank(b.initiative)
  if (ra === null && rb === null) return 0
  if (ra === null) return 1
  if (rb === null) return -1
  if (ra.intPart !== rb.intPart) return rb.intPart - ra.intPart
  if (ra.frac !== rb.frac) return ra.frac - rb.frac
  return 0
}

function tieBreakIndex(id, tieOrderIds) {
  const i = tieOrderIds.indexOf(id)
  return i === -1 ? 1e9 : i
}

/**
 * Wie compareInitiativeRows, aber bei gleicher INI zuerst die manuelle
 * Reihenfolge aus tieOrderIds (Raum-Metadaten), dann Name.
 */
export function compareInitiativeRowsWithTieOrder(a, b, tieOrderIds) {
  const iniCmp = initiativeCompareOnlyIni(a, b)
  if (iniCmp !== 0) return iniCmp
  const ia = tieBreakIndex(a.id, tieOrderIds)
  const ib = tieBreakIndex(b.id, tieOrderIds)
  if (ia !== ib) return ia - ib
  return (a.name || '').localeCompare(b.name || '', undefined, {
    sensitivity: 'base',
  })
}
