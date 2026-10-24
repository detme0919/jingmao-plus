import type { Course } from '@/types'
import { expandWeeksClient } from '@/pages/home/expand-weeks'

/** 前端按周过滤（week=0 全部） */
export function coursesForWeekClient(courses: Course[], week: number): Course[] {
  if (!week) return courses
  return courses.filter((c) => {
    const weeks = c.weeks?.length ? c.weeks : expandWeeksClient(c.weeksText || '')
    return !weeks.length || weeks.includes(week)
  })
}
