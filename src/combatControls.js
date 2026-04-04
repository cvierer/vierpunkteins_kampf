import OBR from '@owlbear-rodeo/sdk'
import { collectSortedParticipants } from './participants.js'
import { getCombat, onCombatChange, patchCombat } from './combatRoom.js'
import { getTrackedParticipantIds } from './listState.js'

async function sortedIds() {
  const items = await OBR.scene.items.getItems()
  return collectSortedParticipants(items).map((r) => r.id)
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

  btnToggle?.addEventListener('click', async () => {
    const c = getCombat()
    if (c.started) {
      await patchCombat({
        started: false,
        round: 1,
        currentItemId: null,
      })
      return
    }
    const ids = await sortedIds()
    if (ids.length === 0) return
    await patchCombat({
      started: true,
      round: 1,
      currentItemId: ids[0],
    })
  })

  btnNext?.addEventListener('click', async () => {
    const ids = await sortedIds()
    const c = getCombat()
    if (ids.length === 0) {
      await patchCombat({ started: false, currentItemId: null, round: 1 })
      return
    }
    const idx = ids.indexOf(c.currentItemId)
    if (idx < 0) {
      await patchCombat({ currentItemId: ids[0] })
      return
    }
    const nextIdx = (idx + 1) % ids.length
    const round = nextIdx === 0 ? c.round + 1 : c.round
    await patchCombat({ currentItemId: ids[nextIdx], round })
  })

  btnPrev?.addEventListener('click', async () => {
    const ids = await sortedIds()
    const c = getCombat()
    if (ids.length === 0) {
      await patchCombat({ started: false, currentItemId: null, round: 1 })
      return
    }
    const idx = ids.indexOf(c.currentItemId)
    if (idx < 0) {
      await patchCombat({ currentItemId: ids[0] })
      return
    }
    const prevIdx = (idx - 1 + ids.length) % ids.length
    let round = c.round
    if (idx === 0 && prevIdx === ids.length - 1) {
      round = Math.max(1, c.round - 1)
    }
    await patchCombat({ currentItemId: ids[prevIdx], round })
  })

  const unsub = onCombatChange(refreshBar)
  refreshBar()

  return {
    refreshBar,
    cleanup: () => {
      unsub()
    },
  }
}
