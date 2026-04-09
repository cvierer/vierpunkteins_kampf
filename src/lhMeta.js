/**
 * L.H.-Metadaten (Schlüssel + Lesen) ohne Abhängigkeit von phaseLinks/longHandlung.
 */

export const LH_MAX = 'lhMax'
export const LH_REM = 'lhRemaining'
export const LH_ACTIONS_PER_KR = 'lhActionsPerKr'
export const LH_TRIGGER_INI_STEP = 'lhTriggerIniStep'
export const LH_KR_FIRED_ROUND = 'lhKrFiredRound'
export const LH_KR_FIRED_MASK = 'lhKrFiredMask'
export const LH_DONE_ROUND = 'lhDoneRound'
export const LH_DONE_INI = 'lhDoneIni'

export const DEFAULT_LH_ACTIONS_PER_KR = 2
export const DEFAULT_LH_TRIGGER_INI_STEP = -8

const MAX_ACTIONS = 8

function normalizeActionsPerKr(raw) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return DEFAULT_LH_ACTIONS_PER_KR
  return Math.min(MAX_ACTIONS, Math.max(1, n))
}

function normalizeTriggerStep(raw) {
  if (raw == null || raw === '') return DEFAULT_LH_TRIGGER_INI_STEP
  const n = Number(raw)
  if (!Number.isFinite(n) || n === 0) return DEFAULT_LH_TRIGGER_INI_STEP
  return n
}

function normalizeFiredRound(raw) {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 1 ? n : null
}

function normalizeFiredMask(raw) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 0) return 0
  return n & 0xff
}

export function readLhMechanics(meta) {
  if (!meta || typeof meta !== 'object') {
    return {
      actionsPerKr: DEFAULT_LH_ACTIONS_PER_KR,
      triggerIniStep: DEFAULT_LH_TRIGGER_INI_STEP,
      firedRound: null,
      firedMask: 0,
    }
  }
  return {
    actionsPerKr: normalizeActionsPerKr(meta[LH_ACTIONS_PER_KR]),
    triggerIniStep: normalizeTriggerStep(meta[LH_TRIGGER_INI_STEP]),
    firedRound: normalizeFiredRound(meta[LH_KR_FIRED_ROUND]),
    firedMask: normalizeFiredMask(meta[LH_KR_FIRED_MASK]),
  }
}

export function readLhState(meta) {
  if (!meta || typeof meta !== 'object') {
    return { max: 0, rem: 0 }
  }
  const max = Math.max(0, Math.floor(Number(meta[LH_MAX])) || 0)
  let rem = Math.max(0, Math.floor(Number(meta[LH_REM])) || 0)
  if (rem > max && max > 0) rem = max
  return { max, rem }
}

/**
 * Maske für Listen-Anzeige: in anderer KR als `combatRound` wie leer behandeln.
 */
export function effectiveLhFiredMaskForRound(meta, combatRound) {
  const mech = readLhMechanics(meta)
  if (combatRound == null || mech.firedRound == null) return mech.firedMask
  if (mech.firedRound !== combatRound) return 0
  return mech.firedMask
}

/**
 * Nächste noch nicht verbrauchte Auslöser-INI (höchstes T≥0 unter den offenen Stufen),
 * sonst niedrigstes bereits verbrauchtes T (Restzustand vor Abschluss).
 */
export function hookIniForLhProgressRow(heroIni, mechanics, firedMask) {
  const { actionsPerKr, triggerIniStep } = mechanics
  const H = heroIni
  if (!Number.isFinite(H)) return null
  let bestUnfired = null
  for (let k = 0; k < actionsPerKr; k++) {
    const bit = 1 << k
    if (firedMask & bit) continue
    const T = H + k * triggerIniStep
    if (!Number.isFinite(T) || T < 0) continue
    if (bestUnfired === null || T > bestUnfired) bestUnfired = T
  }
  if (bestUnfired !== null) return bestUnfired
  let lowestFired = null
  for (let k = 0; k < actionsPerKr; k++) {
    const bit = 1 << k
    if (!(firedMask & bit)) continue
    const T = H + k * triggerIniStep
    if (!Number.isFinite(T) || T < 0) continue
    if (lowestFired === null || T < lowestFired) lowestFired = T
  }
  return lowestFired
}

/** Wie buildMergedDisplayRows: synthetische L.H.-Zeile (läuft oder abgeschlossen). */
export function trackerShowsLhSyntheticRow(meta, ownerIniNum, combatRound) {
  if (!meta || typeof meta !== 'object') return false
  const doneRound = Math.floor(Number(meta[LH_DONE_ROUND]))
  const doneIni = Number(meta[LH_DONE_INI])
  const hasCompletedLhDone =
    Number.isFinite(doneRound) &&
    doneRound >= 1 &&
    Number.isFinite(doneIni) &&
    doneIni >= 0 &&
    (!Number.isFinite(ownerIniNum) || doneIni !== ownerIniNum)
  if (hasCompletedLhDone) return true
  const { max: lhMax, rem: lhRem } = readLhState(meta)
  if (!(lhMax > 0 && lhRem > 0 && Number.isFinite(ownerIniNum))) return false
  const mech = readLhMechanics(meta)
  const firedMask = effectiveLhFiredMaskForRound(meta, combatRound)
  const hook = hookIniForLhProgressRow(ownerIniNum, mech, firedMask)
  if (hook == null) return false
  return hook !== ownerIniNum
}

export function normalizeActionsPerKrForPatch(raw) {
  return normalizeActionsPerKr(raw)
}

export function normalizeTriggerStepForPatch(raw) {
  return normalizeTriggerStep(raw)
}
