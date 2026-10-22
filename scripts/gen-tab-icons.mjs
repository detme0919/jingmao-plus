// 生成底部 Tab 图标（96x96 RGBA PNG，3 倍超采样抗锯齿）
// 用法：node scripts/gen-tab-icons.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { THEMES } from '../src/utils/theme.js'

const SIZE = 96
const SS = 3 // 超采样倍数
const N = SIZE * SS

const NORMAL_COLOR = '#9CA3AF'

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ]
}

// ---------- 形状（返回该点是否在形状内） ----------
function inRoundRect(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx) - (w / 2 - r)
  const dy = Math.abs(y - cy) - (h / 2 - r)
  const ox = Math.max(dx, 0)
  const oy = Math.max(dy, 0)
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0) - r <= 0
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function inRoundRectStroke(x, y, cx, cy, w, h, r, stroke) {
  const outer = inRoundRect(x, y, cx, cy, w, h, r)
  if (!outer) return false
  const inner = inRoundRect(x, y, cx, cy, w - stroke * 2, h - stroke * 2, Math.max(r - stroke, 1))
  return !inner
}

// ---------- 三个图标 ----------
function iconCourse(x, y) {
  // 日历：外框 + 顶部横条 + 两个挂环 + 两个日期点
  const frame = inRoundRectStroke(x, y, 48, 52, 60, 52, 10, 6)
  const divider = inRoundRect(x, y, 48, 42, 60, 6, 3)
  const ring1 = inRoundRect(x, y, 34, 26, 8, 16, 4)
  const ring2 = inRoundRect(x, y, 62, 26, 8, 16, 4)
  const dot1 = inCircle(x, y, 38, 64, 4.5)
  const dot2 = inCircle(x, y, 58, 64, 4.5)
  return frame || divider || ring1 || ring2 || dot1 || dot2
}

function iconWorkbench(x, y) {
  // 宫格：四个圆角方块
  return (
    inRoundRect(x, y, 35, 35, 24, 24, 7) ||
    inRoundRect(x, y, 61, 35, 24, 24, 7) ||
    inRoundRect(x, y, 35, 61, 24, 24, 7) ||
    inRoundRect(x, y, 61, 61, 24, 24, 7)
  )
}

function iconMine(x, y) {
  // 人像：头 + 肩
  const head = inCircle(x, y, 48, 33, 15)
  const body = inRoundRect(x, y, 48, 74, 50, 34, 17)
  return head || body
}

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

/** 以 3 倍超采样渲染一个图标 */
function renderIcon(shapeFn, hexColor) {
  const [r, g, b] = hexToRgb(hexColor)
  const out = Buffer.alloc(SIZE * SIZE * 4)

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let hit = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px * SS + sx + 0.5) / SS
          const y = (py * SS + sy + 0.5) / SS
          if (shapeFn(x, y)) hit++
        }
      }
      const alpha = Math.round((hit / (SS * SS)) * 255)
      const i = (py * SIZE + px) * 4
      out[i] = r
      out[i + 1] = g
      out[i + 2] = b
      out[i + 3] = alpha
    }
  }
  return encodePng(SIZE, SIZE, out)
}

const outDir = path.join(process.cwd(), 'src', 'static', 'tabbar')
fs.mkdirSync(outDir, { recursive: true })

const icons = [
  ['course', iconCourse],
  ['workbench', iconWorkbench],
  ['mine', iconMine]
]

for (const [name, fn] of icons) {
  // 未选中：统一灰色
  const normalFile = path.join(outDir, `${name}.png`)
  fs.writeFileSync(normalFile, renderIcon(fn, NORMAL_COLOR))
  console.log('written', normalFile)

  // 选中：每个主题一套，供运行时 setTabBarItem 切换
  for (const theme of THEMES) {
    const file = path.join(outDir, `${name}-${theme.id}.png`)
    fs.writeFileSync(file, renderIcon(fn, theme.primary))
    console.log('written', file)
  }
}
