<template>
  <view class="wv-page">
    <web-view v-if="src" :src="src" />
    <view v-else class="wv-empty">
      <text class="wv-empty-icon">⚠️</text>
      <text class="wv-empty-text">链接无效或未传入</text>
      <view class="wv-empty-btn" @tap="goBack">返回</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onReady, onShow, onUnload, onBackPress, onNavigationBarButtonTap } from '@dcloudio/uni-app'
import { parseLoginToken, saveLoginToken, setMode } from '@/utils/link.js'
import { getTheme, applyNavTheme } from '@/utils/theme.js'

const src = ref('')
let capture = false
let captureTimer = null
let captureTries = 0
let backTimer = null

const ALLOWED_URL = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:henetc\.edu\.cn|hnjmxy\.cn)(?::\d+)?(?:[/?#]|$)/i

const CAS_HOST = /auth\.henetc\.edu\.cn/i
const SMARTLOCK_HOST = /^https?:\/\/smartlock\.(?:henetc\.edu\.cn|hnjmxy\.cn)/i

function isAllowedWebviewUrl(value) {
  return ALLOWED_URL.test(String(value || '').trim())
}

function linkHost(value) {
  const match = String(value || '').match(/^https?:\/\/([^/?#]+)/i)
  return match ? match[1] : ''
}

function safeDecode(v) {
  let value = String(v || '')
  // App 端路由可能比 H5 多保留一层编码；只解到外层 URL 能识别为 http(s) 为止，
  // 避免继续解码把 callback 里的 %23 等参数破坏掉。
  for (let i = 0; i < 5 && value && !/^https?:\/\//i.test(value); i++) {
    try {
      const next = decodeURIComponent(value)
      if (next === value) break
      value = next
    } catch (e) {
      break
    }
  }
  return value
}

onLoad((query) => {
  const url = safeDecode(query && query.url)
  const title = safeDecode(query && query.title)
  capture = !!(query && query.capture)
  if (title) uni.setNavigationBarTitle({ title })
  if (!isAllowedWebviewUrl(url)) {
    const host = linkHost(url)
    uni.showToast({ title: host ? '不支持打开：' + host : '不支持打开该链接', icon: 'none' })
    return
  }
  src.value = url
})

/** App 端拿到 web-view 对应的原生子窗口 */
function getChildWebviews() {
  // #ifdef APP-PLUS
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  if (!page || !page.$getAppWebview) return []
  const appWv = page.$getAppWebview()
  return appWv.children ? appWv.children() || [] : []
  // #endif
  return []
}

function getChildWebview() {
  const list = getChildWebviews()
  return list.length ? list[list.length - 1] : null
}

/**
 * 统一认证页自动勾选「记住我」：
 * CAS 默认只发会话级 JSESSIONID，关掉页面就丢；勾选 rememberMe 后服务端会下发持久票据，
 * 之后打开认证地址可以静默换到新 token，不必反复输入密码。
 */
let lastHookUrl = ''
let hookTicks = 0

function hookCasRememberMe() {
  // #ifdef APP-PLUS
  hookTicks++
  const children = getChildWebviews()
  for (let i = 0; i < children.length; i++) {
    const wv = children[i]
    const url = wv && wv.getURL ? wv.getURL() : ''
    if (!CAS_HOST.test(url)) continue
    // 同一地址只在首次和每隔约 15 秒注入一次，兼顾页面重载与输错后重新加载
    if (url === lastHookUrl && hookTicks % 10 !== 0) continue
    lastHookUrl = url
    injectRememberMe(wv)
  }
  // #endif
}

function injectRememberMe(wv) {
  if (!wv || !wv.evalJS) return
  wv.evalJS(
    "(function(){var el=document.getElementById('chk_rememberMe');if(el&&!el.checked){el.checked=true;}})()"
  )
}

/** 登录后 SPA 可能很快把 token 从地址栏移除；把 localStorage 里的 token 暂存到标题供轮询读取 */
function hookSmartlockToken(wv) {
  if (!wv || !wv.evalJS) return
  wv.evalJS(
    "(function(){try{" +
      "if(document.title.indexOf('JMTOKEN:')===0)return;" +
      "var t=localStorage.getItem('token')||localStorage.getItem('access_token');" +
      "if(t&&/^[A-Za-z0-9._-]{8,}$/.test(t)){document.title='JMTOKEN:'+t;}" +
      "}catch(e){}})()"
  )
}

function acceptToken(parsed) {
  if (!parsed) return false
  saveLoginToken(parsed)
  setMode('login')
  stopCapture()
  uni.showToast({ title: '已保存登录凭证', icon: 'none' })
  // 登录流程是从「我的」发起的，拿到凭证后自动返回，避免停留在登记页
  if (backTimer) clearTimeout(backTimer)
  backTimer = setTimeout(() => {
    backTimer = null
    uni.navigateBack({ delta: 1 })
  }, 700)
  return true
}

/** 页面打开期间持续观察内嵌页：CAS 页面自动勾「记住我」，登录流程顺带保存 token */
function startCapture() {
  // #ifdef APP-PLUS
  captureTimer = setInterval(() => {
    captureTries++
    hookCasRememberMe()
    const children = getChildWebviews()
    for (let i = children.length - 1; i >= 0; i--) {
      const wv = children[i]
      const url = wv && wv.getURL ? wv.getURL() : ''
      let parsed = capture ? parseLoginToken(url) : null
      if (!parsed && capture && SMARTLOCK_HOST.test(url)) {
        hookSmartlockToken(wv)
        let title = ''
        try {
          title = wv && wv.getTitle ? wv.getTitle() : ''
        } catch (e) { /* 忽略 */ }
        if (title && title.indexOf('JMTOKEN:') === 0) {
          const token = title.slice(8).replace(/[^A-Za-z0-9._-]/g, '')
          if (token.length >= 8) {
            parsed = parseLoginToken(
              'http://smartlock.henetc.edu.cn/throughSchool/static/app/#/perregister?token=' + token
            )
          }
        }
      }
      if (acceptToken(parsed)) return
    }
    if (captureTries > 240) stopCapture()
  }, 1500)
  // #endif
}

function stopCapture() {
  if (captureTimer) {
    clearInterval(captureTimer)
    captureTimer = null
  }
}

onReady(() => {
  startCapture()
})

onShow(() => {
  applyNavTheme(getTheme())
})

onUnload(() => {
  stopCapture()
  if (backTimer) {
    clearTimeout(backTimer)
    backTimer = null
  }
})

onBackPress((event) => {
  // #ifdef APP-PLUS
  if (event.from === 'backbutton') {
    const wv = getChildWebview()
    if (wv) {
      // 返回前再取一次地址，避免刚好在轮询间隔内登录成功而漏存
      const parsed = parseLoginToken(wv.getURL ? wv.getURL() : '')
      if (parsed) {
        saveLoginToken(parsed)
        setMode('login')
      }
      wv.canBack((res) => {
        if (res && res.canBack) {
          wv.back()
        } else {
          uni.navigateBack({ delta: 1 })
        }
      })
      return true
    }
  }
  // #endif
  return false
})

onNavigationBarButtonTap(() => {
  // #ifdef APP-PLUS
  const wv = getChildWebview()
  if (wv) {
    wv.reload()
    uni.showToast({ title: '已刷新', icon: 'none' })
    return
  }
  // #endif
  // #ifdef H5
  window.location.reload()
  // #endif
})

function goBack() {
  uni.navigateBack({ delta: 1 })
}
</script>

<style>
.wv-page {
  height: 100vh;
}

.wv-empty {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.wv-empty-icon {
  font-size: 72rpx;
}

.wv-empty-text {
  margin-top: 24rpx;
  font-size: 28rpx;
  color: #6b7280;
}

.wv-empty-btn {
  margin-top: 40rpx;
  padding: 16rpx 64rpx;
  background: #0f766e;
  color: #ffffff;
  border-radius: 999rpx;
  font-size: 28rpx;
}
</style>
