import { Component, type ReactNode } from 'react'

/** 临时调试边界：渲染错误直接显示在屏幕上（定位真机白屏用，随后移除） */
export default class DebugBoundary extends Component<{ children: ReactNode }, { err: string }> {
  state = { err: '' }
  static getDerivedStateFromError(e: unknown) {
    return { err: String((e as Error)?.stack || e) }
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 16, fontSize: 12, color: '#e5484d', whiteSpace: 'pre-wrap' }}>
          {this.state.err.slice(0, 1200)}
        </div>
      )
    }
    return this.props.children
  }
}
