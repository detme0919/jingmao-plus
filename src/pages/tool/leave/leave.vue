<template>
  <view class="page" :style="pageStyle">
    <!-- 状态筛选 -->
    <scroll-view scroll-x class="filters" :show-scrollbar="false">
      <view
        v-for="f in filters"
        :key="f.key"
        class="chip"
        :class="{ 'chip--active': filter === f.key }"
        @tap="changeFilter(f.key)"
      >
        {{ f.text }}
      </view>
    </scroll-view>

    <!-- 记录列表 -->
    <view class="list">
      <view v-for="r in list" :key="r.id" class="card" @tap="goDetail(r)">
        <view class="card-head">
          <view class="status" :class="'status--' + statusOf(r).cls">{{ statusOf(r).text }}</view>
          <view class="apply-time">申请于 {{ r.create_time || '—' }}</view>
        </view>
        <view class="row"><text class="label">预计离校</text><text class="value">{{ r.apply_begin_time || '—' }}</text></view>
        <view class="row"><text class="label">预计返校</text><text class="value">{{ r.apply_end_time || '—' }}</text></view>
        <view class="row"><text class="label">实际离校</text><text class="value">{{ r.out_begin_time || '—' }}</text></view>
        <view class="row"><text class="label">实际返校</text><text class="value">{{ r.out_end_time || '—' }}</text></view>
        <view v-if="r.reason" class="row"><text class="label">外出事由</text><text class="value">{{ r.reason }}</text></view>
      </view>

      <view v-if="loading && !list.length" class="tip">正在加载…</view>
      <view v-else-if="error" class="tip tip--error">
        {{ error }}
        <text class="retry" @tap="reload">重试</text>
      </view>
      <view v-else-if="!list.length" class="tip">暂无登记记录</view>
      <view v-else-if="finished" class="tip">没有更多了</view>
      <view v-else-if="loading" class="tip">加载中…</view>
    </view>

    <!-- 底部操作 -->
    <view class="bottom-bar">
      <view class="btn" @tap="goApply">离校申请</view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import {
  getLeaveToken,
  fetchLeaveList,
  LEAVE_STATUS
} from '@/utils/leave.js'
import { getTheme, themeVars, applyNavTheme } from '@/utils/theme.js'

const filters = [
  { key: '', text: '全部' },
  { key: '1', text: '未出校' },
  { key: '2', text: '待返校' },
  { key: '3', text: '已返校' },
  { key: '4', text: '超时未返校' }
]

const token = ref('')
const filter = ref('')
const list = ref([])
const page = ref(1)
const finished = ref(false)
const loading = ref(false)
const error = ref('')
const theme = ref(getTheme())
let loadSeq = 0

const pageStyle = computed(() => themeVars(theme.value))

onShow(() => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  token.value = getLeaveToken()
  if (!token.value) {
    error.value = '未登录，请先在「我的」页面登录统一认证'
    list.value = []
    return
  }
  reload()
})

function statusOf(record) {
  return LEAVE_STATUS[String(record.status)] || { text: '未知', cls: 'info' }
}

async function load(reset) {
  if (loading.value && !reset) return
  const seq = ++loadSeq
  const pageToLoad = reset ? 1 : page.value
  const statusToLoad = filter.value
  loading.value = true
  error.value = ''
  if (reset) {
    page.value = 1
    finished.value = false
  }
  try {
    const res = await fetchLeaveList(token.value, {
      status: statusToLoad,
      page: pageToLoad,
      pageSize: 10
    })
    if (seq !== loadSeq) return
    if (!res.ok) {
      error.value = res.msg || '加载失败'
      if (reset) list.value = []
      return
    }
    list.value = reset ? res.list : list.value.concat(res.list)
    const totalPage = res.pageInfo ? Number(res.pageInfo.totalPage || 1) : 1
    finished.value = pageToLoad >= totalPage
    page.value = pageToLoad + 1
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

function reload() {
  load(true)
}

function changeFilter(key) {
  if (filter.value === key) return
  filter.value = key
  list.value = []
  load(true)
}

onPullDownRefresh(() => {
  if (!token.value) {
    uni.stopPullDownRefresh()
    return
  }
  load(true).finally(() => uni.stopPullDownRefresh())
})

onReachBottom(() => {
  if (token.value && !finished.value) load(false)
})

function goApply() {
  if (!token.value) {
    uni.showModal({
      title: '需要登录',
      content: '请先在「我的」页面登录学校统一认证，或在配置页保存登记链接。',
      showCancel: false
    })
    return
  }
  uni.navigateTo({ url: '/pages/tool/leave/apply' })
}

function goDetail(record) {
  uni.navigateTo({ url: '/pages/tool/leave/detail?id=' + encodeURIComponent(record.id) })
}
</script>

<style>
.page {
  min-height: 100vh;
  padding-bottom: 160rpx;
  box-sizing: border-box;
}

.filters {
  white-space: nowrap;
  padding: 20rpx 24rpx 4rpx;
  background: transparent;
}

.chip {
  display: inline-block;
  padding: 12rpx 28rpx;
  margin-right: 16rpx;
  font-size: 26rpx;
  color: #6b7280;
  background: #ffffff;
  border-radius: 999rpx;
  border: 2rpx solid #e5e7eb;
}

.chip--active {
  color: #ffffff;
  background: var(--brand);
  border-color: var(--brand);
}

.list {
  padding: 20rpx 24rpx 0;
}

.card {
  padding: 28rpx 32rpx;
  margin-bottom: 20rpx;
  background: #ffffff;
  border-radius: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(15, 23, 42, 0.05);
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
  margin-top: 8rpx;
  font-size: 26rpx;
  line-height: 1.6;
}

.label {
  width: 150rpx;
  color: #9ca3af;
  flex-shrink: 0;
}

.value {
  flex: 1;
  color: #1f2937;
  word-break: break-all;
}

.tip {
  padding: 36rpx 0;
  text-align: center;
  font-size: 24rpx;
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
</style>
