import React, { useRef } from 'react';
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';

export default function EmbeddedWebAIView({ 
  title, 
  url, 
  icon, 
  iconSrc,
  target = 'doubao',
  badgeColor = 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' 
}) {
  const iframeRef = useRef(null);
  const isNativeApp = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nativeWebAI);

  const handleRefresh = () => {
    if (isNativeApp) {
      window.webkit.messageHandlers.nativeWebAI.postMessage({ action: 'refresh', target });
    } else if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const handleOpenBrowser = () => {
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-gray-900">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0 bg-gray-50/50 dark:bg-gray-900/50 z-10">
        <div className="flex items-center space-x-3">
          {iconSrc ? (
            <img src={iconSrc} alt={title} className="w-5 h-5 rounded object-contain shrink-0 shadow-xs" />
          ) : (
            <span className="text-xl">{icon}</span>
          )}
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">{title}</h2>
          <div className={`flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-medium ${badgeColor}`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>🟢 登录态已持久化保存</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <span className="text-xs text-gray-500 dark:text-gray-400 hidden md:inline-block">
            账号密码与第三方登录（微信/手机号）状态在本地持久保持，关闭后无需重复登录
          </span>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
          <button 
            onClick={handleRefresh}
            className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition"
            title="刷新页面"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button 
            onClick={handleOpenBrowser}
            className="flex items-center space-x-1 p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition"
            title="在系统浏览器中打开"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="text-xs">浏览器打开</span>
          </button>
        </div>
      </div>

      {/* 视图主体：原生客户端下由底层的 Native WKWebView 负责高清原生渲染，浏览器模式下使用 iframe 回退 */}
      <div className="flex-1 w-full bg-white dark:bg-gray-900 relative">
        {!isNativeApp && (
          <iframe
            ref={iframeRef}
            src={url}
            className="w-full h-full border-0"
            title={title}
            allow="camera; microphone; clipboard-read; clipboard-write; geolocation"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-downloads"
          />
        )}
      </div>
    </div>
  );
}
