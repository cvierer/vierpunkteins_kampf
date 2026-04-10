import OBR from '@owlbear-rodeo/sdk'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const HERO_EX_LE = 'heroExLe'
export const HERO_EX_AU = 'heroExAu'
export const HERO_EX_AEKE = 'heroExAeKe'
export const HERO_EX_WUNDEN = 'heroExWunden'
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
    le: strOrEmpty(meta?.[HERO_EX_LE]),
    au: strOrEmpty(meta?.[HERO_EX_AU]),
    aeKe: strOrEmpty(meta?.[HERO_EX_AEKE]),
    wunden: strOrEmpty(meta?.[HERO_EX_WUNDEN]),
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

      const leT = next.le.trim()
      if (leT === '') delete m[HERO_EX_LE]
      else m[HERO_EX_LE] = leT

      const auT = next.au.trim()
      if (auT === '') delete m[HERO_EX_AU]
      else m[HERO_EX_AU] = auT

      const akT = next.aeKe.trim()
      if (akT === '') delete m[HERO_EX_AEKE]
      else m[HERO_EX_AEKE] = akT

      const wT = next.wunden.trim()
      if (wT === '') delete m[HERO_EX_WUNDEN]
      else m[HERO_EX_WUNDEN] = wT

      const zT = next.zusatz.trim()
      if (zT === '') delete m[HERO_EX_ZUSATZ]
      else m[HERO_EX_ZUSATZ] = zT
    }
  })
}

/**
 * Ausklappbarer Heldenbereich: links Kästchen (Größe wie KR-Zähler), rechts Beschriftung + Feld.
 * @param {HTMLElement} container
 * @param {{ itemId: string, meta: Record<string, unknown> | undefined, canEdit: boolean }} opts
 */
export function mountHeroExpandBlock(container, { itemId, meta, canEdit }) {
  const snap = readHeroExpandSnapshot(meta)
  container.replaceChildren()

  const root = document.createElement('div')
  root.className = 'init-hero-ex'

  const mkRow = (boxAbbr, boxTitle, labelText, idSuffix, field, multiline) => {
    const row = document.createElement('div')
    row.className = 'init-hero-ex__row'

    const box = document.createElement('div')
    box.className = 'init-hero-ex__box'
    box.setAttribute('aria-hidden', 'true')
    box.title = boxTitle
    box.textContent = boxAbbr

    const fields = document.createElement('div')
    fields.className = 'init-hero-ex__fields'

    const lab = document.createElement('label')
    lab.className = 'init-hero-ex__label'
    const fid = `hero-ex-${itemId}-${idSuffix}`
    lab.htmlFor = fid
    lab.textContent = labelText

    let input
    if (multiline) {
      input = document.createElement('textarea')
      input.className = 'init-hero-ex__textarea'
      input.rows = 2
      input.spellcheck = false
    } else {
      input = document.createElement('input')
      input.type = 'text'
      input.className = 'init-hero-ex__input'
      input.autocomplete = 'off'
      input.spellcheck = false
    }
    input.id = fid
    input.disabled = !canEdit
    input.value = snap[field]

    fields.append(lab, input)
    row.append(box, fields)
    return { row, input }
  }

  const r1 = mkRow(
    'LE',
    'Lebensenergie',
    'Lebensenergie (LE)',
    'le',
    'le',
    false
  )
  const r2 = mkRow(
    'AU',
    'Ausdauer',
    'Ausdauer (AU)',
    'au',
    'au',
    false
  )
  const r3 = mkRow(
    'A/K',
    'Astralenergie oder Karmaenergie',
    'Astralenergie (AE) / Karmaenergie (KE)',
    'aeke',
    'aeKe',
    false
  )
  const r4 = mkRow(
    'W',
    'Anzahl und Ort der Wunden',
    'Anzahl und Ort der Wunden',
    'wunden',
    'wunden',
    true
  )
  const r5 = mkRow(
    'Z',
    'Zusatzmodifikatoren',
    'Zusatzmodifikatoren',
    'zusatz',
    'zusatz',
    true
  )

  root.append(
    r1.row,
    r2.row,
    r3.row,
    r4.row,
    r5.row
  )
  container.appendChild(root)

  if (!canEdit) return

  const gather = () => ({
    le: r1.input.value,
    au: r2.input.value,
    aeKe: r3.input.value,
    wunden: r4.input.value,
    zusatz: r5.input.value,
  })

  const commit = () => {
    void applyHeroExpandFields(itemId, gather())
  }

  for (const inp of [r1.input, r2.input, r3.input, r4.input, r5.input]) {
    inp.addEventListener('blur', commit)
  }
}
