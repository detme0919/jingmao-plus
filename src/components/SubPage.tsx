/** 子页面通用头部：返回键 + 标题（替代 uni 系统导航栏） */
import { useNavigate } from 'react-router-dom'
import { NavBar } from 'antd-mobile'
import type { ReactNode } from 'react'

interface SubPageProps {
  title: string
  right?: ReactNode
  children: ReactNode
}

export default function SubPage({ title, right, children }: SubPageProps) {
  const navigate = useNavigate()

  return (
    <div className="app-page app-page--sub">
      <NavBar
        backIcon
        onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        right={right}
        style={
          {
            background: 'var(--jm-card)',
            borderBottom: '1px solid var(--jm-line)',
            '--adm-color-text': 'var(--jm-ink)',
            '--height': 'calc(48px + var(--inset-top, 0px))',
            paddingTop: 'var(--inset-top, 0px)',
            position: 'sticky',
            top: 0,
            zIndex: 50
          } as React.CSSProperties
        }
      >
        {title}
      </NavBar>
      <main className="jm-page-body" style={{ paddingTop: 12 }}>
        {children}
      </main>
    </div>
  )
}
