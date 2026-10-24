import { useEffect, type CSSProperties } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { TabBar } from 'antd-mobile'
import { CalendarIcon, GridIcon, UserIcon } from '@/components/icons'
import { useThemeStore } from '@/store/theme'
import { applyAccent } from '@/store/theme'
import HomePage from '@/pages/home/HomePage'
import ToolkitPage from '@/pages/toolkit/ToolkitPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import CourseBindPage from '@/pages/course/CourseBindPage'
import CourseAddPage from '@/pages/course/CourseAddPage'
import LeaveListPage from '@/pages/leave/LeaveListPage'
import LeaveApplyPage from '@/pages/leave/LeaveApplyPage'
import LeaveDetailPage from '@/pages/leave/LeaveDetailPage'
import KqPage from '@/pages/kq/KqPage'
import AboutPage from '@/pages/about/AboutPage'

const TABS = [
  { key: '/', title: '课表', icon: CalendarIcon },
  { key: '/toolkit', title: '工具', icon: GridIcon },
  { key: '/profile', title: '我的', icon: UserIcon }
]

const TAB_PATHS = TABS.map((t) => t.key)

export default function App() {
  const accent = useThemeStore((s) => s.accent)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    applyAccent(accent)
  }, [accent])

  const isTab = TAB_PATHS.includes(location.pathname)

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/toolkit" element={<ToolkitPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/course-bind" element={<CourseBindPage />} />
        <Route path="/course-add" element={<CourseAddPage />} />
        <Route path="/leave" element={<LeaveListPage />} />
        <Route path="/leave/apply" element={<LeaveApplyPage />} />
        <Route path="/leave/detail/:id" element={<LeaveDetailPage />} />
        <Route path="/kq" element={<KqPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {isTab ? (
        <div className="app-tabbar">
          <TabBar
            activeKey={location.pathname}
            onChange={(key) => navigate(key)}
            style={
              {
                background: 'var(--jm-card)',
                borderTop: '1px solid var(--jm-line)',
                '--adm-color-primary': 'var(--jm-brand)'
              } as CSSProperties
            }
          >
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <TabBar.Item
                  key={t.key}
                  icon={(active) => <Icon size={22} color={active ? 'var(--jm-brand)' : 'var(--jm-ink-3)'} />}
                  title={t.title}
                />
              )
            })}
          </TabBar>
        </div>
      ) : null}
    </div>
  )
}
