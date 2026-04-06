import OBR from '@owlbear-rodeo/sdk'
import { collectSortedParticipants } from './participants.js'
import {
  buildCombatTurnSteps,
  clearEphemeralExtraIniRows,
  combatPatchForStep,
  findCombatStepIndex,
} from './phaseLinks.js'
import {
  beginCombatNavMutation,
  endCombatNavMutation,
  getCombat,
  getIniTieOrder,
  onCombatChange,
  patchCombat,
  RESET_ROUND_INTRO,
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
      if (!c.started) {
        elRound.textContent = 'Kampfrunde —'
      } else if (c.roundIntroPending) {
        const base =
          typeof c.roundIntroPrevRound === 'number' && c.roundIntroPrevRound >= 1
            ? c.roundIntroPrevRound
            : c.round
        elRound.textContent = `Kampfrunde ${base + 1}`
      } else {
        elRound.textContent = `Kampfrunde ${c.round}`
      }
    }

    if (btnNext) {
      btnNext.title = c.started && c.roundIntroPending
        ? 'Ersten Zug der neuen Kampfrunde setzen (höchste INI)'
        : ''
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
        ...RESET_ROUND_INTRO,
      })
      return
    }
    const steps = await combatTurnSteps()
    if (steps.length === 0) return
    await patchCombat({
      started: true,
      round: 1,
      ...RESET_ROUND_INTRO,
      ...combatPatchForStep(steps[0]),
    })
  }

  const applyCombatNext = async () => {
    const c0 = getCombat()
    if (c0.started && c0.roundIntroPending) {
      const stepsCommit = await combatTurnSteps()
      if (stepsCommit.length === 0) {
        await patchCombat({
          started: false,
          round: 1,
          currentItemId: null,
          currentPhaseLinkId: null,
          ...RESET_ROUND_INTRO,
        })
        return
      }
      const targetRound =
        typeof c0.roundIntroPrevRound === 'number' && c0.roundIntroPrevRound >= 1
          ? c0.roundIntroPrevRound + 1
          : c0.round + 1
      beginCombatNavMutation()
      try {
        await clearEphemeralExtraIniRows()
      } finally {
        endCombatNavMutation()
      }
      await patchCombat({
        ...RESET_ROUND_INTRO,
        ...combatPatchForStep(stepsCommit[0]),
        round: targetRound,
      })
      return
    }

    const steps = await combatTurnSteps()
    const c = getCombat()
    if (steps.length === 0) {
      await patchCombat({
        started: false,
        round: 1,
        currentItemId: null,
        currentPhaseLinkId: null,
        ...RESET_ROUND_INTRO,
      })
      return
    }
    const idx = findCombatStepIndex(steps, c)
    if (idx < 0) {
      await patchCombat({
        ...RESET_ROUND_INTRO,
        ...combatPatchForStep(steps[0]),
      })
      return
    }
    const nextIdx = (idx + 1) % steps.length

    if (nextIdx === 0) {
      await patchCombat({
        roundIntroPending: true,
        currentItemId: null,
        currentPhaseLinkId: null,
        roundIntroPrevRound: c.round,
        roundIntroPrevItemId: c.currentItemId,
        roundIntroPrevPhaseLinkId: c.currentPhaseLinkId,
      })
      return
    }

    await patchCombat({
      ...combatPatchForStep(steps[nextIdx]),
      round: c.round,
    })
  }

  const applyCombatPrev = async () => {
    const cIntro = getCombat()
    if (cIntro.started && cIntro.roundIntroPending) {
      await patchCombat({
        roundIntroPending: false,
        round: cIntro.roundIntroPrevRound ?? cIntro.round,
        currentItemId: cIntro.roundIntroPrevItemId,
        currentPhaseLinkId: cIntro.roundIntroPrevPhaseLinkId,
        roundIntroPrevRound: null,
        roundIntroPrevItemId: null,
        roundIntroPrevPhaseLinkId: null,
      })
      return
    }

    const steps = await combatTurnSteps()
    const c = getCombat()
    if (steps.length === 0) {
      await patchCombat({
        started: false,
        round: 1,
        currentItemId: null,
        currentPhaseLinkId: null,
        ...RESET_ROUND_INTRO,
      })
      return
    }
    const idx = findCombatStepIndex(steps, c)
    if (idx < 0) {
      await patchCombat({
        ...RESET_ROUND_INTRO,
        ...combatPatchForStep(steps[0]),
      })
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
