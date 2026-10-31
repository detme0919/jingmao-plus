import { useEffect, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBlock, List, Tag } from 'antd-mobile'
import SubPage from '@/components/SubPage'
import { api } from '@/api'
import { LEAVE_STATUS, statusColor, trafficLabel } from '@/pages/leave/LeaveListPage'
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

  if (error)
    return (
      <SubPage title="申请详情">
        <ErrorBlock status="disconnected" title="加载失败" description={error} style={{ '--image-height': '56px' } as CSSProperties} />
      </SubPage>
    )
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
      <List header="申请状态" style={{ borderRadius: 'var(--jm-radius-card)', overflow: 'hidden' }}>
        <List.Item extra={<Tag color={statusColor(st.cls)}>{st.text}</Tag>}>当前状态</List.Item>
      </List>
      <List header="申请内容" style={{ marginTop: 14, borderRadius: 'var(--jm-radius-card)', overflow: 'hidden' }}>
        {rows.map(([k, v]) => (
          <List.Item key={k} extra={<span style={{ color: 'var(--jm-ink)' }}>{v || '-'}</span>}>
            {k}
          </List.Item>
        ))}
      </List>
    </SubPage>
  )
}
