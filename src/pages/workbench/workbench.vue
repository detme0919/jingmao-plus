<template>
  <view class="page" :style="pageStyle">
    <view class="hero">
      <view class="hero-glow hero-glow--a"></view>
      <view class="hero-glow hero-glow--b"></view>
      <view class="hero-top">
        <view class="hero-kicker">工作台 · CAMPUS TOOLKIT</view>
        <view class="hero-pill">河南经贸</view>
      </view>
      <view class="hero-title">{{ greeting }} <text class="hero-wave">👋</text></view>
      <view class="hero-sub">把校园里常用的事，集中在一个入口</view>
    </view>

    <view v-if="clipLink" class="clip-tip">
      <view class="clip-icon">🔗</view>
      <view class="clip-text">剪贴板中有新的登记链接</view>
      <view class="clip-actions">
        <view class="clip-btn clip-btn--ok" @tap="saveClip">保存</view>
        <view class="clip-btn" @tap="dismissClip">忽略</view>
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <view class="section-title-wrap">
          <view class="section-accent"></view>
          <view class="section-title">常用服务</view>
        </view>
        <view class="section-note">2 项</view>
      </view>

      <view
        class="service-card"
        hover-class="service-card--tap"
        @tap="openRegister"
        @longpress="openSettings"
      >
        <view class="service-icon service-icon--leave">🚪</view>
        <view class="service-body">
          <view class="service-title-row">
            <text class="service-name">出校登记</text>
            <text class="service-tag">登记</text>
          </view>
          <view class="service-desc">查看记录，发起离校申请</view>
        </view>
        <view class="service-go">→</view>
      </view>

      <view class="service-card" hover-class="service-card--tap" @tap="openKq">
        <view class="service-icon service-icon--kq">🕒</view>
        <view class="service-body">
          <view class="service-title-row">
            <text class="service-name">打卡考勤</text>
            <text class="service-tag">考勤</text>
          </view>
          <view class="service-desc">打卡与签到记录</view>
        </view>
        <view class="service-go">→</view>
      </view>
    </view>

    <view class="footer">经贸+ · 更多工具持续更新</view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  getSavedLink,
  saveLink,
  detectClipboardLink,
  getLoginToken,
  isExpired
} from '@/utils/link.js'
import { getTheme, themeVars, applyNavTheme, applyTabTheme, applyStatusBarLight } from '@/utils/theme.js'
import { getLeaveToken } from '@/utils/leave.js'
import { getCachedPerson, fetchPersonInfo, saveCachedPerson } from '@/utils/person.js'

const link = ref(null)
const clipLink = ref(null)
const dismissedToken = ref('')
const theme = ref(getTheme())
const personName = ref('')

const pageStyle = computed(() => themeVars(theme.value))
const greeting = computed(() => (personName.value ? `你好，${personName.value}` : '你好，同学'))

onShow(() => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  applyStatusBarLight()
  applyTabTheme(theme.value)
  link.value = getSavedLink()
  refreshPersonName()
  checkClipboard()
})

function refreshPersonName() {
  const token = getLoginToken()
  if (!token || isExpired(token)) {
    personName.value = ''
    return
  }
  const cached = getCachedPerson()
  if (cached && cached.token === token.token && cached.name) {
    personName.value = cached.name
    return
  }
  personName.value = ''
  fetchPersonInfo(token.token).then((info) => {
    if (!info || !info.name) return
    personName.value = info.name
    saveCachedPerson(info)
  })
}

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
  padding-bottom: 48rpx;
  background:
    linear-gradient(180deg, var(--brand-tint) 0, transparent 460rpx),
    var(--page-bg);
}

.hero {
  position: relative;
  overflow: hidden;
  padding: calc(var(--status-bar-height) + 28rpx) 36rpx 40rpx;
  color: #ffffff;
  background: linear-gradient(140deg, var(--brand-grad-from) 0%, var(--brand-grad-to) 100%);
  border-radius: 0;
}

.hero-glow {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  pointer-events: none;
}

.hero-glow--a {
  width: 300rpx;
  height: 300rpx;
  top: -120rpx;
  right: -90rpx;
}

.hero-glow--b {
  width: 180rpx;
  height: 180rpx;
  right: 90rpx;
  bottom: -110rpx;
  background: rgba(255, 255, 255, 0.06);
}

.hero-top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hero-kicker {
  font-size: 20rpx;
  letter-spacing: 3rpx;
  color: rgba(255, 255, 255, 0.68);
}

.hero-pill {
  padding: 8rpx 18rpx;
  font-size: 20rpx;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
  border: 1rpx solid rgba(255, 255, 255, 0.34);
  border-radius: 999rpx;
}

.hero-title {
  position: relative;
  margin-top: 30rpx;
  font-size: 48rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
  line-height: 1.25;
}

.hero-wave {
  font-size: 40rpx;
}

.hero-sub {
  position: relative;
  margin-top: 12rpx;
  font-size: 25rpx;
  color: rgba(255, 255, 255, 0.82);
}

.clip-tip {
  display: flex;
  align-items: center;
  margin: 22rpx 24rpx 0;
  padding: 20rpx 22rpx;
  background: #ffffff;
  border: 1rpx solid var(--line);
  border-radius: 22rpx;
  box-shadow: var(--shadow-card);
}

.clip-icon {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-soft);
  border-radius: 16rpx;
  font-size: 28rpx;
  flex-shrink: 0;
}

.clip-text {
  flex: 1;
  margin-left: 16rpx;
  font-size: 24rpx;
  color: var(--ink);
}

.clip-actions {
  display: flex;
  flex-shrink: 0;
}

.clip-btn {
  padding: 10rpx 22rpx;
  margin-left: 10rpx;
  font-size: 23rpx;
  color: var(--muted);
  background: #ffffff;
  border: 1rpx solid var(--line);
  border-radius: 999rpx;
}

.clip-btn--ok {
  color: #ffffff;
  background: var(--brand);
  border-color: var(--brand);
}

.section {
  padding: 34rpx 24rpx 0;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8rpx 18rpx;
}

.section-title-wrap {
  display: flex;
  align-items: center;
}

.section-accent {
  width: 8rpx;
  height: 28rpx;
  margin-right: 14rpx;
  background: var(--brand);
  border-radius: 999rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 0.5rpx;
}

.section-note {
  font-size: 22rpx;
  color: var(--muted);
}

.service-card {
  display: flex;
  align-items: center;
  padding: 26rpx;
  background: #ffffff;
  border: 1rpx solid rgba(233, 237, 246, 0.9);
  border-radius: 26rpx;
  box-shadow: var(--shadow-card);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.service-card + .service-card {
  margin-top: 18rpx;
}

.service-card--tap {
  transform: translateY(3rpx);
  box-shadow: 0 6rpx 18rpx rgba(23, 32, 51, 0.05);
}

.service-icon {
  width: 92rpx;
  height: 92rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 42rpx;
  background: linear-gradient(150deg, #ffffff 0%, var(--brand-soft) 100%);
  border: 1rpx solid rgba(233, 237, 246, 0.9);
  border-radius: 26rpx;
}

.service-body {
  flex: 1;
  margin-left: 22rpx;
  min-width: 0;
}

.service-title-row {
  display: flex;
  align-items: center;
}

.service-name {
  font-size: 32rpx;
  font-weight: 650;
  color: var(--ink);
}

.service-tag {
  margin-left: 12rpx;
  padding: 4rpx 12rpx;
  font-size: 18rpx;
  color: var(--brand);
  background: var(--brand-soft);
  border-radius: 8rpx;
}

.service-desc {
  margin-top: 8rpx;
  font-size: 23rpx;
  color: var(--muted);
}

.service-go {
  width: 54rpx;
  height: 54rpx;
  margin-left: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--brand);
  background: var(--brand-soft);
  border-radius: 50%;
  font-size: 28rpx;
  font-weight: 600;
}

.footer {
  padding: 44rpx 0 12rpx;
  text-align: center;
  font-size: 21rpx;
  color: #b8bfce;
  letter-spacing: 0.5rpx;
}
</style>
