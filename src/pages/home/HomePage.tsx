import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionSheet, Button, Dialog, Toast } from 'antd-mobile'
import WeekGrid from '@/pages/home/WeekGrid'
import DebugBoundary from '@/pages/home/DebugBoundary'
import DayView from '@/pages/home/DayView'
import { mergeManual } from '@/pages/home/course-model'
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
  const [viewMode, setViewMode] = useState<'day' | 'grid'>('day')
  const [daySelected, setDaySelected] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  })


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
    const cacheMatches =
      !!cached &&
      Array.isArray(cached.days) &&
      cached.classValue === sel?.classValue &&
      cached.pv === 2
    if (cacheMatches && cached) {
      setTable(cached)
      if (typeof cached.realWeek === 'number' && cached.realWeek > 0) {
        setRealWeek(cached.realWeek)
        setWeekIndex(cached.realWeek)
      }
    }

    const lastRefresh = await storeApi.getLastRefresh()
    // 缓存必须带 realWeek 才可信（旧版缓存可能缺），否则强制重新拉取周次
    if (!force && cacheMatches && lastRefresh === todayStr() && !!cached && typeof cached.realWeek === 'number' && cached.realWeek > 0) return

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
        // 无条件跟随当前周：当前周没课就显示空周，不回退「全部」混入其他周课程
        setWeekIndex(wk.week)
        await storeApi.setCourseCache({ ...result, realWeek: wk.week, currentWeek: wk.week })
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
  // 任意周有课即可用网格视图；某一周没课也照常显示网格，便于切回
  const hasAnyCourse = merged ? merged.days.some((d) => d.courses.length > 0) : false


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

  const content = (
    <>
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
      ) : viewMode === 'day' && table && merged ? (
        <DayView
          table={merged}
          className={selection?.className || table.className || '班级课表'}
          realWeek={realWeek}
          selected={daySelected}
          onSelect={setDaySelected}
          onOpenGrid={() => setViewMode('grid')}
          onOpenManage={() => setManageVisible(true)}
        />
      ) : (
        <>
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
              <div style={{ marginTop: 12, fontWeight: 600 }}>暂无课程数据</div>
              <div style={{ marginTop: 6, color: 'var(--jm-ink-2)', fontSize: 13 }}>
                可以在「管理」中重新选择班级。
              </div>
            </div>
          ) : null}

          {table && hasAnyCourse && !error ? (
            <DebugBoundary>
            <WeekGrid
              className={selection?.className || table.className || '班级课表'}
              loading={loading}
              table={merged!}
              weekIndex={weekIndex}
              realWeek={realWeek}
              weeksTotal={weeksTotal}
              onWeekChange={setWeekIndex}
              onOpenDay={() => setViewMode('day')}
              onOpenManage={() => setManageVisible(true)}
              onRefresh={() => load(true)}
              onCourseTap={onCourseTap}
            />
            </DebugBoundary>
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
    </>
  )

  return <div className="app-page jm-home">{content}</div>
}
