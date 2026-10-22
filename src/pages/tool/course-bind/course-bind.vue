<template>
  <view class="page" :style="pageStyle">
    <view v-if="loading" class="tip">正在加载院系…</view>
    <view v-else-if="error" class="tip tip--error">
      {{ error }}
      <text class="retry" @tap="reload">重试</text>
    </view>

    <block v-else>
      <view class="card">
        <view class="field">
          <view class="field-label">院系</view>
          <picker :range="collegeNames" :value="collegeIndex" @change="onCollege">
            <view class="picker">{{ collegeNames[collegeIndex] || '请选择院系' }} ▾</view>
          </picker>
        </view>

        <view class="field">
          <view class="field-label">班级</view>
          <picker
            :range="classNames"
            :value="classIndex"
            :disabled="!classNames.length"
            @change="onClass"
          >
            <view class="picker" :class="{ 'picker--disabled': !classNames.length }">
              {{ classNames[classIndex] || (loadingClasses ? '正在加载班级…' : '请先选择院系') }} ▾
            </view>
          </picker>
        </view>
      </view>

      <view class="hint">
        选择你所在的院系和班级后导入，课表会保存在本机，之后打开课程表自动加载。课表来自学校公众号班级课表页。
      </view>
    </block>

    <view class="fallback" @tap="importFromLink">改用公众号课表链接导入</view>

    <view class="bottom-bar">
      <view class="btn" :class="{ 'btn--loading': importing || loading }" @tap="onImport">
        {{ importing ? '正在导入…' : '导入课表' }}
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getTheme, themeVars, applyNavTheme } from '@/utils/theme.js'
import {
  fetchCourseColleges,
  fetchCourseClasses,
  queryCourseTable,
  getCourseSelection,
  saveCourseSelection,
  saveCourseCache,
  markCourseRefreshed,
  saveCourseAuth,
  clearCourseSelection,
  clearCourseAuth,
  readClipboardCourseLink
} from '@/utils/course.js'

const theme = ref(getTheme())
const colleges = ref([])
const classes = ref([])
const collegeIndex = ref(0)
const classIndex = ref(0)
const loading = ref(true)
const loadingClasses = ref(false)
const importing = ref(false)
const error = ref('')
let hidden = {}

const pageStyle = computed(() => themeVars(theme.value))
const collegeNames = computed(() => colleges.value.map((c) => c.text))
const classNames = computed(() => classes.value.map((c) => c.text))

onLoad(() => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  reload()
})

async function reload() {
  loading.value = true
  error.value = ''
  const data = await fetchCourseColleges()
  if (!data || !data.colleges.length) {
    loading.value = false
    error.value = '加载院系列表失败'
    return
  }
  colleges.value = data.colleges
  hidden = data.hidden
  const saved = getCourseSelection()
  if (saved) {
    const ci = colleges.value.findIndex((c) => c.value === saved.collegeValue)
    if (ci >= 0) {
      collegeIndex.value = ci
      await loadClasses(saved.classValue)
    }
  }
  loading.value = false
}

let classesSeq = 0

async function loadClasses(preselectValue) {
  const seq = ++classesSeq
  if (!colleges.value.length) return
  loadingClasses.value = true
  const data = await fetchCourseClasses(hidden, colleges.value[collegeIndex.value].value)
  if (seq !== classesSeq) return
  loadingClasses.value = false
  if (!data) {
    uni.showToast({ title: '加载班级失败', icon: 'none' })
    return
  }
  hidden = data.hidden
  classes.value = data.classes
  const idx = data.classes.findIndex((c) => c.value === preselectValue)
  classIndex.value = idx >= 0 ? idx : 0
}

async function importFromLink() {
  const parsed = await readClipboardCourseLink()
  if (!parsed) {
    uni.showToast({ title: '剪贴板里没有课表链接', icon: 'none' })
    return
  }
  saveCourseAuth(parsed)
  clearCourseSelection()
  uni.showToast({ title: '已使用课表链接', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 700)
}

function onCollege(e) {
  collegeIndex.value = Number(e.detail.value)
  classes.value = []
  classIndex.value = 0
  loadClasses('')
}

function onClass(e) {
  classIndex.value = Number(e.detail.value)
}

async function onImport() {
  if (importing.value || loading.value) return
  const college = colleges.value[collegeIndex.value]
  const cls = classes.value[classIndex.value]
  if (!college || !cls) {
    uni.showToast({ title: '请选择院系和班级', icon: 'none' })
    return
  }
  importing.value = true
  const table = await queryCourseTable(hidden, college.value, cls.value)
  importing.value = false
  if (!table || !table.days.length) {
    uni.showModal({
      title: '导入失败',
      content: '没有查到该班级的课表，请确认班级是否选择正确，或稍后重试。',
      showCancel: false
    })
    return
  }
  clearCourseAuth()
  saveCourseSelection({
    collegeValue: college.value,
    collegeName: college.text,
    classValue: cls.value,
    className: cls.text
  })
  saveCourseCache(Object.assign({ classValue: cls.value }, table))
  markCourseRefreshed()
  uni.showToast({ title: '课表已导入', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 800)
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 24rpx 24rpx 200rpx;
  box-sizing: border-box;
}

.card {
  padding: 32rpx;
  background: #ffffff;
  border-radius: 20rpx;
}

.field {
  margin-bottom: 28rpx;
}

.field:last-child {
  margin-bottom: 0;
}

.field-label {
  margin-bottom: 12rpx;
  font-size: 28rpx;
  color: #4b5563;
}

.picker {
  padding: 20rpx 24rpx;
  background: #f9fafb;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1f2937;
}

.picker--disabled {
  color: #c0c4cc;
}

.hint {
  padding: 28rpx 8rpx 0;
  font-size: 22rpx;
  color: #9ca3af;
  line-height: 1.7;
}

.fallback {
  margin: 32rpx 0 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--brand);
  text-decoration: underline;
}

.tip {
  padding: 80rpx 32rpx;
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

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -4rpx 16rpx rgba(15, 23, 42, 0.06);
}

.btn {
  height: 92rpx;
  border-radius: 46rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand);
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
}

.btn--loading {
  opacity: 0.7;
}
</style>
