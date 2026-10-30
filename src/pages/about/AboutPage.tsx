import { useEffect, useState } from 'react'
import SubPage from '@/components/SubPage'
import { api } from '@/api'

/** 关于经贸+ */
export default function AboutPage() {
  const [version, setVersion] = useState('…')

  useEffect(() => {
    api
      .appInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion('1.0.2'))
  }, [])

  return (
    <SubPage title="关于经贸+">
      <div className="app-card" style={{ textAlign: 'center', padding: 28 }}>
        <img src="/school-logo.png" alt="经贸+" style={{ width: 72, height: 72, borderRadius: 18 }} />
        <div style={{ marginTop: 12, fontWeight: 700, fontSize: 18 }}>经贸+</div>
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--jm-ink-2)' }}>
          河南经贸职业学院 · 个人校园工具 v{version}
        </div>
      </div>

      <div className="app-card" style={{ marginTop: 12, padding: 20, fontSize: 13, lineHeight: 1.9, color: 'var(--jm-ink-2)' }}>
        <div style={{ fontWeight: 600, color: 'var(--jm-ink)', marginBottom: 6 }}>使用说明</div>
        <p style={{ margin: '0 0 8px' }}>
          · 本应用为个人开发的开源工具，非学校官方应用；与学校无隶属关系。
        </p>
        <p style={{ margin: '0 0 8px' }}>
          · 课程表数据来自学校公众号课表查询页；出校登记、打卡考勤需要你本人登录学校统一认证 / 考勤系统。
        </p>
        <p style={{ margin: '0 0 8px' }}>
          · 发起离校申请、打卡均为真实操作，提交后以学校系统记录为准。
        </p>
        <p style={{ margin: 0 }}>
          · 考勤密码仅在你主动勾选「记住密码」时保存在本机应用私有目录（不加密，注意共用设备风险）。
        </p>
      </div>
    </SubPage>
  )
}
