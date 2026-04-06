import './style.css'
import { BUILD_VERSION } from './buildVersion.js'
import OBR from '@owlbear-rodeo/sdk'
import { setupContextMenu } from './contextMenu.js'
import { setupInitiativeList } from './initiativeList.js'
import { initCombatRoom } from './combatRoom.js'
import { setupCombatControls } from './combatControls.js'
import { syncActionChrome } from './actionChrome.js'
import { setupTurnMarkerSync } from './turnMarker.js'

const appRoot = document.querySelector('#app')
appRoot.innerHTML = `
  <header class="app-header">
    <div class="combat-bar" data-combat-root>
      <div class="combat-toolbar">
        <button type="button" class="btn btn--primary" data-combat-toggle>Start</button>
        <div class="combat-nav" role="group" aria-label="Zug und Runde">
          <button type="button" class="btn btn--nav" data-combat-prev aria-label="Vorheriger Zug">Zurück</button>
          <span class="combat-round-label" data-combat-round>Kampfrunde —</span>
          <button type="button" class="btn btn--nav" data-combat-next aria-label="Nächster Zug">Weiter</button>
        </div>
      </div>
    </div>
  </header>
  <p id="standalone-hint" class="standalone-hint" hidden></p>
  <div class="kampf-list-section">
    <div class="kampf-list-head" aria-hidden="true">
      <span
        class="kampf-col-label kampf-col-label--za"
        title="Zusätzliche Aktion"
        >z.A.</span>
      <span class="kampf-h-spacer" aria-hidden="true"></span>
      <span class="kampf-col-label kampf-col-label--name">Name</span>
      <span class="kampf-col-label kampf-col-label--ini">INI</span>
      <span class="kampf-h-spacer kampf-h-spacer--swap" aria-hidden="true"></span>
    </div>
    <div class="initiative-list-host" id="initiative-list-host">
      <div class="initiative-list-scroll">
        <div class="initiative-list-scroll-inner">
          <div
            class="kampf-round-intro-banner"
            data-kampf-round-intro
            hidden
            role="status"
            aria-live="polite"
          >
            <span class="kampf-round-intro-banner__text" data-kampf-round-intro-label></span>
          </div>
          <ul id="initiative-list" class="initiative-list" aria-label="vierpunkteins_kampf"></ul>
        </div>
      </div>
    </div>
    <div id="kampf-build-version" class="kampf-build-version" aria-hidden="true"></div>
  </div>
`
const buildVerEl = document.getElementById('kampf-build-version')
if (buildVerEl) {
  buildVerEl.textContent = `V. ${BUILD_VERSION}`
}

if (OBR.isAvailable) {
  OBR.onReady(async () => {
    await initCombatRoom()
    const combatRoot = document.querySelector('[data-combat-root]')
    const { refreshBar } = await setupCombatControls(combatRoot)
    setupTurnMarkerSync()
    setupContextMenu()
    setupInitiativeList(document.querySelector('#initiative-list'), {
      onListChange: (items) => {
        refreshBar()
        if (items) void syncActionChrome(items)
      },
    })
  })
} else {
  const hint = document.querySelector('#standalone-hint')
  hint.hidden = false
  hint.innerHTML = `
    <strong>Nur Vorschau im Browser:</strong> Ohne Owlbear Rodeo gibt es keine Szene und kein SDK –
    die Liste bleibt leer. Zum Testen die Extension in Owlbear einbinden.
    <br /><br />
    <strong>„Failed to fetch“:</strong> Owlbear nutzt HTTPS. Verwende die Manifest-URL mit
    <strong>https://</strong> (z.&nbsp;B. nach <code>npm run dev</code>:
    <code>https://localhost:5173/manifest.json</code>) und bestätige das selbstsignierte Zertifikat einmal im Browser.
    Reine <code>http://</code>-Links blockiert der Browser oft (Mixed Content).
  `
}
