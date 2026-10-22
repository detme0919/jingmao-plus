<template>
  <view class="page" :style="pageStyle">
    <view class="profile">
      <view class="profile-glow profile-glow--a"></view>
      <view class="profile-glow profile-glow--b"></view>

      <view class="profile-topline">
        <text class="profile-kicker">MY · 个人中心</text>
        <view class="profile-status" :class="loggedIn ? 'is-online' : ''">
          <view class="status-dot"></view>
          <text>{{ loggedIn ? '已登录' : '未登录' }}</text>
        </view>
      </view>

      <view class="profile-row">
        <view class="avatar-ring">
          <image class="avatar" :src="avatarUrl" mode="aspectFill" @error="onAvatarError" />
        </view>
        <view class="profile-body">
          <view class="profile-name">{{ displayName }}</view>
          <view v-if="profileParts.length" class="profile-meta">
            <text v-for="(part, i) in profileParts" :key="i" class="profile-meta-item">{{ part }}</text>
          </view>
          <view v-else class="profile-sub">{{ displaySub }}</view>
        </view>
        <view class="login-btn" :class="loggedIn ? 'login-btn--ghost' : ''" @tap="onLoginTap">
          {{ loggedIn ? '退出' : (loginToken ? '重新登录' : '去登录') }}
        </view>
      </view>
    </view>

    <view class="group">
      <view class="group-head">
        <view class="group-title">外观主题</view>
        <view class="group-note">默认经贸蓝</view>
      </view>
      <view class="theme-row">
        <view
          v-for="t in themes"
          :key="t.id"
          class="theme-item"
          @tap="chooseTheme(t)"
        >
          <view class="theme-dot-wrap" :class="{ 'is-active': theme.id === t.id }">
            <view class="theme-dot" :style="{ background: t.primary }">
              <text v-if="theme.id === t.id" class="theme-check">✓</text>
            </view>
          </view>
          <view class="theme-name" :class="{ 'is-active': theme.id === t.id }">{{ t.name }}</view>
        </view>
      </view>
    </view>

    <view class="group">
      <view class="group-head">
        <view class="group-title">数据管理</view>
      </view>
      <view class="cell" @tap="clearSavedLink">
        <view class="cell-icon">🔗</view>
        <view class="cell-body">
          <view class="cell-label">清除已保存的链接</view>
          <view class="cell-sub">仅删除本机保存的登记链接</view>
        </view>
        <view class="cell-arrow">›</view>
      </view>
      <view class="cell" @tap="clearAllData">
        <view class="cell-icon cell-icon--danger">🧹</view>
        <view class="cell-body">
          <view class="cell-label">清除本机全部数据</view>
          <view class="cell-sub">登录、链接、考勤与课程缓存</view>
        </view>
        <view class="cell-arrow">›</view>
      </view>
    </view>

    <view class="group">
      <view class="group-head">
        <view class="group-title">关于</view>
      </view>
      <view class="cell" @tap="goAbout">
        <view class="cell-icon">ℹ️</view>
        <view class="cell-body">
          <view class="cell-label">关于经贸+</view>
          <view class="cell-sub">个人作品与使用说明</view>
        </view>
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
const profileParts = computed(() => {
  const p = person.value
  if (!p) return []
  return [p.idnum, p.academy, p.className].filter(Boolean)
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
  padding-bottom: 48rpx;
  background:
    linear-gradient(180deg, var(--brand-tint) 0, transparent 460rpx),
    var(--page-bg);
}

.profile {
  position: relative;
  overflow: hidden;
  padding: calc(var(--status-bar-height) + 30rpx) 32rpx 40rpx;
  color: #ffffff;
  background: linear-gradient(140deg, var(--brand-grad-from) 0%, var(--brand-grad-to) 100%);
  border-radius: 0;
}

.profile-glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.profile-glow--a {
  width: 300rpx;
  height: 300rpx;
  top: -130rpx;
  right: -100rpx;
  background: rgba(255, 255, 255, 0.1);
}

.profile-glow--b {
  width: 180rpx;
  height: 180rpx;
  right: 110rpx;
  bottom: -120rpx;
  background: rgba(255, 255, 255, 0.06);
}

.profile-topline {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.profile-kicker {
  font-size: 20rpx;
  letter-spacing: 3rpx;
  color: rgba(255, 255, 255, 0.68);
}

.profile-status {
  display: flex;
  align-items: center;
  padding: 8rpx 16rpx;
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.1);
  border: 1rpx solid rgba(255, 255, 255, 0.28);
  border-radius: 999rpx;
}

.profile-status .status-dot {
  width: 8rpx;
  height: 8rpx;
  margin-right: 8rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
}

.profile-status.is-online .status-dot {
  background: #7df0c1;
  box-shadow: 0 0 0 6rpx rgba(125, 240, 193, 0.12);
}

.profile-row {
  position: relative;
  display: flex;
  align-items: center;
  margin-top: 28rpx;
}

.avatar-ring {
  width: 124rpx;
  height: 124rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.14);
  border: 1rpx solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
}

.avatar {
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: #ffffff;
}

.profile-body {
  flex: 1;
  margin-left: 22rpx;
  min-width: 0;
}

.profile-name {
  font-size: 40rpx;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.5rpx;
}

.profile-sub {
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.78);
  white-space: normal;
  word-break: break-all;
}

.profile-meta {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8rpx;
}

.profile-meta-item {
  max-width: 100%;
  margin: 6rpx 10rpx 0 0;
  padding: 4rpx 12rpx;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.1);
  border: 1rpx solid rgba(255, 255, 255, 0.14);
  border-radius: 8rpx;
  font-size: 20rpx;
  line-height: 1.5;
  word-break: break-all;
}

.login-btn {
  flex-shrink: 0;
  margin-left: 14rpx;
  padding: 12rpx 24rpx;
  color: var(--brand);
  background: #ffffff;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 600;
  box-shadow: 0 6rpx 16rpx rgba(10, 25, 55, 0.12);
}

.login-btn--ghost {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
  border: 1rpx solid rgba(255, 255, 255, 0.4);
  box-shadow: none;
  font-weight: 400;
}

.group {
  margin: 26rpx 24rpx 0;
  padding-bottom: 4rpx;
  background: #ffffff;
  border: 1rpx solid rgba(233, 237, 246, 0.9);
  border-radius: 24rpx;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 26rpx 8rpx;
}

.group-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 0.3rpx;
}

.group-note {
  font-size: 21rpx;
  color: var(--muted);
}

.theme-row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 18rpx 24rpx;
}

.theme-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20%;
}

.theme-dot-wrap {
  width: 78rpx;
  height: 78rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid transparent;
  border-radius: 50%;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.theme-dot-wrap.is-active {
  background: var(--brand-soft);
  border-color: var(--brand);
}

.theme-dot {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: 0 4rpx 10rpx rgba(15, 23, 42, 0.14);
}

.theme-check {
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 1;
}

.theme-name {
  margin-top: 10rpx;
  font-size: 21rpx;
  color: var(--muted);
}

.theme-name.is-active {
  color: var(--brand);
  font-weight: 600;
}

.cell {
  display: flex;
  align-items: center;
  padding: 22rpx 26rpx;
}

.cell + .cell {
  border-top: 1rpx solid var(--line);
}

.cell-icon {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--brand-soft);
  border-radius: 18rpx;
  font-size: 28rpx;
}

.cell-icon--danger {
  background: #fef2f2;
}

.cell-body {
  flex: 1;
  margin-left: 16rpx;
  min-width: 0;
}

.cell-label {
  font-size: 28rpx;
  color: var(--ink);
}

.cell-sub {
  margin-top: 5rpx;
  font-size: 21rpx;
  color: var(--muted);
}

.cell-value {
  margin-left: 10rpx;
  font-size: 23rpx;
  color: var(--muted);
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
  margin-left: 10rpx;
  color: #c3cad8;
  font-size: 34rpx;
  line-height: 1;
}

.footer {
  padding: 44rpx 0 12rpx;
  text-align: center;
  font-size: 21rpx;
  color: #b8bfce;
  letter-spacing: 0.5rpx;
}
</style>
