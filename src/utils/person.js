// 学校个人信息：登录后通过统一认证 token 拉取头像与身份信息并缓存
import { SMARTLOCK_API, DEFAULT_AVATAR } from '@/config/school.js'

const PERSON_KEY = 'jm_person'

export function getCachedPerson() {
  try {
    const saved = uni.getStorageSync(PERSON_KEY)
    return saved && saved.name ? saved : null
  } catch (e) {
    return null
  }
}

export function saveCachedPerson(person) {
  try {
    uni.setStorageSync(PERSON_KEY, person)
  } catch (e) { /* 忽略 */ }
  return person
}

export function clearCachedPerson() {
  try {
    uni.removeStorageSync(PERSON_KEY)
  } catch (e) { /* 忽略 */ }
}

export function avatarOf(person) {
  if (person && person.avatar) return person.avatar
  return DEFAULT_AVATAR
}

/**
 * 拉取个人详情（姓名、学号、学院班级、头像地址）。
 * 接口：POST http://smartlock.henetc.edu.cn/throughSchool/core/user/Person/detail
 */
export function fetchPersonInfo(token) {
  return new Promise((resolve) => {
    if (!token) {
      resolve(null)
      return
    }
    uni.request({
      url: SMARTLOCK_API + '/core/user/Person/detail',
      method: 'POST',
      header: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: { token, pid: 'yyzx', aid: 'throughSchool' },
      timeout: 8000,
      success: (res) => {
        const body = res.data || {}
        if (res.statusCode === 200 && Number(body.status) === 0 && body.data) {
          const d = body.data
          resolve({
            name: d.username || '',
            idnum: d.idnum || '',
            academy: d.academy || '',
            specialty: d.specialty || '',
            className: d.class || '',
            avatar: d.head_image || '',
            token
          })
        } else {
          resolve(null)
        }
      },
      fail: () => resolve(null)
    })
  })
}
