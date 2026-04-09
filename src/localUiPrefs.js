const SHOW_ACTION_STAMPS_KEY = 'vierp_show_action_stamps_v1'

const listeners = new Set()

export function getShowActionStamps() {
  try {
    const v = localStorage.getItem(SHOW_ACTION_STAMPS_KEY)
    if (v === null) return true
    return v !== '0'
  } catch {
    return true
  }
}

export function setShowActionStamps(show) {
  try {
    localStorage.setItem(SHOW_ACTION_STAMPS_KEY, show ? '1' : '0')
  } catch {
    /* ignore */
  }
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
}

export function onShowActionStampsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
