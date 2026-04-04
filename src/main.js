import './style.css'
import OBR from '@owlbear-rodeo/sdk'
import { setupContextMenu } from './contextMenu.js'
import { setupInitiativeList } from './initiativeList.js'

document.querySelector('#app').innerHTML = `
  <h1>Initiative</h1>
  <p id="standalone-hint" class="standalone-hint" hidden></p>
  <ul id="initiative-list"></ul>
`

if (OBR.isAvailable) {
  OBR.onReady(() => {
    setupContextMenu()
    setupInitiativeList(document.querySelector('#initiative-list'))
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
