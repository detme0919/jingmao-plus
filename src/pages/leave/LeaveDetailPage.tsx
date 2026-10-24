import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import SubPage from '@/components/SubPage'
import { api } from '@/api'
import { LEAVE_STATUS, trafficLabel } from '@/pages/leave/LeaveListPage'
import type { LeaveRecord } from '@/types'

/** 申请详情 */
export default function LeaveDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [record, setRecord] = useState<LeaveRecord | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    api
      .leaveDetail(id)
      .then(setRecord)
      .catch((e) => setError(String(e)))
  }, [id])

  if (error) return <SubPage title="申请详情"><div className="jm-tip jm-tip--error">{error}</div></SubPage>
  if (!record) return <SubPage title="申请详情"><div className="jm-tip">加载中…</div></SubPage>

  const st = LEAVE_STATUS[record.status] || { text: record.status || '-', cls: 'info' }
  const rows: [string, string][] = [
    ['离校时间', record.beginTime],
    ['返校时间', record.endTime],
    ['交通方式', trafficLabel(record.trafficWay)],
    ['目的地', record.destination],
    ['外出事由', record.reason]
  ]

  return (
    <SubPage title="申请详情">
      <div className="app-card" style={{ padding: 20 }}>
        <div className="jm-detail-status">
          <span className={`jm-status jm-status--${st.cls}`}>{st.text}</span>
        </div>
        {rows.map(([k, v]) => (
          <div key={k} className="jm-detail-row">
            <span className="jm-detail-label">{k}</span>
            <span className="jm-detail-value">{v || '-'}</span>
          </div>
        ))}
      </div>
    </SubPage>
  )
}
