/** 与 Rust store 键对应的类型化访问（语义沿用旧版 jm_* 键） */
import { api } from '@/api'
import type { CourseTable, ManualCourse, Person, TokenRecord } from '@/types'

export type { ManualCourse }

export const KEYS = {
  loginToken: 'login_token',
  registerLink: 'register_link',
  registerMode: 'register_mode',
  person: 'person',
  kqAuth: 'kq_auth',
  kqCred: 'kq_cred',
  kqOpenid: 'kq_openid',
  courseSelection: 'course_selection',
  courseAuth: 'course_auth',
  courseCache: 'course_cache',
  courseManual: 'course_manual',
  courseLastRefresh: 'course_last_refresh'
} as const

export interface CourseSelection {
  collegeValue: string
  collegeName: string
  classValue: string
  className: string
  savedAt?: number
}

export const storeApi = {
  getLoginToken: () => api.storeGet<TokenRecord>(KEYS.loginToken),
  setLoginToken: (v: TokenRecord | null) => api.storeSet(KEYS.loginToken, v),
  getRegisterLink: () => api.storeGet<TokenRecord>(KEYS.registerLink),
  setRegisterLink: (v: TokenRecord) => api.storeSet(KEYS.registerLink, v),
  clearRegisterLink: () => api.storeSet(KEYS.registerLink, null),
  setRegisterMode: (m: 'login' | 'link') => api.storeSet(KEYS.registerMode, m),
  getPerson: () => api.storeGet<Person>(KEYS.person),
  setPerson: (v: Person | null) => api.storeSet(KEYS.person, v),
  getCourseSelection: () => api.storeGet<CourseSelection>(KEYS.courseSelection),
  setCourseSelection: (v: CourseSelection) => api.storeSet(KEYS.courseSelection, v),
  clearCourseSelection: () => api.storeSet(KEYS.courseSelection, null),
  getCourseAuth: () => api.storeGet<{ url: string; wxid: string; savedAt: number }>(KEYS.courseAuth),
  setCourseAuth: (v: { url: string; wxid: string; savedAt: number }) => api.storeSet(KEYS.courseAuth, v),
  clearCourseAuth: () => api.storeSet(KEYS.courseAuth, null),
  getCourseCache: () => api.storeGet<CourseTable>(KEYS.courseCache),
  setCourseCache: (v: CourseTable) => api.storeSet(KEYS.courseCache, v),
  clearCourseCache: () => api.storeSet(KEYS.courseCache, null),
  getManualCourses: async (): Promise<ManualCourse[]> =>
    (await api.storeGet<ManualCourse[]>(KEYS.courseManual)) ?? [],
  setManualCourses: (v: ManualCourse[]) => api.storeSet(KEYS.courseManual, v),
  removeManualCourse: async (id: string) => {
    const list = (await api.storeGet<ManualCourse[]>(KEYS.courseManual)) ?? []
    await api.storeSet(KEYS.courseManual, list.filter((c) => c.id !== id))
  },
  getLastRefresh: () => api.storeGet<string>(KEYS.courseLastRefresh),
  setLastRefresh: (day: string) => api.storeSet(KEYS.courseLastRefresh, day)
}

/** token 是否过期 */
export function isTokenExpired(record: TokenRecord | null): boolean {
  if (!record || !record.token) return true
  const expire = record.expire || 86400
  return Date.now() > (record.savedAt || 0) + expire * 1000
}
