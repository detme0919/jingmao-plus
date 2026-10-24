/// 可切换的强调色（新版设计：品牌色只影响关键元素）
export const ACCENTS = [
  { id: 'indigo', name: '靛蓝' },
  { id: 'teal', name: '青绿' },
  { id: 'violet', name: '紫罗兰' },
  { id: 'orange', name: '活力橙' },
  { id: 'rose', name: '玫红' }
] as const

export type AccentId = (typeof ACCENTS)[number]['id']

export const DEFAULT_ACCENT: AccentId = 'indigo'

export function isAccentId(v: string): v is AccentId {
  return ACCENTS.some((a) => a.id === v)
}
