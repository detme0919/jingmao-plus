// 出校登记链接的解析、存储与有效期判断
const STORAGE_KEY = 'jm_register_link'
const MODE_KEY = 'jm_register_mode'
const LOGIN_TOKEN_KEY = 'jm_login_token'

// 学校出校登记页地址形如：
// http://smartlock.henetc.edu.cn/throughSchool/static/app/#/perregister?token=<hex>&expire=86400
// 学校另有 hnjmxy.cn 域名别名，一并兼容
const URL_PATTERN = /https?:\/\/smartlock\.(?:henetc\.edu\.cn|hnjmxy\.cn)\/throughSchool\/static\/app\/#\/perregister\?[^\s"'<>，。；]+/i
const TOKEN_PATTERN = /[?&]token=([A-Za-z0-9._-]{8,})/i
const EXPIRE_PATTERN = /[?&]expire=(\d+)/i

/**
 * 从任意文本中识别出校登记链接（兼容前后附带说明文字的情况）
 * @returns {{ok: boolean, msg?: string, url?: string, token?: string, expire?: number, savedAt?: number}}
 */
export function parseRegisterLink(text) {
  const raw = String(text || '').trim()
  if (!raw) return { ok: false, msg: '没有可识别的内容，请先复制链接' }
  const matched = raw.match(URL_PATTERN)
  if (!matched) {
    return { ok: false, msg: '不是出校登记链接（需包含 perregister?token=）' }
  }
  const url = matched[0]
  const tokenMatch = url.match(TOKEN_PATTERN)
  if (!tokenMatch) return { ok: false, msg: '链接中缺少 token 参数' }
  const expireMatch = url.match(EXPIRE_PATTERN)
  const expire = expireMatch ? parseInt(expireMatch[1], 10) : 86400
  return { ok: true, url, token: tokenMatch[1], expire, savedAt: Date.now() }
}

export function getSavedLink() {
  try {
    const saved = uni.getStorageSync(STORAGE_KEY)
    return saved && saved.url ? saved : null
  } catch (e) {
    return null
  }
}

export function saveLink(link) {
  uni.setStorageSync(STORAGE_KEY, link)
  setMode('link')
}

export function clearLink() {
  try {
    uni.removeStorageSync(STORAGE_KEY)
  } catch (e) { /* 忽略 */ }
}

/** 使用方式：link = 粘贴链接；login = App 内账号登录 */
export function getMode() {
  try {
    const m = uni.getStorageSync(MODE_KEY)
    return m === 'login' || m === 'link' ? m : ''
  } catch (e) {
    return ''
  }
}

export function setMode(mode) {
  try {
    uni.setStorageSync(MODE_KEY, mode)
  } catch (e) { /* 忽略 */ }
}

export function clearMode() {
  try {
    uni.removeStorageSync(MODE_KEY)
  } catch (e) { /* 忽略 */ }
}

/**
 * 从内嵌页面的实际地址里提取登录后得到的 token。
 * 学校回调拼接 token 的方式可能是 `#/perregister?token=x` 或 `?token=x#/perregister`，两种都兼容。
 */
export function parseLoginToken(url) {
  let u = String(url || '').trim()
  // 某些 App WebView 返回的地址可能仍带一层或多层编码
  for (let i = 0; i < 5 && u && !/^https?:\/\//i.test(u); i++) {
    try {
      const next = decodeURIComponent(u)
      if (next === u) break
      u = next
    } catch (e) {
      break
    }
  }
  const head = u.match(/^(https?):\/\/([^/?#]+)/i)
  if (!head) return null
  const protocol = head[1].toLowerCase()
  const host = head[2].toLowerCase().split(':')[0]
  if (!['smartlock.henetc.edu.cn', 'smartlock.hnjmxy.cn'].includes(host)) return null
  const tokenMatch = u.match(/[?&]token=([A-Za-z0-9._-]{8,})/i)
  if (!tokenMatch) return null
  const expireMatch = u.match(/[?&]expire=(\d+)/i)
  const token = tokenMatch[1]
  return {
    token,
    expire: expireMatch ? parseInt(expireMatch[1], 10) : 86400,
    url: protocol + '://' + host + '/throughSchool/static/app/#/perregister?token=' + token,
    savedAt: Date.now()
  }
}

export function getLoginToken() {
  try {
    const saved = uni.getStorageSync(LOGIN_TOKEN_KEY)
    return saved && saved.token ? saved : null
  } catch (e) {
    return null
  }
}

export function saveLoginToken(data) {
  const record = {
    ...data,
    savedAt: data.savedAt || Date.now(),
    expire: data.expire || 86400
  }
  try {
    uni.setStorageSync(LOGIN_TOKEN_KEY, record)
  } catch (e) { /* 忽略 */ }
  return record
}

export function clearLoginToken() {
  try {
    uni.removeStorageSync(LOGIN_TOKEN_KEY)
  } catch (e) { /* 忽略 */ }
}

/**
 * 决定「打开出校登记」应该用哪个地址：
 * 1. 已保存链接且未过期 → 用链接（用户显式选择）
 * 2. 登录凭证未过期 → 用凭证里的地址
 * 3. 链接未过期（没有登录凭证时）→ 用链接
 * 都不可用返回 { ok: false }
 */
export function resolveOpenTarget() {
  const mode = getMode()
  const token = getLoginToken()
  const link = getSavedLink()
  const tokenFresh = !!token && !!token.url && !isExpired(token)
  const linkFresh = !!link && !!link.url && !isExpired(link)

  if (mode === 'link' && linkFresh) return { ok: true, url: link.url, type: 'link' }
  if (tokenFresh) return { ok: true, url: token.url, type: 'login' }
  if (linkFresh) return { ok: true, url: link.url, type: 'link' }
  return { ok: false }
}

/** App 端读取剪贴板里的出校登记链接（H5 无权限，直接跳过） */
export function detectClipboardLink(onFound) {
  // #ifdef APP-PLUS
  uni.getClipboardData({
    success: (res) => {
      const parsed = parseRegisterLink(res.data)
      if (parsed.ok) onFound(parsed)
    },
    fail: () => {}
  })
  // #endif
}

/** 保存时刻 + 有效期(秒) = 过期时刻（毫秒时间戳） */
export function expireTime(link) {
  if (!link || !link.savedAt) return 0
  return link.savedAt + (link.expire || 86400) * 1000
}

export function isExpired(link) {
  const t = expireTime(link)
  return t > 0 && Date.now() > t
}

/** 距过期还剩多少小时（向上取整，最小 0） */
export function remainHours(link) {
  const t = expireTime(link)
  if (!t) return 0
  return Math.max(0, Math.ceil((t - Date.now()) / 3600000))
}

export function formatTime(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
