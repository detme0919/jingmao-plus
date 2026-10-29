import { useEffect, useState } from 'react'
import { Button, Dialog, Input, Switch, Toast } from 'antd-mobile'
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
      {authed === null && loading ? <div className="jm-tip">加载中…</div> : null}

      {authed === false ? (
        <div className="app-card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>考勤登录</div>
          <div style={{ fontSize: 12, color: 'var(--jm-ink-2)', lineHeight: 1.7 }}>
            使用学校考勤系统（签到小程序）的账号密码。统一认证密码不适用；密码不会上传到任何第三方服务器。
          </div>
          <div className="jm-field-label" style={{ marginTop: 16 }}>
            账号
          </div>
          <Input value={username} onChange={setUsername} placeholder="学号 / 考勤账号" clearable />
          <div className="jm-field-label" style={{ marginTop: 12 }}>
            密码
          </div>
          <Input type="password" value={password} onChange={setPassword} placeholder="密码" />
          <div className="jm-remember-row">
            <span style={{ fontSize: 13, color: 'var(--jm-ink-2)' }}>记住密码（仅保存在本机）</span>
            <Switch checked={remember} onChange={setRemember} />
          </div>
          <Button block color="primary" size="large" style={{ marginTop: 12 }} loading={logging} onClick={login}>
            登录
          </Button>
        </div>
      ) : null}

      {authed ? (
        <>
          <div className="app-card jm-punch-card">
            <div className="jm-punch-user">
              <div className="jm-punch-name">{profile?.name || '已登录'}</div>
              <div className="jm-punch-class">{[profile?.academy, profile?.className].filter(Boolean).join(' · ')}</div>
            </div>
            <button className="jm-punch-btn" type="button" disabled={punching} onClick={punch}>
              {punching ? '定位中…' : '立即打卡'}
            </button>
            <div className="jm-punch-tip">
              优先使用教室蓝牙信标精准定位（自动识别教学楼），无信标时自动改用 GPS
              定位；请确保蓝牙和定位权限均已开启。
            </div>
            <button className="jm-ghost-btn" type="button" onClick={openOfficialPage}>
              查看学校原生界面
            </button>
          </div>

          <div className="jm-section-title" style={{ marginTop: 16 }}>
            今日签到
          </div>
          {records.length === 0 ? (
            <div className="jm-tip">今天还没有签到记录</div>
          ) : (
            records.map((r, i) => (
              <div key={i} className="jm-record-card">
                <div className="jm-record-time">🕐 {r.time || '--'}</div>
                <div className="jm-record-title">{r.title || '签到'}</div>
                {r.position ? <div className="jm-record-pos">{r.position}</div> : null}
              </div>
            ))
          )}

        </>
      ) : null}
    </SubPage>
  )
}
