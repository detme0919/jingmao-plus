import { BASE_PERIODS, blockStyle, isCurrentPeriod, periodShort, periodStart } from '@/pages/home/course-model'
import type { Course, CourseDay } from '@/types'
import './course-grid.css'

interface CourseGridProps {
  days: CourseDay[]
  periods: string[]
  week: number
  realWeek: number
  onCourseTap: (c: Course) => void
}

/** 周网格课表：时间列 + 星期列，当前教学周高亮当天/当前节次 */
export default function CourseGrid({ days, periods, week, realWeek, onCourseTap }: CourseGridProps) {
  const todayIndex = (() => {
    const d = new Date().getDay()
    return d >= 1 && d <= 5 ? d - 1 : -1
  })()
  const isThisWeek = week > 0 && week === realWeek

  const coursesAt = (day: CourseDay, period: string) => day.courses.filter((c) => c.period === period)

  return (
    <div className="cg-card">
      <div className="cg-head">
        <div className="cg-corner">节次</div>
        {days.map((d, i) => (
          <div key={d.label} className={`cg-day ${isThisWeek && i === todayIndex ? 'is-today' : ''}`}>
            <span className="cg-day-name">{d.label}</span>
            {isThisWeek && i === todayIndex ? <span className="cg-day-today">今天</span> : null}
          </div>
        ))}
      </div>

      <div className={days.length > 5 ? 'cg-scroll' : 'cg-scroll cg-scroll--fit'}>
        <div className="cg-body" style={days.length > 5 ? { minWidth: 68 + days.length * 96 + 16 } : undefined}>
          {periods.map((period) => {
            const current = isCurrentPeriod(period, realWeek, week)
            return (
              <div key={period} className={`cg-row ${current ? 'is-current' : ''}`}>
                <div className={`cg-time ${current ? 'is-current' : ''}`}>
                  <span className="cg-time-period">{periodShort(period)}</span>
                  <span className="cg-time-start">{periodStart(period)}</span>
                </div>
                {days.map((day) => (
                  <div
                    key={day.label}
                    className={`cg-cell ${isThisWeek && days.indexOf(day) === todayIndex ? 'is-today' : ''}`}
                  >
                    {coursesAt(day, period).map((c) => (
                      <div
                        key={c.id || c.name + c.period}
                        className="cg-block"
                        style={blockStyle(c)}
                        onClick={() => onCourseTap(c)}
                      >
                        <span className="cg-block-name">{c.name}</span>
                        {c.room ? <span className="cg-block-room">{c.room}</span> : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      {days.length > 5 ? <div className="cg-scroll-hint">左右滑动可查看周末课程</div> : null}
      <div className="cg-note">· 3-4 节时间与楼栋有关：四、五号楼 10:10-11:50，一、二、三号楼 10:30-12:10</div>
      <div className="cg-source">课表来自学校公众号课表页面，如遇调课请以教务系统为准。</div>
    </div>
  )
}

export { BASE_PERIODS }
