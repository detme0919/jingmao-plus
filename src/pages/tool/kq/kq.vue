<template>
  <view class="page" :style="pageStyle">
    <!-- 状态头部 -->
    <view class="hero">
      <view class="hero-head">
        <view>
          <view class="hero-label">今日考勤</view>
          <view class="hero-status">{{ auth ? (todayCount > 0 ? '已签到' : '未签到') : '未登录' }}</view>
        </view>
        <view class="hero-pill">
          {{ auth ? (todayCount > 0 ? todayCount + ' 次' : '待打卡') : '请登录' }}
        </view>
      </view>
      <view class="hero-date">{{ todayLabel }}</view>

      <view v-if="profile" class="hero-profile">
        <view class="hero-name">{{ profile.name }}</view>
        <view class="hero-meta">
          {{ profile.idnum }}<text v-if="profile.className"> · {{ profile.className }}</text>
        </view>
      </view>
      <view v-if="lastRecord" class="hero-meta">
        最近签到 {{ lastRecord.time.slice(11) }} · {{ lastRecord.position }}
      </view>
      <view v-if="tokenRemain" class="hero-remain">{{ tokenRemain }}</view>
    </view>

    <!-- 未登录：账号登录 -->
    <view v-if="!auth" class="card">
      <view class="card-title">学号密码登录</view>
      <view class="card-sub">考勤系统与学校统一认证是两套独立账号体系，统一认证不能直接用于打卡，需要在这里单独验证一次；勾选记住密码后会自动续期，之后不用每天登录。</view>

      <view class="field">
        <view class="field-label">学号</view>
        <input v-model="loginUser" class="input" placeholder="请输入学号" :maxlength="20" />
      </view>
      <view class="field">
        <view class="field-label">密码</view>
        <input v-model="loginPwd" class="input" type="password" placeholder="请输入密码" :maxlength="30" />
      </view>

      <view class="remember-row">
        <switch :checked="rememberPwd" :color="theme.primary" @change="onRemember" />
        <text class="remember-text">记住密码，自动续期</text>
      </view>

      <view class="primary-btn" :class="{ 'is-loading': loggingIn }" @tap="doAccountLogin">
        {{ loggingIn ? '登录中…' : '登录并获取考勤凭证' }}
      </view>
      <view class="login-note">勾选「记住密码」后，账号密码仅保存在本机（简单混淆，非加密）；共用设备请勿勾选。</view>
    </view>

    <!-- 已登录：打卡 -->
    <block v-else>
      <view class="card">
        <view class="primary-btn punch-btn" :class="{ 'is-loading': punching }" @tap="doPunch">
          {{ punching ? '打卡中…' : '立即打卡' }}
        </view>
        <view class="secondary-btn" @tap="openRecords">查看签到记录</view>
        <view class="link-row">
          <text class="link-text link-text--danger" @tap="unbindKq">解绑并清除密码</text>
        </view>
      </view>

      <view class="records-card">
        <view class="records-head">
          <text class="records-title">今日签到记录</text>
          <text class="records-count">{{ todayCount }} 条</text>
        </view>
        <view v-if="loading" class="empty-line">正在加载…</view>
        <view v-else-if="!records.length" class="empty-line">今天还没有签到记录</view>
        <view v-for="(r, i) in records" :key="i" class="record-row">
          <view class="record-time">{{ r.time.slice(11, 16) }}</view>
          <view class="record-body">
            <view class="record-name">{{ r.title }}</view>
            <view class="record-pos">{{ r.position }}</view>
          </view>
        </view>
      </view>
    </block>

    <view class="help">
      打卡使用手机定位（GCJ-02），请确保已开启定位权限。
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  getKqAuth,
  fetchKqProfile,
  fetchKqToday,
  getKqPosition,
  punchKq,
  clearKqAuth,
  getKqCred,
  saveKqCred,
  clearKqCred,
  loginKqByPassword,
  isKqTokenValid,
  getKqOpenid
} from '@/utils/kq.js'
import { getTheme, themeVars, applyNavTheme } from '@/utils/theme.js'
import { getCachedPerson } from '@/utils/person.js'

const auth = ref(null)
const profile = ref(null)
const records = ref([])
const loading = ref(false)
const punching = ref(false)
const theme = ref(getTheme())
const cred = ref(null)
const loginUser = ref('')
const loginPwd = ref('')
const rememberPwd = ref(false)
const loggingIn = ref(false)

const pageStyle = computed(() => themeVars(theme.value))
const todayCount = computed(() => records.value.length)
const lastRecord = computed(() => (records.value.length ? records.value[0] : null))
const tokenRemain = computed(() => {
  if (!auth.value || !auth.value.expiresAt) return ''
  const hours = Math.ceil((auth.value.expiresAt - Date.now()) / 3600000)
  return hours > 0 ? `凭证剩余约 ${hours} 小时` : '凭证已过期'
})
const todayLabel = computed(() => {
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 星期${week}`
})

onShow(() => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
  cred.value = getKqCred()
  rememberPwd.value = !!cred.value
  const person = getCachedPerson()
  if (!loginUser.value && person && person.idnum) loginUser.value = person.idnum
  if (cred.value) {
    loginUser.value = cred.value.username
    const saved = getKqAuth()
    if (!saved || !isKqTokenValid(saved)) {
      silentLogin()
    } else {
      load()
    }
  } else {
    load()
  }
})

async function silentLogin() {
  if (loggingIn.value) return
  const c = cred.value
  if (!c) {
    load()
    return
  }
  loggingIn.value = true
  const res = await loginKqByPassword(c.username, c.password, c.openid)
  loggingIn.value = false
  if (res.ok) {
    auth.value = res.auth
    load()
    return
  }
  auth.value = null
  profile.value = null
  records.value = []
  uni.showToast({ title: res.msg || '自动登录失败', icon: 'none' })
}

async function doAccountLogin() {
  if (loggingIn.value) return
  const username = loginUser.value.trim()
  const password = loginPwd.value
  if (!username || !password) {
    uni.showToast({ title: '请输入学号和密码', icon: 'none' })
    return
  }
  loggingIn.value = true
  const openid = cred.value && cred.value.openid ? cred.value.openid : getKqOpenid()
  const res = await loginKqByPassword(username, password, openid)
  loggingIn.value = false
  if (!res.ok) {
    let msg = res.msg || '登录失败'
    if (res.status === 5) msg = '学号或密码错误'
    if (res.status === 4) msg = '缺少微信身份标识，请稍后重试'
    uni.showModal({ title: '登录失败', content: msg, showCancel: false })
    return
  }
  if (rememberPwd.value) saveKqCred(username, password, openid)
  else clearKqCred()
  cred.value = getKqCred()
  rememberPwd.value = !!cred.value
  auth.value = res.auth
  loginPwd.value = ''
  uni.showToast({ title: '登录成功', icon: 'success' })
  load()
}

function onRemember(e) {
  rememberPwd.value = !!e.detail.value
  if (!rememberPwd.value) {
    clearKqCred()
    cred.value = null
  }
}

async function load() {
  auth.value = getKqAuth()
  if (!auth.value || !isKqTokenValid(auth.value)) {
    auth.value = null
    profile.value = null
    records.value = []
    return
  }
  loading.value = true
  const p = await fetchKqProfile(auth.value.token)
  if (!p) {
    auth.value = null
    profile.value = null
    records.value = []
    loading.value = false
    return
  }
  profile.value = p
  const list = await fetchKqToday(auth.value.token)
  records.value = list || []
  loading.value = false
}

async function doPunch() {
  if (punching.value) return
  if (!auth.value) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (!isKqTokenValid(auth.value)) {
    await silentLogin()
    if (!auth.value) return
  }
  if (!profile.value || !profile.value.idnum) {
    await load()
    if (!profile.value || !profile.value.idnum) {
      uni.showToast({ title: '考勤信息未加载，请稍后重试', icon: 'none' })
      return
    }
  }
  punching.value = true
  const loc = await getKqPosition()
  if (!loc.ok) {
    punching.value = false
    uni.showModal({
      title: '定位失败',
      content: '打卡需要获取当前位置，请在系统设置中允许「经贸+」使用定位后重试。',
      showCancel: false
    })
    return
  }
  const res = await punchKq(auth.value.token, profile.value ? profile.value.idnum : '', loc.position)
  punching.value = false
  if (res.ok) {
    uni.showToast({ title: '打卡成功', icon: 'success' })
    const list = await fetchKqToday(auth.value.token)
    records.value = list || []
  } else {
    uni.showModal({
      title: '打卡失败',
      content: res.msg || '请稍后重试，或改用学校官方小程序打卡。',
      showCancel: false
    })
  }
}

function openRecords() {
  if (!auth.value) return
  uni.navigateTo({
    url:
      '/pages/webview/webview?url=' +
      encodeURIComponent(auth.value.url) +
      '&title=' +
      encodeURIComponent('签到记录')
  })
}

function unbindKq() {
  uni.showModal({
    title: '解绑考勤',
    content: '将清除本机保存的考勤凭证和记住的账号密码，需要重新登录。确定解绑？',
    confirmText: '解绑',
    confirmColor: '#dc2626',
    success: (r) => {
      if (!r.confirm) return
      clearKqAuth()
      clearKqCred()
      cred.value = null
      loginPwd.value = ''
      auth.value = null
      profile.value = null
      records.value = []
      uni.showToast({ title: '已解绑', icon: 'none' })
    }
  })
}
</script>

<style>
.page {
  min-height: 100vh;
  padding-bottom: 40rpx;
}

.hero {
  margin: 24rpx;
  padding: 36rpx 32rpx;
  border-radius: 28rpx;
  background: linear-gradient(135deg, var(--brand-grad-from) 0%, var(--brand-grad-to) 100%);
  color: #ffffff;
  box-shadow: 0 12rpx 32rpx rgba(15, 23, 42, 0.14);
}

.hero-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.hero-label {
  font-size: 24rpx;
  opacity: 0.78;
}

.hero-status {
  margin-top: 6rpx;
  font-size: 48rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
}

.hero-pill {
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.18);
  font-size: 22rpx;
}

.hero-date {
  margin-top: 10rpx;
  font-size: 24rpx;
  opacity: 0.82;
}

.hero-profile {
  margin-top: 26rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid rgba(255, 255, 255, 0.2);
}

.hero-name {
  font-size: 32rpx;
  font-weight: 600;
}

.hero-meta {
  margin-top: 8rpx;
  font-size: 24rpx;
  opacity: 0.85;
  line-height: 1.5;
}

.hero-remain {
  margin-top: 10rpx;
  font-size: 22rpx;
  opacity: 0.8;
}

.card {
  margin: 20rpx 16rpx;
  padding: 32rpx 24rpx;
  background: #ffffff;
  border-radius: 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.06);
}

.card-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
}

.card-sub {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #9ca3af;
  line-height: 1.6;
}

.field {
  margin-top: 30rpx;
}

.field-label {
  margin-bottom: 12rpx;
  font-size: 26rpx;
  color: #6b7280;
}

.input {
  width: 100%;
  height: 96rpx;
  min-height: 96rpx;
  box-sizing: border-box;
  padding: 0 28rpx;
  background: #f8fafc;
  border: 2rpx solid #eef2f7;
  border-radius: 16rpx;
  font-size: 32rpx;
  line-height: 1.4;
  color: #1f2937;
}

.remember-row {
  display: flex;
  align-items: center;
  margin-top: 24rpx;
}

.remember-text {
  margin-left: 12rpx;
  font-size: 24rpx;
  color: #6b7280;
}

.primary-btn {
  margin-top: 32rpx;
  height: 96rpx;
  border-radius: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand);
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
}

.punch-btn {
  height: 112rpx;
  border-radius: 56rpx;
  font-size: 36rpx;
  font-weight: 700;
  box-shadow: 0 10rpx 24rpx rgba(15, 23, 42, 0.12);
}

.secondary-btn {
  margin-top: 20rpx;
  height: 88rpx;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid var(--brand);
  color: var(--brand);
  font-size: 28rpx;
}

.is-loading {
  opacity: 0.7;
}

.login-note {
  margin-top: 20rpx;
  font-size: 21rpx;
  color: #9ca3af;
  line-height: 1.6;
}

.link-row {
  display: flex;
  justify-content: center;
  margin-top: 26rpx;
}

.link-text {
  font-size: 24rpx;
  color: #9ca3af;
}

.link-text--danger {
  color: #dc2626;
}

.records-card {
  margin: 24rpx;
  padding: 28rpx 32rpx;
  background: #ffffff;
  border-radius: 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.06);
}

.records-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.records-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #4b5563;
}

.records-count {
  font-size: 22rpx;
  color: #9ca3af;
}

.empty-line {
  padding: 32rpx 0 16rpx;
  font-size: 24rpx;
  color: #9ca3af;
}

.record-row {
  display: flex;
  padding: 22rpx 0;
  border-top: 1rpx solid #f3f4f6;
}

.record-time {
  width: 100rpx;
  flex-shrink: 0;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--brand);
}

.record-body {
  flex: 1;
  min-width: 0;
}

.record-name {
  font-size: 28rpx;
  color: #1f2937;
}

.record-pos {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #9ca3af;
}

.help {
  padding: 8rpx 32rpx 0;
  text-align: center;
  font-size: 21rpx;
  color: #c0c4cc;
  line-height: 1.6;
}

/* UI refresh overrides */
.page {
  background:
    linear-gradient(180deg, var(--brand-tint) 0, transparent 460rpx),
    var(--page-bg);
}

.hero {
  position: relative;
  overflow: hidden;
  margin: 24rpx;
  border-radius: 24rpx;
  box-shadow: var(--shadow-float);
}

.hero::after {
  content: '';
  position: absolute;
  width: 220rpx;
  height: 220rpx;
  top: -90rpx;
  right: -70rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.hero-label,
.hero-date,
.hero-meta,
.hero-remain {
  color: rgba(255, 255, 255, 0.8);
  opacity: 1;
}

.card,
.records-card {
  margin-left: 24rpx;
  margin-right: 24rpx;
  border: 1rpx solid var(--line);
  border-radius: 26rpx;
  box-shadow: var(--shadow-card);
}

.card {
  padding: 30rpx 26rpx;
}

.card-title {
  color: var(--ink);
}

.card-sub,
.login-note {
  color: var(--muted);
}

.input {
  color: var(--ink);
  background: #f7f9fc;
  border-color: var(--line);
}

.primary-btn,
.secondary-btn {
  border-radius: 18rpx;
}

.punch-btn {
  height: 108rpx;
  border-radius: 20rpx;
}

.records-title {
  color: var(--ink);
}

.records-count {
  color: var(--muted);
}

</style>
