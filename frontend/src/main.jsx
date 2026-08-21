import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// 🌟 支持 macOS 原生无边框窗口全局顶栏拖拽与双击放大
window.addEventListener('mousedown', (e) => {
  // 当点击位于顶部 48px 高度范围内，且为鼠标左键点击
  if (e.clientY <= 48 && e.button === 0) {
    // 排除交互元素（按钮、输入框、链接、选择框、可编辑区域等）
    const isInteractive = e.target.closest(
      'button, input, textarea, a, select, [role="button"], .db-dropdown-box, .db-dropdown-trigger, .no-drag, [contenteditable="true"], .interactive, svg, path'
    );
    // 若点击的是单纯的顶栏空白处/容器背景，则通知原生 Swift 启动窗口拖拽
    if (!isInteractive && window.webkit?.messageHandlers?.nativeApp) {
      window.webkit.messageHandlers.nativeApp.postMessage({ action: 'dragWindow' });
    }
  }
}, { capture: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

