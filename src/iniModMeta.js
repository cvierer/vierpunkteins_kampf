import OBR from '@owlbear-rodeo/sdk'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const HERO_EX_LE = 'heroExLe'
export const HERO_EX_AU = 'heroExAu'
export const HERO_EX_AE = 'heroExAe'
export const HERO_EX_KE = 'heroExKe'
/** @deprecated Nur Lesen/Migration */
export const HERO_EX_AEKE_LEGACY = 'heroExAeKe'
export const HERO_EX_WUNDEN_ANZ = 'heroExWnAnz'
export const HERO_EX_WUNDEN_ORT = 'heroExWnOrt'
/** @deprecated Nur Lesen/Migration */
export const HERO_EX_WUNDEN_LEGACY = 'heroExWunden'
export const HERO_EX_ZUSATZ = 'heroExZusatz'

function strOrEmpty(v) {
  if (v === undefined || v === null) return ''
  return String(v)
}

function migrateAeKe(meta) {
  let ae = strOrEmpty(meta?.[HERO_EX_AE])
  let ke = strOrEmpty(meta?.[HERO_EX_KE])
  if (ae || ke) return { ae, ke }
  const leg = strOrEmpty(meta?.[HERO_EX_AEKE_LEGACY])
  if (!leg) return { ae: '', ke: '' }
  const m = leg.match(/^(.+?)\s*[/|]\s*(.+)$/)
  if (m) {
    return { ae: m[1].trim(), ke: m[2].trim() }
  }
  return { ae: leg, ke: '' }
}

function migrateWunden(meta) {
  let anz = strOrEmpty(meta?.[HERO_EX_WUNDEN_ANZ])
  let ort = strOrEmpty(meta?.[HERO_EX_WUNDEN_ORT])
  if (anz || ort) return { anz, ort }
  const leg = strOrEmpty(meta?.[HERO_EX_WUNDEN_LEGACY])
  if (!leg) return { anz: '', ort: '' }
  const mm = leg.match(/^(\d+)\s+(.+)$/)
  if (mm) {
    return { anz: mm[1], ort: mm[2].trim() }
  }
  const n = leg.match(/^\d+$/)
  if (n) return { anz: leg, ort: '' }
  return { anz: '', ort: leg }
}

/**
 * @param {Record<string, unknown> | undefined} meta
 */
export function readHeroExpandSnapshot(meta) {
  const { ae, ke } = migrateAeKe(meta)
  const { anz, ort } = migrateWunden(meta)
  return {
    le: strOrEmpty(meta?.[HERO_EX_LE]),
    au: strOrEmpty(meta?.[HERO_EX_AU]),
    ae,
    ke,
    wundenAnz: anz,
    wundenOrt: ort,
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

      setStr(HERO_EX_LE, next.le)
      setStr(HERO_EX_AU, next.au)
      setStr(HERO_EX_AE, next.ae)
      setStr(HERO_EX_KE, next.ke)
      setStr(HERO_EX_WUNDEN_ANZ, next.wundenAnz)
      setStr(HERO_EX_WUNDEN_ORT, next.wundenOrt)
      setStr(HERO_EX_ZUSATZ, next.zusatz)

      delete m[HERO_EX_AEKE_LEGACY]
      delete m[HERO_EX_WUNDEN_LEGACY]
    }
  })
}

/**
 * Wie Token-Zeile: gleiches Raster; unter der Zählerspalte Micro-Felder (1.22rem, 2 Ziffern);
 * Abkürzung darüber, ausführlicher Text im Mouseover (title).
 * @param {HTMLElement} container
 * @param {{ itemId: string, meta: Record<string, unknown> | undefined, canEdit: boolean }} opts
 */
export function mountHeroExpandBlock(container, { itemId, meta, canEdit }) {
  const snap = readHeroExpandSnapshot(meta)
  container.replaceChildren()

  const root = document.createElement('div')
  root.className = 'init-hero-ex'

  const spacerExp = document.createElement('div')
  spacerExp.className = 'init-hero-ex__cell-grid init-hero-ex__cell-grid--expand'
  spacerExp.setAttribute('aria-hidden', 'true')

  const strip = document.createElement('div')
  strip.className = 'init-hero-ex__strip'

  const mkMicro = (abbr, fullName, idSuf, value, maxLen, denseClass, numeric) => {
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
      'init-hero-ex__micro' + (denseClass ? ` ${denseClass}` : '')
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

  const le = mkMicro(
    'LE',
    'Lebensenergie (LE)',
    'le',
    snap.le,
    2,
    '',
    true
  )
  const au = mkMicro(
    'AU',
    'Ausdauer (AU)',
    'au',
    snap.au,
    2,
    '',
    true
  )
  const ae = mkMicro(
    'AE',
    'Astralenergie (AE)',
    'ae',
    snap.ae,
    2,
    '',
    true
  )
  const ke = mkMicro(
    'KE',
    'Karmaenergie (KE)',
    'ke',
    snap.ke,
    2,
    '',
    true
  )
  const wn = mkMicro(
    'W',
    'Anzahl der Wunden',
    'wn',
    snap.wundenAnz,
    2,
    '',
    true
  )
  const wo = mkMicro(
    'Wo',
    'Ort der Wunden',
    'wo',
    snap.wundenOrt,
    4,
    'init-hero-ex__micro--dense',
    false
  )

  strip.append(
    le.cell,
    au.cell,
    ae.cell,
    ke.cell,
    wn.cell,
    wo.cell
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

  const gather = () => ({
    le: le.inp.value,
    au: au.inp.value,
    ae: ae.inp.value,
    ke: ke.inp.value,
    wundenAnz: wn.inp.value,
    wundenOrt: wo.inp.value,
    zusatz: zInp.value,
  })

  const commit = () => {
    void applyHeroExpandFields(itemId, gather())
  }

  for (const inp of [
    le.inp,
    au.inp,
    ae.inp,
    ke.inp,
    wn.inp,
    wo.inp,
    zInp,
  ]) {
    inp.addEventListener('blur', commit)
  }
}
