import type {
  CourseTable,
  KqProfile,
  KqRecord,
  LeaveConfig,
  LeavePage,
  LeaveRecord,
  OptionItem,
  Person,
  RegisterLink,
  TokenRecord
} from '@/types'

/** 是否运行在 Tauri 环境 */
export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

type Cmd = string
type Args = Record<string, unknown>

async function realInvoke<T>(cmd: Cmd, args?: Args): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke(cmd, args) as Promise<T>
}

// ---------------------------------------------------------------------------
// 浏览器预览用 mock（仅 dev 且非 Tauri 环境），让 UI 可以脱离 App 调试
// ---------------------------------------------------------------------------
const MOCK_ENABLED = import.meta.env.DEV && !inTauri

function mockInvoke<T>(cmd: Cmd, args?: Args): Promise<T> {
  const table: CourseTable = {
    className: '预览·26网络3班',
    savedAt: Date.now(),
    currentWeek: 8,
    realWeek: 8,
    days: [
      {
        label: '周一',
        name: '星期一',
        order: 1,
        courses: [
          { name: '计算机网络技术', period: '1-2节', weeksText: '7-8周', weeks: [7, 8], room: '3号楼302', teacher: '张老师' },
          { name: 'Web前端开发', period: '3-4节', weeksText: '1-16周', weeks: Array.from({ length: 16 }, (_, i) => i + 1), room: '2号楼105', teacher: '李老师' }
        ]
      },
      { label: '周二', name: '星期二', order: 2, courses: [{ name: '大学英语', period: '1-2节', weeksText: '', weeks: [], room: '4号楼402', teacher: '王老师' }] },
      { label: '周三', name: '星期三', order: 3, courses: [{ name: '高等数学', period: '5-6节', weeksText: '', weeks: [], room: '1号楼201', teacher: '刘老师' }] },
      { label: '周四', name: '星期四', order: 4, courses: [{ name: 'java程序设计', period: '3-4节', weeksText: '', weeks: [], room: '5号楼501', teacher: '孙老师' }] },
      { label: '周五', name: '星期五', order: 5, courses: [{ name: '数据结构', period: '7-8节', weeksText: '', weeks: [], room: '1号楼301', teacher: '陈老师' }] }
    ]
  }
  const day = new Date().toISOString().slice(0, 10)
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      switch (cmd) {
        case 'app_info':
          return resolve({ name: 'jingmao-plus', version: '1.0.2', school: '河南经贸职业学院' } as T)
        case 'store_set':
        case 'store_clear_all':
        case 'kq_logout':
        case 'leave_submit':
          return resolve(null as T)
        case 'kq_login':
          return resolve({ name: '预览同学', className: '26网络3班', academy: '信息学院', hasIdnum: true } as T)
        case 'kq_punch':
          return reject('打卡定位仅在 App 内可用')
        case 'store_get':
          if (args?.key === 'course_cache') return resolve(table as T)
          if (args?.key === 'course_selection') return resolve({ collegeValue: 'demo', classValue: 'demo-class', className: '预览·26网络3班', collegeName: '演示学院' } as T)
          if (args?.key === 'kq_auth') return resolve({ token: 'mock', savedAt: Date.now(), expiresAt: Date.now() + 864e5 } as T)
          return resolve(null as T)
        case 'official_url':
          return resolve((args?.target === 'leave'
            ? 'https://smartlock.henetc.edu.cn/throughSchool/static/app/#/perregister'
            : 'https://kq.henetc.edu.cn/catch/static/app/#/sign?aid=catch&pid=yyzx') as T)
        case 'course_fetch_colleges':
          return resolve([{ value: '01', label: '信息学院' }, { value: '02', label: '会计学院' }] as T)
        case 'course_fetch_classes':
          return resolve([{ value: 'demo-class', label: '26网络3班' }, { value: 'demo-class2', label: '26网络4班' }] as T)
        case 'course_query_table':
        case 'course_fetch_by_link':
          return resolve(table as T)
        case 'kq_current_week':
          return resolve({ week: 8, total: 20, ok: true } as T)
        case 'kq_profile':
          return resolve({ idnum: '0000', name: '预览同学', className: '26网络3班', academy: '信息学院' } as T)
        case 'kq_today':
          return resolve([{ time: '08:05:33', title: '晨间签到', position: '113.62,34.74', status: '0' }] as T)
        case 'kq_saved_cred':
          return resolve({ remember: false, username: null } as T)
        case 'leave_list':
          return resolve({
            list: [
              { id: '1', beginTime: `${day} 08:30:00`, endTime: `${day} 18:00:00`, reason: '外出办事', destination: '市区', trafficWay: '1', status: '3' },
              { id: '2', beginTime: `${day} 09:00:00`, endTime: `${day} 12:00:00`, reason: '返回家中', destination: '东区', trafficWay: '2', status: '2' }
            ],
            totalPage: 1
          } as T)
        case 'leave_config':
          return resolve({ outSchoolTime: '06:30', inSchoolTime: '22:00', advanceDays: 1 } as T)
        case 'leave_detail':
          return resolve({ id: args?.id, beginTime: `${day} 08:30:00`, endTime: `${day} 18:00:00`, reason: '外出办事', destination: '市区', trafficWay: '1', status: '3' } as T)
        case 'person_detail':
          return resolve({ name: '预览同学', idnum: '0000', academy: '信息学院', specialty: '网络技术', className: '26网络3班', avatar: '' } as T)
        case 'clipboard_detect_register_link':
          return resolve({ ok: false } as T)
        default:
          return reject(`浏览器预览不支持：${cmd}`)
      }
    }, 200)
  })
}

/** 统一 invoke 入口 */
export function call<T>(cmd: Cmd, args?: Args): Promise<T> {
  if (inTauri) return realInvoke<T>(cmd, args)
  if (MOCK_ENABLED) return mockInvoke<T>(cmd, args)
  return Promise.reject('请在经贸+ App 内使用')
}

// ---------------------------------------------------------------------------
// 类型化 API
// ---------------------------------------------------------------------------

export const api = {
  appInfo: () => call<{ name: string; version: string; school: string }>('app_info'),

  // 存储
  storeGet: <T>(key: string) => call<T | null>('store_get', { key }),
  storeSet: (key: string, value: unknown) => call<void>('store_set', { key, value }),
  storeClearAll: () => call<void>('store_clear_all'),

  // 课程表
  courseColleges: () => call<OptionItem[]>('course_fetch_colleges'),
  courseClasses: (collegeValue: string) => call<OptionItem[]>('course_fetch_classes', { collegeValue }),
  courseQueryTable: (collegeValue: string, classValue: string) =>
    call<CourseTable>('course_query_table', { collegeValue, classValue }),
  courseByLink: (url: string) => call<CourseTable>('course_fetch_by_link', { url }),
  courseParseLinkText: (text: string) =>
    call<{ ok: boolean; url?: string; wxid?: string }>('course_parse_link_text', { text }),

  // 打卡考勤
  kqLogin: (username: string, password: string, remember: boolean) =>
    call<{ name: string; className: string; academy: string; hasIdnum: boolean }>('kq_login', { username, password, remember }),
  kqProfile: () => call<KqProfile>('kq_profile'),
  kqToday: () => call<KqRecord[]>('kq_today'),
  kqCurrentWeek: () => call<{ week: number; total: number; ok: boolean }>('kq_current_week'),
  kqLogout: () => call<void>('kq_logout'),
  kqSavedCred: () => call<{ remember: boolean; username: string | null }>('kq_saved_cred'),
  kqPunch: () => call<{ mode: string }>('kq_punch'),

  // 出校登记
  leaveList: (status: string, page: number) => call<LeavePage>('leave_list', { status, page }),
  leaveConfig: () => call<LeaveConfig>('leave_config'),
  leaveDetail: (id: string) => call<LeaveRecord>('leave_detail', { id }),
  leaveSubmit: (p: { beginTime: string; endTime: string; reason: string; trafficWay: string; destination: string }) =>
    call<void>('leave_submit', {
      beginTime: p.beginTime,
      endTime: p.endTime,
      reason: p.reason,
      trafficWay: p.trafficWay,
      destination: p.destination
    }),

  // 学校原生页面地址（用于内嵌 WebView）
  officialUrl: (target: 'kq' | 'leave') => call<string>('official_url', { target }),

  // 个人信息与登录
  personDetail: () => call<Person>('person_detail'),
  casOpenLogin: () => call<TokenRecord>('cas_open_login'),
  clipboardDetectRegisterLink: () => call<RegisterLink>('clipboard_detect_register_link')
}
