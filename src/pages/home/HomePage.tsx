import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionSheet, Button, Dialog, DotLoading, Picker, Toast } from 'antd-mobile'
import PageShell from '@/components/PageShell'
import CourseGrid from '@/pages/home/CourseGrid'
import { displayDays, gridPeriods, mergeManual } from '@/pages/home/course-model'
import { api } from '@/api'
import { storeApi, type CourseSelection } from '@/api/store'
import type { Course, CourseTable, ManualCourse } from '@/types'

const todayStr = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function HomePage() {
  const navigate = useNavigate()
  const [selection, setSelection] = useState<CourseSelection | null>(null)
  const [auth, setAuth] = useState<{ url: string; wxid: string } | null>(null)
  const [table, setTable] = useState<CourseTable | null>(null)
  const [manual, setManual] = useState<ManualCourse[]>([])
  const [weekIndex, setWeekIndex] = useState(0)
  const [realWeek, setRealWeek] = useState(0)
  const [weeksTotal, setWeeksTotal] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [manageVisible, setManageVisible] = useState(false)


  const loadSeqRef = useRef(0)
  const bound = !!selection || !!auth

  const load = useCallback(async (force: boolean) => {
    const sel = await storeApi.getCourseSelection()
    const link = await storeApi.getCourseAuth()
    const key = sel ? `class:${sel.classValue}` : link ? `link:${link.wxid}` : ''
    if (!key) {
      setTable(null)
      setSelection(null)
      setAuth(null)
      return
    }
    setSelection(sel)
    setAuth(link)
    setManual((await storeApi.getManualCourses()) ?? [])

    const cached = await storeApi.getCourseCache()
    const cacheMatches = !!cached && Array.isArray(cached.days) && cached.classValue === sel?.classValue
    if (cacheMatches && cached) {
      setTable(cached)
      if (typeof cached.realWeek === 'number') setRealWeek(cached.realWeek)
      if (typeof cached.currentWeek === 'number' && cached.currentWeek > 0) setWeekIndex(cached.currentWeek)
    }

    const lastRefresh = await storeApi.getLastRefresh()
    if (!force && cacheMatches && lastRefresh === todayStr()) return

    const seq = ++loadSeqRef.current
    setLoading(true)
    setError('')
    setStale(false)
    try {
      const result = sel
        ? await api.courseQueryTable(sel.collegeValue, sel.classValue)
        : await api.courseByLink(link!.url)
      if (seq !== loadSeqRef.current) return
      setTable(result)
      await storeApi.setCourseCache(result)
      await storeApi.setLastRefresh(todayStr())

      const wk = await api.kqCurrentWeek()
      if (seq !== loadSeqRef.current) return
      if (wk.ok) {
        setRealWeek(wk.week)
        setWeeksTotal(Math.max(20, wk.total))
      }
      if (wk.week > 0) {
        const has = result.days.some((d) =>
          d.courses.some((c) => !c.weeks?.length || c.weeks.includes(wk.week))
        )
        const nextWeek = wk.week > 0 && has ? wk.week : 0
        setWeekIndex(nextWeek)
        await storeApi.setCourseCache({ ...result, realWeek: wk.week, currentWeek: nextWeek })
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return
      const cachedNow = await storeApi.getCourseCache()
      if (cachedNow && Array.isArray(cachedNow.days) && cachedNow.days.length) {
        setTable(cachedNow)
        setStale(true)
      } else {
        setError(String(e))
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  const merged = useMemo(() => (table ? mergeManual(table, manual) : null), [table, manual])
  const days = useMemo(() => (merged ? displayDays(merged, weekIndex) : []), [merged, weekIndex])
  const periods = useMemo(() => gridPeriods(days), [days])
  const hasAnyCourse = days.some((d) => d.courses.length > 0)
  const weekOptions = useMemo(() => {
    const list: string[][] = []
    for (let i = 0; i <= weeksTotal; i++) list.push([i === 0 ? '全部' : `第${i}周`])
    return [list.map((c) => c[0])]
  }, [weeksTotal])

  const stepWeek = (delta: number) => {
    const next = weekIndex + delta
    if (next < 0 || next > weeksTotal) return
    setWeekIndex(next)
  }

  const onCourseTap = async (c: Course) => {
    if (c.manual) {
      const r = await Dialog.confirm({ title: '手动课程', content: `删除「${c.name}」？`, confirmText: '删除' })
      if (r) {
        await storeApi.removeManualCourse(c.id!)
        setManual((await storeApi.getManualCourses()) ?? [])
        Toast.show({ content: '已删除' })
      }
      return
    }
    const lines: string[] = []
    if (c.period) lines.push(`节次：${c.period}`)
    if (c.room) lines.push(`地点：${c.room}`)
    if (c.teacher) lines.push(`教师：${c.teacher}`)
    if (c.weeksText) lines.push(`周次：${c.weeksText.replace(/周/g, '')}周`)
    Dialog.alert({ title: c.name, content: lines.join('<br/>'), confirmText: '知道了' })
  }

  const unbind = async () => {
    const r = await Dialog.confirm({
      title: '取消绑定',
      content: '将清除已选班级和课表缓存，手动添加的课程会保留。确定取消绑定？',
      confirmText: '确定',
      cancelText: '再想想'
    })
    if (!r) return
    await storeApi.clearCourseSelection()
    await storeApi.clearCourseAuth()
    await storeApi.clearCourseCache()
    setSelection(null)
    setAuth(null)
    setTable(null)
    setError('')
    Toast.show({ content: '已取消绑定' })
  }

  const importFromClipboard = async () => {
    try {
      const text = navigator.clipboard ? await navigator.clipboard.readText() : ''
      const parsed = await api.courseParseLinkText(text)
      if (!parsed.ok) {
        Toast.show({ content: '剪贴板里没有课表链接' })
        return
      }
      await storeApi.setCourseAuth({ url: parsed.url!, wxid: parsed.wxid!, savedAt: Date.now() })
      await storeApi.clearCourseSelection()
      Toast.show({ content: '已使用课表链接' })
      load(true)
    } catch {
      Toast.show({ content: '读取剪贴板失败' })
    }
  }

  return (
    <PageShell
      kicker="TIMETABLE"
      title="课程表"
      subtitle={
        (selection?.className || table?.className || (auth ? '链接课表' : '班级课表')) +
        (weekIndex ? ` · 第${weekIndex}周` : '')
      }
    >
      {!bound ? (
        <div className="app-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ fontSize: 40 }}>🗓️</div>
          <div style={{ marginTop: 12, fontWeight: 600, fontSize: 17 }}>选择班级导入课表</div>
          <div style={{ marginTop: 8, color: 'var(--jm-ink-2)', fontSize: 13, lineHeight: 1.7 }}>
            选择你所在的院系和班级，导入后课表保存在本机，之后打开自动加载。
          </div>
          <Button block color="primary" size="large" style={{ marginTop: 16 }} onClick={() => navigate('/course-bind')}>
            选择班级并导入
          </Button>
          <Button block color="default" size="large" style={{ marginTop: 10 }} onClick={importFromClipboard}>
            从剪贴板读取课表链接
          </Button>
        </div>
      ) : (
        <>
          <div className="jm-weekbar">
            <div className="jm-week-nav">
              <button
                className={`jm-week-arrow ${weekIndex === 0 ? 'is-disabled' : ''}`}
                onClick={() => stepWeek(-1)}
                type="button"
              >
                ‹
              </button>
              <Picker
                columns={weekOptions}
                value={[String(weekIndex)]}
                onConfirm={(v) => {
                  const idx = weekOptions[0].indexOf(String(v[0]))
                  if (idx >= 0) setWeekIndex(idx)
                }}
              >
                {(_, actions) => (
                  <button className="jm-week-current" onClick={() => actions.open()} type="button">
                    {weekIndex === 0 ? '全部' : `第${weekIndex}周`}
                    <span className="jm-week-caret">▾</span>
                  </button>
                )}
              </Picker>
              <button
                className={`jm-week-arrow ${weekIndex >= weeksTotal ? 'is-disabled' : ''}`}
                onClick={() => stepWeek(1)}
                type="button"
              >
                ›
              </button>
            </div>
            <div className="jm-week-actions">
              <button className="jm-chip jm-chip--brand" onClick={() => setWeekIndex(realWeek > 0 ? realWeek : 0)} type="button">
                本周
              </button>
              <button className="jm-chip" onClick={() => load(true)} type="button">
                {loading ? <DotLoading color="primary" /> : '刷新'}
              </button>
              <button className="jm-chip jm-chip--solid" onClick={() => setManageVisible(true)} type="button">
                管理
              </button>
            </div>
          </div>

          {loading && !table ? <div className="jm-tip">正在加载课表…</div> : null}
          {stale ? <div className="jm-stale">刷新失败，显示上次加载的课表</div> : null}
          {error ? (
            <div className="jm-tip jm-tip--error">
              {error}
              <a className="jm-retry" onClick={() => load(true)}>
                重试
              </a>
            </div>
          ) : null}
          {!error && table && !hasAnyCourse ? (
            <div className="app-card" style={{ textAlign: 'center', padding: '48px 24px', marginTop: 12 }}>
              <div style={{ fontSize: 40 }}>🗓️</div>
              <div style={{ marginTop: 12, fontWeight: 600 }}>{weekIndex ? '本周暂无课程' : '暂无课程数据'}</div>
              <div style={{ marginTop: 6, color: 'var(--jm-ink-2)', fontSize: 13 }}>
                可以切换其他周次，或在「管理」中重新选择班级。
              </div>
            </div>
          ) : null}

          {table && hasAnyCourse && !error ? (
            <CourseGrid days={days} periods={periods} week={weekIndex} realWeek={realWeek} onCourseTap={onCourseTap} />
          ) : null}
        </>
      )}

      <ActionSheet
        visible={manageVisible}
        actions={[
          { text: '手动加课', key: 'add' },
          { text: '切换班级', key: 'bind' },
          { text: '取消绑定', key: 'unbind', danger: true }
        ]}
        onClose={() => setManageVisible(false)}
        onAction={async (a) => {
          setManageVisible(false)
          if (a.key === 'add') navigate('/course-add')
          else if (a.key === 'bind') navigate('/course-bind')
          else if (a.key === 'unbind') await unbind()
        }}
        cancelText="取消"
      />
    </PageShell>
  )
}
