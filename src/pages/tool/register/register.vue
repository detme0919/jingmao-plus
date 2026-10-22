<template>
  <view class="page" :style="pageStyle">
    <!-- 当前状态 -->
    <view class="status-card">
      <view class="status-row">
        <view class="status-dot" :class="statusDotClass"></view>
        <view class="status-title">{{ statusTitle }}</view>
      </view>
      <view
        v-for="(line, i) in statusLines"
        :key="i"
        class="status-meta"
      >
        {{ line }}
      </view>
    </view>

    <!-- 统一认证 -->
    <view class="group">
      <view class="group-title">统一认证</view>
      <view v-if="loginFresh" class="cell">
        <view class="cell-label">已登录统一认证</view>
        <view class="cell-value is-ok">剩余约 {{ remainHours(loginToken) }} 小时</view>
      </view>
      <view v-else class="cell" @tap="goMine">
        <view class="cell-label">{{ loginToken ? '登录已过期' : '尚未登录统一认证' }}</view>
        <view class="cell-value">去「我的」登录</view>
        <view class="cell-arrow">›</view>
      </view>
    </view>

    <!-- 微信链接 -->
    <view class="group">
      <view class="group-title">微信链接</view>
      <view v-if="clipboardLink" class="clip-row">
        <view class="clip-text">剪贴板中有新的登记链接</view>
        <view class="clip-btn" @tap="saveClipboard">保存</view>
      </view>
      <view class="cell" @tap="pasteAndSave">
        <view class="cell-label">{{ link ? '粘贴新链接覆盖' : '粘贴微信里的链接' }}</view>
        <view class="cell-value">从剪贴板读取</view>
        <view class="cell-arrow">›</view>
      </view>
      <view v-if="link" class="cell">
        <view class="cell-label">已保存链接</view>
        <view class="cell-value" :class="expired ? 'is-danger' : 'is-ok'">
          {{ expired ? '已过期' : '剩余 ' + remainHours(link) + ' 小时' }}
        </view>
      </view>
      <view v-if="link" class="cell" @tap="clearSavedLink">
        <view class="cell-label">清除已保存的链接</view>
        <view class="cell-arrow">›</view>
      </view>
    </view>

    <!-- 使用说明 -->
    <view class="help-card">
      <view class="help-title">说明</view>
      <view class="help-item">在工作台点击「出校登记」卡片即可直接打开，本页只负责配置。</view>
      <view class="help-item">统一认证登录在「我的」页面完成，登录一次后 24 小时内免登录，到期会自动续期。</view>
      <view class="help-item">在微信里复制登记链接后回到 App，工作台会自动提示保存。</view>
      <view class="help-item help-item--note">统一认证账号密码不保存；考勤登录可选择记住密码，密码仅在本机混淆保存，不是加密。</view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  parseRegisterLink,
  getSavedLink,
  saveLink,
  clearLink,
  isExpired,
  formatTime,
  remainHours,
  getLoginToken
} from '@/utils/link.js'
import { getTheme, themeVars, applyNavTheme } from '@/utils/theme.js'

const link = ref(null)
const loginToken = ref(null)
const expired = ref(false)
const loginFresh = ref(false)
const clipboardLink = ref(null)
const theme = ref(getTheme())

const pageStyle = computed(() => themeVars(theme.value))

onShow(() => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  link.value = getSavedLink()
  expired.value = isExpired(link.value)
  loginToken.value = getLoginToken()
  loginFresh.value = !!loginToken.value && !isExpired(loginToken.value)
  checkClipboard()
})

/** 与 getLeaveToken 一致：登录凭证优先，其次已保存的链接 */
const activeSource = computed(() => {
  if (loginFresh.value) return 'login'
  if (link.value) return 'link'
  return ''
})

const statusTitle = computed(() => {
  if (activeSource.value === 'link') return expired.value ? '链接已过期' : '已保存登记链接'
  if (activeSource.value === 'login') return '已登录统一认证'
  if (loginToken.value) return '登录已过期'
  return '尚未配置'
})

const statusDotClass = computed(() => {
  if (activeSource.value === 'link') return expired.value ? 'status-dot--danger' : 'status-dot--ok'
  if (activeSource.value === 'login') return 'status-dot--ok'
  if (loginToken.value) return 'status-dot--danger'
  return 'status-dot--warn'
})

const statusLines = computed(() => {
  if (activeSource.value === 'link' && !expired.value) {
    return [
      `保存于 ${formatTime(link.value.savedAt)}`,
      `剩余约 ${remainHours(link.value)} 小时`,
      '在工作台点击「出校登记」卡片即可直接打开'
    ]
  }
  if (activeSource.value === 'login') {
    return [
      `凭证已保存在本机，剩余约 ${remainHours(loginToken.value)} 小时`,
      '在工作台点击「出校登记」卡片即可直接打开'
    ]
  }
  if (link.value || loginToken.value) {
    return ['请重新登录统一认证或粘贴新的登记链接']
  }
  return ['可以登录统一认证，或粘贴微信里的登记链接']
})

/** App 端回到本页时自动识别剪贴板里的登记链接 */
function checkClipboard() {
  // #ifdef APP-PLUS
  uni.getClipboardData({
    success: (res) => {
      const parsed = parseRegisterLink(res.data)
      if (!parsed.ok) return
      if (link.value && link.value.token === parsed.token) return
      clipboardLink.value = parsed
    },
    fail: () => {}
  })
  // #endif
}

function saveClipboard() {
  if (!clipboardLink.value) return
  saveLink(clipboardLink.value)
  link.value = clipboardLink.value
  expired.value = false
  clipboardLink.value = null
  uni.showToast({ title: '链接已保存', icon: 'success' })
}

function pasteAndSave() {
  uni.getClipboardData({
    success: (res) => {
      const parsed = parseRegisterLink(res.data)
      if (!parsed.ok) {
        uni.showToast({ title: parsed.msg, icon: 'none', duration: 2600 })
        return
      }
      saveLink(parsed)
      link.value = parsed
      expired.value = false
      uni.showToast({ title: '链接已保存', icon: 'success' })
    },
    fail: () => {
      uni.showToast({ title: '读取剪贴板失败，请重试', icon: 'none' })
    }
  })
}

function clearSavedLink() {
  uni.showModal({
    title: '清除链接',
    content: '确定清除已保存的出校登记链接？',
    success: (r) => {
      if (!r.confirm) return
      clearLink()
      link.value = null
      expired.value = false
      uni.showToast({ title: '已清除', icon: 'none' })
    }
  })
}

function goMine() {
  uni.switchTab({ url: '/pages/mine/mine' })
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 24rpx;
  box-sizing: border-box;
}

.status-card {
  padding: 36rpx 32rpx;
  background: #ffffff;
  border-radius: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(15, 23, 42, 0.05);
}

.status-row {
  display: flex;
  align-items: center;
}

.status-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  margin-right: 14rpx;
}

.status-dot--ok {
  background: #10b981;
}

.status-dot--warn {
  background: #f59e0b;
}

.status-dot--danger {
  background: #ef4444;
}

.status-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #1f2937;
}

.status-meta {
  margin-top: 14rpx;
  font-size: 26rpx;
  color: #6b7280;
  line-height: 1.6;
}

.group {
  margin-top: 24rpx;
  background: #ffffff;
  border-radius: 20rpx;
  overflow: hidden;
}

.group-title {
  padding: 24rpx 28rpx 8rpx;
  font-size: 24rpx;
  color: #9ca3af;
}

.cell {
  display: flex;
  align-items: center;
  padding: 30rpx 28rpx;
  border-top: 1rpx solid #f3f4f6;
}

.group-title + .cell,
.group-title + .clip-row + .cell {
  border-top: none;
}

.cell-label {
  flex: 1;
  font-size: 30rpx;
  color: #1f2937;
}

.cell-value {
  font-size: 26rpx;
  color: #9ca3af;
}

.cell-value.is-ok {
  color: #059669;
}

.cell-value.is-danger {
  color: #dc2626;
}

.cell-arrow {
  margin-left: 12rpx;
  font-size: 36rpx;
  color: #d1d5db;
}

.clip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 28rpx;
  background: var(--brand-soft);
}

.clip-text {
  font-size: 26rpx;
  color: var(--brand);
}

.clip-btn {
  padding: 8rpx 26rpx;
  font-size: 26rpx;
  color: #ffffff;
  background: var(--brand);
  border-radius: 999rpx;
}

.help-card {
  margin-top: 24rpx;
  padding: 32rpx;
  background: var(--brand-soft);
  border-radius: 20rpx;
}

.help-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--brand);
  margin-bottom: 16rpx;
}

.help-item {
  font-size: 24rpx;
  color: #4b5563;
  line-height: 1.7;
  margin-bottom: 12rpx;
}

.help-item--note {
  color: #9ca3af;
}
</style>
