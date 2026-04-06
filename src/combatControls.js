import OBR from '@owlbear-rodeo/sdk'
import { collectSortedParticipants } from './participants.js'
import {
  buildCombatTurnSteps,
  combatPatchForStep,
  findCombatStepIndex,
} from './phaseLinks.js'
import {
  getCombat,
  getIniTieOrder,
  onCombatChange,
  patchCombat,
} from './combatRoom.js'
import { getTrackedParticipantIds } from './listState.js'

async function combatTurnSteps() {
  const items = await OBR.scene.items.getItems()
  const rows = collectSortedParticipants(items, getIniTieOrder())
  return buildCombatTurnSteps(rows, items, getIniTieOrder())
}

function isTypingTarget(el) {
  if (!el || !(el instanceof Element)) return false
  return Boolean(
    el.closest('input, textarea, select, [contenteditable="true"]')
  )
}

export async function setupCombatControls(root) {
  if (!root) {
    return { refreshBar: () => {}, cleanup: () => {} }
  }

  const role = await OBR.player.getRole()
  const isGm = role === 'GM'

  const elRound = root.querySelector('[data-combat-round]')
  const btnToggle = root.querySelector('[data-combat-toggle]')
  const btnPrev = root.querySelector('[data-combat-prev]')
  const btnNext = root.querySelector('[data-combat-next]')

  const setGmDisabled = (btn, disabled) => {
    if (!btn) return
    btn.disabled = disabled
    btn.title = !isGm ? 'Nur Spielleitung' : ''
  }

  const refreshBar = () => {
    const c = getCombat()
    const ids = getTrackedParticipantIds()

    if (btnToggle) {
      btnToggle.textContent = c.started ? 'Beenden' : 'Start'
    }

    if (elRound) {
      elRound.textContent = c.started
        ? `Kampfrunde ${c.round}`
        : 'Kampfrunde —'
    }

    const canNav = isGm && c.started && ids.length > 0
    setGmDisabled(btnToggle, !isGm || (!c.started && ids.length === 0))
    setGmDisabled(btnPrev, !canNav)
    setGmDisabled(btnNext, !canNav)
  }

  const applyCombatStartStop = async () => {
    const c = getCombat()
    if (c.started) {
      await patchCombat({
        started: false,
        round: 1,
        currentItemId: null,
        currentPhaseLinkId: null,
      })
      return
    }
    const steps = await combatTurnSteps()
    if (steps.length === 0) return
    await patchCombat({
      started: true,
      round: 1,
      ...combatPatchForStep(steps[0]),
    })
  }

  const applyCombatNext = async () => {
    const steps = await combatTurnSteps()
    const c = getCombat()
    if (steps.length === 0) {
      await patchCombat({
        started: false,
        currentItemId: null,
        currentPhaseLinkId: null,
        round: 1,
      })
      return
    }
    let idx = findCombatStepIndex(steps, c)
    if (idx < 0) {
      await patchCombat({ ...combatPatchForStep(steps[0]) })
      return
    }
    const nextIdx = (idx + 1) % steps.length
    const round = nextIdx === 0 ? c.round + 1 : c.round
    await patchCombat({ ...combatPatchForStep(steps[nextIdx]), round })
  }

  const applyCombatPrev = async () => {
    const steps = await combatTurnSteps()
    const c = getCombat()
    if (steps.length === 0) {
      await patchCombat({
        started: false,
        currentItemId: null,
        currentPhaseLinkId: null,
        round: 1,
      })
      return
    }
    let idx = findCombatStepIndex(steps, c)
    if (idx < 0) {
      await patchCombat({ ...combatPatchForStep(steps[0]) })
      return
    }
    const prevIdx = (idx - 1 + steps.length) % steps.length
    let round = c.round
    if (idx === 0 && prevIdx === steps.length - 1) {
      round = Math.max(1, c.round - 1)
    }
    await patchCombat({ ...combatPatchForStep(steps[prevIdx]), round })
  }

  btnToggle?.addEventListener('click', () => void applyCombatStartStop())

  btnNext?.addEventListener('click', () => void applyCombatNext())

  btnPrev?.addEventListener('click', () => void applyCombatPrev())

  const onCombatKeyDown = (e) => {
    if (!isGm) return
    if (isTypingTarget(e.target)) return
    const c = getCombat()
    const canNav = c.started && getTrackedParticipantIds().length > 0
    if (!canNav) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      void applyCombatNext()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      void applyCombatPrev()
    }
  }
  document.addEventListener('keydown', onCombatKeyDown)

  const unsub = onCombatChange(refreshBar)
  refreshBar()

  return {
    refreshBar,
    cleanup: () => {
      unsub()
      document.removeEventListener('keydown', onCombatKeyDown)
    },
  }
}
