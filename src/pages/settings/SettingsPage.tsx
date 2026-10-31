import { useNavigate } from 'react-router-dom'
import { List } from 'antd-mobile'
import SubPage from '@/components/SubPage'

/** 设置（二级页）：数据管理入口 */
export default function SettingsPage() {
  const navigate = useNavigate()
  return (
    <SubPage title="设置">
      <List style={{ borderRadius: 'var(--jm-radius-card)', overflow: 'hidden' }}>
        <List.Item
          prefix="🗂️"
          description="圆环查看本机数据占用，勾选并一键清理"
          arrow
          clickable
          onClick={() => navigate('/settings/data')}
        >
          数据管理
        </List.Item>
      </List>
    </SubPage>
  )
}
