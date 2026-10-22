// 出校登记原生接口：使用统一认证 token 或已保存链接里的 token
import { SMARTLOCK_API } from '@/config/school.js'
import { getLoginToken, getSavedLink, isExpired } from '@/utils/link.js'

/** 优先用统一认证凭证，其次用已保存的登记链接 token */
export function getLeaveToken() {
  const t = getLoginToken()
  if (t && t.token && !isExpired(t)) return t.token
  const l = getSavedLink()
  if (l && l.token && !isExpired(l)) return l.token
  return ''
}

function postLeave(path, data) {
  return new Promise((resolve) => {
    uni.request({
      url: SMARTLOCK_API + path,
      method: 'POST',
      header: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: Object.assign({ pid: 'yyzx', aid: 'throughSchool' }, data),
      timeout: 12000,
      success: (res) => {
        resolve(res.data && typeof res.data === 'object' ? res.data : null)
      },
      fail: () => resolve(null)
    })
  })
}

export const LEAVE_STATUS = {
  '1': { text: '未出校', cls: 'info' },
  '2': { text: '待返校', cls: 'warn' },
  '3': { text: '已返校', cls: 'ok' },
  '4': { text: '超时未返校', cls: 'danger' }
}

export const TRAFFIC_WAYS = ['公共交通', '打车', '私家车', '其他']

export async function fetchLeaveList(token, { status = '', page = 1, pageSize = 10 }) {
  const body = await postLeave('/core/user/Outapply/getList', {
    token,
    status,
    page,
    pageSize
  })
  if (!body || Number(body.status) !== 0) {
    return { ok: false, list: [], pageInfo: null, msg: (body && body.errmsg) || '加载失败' }
  }
  const data = body.data || {}
  const list = data.data || []
  return { ok: true, list: Array.isArray(list) ? list : [], pageInfo: data.pageInfo || null }
}

export async function fetchLeaveConfig(token) {
  const body = await postLeave('/core/user/config/getList', { token })
  if (!body || Number(body.status) !== 0 || !Array.isArray(body.data)) return null
  const conf = {}
  body.data.forEach((row) => {
    if (row && row.ckey) conf[row.ckey] = row.value
  })
  const advance = conf.advanceDays
  const advanceDays = advance === undefined || advance === null || advance === ''
    ? 1
    : Number(advance)
  return {
    outSchoolTime: conf.outSchoolTime || '06:30',
    inSchoolTime: conf.inSchoolTime || '22:00',
    advanceDays: Number.isFinite(advanceDays) ? advanceDays : 1
  }
}

export async function fetchLeaveDetail(token, id) {
  const body = await postLeave('/core/user/outapply/detail', { token, id })
  if (!body || Number(body.status) !== 0) return null
  return body.data || null
}

export async function submitLeave(token, payload) {
  const body = await postLeave('/core/user/Outapply/add', Object.assign({ token }, payload))
  if (!body) return { ok: false, msg: '网络请求失败，请稍后重试' }
  return { ok: Number(body.status) === 0, msg: body.errmsg || '' }
}
