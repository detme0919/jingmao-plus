/** 课表领域工具（周次计算、合并手动课程、网格布局） */
import type { CSSProperties } from 'react'
import { coursesForWeekClient } from '@/pages/home/course-week'
import type { Course, CourseDay, CourseTable, ManualCourse } from '@/types'

export const BASE_LABELS = ['周一', '周二', '周三', '周四', '周五']
export const BASE_PERIODS = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节']
export const ALL_PERIODS = [...BASE_PERIODS, '11-12节']

export const PERIOD_TIMES: Record<string, string> = {
  '1-2节': '08:10-09:50',
  '3-4节': '10:10-11:50',
  '5-6节': '14:40-16:20',
  '7-8节': '16:40-18:20',
  '9-10节': '19:00-20:40',
  '11-12节': '20:50-22:30'
}

export function periodStart(period: string): string {
  return (PERIOD_TIMES[period] || '').split('-')[0] || ''
}

export function periodShort(period: string): string {
  return period.replace('节', '')
}

export const PERIOD_RANGE: Record<string, [number, number]> = {
  '1-2节': [8 * 60 + 10, 9 * 60 + 50],
  '3-4节': [10 * 60 + 10, 11 * 60 + 50],
  '5-6节': [14 * 60 + 40, 16 * 60 + 20],
  '7-8节': [16 * 60 + 40, 18 * 60 + 20],
  '9-10节': [19 * 60, 20 * 60 + 40],
  '11-12节': [20 * 60 + 50, 22 * 60 + 30]
}

/** 合并手动课程到解析结果（manual 标记 + id） */
export function mergeManual(table: CourseTable, manual: ManualCourse[]): CourseTable {
  if (!manual.length) return table
  const byDay = new Map<string, Course[]>()
  table.days.forEach((d) => byDay.set(d.label, d.courses))
  for (const m of manual) {
    const list = byDay.get(m.day) ?? []
    list.push({
      id: m.id,
      manual: true,
      day: m.day,
      name: m.name,
      period: m.period,
      room: m.room ?? '',
      teacher: m.teacher ?? '',
      weeks: m.weeks ?? [],
      weeksText: m.weeksText ?? ''
    })
    byDay.set(m.day, list)
  }
  // 手动课程可能引入新的一天
  const days: CourseDay[] = table.days.map((d) => ({ ...d, courses: byDay.get(d.label) ?? [] }))
  const known = new Set(days.map((d) => d.label))
  for (const m of manual) {
    if (known.has(m.day)) continue
    days.push({ label: m.day, name: m.day.replace('周', '星期'), order: 9, courses: byDay.get(m.day) ?? [] })
  }
  days.sort((a, b) => a.order - b.order)
  return { ...table, days }
}

/** 展示用的天列表：固定周一到周五，有课的额外天追加 */
export function displayDays(table: CourseTable, week: number): CourseDay[] {
  const map = new Map(table.days.map((d) => [d.label, d]))
  const extra = table.days.filter((d) => !BASE_LABELS.includes(d.label) && d.courses.length > 0)
  const labels = [...BASE_LABELS, ...extra.map((d) => d.label)]
  return labels.map((label) => {
    const day = map.get(label)
    const courses = coursesForWeekClient(day ? day.courses : [], week).slice()
    courses.sort(
      (a, b) => periodNum(a.period) - periodNum(b.period)
    )
    return { label, name: day?.name ?? label.replace('周', '星期'), order: day?.order ?? 9, courses }
  })
}

/** 网格节次行：基础 5 行 + 有课的额外行 */
export function gridPeriods(days: CourseDay[]): string[] {
  const used = new Set<string>()
  days.forEach((d) => d.courses.forEach((c) => used.add(c.period)))
  const extras = [...used]
    .filter((p) => p && !ALL_PERIODS.includes(p))
    .sort((a, b) => periodNum(a) - periodNum(b))
  return [...BASE_PERIODS, ...extras]
}

export function periodNum(period: string): number {
  const m = String(period || '').match(/\d+/)
  return m ? parseInt(m[0], 10) : 99
}

export function isCurrentPeriod(period: string, realWeek: number, week: number): boolean {
  if (!week || week !== realWeek) return false
  const day = new Date().getDay()
  if (day < 1 || day > 5) return false
  const range = PERIOD_RANGE[period]
  if (!range) return false
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= range[0] && mins <= range[1]
}

const BLOCK_COLORS = [
  { bg: 'rgba(79, 70, 229, 0.10)', border: 'rgba(79, 70, 229, 0.45)', text: '#4338ca' },
  { bg: 'rgba(13, 148, 136, 0.10)', border: 'rgba(13, 148, 136, 0.45)', text: '#0f766e' },
  { bg: 'rgba(124, 58, 237, 0.10)', border: 'rgba(124, 58, 237, 0.45)', text: '#6d28d9' },
  { bg: 'rgba(234, 88, 12, 0.12)', border: 'rgba(234, 88, 12, 0.5)', text: '#c2410c' },
  { bg: 'rgba(225, 29, 72, 0.10)', border: 'rgba(225, 29, 72, 0.42)', text: '#be123c' },
  { bg: 'rgba(2, 132, 199, 0.10)', border: 'rgba(2, 132, 199, 0.45)', text: '#075e94' }
]

const colorMap: Record<string, number> = {}

export function blockStyle(course: Course): CSSProperties {
  const key = String(course.name || '').trim()
  if (!colorMap[key]) colorMap[key] = Object.keys(colorMap).length % BLOCK_COLORS.length
  const palette = BLOCK_COLORS[colorMap[key]]
  return { background: palette.bg, borderColor: palette.border, color: palette.text }
}
