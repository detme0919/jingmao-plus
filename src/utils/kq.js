// 学生考勤（签到）：token 由旧版学校 App / 微信小程序签发，与统一认证 token 不通用
import { KQ_API, KQ_SIGN_URL, KQ_LOGIN_API } from '@/config/school.js'

const KQ_AUTH_KEY = 'jm_kq_auth'
export function getKqAuth() {
  try {
    const saved = uni.getStorageSync(KQ_AUTH_KEY)
    return saved && saved.token ? saved : null
  } catch (e) {
    return null
  }
}

export function saveKqAuth(auth) {
  try {
    uni.setStorageSync(KQ_AUTH_KEY, auth)
  } catch (e) { /* 忽略 */ }
  return auth
}

function pickPath(obj, path) {
  return String(path || '')
    .split('.')
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj)
}

/**
 * 预留：通过抓包得到的登录接口直接换取考勤 token。
 * 默认关闭（KQ_LOGIN_API.enabled=false），拿到可用的 code/账号来源后再启用。
 * @param {object} extra 额外参数，例如 { code: '微信授权code' }
 */
export function loginKqByApi(extra = {}) {
  return new Promise((resolve) => {
    if (!KQ_LOGIN_API.enabled) {
      resolve({ ok: false, msg: '考勤自动登录接口未启用' })
      return
    }
    uni.request({
      url: KQ_LOGIN_API.url,
      method: 'POST',
      header: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: Object.assign({}, KQ_LOGIN_API.params, extra),
      timeout: 10000,
      success: (res) => {
        const body = res.data || {}
        const token =
          pickPath(body, KQ_LOGIN_API.tokenPath) ||
          pickPath(body, 'data.token') ||
          pickPath(body, 'token')
        if (!token) {
          resolve({ ok: false, msg: body.errmsg || '未获取到 token' })
          return
        }
        const auth = {
          token,
          url: KQ_SIGN_URL + '&token=' + token,
          savedAt: Date.now()
        }
        const expireTs = Number(pickPath(body, 'data.token_expire_time') || 0)
        if (expireTs > 0) auth.expiresAt = expireTs * 1000
        saveKqAuth(auth)
        resolve({ ok: true, token, auth })
      },
      fail: () => resolve({ ok: false, msg: '网络请求失败' })
    })
  })
}

export function clearKqAuth() {
  try {
    uni.removeStorageSync(KQ_AUTH_KEY)
  } catch (e) { /* 忽略 */ }
}

// ---------- 学号密码登录 ----------
const KQ_CRED_KEY = 'jm_kq_cred'
const KQ_OPENID_KEY = 'jm_kq_openid'
const SECRET = 'jmkq-2026'

// 仅做简单混淆，避免密码在本地存储里明文可见；不是加密
function maskSecret(text) {
  const str = encodeURIComponent(String(text || ''))
  let out = ''
  for (let i = 0; i < str.length; i++) {
    out += (str.charCodeAt(i) ^ SECRET.charCodeAt(i % SECRET.length)).toString(16).padStart(2, '0')
  }
  return out
}

function unmaskSecret(hex) {
  const str = String(hex || '')
  let out = ''
  for (let i = 0; i + 1 < str.length; i += 2) {
    out += String.fromCharCode(parseInt(str.slice(i, i + 2), 16) ^ SECRET.charCodeAt((i / 2) % SECRET.length))
  }
  try {
    return decodeURIComponent(out)
  } catch (e) {
    return ''
  }
}

function randomOpenid() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = 'o'
  for (let i = 0; i < 27; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/** 登录接口需要 openid：优先用已绑定课表里的 wxid，否则生成一个稳定值 */
export function getKqOpenid() {
  try {
    const saved = uni.getStorageSync(KQ_OPENID_KEY)
    if (saved) return saved
  } catch (e) { /* 忽略 */ }
  try {
    const courseAuth = uni.getStorageSync('jm_course_auth')
    if (courseAuth && courseAuth.wxid) return courseAuth.wxid
  } catch (e) { /* 忽略 */ }
  const generated = randomOpenid()
  try {
    uni.setStorageSync(KQ_OPENID_KEY, generated)
  } catch (e) { /* 忽略 */ }
  return generated
}

export function getKqCred() {
  try {
    const saved = uni.getStorageSync(KQ_CRED_KEY)
    if (!saved || !saved.username || !saved.pwd) return null
    return {
      username: saved.username,
      password: unmaskSecret(saved.pwd),
      openid: saved.openid || ''
    }
  } catch (e) {
    return null
  }
}

export function saveKqCred(username, password, openid) {
  try {
    uni.setStorageSync(KQ_CRED_KEY, {
      username,
      pwd: maskSecret(password),
      openid: openid || getKqOpenid()
    })
  } catch (e) { /* 忽略 */ }
}

export function clearKqCred() {
  try {
    uni.removeStorageSync(KQ_CRED_KEY)
  } catch (e) { /* 忽略 */ }
}

/** 凭证是否仍在有效期（有 expiresAt 用精确时间，否则按保存时间 +24h） */
export function isKqTokenValid(auth) {
  if (!auth || !auth.token) return false
  if (auth.expiresAt) return Date.now() < auth.expiresAt
  if (auth.savedAt) return Date.now() < auth.savedAt + 86400000
  return false
}

/**
 * 学号密码登录考勤（hnjmCatchWxLogin 的账号分支）
 * 实测：缺 openid → status 4；账号或密码错误 → status 5；成功 → status 0 + data.token + token_expire_time
 */
export function loginKqByPassword(username, password, openid) {
  return new Promise((resolve) => {
    uni.request({
      url: KQ_LOGIN_API.url,
      method: 'POST',
      header: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: {
        username,
        password,
        openid: openid || getKqOpenid(),
        app: '',
        pid: KQ_LOGIN_API.params.pid || 'yyzx',
        aid: KQ_LOGIN_API.params.aid || 'catch'
      },
      timeout: 12000,
      success: (res) => {
        const body = res.data || {}
        const data = body.data || {}
        if (Number(body.status) === 0 && data.token) {
          const auth = {
            token: data.token,
            url: KQ_SIGN_URL + '&token=' + data.token,
            savedAt: Date.now()
          }
          if (data.token_expire_time) auth.expiresAt = Number(data.token_expire_time) * 1000
          saveKqAuth(auth)
          resolve({ ok: true, auth, userinfo: data.userinfo || null })
        } else {
          resolve({ ok: false, msg: body.errmsg || '登录失败', status: body.status })
        }
      },
      fail: () => resolve({ ok: false, msg: '网络请求失败' })
    })
  })
}

/** 每天首次打开 App 时，用保存的账号密码静默续期考勤凭证 */
export async function refreshKqDaily() {
  const cred = getKqCred()
  if (!cred) return
  const auth = getKqAuth()
  if (auth && isKqTokenValid(auth)) return
  await loginKqByPassword(cred.username, cred.password, cred.openid)
}

function postKq(path, data) {
  return new Promise((resolve) => {
    uni.request({
      url: KQ_API + path,
      method: 'POST',
      header: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: Object.assign({ pid: 'yyzx', aid: 'catch' }, data),
      timeout: 10000,
      success: (res) => {
        resolve(res.data && typeof res.data === 'object' ? res.data : null)
      },
      fail: () => resolve(null)
    })
  })
}

/** 当前用户信息，同时用于校验 token */
export async function fetchKqProfile(token) {
  const body = await postKq('/core/person/detailajax', { token })
  if (!body || Number(body.status) !== 0 || !Array.isArray(body.data) || !body.data[0]) return null
  const d = body.data[0]
  return {
    idnum: d.idnum || '',
    name: d.username || '',
    className: d.classnameStr || '',
    academy: d.academy || ''
  }
}

function todayStr() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 今天的签到记录 */
export async function fetchKqToday(token) {
  const day = todayStr()
  const body = await postKq('/core/Signin/getFreeSignAjax', {
    token,
    begintime: day,
    endtime: day,
    page: 1,
    pageSize: 20
  })
  if (!body || Number(body.status) !== 0) return null
  const list = (body.data && body.data.data) || []
  return list.map((r) => ({
    time: r.signintime || '',
    title: r.title || r.signtypename || '',
    position: r.position || '',
    status: String(r.status || '')
  }))
}

/** 单次定位，带超时保护 */
function locateOnce(options, timeout) {
  return new Promise((resolve) => {
    let done = false
    let timer = null
    const finish = (value) => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      resolve(value)
    }
    timer = setTimeout(() => {
      finish({ ok: false, msg: '定位超时' })
    }, timeout)
    try {
      uni.getLocation({
        type: 'gcj02',
        ...options,
        success: (res) => {
          if (res && typeof res.longitude === 'number' && typeof res.latitude === 'number') {
            finish({ ok: true, position: res.longitude + ',' + res.latitude })
          } else {
            finish({ ok: false, msg: '定位返回数据无效' })
          }
        },
        fail: (err) => {
          finish({ ok: false, msg: (err && err.errMsg) || '定位失败' })
        }
      })
    } catch (e) {
      finish({ ok: false, msg: (e && (e.message || e.errMsg)) || '当前环境不支持定位' })
    }
  })
}

/**
 * 获取定位（GCJ-02，与微信小程序一致）
 * 先请求高精度；室内等弱信号场景超时后自动退到普通精度，避免打卡长时间卡住。
 */
export async function getKqPosition() {
  const high = await locateOnce({ isHighAccuracy: true, highAccuracyExpireTime: 6000 }, 9000)
  if (high.ok) return high
  if (/deny|auth|permission|拒绝|授权/i.test(high.msg)) return high
  const normal = await locateOnce({ isHighAccuracy: false }, 7000)
  if (normal.ok) return normal
  return {
    ok: false,
    msg: normal.msg || high.msg,
    detail: [high.msg, normal.msg].filter(Boolean).join(' / ')
  }
}

/**
 * 打卡：POST /catch/core/syllabus/freeSignAjax
 * 参数与学校小程序一致：token、idnum、position（经度,纬度）、iBeaconstr（空）
 */
export async function punchKq(token, idnum, position) {
  const body = await postKq('/core/syllabus/freeSignAjax', {
    token,
    idnum,
    position,
    iBeaconstr: ''
  })
  if (!body) return { ok: false, msg: '网络请求失败' }
  return {
    ok: Number(body.status) === 0,
    msg: body.errmsg || ''
  }
}
