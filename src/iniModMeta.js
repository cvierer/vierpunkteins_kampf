import OBR from '@owlbear-rodeo/sdk'
import {
  clampWound,
  HIT_ZONE_DEFS,
  HZ_KAMPFNOTIZ,
  hzRsKey,
  hzWKey,
  readHitZoneBundle,
} from './hitZoneMeta.js'
import { TRACKER_ITEM_META_KEY } from './participants.js'

export const HERO_EX_LE = 'heroExLe'
export const HERO_EX_LE_MAX = 'heroExLeMax'
export const HERO_EX_AE = 'heroExAe'
export const HERO_EX_AT = 'heroExAt'
export const HERO_EX_PA = 'heroExPa'
/** Konstitution (Eigenschaft), nur in der Eigenschaftenzeile */
export const HERO_EX_KO = 'heroExKo'
export const HERO_EX_TP = 'heroExTp'
/** Ausweichen (AW), Kampfzeile */
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
/** @deprecated Ersetzt durch Trefferzonen hz*; wird beim Speichern entfernt */
export const HERO_EX_WAPPEN_RS = 'heroExWappenRs'
/** @deprecated Ersetzt durch Trefferzonen hz*; wird beim Speichern entfernt */
export const HERO_EX_WAPPEN_WUNDEN = 'heroExWappenW'
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
/** Ausdauer (AU), Heldenblock Trefferzonen-Zeile */
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
    au: strOrEmpty(meta?.[HERO_EX_AU]),
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
    hitZones: readHitZoneBundle(meta, TRACKER_ITEM_META_KEY),
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
      setStr(HERO_EX_AU, next.au)
      setStr(HERO_EX_KO, next.ko)
      setStr(HERO_EX_TP, next.tp)
      setStr(HERO_EX_SP, next.sp)
      setStr(HERO_EX_TZ, String(next.tz ?? ''))
      setStr(HERO_EX_FK, next.fk)
      setStr(HERO_EX_G, next.g)
      setStr(HERO_EX_MU, next.mu)
      setStr(HERO_EX_KL, next.kl)
      setStr(HERO_EX_IN, next.inn)
      setStr(HERO_EX_CH, next.ch)
      setStr(HERO_EX_FF, next.ff)
      setStr(HERO_EX_GE, next.ge)
      setStr(HERO_EX_KK, next.kk)

      if (next.hitZones) {
        const nT = String(next.hitZones.notiz ?? '').trim()
        if (nT === '') delete m[HZ_KAMPFNOTIZ]
        else m[HZ_KAMPFNOTIZ] = nT
        for (const z of HIT_ZONE_DEFS) {
          const zd = next.hitZones.zones?.[z.id]
          const rsT = String(zd?.rs ?? '').trim()
          const w = clampWound(zd?.w ?? 0)
          if (rsT === '') delete m[hzRsKey(z.id)]
          else m[hzRsKey(z.id)] = rsT
          if (w <= 0) delete m[hzWKey(z.id)]
          else m[hzWKey(z.id)] = w
        }
      }

      delete m[HERO_EX_WAPPEN_RS]
      delete m[HERO_EX_WAPPEN_WUNDEN]
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

/** @param {HTMLInputElement} el */
function syncWappenRsFontSize(el) {
  const n = el.value.trim().length
  el.classList.toggle('init-hero-ex__micro--wappen-rs--compact', n >= 2)
}

/**
 * Mini-Wappen pro Trefferzone (RS + 3 Wundmarken).
 * @param {string} itemId
 * @param {boolean} canEdit
 * @param {{ id: string, abbr: string, title: string }} spec
 * @param {{ rs: string, w: number }} zSnap
 */
function mountZoneMiniWappen(itemId, canEdit, spec, zSnap) {
  let wundenCount = Math.min(3, Math.max(0, Math.floor(Number(zSnap.w)) || 0))
  const cell = document.createElement('div')
  cell.className = 'init-hero-ex__micro-cell init-hero-ex__micro-cell--wappen'
  const ab = document.createElement('span')
  ab.className = 'init-hero-ex__abbr'
  ab.textContent = spec.abbr
  ab.title = spec.title
  const wappen = document.createElement('div')
  wappen.className = 'init-hero-ex__wappen'
  wappen.setAttribute('role', 'group')
  wappen.setAttribute(
    'aria-label',
    `${spec.title}: Rüstungsschutz und Wundmarken`
  )
  const chief = document.createElement('div')
  chief.className = 'init-hero-ex__wappen-chief'
  /** @type {HTMLButtonElement[]} */
  const dots = []
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('button')
    dot.type = 'button'
    dot.className = 'init-hero-ex__wappen-dot'
    dot.title = `Wundmarke ${i + 1}: antippen zum Setzen oder Absenken`
    dot.setAttribute('aria-label', `Wundmarke ${i + 1} (${spec.title})`)
    dots.push(dot)
  }
  chief.append(...dots)
  const rsInp = document.createElement('input')
  rsInp.type = 'text'
  rsInp.inputMode = 'numeric'
  rsInp.className = 'init-hero-ex__micro init-hero-ex__micro--wappen-rs'
  rsInp.id = `hero-ex-${itemId}-hz-${spec.id}-rs`
  rsInp.autocomplete = 'off'
  rsInp.spellcheck = false
  rsInp.disabled = !canEdit
  rsInp.value = strOrEmpty(zSnap.rs)
  rsInp.maxLength = 2
  rsInp.title = `${spec.title} — Rüstungsschutz (bis 2 Ziffern)`
  rsInp.setAttribute('aria-label', `${spec.title}, Rüstungsschutz`)
  wappen.append(chief, rsInp)
  cell.append(ab, wappen)

  const syncDots = () => {
    dots.forEach((btn, idx) => {
      const on = idx < wundenCount
      btn.classList.toggle('init-hero-ex__wappen-dot--on', on)
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
    })
  }
  syncDots()
  for (const dot of dots) dot.disabled = !canEdit
  syncWappenRsFontSize(rsInp)

  return {
    cell,
    rsInp,
    dots,
    zoneId: spec.id,
    getWunden: () => wundenCount,
    syncDots,
    bumpWunden(idx) {
      const n = idx + 1
      wundenCount = wundenCount === n ? n - 1 : n
      wundenCount = Math.min(3, Math.max(0, wundenCount))
      syncDots()
    },
  }
}

/**
 * LE + LE max wie Mini-Wappen (RB), vertikal gespiegelt: oben LE (RS-Fläche), unten Max im Chief-Band.
 * @param {string} itemId
 * @param {boolean} canEdit
 * @param {{ le: string, leMax: string }} z
 */
function mountLeMiniWappen(itemId, canEdit, z) {
  const cell = document.createElement('div')
  cell.className = 'init-hero-ex__micro-cell init-hero-ex__micro-cell--wappen'
  const ab = document.createElement('span')
  ab.className = 'init-hero-ex__abbr'
  ab.textContent = 'LE'
  ab.title = 'Lebensenergie (LE) und Maximum (LE max)'

  const wappen = document.createElement('div')
  wappen.className = 'init-hero-ex__wappen init-hero-ex__wappen--le-flip'
  wappen.setAttribute('role', 'group')
  wappen.setAttribute('aria-label', 'Lebensenergie und Lebensenergie Maximum')

  const chiefMax = document.createElement('div')
  chiefMax.className =
    'init-hero-ex__wappen-chief init-hero-ex__wappen-chief--lemax-slot'

  const leMaxInp = document.createElement('input')
  leMaxInp.type = 'text'
  leMaxInp.inputMode = 'numeric'
  leMaxInp.className = 'init-hero-ex__micro init-hero-ex__micro--wappen-lemax'
  leMaxInp.id = `hero-ex-${itemId}-lemax`
  leMaxInp.autocomplete = 'off'
  leMaxInp.spellcheck = false
  leMaxInp.disabled = !canEdit
  leMaxInp.value = strOrEmpty(z.leMax)
  leMaxInp.maxLength = 3
  leMaxInp.title = 'Lebensenergie Maximum (LE max)'
  leMaxInp.setAttribute('aria-label', 'Lebensenergie Maximum (LE max)')
  chiefMax.appendChild(leMaxInp)

  const leInp = document.createElement('input')
  leInp.type = 'text'
  leInp.inputMode = 'numeric'
  leInp.className = 'init-hero-ex__micro init-hero-ex__micro--wappen-rs'
  leInp.id = `hero-ex-${itemId}-le`
  leInp.autocomplete = 'off'
  leInp.spellcheck = false
  leInp.disabled = !canEdit
  leInp.value = strOrEmpty(z.le)
  leInp.maxLength = 2
  leInp.title = 'Lebensenergie (LE)'
  leInp.setAttribute('aria-label', 'Lebensenergie (LE)')

  wappen.append(chiefMax, leInp)
  cell.append(ab, wappen)
  syncWappenRsFontSize(leInp)

  return { cell, leInp, leMaxInp }
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
  const hitZoneNotizFrozen = snap.hitZones.notiz
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
  const ausw = mkMicro('AW', 'Ausweichen (AW)', 'a', snap.a, 2, '', true)

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

  const zoneMidRow = document.createElement('div')
  zoneMidRow.className = 'init-hero-ex__zone-mid'
  /** @type {ReturnType<typeof mountZoneMiniWappen>[]} */
  const zoneUiMid = []
  const ZONE_MID_SPECS = [
    { id: 'kopf', abbr: 'KF', title: 'Kopf und Hals, Trefferzone (WdS)' },
    { id: 'brust', abbr: 'BR', title: 'Brust, Trefferzone (WdS)' },
    { id: 'ruecken', abbr: 'RÜ', title: 'Rücken, Trefferzone (WdS)' },
    {
      id: 'schildarm',
      abbr: 'LA',
      title: 'Linker Arm (Schildarm), Trefferzone (WdS)',
    },
    {
      id: 'schwertarm',
      abbr: 'RA',
      title: 'Rechter Arm (Schwertarm), Trefferzone (WdS)',
    },
    { id: 'bauch', abbr: 'BU', title: 'Bauch, Trefferzone (WdS)' },
    { id: 'lbein', abbr: 'LB', title: 'Linkes Bein, Trefferzone (WdS)' },
    { id: 'rbein', abbr: 'RB', title: 'Rechtes Bein, Trefferzone (WdS)' },
  ]
  for (const spec of ZONE_MID_SPECS) {
    const zSnap = snap.hitZones.zones[spec.id] ?? { rs: '', w: 0 }
    const ui = mountZoneMiniWappen(itemId, canEdit, spec, zSnap)
    zoneUiMid.push(ui)
    zoneMidRow.appendChild(ui.cell)
  }

  const au = mkMicro('AU', 'Ausdauer (AU)', 'au', snap.au, 2, '', true)
  const ae = mkMicro('AE', 'Astralenergie (AE)', 'ae', snap.ae, 2, '', true)
  const { cell: leCell, leInp, leMaxInp } = mountLeMiniWappen(itemId, canEdit, {
    le: snap.le,
    leMax: snap.leMax,
  })

  zoneMidRow.append(au.cell, ae.cell, leCell)

  const spTzUndo = document.createElement('button')
  spTzUndo.type = 'button'
  spTzUndo.className = 'init-hero-ex__sp-tz-label-btn'
  spTzUndo.textContent = '<'
  spTzUndo.title = 'Schadenspunkte: letzte Änderung rückgängig'
  spTzUndo.setAttribute('aria-label', 'Schadenspunkte: rückgängig')
  const spTzRedo = document.createElement('button')
  spTzRedo.type = 'button'
  spTzRedo.className = 'init-hero-ex__sp-tz-label-btn'
  spTzRedo.textContent = '>'
  spTzRedo.title = 'Schadenspunkte: wiederholen'
  spTzRedo.setAttribute('aria-label', 'Schadenspunkte: wiederholen')
  const spTzLabelTools = document.createElement('div')
  spTzLabelTools.className = 'init-hero-ex__sp-tz-pair__label-tools'
  spTzLabelTools.append(spTzUndo, spTzRedo)

  const spTzPair = document.createElement('div')
  spTzPair.className = 'init-hero-ex__sp-tz-pair'
  const spTzLabels = document.createElement('div')
  spTzLabels.className = 'init-hero-ex__sp-tz-pair__labels'
  const spAbbr = document.createElement('span')
  spAbbr.className = 'init-hero-ex__abbr'
  spAbbr.textContent = 'SP'
  spAbbr.title = 'Schadenspunkte (SP)'
  const tzAbbr = document.createElement('span')
  tzAbbr.className = 'init-hero-ex__abbr'
  tzAbbr.textContent = 'TZ'
  tzAbbr.title = 'Trefferzone / Kurznotiz (TZ)'
  spTzLabels.append(spAbbr, spTzLabelTools, tzAbbr)

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
  spTzArrow.className =
    'init-hero-ex__micro init-hero-ex__micro--sp-tz-arrow'
  spTzArrow.textContent = '>'
  spTzArrow.title = 'Trefferzone (TZ): Feld fokussieren'
  spTzArrow.setAttribute('aria-label', 'Trefferzone: Eingabe fokussieren')

  const tzInp = document.createElement('input')
  tzInp.type = 'text'
  tzInp.className = 'init-hero-ex__micro init-hero-ex__micro--sp-tz-inp'
  tzInp.id = `hero-ex-${itemId}-tz`
  tzInp.autocomplete = 'off'
  tzInp.spellcheck = false
  tzInp.disabled = !canEdit
  tzInp.value = snap.tz
  tzInp.maxLength = 12
  tzInp.title = 'Trefferzone / Kurznotiz (TZ)'
  tzInp.setAttribute('aria-label', 'Trefferzone (TZ)')

  const spTzInputs = document.createElement('div')
  spTzInputs.className = 'init-hero-ex__sp-tz-pair__inputs'
  spTzInputs.append(spInp, spTzArrow, tzInp)
  spTzPair.append(spTzLabels, spTzInputs)
  spTzPair.classList.add('init-hero-ex__sp-tz-pair--in-strip')

  strip.append(at.cell, pa.cell, ausw.cell, tpCell, fk.cell, g.cell, spTzPair)

  root.append(leadSpacer, strip, zoneMidRow, spacerExp, attrBlock)
  container.appendChild(root)

  if (!canEdit) {
    spTzUndo.disabled = true
    spTzRedo.disabled = true
    spTzArrow.disabled = true
    return
  }

  spTzArrow.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    tzInp.focus()
    tzInp.select()
  })

  tpInp.addEventListener('input', () => syncTpFontSize(tpInp))

  /** @type {{ sp: string, tz: string }} */
  let spTzCheckpoint = { sp: snap.sp, tz: snap.tz }
  /** @type {{ sp: string, tz: string }[]} */
  const spTzUndoStack = []
  /** @type {{ sp: string, tz: string }[]} */
  const spTzRedoStack = []

  const syncSpTzHistoryButtons = () => {
    spTzUndo.disabled = spTzUndoStack.length === 0
    spTzRedo.disabled = spTzRedoStack.length === 0
  }

  const buildHitZonesPayload = () => {
    const zones = {}
    for (const z of HIT_ZONE_DEFS) {
      const ui = zoneUiMid.find((u) => u.zoneId === z.id)
      if (ui) {
        zones[z.id] = { rs: ui.rsInp.value, w: ui.getWunden() }
      } else {
        zones[z.id] = snap.hitZones.zones[z.id] ?? { rs: '', w: 0 }
      }
    }
    return { notiz: hitZoneNotizFrozen, zones }
  }

  const gather = () => ({
    at: at.inp.value,
    pa: pa.inp.value,
    a: ausw.inp.value,
    le: leInp.value,
    leMax: leMaxInp.value,
    ae: ae.inp.value,
    au: au.inp.value,
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
    hitZones: buildHitZonesPayload(),
  })

  const allZoneUis = [...zoneUiMid]
  for (const ui of allZoneUis) {
    ui.dots.forEach((dot, idx) => {
      dot.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        ui.bumpWunden(idx)
        void applyHeroExpandFields(itemId, gather())
      })
    })
  }

  const commit = () => {
    const g = gather()
    if (g.sp !== spTzCheckpoint.sp || g.tz !== spTzCheckpoint.tz) {
      spTzUndoStack.push({ ...spTzCheckpoint })
      spTzRedoStack.length = 0
      spTzCheckpoint = { sp: g.sp, tz: g.tz }
    }
    syncSpTzHistoryButtons()
    void applyHeroExpandFields(itemId, g)
  }

  const applySpTzPairToScene = (pair) => {
    spInp.value = pair.sp
    tzInp.value = pair.tz
    void applyHeroExpandFields(itemId, gather())
  }

  spTzUndo.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (spTzUndoStack.length === 0) return
    const prev = spTzUndoStack.pop()
    spTzRedoStack.push({ ...spTzCheckpoint })
    spTzCheckpoint = { ...prev }
    applySpTzPairToScene(prev)
    syncSpTzHistoryButtons()
  })

  spTzRedo.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (spTzRedoStack.length === 0) return
    const next = spTzRedoStack.pop()
    spTzUndoStack.push({ ...spTzCheckpoint })
    spTzCheckpoint = { ...next }
    applySpTzPairToScene(next)
    syncSpTzHistoryButtons()
  })

  syncSpTzHistoryButtons()

  for (const ui of allZoneUis) {
    ui.rsInp.addEventListener('input', () => syncWappenRsFontSize(ui.rsInp))
  }
  leInp.addEventListener('input', () => syncWappenRsFontSize(leInp))

  for (const inp of [
    at.inp,
    pa.inp,
    ausw.inp,
    leInp,
    leMaxInp,
    ae.inp,
    au.inp,
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
    ...allZoneUis.map((u) => u.rsInp),
  ]) {
    inp.addEventListener('blur', commit)
  }
}
