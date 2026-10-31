/// 应用主题：河南经贸职业学院品牌蓝（固定）
export const ACCENTS = [
  { id: 'jmblue', name: '经贸蓝' }
] as const

export type AccentId = (typeof ACCENTS)[number]['id']

export const DEFAULT_ACCENT: AccentId = 'jmblue'

export function isAccentId(v: string): v is AccentId {
  return ACCENTS.some((a) => a.id === v)
}
