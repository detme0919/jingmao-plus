import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NavBar } from 'antd-mobile'
import { api } from '@/api'

/** 内嵌学校原生 H5（打卡 / 出校登记），不跳转外部浏览器 */
export default function SchoolPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const target = params.get('target') === 'leave' ? 'leave' : 'kq'
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setUrl('')
    setError('')
    api
      .officialUrl(target)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch((e) => {
        if (alive) setError(String(e))
      })
    return () => {
      alive = false
    }
  }, [target])

  return (
    <div className="school-page">
      <NavBar
        backIcon
        onBack={() => navigate(-1)}
        right={
          <a className="jm-nav-action" onClick={() => setReloadKey((k) => k + 1)}>
            刷新
          </a>
        }
        style={
          {
            background: 'var(--jm-card)',
            borderBottom: '1px solid var(--jm-line)',
            '--adm-color-text': 'var(--jm-ink)',
            '--height': '48px',
            flexShrink: 0
          } as CSSProperties
        }
      >
        {target === 'kq' ? '学校打卡界面' : '学校出校登记'}
      </NavBar>
      {error ? <div className="jm-tip jm-tip--error">{error}</div> : null}
      {url ? (
        <iframe
          key={reloadKey}
          className="school-frame"
          src={url}
          title="学校原生界面"
          allow="geolocation; camera; microphone; clipboard-read; clipboard-write"
        />
      ) : !error ? (
        <div className="jm-tip">正在加载学校界面…</div>
      ) : null}
    </div>
  )
}
