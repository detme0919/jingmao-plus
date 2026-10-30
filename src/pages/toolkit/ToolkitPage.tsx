import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Dialog, Toast } from 'antd-mobile'
import PageShell from '@/components/PageShell'
import { api } from '@/api'
import { isTokenExpired, storeApi } from '@/api/store'
import type { Person, RegisterLink } from '@/types'

/** 工作台：登录态问候 + 服务入口 + 剪贴板链接检测 */
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
    <PageShell kicker="TOOLKIT" title="工具箱" subtitle={greeting}>
      {clipLink ? (
        <div className="jm-clip-tip">
          <div className="jm-clip-icon">🔗</div>
          <div className="jm-clip-text">剪贴板中有新的登记链接</div>
          <div className="jm-clip-actions">
            <button
              className="jm-chip jm-chip--brand"
              onClick={async () => {
                await storeApi.setRegisterLink(clipLink)
                await storeApi.setRegisterMode('link')
                Toast.show({ content: '已保存登记链接' })
                setDismissed(clipLink.token)
                setClipLink(null)
              }}
            >
              保存
            </button>
            <button
              className="jm-chip"
              onClick={() => {
                setDismissed(clipLink.token)
                setClipLink(null)
              }}
            >
              忽略
            </button>
          </div>
        </div>
      ) : null}

      <div className="jm-section-title">常用服务</div>

      <div className="jm-service-card" onClick={() => navigate('/leave')}>
        <div className="jm-service-icon">🚪</div>
        <div className="jm-service-body">
          <div className="jm-service-title">出校登记</div>
          <div className="jm-service-desc">离校申请与记录</div>
        </div>
        <div className="jm-service-go">→</div>
      </div>

      <div className="jm-service-card" onClick={() => navigate('/kq')}>
        <div className="jm-service-icon jm-service-icon--kq">🕒</div>
        <div className="jm-service-body">
          <div className="jm-service-title">打卡考勤</div>
          <div className="jm-service-desc">定位打卡与签到记录</div>
        </div>
        <div className="jm-service-go">→</div>
      </div>

      {!person ? (
        <div className="jm-login-hint">
          <span>登录后可查看出校登记与个人信息</span>
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
      ) : null}

    </PageShell>
  )
}
