import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Dialog, List, Toast } from 'antd-mobile'
import PageShell from '@/components/PageShell'
import { api } from '@/api'
import { isTokenExpired, storeApi } from '@/api/store'
import type { Person, RegisterLink } from '@/types'

/** 工具箱：登录态问候 + 服务入口（List）+ 剪贴板链接检测 */
export default function ToolkitPage() {
  const navigate = useNavigate()
  const [person, setPerson] = useState<Person | null>(null)
  const [clipLink, setClipLink] = useState<RegisterLink | null>(null)
  const [dismissed, setDismissed] = useState('')

  const refresh = async () => {
    const token = await storeApi.getLoginToken()
    const cached = await storeApi.getPerson()
    if (!token || isTokenExpired(token)) {
      setPerson(null)
      return
    }
    if (cached && cached.token === token.token) {
      setPerson(cached)
      return
    }
    setPerson(null)
    try {
      const info = await api.personDetail()
      setPerson(info)
    } catch {
      /* 静默失败：登录 token 可能已过期 */
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const check = async () => {
      try {
        const parsed = await api.clipboardDetectRegisterLink()
        if (parsed.ok) {
          const saved = await storeApi.getRegisterLink()
          if (saved?.token === parsed.token) return
          if (dismissed === parsed.token) return
          setClipLink(parsed)
        }
      } catch {
        /* 浏览器预览或无剪贴板权限 */
      }
    }
    const t = setTimeout(check, 600)
    return () => clearTimeout(t)
  }, [dismissed])

  const greeting = person?.name ? `你好，${person.name}` : '你好，同学'

  return (
    <PageShell title="工具箱" subtitle={greeting}>
      {clipLink ? (
        <Card style={{ borderRadius: 'var(--jm-radius-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 22 }}>🔗</div>
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>剪贴板中有新的登记链接</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button
              size="small"
              color="primary"
              onClick={async () => {
                await storeApi.setRegisterLink(clipLink)
                await storeApi.setRegisterMode('link')
                Toast.show({ content: '已保存登记链接' })
                setDismissed(clipLink.token)
                setClipLink(null)
              }}
            >
              保存
            </Button>
            <Button
              size="small"
              color="default"
              fill="outline"
              onClick={() => {
                setDismissed(clipLink.token)
                setClipLink(null)
              }}
            >
              忽略
            </Button>
          </div>
        </Card>
      ) : null}

      <List header="常用服务" style={{ marginTop: 14, borderRadius: 'var(--jm-radius-card)', overflow: 'hidden' }}>
        <List.Item
          prefix="🚪"
          description="离校申请与记录"
          arrow
          clickable
          onClick={() => navigate('/leave')}
        >
          出校登记
        </List.Item>
        <List.Item
          prefix="🕒"
          description="定位打卡与签到记录"
          arrow
          clickable
          onClick={() => navigate('/kq')}
        >
          打卡考勤
        </List.Item>
        <List.Item
          prefix="📝"
          description="请假记录与申请进度"
          arrow
          clickable
          onClick={() => navigate('/qj')}
        >
          学生请假
        </List.Item>
      </List>

      {!person ? (
        <Card style={{ marginTop: 14, borderRadius: 'var(--jm-radius-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--jm-ink-2)' }}>
              登录后可查看出校登记与个人信息
            </span>
            <Button
              size="small"
              color="primary"
              fill="outline"
              onClick={async () => {
                try {
                  const record = await api.casOpenLogin()
                  await storeApi.setLoginToken(record)
                  Toast.show({ content: '登录成功' })
                  refresh()
                } catch (e) {
                  const msg = String(e)
                  if (msg !== '__cancelled__' && msg !== '__active__')
                    Dialog.alert({ title: '登录失败', content: msg })
                }
              }}
            >
              去登录
            </Button>
          </div>
        </Card>
      ) : null}
    </PageShell>
  )
}
