import { create } from 'zustand'
import { DEFAULT_ACCENT, isAccentId, type AccentId } from '@/theme/accents'

const KEY = 'jm_accent'

function loadAccent(): AccentId {
  try {
    const saved = localStorage.getItem(KEY)
    return saved && isAccentId(saved) ? saved : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

interface ThemeState {
  accent: AccentId
  setAccent: (id: AccentId) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  accent: loadAccent(),
  setAccent: (id) => {
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* 忽略 */
    }
    set({ accent: id })
  }
}))

/** 把当前主题写到 <html data-accent>，App 挂载时调用 */
export function applyAccent(id: AccentId) {
  document.documentElement.dataset.accent = id
}
