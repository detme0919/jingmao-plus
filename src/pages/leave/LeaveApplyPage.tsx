import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, DatePicker, Dialog, Picker, TextArea, Toast } from 'antd-mobile'
import SubPage from '@/components/SubPage'
import { api } from '@/api'
import type { LeaveConfig } from '@/types'
import { TRAFFIC_WAYS } from '@/pages/leave/LeaveListPage'

const pad = (n: number) => String(n).padStart(2, '0')
const dayStr = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
/** 当前时刻的分钟数（0-1439） */
const nowMinutes = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}
/** 分钟数 → "HH:mm" */
const hm = (mins: number) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`

/** 离校申请：时间校验 + 提交（提交是真实操作，需用户明确确认） */
export default function LeaveApplyPage() {
  const navigate = useNavigate()
  const [config, setConfig] = useState<LeaveConfig | null>(null)
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [reason, setReason] = useState('')
  const [destination, setDestination] = useState('')
  const [trafficIdx, setTrafficIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api
      .leaveConfig()
      .then((conf) => {
        setConfig(conf)
        const outMin = toMinutes(conf.outSchoolTime)
        const inMin = toMinutes(conf.inSchoolTime)
        // 默认离校时间至少是「下一分钟」：当前分钟提交时已经过去，学校会拒绝
        let startMin = Math.max(nowMinutes() + 1, outMin)
        startMin = Math.min(startMin, 23 * 60 + 59)
        const canTomorrow = (conf.advanceDays || 0) >= 1
        const useTomorrow = canTomorrow && startMin + 60 > inMin
        setDate(dayStr(useTomorrow ? 1 : 0))
        setStartTime(useTomorrow ? conf.outSchoolTime : hm(startMin))
        setEndTime(conf.inSchoolTime)
      })
      .catch((e) => {
        Toast.show({ content: String(e) })
        setDate(dayStr(0))
        setStartTime(hm(Math.min(nowMinutes() + 1, 23 * 60 + 59)))
        setEndTime('22:00')
      })
  }, [])

  const validate = (): string => {
    if (!date || !startTime || !endTime) return '请选择完整的离校和返校时间'
    if (endTime <= startTime) return '返校时间必须晚于离校时间'
    const start = new Date(`${date} ${startTime}`.replace(/-/g, '/')).getTime()
    const end = new Date(`${date} ${endTime}`.replace(/-/g, '/')).getTime()
    if (end - start < 3600000) return '离校、返校时间需相差一个小时以上'
    if (date === dayStr(0) && toMinutes(startTime) <= nowMinutes()) {
      return '离校时间需晚于当前时间，请选择下一分钟或更晚'
    }
    if (config && startTime < config.outSchoolTime) return `最早 ${config.outSchoolTime} 后可离校`
    if (config && endTime > config.inSchoolTime) return `最晚 ${config.inSchoolTime} 前需返校`
    if (!reason.trim()) return '请输入外出事由'
    if (reason.trim().length > 30) return '外出事由最多 30 字'
    if (!destination.trim()) return '请输入目的地'
    if (destination.trim().length > 20) return '目的地最多 20 字'
    return ''
  }

  const submit = async () => {
    if (submitting) return
    const err = validate()
    if (err) {
      Toast.show({ content: err, duration: 2200 })
      return
    }
    const r = await Dialog.confirm({
      title: '确认提交',
      content: (
        <div>
          离校：{date} {startTime}
          <br />
          返校：{date} {endTime}
          <br />
          交通：{TRAFFIC_WAYS[trafficIdx]}
        </div>
      ),
      confirmText: '提交',
      cancelText: '再看看'
    })
    if (!r) return
    setSubmitting(true)
    try {
      await api.leaveSubmit({
        beginTime: `${date} ${startTime}:00`,
        endTime: `${date} ${endTime}:00`,
        reason: reason.trim(),
        trafficWay: String(trafficIdx + 1),
        destination: destination.trim()
      })
      Toast.show({ content: '提交成功' })
      setTimeout(() => navigate(-1), 900)
    } catch (e) {
      Dialog.alert({ title: '提交失败', content: String(e), })
    } finally {
      setSubmitting(false)
    }
  }

  // 小时 / 分钟两列，可选到任意一分钟（不再限制 15 分钟一档）
  const hourCol = useMemo(() => Array.from({ length: 24 }, (_, h) => pad(h)), [])
  const minuteCol = useMemo(() => Array.from({ length: 60 }, (_, m) => pad(m)), [])

  return (
    <SubPage title="离校申请">
      <div className="jm-config-tip">
        🕐 每日 {config?.outSchoolTime ?? '--:--'} - {config?.inSchoolTime ?? '--:--'}
        可出入校，离校与返校时间需相差 1 小时以上
      </div>

      <div className="app-card" style={{ padding: 20 }}>
        <div className="jm-field-label">离校日期</div>
        <DatePicker
          value={date ? new Date(date) : undefined}
          min={new Date()}
          max={new Date(Date.now() + 7 * 86400000)}
          onConfirm={(v) => {
            const picked = dayStr(Math.round((v.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000))
            setDate(picked)
            // 切回今天时，若原离校时间已过，自动顺延到下一分钟
            if (picked === dayStr(0)) {
              const minStart = Math.min(23 * 60 + 59, Math.max(nowMinutes() + 1, config ? toMinutes(config.outSchoolTime) : 0))
              if (toMinutes(startTime) <= nowMinutes() || startTime < (config?.outSchoolTime ?? '00:00')) {
                setStartTime(hm(minStart))
              }
            }
          }}
        >
          {(item, actions) => (
            <div className="jm-picker-value" onClick={() => actions.open()}>
              {item
                ? `${item.getFullYear()}-${String(item.getMonth() + 1).padStart(2, '0')}-${String(item.getDate()).padStart(2, '0')}`
                : (date || '选择日期')}
            </div>
          )}
        </DatePicker>

        <div className="jm-time-row">
          <div style={{ flex: 1 }}>
            <div className="jm-field-label">离校时间</div>
            <Picker
              columns={[hourCol, minuteCol]}
              value={(startTime || '00:00').split(':')}
              onConfirm={(v) => setStartTime(`${v[0]}:${v[1]}`)}
            >
              {(_, actions) => (
                <div className="jm-picker-value" onClick={() => actions.open()}>
                  {startTime || '--:--'}
                </div>
              )}
            </Picker>
          </div>
          <div style={{ flex: 1 }}>
            <div className="jm-field-label">返校时间</div>
            <Picker
              columns={[hourCol, minuteCol]}
              value={(endTime || '00:00').split(':')}
              onConfirm={(v) => setEndTime(`${v[0]}:${v[1]}`)}
            >
              {(_, actions) => (
                <div className="jm-picker-value" onClick={() => actions.open()}>
                  {endTime || '--:--'}
                </div>
              )}
            </Picker>
          </div>
        </div>

        <div className="jm-field-label" style={{ marginTop: 16 }}>
          交通方式
        </div>
        <Picker
          columns={[TRAFFIC_WAYS]}
          value={[TRAFFIC_WAYS[trafficIdx]]}
          onConfirm={(v) => setTrafficIdx(TRAFFIC_WAYS.indexOf(String(v[0])))}
        >
          {(_, actions) => (
            <div className="jm-picker-value" onClick={() => actions.open()}>
              {TRAFFIC_WAYS[trafficIdx]}
            </div>
          )}
        </Picker>

        <div className="jm-field-label" style={{ marginTop: 16 }}>
          目的地
        </div>
        <input
          className="jm-input"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="请输入目的地"
          maxLength={20}
        />
        <div className="jm-counter">{destination.length}/20</div>

        <div className="jm-field-label" style={{ marginTop: 8 }}>
          外出事由
        </div>
        <TextArea value={reason} onChange={setReason} placeholder="请简述外出事由" maxLength={30} rows={3} />
        <div className="jm-counter">{reason.length}/30</div>

        <Button block color="primary" size="large" style={{ marginTop: 20 }} loading={submitting} onClick={submit}>
          提交申请
        </Button>
      </div>
    </SubPage>
  )
}
