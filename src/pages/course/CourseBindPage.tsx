import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Picker, Toast } from 'antd-mobile'
import SubPage from '@/components/SubPage'
import { api } from '@/api'
import { storeApi, type CourseSelection } from '@/api/store'
import type { OptionItem } from '@/types'

/** 选择班级：院系 → 班级 两级选择（WebForms 回传在 Rust 侧完成） */
export default function CourseBindPage() {
  const navigate = useNavigate()
  const [colleges, setColleges] = useState<OptionItem[]>([])
  const [classes, setClasses] = useState<OptionItem[]>([])
  const [collegeIdx, setCollegeIdx] = useState<number | null>(null)
  const [classIdx, setClassIdx] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingCls, setLoadingCls] = useState(false)

  if (colleges.length === 0 && !loading) {
    setLoading(true)
    api
      .courseColleges()
      .then(setColleges)
      .catch((e) => Toast.show({ content: String(e) }))
      .finally(() => setLoading(false))
  }

  const pickCollege = async (value: string[] | null) => {
    if (!value) return
    const idx = colleges.findIndex((c) => c.value === value[0])
    setCollegeIdx(idx)
    setClassIdx(null)
    setClasses([])
    setLoadingCls(true)
    try {
      setClasses(await api.courseClasses(colleges[idx].value))
    } catch (e) {
      Toast.show({ content: String(e) })
    } finally {
      setLoadingCls(false)
    }
  }

  const submit = async () => {
    if (collegeIdx === null || classIdx === null) return
    const sel: CourseSelection = {
      collegeValue: colleges[collegeIdx].value,
      collegeName: colleges[collegeIdx].label,
      classValue: classes[classIdx].value,
      className: classes[classIdx].label,
      savedAt: Date.now()
    }
    await storeApi.setCourseSelection(sel)
    await storeApi.clearCourseAuth()
    await storeApi.clearCourseCache()
    Toast.show({ content: `已绑定 ${sel.className}` })
    setTimeout(() => navigate('/', { replace: true }), 500)
  }

  return (
    <SubPage title="选择班级">
      <div className="app-card" style={{ padding: 20 }}>
        <div className="jm-field-label">院系</div>
        <Picker
          columns={[colleges.map((c) => ({ label: c.label, value: c.value }))]}
          onConfirm={(val) => pickCollege(val.map(String))}
          value={collegeIdx !== null ? [colleges[collegeIdx].value] : undefined}
        >
          {(items) =>
            items[0] ? (
              <div className="jm-picker-value">{items[0].label}</div>
            ) : (
              <div className="jm-picker-value jm-picker-value--empty">
                {loading ? '加载院系中…' : '点击选择院系'}
              </div>
            )
          }
        </Picker>

        <div className="jm-field-label" style={{ marginTop: 16 }}>
          班级
        </div>
        <Picker
          columns={[classes.map((c) => ({ label: c.label, value: c.value }))]}
          onConfirm={(val) => setClassIdx(classes.findIndex((c) => c.value === String(val[0])))}
          value={classIdx !== null ? [classes[classIdx].value] : undefined}
        >
          {(items) =>
            items[0] ? (
              <div className="jm-picker-value">{items[0].label}</div>
            ) : (
              <div className="jm-picker-value jm-picker-value--empty">
                {collegeIdx === null ? '请先选择院系' : loadingCls ? '加载班级中…' : '点击选择班级'}
              </div>
            )
          }
        </Picker>

        <Button
          block
          color="primary"
          size="large"
          style={{ marginTop: 24 }}
          disabled={collegeIdx === null || classIdx === null}
          onClick={submit}
        >
          导入课表
        </Button>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--jm-ink-3)', textAlign: 'center' }}>
          数据来自学校公众号课表查询页，仅保存在本机。
        </div>
      </div>
    </SubPage>
  )
}
