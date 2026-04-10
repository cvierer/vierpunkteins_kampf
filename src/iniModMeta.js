import OBR from '@owlbear-rodeo/sdk'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const HERO_EX_LE = 'heroExLe'
export const HERO_EX_AE = 'heroExAe'
export const HERO_EX_AT = 'heroExAt'
export const HERO_EX_PA = 'heroExPa'
export const HERO_EX_KO = 'heroExKo'
export const HERO_EX_TP = 'heroExTp'
export const HERO_EX_A = 'heroExA'
export const HERO_EX_B = 'heroExB'
export const HERO_EX_C = 'heroExC'
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
    ae: strOrEmpty(meta?.[HERO_EX_AE]),
    ko: strOrEmpty(meta?.[HERO_EX_KO]),
    tp: strOrEmpty(meta?.[HERO_EX_TP]),
    a: strOrEmpty(meta?.[HERO_EX_A]),
    b: strOrEmpty(meta?.[HERO_EX_B]),
    c: strOrEmpty(meta?.[HERO_EX_C]),
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
      setStr(HERO_EX_B, next.b)
      setStr(HERO_EX_C, next.c)

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
 * Eine Zeile Micro-Kästchen (AT … C), ausgerichtet unter der Initiative-Zeile.
 * @param {HTMLElement} container
 * @param {{ itemId: string, meta: Record<string, unknown> | undefined, canEdit: boolean }} opts
 */
export function mountHeroExpandBlock(container, { itemId, meta, canEdit }) {
  const snap = readHeroExpandSnapshot(meta)
  container.replaceChildren()

  const root = document.createElement('div')
  root.className = 'init-hero-ex init-hero-ex--single-row'

  const spacerExp = document.createElement('div')
  spacerExp.className = 'init-hero-ex__lead'
  spacerExp.setAttribute('aria-hidden', 'true')

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

  const a = mkMicro('A', 'Feld A', 'a', snap.a, 2, '', true)
  const b = mkMicro('B', 'Feld B', 'b', snap.b, 2, '', true)
  const c = mkMicro('C', 'Feld C', 'c', snap.c, 2, '', true)

  strip.append(
    at.cell,
    pa.cell,
    le.cell,
    ae.cell,
    ko.cell,
    tpCell,
    a.cell,
    b.cell,
    c.cell
  )

  root.append(spacerExp, strip)
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
    a: a.inp.value,
    b: b.inp.value,
    c: c.inp.value,
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
    a.inp,
    b.inp,
    c.inp,
  ]) {
    inp.addEventListener('blur', commit)
  }
}
