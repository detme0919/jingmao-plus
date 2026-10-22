<template>
  <view class="page" :style="pageStyle">
    <view class="topbar">
      <view class="topbar-kicker">SCHEDULE</view>
      <view class="topbar-title">课程表</view>
      <view class="topbar-sub">{{ headerSub }}</view>
    </view>

    <view v-if="!selection && !auth" class="bind-card">
      <view class="bind-icon">📚</view>
      <view class="bind-title">选择班级导入课表</view>
      <view class="bind-desc">
        选择你所在的院系和班级，导入后课表保存在本机，之后打开课程表自动加载。
      </view>
      <view class="btn" @tap="openBind">选择班级并导入</view>
      <view class="btn btn--ghost" @tap="importFromLink">从剪贴板读取课表链接</view>
    </view>

    <block v-else>
      <view class="week-bar">
        <view class="week-nav">
          <view class="week-arrow" :class="{ 'is-disabled': weekIndex === 0 }" @tap="stepWeek(-1)">‹</view>
          <picker :range="weekOptions" :value="weekIndex" @change="onWeek">
            <view class="week-current">
              {{ weekOptions[weekIndex] }}
              <text class="week-caret">⌄</text>
            </view>
          </picker>
          <view
            class="week-arrow"
            :class="{ 'is-disabled': weekIndex >= weeksTotal }"
            @tap="stepWeek(1)"
          >›</view>
        </view>
        <view class="week-actions">
          <view class="week-today" @tap="goCurrentWeek">本周</view>
          <view class="week-update" @tap="load">刷新</view>
          <view class="week-manage" @tap="openManage">管理</view>
        </view>
      </view>

      <view v-if="loading && !table.days.length" class="tip">正在加载课表…</view>
      <view v-if="stale" class="stale-tip">刷新失败，显示上次加载的课表</view>
      <view v-if="error" class="tip tip--error">
        {{ error }}
        <text class="retry" @tap="load">重试</text>
      </view>
      <view v-else-if="!hasAnyCourse" class="empty-card">
        <view class="empty-icon">🗓️</view>
        <view class="empty-title">{{ weekIndex ? '本周暂无课程' : '暂无课程数据' }}</view>
        <view class="empty-desc">可以切换其他周次，或在「管理」中重新选择班级。</view>
      </view>

      <block v-else>
        <view class="grid-scroll">
          <view class="timetable-card" :class="{ 'is-wide': gridDays.length > 5 }" :style="gridStyle">
            <view class="grid-head">
              <view class="time-col grid-corner">
                <text class="corner-text">节次</text>
              </view>
              <view
                v-for="day in gridDays"
                :key="day.label"
                class="day-head"
                :class="{ 'is-today': day.isToday }"
              >
                <text class="day-name">{{ day.label }}</text>
                <text v-if="day.isToday" class="day-today">今天</text>
              </view>
            </view>

            <view
              v-for="period in gridPeriods"
              :key="period"
              class="grid-row"
              :class="{ 'is-current': isCurrentPeriod(period) }"
            >
              <view class="time-cell" :class="{ 'is-current': isCurrentPeriod(period) }">
                <text class="time-period">{{ periodShort(period) }}</text>
                <text class="time-start">{{ periodStart(period) }}</text>
              </view>
              <view
                v-for="day in gridDays"
                :key="day.label"
                class="grid-cell"
                :class="{ 'is-today': day.isToday }"
              >
                <view
                  v-for="c in coursesAt(day, period)"
                  :key="c.id || c.name + c.period"
                  class="course-block"
                  :style="blockStyle(c)"
                  @tap="onCourseTap(c)"
                >
                  <text class="block-name">{{ c.name }}</text>
                  <text v-if="c.room" class="block-room">{{ c.room }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view class="grid-note">
          <view class="note-dot"></view>
          <text>3-4 节时间与楼栋有关：四、五号楼 10:10-11:50，一、二、三号楼 10:30-12:10</text>
        </view>
        <view v-if="gridDays.length > 5" class="scroll-hint">左右滑动可查看周末课程</view>
        <view class="source-hint">课表来自学校公众号课表页面，如遇调课请以教务系统为准。</view>
      </block>
    </block>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  getTheme,
  themeVars,
  applyNavTheme,
  applyTabTheme,
  applyStatusBarLight
} from '@/utils/theme.js'
import {
  getCourseSelection,
  clearCourseSelection,
  fetchCourseColleges,
  fetchCourseClasses,
  queryCourseTable,
  fetchCurrentWeek,
  getCourseCache,
  saveCourseCache,
  clearCourseCache,
  getManualCourses,
  removeManualCourse,
  markCourseRefreshed,
  isCourseRefreshedToday,
  getCourseAuth,
  saveCourseAuth,
  clearCourseAuth,
  readClipboardCourseLink,
  fetchCourseTable
} from '@/utils/course.js'
import { coursesForWeek } from '@/utils/course-parse.js'

const theme = ref(getTheme())
const selection = ref(null)
const auth = ref(null)
const table = ref({ className: '', days: [] })
const loading = ref(false)
const stale = ref(false)
const error = ref('')
const weekIndex = ref(0)
const weeksTotal = ref(20)
const manual = ref([])
let loadSeq = 0
let tableKey = ''

const pageStyle = computed(() => themeVars(theme.value))

const weekOptions = computed(() => {
  const list = ['全部']
  for (let i = 1; i <= weeksTotal.value; i++) list.push('第' + i + '周')
  return list
})

const PERIOD_TIMES = {
  '1-2节': '08:10-09:50',
  '3-4节': '10:10-11:50',
  '5-6节': '14:40-16:20',
  '7-8节': '16:40-18:20',
  '9-10节': '19:00-20:40'
}

const baseLabels = ['周一', '周二', '周三', '周四', '周五']
const GRID_PERIODS = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节']
const BLOCK_COLORS = [
  { bg: 'rgba(0, 74, 171, 0.10)', border: 'rgba(0, 74, 171, 0.45)', text: '#0b3f8f' },
  { bg: 'rgba(15, 118, 110, 0.10)', border: 'rgba(15, 118, 110, 0.45)', text: '#0c5d54' },
  { bg: 'rgba(109, 40, 217, 0.10)', border: 'rgba(109, 40, 217, 0.45)', text: '#551fae' },
  { bg: 'rgba(202, 138, 4, 0.12)', border: 'rgba(202, 138, 4, 0.5)', text: '#8a5b00' },
  { bg: 'rgba(190, 18, 60, 0.10)', border: 'rgba(190, 18, 60, 0.42)', text: '#930f30' },
  { bg: 'rgba(2, 132, 199, 0.10)', border: 'rgba(2, 132, 199, 0.45)', text: '#075e94' }
]
const colorMap = {}

function colorIndex(name) {
  const key = String(name || '').trim()
  if (!colorMap[key]) colorMap[key] = Object.keys(colorMap).length % BLOCK_COLORS.length
  return colorMap[key]
}

const displayDays = computed(() => {
  const map = {}
  table.value.days.forEach((d) => {
    map[d.label] = d
  })
  const manualMap = {}
  manual.value.forEach((m) => {
    if (!manualMap[m.day]) manualMap[m.day] = []
    manualMap[m.day].push(Object.assign({ manual: true }, m))
  })
  const extraLabels = table.value.days
    .filter((d) => d.courses && d.courses.length)
    .map((d) => d.label)
    .concat(manual.value.map((m) => m.day))
    .filter((l) => !baseLabels.includes(l))
  const labels = baseLabels.concat([...new Set(extraLabels)])
  return labels.map((label) => {
    const day = map[label]
    const parsed = day ? day.courses : []
    const merged = parsed.concat(manualMap[label] || [])
    const courses = coursesForWeek(merged, weekIndex.value).slice().sort((a, b) => periodNum(a.period) - periodNum(b.period))
    return { label, courses }
  })
})

const hasAnyCourse = computed(() =>
  displayDays.value.some((d) => d.courses.length > 0)
)

const headerSub = computed(() => {
  const cls = selection.value ? (table.value.className || selection.value.className) : ''
  const week = weekIndex.value ? ` · 第${weekIndex.value}周` : ''
  return (cls || '班级课表') + week
})

const currentWeek = ref(0)

const gridDays = computed(() => {
  const today = new Date().getDay()
  const todayIndex = today >= 1 && today <= 5 ? today - 1 : -1
  return displayDays.value.map((d, i) => ({
    label: d.label,
    courses: d.courses,
    isToday: weekIndex.value > 0 && weekIndex.value === currentWeek.value && i === todayIndex
  }))
})

const gridPeriods = computed(() => {
  const used = new Set()
  displayDays.value.forEach((d) => d.courses.forEach((c) => used.add(c.period)))
  const base = GRID_PERIODS.slice(0, 5)
  const extras = [...used]
    .filter((p) => p && !base.includes(p))
    .sort((a, b) => periodNum(a) - periodNum(b))
  return base.concat(extras)
})

const gridStyle = computed(() => {
  const days = gridDays.value.length
  // 超过五天（周末有课）时给每列保留可读宽度，横向滑动查看
  if (days <= 5) return {}
  return { minWidth: 68 + days * 104 + 16 + 'rpx' }
})

function coursesAt(day, period) {
  return day.courses.filter((c) => c.period === period)
}

function periodShort(period) {
  return String(period || '').replace('节', '')
}

function periodStart(period) {
  const time = PERIOD_TIMES[period]
  return time ? time.split('-')[0] : ''
}

const PERIOD_RANGE = { '1-2节': [8 * 60 + 10, 9 * 60 + 50], '3-4节': [10 * 60 + 10, 11 * 60 + 50], '5-6节': [14 * 60 + 40, 16 * 60 + 20], '7-8节': [16 * 60 + 40, 18 * 60 + 20], '9-10节': [19 * 60, 20 * 60 + 40], '11-12节': [20 * 60 + 50, 22 * 60 + 30] }

function isCurrentPeriod(period) {
  if (weekIndex.value === 0 || weekIndex.value !== currentWeek.value) return false
  const day = new Date().getDay()
  if (day < 1 || day > 5) return false
  const range = PERIOD_RANGE[period]
  if (!range) return false
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= range[0] && mins <= range[1]
}

function blockStyle(course) {
  const palette = BLOCK_COLORS[colorIndex(course.name)]
  return {
    background: palette.bg,
    borderColor: palette.border,
    color: palette.text
  }
}

function stepWeek(delta) {
  const next = weekIndex.value + delta
  if (next < 0 || next > weeksTotal.value) return
  weekIndex.value = next
}

function goCurrentWeek() {
  weekIndex.value = currentWeek.value > 0 ? currentWeek.value : 0
}

onShow(() => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  applyStatusBarLight()
  applyTabTheme(theme.value)
  selection.value = getCourseSelection()
  auth.value = getCourseAuth()
  manual.value = getManualCourses()
  table.value = { className: '', days: [] }
  tableKey = ''
  const key = selection.value
    ? 'class:' + selection.value.classValue
    : auth.value
      ? 'link:' + auth.value.wxid
      : ''
  if (!key) {
    loadSeq++
    loading.value = false
    return
  }
  const cached = getCourseCache()
  if (cached) {
    const cachedKey = cached.classValue
      ? 'class:' + cached.classValue
      : cached.linkKey
        ? 'link:' + cached.linkKey
        : ''
    if (cachedKey === key && Array.isArray(cached.days)) {
      table.value = cached
      tableKey = key
      if (typeof cached.realWeek === 'number') {
        currentWeek.value = cached.realWeek > 0 ? cached.realWeek : 0
      } else if (typeof cached.currentWeek === 'number' && cached.currentWeek > 0) {
        currentWeek.value = cached.currentWeek
      }
      if (weekIndex.value === 0 && typeof cached.currentWeek === 'number') {
        weekIndex.value = cached.currentWeek
      }
    }
  }
  // 有当日缓存就直接展示；没有缓存、缓存不属于当前班级/链接或今天还没刷新时才请求
  if (tableKey !== key || !isCourseRefreshedToday()) load()
})

async function load() {
  const seq = ++loadSeq
  const sel = selection.value ? { ...selection.value } : null
  const authSnap = auth.value ? { ...auth.value } : null
  if (!sel && !authSnap) {
    loading.value = false
    table.value = { className: '', days: [] }
    tableKey = ''
    return
  }
  loading.value = true
  error.value = ''
  stale.value = false

  let data = null
  try {
    if (sel) {
      const page = await fetchCourseColleges()
      const cls = page ? await fetchCourseClasses(page.hidden, sel.collegeValue) : null
      if (cls) {
        data = await queryCourseTable(cls.hidden, sel.collegeValue, sel.classValue)
      }
    } else {
      const res = await fetchCourseTable(authSnap.url)
      if (res.ok) data = res.data
    }
    if (seq !== loadSeq) return

    if (!data || !Array.isArray(data.days) || !data.days.length) {
      if (table.value.days.length) stale.value = true
      else error.value = sel ? '没有查到该班级的课表' : '课表页面加载失败'
      return
    }

    const key = sel ? 'class:' + sel.classValue : 'link:' + authSnap.wxid
    const changed = tableKey !== key
    table.value = data
    tableKey = key
    saveCourseCache(
      Object.assign(sel ? { classValue: sel.classValue } : { linkKey: authSnap.wxid }, data)
    )
    markCourseRefreshed()

    const cur = await fetchCurrentWeek()
    if (seq !== loadSeq) return
    weeksTotal.value = Math.max(20, cur.total || 20)
    currentWeek.value = cur.week > 0 ? cur.week : 0
    if (changed) {
      const weekHasCourse = data.days.some(
        (d) => coursesForWeek(d.courses, cur.week).length > 0
      )
      weekIndex.value = cur.week > 0 && weekHasCourse ? cur.week : 0
    }
    saveCourseCache(
      Object.assign(sel ? { classValue: sel.classValue } : { linkKey: authSnap.wxid }, data, {
        currentWeek: weekIndex.value,
        realWeek: currentWeek.value
      })
    )
  } catch (e) {
    if (seq !== loadSeq) return
    if (table.value.days.length) stale.value = true
    else error.value = sel ? '没有查到该班级的课表' : '课表页面加载失败'
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

function periodNum(period) {
  const m = String(period || '').match(/\d+/)
  return m ? parseInt(m[0], 10) : 99
}

function openAddCourse() {
  uni.navigateTo({ url: '/pages/tool/course-add/course-add' })
}

function openManage() {
  uni.showActionSheet({
    itemList: ['手动加课', '切换班级', '取消绑定'],
    success: (res) => {
      if (res.tapIndex === 0) openAddCourse()
      else if (res.tapIndex === 1) openBind()
      else if (res.tapIndex === 2) confirmUnbind()
    }
  })
}

function onCourseTap(course) {
  if (course.manual) {
    uni.showModal({
      title: '手动课程',
      content: '删除「' + course.name + '」？',
      confirmText: '删除',
      confirmColor: '#dc2626',
      success: (r) => {
        if (r.confirm) {
          manual.value = removeManualCourse(course.id)
          uni.showToast({ title: '已删除', icon: 'none' })
        }
      }
    })
    return
  }
  const lines = []
  if (course.period) lines.push('节次：' + course.period)
  if (course.room) lines.push('地点：' + course.room)
  if (course.teacher) lines.push('教师：' + course.teacher)
  if (course.weeksText) {
    lines.push('周次：' + course.weeksText.replace(/周/g, '') + '周')
  }
  uni.showModal({
    title: course.name,
    content: lines.join('\n') || '暂无更多课程信息',
    showCancel: false,
    confirmText: '知道了'
  })
}

function confirmUnbind() {
  uni.showModal({
    title: '取消绑定',
    content: '将清除已选班级和课表缓存，手动添加的课程会保留。确定取消绑定？',
    confirmText: '确定',
    confirmColor: '#dc2626',
    success: (r) => {
      if (!r.confirm) return
      clearCourseSelection()
      clearCourseAuth()
      clearCourseCache()
      selection.value = null
      auth.value = null
      loadSeq++
      loading.value = false
      tableKey = ''
      table.value = { className: '', days: [] }
      stale.value = false
      error.value = ''
      uni.showToast({ title: '已取消绑定', icon: 'none' })
    }
  })
}

function onWeek(e) {
  weekIndex.value = Number(e.detail.value)
}

function openBind() {
  uni.navigateTo({ url: '/pages/tool/course-bind/course-bind' })
}

async function importFromLink() {
  const parsed = await readClipboardCourseLink()
  if (!parsed) {
    uni.showToast({ title: '剪贴板里没有课表链接', icon: 'none' })
    return
  }
  saveCourseAuth(parsed)
  clearCourseSelection()
  selection.value = null
  auth.value = parsed
  uni.showToast({ title: '已使用课表链接', icon: 'success' })
  load()
}
</script>

<style>
.page {
  min-height: 100vh;
  padding-bottom: 48rpx;
}

.topbar {
  position: relative;
  overflow: hidden;
  padding: calc(var(--status-bar-height) + 26rpx) 36rpx 40rpx;
  color: #ffffff;
  background: linear-gradient(140deg, var(--brand-grad-from) 0%, var(--brand-grad-to) 100%);
}

.topbar::after {
  content: '';
  position: absolute;
  width: 280rpx;
  height: 280rpx;
  top: -130rpx;
  right: -90rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.topbar-kicker {
  position: relative;
  font-size: 20rpx;
  letter-spacing: 3rpx;
  color: rgba(255, 255, 255, 0.65);
}

.topbar-title {
  position: relative;
  margin-top: 10rpx;
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
}

.topbar-sub {
  position: relative;
  margin-top: 8rpx;
  font-size: 23rpx;
  color: rgba(255, 255, 255, 0.82);
}

.bind-card {
  margin: 28rpx 24rpx 0;
  padding: 40rpx 30rpx;
  text-align: center;
  background: #ffffff;
  border: 1rpx solid rgba(233, 237, 246, 0.9);
  border-radius: 28rpx;
  box-shadow: var(--shadow-card);
}

.bind-icon {
  width: 100rpx;
  height: 100rpx;
  margin: 0 auto 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 46rpx;
  background: linear-gradient(150deg, #ffffff 0%, var(--brand-soft) 100%);
  border: 1rpx solid var(--line);
  border-radius: 28rpx;
}

.bind-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--ink);
}

.bind-desc {
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: var(--muted);
}

.btn {
  height: 96rpx;
  margin-top: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: linear-gradient(135deg, var(--brand-grad-from) 0%, var(--brand-grad-to) 100%);
  border-radius: 18rpx;
  font-size: 30rpx;
  font-weight: 600;
  box-shadow: 0 12rpx 24rpx rgba(23, 32, 51, 0.12);
}

.btn--ghost {
  margin-top: 16rpx;
  color: var(--brand);
  background: #ffffff;
  border: 1rpx solid var(--line);
  box-shadow: none;
  font-weight: 500;
}

/* 周次工具条 */
.week-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16rpx 16rpx 0;
  padding: 10rpx 12rpx;
  background: #ffffff;
  border: 1rpx solid rgba(233, 237, 246, 0.9);
  border-radius: 18rpx;
  box-shadow: 0 8rpx 20rpx rgba(23, 32, 51, 0.05);
}

.week-nav {
  display: flex;
  align-items: center;
}

.week-arrow {
  width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--brand);
  background: var(--brand-soft);
  border-radius: 12rpx;
  font-size: 30rpx;
  font-weight: 700;
}

.week-arrow.is-disabled {
  color: #c3cad8;
  background: #f3f5fa;
}

.week-current {
  min-width: 130rpx;
  margin: 0 10rpx;
  padding: 12rpx 16rpx;
  text-align: center;
  color: var(--ink);
  font-size: 26rpx;
  font-weight: 700;
}

.week-caret {
  margin-left: 6rpx;
  color: var(--muted);
  font-weight: 400;
}

.week-actions {
  display: flex;
  align-items: center;
}

.week-today {
  margin-right: 10rpx;
  padding: 12rpx 18rpx;
  color: var(--brand);
  background: var(--brand-soft);
  border-radius: 10rpx;
  font-size: 23rpx;
  font-weight: 600;
}

.week-update {
  margin-right: 10rpx;
  padding: 12rpx 18rpx;
  color: var(--muted);
  background: #f5f7fb;
  border-radius: 10rpx;
  font-size: 23rpx;
}

.week-manage {
  padding: 12rpx 18rpx;
  color: #ffffff;
  background: var(--brand);
  border-radius: 10rpx;
  font-size: 23rpx;
  font-weight: 600;
  box-shadow: 0 4rpx 10rpx rgba(23, 32, 51, 0.1);
}

/* 网格课表 */
.grid-scroll {
  margin: 16rpx 16rpx 0;
  padding-bottom: 4rpx;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.grid-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.timetable-card {
  padding: 16rpx 8rpx 18rpx;
  background: #ffffff;
  border: 1rpx solid rgba(233, 237, 246, 0.9);
  border-radius: 24rpx;
  box-shadow: var(--shadow-card);
}

.grid-head {
  display: flex;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid #eef1f7;
}

.time-col {
  width: 68rpx;
  flex-shrink: 0;
}

.grid-corner {
  display: flex;
  align-items: center;
  justify-content: center;
}

.corner-text {
  font-size: 18rpx;
  color: #b8bfce;
}

.day-head {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6rpx 0;
  border-radius: 10rpx;
}

.day-head.is-today {
  background: var(--brand-soft);
}

.day-name {
  font-size: 23rpx;
  font-weight: 600;
  color: var(--ink);
}

.day-head.is-today .day-name {
  color: var(--brand);
}

.day-today {
  margin-top: 2rpx;
  font-size: 16rpx;
  color: var(--brand);
}

.grid-row {
  display: flex;
  border-bottom: 1rpx dashed #eef1f7;
}

.grid-row:last-child {
  border-bottom: none;
}

.time-cell {
  width: 68rpx;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10rpx 0;
}

.time-cell.is-current {
  background: var(--brand-soft);
  border-radius: 10rpx;
}

.time-period {
  font-size: 20rpx;
  font-weight: 700;
  color: var(--ink);
}

.time-start {
  margin-top: 4rpx;
  font-size: 17rpx;
  color: #b8bfce;
}

.grid-cell {
  flex: 1;
  min-height: 156rpx;
  padding: 8rpx 5rpx;
  display: flex;
  flex-direction: column;
}

.grid-cell.is-today {
  background: rgba(0, 74, 171, 0.028);
  border-radius: 10rpx;
}

.course-block {
  flex: 1;
  margin-bottom: 8rpx;
  padding: 12rpx 10rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-left: 5rpx solid;
  border-radius: 10rpx;
  overflow: hidden;
}

.block-name {
  font-size: 22rpx;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-all;
}

.block-room {
  margin-top: 8rpx;
  font-size: 18rpx;
  opacity: 0.78;
  word-break: break-all;
}

.grid-note {
  display: flex;
  align-items: flex-start;
  margin: 18rpx 16rpx 0;
  padding: 0 8rpx;
}

.note-dot {
  width: 10rpx;
  height: 10rpx;
  margin: 12rpx 12rpx 0 0;
  border-radius: 50%;
  background: var(--brand);
  flex-shrink: 0;
}

.grid-note text {
  flex: 1;
  font-size: 20rpx;
  line-height: 1.6;
  color: var(--muted);
}

.source-hint {
  padding: 24rpx 32rpx 0;
  text-align: center;
  font-size: 20rpx;
  color: #b8bfce;
}

.scroll-hint {
  padding: 14rpx 32rpx 0;
  text-align: center;
  font-size: 20rpx;
  color: var(--brand);
}

.empty-card {
  margin: 16rpx 16rpx 0;
  padding: 70rpx 40rpx;
  text-align: center;
  background: #ffffff;
  border: 1rpx solid rgba(233, 237, 246, 0.9);
  border-radius: 24rpx;
  box-shadow: var(--shadow-card);
}

.empty-icon {
  font-size: 64rpx;
}

.empty-title {
  margin-top: 18rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--ink);
}

.empty-desc {
  margin-top: 10rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: var(--muted);
}

.tip {
  padding: 60rpx 32rpx;
  text-align: center;
  font-size: 25rpx;
  color: var(--muted);
}

.tip--error {
  color: #dc2626;
}

.retry {
  margin-left: 12rpx;
  color: var(--brand);
  text-decoration: underline;
}

.stale-tip {
  margin: 16rpx 16rpx 0;
  padding: 14rpx 22rpx;
  color: #b45309;
  background: #fef3c7;
  border-radius: 12rpx;
  font-size: 21rpx;
}
</style>
