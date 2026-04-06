/** Kleine Vorhängeschloss-SVGs für die zusätzliche-INI-Zeile (currentColor). */

export function zaoPadlockInnerHtml(expiresNextRound) {
  if (expiresNextRound) {
    return ZAO_PADLOCK_OPEN
  }
  return ZAO_PADLOCK_LOCKED
}

const ZAO_PADLOCK_LOCKED = `<svg class="init-row-zao-padlock__icon" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" d="M7 11V8a5 5 0 0110 0v3"/><rect x="5" y="11" width="14" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.65"/></svg>`

const ZAO_PADLOCK_OPEN = `<svg class="init-row-zao-padlock__icon" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" d="M7 11V8a5 5 0 019.2-2.3"/><rect x="5" y="11" width="14" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.65"/></svg>`
