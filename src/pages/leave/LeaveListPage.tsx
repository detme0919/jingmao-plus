import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, CapsuleTabs, ErrorBlock, InfiniteScroll, List, PullToRefresh, Tag, Toast } from 'antd-mobile'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SubPage from '@/components/SubPage'
import LiquidGlass from '@/components/LiquidGlass'
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

/** 状态 → Tag 颜色 */
export const statusColor = (cls: string): 'default' | 'warning' | 'success' | 'danger' =>
  cls === 'warn' ? 'warning' : cls === 'ok' ? 'success' : cls === 'danger' ? 'danger' : 'default'

/** 出校登记列表：状态筛选（CapsuleTabs）+ 下拉刷新 + 上拉分页 */
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
    <SubPage title="出校登记">
      <div style={{ paddingBottom: 'calc(92px + max(var(--inset-bottom, 0px), 20px))' }}>
      <CapsuleTabs activeKey={status} onChange={switchFilter} style={{ '--gap': '8px' } as CSSProperties}>
        {FILTERS.map((f) => (
          <CapsuleTabs.Tab title={f.label} key={f.key} />
        ))}
      </CapsuleTabs>

      {error ? (
        <ErrorBlock
          status="disconnected"
          title="加载失败"
          description={error}
          style={{ '--image-height': '56px' } as CSSProperties}
        />
      ) : (
        <PullToRefresh
          onRefresh={async () => {
            await load(status, 1, false)
          }}
        >
          {records.length === 0 && !loading ? (
            <ErrorBlock
              status="empty"
              title="暂无登记记录"
              description={status ? '当前筛选下没有记录' : '去发起一次离校申请吧'}
              style={{ '--image-height': '72px' } as CSSProperties}
            />
          ) : null}
          <List style={{ borderRadius: 'var(--jm-radius-card)', overflow: 'hidden' }}>
            {records.map((r) => {
              const st = LEAVE_STATUS[r.status] || { text: r.status || '-', cls: 'info' }
              return (
                <List.Item
                  key={r.id}
                  clickable
                  onClick={() => navigate(`/leave/detail/${r.id}`)}
                  extra={<Tag color={statusColor(st.cls)} fill="outline">{st.text}</Tag>}
                  description={
                    <>
                      <div>
                        {r.destination || '-'} · {trafficLabel(r.trafficWay)}
                      </div>
                      <div style={{ color: 'var(--jm-ink-3)' }}>{r.reason || '（无事由）'}</div>
                    </>
                  }
                >
                  {r.beginTime.slice(0, 16)} 出校
                </List.Item>
              )
            })}
          </List>
          <InfiniteScroll
            hasMore={page < totalPage && !error}
            loadMore={async () => {
              await load(status, page + 1, true)
            }}
          />
        </PullToRefresh>
      )}
      </div>

      <LiquidGlass className="leave-actions">
        <Button
          block
          color="primary"
          size="large"
          style={{ flex: 1.4 }}
          onClick={goApply}
        >
          发起离校申请
        </Button>
        <Button
          block
          color="default"
          fill="outline"
          size="large"
          style={{ flex: 1 }}
          onClick={() => navigate('/school?target=leave')}
        >
          原生界面
        </Button>
      </LiquidGlass>
    </SubPage>
  )
}
