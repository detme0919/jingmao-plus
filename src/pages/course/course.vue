<template>
  <view class="page" :style="pageStyle">
    <!-- 顶部头部（自绘，替代系统导航栏） -->
    <view class="topbar">
      <view class="topbar-title">课程表</view>
      <view class="topbar-sub">{{ selection ? (table.className || selection.className) : '班级课表' }}</view>
    </view>

    <!-- 未绑定 -->
    <view v-if="!selection && !auth" class="bind-card">
      <view class="bind-title">选择班级导入课表</view>
      <view class="bind-desc">
        选择你所在的院系和班级，导入后课表保存在本机，之后打开课程表自动加载。
      </view>
      <view class="btn" @tap="openBind">选择班级并导入</view>
      <view class="btn btn--ghost" @tap="importFromLink">从剪贴板读取课表链接</view>
    </view>

    <block v-else>
      <!-- 周次选择 -->
      <view class="week-row">
        <picker :range="weekOptions" :value="weekIndex" @change="onWeek">
          <view class="week-picker">{{ weekOptions[weekIndex] }} ▾</view>
        </picker>
        <view class="week-actions">
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
      <view v-else-if="!hasAnyCourse" class="tip">
        {{ weekIndex ? '本周暂无课程，可切换其他周次' : '暂无课程数据' }}
      </view>

      <block v-else>
        <view v-for="day in displayDays" :key="day.label" class="day-card">
          <view class="day-head">
            <text class="day-name">{{ day.label }}</text>
            <text v-if="day.courses.length" class="day-count">{{ day.courses.length }} 门</text>
          </view>
          <view v-if="!day.courses.length" class="empty-day">无课</view>
          <view v-for="(c, i) in day.courses" :key="i" class="course-row" @tap="onCourseTap(c)">
            <view class="period">{{ c.period }}</view>
            <view class="course-body">
              <view class="course-name">{{ c.name }}<text v-if="c.manual" class="manual-tag">手动</text></view>
              <view v-if="classTime(c)" class="course-time">{{ classTime(c) }}</view>
              <view v-if="c.room || c.teacher" class="course-meta">
                <text v-if="c.room">{{ c.room }}</text>
                <text v-if="c.teacher" class="teacher">{{ c.teacher }}</text>
              </view>
              <view v-if="!weekIndex && c.weeksText" class="course-weeks">{{ c.weeksText }}</view>
            </view>
          </view>
        </view>
        <view class="time-card">
          <view class="time-title">上课时间</view>
          <view v-for="t in periodTimes" :key="t.period" class="time-row">
            <text class="time-period">{{ t.period }}</text>
            <text class="time-value">{{ t.time }}</text>
          </view>
          <view class="time-note">3-4 节时间与楼栋有关：四、五号楼 10:10-11:50，一、二、三号楼 10:30-12:10。</view>
        </view>
        <view class="hint">课表来自学校公众号课表页面，如遇调课请以教务系统为准。</view>
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

const periodTimes = [
  { period: '1-2节', time: '08:10-09:50' },
  { period: '3-4节', time: '10:10-11:50（四、五号楼）\n10:30-12:10（一、二、三号楼）' },
  { period: '5-6节', time: '14:40-16:20' },
  { period: '7-8节', time: '16:40-18:20' },
  { period: '9-10节', time: '19:00-20:40' }
]

const baseLabels = ['周一', '周二', '周三', '周四', '周五']

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
    if (cachedKey === key) {
      table.value = cached
      tableKey = key
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
    if (changed || weekIndex.value === 0) {
      const weekHasCourse = data.days.some(
        (d) => coursesForWeek(d.courses, cur.week).length > 0
      )
      weekIndex.value = cur.week > 0 && weekHasCourse ? cur.week : 0
    }
    saveCourseCache(
      Object.assign(sel ? { classValue: sel.classValue } : { linkKey: authSnap.wxid }, data, {
        currentWeek: weekIndex.value
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

function classTime(course) {
  const period = course.period
  if (period === '3-4节') {
    const m = String(course.room || '').match(/^\s*(\d)/)
    if (m) {
      const building = Number(m[1])
      if (building === 4 || building === 5) return '10:10-11:50'
      if (building >= 1 && building <= 3) return '10:30-12:10'
    }
    return '10:10-11:50 / 10:30-12:10'
  }
  return PERIOD_TIMES[period] || ''
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
  if (!course.manual) return
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
  padding-bottom: 40rpx;
}

.topbar {
  padding: calc(var(--status-bar-height) + 28rpx) 40rpx 40rpx;
  background: linear-gradient(135deg, var(--brand-grad-from) 0%, var(--brand-grad-to) 100%);
  color: #ffffff;
}

.topbar-title {
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
}

.topbar-sub {
  margin-top: 8rpx;
  font-size: 24rpx;
  opacity: 0.82;
}

.bind-card {
  margin: 32rpx 24rpx 0;
  padding: 40rpx 32rpx;
  background: #ffffff;
  border-radius: 20rpx;
  text-align: center;
}

.bind-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
}

.bind-desc {
  margin-top: 14rpx;
  margin-bottom: 8rpx;
  font-size: 24rpx;
  color: #6b7280;
  line-height: 1.7;
}

.btn {
  height: 92rpx;
  margin-top: 28rpx;
  border-radius: 46rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand);
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 600;
}

.btn--ghost {
  margin-top: 18rpx;
  background: #ffffff;
  color: var(--brand);
  border: 2rpx solid var(--brand);
  font-weight: 400;
}

.week-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 24rpx 8rpx;
}

.week-picker {
  padding: 12rpx 28rpx;
  background: #ffffff;
  border-radius: 999rpx;
  font-size: 28rpx;
  color: #1f2937;
  box-shadow: 0 4rpx 12rpx rgba(15, 23, 42, 0.06);
}

.week-actions {
  display: flex;
  align-items: center;
}

.week-update {
  margin-right: 16rpx;
  padding: 12rpx 30rpx;
  background: #ffffff;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: #6b7280;
  border: 2rpx solid #e5e7eb;
}

.week-manage {
  padding: 12rpx 30rpx;
  background: #ffffff;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: var(--brand);
  box-shadow: 0 4rpx 12rpx rgba(15, 23, 42, 0.06);
}

.tip {
  padding: 60rpx 32rpx;
  text-align: center;
  font-size: 26rpx;
  color: #9ca3af;
}

.tip--error {
  color: #dc2626;
}

.retry {
  margin-left: 12rpx;
  color: var(--brand);
  text-decoration: underline;
}

.day-card {
  margin: 20rpx 24rpx 0;
  padding: 24rpx 28rpx;
  background: #ffffff;
  border-radius: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(15, 23, 42, 0.05);
}

.day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.day-name {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--brand);
}

.day-count {
  font-size: 22rpx;
  color: #9ca3af;
}

.empty-day {
  padding: 8rpx 0;
  font-size: 24rpx;
  color: #c0c4cc;
}

.course-row {
  display: flex;
  padding: 18rpx 0;
  border-top: 1rpx solid #f3f4f6;
}

.period {
  width: 110rpx;
  flex-shrink: 0;
  font-size: 24rpx;
  color: #4b5563;
  font-weight: 600;
}

.course-body {
  flex: 1;
  min-width: 0;
}

.course-name {
  font-size: 28rpx;
  color: #1f2937;
  font-weight: 500;
  word-break: break-all;
}

.course-meta {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #9ca3af;
}

.manual-tag {
  margin-left: 10rpx;
  padding: 2rpx 10rpx;
  font-size: 18rpx;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 6rpx;
  vertical-align: middle;
}

.teacher {
  margin-left: 16rpx;
}

.course-time {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--brand);
}

.time-card {
  margin: 24rpx 24rpx 0;
  padding: 28rpx 32rpx;
  background: #ffffff;
  border-radius: 20rpx;
}

.time-title {
  margin-bottom: 12rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #4b5563;
}

.time-row {
  display: flex;
  padding: 10rpx 0;
  border-top: 1rpx solid #f3f4f6;
}

.time-period {
  width: 130rpx;
  flex-shrink: 0;
  font-size: 24rpx;
  color: #6b7280;
}

.time-value {
  flex: 1;
  font-size: 24rpx;
  color: #1f2937;
  line-height: 1.6;
  white-space: pre-line;
}

.time-note {
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #9ca3af;
  line-height: 1.6;
}

.course-weeks {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #b45309;
}

.stale-tip {
  margin: 16rpx 24rpx 0;
  padding: 14rpx 22rpx;
  background: #fef3c7;
  border-radius: 12rpx;
  font-size: 22rpx;
  color: #b45309;
}

.hint {
  padding: 32rpx 32rpx 0;
  text-align: center;
  font-size: 22rpx;
  color: #c0c4cc;
  line-height: 1.6;
}
</style>
