// 课表：按院系/班级查询学校公开课表页，解析并缓存；支持手动加课
import { KQ_API, COURSE_PAGE } from '@/config/school.js'
import { getKqAuth } from '@/utils/kq.js'
import { parseCourseHtml, parseCourseLink } from '@/utils/course-parse.js'

const SELECTION_KEY = 'jm_course_selection'
const AUTH_KEY = 'jm_course_auth'
const CACHE_KEY = 'jm_course_cache'
const MANUAL_KEY = 'jm_course_manual'

// ---------- 已选班级 ----------
export function getCourseSelection() {
  try {
    const saved = uni.getStorageSync(SELECTION_KEY)
    return saved && saved.classValue ? saved : null
  } catch (e) {
    return null
  }
}

export function saveCourseSelection(selection) {
  try {
    uni.setStorageSync(SELECTION_KEY, Object.assign({ savedAt: Date.now() }, selection))
  } catch (e) { /* 忽略 */ }
}

export function clearCourseSelection() {
  try {
    uni.removeStorageSync(SELECTION_KEY)
  } catch (e) { /* 忽略 */ }
}

// ---------- 公众号课表链接（兜底导入） ----------
export function getCourseAuth() {
  try {
    const saved = uni.getStorageSync(AUTH_KEY)
    return saved && saved.url ? saved : null
  } catch (e) {
    return null
  }
}

export function saveCourseAuth(auth) {
  try {
    uni.setStorageSync(AUTH_KEY, auth)
  } catch (e) { /* 忽略 */ }
  return auth
}

export function clearCourseAuth() {
  try {
    uni.removeStorageSync(AUTH_KEY)
  } catch (e) { /* 忽略 */ }
}

/** 从剪贴板读取公众号课表链接（仅 App 端） */
export function readClipboardCourseLink() {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    uni.getClipboardData({
      success: (res) => {
        const parsed = parseCourseLink(res.data)
        resolve(parsed.ok ? parsed : null)
      },
      fail: () => resolve(null)
    })
    // #endif
    // #ifndef APP-PLUS
    resolve(null)
    // #endif
  })
}

/** 直接按链接抓取课表页（微信里复制出来的、带 wxid 的链接） */
export async function fetchCourseTable(url) {
  const html = await httpText('GET', url)
  if (!html) return { ok: false, msg: '课表页面加载失败' }
  return { ok: true, data: parseCourseHtml(html) }
}

// ---------- 课表缓存 ----------
export function getCourseCache() {
  try {
    const saved = uni.getStorageSync(CACHE_KEY)
    return saved && Array.isArray(saved.days) ? saved : null
  } catch (e) {
    return null
  }
}

export function saveCourseCache(data) {
  try {
    uni.setStorageSync(CACHE_KEY, Object.assign({ savedAt: Date.now() }, data))
  } catch (e) { /* 忽略 */ }
}

export function clearCourseCache() {
  try {
    uni.removeStorageSync(CACHE_KEY)
  } catch (e) { /* 忽略 */ }
}

// ---------- 表单请求 ----------
function formEncode(obj) {
  return Object.keys(obj)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k] == null ? '' : obj[k]))
    .join('&')
}

function httpText(method, url, data) {
  return new Promise((resolve) => {
    uni.request({
      url,
      method,
      data: method === 'POST' ? formEncode(data || {}) : undefined,
      header: { 'Content-Type': 'application/x-www-form-urlencoded' },
      dataType: 'text',
      timeout: 15000,
      success: (res) => {
        resolve(res.statusCode === 200 && typeof res.data === 'string' ? res.data : null)
      },
      fail: () => resolve(null)
    })
  })
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function parseHidden(html) {
  const out = {}
  for (const name of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION']) {
    const m = String(html).match(new RegExp('name="' + name + '"[^>]*value="([^"]*)"'))
    out[name] = m ? decodeHtml(m[1]) : ''
  }
  return out
}

function parseOptions(html, id) {
  const block = String(html).match(new RegExp('<select[^>]*id="' + id + '"[\\s\\S]*?<\\/select>', 'i'))
  if (!block) return []
  return [...block[0].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => ({
    value: decodeHtml(m[1]),
    text: decodeHtml(m[2]).trim()
  }))
}

/** 打开课表页，拿到院系列表和表单隐藏字段 */
export async function fetchCourseColleges() {
  const html = await httpText('GET', COURSE_PAGE)
  if (!html) return null
  return {
    hidden: parseHidden(html),
    colleges: parseOptions(html, 'ddl_yx').filter((c) => c.value)
  }
}

/** 选择院系后回发，拿到该院系的班级列表（按值和名称去重） */
export async function fetchCourseClasses(hidden, collegeValue) {
  const fields = Object.assign({}, hidden, {
    __EVENTTARGET: 'ddl_yx',
    __EVENTARGUMENT: '',
    __LASTFOCUS: '',
    ddl_yx: collegeValue,
    ddl_bj: '',
    hd_wxid: ''
  })
  const html = await httpText('POST', COURSE_PAGE, fields)
  if (!html) return null
  const seenValue = new Set()
  const seenText = new Set()
  const classes = parseOptions(html, 'ddl_bj').filter((c) => {
    if (!c.value) return false
    if (seenValue.has(c.value) || seenText.has(c.text)) return false
    seenValue.add(c.value)
    seenText.add(c.text)
    return true
  })
  return {
    hidden: parseHidden(html),
    classes
  }
}

/** 提交查询，返回解析后的课表 */
export async function queryCourseTable(hidden, collegeValue, classValue) {
  const fields = Object.assign({}, hidden, {
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __LASTFOCUS: '',
    ddl_yx: collegeValue,
    ddl_bj: classValue,
    hd_wxid: '',
    bt_cx: '查 询'
  })
  const html = await httpText('POST', COURSE_PAGE, fields)
  if (!html) return null
  return parseCourseHtml(html)
}

/** 用考勤凭证取当前教学周（没有考勤凭证时返回 0） */
export function fetchCurrentWeek() {
  return new Promise((resolve) => {
    const auth = getKqAuth()
    if (!auth || !auth.token) {
      resolve({ week: 0, total: 20 })
      return
    }
    uni.request({
      url: KQ_API + '/core/syllabus/getSyllabusInfoAjax',
      method: 'POST',
      header: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: { token: auth.token, pid: 'yyzx', aid: 'catch' },
      timeout: 8000,
      success: (res) => {
        const body = res.data || {}
        if (Number(body.status) === 0 && body.data) {
          resolve({
            week: parseInt(body.data.week, 10) || 0,
            total: parseInt(body.data.weeknum, 10) || 20
          })
        } else {
          resolve({ week: 0, total: 20 })
        }
      },
      fail: () => resolve({ week: 0, total: 20 })
    })
  })
}

// ---------- 手动添加的课程（仅本机，不写入学校系统） ----------
export function getManualCourses() {
  try {
    const list = uni.getStorageSync(MANUAL_KEY)
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

export function saveManualCourses(list) {
  try {
    uni.setStorageSync(MANUAL_KEY, list)
  } catch (e) { /* 忽略 */ }
  return list
}

export function addManualCourse(course) {
  const list = getManualCourses()
  const item = Object.assign({ id: 'm' + Date.now() + Math.floor(Math.random() * 1000) }, course)
  list.push(item)
  saveManualCourses(list)
  return item
}

export function removeManualCourse(id) {
  const list = getManualCourses().filter((c) => c.id !== id)
  saveManualCourses(list)
  return list
}

// ---------- 每天首次刷新标记 ----------
const REFRESH_KEY = 'jm_course_last_refresh'

function dayKey() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function markCourseRefreshed() {
  try {
    uni.setStorageSync(REFRESH_KEY, dayKey())
  } catch (e) { /* 忽略 */ }
}

function refreshedToday() {
  try {
    return uni.getStorageSync(REFRESH_KEY) === dayKey()
  } catch (e) {
    return false
  }
}

export function isCourseRefreshedToday() {
  return refreshedToday()
}
