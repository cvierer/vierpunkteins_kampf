import './style.css'
import OBR from '@owlbear-rodeo/sdk'
import { setupContextMenu } from './contextMenu.js'
import { setupInitiativeList } from './initiativeList.js'
import { initCombatRoom } from './combatRoom.js'
import { setupCombatControls } from './combatControls.js'
import { syncActionChrome } from './actionChrome.js'

document.querySelector('#app').innerHTML = `
  <header class="app-header">
    <h1 class="app-title">Initiative</h1>
    <div class="combat-bar" data-combat-root>
      <span class="combat-round" data-combat-round>Kampf aus</span>
      <div class="combat-actions">
        <button type="button" class="btn btn--primary" data-combat-start>Beginnen</button>
        <button type="button" class="btn" data-combat-prev>Zurück</button>
        <button type="button" class="btn" data-combat-next>Weiter</button>
        <button type="button" class="btn btn--ghost" data-combat-end>Beenden</button>
      </div>
    </div>
  </header>
  <p id="standalone-hint" class="standalone-hint" hidden></p>
  <ul id="initiative-list" class="initiative-list" aria-label="Initiativeliste"></ul>
`

if (OBR.isAvailable) {
  OBR.onReady(async () => {
    await initCombatRoom()
    const combatRoot = document.querySelector('[data-combat-root]')
    const { refreshBar } = await setupCombatControls(combatRoot)
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
