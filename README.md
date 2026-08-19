# Local AI Note - 智能笔记与智库工作站

## 项目概述
Local AI Note 是一款专为隐私与效率打造的本地私有化 AI 智能笔记与智库工作站。数据完全物理留存在本地，结合现代化所见即所得编辑器、AI 智能助手与深度内容解析，为您提供安全、高效的知识管理与生产力体验。

## 🌟 核心功能一览

- 📝 **现代化富文本与 Markdown 所见即所得编辑**：Tiptap 驱动，支持系统截图（Cmd+Shift+4）秒级 Cmd+V 粘贴渲染并持久化存储、支持 Word (.docx) 一键导出与本地备份。
- 🔒 **笔记二次验证与密码锁定**：重要笔记支持一键加锁，PBKDF2 加盐哈希加密，列表卡片强制脱敏保护，会话级解密内存隔离，彻底杜绝敏感凭证泄露。
- 🎙️ **语音录音工坊 (Audio Studio)**：高保真音频采集，波形可视化，Whisper 语音转写，AI 自动提炼核心结论与待办清单 (Action Items)，一键转入笔记。
- ✨ **AI 智能扩写与快捷算子**：一键深度扩写（根据简略提纲检索补充行业背景与权威数据）、智能摘要、专业润色、标签自动提取、Mermaid 思维导图一键生成。
- 🤖 **独立 AI 智能咨询助手**：全尺寸沉浸式咨询工作区，支持 Claude 3.7 (Extended Thinking)、DeepSeek R1、OpenAI GPT-4o、Ollama 离线多模型自由切换，咨询结果一键沉淀为笔记。
- 🌐 **官方网页版 AI 深度内嵌**：字节跳动「豆包」与「DeepSeek」官方网页版原生集成，基于 macOS 原生顶级 WKWebView 架构，登录态系统级持久化存储，彻底告别重复登录与 iframe 跨域拦截。
- 📂 **无限多级笔记本与标签系统**：树状目录无限层级、递归删除与移动、收藏夹、废纸篓与暗黑模式支持。
- 🍏 **原生 macOS 桌面客户端 (`Note.app`)**：Swift + WebKit 构建，沉浸式毛玻璃无边框窗口、独立 Dock 图标、原生麦克风权限支持。

## 🛠 快速启动与部署指南

- **方案 1：Docker Compose 一键启动 (推荐)**
  ```bash
  docker-compose up -d
  ```
- **方案 2：macOS 原生桌面应用启动**
  ```bash
  ./run.sh app
  # 或安装到应用程序：
  ./run.sh install-app
  ```
- **方案 3：本地源码开发环境启动**
  ```bash
  # 后端
  python main.py
  # 前端
  npm run dev
  ```

## 📦 项目技术栈与依赖清单

- **前端**：React 18, Vite, TailwindCSS, Tiptap, Lucide Icons, Mermaid, KaTeX.
- **后端**：Python 3.11, FastAPI, SQLAlchemy, SQLite, Uvicorn, python-docx, Pydantic.
- **客户端**：Swift, WebKit, Cocoa, AVFoundation.

## 🛡️ 隐私与数据安全说明

- 数据 100% 物理留存于 `./data/` 目录；
- API Key 与敏感环境变量存放在本地 `.env`，不上传云端；
- 加锁笔记强脱敏隔离，解密状态内存级管理。

## 💻 常用维护命令 (`./run.sh`)

```bash
./run.sh app             # 打开 macOS 原生独立桌面应用窗口
./run.sh install-app     # 安装应用到启动台
./run.sh start           # 启动服务
./run.sh stop            # 停止服务
./run.sh restart         # 重启服务
./run.sh status          # 查看运行状态
./run.sh logs            # 实时查看运行日志
./run.sh backup          # 备份数据
./run.sh restore <file>  # 从备份压缩包恢复数据
```
