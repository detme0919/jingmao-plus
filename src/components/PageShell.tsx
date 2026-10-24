import type { ReactNode } from 'react'

interface PageShellProps {
  kicker?: string
  title: string
  subtitle?: string
  children?: ReactNode
}

/** 新版页面骨架：轻量标题区（不再用大面积渐变头）+ 内容区 */
export default function PageShell({ kicker, title, subtitle, children }: PageShellProps) {
  return (
    <div className="app-page">
      <header className="jm-header">
        {kicker ? <div className="jm-header-kicker">{kicker}</div> : null}
        <h1 className="jm-header-title">{title}</h1>
        {subtitle ? <div className="jm-header-sub">{subtitle}</div> : null}
      </header>
      <main className="jm-page-body">{children}</main>
    </div>
  )
}
