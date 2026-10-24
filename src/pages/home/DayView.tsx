import { useMemo } from 'react'
import type { Course, CourseTable } from '@/types'
import { coursesForWeekClient } from '@/pages/home/course-week'
import { expandWeeksClient } from '@/pages/home/expand-weeks'
import { PERIOD_RANGE, PERIOD_TIMES } from '@/pages/home/course-model'
import { blockStyle } from '@/pages/home/course-model'
import { Dialog } from 'antd-mobile'
import './day-view.css'

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const pad = (n: number) => String(n).padStart(2, '0')

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
/** 周一为一周开始 */
function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7))
}
function periodStart(period: string) {
  return (PERIOD_TIMES[period] || '').split('-')[0] || ''
}
function periodEnd(period: string) {
  return (PERIOD_TIMES[period] || '').split('-')[1] || ''
}
function periodNum(period: string): number {
  const m = String(period || '').match(/\d+/)
  return m ? parseInt(m[0], 10) : 99
}
function minutesNow(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}
function hhmm(mins: number) {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`
}

interface DayViewProps {
  table: CourseTable
  className: string
  realWeek: number
  selected: Date
  onSelect: (d: Date) => void
  onOpenGrid: () => void
  onOpenManage: () => void
}

/** 日视图：大字日期 + 时间轴 + 明日预览 + 底部日期条（参考 WakeUp 风格） */
export default function DayView({ table, className, realWeek, selected, onSelect, onOpenGrid, onOpenManage }: DayViewProps) {
  const today = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  const monday = useMemo(() => mondayOf(today), [today])

  /** 某日期对应的教学周（相对今天推算） */
  const weekOf = (date: Date) => {
    const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000)
    const shift = Math.floor(((today.getDay() + 6) % 7 + diffDays) / 7)
    return realWeek + shift
  }

  /** 某日期当天的课程（已按周过滤、按节次排序） */
  const coursesOf = (date: Date): Course[] => {
    const label = WEEKDAY[date.getDay()]
    const day = table.days.find((d) => d.label === label)
    if (!day) return []
    return coursesForWeekClient(day.courses, weekOf(date)).slice().sort((a, b) => periodNum(a.period) - periodNum(b.period))
  }

  const selectedCourses = useMemo(() => coursesOf(selected), [table, selected, realWeek])
  const isToday = sameDay(selected, today)

  const now = minutesNow()
  const courseCount = selectedCourses.length
  const remainCount = isToday
    ? selectedCourses.filter((c) => {
        const end = PERIOD_RANGE[c.period]?.[1]
        return end !== undefined && end > now
      }).length
    : courseCount

  // 明日/下一个有课的日子（仅当选中的是今天时展示）
  const nextDay = useMemo(() => {
    if (!isToday) return null
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i)
      const courses = coursesOf(d)
      if (courses.length) return { date: d, courses }
    }
    return null
  }, [isToday, table, realWeek])

  const stripDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])

  const openCourse = (c: Course) => {
    const rows: [string, string][] = []
    if (c.period) rows.push(['节次', c.period])
    if (c.room) rows.push(['地点', c.room])
    if (c.teacher) rows.push(['教师', c.teacher])
    if (c.weeksText) rows.push(['周次', c.weeksText])
    Dialog.alert({
      title: c.name,
      content: (
        <div>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', padding: '4px 0', fontSize: 14 }}>
              <span style={{ width: 64, flexShrink: 0, color: 'var(--jm-ink-3)' }}>{k}</span>
              <span style={{ flex: 1, color: 'var(--jm-ink)' }}>{v}</span>
            </div>
          ))}
        </div>
      ),
      confirmText: '知道了'
    })
  }

  const renderTimeline = (date: Date, interactive: boolean) => {
    const courses = coursesOf(date)
    const used = [...new Set(courses.map((c) => c.period))].sort((a, b) => periodNum(a) - periodNum(b))
    const isSelToday = sameDay(date, today)
    const nowM = minutesNow()
    let nextMarked = false
    return (
      <div className="tl">
        {used.map((period) => {
          const list = courses.filter((c) => c.period === period)
          const range = PERIOD_RANGE[period]
          const isCurrent = isSelToday && range && nowM >= range[0] && nowM <= range[1]
          const isPast = isSelToday && range && nowM > range[1]
          const isNext = isSelToday && !isCurrent && !isPast && !nextMarked && range && range[0] > nowM
          if (isNext) nextMarked = true
          return (
            <div key={period} className={`tl-row ${isCurrent ? 'is-current' : ''}`}>
              <div className="tl-time">
                <div className="tl-period">{period.replace('节', '') + '节'}</div>
                <div className="tl-start">{periodStart(period)}</div>
                <div className="tl-end">{periodEnd(period)}</div>
                <span className={`tl-dot ${isCurrent ? 'is-current' : ''}`} />
              </div>
              <div className="tl-cards">
                {list.map((c, i) => (
                  <div
                    key={c.id || c.name + i}
                    className={`tl-card ${isPast ? 'is-past' : ''} ${isCurrent ? 'is-current' : ''}`}
                    onClick={() => interactive && openCourse(c)}
                  >
                    <div className="tl-card-body">
                      <div className="tl-card-name">{c.name}</div>
                      <div className="tl-card-meta">
                        {[c.room, c.teacher].filter(Boolean).join('，')}
                      </div>
                      {isCurrent && range ? (
                        <div className="tl-card-status is-now">
                          上课中，现在 {hhmm(nowM)}，还剩 {range[1] - nowM} 分钟
                        </div>
                      ) : isNext && i === 0 && list.length === 1 ? (
                        <div className="tl-card-status is-next">
                          下一节，{periodStart(period)} 开始
                        </div>
                      ) : null}
                    </div>
                    <div className="tl-card-icon" style={blockStyle(c)}>
                      {c.name.replace(/^\*/, '').replace(/（.*$/, '').replace(/\(.*$/, '').trim().slice(0, 1) || '课'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {used.length === 0 ? <div className="tl-empty">当天没有课程</div> : null}
      </div>
    )
  }

  const parity = weekOf(selected) % 2 === 1 ? '单周' : '双周'

  return (
    <div className="dv">
      <header className="dv-header">
        <div className="dv-kicker">{className}</div>
        <h1 className="dv-date">
          {selected.getMonth() + 1}月{selected.getDate()}日
          <span className="dv-weekday">{WEEKDAY[selected.getDay()]}</span>
        </h1>
        <div className="dv-meta">
          {realWeek > 0 ? (
            <>
              <span>第{weekOf(selected)}周</span>
              <i />
              <span>{parity}</span>
              <i />
            </>
          ) : null}
          <span>
            {courseCount} 节课{isToday && courseCount > 0 ? `，剩 ${remainCount} 节` : ''}
          </span>
          <span className="dv-actions">
            <a onClick={onOpenManage} title="管理">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </a>
          </span>
        </div>
      </header>

      {renderTimeline(selected, true)}

      {nextDay ? (
        <>
          <div className="dv-next-head">
            <span className="dv-next-title">
              {sameDay(nextDay.date, addDays(today, 1)) ? '明天' : WEEKDAY[nextDay.date.getDay()]}
            </span>
            <span className="dv-next-date">
              {nextDay.date.getMonth() + 1}月{nextDay.date.getDate()}日 {WEEKDAY[nextDay.date.getDay()]}
            </span>
            <span className="dv-next-count">
              {nextDay.courses.length} 节课
              {nextDay.courses[0] ? `，${periodStart(nextDay.courses[0].period)} 开始` : ''}
            </span>
          </div>
          {renderTimeline(nextDay.date, false)}
        </>
      ) : null}

      <div className="dv-strip">
        {stripDays.map((d) => {
          const n = coursesOf(d).length
          const active = sameDay(d, selected)
          const isT = sameDay(d, today)
          return (
            <div key={d.getTime()} className={`dv-strip-day ${active ? 'is-active' : ''}`} onClick={() => onSelect(d)}>
              <div className="dv-strip-date">
                {d.getDate()}
                {n > 0 ? <sup>{n}</sup> : null}
              </div>
              <div className="dv-strip-week">{isT ? '今天' : WEEKDAY[d.getDay()].replace('周', '')}</div>
            </div>
          )
        })}
        <div className="dv-strip-cal" onClick={onOpenGrid} title="周视图">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
            <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
          </svg>
        </div>
      </div>
    </div>
  )
}

export { expandWeeksClient }
