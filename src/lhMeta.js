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
 * Gespeichertes Phasen-Offset (positiv) aus L.H.-Auslöser-Schritt, z. B. −8 → 8.
 */
export function phaseOffsetFromLhTriggerStep(triggerIniStep) {
  const n = Number(triggerIniStep)
  if (!Number.isFinite(n) || n === 0) {
    return Math.max(
      0,
      Math.min(99, Math.round(Math.abs(DEFAULT_LH_TRIGGER_INI_STEP)))
    )
  }
  return Math.max(0, Math.min(99, Math.round(Math.abs(n))))
}

export function phaseOffsetFromLhMeta(meta) {
  return phaseOffsetFromLhTriggerStep(readLhMechanics(meta).triggerIniStep)
}

/**
 * Kurztext im L.H.-Kuchen am Token: 1/x … (x−1)/x, zuletzt „GO!“ wenn nur noch ein Auslöser offen (mehrteilige L.H.).
 */
export function lhProgressFractionText(max, rem) {
  if (!(max > 0 && rem > 0)) return ''
  if (max > 1 && rem === 1) return 'GO!'
  return `${max - rem + 1}/${max}`
}

/** Mehrteilige L.H. mit letztem offenen Auslöser („GO!“ in der Anzeige). */
export function lhShowsGo(max, rem) {
  return max > 1 && rem === 1
}

/** Füllgrad 0…1 für den L.H.-Kuchen, gleiche Logik wie die 1-basierte Bruch-Anzeige. */
export function lhProgressPieFillRatio(max, rem) {
  if (max <= 0) return 0
  if (rem <= 0) return 1
  return Math.max(0, Math.min(1, (max - rem + 1) / max))
}

const LEGACY_LH_P2_ROUND = 'lhPendingSecondRound'
const LEGACY_LH_P2_INI = 'lhPendingSecondTargetIni'

/** Wie L.H. leer speichern: Zelle und Fortschritt zurücksetzen (z. B. × am Listen-Stempel). */
export function clearLhTrackerActivity(m) {
  if (!m || typeof m !== 'object') return
  delete m[LEGACY_LH_P2_ROUND]
  delete m[LEGACY_LH_P2_INI]
  m[LH_MAX] = 0
  m[LH_REM] = 0
  delete m[LH_KR_FIRED_ROUND]
  delete m[LH_KR_FIRED_MASK]
  delete m[LH_DONE_ROUND]
  delete m[LH_DONE_INI]
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

/**
 * L.H. mit genau einer Gesamt-Aktion (max=1): 2.A. eine Stufe am Phasen-Offset unter dem Heldenwert
 * (Standard-Offset −8 → INI = Helden-INI − 8).
 */
export function lhSingleActionHookIni(heroIni, triggerIniStep) {
  if (!Number.isFinite(heroIni)) return null
  const step = Number(triggerIniStep)
  if (!Number.isFinite(step) || step === 0) return null
  const t = heroIni + step
  return Number.isFinite(t) && t >= 0 ? t : null
}

/** INI der laufenden L.H.-Zeile für Liste / Kampfschritte (inkl. Sonderfall max=1). */
export function computeLhProgressDisplayHookIni(
  lhMax,
  lhRem,
  heroIni,
  meta,
  combatRound
) {
  if (!(lhMax > 0 && lhRem > 0 && Number.isFinite(heroIni)) || !meta) {
    return null
  }
  const mech = readLhMechanics(meta)
  if (lhMax === 1 && lhRem === lhMax) {
    return lhSingleActionHookIni(heroIni, mech.triggerIniStep)
  }
  const firedMask = effectiveLhFiredMaskForRound(meta, combatRound)
  return hookIniForLhProgressRow(heroIni, mech, firedMask)
}

/**
 * Synthetische 2.A.-INI-Zeile nur nach abgeschlossener L.H. (Zusatzaktion laut Regelwerk).
 * Laufender Fortschritt (1/x … GO!) steht ausschließlich am Mutter-Token.
 */
export function trackerShowsLhSyntheticRow(meta, ownerIniNum, _combatRound) {
  if (!meta || typeof meta !== 'object') return false
  const doneRound = Math.floor(Number(meta[LH_DONE_ROUND]))
  const doneIni = Number(meta[LH_DONE_INI])
  return (
    Number.isFinite(doneRound) &&
    doneRound >= 1 &&
    Number.isFinite(doneIni) &&
    doneIni >= 0 &&
    (!Number.isFinite(ownerIniNum) || doneIni !== ownerIniNum)
  )
}

export function normalizeActionsPerKrForPatch(raw) {
  return normalizeActionsPerKr(raw)
}

export function normalizeTriggerStepForPatch(raw) {
  return normalizeTriggerStep(raw)
}
