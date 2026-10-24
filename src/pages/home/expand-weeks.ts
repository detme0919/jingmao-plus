/** 展开 "3-5,9-19周" / "7,12,17周"（与 Rust 侧一致；mock/手动课程用） */
export function expandWeeksClient(text: string): number[] {
  const weeks: number[] = []
  const ranges = String(text || '').match(/\d+\s*-\s*\d+|\d+/g) || []
  for (const item of ranges) {
    if (item.includes('-')) {
      const [a, b] = item.split('-').map((n) => parseInt(n, 10))
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      for (let w = lo; w <= hi; w++) weeks.push(w)
    } else {
      weeks.push(parseInt(item, 10))
    }
  }
  return [...new Set(weeks)].filter((w) => w > 0).sort((a, b) => a - b)
}
