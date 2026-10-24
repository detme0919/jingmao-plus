import PageShell from '@/components/PageShell'

export default function ProfilePage() {
  return (
    <PageShell kicker="MY" title="我的" subtitle="登录状态、外观与数据管理">
      <div className="app-card" style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 40 }}>👤</div>
        <div style={{ marginTop: 12, fontWeight: 600 }}>未登录</div>
        <div style={{ marginTop: 6, color: 'var(--jm-ink-2)', fontSize: 13 }}>
          骨架占位 · M3 接入统一认证登录
        </div>
      </div>
    </PageShell>
  )
}
