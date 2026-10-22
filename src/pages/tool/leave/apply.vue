<template>
  <view class="page" :style="pageStyle">
    <view v-if="loadingConf" class="loading">正在加载时间规则…</view>

    <block v-else>
      <view class="card">
        <view class="field">
          <view class="field-label">预计离校时间</view>
          <view class="time-row">
            <picker mode="date" :value="startDate" :start="minDate" :end="maxDate" @change="onStartDate">
              <view class="picker">{{ startDate }}</view>
            </picker>
            <picker mode="time" :value="startTime" @change="onStartTime">
              <view class="picker">{{ startTime }}</view>
            </picker>
          </view>
        </view>

        <view class="field">
          <view class="field-label">预计返校时间</view>
          <view class="time-row">
            <picker mode="date" :value="endDate" :start="minDate" :end="maxDate" @change="onEndDate">
              <view class="picker">{{ endDate }}</view>
            </picker>
            <picker mode="time" :value="endTime" @change="onEndTime">
              <view class="picker">{{ endTime }}</view>
            </picker>
          </view>
        </view>

        <view class="rule">
          每日 {{ config.outSchoolTime }} - {{ config.inSchoolTime }} 可出入校，离校与返校时间需相差 1 小时以上
        </view>
      </view>

      <view class="card">
        <view class="field">
          <view class="field-label">外出事由</view>
          <textarea
            v-model="reason"
            class="textarea"
            placeholder="请输入外出事由"
            :maxlength="30"
          />
          <view class="counter">{{ reason.length }}/30</view>
        </view>

        <view class="field">
          <view class="field-label">交通方式</view>
          <picker :range="trafficWays" :value="trafficIndex" @change="onTraffic">
            <view class="picker picker--full">{{ trafficWays[trafficIndex] }}</view>
          </picker>
        </view>

        <view class="field">
          <view class="field-label">目的地</view>
          <input v-model="destination" class="input" placeholder="请输入目的地" :maxlength="20" />
          <view class="counter">{{ destination.length }}/20</view>
        </view>
      </view>

      <view class="tip">
        门禁权限将在填写的时间段内生效，请在该时段内完成离校、返校。
      </view>
    </block>

    <view class="bottom-bar">
      <view class="btn" :class="{ 'btn--loading': submitting }" @tap="onSubmit">
        {{ submitting ? '提交中…' : '提交申请' }}
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  getLeaveToken,
  fetchLeaveConfig,
  submitLeave,
  TRAFFIC_WAYS
} from '@/utils/leave.js'
import { getTheme, themeVars, applyNavTheme } from '@/utils/theme.js'

const token = ref('')
const config = ref({ outSchoolTime: '06:30', inSchoolTime: '22:00', advanceDays: 1 })
const loadingConf = ref(true)
const startDate = ref('')
const startTime = ref('')
const endDate = ref('')
const endTime = ref('')
const minDate = ref('')
const maxDate = ref('')
const reason = ref('')
const destination = ref('')
const trafficIndex = ref(0)
const trafficWays = TRAFFIC_WAYS
const submitting = ref(false)
const theme = ref(getTheme())

const pageStyle = computed(() => themeVars(theme.value))

function pad(n) {
  return String(n).padStart(2, '0')
}

function dayStr(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function nowTime() {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function addMinutes(hm, mins) {
  const [h, m] = hm.split(':').map(Number)
  let total = h * 60 + m + mins
  total = Math.max(0, Math.min(23 * 60 + 59, total))
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

function toMinutes(hm) {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

function defaultStart(conf) {
  // 默认取当前时间后 1 分钟，但不早于学校允许的出校时间
  let t = addMinutes(nowTime(), 1)
  if (t < conf.outSchoolTime) t = conf.outSchoolTime
  return t
}

onLoad(async (query) => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  token.value = getLeaveToken()
  if (!token.value) {
    uni.showToast({ title: '请先登录或保存登记链接', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 900)
    return
  }
  const conf = await fetchLeaveConfig(token.value)
  if (conf) config.value = conf
  minDate.value = dayStr(0)
  maxDate.value = dayStr(config.value.advanceDays || 0)
  // 今天已不足 1 小时可申请时，默认落到明天
  const canTomorrow = (config.value.advanceDays || 0) >= 1
  const tooLate =
    toMinutes(config.value.inSchoolTime) - (toMinutes(nowTime()) + 1) < 60
  const useTomorrow = canTomorrow && tooLate
  const day = dayStr(useTomorrow ? 1 : 0)
  startDate.value = day
  endDate.value = day
  startTime.value = useTomorrow ? config.value.outSchoolTime : defaultStart(config.value)
  endTime.value = config.value.inSchoolTime
  loadingConf.value = false
})

function onStartDate(e) {
  startDate.value = e.detail.value
  if (!endDate.value || endDate.value < startDate.value) endDate.value = startDate.value
}
function onStartTime(e) {
  startTime.value = e.detail.value
}
function onEndDate(e) {
  endDate.value = e.detail.value
}
function onEndTime(e) {
  endTime.value = e.detail.value
}
function onTraffic(e) {
  trafficIndex.value = Number(e.detail.value)
}

function validate() {
  if (!startDate.value || !startTime.value || !endDate.value || !endTime.value) {
    return '请选择完整的离校和返校时间'
  }
  if (startDate.value !== endDate.value) return '离校和返校需在同一天'
  if (endTime.value <= startTime.value) return '返校时间必须晚于离校时间'
  const start = new Date(`${startDate.value} ${startTime.value}`.replace(/-/g, '/'))
  const end = new Date(`${endDate.value} ${endTime.value}`.replace(/-/g, '/'))
  if (end - start < 3600000) return '离校、返校时间需相差一个小时以上'
  if (start.getTime() < Date.now() - 5 * 60000) return '离校时间不能早于当前时间'
  if (startTime.value < config.value.outSchoolTime) {
    return `最早 ${config.value.outSchoolTime} 后可离校`
  }
  if (endTime.value > config.value.inSchoolTime) {
    return `最晚 ${config.value.inSchoolTime} 前需返校`
  }
  if (!reason.value.trim()) return '请输入外出事由'
  if (reason.value.trim().length > 30) return '外出事由最多 30 字'
  if (!destination.value.trim()) return '请输入目的地'
  if (destination.value.trim().length > 20) return '目的地最多 20 字'
  return ''
}

function onSubmit() {
  if (submitting.value) return
  const err = validate()
  if (err) {
    uni.showToast({ title: err, icon: 'none', duration: 2600 })
    return
  }
  uni.showModal({
    title: '确认提交',
    content: `离校：${startDate.value} ${startTime.value}\n返校：${endDate.value} ${endTime.value}\n交通：${trafficWays[trafficIndex.value]}`,
    confirmText: '提交',
    success: (r) => {
      if (r.confirm) doSubmit()
    }
  })
}

async function doSubmit() {
  submitting.value = true
  const res = await submitLeave(token.value, {
    apply_begin_time: `${startDate.value} ${startTime.value}:00`,
    apply_end_time: `${endDate.value} ${endTime.value}:00`,
    reason: reason.value.trim(),
    traffic_way: trafficIndex.value + 1,
    destination: destination.value.trim()
  })
  submitting.value = false
  if (res.ok) {
    uni.showToast({ title: '提交成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 900)
  } else {
    uni.showModal({
      title: '提交失败',
      content: res.msg || '请稍后重试，或改用学校网页版提交。',
      showCancel: false
    })
  }
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 24rpx 24rpx 180rpx;
  box-sizing: border-box;
}

.loading {
  padding: 80rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: #9ca3af;
}

.card {
  margin-bottom: 24rpx;
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
  margin-bottom: 14rpx;
  font-size: 28rpx;
  color: #4b5563;
}

.time-row {
  display: flex;
}

.picker {
  padding: 20rpx 24rpx;
  background: #f9fafb;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1f2937;
  min-width: 200rpx;
}

.time-row .picker {
  flex: 1;
  margin-right: 16rpx;
  text-align: center;
}

.time-row picker:last-child .picker {
  margin-right: 0;
}

.picker--full {
  text-align: left;
}

.rule {
  margin-top: 8rpx;
  padding: 16rpx 20rpx;
  background: var(--brand-soft);
  border-radius: 12rpx;
  font-size: 22rpx;
  color: var(--brand);
  line-height: 1.6;
}

.textarea {
  width: 100%;
  height: 140rpx;
  padding: 20rpx 24rpx;
  box-sizing: border-box;
  background: #f9fafb;
  border-radius: 12rpx;
  font-size: 28rpx;
}

.input {
  padding: 20rpx 24rpx;
  background: #f9fafb;
  border-radius: 12rpx;
  font-size: 28rpx;
}

.counter {
  margin-top: 8rpx;
  text-align: right;
  font-size: 22rpx;
  color: #c0c4cc;
}

.tip {
  padding: 0 8rpx;
  font-size: 22rpx;
  color: #9ca3af;
  line-height: 1.7;
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
