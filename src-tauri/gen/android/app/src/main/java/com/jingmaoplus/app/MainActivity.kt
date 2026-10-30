package com.jingmaoplus.app

import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // wry 默认 edge-to-edge；这里直接给内容容器加系统栏 inset，
    // 保证 WebView 不与状态栏/摄像头区域重叠（不依赖 WebView 的 env() 支持）
    window.attributes.layoutInDisplayCutoutMode =
      WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    window.decorView.setBackgroundColor(Color.parseColor("#F5F6F8"))
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true
    val content = findViewById<ViewGroup>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.navigationBars()
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
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
