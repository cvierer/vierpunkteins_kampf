import OBR from '@owlbear-rodeo/sdk'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const HERO_EX_LE = 'heroExLe'
export const HERO_EX_LE_MAX = 'heroExLeMax'
export const HERO_EX_AE = 'heroExAe'
export const HERO_EX_AT = 'heroExAt'
export const HERO_EX_PA = 'heroExPa'
/** Konstitution (Eigenschaft), nur in der Eigenschaftenzeile */
export const HERO_EX_KO = 'heroExKo'
export const HERO_EX_TP = 'heroExTp'
/** Ausweichen (A), Kampfzeile zwischen PA und LE */
export const HERO_EX_A = 'heroExA'
/** @deprecated Nicht mehr in der UI; wird beim Speichern entfernt */
export const HERO_EX_B = 'heroExB'
/** @deprecated Nicht mehr in der UI; wird beim Speichern entfernt */
export const HERO_EX_C = 'heroExC'
export const HERO_EX_SP = 'heroExSp'
export const HERO_EX_TZ = 'heroExTz'
export const HERO_EX_FK = 'heroExFk'
/** Geschosse */
export const HERO_EX_G = 'heroExG'
export const HERO_EX_MU = 'heroExMu'
export const HERO_EX_KL = 'heroExKl'
export const HERO_EX_IN = 'heroExIn'
export const HERO_EX_CH = 'heroExCh'
export const HERO_EX_FF = 'heroExFf'
export const HERO_EX_GE = 'heroExGe'
export const HERO_EX_KK = 'heroExKk'
/** @deprecated Nicht mehr in der UI; wird beim Speichern entfernt */
export const HERO_EX_BE = 'heroExBe'
/** @deprecated Nur Lesen/Migration, nicht mehr in der UI */
export const HERO_EX_AMOD = 'heroExAMod'
/** @deprecated Nur Lesen/Migration */
export const HERO_EX_BMOD = 'heroExBMod'
/** @deprecated Nur Lesen/Migration */
export const HERO_EX_CMOD = 'heroExCMod'
/** @deprecated Nur Lesen/Migration, nicht mehr in der UI */
export const HERO_EX_AU = 'heroExAu'
/** @deprecated Nur Lesen/Migration */
export const HERO_EX_KE = 'heroExKe'
/** @deprecated Nur Lesen/Migration */
export const HERO_EX_AEKE_LEGACY = 'heroExAeKe'
/** @deprecated Nur Lesen/Migration */
export const HERO_EX_WUNDEN_ANZ = 'heroExWnAnz'
/** @deprecated Nur Lesen/Migration */
export const HERO_EX_WUNDEN_ORT = 'heroExWnOrt'
/** @deprecated Nur Lesen/Migration */
export const HERO_EX_WUNDEN_LEGACY = 'heroExWunden'
/** @deprecated Zusatzfeld derzeit nicht in der ausklappbaren Zeile */
export const HERO_EX_ZUSATZ = 'heroExZusatz'

function strOrEmpty(v) {
  if (v === undefined || v === null) return ''
  return String(v)
}

/**
 * @param {Record<string, unknown> | undefined} meta
 */
export function readHeroExpandSnapshot(meta) {
  return {
    at: strOrEmpty(meta?.[HERO_EX_AT]),
    pa: strOrEmpty(meta?.[HERO_EX_PA]),
    a: strOrEmpty(meta?.[HERO_EX_A]),
    le: strOrEmpty(meta?.[HERO_EX_LE]),
    leMax: strOrEmpty(meta?.[HERO_EX_LE_MAX]),
    ae: strOrEmpty(meta?.[HERO_EX_AE]),
    ko: strOrEmpty(meta?.[HERO_EX_KO]),
    tp: strOrEmpty(meta?.[HERO_EX_TP]),
    sp: strOrEmpty(meta?.[HERO_EX_SP]),
    tz: strOrEmpty(meta?.[HERO_EX_TZ]),
    fk: strOrEmpty(meta?.[HERO_EX_FK]),
    g: strOrEmpty(meta?.[HERO_EX_G]),
    mu: strOrEmpty(meta?.[HERO_EX_MU]),
    kl: strOrEmpty(meta?.[HERO_EX_KL]),
    inn: strOrEmpty(meta?.[HERO_EX_IN]),
    ch: strOrEmpty(meta?.[HERO_EX_CH]),
    ff: strOrEmpty(meta?.[HERO_EX_FF]),
    ge: strOrEmpty(meta?.[HERO_EX_GE]),
    kk: strOrEmpty(meta?.[HERO_EX_KK]),
  }
}

/**
 * @param {string} itemId
 * @param {ReturnType<typeof readHeroExpandSnapshot>} next
 */
export async function applyHeroExpandFields(itemId, next) {
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const d of drafts) {
      const m = d.metadata[TRACKER_ITEM_META_KEY]
      if (!m) continue

      const setStr = (key, v) => {
        const t = v.trim()
        if (t === '') delete m[key]
        else m[key] = t
      }

      setStr(HERO_EX_AT, next.at)
      setStr(HERO_EX_PA, next.pa)
      setStr(HERO_EX_A, next.a)
      setStr(HERO_EX_LE, next.le)
      setStr(HERO_EX_LE_MAX, next.leMax)
      setStr(HERO_EX_AE, next.ae)
      setStr(HERO_EX_KO, next.ko)
      setStr(HERO_EX_TP, next.tp)
      setStr(HERO_EX_SP, next.sp)
      setStr(HERO_EX_TZ, next.tz)
      setStr(HERO_EX_FK, next.fk)
      setStr(HERO_EX_G, next.g)
      setStr(HERO_EX_MU, next.mu)
      setStr(HERO_EX_KL, next.kl)
      setStr(HERO_EX_IN, next.inn)
      setStr(HERO_EX_CH, next.ch)
      setStr(HERO_EX_FF, next.ff)
      setStr(HERO_EX_GE, next.ge)
      setStr(HERO_EX_KK, next.kk)

      delete m[HERO_EX_AEKE_LEGACY]
      delete m[HERO_EX_WUNDEN_LEGACY]
      delete m[HERO_EX_B]
      delete m[HERO_EX_C]
      delete m[HERO_EX_BE]
    }
  })
}

/**
 * @param {HTMLInputElement} tpInp
 */
function syncTpFontSize(tpInp) {
  const n = tpInp.value.length
  tpInp.classList.toggle('init-hero-ex__micro--tp-compact', n > 4)
}

/**
 * WdS-Trefferzonen nach Würfelergebnis (1–20).
 * @param {string} raw
 * @returns {string | null}
 */
function trefferzoneZoneLabel(raw) {
  const n = parseInt(String(raw).trim(), 10)
  if (!Number.isFinite(n)) return null
  if (n === 19 || n === 20) return 'Kopf'
  if (n === 15 || n === 16 || n === 17 || n === 18) return 'Brust'
  if (n === 14 || n === 12 || n === 10) return 'rechter Arm'
  if (n === 13 || n === 11 || n === 9) return 'linker Arm'
  if (n === 8 || n === 7) return 'Bauch'
  if (n === 2 || n === 4 || n === 6) return 'rechtes Bein'
  if (n === 1 || n === 3 || n === 5) return 'linkes Bein'
  return null
}

/** @param {HTMLInputElement} tzInp */
function syncTzTooltip(tzInp) {
  const zone = trefferzoneZoneLabel(tzInp.value)
  const base = 'Trefferzone (TZ)'
  if (zone) {
    tzInp.title = `${base} — ${zone}`
    tzInp.setAttribute('aria-label', `${base}, ${zone}`)
  } else {
    tzInp.title = base
    tzInp.setAttribute('aria-label', base)
  }
}

/**
 * @param {HTMLElement} container
 * @param {{ itemId: string, meta: Record<string, unknown> | undefined, canEdit: boolean, leadButtons?: HTMLElement[] }} opts
 */
export function mountHeroExpandBlock(
  container,
  { itemId, meta, canEdit, leadButtons }
) {
  const snap = readHeroExpandSnapshot(meta)
  container.replaceChildren()

  const root = document.createElement('div')
  root.className = 'init-hero-ex'

  const leadSpacer = document.createElement('div')
  leadSpacer.className = 'init-hero-ex__lead-spacer'
  leadSpacer.setAttribute('aria-hidden', 'true')

  const spacerExp = document.createElement('div')
  spacerExp.className = 'init-hero-ex__lead'
  const leadEls = Array.isArray(leadButtons) ? leadButtons.filter(Boolean) : []
  if (leadEls.length > 0) {
    spacerExp.classList.add('init-hero-ex__lead--tools')
    for (const el of leadEls) spacerExp.appendChild(el)
  } else {
    spacerExp.setAttribute('aria-hidden', 'true')
  }

  const attrBlock = document.createElement('div')
  attrBlock.className = 'init-hero-ex__attr-block'

  const strip = document.createElement('div')
  strip.className = 'init-hero-ex__strip'

  const mkMicro = (abbr, fullName, idSuf, value, maxLen, extraClass, numeric) => {
    const cell = document.createElement('div')
    cell.className = 'init-hero-ex__micro-cell'
    const ab = document.createElement('span')
    ab.className = 'init-hero-ex__abbr'
    ab.textContent = abbr
    ab.title = fullName
    const inp = document.createElement('input')
    inp.type = 'text'
    if (numeric) inp.inputMode = 'numeric'
    inp.className =
      'init-hero-ex__micro' + (extraClass ? ` ${extraClass}` : '')
    inp.id = `hero-ex-${itemId}-${idSuf}`
    inp.autocomplete = 'off'
    inp.spellcheck = false
    inp.disabled = !canEdit
    inp.value = value
    inp.maxLength = maxLen
    inp.title = fullName
    inp.setAttribute('aria-label', fullName)
    cell.append(ab, inp)
    return { cell, inp }
  }

  const mu = mkMicro('MU', 'Mut (MU)', 'mu', snap.mu, 2, '', true)
  const kl = mkMicro('KL', 'Klugheit (KL)', 'kl', snap.kl, 2, '', true)
  const inn = mkMicro('IN', 'Intuition (IN)', 'inn', snap.inn, 2, '', true)
  const ch = mkMicro('CH', 'Charisma (CH)', 'ch', snap.ch, 2, '', true)
  const ff = mkMicro('FF', 'Fingerfertigkeit (FF)', 'ff', snap.ff, 2, '', true)
  const ge = mkMicro('GE', 'Gewandtheit (GE)', 'ge', snap.ge, 2, '', true)
  const kk = mkMicro('KK', 'Körperkraft (KK)', 'kk', snap.kk, 2, '', true)
  const koAttr = mkMicro('KO', 'Konstitution (KO)', 'ko', snap.ko, 2, '', true)

  const attrCols = document.createElement('div')
  attrCols.className = 'init-hero-ex__attr-cols'
  for (const x of [mu, kl, inn, ch, ff, ge, kk, koAttr]) {
    attrCols.appendChild(x.cell)
  }
  attrBlock.appendChild(attrCols)

  const at = mkMicro('AT', 'Attacke (AT)', 'at', snap.at, 2, '', true)
  const pa = mkMicro('PA', 'Parade (PA)', 'pa', snap.pa, 2, '', true)
  const ausw = mkMicro('A', 'Ausweichen (A)', 'a', snap.a, 2, '', true)

  const lePair = document.createElement('div')
  lePair.className = 'init-hero-ex__le-pair'
  const lePairLabels = document.createElement('div')
  lePairLabels.className = 'init-hero-ex__le-pair__labels'
  const leAbbr = document.createElement('span')
  leAbbr.className = 'init-hero-ex__abbr'
  leAbbr.textContent = 'LE'
  leAbbr.title = 'Lebensenergie (LE)'
  const leLabelPad = document.createElement('span')
  leLabelPad.className = 'init-hero-ex__le-pair__label-gap'
  leLabelPad.setAttribute('aria-hidden', 'true')
  const maxAbbr = document.createElement('span')
  maxAbbr.className = 'init-hero-ex__abbr'
  maxAbbr.textContent = 'max'
  maxAbbr.title = 'Lebensenergie Maximum (LE max)'
  lePairLabels.append(leAbbr, leLabelPad, maxAbbr)

  const leInp = document.createElement('input')
  leInp.type = 'text'
  leInp.inputMode = 'numeric'
  leInp.className = 'init-hero-ex__micro init-hero-ex__micro--le-pair-inp'
  leInp.id = `hero-ex-${itemId}-le`
  leInp.autocomplete = 'off'
  leInp.spellcheck = false
  leInp.disabled = !canEdit
  leInp.value = snap.le
  leInp.maxLength = 2
  leInp.title = 'Lebensenergie (LE)'
  leInp.setAttribute('aria-label', 'Lebensenergie (LE)')

  const leSlash = document.createElement('span')
  leSlash.className = 'init-hero-ex__slash init-hero-ex__slash--le-only'
  leSlash.textContent = '/'
  leSlash.setAttribute('aria-hidden', 'true')

  const leMaxInp = document.createElement('input')
  leMaxInp.type = 'text'
  leMaxInp.inputMode = 'numeric'
  leMaxInp.className =
    'init-hero-ex__micro init-hero-ex__micro--le-pair-inp init-hero-ex__micro--lemax'
  leMaxInp.id = `hero-ex-${itemId}-lemax`
  leMaxInp.autocomplete = 'off'
  leMaxInp.spellcheck = false
  leMaxInp.disabled = !canEdit
  leMaxInp.value = snap.leMax
  leMaxInp.maxLength = 3
  leMaxInp.title = 'Lebensenergie Maximum (LE max)'
  leMaxInp.setAttribute('aria-label', 'Lebensenergie Maximum (LE max)')

  const lePairInputs = document.createElement('div')
  lePairInputs.className = 'init-hero-ex__le-pair__inputs'
  lePairInputs.append(leInp, leSlash, leMaxInp)
  lePair.append(lePairLabels, lePairInputs)

  const ae = mkMicro('AE', 'Astralenergie (AE)', 'ae', snap.ae, 2, '', true)

  const tpCell = document.createElement('div')
  tpCell.className = 'init-hero-ex__micro-cell'
  const tpAbbr = document.createElement('span')
  tpAbbr.className = 'init-hero-ex__abbr'
  tpAbbr.textContent = 'TP'
  tpAbbr.title = 'Trefferpunkte (TP)'
  const tpInp = document.createElement('input')
  tpInp.type = 'text'
  tpInp.className = 'init-hero-ex__micro init-hero-ex__micro--tp'
  tpInp.id = `hero-ex-${itemId}-tp`
  tpInp.autocomplete = 'off'
  tpInp.spellcheck = false
  tpInp.disabled = !canEdit
  tpInp.value = snap.tp
  tpInp.maxLength = 7
  tpInp.title = 'Trefferpunkte (TP), bis 7 Zeichen'
  tpInp.setAttribute('aria-label', 'Trefferpunkte (TP)')
  tpCell.append(tpAbbr, tpInp)
  syncTpFontSize(tpInp)

  const fk = mkMicro('FK', 'Fernkampf (FK)', 'fk', snap.fk, 2, '', true)
  const g = mkMicro('G', 'Geschosse (G)', 'g', snap.g, 2, '', true)

  const spTzPair = document.createElement('div')
  spTzPair.className = 'init-hero-ex__sp-tz-pair'
  const spTzLabels = document.createElement('div')
  spTzLabels.className = 'init-hero-ex__sp-tz-pair__labels'
  const spAbbr = document.createElement('span')
  spAbbr.className = 'init-hero-ex__abbr'
  spAbbr.textContent = 'SP'
  spAbbr.title = 'Schadenspunkte (SP)'
  const spTzLabelPad = document.createElement('span')
  spTzLabelPad.className = 'init-hero-ex__sp-tz-pair__label-gap'
  spTzLabelPad.setAttribute('aria-hidden', 'true')
  const tzAbbr = document.createElement('span')
  tzAbbr.className = 'init-hero-ex__abbr'
  tzAbbr.textContent = 'TZ'
  tzAbbr.title = 'Trefferzone (TZ)'
  spTzLabels.append(spAbbr, spTzLabelPad, tzAbbr)

  const spInp = document.createElement('input')
  spInp.type = 'text'
  spInp.inputMode = 'numeric'
  spInp.className = 'init-hero-ex__micro init-hero-ex__micro--sp-tz-inp'
  spInp.id = `hero-ex-${itemId}-sp`
  spInp.autocomplete = 'off'
  spInp.spellcheck = false
  spInp.disabled = !canEdit
  spInp.value = snap.sp
  spInp.maxLength = 4
  spInp.title = 'Schadenspunkte (SP)'
  spInp.setAttribute('aria-label', 'Schadenspunkte (SP)')

  const spTzArrow = document.createElement('button')
  spTzArrow.type = 'button'
  spTzArrow.className = 'init-hero-ex__micro init-hero-ex__micro--sp-tz-arrow'
  spTzArrow.textContent = '>'
  spTzArrow.title = 'Fokus auf Trefferzone (TZ)'
  spTzArrow.setAttribute('aria-label', 'Zu Trefferzone wechseln')

  const tzInp = document.createElement('input')
  tzInp.type = 'text'
  tzInp.inputMode = 'numeric'
  tzInp.className = 'init-hero-ex__micro init-hero-ex__micro--sp-tz-inp'
  tzInp.id = `hero-ex-${itemId}-tz`
  tzInp.autocomplete = 'off'
  tzInp.spellcheck = false
  tzInp.disabled = !canEdit
  tzInp.value = snap.tz
  tzInp.maxLength = 3
  syncTzTooltip(tzInp)

  const spTzInputs = document.createElement('div')
  spTzInputs.className = 'init-hero-ex__sp-tz-pair__inputs'
  spTzInputs.append(spInp, spTzArrow, tzInp)
  spTzPair.append(spTzLabels, spTzInputs)

  strip.append(
    at.cell,
    pa.cell,
    ausw.cell,
    lePair,
    ae.cell,
    tpCell,
    fk.cell,
    g.cell,
    spTzPair
  )

  root.append(leadSpacer, attrBlock, spacerExp, strip)
  container.appendChild(root)

  if (!canEdit) {
    spTzArrow.disabled = true
    return
  }

  tpInp.addEventListener('input', () => syncTpFontSize(tpInp))
  tzInp.addEventListener('input', () => syncTzTooltip(tzInp))

  const gather = () => ({
    at: at.inp.value,
    pa: pa.inp.value,
    a: ausw.inp.value,
    le: leInp.value,
    leMax: leMaxInp.value,
    ae: ae.inp.value,
    ko: koAttr.inp.value,
    tp: tpInp.value,
    sp: spInp.value,
    tz: tzInp.value,
    fk: fk.inp.value,
    g: g.inp.value,
    mu: mu.inp.value,
    kl: kl.inp.value,
    inn: inn.inp.value,
    ch: ch.inp.value,
    ff: ff.inp.value,
    ge: ge.inp.value,
    kk: kk.inp.value,
  })

  const commit = () => {
    void applyHeroExpandFields(itemId, gather())
  }

  spTzArrow.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    void commit()
    tzInp.focus()
    tzInp.select()
  })

  for (const inp of [
    at.inp,
    pa.inp,
    ausw.inp,
    leInp,
    leMaxInp,
    ae.inp,
    tpInp,
    fk.inp,
    g.inp,
    spInp,
    tzInp,
    mu.inp,
    kl.inp,
    inn.inp,
    ch.inp,
    ff.inp,
    ge.inp,
    kk.inp,
    koAttr.inp,
  ]) {
    inp.addEventListener('blur', commit)
  }
}
