import OBR from '@owlbear-rodeo/sdk'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const HERO_EX_LE = 'heroExLe'
export const HERO_EX_AE = 'heroExAe'
export const HERO_EX_AT = 'heroExAt'
export const HERO_EX_PA = 'heroExPa'
export const HERO_EX_KO = 'heroExKo'
export const HERO_EX_TP = 'heroExTp'
export const HERO_EX_A = 'heroExA'
export const HERO_EX_AMOD = 'heroExAMod'
export const HERO_EX_B = 'heroExB'
export const HERO_EX_BMOD = 'heroExBMod'
export const HERO_EX_C = 'heroExC'
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
    ae: strOrEmpty(meta?.[HERO_EX_AE]),
    ko: strOrEmpty(meta?.[HERO_EX_KO]),
    tp: strOrEmpty(meta?.[HERO_EX_TP]),
    a: strOrEmpty(meta?.[HERO_EX_A]),
    aMod: strOrEmpty(meta?.[HERO_EX_AMOD]),
    b: strOrEmpty(meta?.[HERO_EX_B]),
    bMod: strOrEmpty(meta?.[HERO_EX_BMOD]),
    c: strOrEmpty(meta?.[HERO_EX_C]),
    cMod: strOrEmpty(meta?.[HERO_EX_CMOD]),
    zusatz: strOrEmpty(meta?.[HERO_EX_ZUSATZ]),
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
      setStr(HERO_EX_AE, next.ae)
      setStr(HERO_EX_KO, next.ko)
      setStr(HERO_EX_TP, next.tp)
      setStr(HERO_EX_A, next.a)
      setStr(HERO_EX_AMOD, next.aMod)
      setStr(HERO_EX_B, next.b)
      setStr(HERO_EX_BMOD, next.bMod)
      setStr(HERO_EX_C, next.c)
      setStr(HERO_EX_CMOD, next.cMod)
      setStr(HERO_EX_ZUSATZ, next.zusatz)

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

/**
 * Wie Token-Zeile: gleiches Raster; unter der Zählerspalte Micro-Felder (1.22rem, 2 Ziffern);
 * Abkürzung darüber, ausführlicher Text im Mouseover (title).
 * @param {HTMLElement} container
 * @param {{ itemId: string, meta: Record<string, unknown> | undefined, canEdit: boolean, stripLeading?: Node[] }} opts
 */
export function mountHeroExpandBlock(container, { itemId, meta, canEdit, stripLeading = [] }) {
  const snap = readHeroExpandSnapshot(meta)
  container.replaceChildren()

  const root = document.createElement('div')
  root.className = 'init-hero-ex'

  const spacerExp = document.createElement('div')
  spacerExp.className = 'init-hero-ex__cell-grid init-hero-ex__cell-grid--expand'
  spacerExp.setAttribute('aria-hidden', 'true')

  const strip = document.createElement('div')
  strip.className = 'init-hero-ex__strip'

  for (const node of stripLeading) {
    strip.appendChild(node)
  }

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

  const mkPair = (letter, idLetter, numVal, modVal) => {
    const cell = document.createElement('div')
    cell.className = 'init-hero-ex__micro-cell init-hero-ex__pair-cell'
    const ab = document.createElement('span')
    ab.className = 'init-hero-ex__abbr'
    ab.textContent = letter
    ab.title = `${letter}: Zahl und Modifikator`
    const row = document.createElement('div')
    row.className = 'init-hero-ex__pair-row'
    const numInp = document.createElement('input')
    numInp.type = 'text'
    numInp.inputMode = 'numeric'
    numInp.className = 'init-hero-ex__micro'
    numInp.id = `hero-ex-${itemId}-${idLetter}`
    numInp.autocomplete = 'off'
    numInp.spellcheck = false
    numInp.disabled = !canEdit
    numInp.value = numVal
    numInp.maxLength = 2
    numInp.title = `${letter} (zwei Ziffern)`
    numInp.setAttribute('aria-label', `${letter} Zahl`)
    const modInp = document.createElement('input')
    modInp.type = 'text'
    modInp.className = 'init-hero-ex__mod'
    modInp.id = `hero-ex-${itemId}-${idLetter}mod`
    modInp.autocomplete = 'off'
    modInp.spellcheck = false
    modInp.disabled = !canEdit
    modInp.value = modVal
    modInp.maxLength = 12
    modInp.title = `${letter} Modifikator (bis 12 Zeichen)`
    modInp.setAttribute('aria-label', `${letter} Modifikator`)
    row.append(numInp, modInp)
    cell.append(ab, row)
    return { cell, numInp, modInp }
  }

  const pairA = mkPair('A', 'a', snap.a, snap.aMod)
  const pairB = mkPair('B', 'b', snap.b, snap.bMod)
  const pairC = mkPair('C', 'c', snap.c, snap.cMod)

  const at = mkMicro('AT', 'Attacke (AT)', 'at', snap.at, 2, '', true)
  const pa = mkMicro('PA', 'Parade (PA)', 'pa', snap.pa, 2, '', true)
  const le = mkMicro('LE', 'Lebensenergie (LE)', 'le', snap.le, 2, '', true)
  const ae = mkMicro('AE', 'Astralenergie (AE)', 'ae', snap.ae, 2, '', true)
  const ko = mkMicro('KO', 'Konstitution (KO)', 'ko', snap.ko, 2, '', true)

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

  strip.append(
    pairA.cell,
    pairB.cell,
    pairC.cell,
    at.cell,
    pa.cell,
    le.cell,
    ae.cell,
    ko.cell,
    tpCell
  )

  const gutter = document.createElement('div')
  gutter.className = 'init-hero-ex__cell-grid init-hero-ex__cell-grid--gutter'
  gutter.setAttribute('aria-hidden', 'true')

  const zusatzCol = document.createElement('div')
  zusatzCol.className = 'init-hero-ex__zusatz-col'
  const zAbbr = document.createElement('span')
  zAbbr.className = 'init-hero-ex__abbr init-hero-ex__abbr--block'
  zAbbr.textContent = 'Z'
  zAbbr.title = 'Zusatzmodifikatoren'
  const zInp = document.createElement('input')
  zInp.type = 'text'
  zInp.className = 'init-hero-ex__zusatz-input'
  zInp.id = `hero-ex-${itemId}-zusatz`
  zInp.autocomplete = 'off'
  zInp.spellcheck = false
  zInp.disabled = !canEdit
  zInp.value = snap.zusatz
  zInp.title = 'Zusatzmodifikatoren'
  zInp.setAttribute('aria-label', 'Zusatzmodifikatoren')
  zusatzCol.append(zAbbr, zInp)

  const iniHold = document.createElement('div')
  iniHold.className = 'init-hero-ex__cell-grid init-hero-ex__cell-grid--ini'
  iniHold.setAttribute('aria-hidden', 'true')

  const swapHold = document.createElement('div')
  swapHold.className = 'init-hero-ex__cell-grid init-hero-ex__cell-grid--swap'
  swapHold.setAttribute('aria-hidden', 'true')

  root.append(
    spacerExp,
    strip,
    gutter,
    zusatzCol,
    iniHold,
    swapHold
  )
  container.appendChild(root)

  if (!canEdit) return

  tpInp.addEventListener('input', () => syncTpFontSize(tpInp))

  const gather = () => ({
    at: at.inp.value,
    pa: pa.inp.value,
    le: le.inp.value,
    ae: ae.inp.value,
    ko: ko.inp.value,
    tp: tpInp.value,
    a: pairA.numInp.value,
    aMod: pairA.modInp.value,
    b: pairB.numInp.value,
    bMod: pairB.modInp.value,
    c: pairC.numInp.value,
    cMod: pairC.modInp.value,
    zusatz: zInp.value,
  })

  const commit = () => {
    void applyHeroExpandFields(itemId, gather())
  }

  for (const inp of [
    at.inp,
    pa.inp,
    le.inp,
    ae.inp,
    ko.inp,
    tpInp,
    pairA.numInp,
    pairA.modInp,
    pairB.numInp,
    pairB.modInp,
    pairC.numInp,
    pairC.modInp,
    zInp,
  ]) {
    inp.addEventListener('blur', commit)
  }
}
