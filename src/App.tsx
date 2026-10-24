import { useEffect } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { TabBar } from 'antd-mobile'
import { CalendarIcon, GridIcon, UserIcon } from '@/components/icons'
import { useThemeStore } from '@/store/theme'
import { applyAccent } from '@/store/theme'
import HomePage from '@/pages/home/HomePage'
import ToolkitPage from '@/pages/toolkit/ToolkitPage'
import ProfilePage from '@/pages/profile/ProfilePage'

const TABS = [
  { key: '/', title: '课表', icon: CalendarIcon, element: <HomePage /> },
  { key: '/toolkit', title: '工具', icon: GridIcon, element: <ToolkitPage /> },
  { key: '/profile', title: '我的', icon: UserIcon, element: <ProfilePage /> }
]

export default function App() {
  const accent = useThemeStore((s) => s.accent)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    applyAccent(accent)
  }, [accent])

  return (
    <div className="app-shell">
      <Routes>
        {TABS.map((t) => (
          <Route key={t.key} path={t.key} element={t.element} />
        ))}
      </Routes>

      <div className="app-tabbar">
        <TabBar
          activeKey={location.pathname}
          onChange={(key) => navigate(key)}
          style={
            {
              background: 'var(--jm-card)',
              borderTop: '1px solid var(--jm-line)',
              '--adm-color-primary': 'var(--jm-brand)'
            } as React.CSSProperties
          }
        >
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <TabBar.Item
                key={t.key}
                icon={(active) => (
                  <Icon size={22} color={active ? 'var(--jm-brand)' : 'var(--jm-ink-3)'} />
                )}
                title={t.title}
              />
            )
          })}
        </TabBar>
      </div>
    </div>
  )
}
