import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Dialog, List, Toast } from 'antd-mobile'
import PageShell from '@/components/PageShell'
import { api } from '@/api'
import { isTokenExpired, storeApi } from '@/api/store'
import type { Person, TokenRecord } from '@/types'

/** 我的：登录态 + 设置入口 */
export default function ProfilePage() {
  const navigate = useNavigate()
  const [person, setPerson] = useState<Person | null>(null)
  const [token, setToken] = useState<TokenRecord | null>(null)
  const [version, setVersion] = useState('')

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
      Toast.show({ content: record.kqAutoLogin ? '登录成功，打卡考勤已自动登录' : '登录成功' })
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
      content: '将清除统一认证登录状态，已保存的课表不受影响。',
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

  return (
    <PageShell title="我的">
      <Card style={{ borderRadius: 'var(--jm-radius-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src={person?.avatar || '/school-logo.png'}
            alt="头像"
            style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--jm-bg)' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {loggedIn ? person?.name || '已登录' : '未登录'}
            </div>
            {loggedIn && person ? (
              <div style={{ marginTop: 2, fontSize: 12, color: 'var(--jm-ink-2)' }}>
                {[person.idnum, person.academy, person.className].filter(Boolean).join(' · ')}
              </div>
            ) : (
              <div style={{ marginTop: 2, fontSize: 12, color: 'var(--jm-ink-3)' }}>
                登录后同步头像与个人信息
              </div>
            )}
          </div>
          {loggedIn ? (
            <Button size="small" color="default" onClick={logout}>
              退出
            </Button>
          ) : (
            <Button size="small" color="primary" onClick={login}>
              登录
            </Button>
          )}
        </div>
      </Card>

      <List style={{ marginTop: 14, borderRadius: 'var(--jm-radius-card)', overflow: 'hidden' }}>
        <List.Item prefix="⚙️" arrow clickable onClick={() => navigate('/settings')}>
          设置
        </List.Item>
        <List.Item
          prefix="ℹ️"
          arrow
          clickable
          extra={version ? `v${version}` : ''}
          onClick={() => navigate('/about')}
        >
          关于经贸+
        </List.Item>
      </List>
    </PageShell>
  )
}
