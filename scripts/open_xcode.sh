#!/bin/bash
# 一键启动 Xcode 并打开 iOS 工程
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
XCODE_BIN="/Applications/A.开发设计/Xcode.app/Contents/MacOS/Xcode"

if [ -f "$XCODE_BIN" ]; then
    echo "🚀 正在为您直接启动 Xcode 并打开 iOS 原生工程..."
    "$XCODE_BIN" "$PROJECT_DIR/ios/NoteApp.xcodeproj" >/dev/null 2>&1 &
    echo "✅ Xcode 已成功在后台唤起！"
else
    echo "⚠️ 未找到 Xcode 二进制，请检查安装路径"
fi
