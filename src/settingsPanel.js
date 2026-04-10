import OBR from '@owlbear-rodeo/sdk'
import { isGmSync } from './editAccess.js'
import {
  getShowActionStamps,
  onShowActionStampsChange,
  setShowActionStamps,
} from './localUiPrefs.js'
import {
  getRoomSettings,
  onRoomSettingsChange,
  patchRoomSettings,
} from './roomSettings.js'

export const KAMPF_GEAR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`

/**
 * Zahnrad im Listen-Footer (links); GM bearbeitet, Spieler nur lesen.
 * @param {HTMLElement | null} gearHost Eltern-Container (z. B. #kampf-settings-gear-host)
 * @returns {() => void} Aufräumen
 */
export function setupSettingsPanel(gearHost) {
  if (!gearHost) return () => {}

  const gear = document.createElement('button')
  gear.type = 'button'
  gear.className = 'kampf-settings-gear'
  gear.innerHTML = KAMPF_GEAR_ICON_SVG
  gear.title = 'Einstellungen'
  gear.setAttribute('aria-label', 'Einstellungen öffnen')
  gearHost.appendChild(gear)

  const backdrop = document.createElement('div')
  backdrop.className = 'kampf-settings-backdrop'
  backdrop.hidden = true
  backdrop.setAttribute('aria-hidden', 'true')
  backdrop.style.display = 'none'

  const panel = document.createElement('div')
  panel.className = 'kampf-settings-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-labelledby', 'kampf-settings-title')

  panel.innerHTML = `
    <h2 class="kampf-settings-panel__title" id="kampf-settings-title">Kampf-Einstellungen</h2>
    <p class="kampf-settings-panel__hint" data-kampf-settings-role-hint></p>
    <div class="kampf-settings-panel__section">
      <label class="kampf-settings-checkbox-label">
        <input type="checkbox" data-kampf-setting-high-ini-fa />
        <span>Optionalregel <cite>Wege des Schwertes</cite>: <strong>Hohe Initiative</strong> — bei INI über 20, 30 bzw. 40 je eine zusätzliche Freie Aktion (Obergrenze 5 statt 2).</span>
      </label>
    </div>
    <div class="kampf-settings-panel__section">
      <label class="kampf-settings-checkbox-label">
        <input type="checkbox" data-kampf-setting-show-action-stamps />
        <span><strong>Aktionsstempel</strong> in der Initiative-Liste anzeigen (horizontale Linien zu Angriff, Abwehr, S.R.A. und F.A.). Gilt nur auf deinem Gerät; SL und Spieler können das unabhängig einstellen.</span>
      </label>
    </div>
    <div class="kampf-settings-panel__section kampf-settings-panel__future">
      <h3 class="kampf-settings-panel__sub">Weitere Ideen (noch nicht umgesetzt)</h3>
      <ul class="kampf-settings-panel__ideas">
        <li>Abstand der L.H.-Auslöser-INI zum Heldenwert (statt fest 8)</li>
        <li>Ob S.R.A. / Ang. / Abw. pro KR begrenzt oder unbegrenzt gezählt werden</li>
        <li>Automatische Kampfrunden-Stempel oder Würfelprotokoll</li>
        <li>Sichtbarkeit: nur GM sieht bestimmte Spalten</li>
        <li>INI-Schwellen der Hohen Initiative anpassbar (20/30/40)</li>
      </ul>
    </div>
    <button type="button" class="btn kampf-settings-panel__close" data-kampf-settings-close>Schließen</button>
  `

  backdrop.appendChild(panel)
  document.body.appendChild(backdrop)

  const highIniCb = panel.querySelector('[data-kampf-setting-high-ini-fa]')
  const stampsCb = panel.querySelector('[data-kampf-setting-show-action-stamps]')
  const roleHint = panel.querySelector('[data-kampf-settings-role-hint]')
  const closeBtn = panel.querySelector('button.kampf-settings-panel__close')

  const syncUi = () => {
    const s = getRoomSettings()
    if (highIniCb instanceof HTMLInputElement) {
      highIniCb.checked = s.highIniFreeActions
      highIniCb.disabled = !isGmSync()
    }
    if (stampsCb instanceof HTMLInputElement) {
      stampsCb.checked = getShowActionStamps()
      stampsCb.disabled = false
    }
    if (roleHint) {
      roleHint.textContent = isGmSync()
        ? 'Als Spielleitung kannst du die kampfbezogenen Raum-Optionen ändern; alle Spieler sehen dieselben Werte. „Aktionsstempel“ ist eine persönliche Anzeige-Option (nur bei dir).'
        : 'Nur die Spielleitung kann die Raum-Option oben ändern. „Aktionsstempel“ kannst du selbst für deine Ansicht ein- oder ausschalten.'
    }
  }

  const closePanel = () => {
    backdrop.hidden = true
    backdrop.setAttribute('aria-hidden', 'true')
    backdrop.style.display = 'none'
    gear.focus()
  }

  const openPanel = () => {
    syncUi()
    backdrop.hidden = false
    backdrop.style.display = 'flex'
    backdrop.setAttribute('aria-hidden', 'false')
    closeBtn?.focus()
  }

  gear.addEventListener('click', (e) => {
    e.preventDefault()
    openPanel()
  })

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      closePanel()
    })
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePanel()
  })

  const onDocKey = (e) => {
    if (e.key === 'Escape' && !backdrop.hidden) {
      e.preventDefault()
      closePanel()
    }
  }
  document.addEventListener('keydown', onDocKey)

  highIniCb?.addEventListener('change', () => {
    if (!isGmSync() || !(highIniCb instanceof HTMLInputElement)) return
    void patchRoomSettings((cur) => ({
      ...cur,
      highIniFreeActions: highIniCb.checked,
    }))
  })

  stampsCb?.addEventListener('change', () => {
    if (!(stampsCb instanceof HTMLInputElement)) return
    setShowActionStamps(stampsCb.checked)
  })

  const offSettings = onRoomSettingsChange(() => {
    if (!backdrop.hidden) syncUi()
  })

  const offStampPref = onShowActionStampsChange(() => {
    if (!backdrop.hidden && stampsCb instanceof HTMLInputElement) {
      stampsCb.checked = getShowActionStamps()
    }
  })

  const offPlayer = OBR.player.onChange(() => {
    if (!backdrop.hidden) syncUi()
  })

  return () => {
    document.removeEventListener('keydown', onDocKey)
    offSettings()
    offStampPref()
    offPlayer()
    gear.remove()
    backdrop.remove()
  }
}
