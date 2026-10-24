import { List } from 'antd-mobile'
import PageShell from '@/components/PageShell'

export default function ToolkitPage() {
  return (
    <PageShell kicker="TOOLKIT" title="工具箱" subtitle="把校园里常用的事集中在一个入口">
      <List className="jm-card-list">
        <List.Item description="查看记录，发起离校申请">出校登记</List.Item>
        <List.Item description="打卡与签到记录">打卡考勤</List.Item>
      </List>
    </PageShell>
  )
}
