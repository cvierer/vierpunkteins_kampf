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
export const HERO_EX_A = 'heroExA'
export const HERO_EX_B = 'heroExB'
export const HERO_EX_C = 'heroExC'
export const HERO_EX_MU = 'heroExMu'
export const HERO_EX_KL = 'heroExKl'
export const HERO_EX_IN = 'heroExIn'
export const HERO_EX_CH = 'heroExCh'
export const HERO_EX_FF = 'heroExFf'
export const HERO_EX_GE = 'heroExGe'
export const HERO_EX_KK = 'heroExKk'
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
    le: strOrEmpty(meta?.[HERO_EX_LE]),
    leMax: strOrEmpty(meta?.[HERO_EX_LE_MAX]),
    ae: strOrEmpty(meta?.[HERO_EX_AE]),
    ko: strOrEmpty(meta?.[HERO_EX_KO]),
    tp: strOrEmpty(meta?.[HERO_EX_TP]),
    a: strOrEmpty(meta?.[HERO_EX_A]),
    b: strOrEmpty(meta?.[HERO_EX_B]),
    c: strOrEmpty(meta?.[HERO_EX_C]),
    mu: strOrEmpty(meta?.[HERO_EX_MU]),
    kl: strOrEmpty(meta?.[HERO_EX_KL]),
    inn: strOrEmpty(meta?.[HERO_EX_IN]),
    ch: strOrEmpty(meta?.[HERO_EX_CH]),
    ff: strOrEmpty(meta?.[HERO_EX_FF]),
    ge: strOrEmpty(meta?.[HERO_EX_GE]),
    kk: strOrEmpty(meta?.[HERO_EX_KK]),
    be: strOrEmpty(meta?.[HERO_EX_BE]),
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
      setStr(HERO_EX_LE, next.le)
      setStr(HERO_EX_LE_MAX, next.leMax)
      setStr(HERO_EX_AE, next.ae)
      setStr(HERO_EX_KO, next.ko)
      setStr(HERO_EX_TP, next.tp)
      setStr(HERO_EX_A, next.a)
      setStr(HERO_EX_B, next.b)
      setStr(HERO_EX_C, next.c)
      setStr(HERO_EX_MU, next.mu)
      setStr(HERO_EX_KL, next.kl)
      setStr(HERO_EX_IN, next.inn)
      setStr(HERO_EX_CH, next.ch)
      setStr(HERO_EX_FF, next.ff)
      setStr(HERO_EX_GE, next.ge)
      setStr(HERO_EX_KK, next.kk)
      setStr(HERO_EX_BE, next.be)

      delete m[HERO_EX_AEKE_LEGACY]
      delete m[HERO_EX_WUNDEN_LEGACY]
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

function mkSlash() {
  const s = document.createElement('span')
  s.className = 'init-hero-ex__slash'
  s.textContent = '/'
  s.setAttribute('aria-hidden', 'true')
  return s
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

  const attrStrip = document.createElement('div')
  attrStrip.className = 'init-hero-ex__attr-strip'

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

  const mkAttrMicro = (abbr, fullName, idSuf, value, maxLen) => {
    const cell = document.createElement('div')
    cell.className =
      'init-hero-ex__micro-cell init-hero-ex__micro-cell--attr init-hero-ex__micro-cell--attr-inline'
    const ab = document.createElement('span')
    ab.className = 'init-hero-ex__abbr init-hero-ex__abbr--attr'
    ab.textContent = abbr
    ab.title = fullName
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.inputMode = 'numeric'
    inp.className = 'init-hero-ex__micro init-hero-ex__micro--attr'
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

  const mu = mkAttrMicro('MU', 'Mut (MU)', 'mu', snap.mu, 2)
  const kl = mkAttrMicro('KL', 'Klugheit (KL)', 'kl', snap.kl, 2)
  const inn = mkAttrMicro('IN', 'Intuition (IN)', 'inn', snap.inn, 2)
  const ch = mkAttrMicro('CH', 'Charisma (CH)', 'ch', snap.ch, 2)
  const ff = mkAttrMicro('FF', 'Fingerfertigkeit (FF)', 'ff', snap.ff, 2)
  const ge = mkAttrMicro('GE', 'Gewandtheit (GE)', 'ge', snap.ge, 2)
  const koAttr = mkAttrMicro('KO', 'Konstitution (KO)', 'ko', snap.ko, 2)
  const kk = mkAttrMicro('KK', 'Körperkraft (KK)', 'kk', snap.kk, 2)
  const be = mkAttrMicro('BE', 'Bewegung (BE)', 'be', snap.be, 2)

  const attrCells = [
    mu.cell,
    kl.cell,
    inn.cell,
    ch.cell,
    ff.cell,
    ge.cell,
    koAttr.cell,
    kk.cell,
    be.cell,
  ]
  for (let i = 0; i < attrCells.length; i++) {
    if (i > 0) attrStrip.appendChild(mkSlash())
    attrStrip.appendChild(attrCells[i])
  }

  const at = mkMicro('AT', 'Attacke (AT)', 'at', snap.at, 2, '', true)
  const pa = mkMicro('PA', 'Parade (PA)', 'pa', snap.pa, 2, '', true)
  const le = mkMicro('LE', 'Lebensenergie (LE)', 'le', snap.le, 2, '', true)
  const leMax = mkMicro(
    'max',
    'Lebensenergie Maximum (LE max)',
    'lemax',
    snap.leMax,
    3,
    ' init-hero-ex__micro--lemax',
    true
  )
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

  const a = mkMicro('A', 'Feld A', 'a', snap.a, 2, '', true)
  const b = mkMicro('B', 'Feld B', 'b', snap.b, 2, '', true)
  const c = mkMicro('C', 'Feld C', 'c', snap.c, 2, '', true)

  const combatParts = [
    at.cell,
    pa.cell,
    le.cell,
    leMax.cell,
    ae.cell,
    tpCell,
    a.cell,
    b.cell,
    c.cell,
  ]
  for (let i = 0; i < combatParts.length; i++) {
    if (i > 0) strip.appendChild(mkSlash())
    strip.appendChild(combatParts[i])
  }

  root.append(leadSpacer, attrStrip, spacerExp, strip)
  container.appendChild(root)

  if (!canEdit) return

  tpInp.addEventListener('input', () => syncTpFontSize(tpInp))

  const gather = () => ({
    at: at.inp.value,
    pa: pa.inp.value,
    le: le.inp.value,
    leMax: leMax.inp.value,
    ae: ae.inp.value,
    ko: koAttr.inp.value,
    tp: tpInp.value,
    a: a.inp.value,
    b: b.inp.value,
    c: c.inp.value,
    mu: mu.inp.value,
    kl: kl.inp.value,
    inn: inn.inp.value,
    ch: ch.inp.value,
    ff: ff.inp.value,
    ge: ge.inp.value,
    kk: kk.inp.value,
    be: be.inp.value,
  })

  const commit = () => {
    void applyHeroExpandFields(itemId, gather())
  }

  for (const inp of [
    at.inp,
    pa.inp,
    le.inp,
    leMax.inp,
    ae.inp,
    tpInp,
    a.inp,
    b.inp,
    c.inp,
    mu.inp,
    kl.inp,
    inn.inp,
    ch.inp,
    ff.inp,
    ge.inp,
    koAttr.inp,
    kk.inp,
    be.inp,
  ]) {
    inp.addEventListener('blur', commit)
  }
}
