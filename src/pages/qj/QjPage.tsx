import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Card, Dialog, ErrorBlock, List, PullToRefresh, SafeArea, SpinLoading, Tag, Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import SubPage from '@/components/SubPage'
import { api } from '@/api'
import { storeApi } from '@/api/store'
import type { QjRecord } from '@/types'

const fmtDays = (d: number) => (Number.isInteger(d) ? String(d) : String(parseFloat(d.toFixed(1))))

/** 审核状态 → Tag 颜色 */
const auditColor = (r: QjRecord): 'default' | 'warning' | 'success' | 'danger' => {
  if (r.returned || /不通过|驳回|不同意/.test(r.audit)) return 'danger'
  if (/通过|同意/.test(r.audit)) return 'success'
  if (/待|审核中|审批/.test(r.audit)) return 'warning'
  return 'default'
}

/** 需要引导用户做统一认证登录的报错（无凭据 / 凭据失效） */
const isCredError = (msg: string) => /尚未保存|账号或密码|验证码/.test(msg)

/** 学生请假（ehall）：请假记录列表；发起申请走学校原生界面 */
export default function QjPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState<QjRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needLogin, setNeedLogin] = useState(false)
  const seqRef = useRef(0)

  const load = async () => {
    const seq = ++seqRef.current
    setLoading(true)
    try {
      const list = await api.qjRecords()
      if (seq !== seqRef.current) return
      setRecords(list)
      setError('')
      setNeedLogin(false)
    } catch (e) {
      if (seq !== seqRef.current) return
      const msg = String(e)
      setError(msg)
      setNeedLogin(isCredError(msg))
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 页内一键统一认证登录（强制显示表单抓取凭据）：登录窗口返回后页面会重载并自动拉取记录 */
  const doLogin = async () => {
    try {
      const record = await api.casOpenLogin(true)
      // 强制登录走 ehall service，返回记录可能不含新 token（沿用已存登录态），勿覆盖
      if (record && record.token) await storeApi.setLoginToken(record)
      Toast.show({ content: '登录成功' })
      load()
    } catch (e) {
      const msg = String(e)
      if (msg !== '__cancelled__' && msg !== '__active__')
        Dialog.alert({ title: '登录失败', content: msg })
    }
  }

  const dateRange = (r: QjRecord) => {
    const b = r.beginTime ? ` ${r.beginTime}` : ''
    const e = r.endTime ? ` ${r.endTime}` : ''
    return r.beginDate === r.endDate
      ? `${r.beginDate}${b} ~${e}`
      : `${r.beginDate}${b} ~ ${r.endDate}${e}`
  }

  return (
    <SubPage
      title="学生请假"
      right={
        <a className="jm-nav-action" onClick={() => navigate('/school?target=qj')}>
          学校原生界面
        </a>
      }
    >
      {loading && records.length === 0 && !error ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <SpinLoading style={{ '--size': '28px' }} />
        </div>
      ) : null}

      {error && !needLogin ? (
        <ErrorBlock
          status="disconnected"
          title="加载失败"
          description={error}
          style={{ '--image-height': '56px' } as CSSProperties}
        />
      ) : null}

      {needLogin ? (
        <Card style={{ borderRadius: 'var(--jm-radius-card)' }}>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--jm-ink-2)' }}>
            请假记录需要用统一认证账号密码直连学校查询，完成一次登录后将自动保持，无需重复登录
          </div>
          <Button block color="primary" style={{ marginTop: 12 }} onClick={doLogin}>
            统一认证登录
          </Button>
        </Card>
      ) : null}

      {!error && !needLogin ? (
        <PullToRefresh onRefresh={load}>
          {records.length === 0 && !loading ? (
            <ErrorBlock
              status="empty"
              title="暂无请假记录"
              style={{ '--image-height': '72px' } as CSSProperties}
            />
          ) : null}
          <List style={{ borderRadius: 'var(--jm-radius-card)', overflow: 'hidden' }}>
            {records.map((r) => (
              <List.Item
                key={r.sqbh || `${r.beginDate}${r.beginTime}`}
                extra={<Tag color={auditColor(r)} fill="outline">{r.audit || '-'}</Tag>}
                description={
                  <>
                    <div>
                      {dateRange(r)} · {fmtDays(r.days)}天
                    </div>
                    <div style={{ color: 'var(--jm-ink-3)' }}>
                      {r.reason || '（无事由）'}
                    </div>
                    <div style={{ color: 'var(--jm-ink-3)' }}>
                      申请 {r.applyDate || '-'}
                      {r.cancelStatus ? ` · ${r.cancelStatus}` : ''}
                    </div>
                  </>
                }
              >
                {r.leaveType || '请假'}
                {r.nature ? <span style={{ fontSize: 12, color: 'var(--jm-ink-3)' }}>（{r.nature}）</span> : null}
              </List.Item>
            ))}
          </List>
        </PullToRefresh>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <Button block color="primary" size="large" onClick={() => navigate('/school?target=qj')}>
          发起请假申请
        </Button>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--jm-ink-3)', textAlign: 'center' }}>
          申请与审批详情请通过学校原生界面操作，本页展示已有记录
        </div>
        <SafeArea position="bottom" />
      </div>
    </SubPage>
  )
}
