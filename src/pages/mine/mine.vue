<template>
  <view class="page" :style="pageStyle">
    <!-- 顶部头部（自绘，替代系统导航栏） -->
    <view class="profile">
      <view class="profile-row">
        <image class="avatar" :src="avatarUrl" mode="aspectFill" @error="onAvatarError" />
        <view class="profile-body">
          <view class="profile-name">{{ displayName }}</view>
          <view class="profile-sub">{{ displaySub }}</view>
        </view>
        <view class="login-btn" :class="loggedIn ? 'login-btn--ghost' : ''" @tap="onLoginTap">
          {{ loggedIn ? '退出' : (loginToken ? '重新登录' : '去登录') }}
        </view>
      </view>
    </view>

    <view class="group">
      <view class="group-title">外观</view>
      <view class="theme-row">
        <view
          v-for="t in themes"
          :key="t.id"
          class="theme-item"
          @tap="chooseTheme(t)"
        >
          <view class="theme-dot" :style="{ background: t.primary }">
            <text v-if="theme.id === t.id" class="theme-check">✓</text>
          </view>
          <view class="theme-name" :class="{ 'is-active': theme.id === t.id }">{{ t.name }}</view>
        </view>
      </view>
    </view>

    <view class="group">
      <view class="group-title">数据管理</view>
      <view class="cell" @tap="clearSavedLink">
        <view class="cell-label">清除已保存的链接</view>
        <view class="cell-arrow">›</view>
      </view>
      <view class="cell" @tap="clearAllData">
        <view class="cell-label">清除本机全部数据</view>
        <view class="cell-arrow">›</view>
      </view>
    </view>

    <view class="group">
      <view class="group-title">关于</view>
      <view class="cell" @tap="goAbout">
        <view class="cell-label">关于经贸+</view>
        <view class="cell-value">v{{ version }}</view>
        <view class="cell-arrow">›</view>
      </view>
    </view>

    <view class="footer">河南经贸职业学院 · 个人校园工具</view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  getSavedLink,
  isExpired,
  getMode,
  getLoginToken,
  setMode,
  clearLink,
  clearLoginToken
} from '@/utils/link.js'
import {
  THEMES,
  getTheme,
  setTheme,
  themeVars,
  applyNavTheme,
  applyTabTheme,
  applyStatusBarLight
} from '@/utils/theme.js'
import { PERREGISTER_URL, buildLoginUrl, DEFAULT_AVATAR } from '@/config/school.js'
import {
  getCachedPerson,
  saveCachedPerson,
  clearCachedPerson,
  fetchPersonInfo,
  avatarOf
} from '@/utils/person.js'

const version = '0.2.0'
const link = ref(null)
const loginToken = ref(null)
const person = ref(null)
const avatarFailed = ref(false)
const themes = THEMES
const theme = ref(getTheme())

const pageStyle = computed(() => themeVars(theme.value))
const loggedIn = computed(() => !!loginToken.value && !isExpired(loginToken.value))
const avatarUrl = computed(() => (avatarFailed.value ? DEFAULT_AVATAR : avatarOf(person.value)))
const displayName = computed(() => {
  if (person.value && person.value.name) return person.value.name
  return loggedIn.value ? '已登录' : '未登录'
})
const displaySub = computed(() => {
  if (person.value) {
    const parts = [person.value.idnum, person.value.academy, person.value.className].filter(Boolean)
    if (parts.length) return parts.join(' · ')
  }
  if (loggedIn.value) return '正在同步个人信息…'
  return '登录学校统一认证，同步头像与个人信息'
})

onShow(() => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  applyStatusBarLight()
  applyTabTheme(theme.value)
  link.value = getSavedLink()
  loginToken.value = getLoginToken()
  refreshPerson()
})

async function refreshPerson() {
  const t = getLoginToken()
  loginToken.value = t
  if (!t || isExpired(t)) {
    person.value = null
    return
  }
  // 登录成功后未设置过使用方式时，默认按登录方式打开出校登记
  if (!getMode()) {
    setMode('login')
  }
  const cached = getCachedPerson()
  if (cached && cached.token === t.token) {
    person.value = cached
    avatarFailed.value = false
  }
  const info = await fetchPersonInfo(t.token)
  if (info) {
    person.value = info
    avatarFailed.value = false
    saveCachedPerson(info)
  }
}

function onAvatarError() {
  avatarFailed.value = true
}

function onLoginTap() {
  if (loggedIn.value) {
    uni.showModal({
      title: '退出登录',
      content:
        '退出统一认证将清除登录凭证和个人信息，并清除内置浏览器的登录状态；已保存的登记链接、课程表和考勤配置会保留。确定退出？',
      confirmText: '退出',
      success: (r) => {
        if (!r.confirm) return
        clearLoginToken()
        clearCachedPerson()
        clearWebviewCookies()
        loginToken.value = null
        person.value = null
        avatarFailed.value = false
        uni.showToast({ title: '已退出', icon: 'none' })
      }
    })
    return
  }
  uni.showModal({
    title: '学校统一认证登录',
    content:
      '将打开学校统一身份认证平台，可登录出校登记等校内系统。App 不保存账号密码，仅在本机保存登录凭证。',
    confirmText: '去登录',
    cancelText: '取消',
    success: (r) => {
      if (r.confirm) startLogin()
    }
  })
}

function startLogin() {
  uni.navigateTo({
    url:
      '/pages/webview/webview?url=' +
      encodeURIComponent(buildLoginUrl(PERREGISTER_URL)) +
      '&title=' +
      encodeURIComponent('统一认证登录') +
      '&capture=1'
  })
}

function chooseTheme(t) {
  if (theme.value.id === t.id) return
  setTheme(t.id)
  theme.value = t
  applyNavTheme(t)
  applyTabTheme(t)
  uni.showToast({ title: t.name, icon: 'none' })
}

function clearSavedLink() {
  if (!link.value) {
    uni.showToast({ title: '暂无已保存链接', icon: 'none' })
    return
  }
  uni.showModal({
    title: '清除链接',
    content: '确定清除已保存的出校登记链接？',
    success: (r) => {
      if (!r.confirm) return
      clearLink()
      link.value = null
      uni.showToast({ title: '已清除', icon: 'none' })
    }
  })
}

function clearWebviewCookies() {
  // #ifdef APP-PLUS
  try {
    plus.navigator.removeAllCookie()
  } catch (e) { /* 忽略 */ }
  // #endif
}

function clearAllData() {
  uni.showModal({
    title: '清除本机全部数据',
    content:
      '将清除统一认证登录、登记链接、个人信息、考勤密码、课程表和主题设置，并清除内置浏览器登录状态。该操作不可恢复。',
    confirmText: '全部清除',
    confirmColor: '#dc2626',
    success: (r) => {
      if (!r.confirm) return
      ;[
        'jm_login_token',
        'jm_register_link',
        'jm_register_mode',
        'jm_person',
        'jm_kq_auth',
        'jm_kq_cred',
        'jm_kq_openid',
        'jm_course_selection',
        'jm_course_auth',
        'jm_course_cache',
        'jm_course_manual',
        'jm_course_last_refresh',
        'jm_utility_elec',
        'jm_utility_ac',
        'jm_ac_room',
        'jm_ac_amount',
        'jm_theme'
      ].forEach((key) => {
        try {
          uni.removeStorageSync(key)
        } catch (e) { /* 忽略 */ }
      })
      clearWebviewCookies()
      link.value = null
      loginToken.value = null
      person.value = null
      avatarFailed.value = false
      uni.showToast({ title: '已清除全部数据', icon: 'none' })
      setTimeout(() => {
        uni.reLaunch({ url: '/pages/course/course' })
      }, 500)
    }
  })
}

function goAbout() {
  uni.navigateTo({ url: '/pages/about/about' })
}
</script>

<style>
.page {
  min-height: 100vh;
  padding-bottom: 40rpx;
}

.profile {
  padding: calc(var(--status-bar-height) + 48rpx) 40rpx 48rpx;
  background: linear-gradient(135deg, var(--brand-grad-from) 0%, var(--brand-grad-to) 100%);
}

.profile-row {
  display: flex;
  align-items: center;
}

.avatar {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  background: #ffffff;
  border: 3rpx solid rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}

.profile-body {
  flex: 1;
  margin-left: 26rpx;
  min-width: 0;
}

.profile-name {
  font-size: 38rpx;
  font-weight: 600;
  color: #ffffff;
}

.profile-sub {
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.82);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.login-btn {
  flex-shrink: 0;
  margin-left: 16rpx;
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: #ffffff;
  color: var(--brand);
  font-size: 26rpx;
  font-weight: 600;
}

.login-btn--ghost {
  background: transparent;
  border: 2rpx solid rgba(255, 255, 255, 0.6);
  color: #ffffff;
  font-weight: 400;
}

.group {
  margin: 28rpx 24rpx 0;
  background: #ffffff;
  border-radius: 20rpx;
  overflow: hidden;
}

.group-title {
  padding: 24rpx 28rpx 8rpx;
  font-size: 24rpx;
  color: #9ca3af;
}

.theme-row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 28rpx 28rpx;
}

.theme-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 110rpx;
}

.theme-dot {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 10rpx rgba(15, 23, 42, 0.15);
}

.theme-check {
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 700;
  line-height: 1;
}

.theme-name {
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #9ca3af;
}

.theme-name.is-active {
  color: var(--brand);
  font-weight: 600;
}

.cell {
  display: flex;
  align-items: center;
  padding: 30rpx 28rpx;
  border-top: 1rpx solid #f3f4f6;
}

.group-title + .cell {
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

.cell-value.is-warn {
  color: #d97706;
}

.cell-value.is-danger {
  color: #dc2626;
}

.cell-arrow {
  margin-left: 12rpx;
  font-size: 36rpx;
  color: #d1d5db;
}

.footer {
  padding: 48rpx 0 16rpx;
  text-align: center;
  font-size: 22rpx;
  color: #c0c4cc;
}
</style>
