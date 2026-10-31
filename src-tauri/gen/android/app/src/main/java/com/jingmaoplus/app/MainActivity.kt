package com.jingmaoplus.app

import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var injectedInsetTop = -1
  private var injectedInsetBottom = -1

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // wry 默认 edge-to-edge；顶部给内容容器加系统栏 inset，保证 WebView
    // 不与状态栏/摄像头区域重叠。底部不避让：WebView 延伸到手势条（小白条）
    // 后面，导航栏透明，玻璃底栏悬浮其上；安全区数值注入 WebView 的
    // --inset-bottom 变量，由页面内 CSS 消费（不依赖 WebView 的 env() 支持）
    window.attributes.layoutInDisplayCutoutMode =
      WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    window.decorView.setBackgroundColor(Color.parseColor("#F5F6F8"))
    window.navigationBarColor = Color.TRANSPARENT
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.isAppearanceLightStatusBars = true
    controller.isAppearanceLightNavigationBars = true
    val content = findViewById<ViewGroup>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.navigationBars()
      )
      // 上下完全交给页面（CSS 变量消费），仅左右保留避让（横屏挖孔）
      v.setPadding(bars.left, 0, bars.right, 0)
      injectSafeArea(bars.top, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    // WebView 由 Rust 侧异步创建且页面可能整页重载（如统一认证登录返回），
    // 定时补注入；注入同时写入 localStorage，页面侧启动时恢复
    for (delay in longArrayOf(400, 1200, 2500, 5000)) {
      window.decorView.postDelayed({ injectSafeArea(0, 0) }, delay)
    }
  }

  private fun findWebView(vg: ViewGroup): WebView? {
    for (i in 0 until vg.childCount) {
      val c = vg.getChildAt(i)
      if (c is WebView) return c
      if (c is ViewGroup) findWebView(c)?.let { return it }
    }
    return null
  }

  private var lastTop = 0
  private var lastBottom = 0

  private fun injectSafeArea(topPx: Int, bottomPx: Int) {
    val top = if (topPx == 0 && lastTop > 0) lastTop else topPx
    val bottom = if (bottomPx == 0 && lastBottom > 0) lastBottom else bottomPx
    lastTop = top
    lastBottom = bottom
    injectSafeAreaInternal(top, bottom)
  }

  private fun injectSafeAreaInternal(topPx: Int, bottomPx: Int) {
    // insets 是物理像素，CSS 需要 dp（逻辑像素）：换算后再注入
    val d = resources.displayMetrics.density
    val topCss = Math.round(topPx / d)
    val bottomCss = Math.round(bottomPx / d)
    // 不做去重：页面可能在注入后才加载/重载（localStorage 恢复旧值），重试必须覆盖
    val web = findWebView(window.decorView as ViewGroup) ?: return
    web.evaluateJavascript(
      "try{localStorage.setItem('jm_inset_top','$topCss');localStorage.setItem('jm_inset_bottom','$bottomCss')}catch(e){};" +
        "document.documentElement.style.setProperty('--inset-top','${topCss}px');" +
        "document.documentElement.style.setProperty('--inset-bottom','${bottomCss}px');",
      null
    )
    injectedInsetTop = topCss
    injectedInsetBottom = bottomCss
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == BeaconScanner.REQ_CODE) {
      BeaconScanner.onPermissionResult()
    }
  }
}
