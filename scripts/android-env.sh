#!/usr/bin/env bash
# Android 构建环境（source 本文件后执行 cargo/tauri 命令）
# 用法: source scripts/android-env.sh

export JAVA_HOME="C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.20.101-hotspot"
export ANDROID_HOME="C:\\Users\\FRB\\AppData\\Local\\Android\\Sdk"
export NDK_HOME="$ANDROID_HOME\\ndk\\27.2.12479018"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) TOOLCHAIN="$NDK_HOME\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin" ;;
  *) echo "仅支持 Windows 开发机" ;;
esac

export PATH="$HOME/.cargo/bin:$(cygpath -u "$TOOLCHAIN" 2>/dev/null || echo ""):$PATH"

# ring/cc 需要 NDK clang
export CC_aarch64_linux_android="$TOOLCHAIN\\aarch64-linux-android24-clang.cmd"
export AR_aarch64_linux_android="$TOOLCHAIN\\llvm-ar.exe"
export CC_armv7_linux_androideabi="$TOOLCHAIN\\armv7a-linux-androideabi24-clang.cmd"
export AR_armv7_linux_androideabi="$TOOLCHAIN\\llvm-ar.exe"
export CC_i686_linux_android="$TOOLCHAIN\\i686-linux-android24-clang.cmd"
export AR_i686_linux_android="$TOOLCHAIN\\llvm-ar.exe"
export CC_x86_64_linux_android="$TOOLCHAIN\\x86_64-linux-android24-clang.cmd"
export AR_x86_64_linux_android="$TOOLCHAIN\\llvm-ar.exe"

echo "android env ready: NDK=$(ls "$NDK_HOME" >/dev/null 2>&1 && echo ok || echo MISSING)"
