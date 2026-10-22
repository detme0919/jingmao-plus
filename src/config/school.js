// 学校系统地址与登录链接构造
//
// token 说明：出校登记页的 token 由学校统一身份认证签发，24 小时有效。
//
// 可用登录入口（2026-10 实测）：
//   用户中心的移动端账号密码页（/user_center/static/manage/#/mlogin）已废弃，
//   账密校验始终失败、短信验证码也收不到，不能用。
//   用户中心仍保留「统一身份认证（CAS）」入口，后端接口为
//     /user_center/core/login/unifyAuthLogin?system_flag=..&type=..&callback=<目标地址>
//   它会 302 到 auth.henetc.edu.cn 的 CAS 登录页；登录成功后 CAS 携带票据回到
//   unifyAuthLoginCallback，由用户中心换取新 token 后跳转 callback（token 拼在地址后）。
//   /core/config/common 返回 unify_auth_enable: true，说明该通道是开启状态。

export const SMARTLOCK_BASE = 'http://smartlock.henetc.edu.cn/throughSchool/static/app/'
export const SMARTLOCK_API = 'http://smartlock.henetc.edu.cn/throughSchool'
export const PERREGISTER_URL = SMARTLOCK_BASE + '#/perregister'
export const ID_CENTER_BASE = 'http://id.henetc.edu.cn/user_center/'
export const DEFAULT_AVATAR = '/static/school-logo.png'

const SSO_LOGIN_API = ID_CENTER_BASE + 'core/login/unifyAuthLogin'

/**
 * 构造统一身份认证（CAS）登录地址。
 * @param {string} callbackUrl 登录成功后回跳的地址，默认出校登记页（不带 token）
 */
export function buildLoginUrl(callbackUrl = PERREGISTER_URL) {
  return (
    SSO_LOGIN_API +
    '?system_flag=throughSchool&type=3&callback=' +
    encodeURIComponent(callbackUrl)
  )
}

// 学生考勤（签到）：token 由旧版学校 App 签发，与统一认证 token 不通用
export const KQ_APP_BASE = 'https://kq.henetc.edu.cn/catch/static/app/'
export const KQ_SIGN_URL = KQ_APP_BASE + '#/sign?aid=catch&pid=yyzx'
export const KQ_API = 'https://kq.henetc.edu.cn/catch'
/**
 * 预留：考勤 token 自动获取接口（抓包自微信小程序）
 * 抓到的是：POST https://kq.henetc.edu.cn/ucenter/core/user/hnjmCatchWxLogin
 * 参数 pid=yyzx、aid=catch、code=<微信授权 code>
 * 该地址同时支持账号密码分支 { username, password, openid, app }（已用于打卡页登录）；
 * enabled 仅控制微信 code 分支的预留钩子。
 * 把 enabled 改为 true，并按实际成功响应配置 tokenPath 即可。
 * 也可以调用 loginKqByApi({ code }) 传入运行时参数。
 */
export const KQ_LOGIN_API = {
  enabled: false,
  url: 'https://kq.henetc.edu.cn/ucenter/core/user/hnjmCatchWxLogin',
  params: { pid: 'yyzx', aid: 'catch' },
  tokenPath: 'data.token'
}

// 班级课表查询页（公开表单，可按院系/班级查询）
export const COURSE_PAGE = 'http://weixin.henetc.edu.cn/student/bjkbcx.aspx?type=student'
