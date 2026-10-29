/** 与 Rust 命令层对应的类型定义 */
export interface Course {
  name: string
  period: string
  weeksText: string
  weeks: number[]
  room: string
  teacher: string
  id?: string
  manual?: boolean
  day?: string
}

export interface CourseDay {
  label: string
  name: string
  order: number
  courses: Course[]
}

export interface CourseTable {
  className: string
  pv?: number
  days: CourseDay[]
  classValue?: string
  savedAt?: number
  currentWeek?: number
  realWeek?: number
}

export interface OptionItem {
  value: string
  label: string
}

export interface KqProfile {
  idnum: string
  name: string
  className: string
  academy: string
}

export interface KqRecord {
  time: string
  title: string
  position: string
  status: string
}

export interface LeaveRecord {
  id: string
  beginTime: string
  endTime: string
  reason: string
  destination: string
  trafficWay: string
  status: string
}

export interface LeavePage {
  list: LeaveRecord[]
  totalPage: number
}

export interface LeaveConfig {
  outSchoolTime: string
  inSchoolTime: string
  advanceDays: number
}

export interface Person {
  name: string
  idnum: string
  academy: string
  specialty: string
  className: string
  avatar: string
  token?: string
}

export interface TokenRecord {
  token: string
  kqAutoLogin?: boolean
  url: string
  expire: number
  savedAt: number
}

export interface ManualCourse {
  id: string
  name: string
  day: string
  period: string
  room?: string
  teacher?: string
  weeksText?: string
  weeks?: number[]
}

export interface RegisterLink extends TokenRecord {
  ok: boolean
}

