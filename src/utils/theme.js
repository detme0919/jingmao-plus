// 主题配色：默认取自学校校徽主色（#004AAB）
// 说明：色值同时被 scripts/gen-tab-icons.mjs 使用，新增主题后需重跑图标脚本
export const THEMES = [
  {
    id: 'blue',
    name: '经贸蓝',
    primary: '#004AAB',
    gradFrom: '#1F63C4',
    gradTo: '#003D8C',
    soft: 'rgba(0, 74, 171, 0.08)',
    tint: 'rgba(0, 74, 171, 0.14)'
  },
  {
    id: 'teal',
    name: '青绿',
    primary: '#0F766E',
    gradFrom: '#0D9488',
    gradTo: '#0F766E',
    soft: 'rgba(15, 118, 110, 0.08)',
    tint: 'rgba(15, 118, 110, 0.14)'
  },
  {
    id: 'purple',
    name: '紫罗兰',
    primary: '#6D28D9',
    gradFrom: '#8B5CF6',
    gradTo: '#6D28D9',
    soft: 'rgba(109, 40, 217, 0.08)',
    tint: 'rgba(109, 40, 217, 0.14)'
  },
  {
    id: 'orange',
    name: '活力橙',
    primary: '#EA580C',
    gradFrom: '#F97316',
    gradTo: '#EA580C',
    soft: 'rgba(234, 88, 12, 0.08)',
    tint: 'rgba(234, 88, 12, 0.14)'
  },
  {
    id: 'rose',
    name: '玫红',
    primary: '#BE123C',
    gradFrom: '#F43F5E',
    gradTo: '#BE123C',
    soft: 'rgba(190, 18, 60, 0.08)',
    tint: 'rgba(190, 18, 60, 0.14)'
  }
]

const THEME_KEY = 'jm_theme'
const TAB_PAGES = ['course', 'workbench', 'mine']

export function getThemeId() {
  try {
    return uni.getStorageSync(THEME_KEY) || 'blue'
  } catch (e) {
    return 'blue'
  }
}

export function getTheme(id) {
  const themeId = id || getThemeId()
  return THEMES.find((t) => t.id === themeId) || THEMES[0]
}

export function setTheme(id) {
  try {
    uni.setStorageSync(THEME_KEY, id)
  } catch (e) { /* 忽略 */ }
}

/** 页面根节点的 CSS 变量，配合 style 里的 var(--brand) 使用 */
export function themeVars(theme) {
  return {
    '--brand': theme.primary,
    '--brand-grad-from': theme.gradFrom,
    '--brand-grad-to': theme.gradTo,
    '--brand-soft': theme.soft,
    '--brand-tint': theme.tint,
    '--ink': '#172033',
    '--muted': '#7c879d',
    '--line': '#e9edf6',
    '--page-bg': '#f4f6fb',
    '--shadow-card': '0 12rpx 30rpx rgba(23, 32, 51, 0.06)',
    '--shadow-float': '0 10rpx 24rpx rgba(23, 32, 51, 0.10)'
  }
}

/** 顶部导航栏跟随主题（每个页面 onShow 调用一次） */
export function applyNavTheme(theme) {
  uni.setNavigationBarColor({
    frontColor: '#ffffff',
    backgroundColor: theme.gradTo
  })
}

/** 自绘头部页面：状态栏图标用白色（仅 App 端需要） */
export function applyStatusBarLight() {
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.navigator) {
    plus.navigator.setStatusBarStyle('light')
  }
  // #endif
}

/** 底部 Tab 文字颜色与选中图标跟随主题 */
export function applyTabTheme(theme) {
  uni.setTabBarStyle({
    color: '#9CA3AF',
    selectedColor: theme.primary,
    backgroundColor: '#FFFFFF',
    borderStyle: 'black'
  })
  TAB_PAGES.forEach((name, index) => {
    uni.setTabBarItem({
      index,
      selectedIconPath: '/static/tabbar/' + name + '-' + theme.id + '.png'
    })
  })
}
