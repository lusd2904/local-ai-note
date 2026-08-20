#!/usr/bin/env bash
# 从 scripts/main.swift 重新编译仓库内的 Note.app
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${ROOT}/Note.app"
BIN="${APP}/Contents/MacOS/Note"
SRC="${ROOT}/scripts/main.swift"

mkdir -p "${APP}/Contents/MacOS" "${APP}/Contents/Resources"

if [ ! -f "${APP}/Contents/Info.plist" ]; then
  echo "error: missing ${APP}/Contents/Info.plist" >&2
  exit 1
fi

SDK="$(xcrun --show-sdk-path 2>/dev/null || true)"
TARGET="arm64-apple-macosx11.0"
SWIFTC="swiftc"
if [ -x "/Applications/Xcode-beta.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc" ]; then
  export DEVELOPER_DIR="/Applications/Xcode-beta.app/Contents/Developer"
  SWIFTC="${DEVELOPER_DIR}/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc"
  SDK="${DEVELOPER_DIR}/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk"
fi

echo "🍏 编译 Note.app → ${BIN}"
"${SWIFTC}" -O -target "${TARGET}" \
  ${SDK:+-sdk "$SDK"} \
  -o "${BIN}" \
  "${SRC}" \
  -framework Cocoa -framework WebKit -framework AVFoundation

chmod +x "${BIN}"
echo "✅ 编译完成: ${BIN}"
file "${BIN}"
