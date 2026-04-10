import OBR from '@owlbear-rodeo/sdk'
import { TRACKER_ITEM_META_KEY } from './participants.js'

/** Merkfelder zu INI-Modifikatoren (WdS / laufender Kampf), im Tracker-Item-Metadaten-Objekt. */
export const INI_MOD_BE = 'iniWdSBe'
export const INI_MOD_WEAPON = 'iniWdSWaffe'
export const INI_MOD_SF_KAMPFREFLEXE = 'iniWdSSfKr'
export const INI_MOD_SF_KAMPFGESPUER = 'iniWdSSfKg'
export const INI_MOD_SF_KLINGENTAENZER = 'iniWdSSfKt'
export const INI_MOD_WOUNDS = 'iniWdSWunden'
export const INI_MOD_EXHAUSTED = 'iniWdSErschoepft'
export const INI_MOD_TEMP = 'iniWdSTemp'
export const INI_MOD_NOTE = 'iniWdSNotiz'

function strOrEmpty(v) {
  if (v === undefined || v === null) return ''
  return String(v)
}

function readBool(m, key) {
  return m?.[key] === true
}

/**
 * @param {Record<string, unknown> | undefined} meta
 */
export function readIniModSnapshot(meta) {
  return {
    be: strOrEmpty(meta?.[INI_MOD_BE]),
    weapon: strOrEmpty(meta?.[INI_MOD_WEAPON]),
    sfKampfreflexe: readBool(meta, INI_MOD_SF_KAMPFREFLEXE),
    sfKampfgespuer: readBool(meta, INI_MOD_SF_KAMPFGESPUER),
    sfKlingentaenzer: readBool(meta, INI_MOD_SF_KLINGENTAENZER),
    wounds: strOrEmpty(meta?.[INI_MOD_WOUNDS]),
    exhausted: readBool(meta, INI_MOD_EXHAUSTED),
    temp: strOrEmpty(meta?.[INI_MOD_TEMP]),
    note: strOrEmpty(meta?.[INI_MOD_NOTE]),
  }
}

function parseIntField(raw, { allowNegative = true } = {}) {
  const t = String(raw ?? '').trim()
  if (t === '') return null
  const ok = allowNegative ? /^-?\d+$/.test(t) : /^\d+$/.test(t)
  if (!ok) return undefined
  const n = parseInt(t, 10)
  if (!Number.isFinite(n)) return undefined
  if (!allowNegative && n < 0) return undefined
  return n
}

/**
 * @param {string} itemId
 * @param {ReturnType<typeof readIniModSnapshot>} next
 */
export async function applyIniModFields(itemId, next) {
  const beN = parseIntField(next.be, { allowNegative: false })
  const wN = parseIntField(next.weapon, { allowNegative: true })
  const woN = parseIntField(next.wounds, { allowNegative: false })
  const teN = parseIntField(next.temp, { allowNegative: true })

  if (next.be.trim() !== '' && beN === undefined) return
  if (next.weapon.trim() !== '' && wN === undefined) return
  if (next.wounds.trim() !== '' && woN === undefined) return
  if (next.temp.trim() !== '' && teN === undefined) return

  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const d of drafts) {
      const m = d.metadata[TRACKER_ITEM_META_KEY]
      if (!m) continue

      if (next.be.trim() === '' || beN === null) delete m[INI_MOD_BE]
      else m[INI_MOD_BE] = beN

      if (next.weapon.trim() === '' || wN === null) delete m[INI_MOD_WEAPON]
      else m[INI_MOD_WEAPON] = wN

      if (next.sfKampfreflexe) m[INI_MOD_SF_KAMPFREFLEXE] = true
      else delete m[INI_MOD_SF_KAMPFREFLEXE]

      if (next.sfKampfgespuer) m[INI_MOD_SF_KAMPFGESPUER] = true
      else delete m[INI_MOD_SF_KAMPFGESPUER]

      if (next.sfKlingentaenzer) m[INI_MOD_SF_KLINGENTAENZER] = true
      else delete m[INI_MOD_SF_KLINGENTAENZER]

      if (next.wounds.trim() === '' || woN === null) delete m[INI_MOD_WOUNDS]
      else m[INI_MOD_WOUNDS] = woN

      if (next.exhausted) m[INI_MOD_EXHAUSTED] = true
      else delete m[INI_MOD_EXHAUSTED]

      if (next.temp.trim() === '' || teN === null) delete m[INI_MOD_TEMP]
      else m[INI_MOD_TEMP] = teN

      const noteT = next.note.trim()
      if (noteT === '') delete m[INI_MOD_NOTE]
      else m[INI_MOD_NOTE] = noteT
    }
  })
}

/**
 * Baut die INI-Merkfelder in `container` (für ausgeklappte Token-Zeile).
 * @param {HTMLElement} container
 * @param {{ itemId: string, meta: Record<string, unknown> | undefined, canEdit: boolean }} opts
 */
export function mountIniModifierBlock(container, { itemId, meta, canEdit }) {
  const snap = readIniModSnapshot(meta)
  container.replaceChildren()

  const root = document.createElement('div')
  root.className = 'init-ini-mod'

  const intro = document.createElement('p')
  intro.className = 'init-ini-mod__intro'
  intro.textContent =
    'Hilfsfelder nach Wege des Schwerts (WdS): Modifikatoren für die Initiative im Kampf. Die eigentliche Listen-INI steht oben in der Zeile.'

  const mkSection = (titleText) => {
    const sec = document.createElement('div')
    sec.className = 'init-ini-mod__section'
    const h = document.createElement('div')
    h.className = 'init-ini-mod__section-title'
    h.textContent = titleText
    sec.appendChild(h)
    return sec
  }

  const mkField = (idSuffix, labelText, title, inputEl) => {
    const w = document.createElement('div')
    w.className = 'init-ini-mod__field'
    const lab = document.createElement('label')
    lab.className = 'init-ini-mod__label'
    lab.htmlFor = `ini-wds-${itemId}-${idSuffix}`
    lab.textContent = labelText
    inputEl.id = `ini-wds-${itemId}-${idSuffix}`
    inputEl.className = 'init-ini-mod__input'
    inputEl.disabled = !canEdit
    if (title) inputEl.title = title
    w.append(lab, inputEl)
    return w
  }

  const sec1 = mkSection('Grundmodifikatoren')
  const grid1 = document.createElement('div')
  grid1.className = 'init-ini-mod__grid init-ini-mod__grid--2'
  const inpBe = document.createElement('input')
  inpBe.type = 'text'
  inpBe.inputMode = 'numeric'
  inpBe.autocomplete = 'off'
  inpBe.spellcheck = false
  inpBe.value = snap.be
  inpBe.title =
    'Behinderung der Rüstung: von der INI abziehen (WdS: BE, nicht eBE). Rüstungsgewöhnung mindert BE.'
  grid1.appendChild(
    mkField('be', 'BE (Behinderung)', inpBe.title, inpBe)
  )
  const inpWpn = document.createElement('input')
  inpWpn.type = 'text'
  inpWpn.inputMode = 'numeric'
  inpWpn.autocomplete = 'off'
  inpWpn.spellcheck = false
  inpWpn.value = snap.weapon
  inpWpn.title =
    'INI-Modifikator der geführten Waffe (WdS: üblicherweise −3 bis +3 laut Waffenliste).'
  grid1.appendChild(
    mkField('waffe', 'Waffen-INI-Mod.', inpWpn.title, inpWpn)
  )
  sec1.appendChild(grid1)

  const sec2 = mkSection('Sonderfertigkeiten (INI)')
  const checks = document.createElement('div')
  checks.className = 'init-ini-mod__checks'
  const mkCheck = (idSuf, role, label, checked, title) => {
    const row = document.createElement('label')
    row.className = 'init-ini-mod__check-row'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = checked
    cb.disabled = !canEdit
    cb.id = `ini-wds-${itemId}-${idSuf}`
    cb.dataset.iniWdsRole = role
    if (title) cb.title = title
    const span = document.createElement('span')
    span.textContent = label
    row.append(cb, span)
    return row
  }
  checks.append(
    mkCheck(
      'sf-kr',
      'kr',
      'Kampfreflexe (+4 INI)',
      snap.sfKampfreflexe,
      'WdS: +4 auf den Initiative-Wert.'
    ),
    mkCheck(
      'sf-kg',
      'kg',
      'Kampfgespür (+2 INI)',
      snap.sfKampfgespuer,
      'WdS: weitere +2 INI (kumulativ mit Kampfreflexen).'
    ),
    mkCheck(
      'sf-kt',
      'kt',
      'Klingentänzer (Initiative 2W6)',
      snap.sfKlingentaenzer,
      'WdS: Nahkämpfer mit dieser SF würfeln 2W6 statt 1W6 für die Initiative.'
    )
  )
  sec2.appendChild(checks)

  const sec3 = mkSection('Wunden & Zustand')
  const grid3 = document.createElement('div')
  grid3.className = 'init-ini-mod__grid init-ini-mod__grid--2'
  const inpW = document.createElement('input')
  inpW.type = 'text'
  inpW.inputMode = 'numeric'
  inpW.autocomplete = 'off'
  inpW.spellcheck = false
  inpW.value = snap.wounds
  inpW.title =
    'WdS: je Wunde −2 auf INI-Basis (und AT/PA/FK-Basis, GS −1).'
  grid3.appendChild(
    mkField('wunden', 'Wunden (Anzahl)', inpW.title, inpW)
  )
  const exhRow = document.createElement('label')
  exhRow.className = 'init-ini-mod__check-row init-ini-mod__check-row--solo'
  const exh = document.createElement('input')
  exh.type = 'checkbox'
  exh.checked = snap.exhausted
  exh.disabled = !canEdit
  exh.id = `ini-wds-${itemId}-ersch`
  exh.title =
    'WdS: Erschöpfung, sehr niedrige LE und Wunden können INI und Handlungen beeinflussen (siehe Kampfunfähigkeit / Wunden).'
  const exhSpan = document.createElement('span')
  exhSpan.textContent = 'Erschöpft / starke Erschöpfung (Merker)'
  exhRow.append(exh, exhSpan)
  grid3.appendChild(exhRow)
  sec3.appendChild(grid3)

  const sec4 = mkSection('Laufender Kampf (temporär)')
  const grid4 = document.createElement('div')
  grid4.className = 'init-ini-mod__grid init-ini-mod__grid--1'
  const inpTemp = document.createElement('input')
  inpTemp.type = 'text'
  inpTemp.inputMode = 'text'
  inpTemp.autocomplete = 'off'
  inpTemp.spellcheck = false
  inpTemp.value = snap.temp
  inpTemp.title =
    'Summe temporärer INI-Änderungen: z. B. Zauber, Patzer/Sturz, Ende Ausfall (−1W6), Befreiungsschlag getroffen (−1W6), Bodenwurf misslungen (−1W6), Schaden/Wunde in dieser Runde.'
  grid4.appendChild(
    mkField('temp', 'INI ± (temporär, ganze Zahl)', inpTemp.title, inpTemp)
  )
  sec4.appendChild(grid4)
  const noteWrap = document.createElement('div')
  noteWrap.className = 'init-ini-mod__field'
  const noteLab = document.createElement('label')
  noteLab.className = 'init-ini-mod__label'
  noteLab.htmlFor = `ini-wds-${itemId}-note`
  noteLab.textContent = 'Kurznotiz (Zauber, Manöver, Orientieren …)'
  const noteTa = document.createElement('textarea')
  noteTa.id = `ini-wds-${itemId}-note`
  noteTa.className = 'init-ini-mod__textarea'
  noteTa.rows = 2
  noteTa.disabled = !canEdit
  noteTa.value = snap.note
  noteTa.title =
    'Freitext: z. B. „Blick über den Kampf“ (Orientieren), aktive Zauber auf INI, optional Überzahl (WdS S. 80).'
  noteWrap.append(noteLab, noteTa)
  sec4.appendChild(noteWrap)

  const hint = document.createElement('p')
  hint.className = 'init-ini-mod__hint'
  hint.textContent =
    'Orientieren (WdS): mit zwei Aktionen (eine mit SF Aufmerksamkeit) INI aus Kampfaktionen zurückholen – nicht für INI-Verlust durch Wunden oder Zauber. INI unter 0: nur noch eine Angriffsaktion pro Runde.'

  root.append(intro, sec1, sec2, sec3, sec4, hint)
  container.appendChild(root)

  if (!canEdit) return

  const gather = () => ({
    be: inpBe.value,
    weapon: inpWpn.value,
    sfKampfreflexe:
      checks.querySelector('input[data-ini-wds-role="kr"]')?.checked ?? false,
    sfKampfgespuer:
      checks.querySelector('input[data-ini-wds-role="kg"]')?.checked ?? false,
    sfKlingentaenzer:
      checks.querySelector('input[data-ini-wds-role="kt"]')?.checked ?? false,
    wounds: inpW.value,
    exhausted: exh.checked,
    temp: inpTemp.value,
    note: noteTa.value,
  })

  const commit = () => {
    void applyIniModFields(itemId, gather())
  }

  inpBe.addEventListener('blur', commit)
  inpWpn.addEventListener('blur', commit)
  inpW.addEventListener('blur', commit)
  inpTemp.addEventListener('blur', commit)
  noteTa.addEventListener('blur', commit)
  for (const cb of checks.querySelectorAll('input[type="checkbox"]')) {
    cb.addEventListener('change', commit)
  }
  exh.addEventListener('change', commit)
}
