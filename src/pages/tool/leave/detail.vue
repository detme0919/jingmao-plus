<template>
  <view class="page" :style="pageStyle">
    <view v-if="loading" class="tip">正在加载…</view>
    <view v-else-if="error" class="tip tip--error">
      {{ error }}
      <text class="retry" @tap="load">重试</text>
    </view>

    <block v-else-if="detail">
      <view class="card">
        <view class="card-head">
          <view class="status" :class="'status--' + statusInfo.cls">{{ statusInfo.text }}</view>
          <view class="apply-time">申请于 {{ detail.create_time || '—' }}</view>
        </view>

        <view class="row"><text class="label">预计离校</text><text class="value">{{ detail.apply_begin_time || '—' }}</text></view>
        <view class="row"><text class="label">预计返校</text><text class="value">{{ detail.apply_end_time || '—' }}</text></view>
        <view class="row"><text class="label">实际离校</text><text class="value">{{ detail.out_begin_time || '—' }}</text></view>
        <view class="row"><text class="label">实际返校</text><text class="value">{{ detail.out_end_time || '—' }}</text></view>
      </view>

      <view class="card">
        <view class="row"><text class="label">外出事由</text><text class="value">{{ detail.reason || '—' }}</text></view>
        <view class="row"><text class="label">交通方式</text><text class="value">{{ trafficText }}</text></view>
        <view class="row"><text class="label">目的地</text><text class="value">{{ detail.destination || '—' }}</text></view>
      </view>

      <view class="tip">
        门禁权限在申请时段内生效。如需修改或重新申请，请返回列表重新提交。
      </view>
    </block>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  getLeaveToken,
  fetchLeaveDetail,
  LEAVE_STATUS,
  TRAFFIC_WAYS
} from '@/utils/leave.js'
import { getTheme, themeVars, applyNavTheme } from '@/utils/theme.js'

const id = ref('')
const detail = ref(null)
const loading = ref(true)
const error = ref('')
const theme = ref(getTheme())

const pageStyle = computed(() => themeVars(theme.value))
const statusInfo = computed(
  () => LEAVE_STATUS[String(detail.value && detail.value.status)] || { text: '未知', cls: 'info' }
)
const trafficText = computed(() => {
  if (!detail.value) return '—'
  const raw = detail.value.traffic_way
  const num = Number(raw)
  if (num >= 1 && num <= 4) return TRAFFIC_WAYS[num - 1]
  return raw || '—'
})

onLoad((query) => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  id.value = (query && query.id) || ''
  load()
})

async function load() {
  loading.value = true
  error.value = ''
  const token = getLeaveToken()
  if (!token) {
    loading.value = false
    error.value = '未登录，请先返回并登录统一认证'
    return
  }
  if (!id.value) {
    loading.value = false
    error.value = '缺少申请记录 ID'
    return
  }
  const data = await fetchLeaveDetail(token, id.value)
  loading.value = false
  if (!data) {
    error.value = '加载失败，请稍后重试'
    return
  }
  detail.value = data
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 24rpx;
  box-sizing: border-box;
}

.card {
  margin-bottom: 24rpx;
  padding: 32rpx;
  background: #ffffff;
  border-radius: 20rpx;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.status {
  padding: 6rpx 18rpx;
  font-size: 22rpx;
  border-radius: 999rpx;
}

.status--info {
  color: #475569;
  background: #f1f5f9;
}

.status--warn {
  color: #b45309;
  background: #fef3c7;
}

.status--ok {
  color: #047857;
  background: #d1fae5;
}

.status--danger {
  color: #b91c1c;
  background: #fee2e2;
}

.apply-time {
  font-size: 22rpx;
  color: #9ca3af;
}

.row {
  display: flex;
  margin-top: 10rpx;
  font-size: 28rpx;
  line-height: 1.7;
}

.label {
  width: 160rpx;
  color: #9ca3af;
  flex-shrink: 0;
}

.value {
  flex: 1;
  color: #1f2937;
  word-break: break-all;
}

.tip {
  padding: 36rpx 8rpx;
  font-size: 22rpx;
  color: #9ca3af;
  line-height: 1.7;
}

.tip--error {
  color: #dc2626;
}

.retry {
  margin-left: 12rpx;
  color: var(--brand);
  text-decoration: underline;
}
</style>
