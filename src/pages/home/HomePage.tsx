import { Button, Card } from 'antd-mobile'
import PageShell from '@/components/PageShell'

export default function HomePage() {
  return (
    <PageShell kicker="TIMETABLE" title="课程表" subtitle="绑定班级后自动加载每周课表">
      <Card className="jm-card">
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: 40 }}>🗓️</div>
          <div style={{ marginTop: 12, fontWeight: 600 }}>课表重构中</div>
          <div style={{ marginTop: 6, color: 'var(--jm-ink-2)', fontSize: 13 }}>
            Tauri + Rust 核心完成后接入班级课表查询
          </div>
          <Button color="primary" style={{ marginTop: 16 }}>
            选择班级并导入
          </Button>
        </div>
      </Card>
    </PageShell>
  )
}
