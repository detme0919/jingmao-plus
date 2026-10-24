import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Dialog, Toast } from 'antd-mobile'
import PageShell from '@/components/PageShell'
import { api } from '@/api'
import { isTokenExpired, storeApi } from '@/api/store'
import { ACCENTS, type AccentId } from '@/theme/accents'
import { useThemeStore } from '@/store/theme'
import type { Person, TokenRecord } from '@/types'

/** 我的：登录态、外观主题、数据管理、关于 */
export default function ProfilePage() {
  const navigate = useNavigate()
  const [person, setPerson] = useState<Person | null>(null)
  const [token, setToken] = useState<TokenRecord | null>(null)
  const [version, setVersion] = useState('')
  const { accent, setAccent } = useThemeStore()

  const refresh = async () => {
    setToken(await storeApi.getLoginToken())
    setPerson(await storeApi.getPerson())
  }

  useEffect(() => {
    refresh()
    api
      .appInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion(''))
  }, [])

  const loggedIn = !!token && !isTokenExpired(token)

  const login = async () => {
    try {
      const record = await api.casOpenLogin()
      await storeApi.setLoginToken(record)
      Toast.show({ content: '登录成功' })
      try {
        await api.personDetail()
      } catch {
        /* 忽略个人信息拉取失败 */
      }
      refresh()
    } catch (e) {
      if (String(e) !== '__cancelled__')
        Dialog.alert({ title: '登录失败', content: String(e), })
    }
  }

  const logout = async () => {
    const r = await Dialog.confirm({
      title: '退出登录',
      content: '将清除统一认证登录状态。已保存的登记链接、课程表等数据不会被清除。',
      confirmText: '退出',
      cancelText: '取消'
    })
    if (!r) return
    await storeApi.setLoginToken(null)
    await storeApi.setPerson(null)
    setToken(null)
    setPerson(null)
    Toast.show({ content: '已退出登录' })
  }

  const clearAll = async () => {
    const r = await Dialog.confirm({
      title: '清除本机全部数据',
      content: '将清除登录状态、登记链接、考勤凭证与课程缓存，并恢复默认设置。确定继续？',
      confirmText: '清除',
      cancelText: '取消'
    })
    if (!r) return
    try {
      await api.storeClearAll()
      setToken(null)
      setPerson(null)
      Toast.show({ content: '已清除本机全部数据' })
      navigate('/', { replace: true })
    } catch (e) {
      Toast.show({ content: String(e) })
    }
  }

  return (
    <PageShell kicker="MY" title="我的" subtitle="登录状态、外观与数据管理">
      <div className="jm-profile-card">
        <img className="jm-avatar" src={person?.avatar || '/school-logo.png'} alt="头像" />
        <div className="jm-profile-body">
          <div className="jm-profile-name">
            {loggedIn ? person?.name || '已登录' : '未登录'}
          </div>
          {loggedIn && person ? (
            <div className="jm-profile-meta">
              {[person.idnum, person.academy, person.className].filter(Boolean).map((p) => (
                <span key={p} className="jm-profile-chip">
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <div className="jm-profile-sub">登录学校统一认证，同步头像与个人信息</div>
          )}
        </div>
        {loggedIn ? (
          <Button size="small" color="default" onClick={logout}>
            退出
          </Button>
        ) : (
          <Button size="small" color="primary" onClick={login}>
            去登录
          </Button>
        )}
      </div>

      <div className="jm-group">
        <div className="jm-group-title">外观主题</div>
        <div className="jm-accent-row">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`jm-accent ${accent === a.id ? 'is-active' : ''}`}
              onClick={() => setAccent(a.id as AccentId)}
            >
              <span className={`jm-accent-dot jm-accent-dot--${a.id}`}>{accent === a.id ? '✓' : ''}</span>
              <span className="jm-accent-name">{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="jm-group">
        <div className="jm-group-title">数据管理</div>
        <div
          className="jm-cell"
          onClick={async () => {
            const r = await Dialog.confirm({
              title: '清除已保存的链接',
              content: '仅删除本机保存的登记链接，不影响登录状态。',
              confirmText: '清除',
              cancelText: '取消'
            })
            if (!r) return
            await storeApi.clearRegisterLink()
            Toast.show({ content: '已清除登记链接' })
          }}
        >
          <span className="jm-cell-icon">🔗</span>
          <div className="jm-cell-body">
            <div className="jm-cell-label">清除已保存的链接</div>
            <div className="jm-cell-sub">仅删除本机保存的登记链接</div>
          </div>
          <span className="jm-cell-arrow">›</span>
        </div>
        <div className="jm-cell" onClick={clearAll}>
          <span className="jm-cell-icon jm-cell-icon--danger">🧹</span>
          <div className="jm-cell-body">
            <div className="jm-cell-label">清除本机全部数据</div>
            <div className="jm-cell-sub">登录、链接、考勤与课程缓存</div>
          </div>
          <span className="jm-cell-arrow">›</span>
        </div>
      </div>

      <div className="jm-group">
        <div className="jm-group-title">关于</div>
        <div className="jm-cell" onClick={() => navigate('/about')}>
          <span className="jm-cell-icon">ℹ️</span>
          <div className="jm-cell-body">
            <div className="jm-cell-label">关于经贸+</div>
            <div className="jm-cell-sub">个人作品与使用说明</div>
          </div>
          <span className="jm-cell-value">{version ? `v${version}` : ''}</span>
          <span className="jm-cell-arrow">›</span>
        </div>
      </div>

      <div className="jm-footer">河南经贸职业学院 · 个人校园工具</div>
    </PageShell>
  )
}
