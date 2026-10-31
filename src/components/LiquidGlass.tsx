import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * 液态玻璃容器（Apple Liquid Glass 风格的悬浮底栏外壳）。
 *
 * 技术取自开源实现（MIT）：vitrio 的圆角矩形 SDF 光学位移模型 + rdev/liquid-glass-react
 * 的 backdrop-filter: url(#svg) 实时折射思路。与 vitrio 的"克隆背景"模式不同，
 * 这里用 Chromium 支持的 SVG 滤镜 backdrop 折射——底栏悬浮在滚动内容上也能实时折射真实像素。
 *
 * 三层结构：磨砂层（blur+saturate）→ 折射层（边缘位移）→ 高光描边层 → 内容。
 * WebView 不支持位移滤镜时仅失去边缘折射，磨砂玻璃仍然生效（优雅降级）。
 */

/** 圆角矩形 SDF + 边缘厚度剖面生成位移图：R/G 通道编码像素位移（128=0） */
function buildDisplacementMap(
  w: number,
  h: number,
  radius: number,
  depth: number,
  scale: number
): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(2, Math.round(w))
  canvas.height = Math.max(2, Math.round(h))
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const W = canvas.width
  const H = canvas.height
  const img = ctx.createImageData(W, H)
  const hw = W / 2
  const hh = H / 2
  const r = Math.min(radius, hw, hh)
  const k = 2.2 // 曲线指数：≈2 球面，≈4 方圆
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const px = x + 0.5 - hw
      const py = y + 0.5 - hh
      const qx = Math.abs(px) - (hw - r)
      const qy = Math.abs(py) - (hh - r)
      const d =
        Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
      if (d >= 0 || -d >= depth) {
        img.data[i] = 128
        img.data[i + 1] = 128
        img.data[i + 3] = 255
        continue
      }
      const dist = -d
      const t = 1 - dist / depth
      const profile = Math.pow(1 - Math.pow(1 - t, k), 1 / k)
      const disp = scale * profile
      // SDF 梯度（指向外）：平边取轴向，圆角取径向
      let nx = 0
      let ny = 0
      if (qx > qy && qx > 0) nx = px >= 0 ? 1 : -1
      else if (qy >= qx && qy > 0) ny = py >= 0 ? 1 : -1
      else {
        const len = Math.hypot(px, py) || 1
        nx = px / len
        ny = py / len
      }
      // 凸面：位移指向内（放大）
      const dx = -nx * disp
      const dy = -ny * disp
      img.data[i] = Math.max(0, Math.min(255, Math.round(dx + 128)))
      img.data[i + 1] = Math.max(0, Math.min(255, Math.round(dy + 128)))
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

interface LiquidGlassProps {
  visible?: boolean
  /** 定位与尺寸（如 lg-tabbar / leave-actions），玻璃层通用 */
  className?: string
  children: ReactNode
}

/** 液态玻璃容器：磨砂 + 边缘折射 + 高光三层，任意悬浮面板可复用 */
export default function LiquidGlass({ visible = true, className = '', children }: LiquidGlassProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [filterId] = useState(() => `jm-lg-${Math.random().toString(36).slice(2, 8)}`)
  const [mapUri, setMapUri] = useState('')

  // 按容器实际尺寸生成位移图（尺寸变化时重建）
  useEffect(() => {
    const el = ref.current
    if (!el || !visible) return
    let raf = 0
    const rebuild = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        if (rect.width < 8 || rect.height < 8) return
        const br = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
        // 位移：边缘 10px 内向折射，bezel 14px
        const uri = buildDisplacementMap(rect.width, rect.height, br, 14, 10)
        setMapUri(uri)
      })
    }
    rebuild()
    const ro = new ResizeObserver(rebuild)
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [visible])

  return (
    <>
      {mapUri ? (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
          <defs>
            <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feImage href={mapUri} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="1" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
      ) : null}
      <div
        ref={ref}
        className={`lg-bar ${className}`}
        style={{ display: visible ? undefined : 'none' } as CSSProperties}
      >
        <div className="lg-layer lg-blur" />
        {mapUri ? (
          <div className="lg-layer lg-refract" style={{ backdropFilter: `url(#${filterId})`, WebkitBackdropFilter: `url(#${filterId})` }} />
        ) : null}
        <div className="lg-layer lg-specular" />
        <div className="lg-content">{children}</div>
      </div>
    </>
  )
}
