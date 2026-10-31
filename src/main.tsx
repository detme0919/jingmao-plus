import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/global.css'
import './styles/widgets.css'
import './styles/pages.css'

// 安全区（状态栏/小白条）：MainActivity 注入并持久化，页面加载时恢复
try {
  const top = localStorage.getItem('jm_inset_top')
  const bottom = localStorage.getItem('jm_inset_bottom')
  if (top) document.documentElement.style.setProperty('--inset-top', `${top}px`)
  if (bottom) document.documentElement.style.setProperty('--inset-bottom', `${bottom}px`)
} catch {
  /* 忽略 */
}


createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>
)
