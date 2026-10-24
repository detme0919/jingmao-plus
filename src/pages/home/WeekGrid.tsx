import { useMemo } from 'react'
import type { Course, CourseTable } from '@/types'
import { coursesForWeekClient } from '@/pages/home/course-week'
import { blockStyle } from '@/pages/home/course-model'
import { PERIOD_TIMES } from '@/pages/home/course-model'
import { DotLoading, Picker } from 'antd-mobile'
import './week-grid.css'
import './day-view.css'

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const pad = (n: number) => String(n).padStart(2, '0')

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7))
}
function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
function hm(mins: number) {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`
}

/** 单节次时间：由连堂节次时间均分（45 分钟课 + 10 分钟休息） */
const singleTime: Record<number, [number, number]> = {}
for (const [label, range] of Object.entries(PERIOD_TIMES)) {
  const m = label.match(/(\d+)-(\d+)/)
  if (!m) continue
  const a = Number(m[1])
  const s = parseHM(range.split('-')[0])
  const e = parseHM(range.split('-')[1])
  singleTime[a] = [s, s + 45]
  singleTime[a + 1] = [s + 55, e]
}

/** 块高度 = 跨越的每节行高 + 中途的分隔带（午休/晚休） */
function blockHeight(s: number, e: number): number {
  return (e - s + 1) * 58 - 8
}

function courseSpan(c: Course): [number, number] {
  const m = c.period.match(/(\d+)-(\d+)/)
  if (m) return [Number(m[1]), Number(m[2])]
  const single = c.period.match(/(\d+)/)
  if (single) return [Number(single[1]), Number(single[1])]
  return [99, 99]
}

type Row = number | 'lunch' | 'dinner'

interface WeekGridProps {
  className: string
  loading?: boolean
  table: CourseTable
  weekIndex: number
  realWeek: number
  weeksTotal: number
  onWeekChange: (w: number) => void
  onOpenDay: () => void
  onOpenManage: () => void
  onRefresh: () => void
  onCourseTap: (c: Course) => void
}

/** 周网格视图（WakeUp 风格）：单节次行 + 跨节课程块 + 午休/晚休 + 日期表头 */
export default function WeekGrid({
  className,
  loading,
  table,
  weekIndex,
  realWeek,
  weeksTotal,
  onWeekChange,
  onOpenDay,
  onOpenManage,
  onRefresh,
  onCourseTap
}: WeekGridProps) {
  const today = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  /** 周一~周日（d=1..7）对应日期（weekIndex 相对 realWeek 偏移） */
  const monday = useMemo(() => mondayOf(today), [today])
  const offset = weekIndex > 0 && realWeek > 0 ? (weekIndex - realWeek) * 7 : 0
  const dateOf = (d: number) => addDays(monday, offset + d - 1)

  // 固定周一~周日七列（与日视图日期条一致）
  const columns = [1, 2, 3, 4, 5, 6, 7]

  const weekCourses = useMemo(() => {
    const map = new Map<string, Course[]>()
    for (const d of table.days) {
      map.set(d.label, coursesForWeekClient(d.courses, weekIndex))
    }
    return map
  }, [table, weekIndex])

  const maxPeriod = useMemo(() => {
    let max = 10
    for (const list of weekCourses.values()) {
      for (const c of list) {
        const [, end] = courseSpan(c)
        if (end > max) max = end
      }
    }
    return max
  }, [weekCourses])

  const rows = useMemo(() => {
    // 作息：午休在第 4 节后（11:50-14:40），晚休在第 8 节后（18:20-19:00）
    const list: Row[] = []
    for (let p = 1; p <= maxPeriod; p++) {
      list.push(p)
      if (p === 4 && maxPeriod >= 5) list.push('lunch')
      if (p === 8 && maxPeriod >= 9) list.push('dinner')
    }
    return list
  }, [maxPeriod])

  const weekOptions = useMemo(() => {
    const list: string[] = []
    for (let i = 0; i <= weeksTotal; i++) list.push(i === 0 ? '全部' : `第${i}周`)
    return [list]
  }, [weeksTotal])

  const titleText = weekIndex === 0 ? '全部' : `第${weekIndex}周`
  const totalCourses = useMemo(
    () => [...weekCourses.values()].reduce((n, list) => n + list.length, 0),
    [weekCourses]
  )

  return (
    <div className="wk">
      <header className="dv-header">
        <div className="dv-kicker">{className}</div>
        <div className="dv-date-row">
          <button
            className={`wk-arrow ${weekIndex === 0 ? 'is-disabled' : ''}`}
            onClick={() => onWeekChange(Math.max(0, weekIndex - 1))}
            type="button"
          >
            ‹
          </button>
          <Picker
            columns={weekOptions}
            value={[titleText]}
            onConfirm={(v) => {
              const idx = weekOptions[0].indexOf(String(v[0]))
              if (idx >= 0) onWeekChange(idx)
            }}
          >
            {(_, actions) => (
              <button className="dv-date dv-date--btn" onClick={() => actions.open()} type="button">
                {titleText}
                {loading ? <DotLoading color="primary" /> : null}
              </button>
            )}
          </Picker>
          <button
            className={`wk-arrow ${weekIndex >= weeksTotal ? 'is-disabled' : ''}`}
            onClick={() => onWeekChange(Math.min(weeksTotal, weekIndex + 1))}
            type="button"
          >
            ›
          </button>
          <span className="dv-actions">
            <a onClick={onRefresh} title="刷新">刷新</a>
            <a onClick={onOpenDay} title="日视图">日视图</a>
            <a onClick={onOpenManage}>管理</a>
          </span>
        </div>
        <div className="dv-meta">
          <span>{totalCourses} 节课</span>
          {weekIndex > 0 ? (
            <>
              <i />
              <span>{weekIndex % 2 === 1 ? '单周' : '双周'}</span>
            </>
          ) : null}
        </div>
      </header>

      <div className="wk-card">
      <div className="wk-head">
        <div className="wk-head-time" />
        {columns.map((d) => {
          const date = dateOf(d)
          const isToday = sameDay(date, today)
          const past = date < today
          return (
            <div key={d} className={`wk-head-day ${isToday ? 'is-today' : ''} ${past ? 'is-past' : ''}`}>
              <span className="wk-head-name">{WEEKDAY[d % 7]}</span>
              <span className="wk-head-date">
                {pad(date.getMonth() + 1)}/{pad(date.getDate())}
              </span>
            </div>
          )
        })}
      </div>

      <div className="wk-body">
        {rows.map((row) =>
          typeof row === 'string' ? (
            <div key={row} className="wk-break">{row === 'lunch' ? '午休' : '晚休'}</div>
          ) : (
            <div key={row} className="wk-row">
              <div className="wk-time">
                <span className="wk-time-n">{row}</span>
                <span className="wk-time-range">
                  {hm(singleTime[row]?.[0] ?? 0)}
                  <br />
                  {hm(singleTime[row]?.[1] ?? 0)}
                </span>
              </div>
              {columns.map((d) => {
                const label = WEEKDAY[d % 7]
                const courses = weekCourses.get(label) ?? []
                const starts = courses.filter((c) => courseSpan(c)[0] === row)
                const date = dateOf(d)
                const past = date < today
                return (
                  <div key={d} className={`wk-cell ${past ? 'is-past' : ''}`}>
                    {starts.map((c, i) => {
                      const [s, e] = courseSpan(c)
                      const height = blockHeight(s, e)
                      const palette = blockStyle(c)
                      return (
                        <div
                          key={c.id || c.name + i}
                          className="wk-block"
                          style={{
                            color: palette.color,
                            height,
                            // 不透明底色：半透明色叠白，避免午休/晚休分隔带透出
                            background: `linear-gradient(0deg, ${palette.background}, ${palette.background}) #ffffff`
                          }}
                          onClick={() => onCourseTap(c)}
                        >
                          <div className="wk-block-name">{c.name}</div>
                          {c.room ? <div className="wk-block-room">@{c.room}</div> : null}
                          {c.teacher ? <div className="wk-block-teacher">{c.teacher}</div> : null}
                          <span className="wk-block-dot" />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
      </div>
    </div>
  )
}
