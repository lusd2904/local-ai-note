#!/usr/bin/env bash
# ==============================================================================
# 构建 macOS 原生独立应用 (LocalNote.app) - 完整环境变量注入与单实例互斥锁
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_NAME="LocalNote"
APP_DIR="${ROOT_DIR}/${APP_NAME}.app"

echo "🍏 正在构建 macOS 原生独立应用: ${APP_DIR}..."

# 创建 macOS App 标准目录结构
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# 1. 编写 Info.plist
cat << 'EOF' > "${APP_DIR}/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>LocalNote</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.localnote.app</string>
    <key>CFBundleName</key>
    <string>LocalNote</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

# 2. 复制启动器
cp "${APP_DIR}/Contents/MacOS/LocalNote" "${APP_DIR}/Contents/MacOS/LocalNote.bak" 2>/dev/null || true

cat << 'EOF' > "${APP_DIR}/Contents/MacOS/LocalNote"
#!/usr/bin/env bash

# 1. 注入完整的用户环境 PATH (防止 Finder 启动时因精简 PATH 找不到 docker)
export PATH="/Users/lusd/.local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.local/bin:$HOME/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

LOG_FILE="/tmp/local_note_app.log"
echo "=== LocalNote 启动于 $(date) ===" > "${LOG_FILE}"

# 2. 定位工程根目录
PROJECT_DIR="/Users/lusd/工程/note"
cd "${PROJECT_DIR}" >> "${LOG_FILE}" 2>&1

echo "工作目录: ${PROJECT_DIR}" >> "${LOG_FILE}"

# 3. 检查是否已经存在运行中的独立窗口 (单实例检测)
EXISTING_PID=$(pgrep -f "local_note_chrome_profile" || true)

if [ -n "${EXISTING_PID}" ]; then
  echo "检测到已有窗口正在运行 (PID: ${EXISTING_PID})，正在激活置顶..." >> "${LOG_FILE}"
  osascript -e '
    tell application "System Events"
      set pList to every process whose name contains "Google Chrome" or name contains "LocalNote" or name contains "Edge"
      repeat with p in pList
        set frontmost of p to true
      end repeat
    end tell
  ' >> "${LOG_FILE}" 2>&1 || true
  exit 0
fi

# 4. 确保 Docker 运行中
if ! docker info >> "${LOG_FILE}" 2>&1; then
  echo "Docker 未运行，正在唤醒 Docker Desktop..." >> "${LOG_FILE}"
  open -a Docker || true
  for i in {1..30}; do
    if docker info >> "${LOG_FILE}" 2>&1; then
      echo "Docker 已就绪！" >> "${LOG_FILE}"
      break
    fi
    sleep 1
  done
fi

# 5. 确保容器运行中
echo "正在确保后端与前端容器运行..." >> "${LOG_FILE}"
docker compose up -d >> "${LOG_FILE}" 2>&1

# 6. 等待前端 Web 端口 (3000) 响应
for i in {1..30}; do
  if curl -s -I http://localhost:3000/ >> "${LOG_FILE}" 2>&1; then
    echo "前端 Web 服务已就绪！" >> "${LOG_FILE}"
    break
  fi
  sleep 0.5
done

# 7. 以独立 App 模式弹出无地址栏桌面原生窗口
PROFILE_DIR="/tmp/local_note_chrome_profile"
mkdir -p "${PROFILE_DIR}"

if [ -d "/Applications/Google Chrome.app" ]; then
  echo "使用 Google Chrome App 模式启动独立桌面窗口..." >> "${LOG_FILE}"
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --app="http://localhost:3000" \
    --user-data-dir="${PROFILE_DIR}" \
    --no-first-run \
    --no-default-browser-check \
    --window-size=1280,820 >> "${LOG_FILE}" 2>&1 &
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  echo "使用 Edge App 模式启动独立桌面窗口..." >> "${LOG_FILE}"
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    --app="http://localhost:3000" \
    --user-data-dir="${PROFILE_DIR}" \
    --window-size=1280,820 >> "${LOG_FILE}" 2>&1 &
elif [ -d "/Applications/Brave Browser.app" ]; then
  echo "使用 Brave App 模式启动独立桌面窗口..." >> "${LOG_FILE}"
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
    --app="http://localhost:3000" \
    --user-data-dir="${PROFILE_DIR}" \
    --window-size=1280,820 >> "${LOG_FILE}" 2>&1 &
else
  echo "使用系统默认浏览器打开..." >> "${LOG_FILE}"
  open "http://localhost:3000" >> "${LOG_FILE}" 2>&1
fi

echo "启动完成！" >> "${LOG_FILE}"
EOF

chmod +x "${APP_DIR}/Contents/MacOS/LocalNote"

# 生成图标
python3 "${SCRIPT_DIR}/generate_app_icon.py"

echo "✅ macOS 原生应用构建完成！位置: ${APP_DIR}"
