import { useCallback, useEffect, useState } from 'react'
import { Button, List, Toast } from 'antd-mobile'
import SubPage from '@/components/SubPage'
import { api } from '@/api'
import { isTokenExpired, storeApi } from '@/api/store'

/** 数据分类：勾选清除 */
interface Category {
  id: string
  name: string
  desc: string
  color: string
  /** 统计该类数据的条数 */
  count: () => Promise<number>
  /** 清除该类数据 */
  clear: () => Promise<void>
}

const CATEGORIES: Category[] = [
  {
    id: 'login',
    name: '登录状态',
    desc: '统一认证 token 与个人信息缓存',
    color: '#005dac',
    count: async () => {
      const token = await storeApi.getLoginToken()
      const person = await storeApi.getPerson()
      return (token && !isTokenExpired(token) ? 1 : 0) + (person ? 1 : 0)
    },
    clear: async () => {
      await storeApi.setLoginToken(null)
      await storeApi.setPerson(null)
    }
  },
  {
    id: 'link',
    name: '登记链接',
    desc: '剪贴板保存的出校登记链接',
    color: '#2f7cc4',
    count: async () => ((await storeApi.getRegisterLink()) ? 1 : 0),
    clear: () => storeApi.clearRegisterLink()
  },
  {
    id: 'kq',
    name: '考勤凭证',
    desc: '打卡考勤的登录态与记住的账号密码',
    color: '#6aa6d8',
    count: async () => {
      const auth = await api.storeGet('kq_auth')
      const cred = await api.storeGet('kq_cred')
      return (auth ? 1 : 0) + (cred ? 1 : 0)
    },
    clear: () => api.kqLogout()
  },
  {
    id: 'course',
    name: '课程数据',
    desc: '绑定的班级、课表缓存与手动加课',
    color: '#a3c8ec',
    count: async () => {
      const keys = ['course_selection', 'course_auth', 'course_cache', 'course_manual'] as const
      const values = await Promise.all(keys.map((k) => api.storeGet(k)))
      return values.filter((v) => v !== null && v !== undefined).length
    },
    clear: async () => {
      for (const k of ['course_selection', 'course_auth', 'course_cache', 'course_manual']) {
        await api.storeSet(k, null)
      }
    }
  }
]

/** 单一分段圆环：各分类按占总数比例着色 */
function Donut({ counts }: { counts: Record<string, number> }) {
  const size = 190
  const r = 74
  const c = 2 * Math.PI * r
  const total = CATEGORIES.reduce((s, cat) => s + (counts[cat.id] ?? 0), 0)

  let acc = 0
  const segments = CATEGORIES.map((cat) => {
    const count = counts[cat.id] ?? 0
    const frac = total > 0 ? count / total : 0
    const seg = { cat, count, frac, start: acc }
    acc += frac
    return seg
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <svg width={size} height={size} viewBox="0 0 190 190">
        <circle cx="95" cy="95" r={r} fill="none" stroke="var(--jm-line)" strokeWidth="16" />
        {segments.map(
          (s) =>
            s.count > 0 && (
              <circle
                key={s.cat.id}
                cx="95"
                cy="95"
                r={r}
                fill="none"
                stroke={s.cat.color}
                strokeWidth="16"
                strokeDasharray={`${s.frac * c} ${c * (1 - s.frac) + 1}`}
                strokeDashoffset={-s.start * c}
                transform="rotate(-90 95 95)"
                style={{ transition: 'stroke-dasharray .4s ease, stroke-dashoffset .4s ease' }}
              />
            )
        )}
        <text x="95" y="90" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--jm-ink)">
          {total}
        </text>
        <text x="95" y="116" textAnchor="middle" fontSize="12" fill="var(--jm-ink-3)">
          条数据
        </text>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 16px' }}>
        {CATEGORIES.map((cat) => {
          const count = counts[cat.id] ?? 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <span
              key={cat.id}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--jm-ink-2)' }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 999, background: cat.color, display: 'inline-block' }} />
              {cat.name} {count} 条（{pct}%）
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** 数据管理：分段圆环总览 + 勾选要清除的内容 + 一键清理 */
export default function DataManagePage() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(CATEGORIES.map((c) => [c.id, true]))
  )
  const [cleaning, setCleaning] = useState(false)

  const reload = useCallback(async () => {
    const entries = await Promise.all(
      CATEGORIES.map(async (c) => [c.id, await c.count()] as const)
    )
    setCounts(Object.fromEntries(entries))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const selectedCount = CATEGORIES.filter((c) => selected[c.id]).length

  const cleanAll = async () => {
    if (cleaning || selectedCount === 0) return
    setCleaning(true)
    try {
      for (const c of CATEGORIES) {
        if (selected[c.id]) await c.clear()
      }
      Toast.show({ content: `已清理 ${selectedCount} 类数据` })
      await reload()
    } catch (e) {
      Toast.show({ content: String(e) })
    } finally {
      setCleaning(false)
    }
  }

  return (
    <SubPage title="数据管理">
      <div
        className="app-card"
        style={{ padding: '24px 12px', borderRadius: 'var(--jm-radius-card)' }}
      >
        <Donut counts={counts} />
      </div>

      <List
        header="选择要清除的内容"
        style={{ marginTop: 14, borderRadius: 'var(--jm-radius-card)', overflow: 'hidden' }}
      >
        {CATEGORIES.map((c) => (
          <List.Item
            key={c.id}
            prefix={
              <input
                type="checkbox"
                checked={!!selected[c.id]}
                onChange={(e) => setSelected((s) => ({ ...s, [c.id]: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: 'var(--jm-brand)' }}
              />
            }
            description={c.desc}
          >
            {c.name}
          </List.Item>
        ))}
      </List>

      <div style={{ marginTop: 16 }}>
        <Button
          block
          color="danger"
          size="large"
          loading={cleaning}
          disabled={selectedCount === 0}
          onClick={cleanAll}
        >
          {selectedCount > 0 ? `一键清理（已选 ${selectedCount} 类）` : '请先选择要清除的内容'}
        </Button>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--jm-ink-3)', textAlign: 'center' }}>
          清除操作不可恢复，已保存的课表绑定选择后需重新导入
        </div>
      </div>
    </SubPage>
  )
}
