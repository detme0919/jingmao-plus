interface IconProps {
  size?: number
  color?: string
}

function base(size: number, color: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }
}

/** 三 Tab 的线性图标（自绘 SVG，避免额外图标库依赖） */
export function CalendarIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      <path d="M7.5 13.5h3M7.5 17h6" />
    </svg>
  )
}

export function GridIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </svg>
  )
}

export function UserIcon({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, color)}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c1.2-3.4 3.9-5.2 7.2-5.2s6 1.8 7.2 5.2" />
    </svg>
  )
}
