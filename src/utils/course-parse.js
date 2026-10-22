// 班级课表页面解析（纯函数，便于单测）
// 页面：http://weixin.henetc.edu.cn/student/bjkbcx.aspx?wxid=<openid>&type=student
// 结构：[班级] [星期一] <table> 节次 | 课程【周次；地点】 | 教师 </table> ...

export const COURSE_HOST = 'weixin.henetc.edu.cn'

/** 从公众号课表链接里提取 wxid 和地址（兜底导入用） */
export function parseCourseLink(text) {
  const raw = String(text || '').trim()
  if (!raw) return { ok: false, msg: '没有可识别的内容' }
  const m = raw.match(/https?:\/\/weixin\.henetc\.edu\.cn\/student\/bjkbcx\.aspx\?[^\s"'<>，。；]+/i)
  if (!m) return { ok: false, msg: '不是课表查询链接' }
  const url = m[0]
  const wxidMatch = url.match(/[?&]wxid=([^&#]+)/i)
  if (!wxidMatch) return { ok: false, msg: '链接中缺少 wxid 参数' }
  return { ok: true, url, wxid: wxidMatch[1], savedAt: Date.now() }
}

/** 展开 "3-5,9-19周" / "7,12,17周" 这样的周次描述 */
export function expandWeeks(text) {
  const weeks = []
  const src = String(text || '')
  const ranges = src.match(/\d+\s*-\s*\d+|\d+/g) || []
  ranges.forEach((item) => {
    if (item.includes('-')) {
      const [a, b] = item.split('-').map((n) => parseInt(n, 10))
      for (let w = Math.min(a, b); w <= Math.max(a, b); w++) weeks.push(w)
    } else {
      weeks.push(parseInt(item, 10))
    }
  })
  return [...new Set(weeks)].sort((a, b) => a - b)
}

function textOf(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCourseText(text) {
  const raw = textOf(text)
  if (!raw) return null
  const m = raw.match(/^(.*?)【(.*?)】\s*$/)
  if (!m) {
    return { name: raw, weeksText: '', weeks: [], room: '', raw }
  }
  const name = m[1].trim()
  const inner = m[2].trim()
  const parts = inner.split('；')
  const weeksText = (parts[0] || '').trim()
  const room = (parts[1] || '').trim()
  return { name, weeksText, weeks: expandWeeks(weeksText), room, raw }
}

/** 解析课表 HTML，返回 { className, days: [{ label, name, courses }] } */
export function parseCourseHtml(html) {
  const src = String(html || '')

  // 班级：优先取 ddl_bj 里选中的 option
  let className = ''
  const bjSelect = src.match(/<select[^>]*id="ddl_bj"[\s\S]*?<\/select>/i)
  if (bjSelect) {
    const selected = bjSelect[0].match(/<option[^>]*selected[^>]*>([^<]*)<\/option>/i)
    if (selected) className = textOf(selected[1])
  }
  if (!className) {
    const bracket = src.match(/\[([^\]]+)\]\s*\[星期/)
    if (bracket) className = bracket[1].trim()
  }

  const dayOrder = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
  const days = []
  const tableRe = /<table[\s\S]*?<\/table>/gi
  let match
  while ((match = tableRe.exec(src))) {
    const table = match[0]
    const before = textOf(src.slice(Math.max(0, match.index - 500), match.index))
    const dayMatch = before.match(/\[(星期[一二三四五六日天])\]/)
    if (!dayMatch) continue
    const dayName = dayMatch[1]
    const label = '周' + dayName.slice(2)

    const courses = []
    const rowRe = /<tr[\s\S]*?<\/tr>/gi
    let rowMatch
    while ((rowMatch = rowRe.exec(table))) {
      const row = rowMatch[0]
      const cellRe = /<td[\s\S]*?<\/td>/gi
      const cells = []
      let cellMatch
      while ((cellMatch = cellRe.exec(row))) cells.push(cellMatch[0])
      if (cells.length < 2) continue

      const period = textOf(cells[0]).replace(/\s+/g, '')
      const teacher = cells.length > 2 ? textOf(cells[2]) : ''
      // 一个格子里可能有多门课（用 <br> 分隔）
      const lines = String(cells[1]).split(/<br\s*\/?>/i)
      lines.forEach((line) => {
        const parsed = parseCourseText(line)
        if (!parsed || !parsed.name) return
        courses.push({ period, teacher, ...parsed })
      })
    }

    days.push({ name: dayName, label, order: dayOrder[dayName.slice(2)] || 9, courses })
  }

  days.sort((a, b) => a.order - b.order)
  return { className, days }
}

/** 按周筛选某一天的课程；“全部”时 week 传 0 */
export function coursesForWeek(courses, week) {
  if (!week) return courses
  return courses.filter((c) => !c.weeks.length || c.weeks.includes(week))
}
