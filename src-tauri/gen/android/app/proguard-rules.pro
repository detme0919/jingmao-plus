# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# 经贸+：wry 通过 JNI 调用的 Kotlin 方法在 Java 侧无引用，R8 会误删
#（曾导致点击登录闪退 NoSuchMethodError），显式保留
-keepclassmembers class com.jingmaoplus.app.RustWebView {
    *;
}
-keepclassmembers class com.jingmaoplus.app.RustWebViewClient {
    *;
}
