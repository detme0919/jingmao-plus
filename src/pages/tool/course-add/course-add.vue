<template>
  <view class="page" :style="pageStyle">
    <view class="card">
      <view class="field">
        <view class="field-label">课程名称</view>
        <input v-model="name" class="input" placeholder="请输入课程名称" :maxlength="20" />
      </view>

      <view class="field">
        <view class="field-label">星期</view>
        <picker :range="days" :value="dayIndex" @change="onDay">
          <view class="picker">{{ days[dayIndex] }}</view>
        </picker>
      </view>

      <view class="field">
        <view class="field-label">节次</view>
        <picker :range="periods" :value="periodIndex" @change="onPeriod">
          <view class="picker">{{ periods[periodIndex] }}</view>
        </picker>
      </view>

      <view class="field">
        <view class="field-label">教室（选填）</view>
        <input v-model="room" class="input" placeholder="如 5603" :maxlength="20" />
      </view>

      <view class="field">
        <view class="field-label">教师（选填）</view>
        <input v-model="teacher" class="input" placeholder="教师姓名" :maxlength="10" />
      </view>

      <view class="field">
        <view class="field-label">周次（选填）</view>
        <input v-model="weeksText" class="input" placeholder="如 1-16 或 3,5,7，留空表示每周" :maxlength="30" />
      </view>
    </view>

    <view class="bottom-bar">
      <view class="btn" @tap="onSave">保存课程</view>
    </view>

    <view v-if="manualList.length" class="list-card">
      <view class="list-title">已手动添加的课程</view>
      <view v-for="item in manualList" :key="item.id" class="manual-row">
        <view class="manual-main">
          <view class="manual-name">{{ item.name }}</view>
          <view class="manual-meta">
            {{ item.day }} · {{ item.period }}
            <text v-if="item.room"> · {{ item.room }}</text>
            <text v-if="item.weeksText"> · {{ item.weeksText }}</text>
          </view>
        </view>
        <view class="manual-del" @tap="onDelete(item)">删除</view>
      </view>
    </view>

    <view class="hint">手动添加的课程只保存在本机，不会同步到学校系统；课表页会把它和班级课表合并显示。</view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getTheme, themeVars, applyNavTheme } from '@/utils/theme.js'
import {
  getManualCourses,
  addManualCourse,
  removeManualCourse
} from '@/utils/course.js'
import { expandWeeks } from '@/utils/course-parse.js'

const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const periods = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节']

const name = ref('')
const dayIndex = ref(0)
const periodIndex = ref(0)
const room = ref('')
const teacher = ref('')
const weeksText = ref('')
const manualList = ref([])
const theme = ref(getTheme())

const pageStyle = computed(() => themeVars(theme.value))

onShow(() => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  manualList.value = getManualCourses()
})

function onDay(e) {
  dayIndex.value = Number(e.detail.value)
}
function onPeriod(e) {
  periodIndex.value = Number(e.detail.value)
}

function onSave() {
  const courseName = name.value.trim()
  if (!courseName) {
    uni.showToast({ title: '请输入课程名称', icon: 'none' })
    return
  }
  const weekText = weeksText.value.trim()
  const weeks = weekText ? expandWeeks(weekText) : []
  if (weekText && !weeks.length) {
    uni.showToast({ title: '周次格式不正确', icon: 'none' })
    return
  }
  addManualCourse({
    name: courseName,
    day: days[dayIndex.value],
    period: periods[periodIndex.value],
    room: room.value.trim(),
    teacher: teacher.value.trim(),
    weeksText: weekText,
    weeks
  })
  uni.showToast({ title: '已添加', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 700)
}

function onDelete(item) {
  uni.showModal({
    title: '删除课程',
    content: `确定删除「${item.name}」？`,
    confirmText: '删除',
    confirmColor: '#dc2626',
    success: (r) => {
      if (!r.confirm) return
      manualList.value = removeManualCourse(item.id)
      uni.showToast({ title: '已删除', icon: 'none' })
    }
  })
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

.input,
.picker {
  padding: 20rpx 24rpx;
  background: #f9fafb;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1f2937;
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

.list-card {
  margin-top: 24rpx;
  padding: 28rpx 32rpx;
  background: #ffffff;
  border-radius: 20rpx;
}

.list-title {
  margin-bottom: 8rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #4b5563;
}

.manual-row {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-top: 1rpx solid #f3f4f6;
}

.manual-main {
  flex: 1;
  min-width: 0;
}

.manual-name {
  font-size: 28rpx;
  color: #1f2937;
}

.manual-meta {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #9ca3af;
}

.manual-del {
  flex-shrink: 0;
  margin-left: 20rpx;
  padding: 8rpx 20rpx;
  font-size: 24rpx;
  color: #dc2626;
  border: 2rpx solid #fecaca;
  border-radius: 999rpx;
}

.hint {
  padding: 32rpx 8rpx 0;
  font-size: 22rpx;
  color: #9ca3af;
  line-height: 1.7;
}
</style>
