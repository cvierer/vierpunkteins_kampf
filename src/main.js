import './style.css'
import OBR from '@owlbear-rodeo/sdk'
import { setupContextMenu } from './contextMenu.js'
import { setupInitiativeList } from './initiativeList.js'
import { initCombatRoom } from './combatRoom.js'
import { setupCombatControls } from './combatControls.js'
import { syncActionChrome } from './actionChrome.js'
import { setupTurnMarkerSync } from './turnMarker.js'

document.querySelector('#app').innerHTML = `
  <header class="app-header">
    <h1 class="app-title">vierpunkteins_kampf</h1>
    <div class="combat-bar" data-combat-root>
      <div class="combat-toolbar">
        <button type="button" class="btn btn--primary" data-combat-toggle>Start</button>
        <div class="combat-nav" role="group" aria-label="Zug und Runde">
          <button type="button" class="btn btn--nav" data-combat-prev aria-label="Vorheriger Zug">&lt;</button>
          <span class="combat-round-label" data-combat-round>Kampfrunde —</span>
          <button type="button" class="btn btn--nav" data-combat-next aria-label="Nächster Zug">&gt;</button>
        </div>
      </div>
    </div>
  </header>
  <p id="standalone-hint" class="standalone-hint" hidden></p>
  <div class="kampf-list-section">
    <div class="kampf-list-head" aria-hidden="true">
      <span class="kampf-h-spacer" aria-hidden="true"></span>
      <span class="kampf-h-spacer" aria-hidden="true"></span>
      <span class="kampf-col-label kampf-col-label--name">Name</span>
      <span class="kampf-col-label kampf-col-label--ini">INI</span>
    </div>
    <div class="initiative-list-host" id="initiative-list-host">
      <ul id="initiative-list" class="initiative-list" aria-label="vierpunkteins_kampf"></ul>
    </div>
    <details class="kampf-flow-hint">
      <summary class="kampf-flow-hint__summary">Ablauf am Tisch (DSA&nbsp;4 / INI)</summary>
      <div class="kampf-flow-hint__body">
        <ul class="kampf-flow-hint__list">
          <li>Zu Beginn einer Kampfrunde legt jede Figur fest, wie sie die Runde nutzt (z.&nbsp;B. normal kämpfen oder etwas länger Dauerndes beginnen). Nachträglich umdisponieren ist in der Regel nicht vorgesehen.</li>
          <li>Wer zuerst verkündet, was er tut, hängt von der Spielleitung ab; üblich ist, mit den <strong>langsamen</strong> INI-Werten zu beginnen, damit <strong>schnelle</strong> Figuren darauf reagieren können.</li>
          <li>In der Runde wird in der Reihenfolge der <strong>INI</strong> abgearbeitet (hoch nach niedrig). Beim Herunterzählen spricht man von Initiativphasen.</li>
          <li>Die <strong>+</strong>-Verknüpfungen in der Liste markieren zusätzliche Momente derselben Figur bei einer späteren INI-Stufe (typisch um acht Phasen versetzt); genaue Zahl ist im kleinen Feld einstellbar.</li>
          <li>Sehr kurze Nebenhandlungen (Warnruf, Gegenstand fallen lassen, …) sind begrenzt: üblicherweise höchstens eine solche pro Initiativabschnitt und nicht in derselben Phase wie eine normale Hauptaktion.</li>
          <li>Optionalregeln und Sonderfertigkeiten bleiben Sache der Runde; diese Extension ersetzt kein Regelwerk.</li>
        </ul>
      </div>
    </details>
  </div>
`

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
