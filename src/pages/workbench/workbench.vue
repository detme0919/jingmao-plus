<template>
  <view class="page" :style="pageStyle">
    <!-- 顶部头部（自绘，替代系统导航栏） -->
    <view class="topbar">
      <view class="topbar-title">工作台</view>
      <view class="topbar-heading">你好，同学 👋</view>
      <view class="topbar-sub">河南经贸职业学院 · 校园工具箱</view>
    </view>

    <!-- 剪贴板检测提示 -->
    <view v-if="clipLink" class="clip-tip">
      <view class="clip-text">剪贴板中有新的登记链接</view>
      <view class="clip-actions">
        <view class="clip-btn clip-btn--ok" @tap="saveClip">保存</view>
        <view class="clip-btn" @tap="dismissClip">忽略</view>
      </view>
    </view>

    <!-- 常用服务 -->
    <view class="section">
      <view class="section-title">常用服务</view>
      <view class="feature-card" @tap="openRegister" @longpress="openSettings">
        <view class="feature-icon">🚪</view>
        <view class="feature-body">
          <view class="feature-name">出校登记</view>
          <view class="feature-desc">查看登记记录，发起离校申请</view>
        </view>
        <view class="feature-arrow">›</view>
      </view>

      <view class="feature-card feature-card--next" @tap="openKq">
        <view class="feature-icon">🕒</view>
        <view class="feature-body">
          <view class="feature-name">打卡考勤</view>
          <view class="feature-desc">打卡与签到记录</view>
        </view>
        <view class="feature-arrow">›</view>
      </view>
    </view>

    <view class="footer">更多工具持续更新中</view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  getSavedLink,
  saveLink,
  detectClipboardLink
} from '@/utils/link.js'
import { getTheme, themeVars, applyNavTheme, applyTabTheme, applyStatusBarLight } from '@/utils/theme.js'
import { getLeaveToken } from '@/utils/leave.js'

const link = ref(null)
const clipLink = ref(null)
const dismissedToken = ref('')
const theme = ref(getTheme())

const pageStyle = computed(() => themeVars(theme.value))

onShow(() => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  applyStatusBarLight()
  applyTabTheme(theme.value)
  link.value = getSavedLink()
  checkClipboard()
})

function checkClipboard() {
  detectClipboardLink((parsed) => {
    if (link.value && link.value.token === parsed.token) return
    if (dismissedToken.value === parsed.token) return
    clipLink.value = parsed
  })
}

function dismissClip() {
  if (clipLink.value) dismissedToken.value = clipLink.value.token
  clipLink.value = null
}

function saveClip() {
  if (!clipLink.value) return
  saveLink(clipLink.value)
  link.value = clipLink.value
  clipLink.value = null
  uni.showToast({ title: '链接已保存', icon: 'success' })
}

function openRegister() {
  if (getLeaveToken()) {
    uni.navigateTo({ url: '/pages/tool/leave/leave' })
    return
  }
  // 未登录/无有效链接：进入配置页处理
  uni.navigateTo({ url: '/pages/tool/register/register' })
}

function openSettings() {
  uni.navigateTo({ url: '/pages/tool/register/register' })
}

function openKq() {
  uni.navigateTo({ url: '/pages/tool/kq/kq' })
}
</script>

<style>
.page {
  min-height: 100vh;
  padding-bottom: 40rpx;
}

.topbar {
  padding: calc(var(--status-bar-height) + 28rpx) 40rpx 46rpx;
  background: linear-gradient(135deg, var(--brand-grad-from) 0%, var(--brand-grad-to) 100%);
  color: #ffffff;
}

.topbar-title {
  font-size: 26rpx;
  letter-spacing: 2rpx;
  opacity: 0.75;
}

.topbar-heading {
  margin-top: 14rpx;
  font-size: 46rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
}

.topbar-sub {
  margin-top: 8rpx;
  font-size: 24rpx;
  opacity: 0.85;
}

.clip-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 24rpx 24rpx 0;
  padding: 22rpx 26rpx;
  background: var(--brand-soft);
  border-radius: 16rpx;
}

.clip-text {
  flex: 1;
  font-size: 26rpx;
  color: var(--brand);
}

.clip-actions {
  display: flex;
  flex-shrink: 0;
}

.clip-btn {
  padding: 10rpx 26rpx;
  margin-left: 12rpx;
  font-size: 26rpx;
  color: #6b7280;
  border-radius: 999rpx;
  background: #ffffff;
  border: 2rpx solid #e5e7eb;
}

.clip-btn--ok {
  color: #ffffff;
  background: var(--brand);
  border-color: var(--brand);
}

.section {
  padding: 28rpx 24rpx 0;
}

.section-title {
  margin: 0 8rpx 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #4b5563;
}

.feature-card {
  display: flex;
  align-items: center;
  padding: 30rpx 32rpx;
  background: #ffffff;
  border-radius: 24rpx;
  box-shadow: 0 6rpx 20rpx rgba(15, 23, 42, 0.06);
}

.feature-card--next {
  margin-top: 20rpx;
}

.feature-icon {
  width: 88rpx;
  height: 88rpx;
  border-radius: 22rpx;
  background: var(--brand-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  flex-shrink: 0;
}

.feature-body {
  flex: 1;
  margin-left: 24rpx;
  min-width: 0;
}

.feature-name {
  font-size: 34rpx;
  font-weight: 600;
  color: #1f2937;
}

.feature-desc {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #9ca3af;
}

.feature-arrow {
  margin-left: 12rpx;
  font-size: 44rpx;
  color: #d1d5db;
  flex-shrink: 0;
}

.footer {
  padding: 32rpx 0 8rpx;
  text-align: center;
  font-size: 22rpx;
  color: #c0c4cc;
}
</style>
