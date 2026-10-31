import { useEffect, useState, type CSSProperties } from 'react'
import { Button, Card, Dialog, ErrorBlock, Input, List, SpinLoading, Switch, Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import SubPage from '@/components/SubPage'
import { api } from '@/api'
import type { KqProfile, KqRecord } from '@/types'

/** 打卡考勤：独立账号登录（Rust 直连）、定位打卡、今日记录 */
export default function KqPage() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [profile, setProfile] = useState<KqProfile | null>(null)
  const [records, setRecords] = useState<KqRecord[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [logging, setLogging] = useState(false)
  const [punching, setPunching] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    try {
      const p = await api.kqProfile()
      setProfile(p)
      setAuthed(true)
      setRecords(await api.kqToday())
    } catch {
      setAuthed(false)
      setProfile(null)
      try {
        const cred = await api.kqSavedCred()
        if (cred.remember && cred.username) {
          setUsername(cred.username)
          setRemember(true)
        }
      } catch {
        /* 忽略 */
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const login = async () => {
    if (logging) return
    setLogging(true)
    try {
      const info = await api.kqLogin(username.trim(), password, remember)
      Toast.show({ content: `欢迎，${info.name || '同学'}` })
      await loadAll()
    } catch (e) {
      Dialog.alert({ title: '登录失败', content: String(e), })
    } finally {
      setLogging(false)
    }
  }

  const punch = async () => {
    if (punching) return
    setPunching(true)
    try {
      const r = await api.kqPunch()
      Toast.show({ content: r?.mode ? `打卡成功（${r.mode}）` : '打卡成功' })
      setRecords(await api.kqToday())
      void r
    } catch (e) {
      const msg = String(e)
      const denied = msg.startsWith('__denied__')
      const timeout = msg.startsWith('__timeout__')
      const text = msg.replace(/^__(denied|timeout)__\s*/, '').split('|')[0]
      const confirmed = await Dialog.confirm({
        title: '定位失败',
        content: text,
        confirmText: '重试',
        cancelText: '关闭'
      })
      if (confirmed && (denied || timeout)) punch()
    } finally {
      setPunching(false)
    }
  }

  const openOfficialPage = () => navigate('/school?target=kq')

  const unbind = async () => {
    const r = await Dialog.confirm({
      title: '解绑考勤',
      content: '将清除本机保存的考勤凭证和记住的账号密码，需要重新登录。确定解绑？',
      confirmText: '解绑',
      cancelText: '取消'
    })
    if (!r) return
    await api.kqLogout()
    await api.storeSet('kq_auth', null)
    setUsername('')
    setPassword('')
    setRemember(false)
    setProfile(null)
    setRecords([])
    setAuthed(false)
    Toast.show({ content: '已解绑' })
  }

  return (
    <SubPage
      title="打卡考勤"
      right={
        authed ? (
          <a className="jm-nav-action" onClick={unbind}>
            解绑
          </a>
        ) : null
      }
    >
      {authed === null && loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <SpinLoading style={{ '--size': '28px' }} />
        </div>
      ) : null}

      {authed === false ? (
        <Card title="考勤登录" style={{ borderRadius: 'var(--jm-radius-card)' }}>
          <div className="jm-field-label" style={{ marginTop: 4 }}>
            账号
          </div>
          <Input value={username} onChange={setUsername} placeholder="学号 / 考勤账号" clearable />
          <div className="jm-field-label" style={{ marginTop: 12 }}>
            密码
          </div>
          <Input type="password" value={password} onChange={setPassword} placeholder="密码" />
          <List style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden' }}>
            <List.Item extra={<Switch checked={remember} onChange={setRemember} />}>
              <span style={{ fontSize: 13 }}>记住密码（仅保存在本机）</span>
            </List.Item>
          </List>
          <Button block color="primary" size="large" style={{ marginTop: 12 }} loading={logging} onClick={login}>
            登录
          </Button>
        </Card>
      ) : null}

      {authed ? (
        <>
          <Card style={{ borderRadius: 'var(--jm-radius-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{profile?.name || '已登录'}</div>
                <div style={{ marginTop: 2, fontSize: 12, color: 'var(--jm-ink-2)' }}>
                  {[profile?.academy, profile?.className].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
            <Button
              block
              color="primary"
              size="large"
              style={{ marginTop: 14 }}
              loading={punching}
              onClick={punch}
            >
              {punching ? '定位中…' : '立即打卡'}
            </Button>
            <Button
              block
              color="default"
              fill="outline"
              style={{ marginTop: 12 }}
              onClick={openOfficialPage}
            >
              查看完整打卡记录
            </Button>
          </Card>

          {records.length === 0 ? (
            <ErrorBlock
              status="empty"
              title="今天还没有签到记录"
              style={{ '--image-height': '56px' } as CSSProperties}
            />
          ) : (
          <List
            header="今日签到"
            style={{ marginTop: 14, borderRadius: 'var(--jm-radius-card)', overflow: 'hidden' }}
          >
            {records.map((r, i) => (
              <List.Item
                key={i}
                prefix="🕐"
                description={
                  <>
                    {r.typeName ? <div>{r.typeName}</div> : null}
                    {r.position ? <div style={{ color: 'var(--jm-ink-3)' }}>{r.position}</div> : null}
                  </>
                }
              >
                {r.title || '签到'} · {r.time || '--'}
              </List.Item>
            ))}
          </List>
          )}
        </>
      ) : null}
    </SubPage>
  )
}
