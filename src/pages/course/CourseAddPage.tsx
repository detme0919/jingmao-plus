import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Dialog, Input, Picker, TextArea, Toast } from 'antd-mobile'
import SubPage from '@/components/SubPage'
import { storeApi } from '@/api/store'
import { expandWeeksClient } from '@/pages/home/expand-weeks'
import type { ManualCourse } from '@/types'

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const PERIODS = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节']

/** 手动添加课程（保存在本机，可删除） */
export default function CourseAddPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [dayIdx, setDayIdx] = useState(0)
  const [periodIdx, setPeriodIdx] = useState(0)
  const [room, setRoom] = useState('')
  const [teacher, setTeacher] = useState('')
  const [weeksText, setWeeksText] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) {
      Toast.show({ content: '请输入课程名称' })
      return
    }
    const item: ManualCourse = {
      id: 'm' + Date.now() + Math.floor(Math.random() * 1000),
      name: name.trim(),
      day: DAYS[dayIdx],
      period: PERIODS[periodIdx],
      room: room.trim(),
      teacher: teacher.trim(),
      weeksText: weeksText.trim(),
      weeks: weeksText.trim() ? expandWeeksClient(weeksText) : []
    }
    setSaving(true)
    try {
      const list = (await storeApi.getManualCourses()) ?? []
      await storeApi.setManualCourses([...list, item])
      Toast.show({ content: '已添加' })
      setTimeout(() => navigate(-1), 500)
    } catch (e) {
      Toast.show({ content: String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SubPage title="手动加课">
      <div className="app-card" style={{ padding: 20 }}>
        <div className="jm-field-label">课程名称</div>
        <Input value={name} onChange={setName} placeholder="如 体育" maxLength={20} clearable />
        <div className="jm-field-label" style={{ marginTop: 16 }}>
          星期
        </div>
        <Picker
          columns={[DAYS]}
          value={[DAYS[dayIdx]]}
          onConfirm={(v) => setDayIdx(DAYS.indexOf(String(v[0])))}
        >
          {(_, actions) => (
            <div className="jm-picker-value" onClick={() => actions.open()}>
              {DAYS[dayIdx]}
            </div>
          )}
        </Picker>
        <div className="jm-field-label" style={{ marginTop: 16 }}>
          节次
        </div>
        <Picker
          columns={[PERIODS]}
          value={[PERIODS[periodIdx]]}
          onConfirm={(v) => setPeriodIdx(PERIODS.indexOf(String(v[0])))}
        >
          {(_, actions) => (
            <div className="jm-picker-value" onClick={() => actions.open()}>
              {PERIODS[periodIdx]}
            </div>
          )}
        </Picker>
        <div className="jm-field-label" style={{ marginTop: 16 }}>
          地点（选填）
        </div>
        <Input value={room} onChange={setRoom} placeholder="如 5603" maxLength={20} clearable />
        <div className="jm-field-label" style={{ marginTop: 16 }}>
          教师（选填）
        </div>
        <Input value={teacher} onChange={setTeacher} placeholder="教师姓名" maxLength={10} clearable />
        <div className="jm-field-label" style={{ marginTop: 16 }}>
          周次（选填）
        </div>
        <TextArea
          value={weeksText}
          onChange={setWeeksText}
          placeholder="如 1-16周 或 7,12,17周；留空表示每周都有"
          maxLength={30}
          rows={2}
        />
        <Button block color="primary" size="large" style={{ marginTop: 24 }} loading={saving} onClick={submit}>
          添加课程
        </Button>
        <Button
          block
          color="default"
          size="large"
          style={{ marginTop: 10 }}
          onClick={async () => {
            const list = (await storeApi.getManualCourses()) ?? []
            if (!list.length) {
              Toast.show({ content: '还没有手动添加的课程' })
              return
            }
            const r = await Dialog.confirm({
              title: '清空手动课程',
              content: `共 ${list.length} 门，确定全部删除？`,
              confirmText: '清空'
            })
            if (r) {
              await storeApi.setManualCourses([])
              Toast.show({ content: '已清空' })
            }
          }}
        >
          管理已添加课程
        </Button>
      </div>
    </SubPage>
  )
}
