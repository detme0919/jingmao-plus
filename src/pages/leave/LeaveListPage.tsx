import { useEffect, useRef, useState } from 'react'
import { InfiniteScroll, PullToRefresh, Toast } from 'antd-mobile'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SubPage from '@/components/SubPage'
import { api } from '@/api'
import { isTokenExpired, storeApi } from '@/api/store'
import type { LeaveRecord } from '@/types'

export const LEAVE_STATUS: Record<string, { text: string; cls: string }> = {
  '1': { text: '未出校', cls: 'info' },
  '2': { text: '待返校', cls: 'warn' },
  '3': { text: '已返校', cls: 'ok' },
  '4': { text: '超时未返校', cls: 'danger' }
}

export const TRAFFIC_WAYS = ['公共交通', '打车', '私家车', '其他']

export function trafficLabel(v: string): string {
  const n = parseInt(v, 10)
  return TRAFFIC_WAYS[n - 1] || v || '-'
}

const FILTERS = [
  { key: '', label: '全部' },
  { key: '1', label: '未出校' },
  { key: '2', label: '待返校' },
  { key: '3', label: '已返校' },
  { key: '4', label: '超时' }
]

/** 出校登记列表：状态筛选 + 下拉刷新 + 上拉分页 */
export default function LeaveListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const [records, setRecords] = useState<LeaveRecord[]>([])
  const [totalPage, setTotalPage] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const seqRef = useRef(0)

  const load = async (targetStatus: string, targetPage: number, append: boolean) => {
    const currentSeq = ++seqRef.current
    setLoading(true)
    setError('')
    try {
      const result = await api.leaveList(targetStatus, targetPage)
      if (currentSeq !== seqRef.current) return
      setRecords((prev) => (append ? [...prev, ...result.list] : result.list))
      setTotalPage(result.totalPage)
      setPage(targetPage)
    } catch (e) {
      if (currentSeq !== seqRef.current) return
      setError(String(e))
    } finally {
      if (currentSeq === seqRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    load(status, 1, false)
  }, [status])

  const switchFilter = (key: string) => {
    const next = new URLSearchParams(params)
    if (key) next.set('status', key)
    else next.delete('status')
    setParams(next)
  }

  const goApply = async () => {
    const token = await storeApi.getLoginToken()
    const link = await storeApi.getRegisterLink()
    const hasToken = (token && !isTokenExpired(token)) || (link && !isTokenExpired(link))
    if (hasToken) {
      navigate('/leave/apply')
    } else {
      Toast.show({ content: '请先在「我的」完成统一认证登录' })
    }
  }

  return (
    <SubPage
      title="出校登记"
      right={
        <a className="jm-nav-action" onClick={goApply}>
          发起申请
        </a>
      }
    >
      <div className="jm-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`jm-chip ${(status || '') === f.key ? 'jm-chip--solid' : ''}`}
            onClick={() => switchFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="jm-tip jm-tip--error">
          {error}
          <a className="jm-retry" onClick={() => load(status, 1, false)}>
            重试
          </a>
        </div>
      ) : (
        <PullToRefresh
          onRefresh={async () => {
            await load(status, 1, false)
          }}
        >
          {records.length === 0 && !loading ? (
            <div className="jm-tip">暂无登记记录{status ? '（当前筛选）' : ''}</div>
          ) : null}
          {records.map((r) => {
            const st = LEAVE_STATUS[r.status] || { text: r.status || '-', cls: 'info' }
            return (
              <div key={r.id} className="jm-leave-card" onClick={() => navigate(`/leave/detail/${r.id}`)}>
                <div className="jm-leave-head">
                  <span className="jm-leave-time">{r.beginTime.slice(0, 16)} 出校</span>
                  <span className={`jm-status jm-status--${st.cls}`}>{st.text}</span>
                </div>
                <div className="jm-leave-meta">
                  {r.destination || '-'} · {trafficLabel(r.trafficWay)}
                </div>
                <div className="jm-leave-reason">{r.reason || '（无事由）'}</div>
              </div>
            )
          })}
          <InfiniteScroll
            hasMore={page < totalPage && !error}
            loadMore={async () => {
              await load(status, page + 1, true)
            }}
          />
        </PullToRefresh>
      )}

      <div className="jm-bottom-bar jm-bottom-bar--row">
        <button className="jm-ghost-btn" type="button" onClick={() => navigate('/school?target=leave')}>
          学校原生界面
        </button>
        <button className="jm-primary-btn" type="button" onClick={goApply}>
          发起离校申请
        </button>
      </div>
    </SubPage>
  )
}
