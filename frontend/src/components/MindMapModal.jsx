import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { X, Copy, Download, Code, CornerDownLeft, Loader2, Sparkles } from 'lucide-react';
import { analyzeContent } from '../api/client';

export default function MindMapModal({
  isOpen,
  onClose,
  initialContent,
  onInsertToNote
}) {
  const [mermaidCode, setMermaidCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      mindmap: {
        useMaxWidth: true
      }
    });
  }, []);

  const generateMap = async () => {
    if (!initialContent) return;
    setIsLoading(true);
    try {
      const res = await analyzeContent({ content: initialContent, action: 'mindmap' });
      let code = res.result || '';
      // 提取 ```mermaid ... ```
      const match = code.match(/```mermaid([\s\S]*?)```/);
      if (match) {
        code = match[1].trim();
      } else {
        code = code.replace(/```/g, '').trim();
      }

      if (!code.startsWith('mindmap')) {
        code = `mindmap\n  root((核心主题))\n    要点一\n    要点二`;
      }

      setMermaidCode(code);
      renderMermaid(code);
    } catch (err) {
      alert('生成思维导图失败: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMermaid = async (code) => {
    if (!containerRef.current) return;
    try {
      containerRef.current.innerHTML = '';
      const id = 'mermaid-' + Math.random().toString(36).substring(2);
      const { svg } = await mermaid.render(id, code);
      if (containerRef.current) {
        containerRef.current.innerHTML = svg;
      }
    } catch (e) {
      if (containerRef.current) {
        containerRef.current.innerHTML = `<div class="text-xs text-red-500 p-4">思维导图渲染失败，请检查语法结构。<br>${e.message}</div>`;
      }
    }
  };

  useEffect(() => {
    if (isOpen && initialContent) {
      generateMap();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(`\`\`\`mermaid\n${mermaidCode}\n\`\`\``);
    alert('已复制 Mermaid 代码！');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* 顶部标题栏 */}
        <div className="h-12 px-6 border-b border-mac-border dark:border-mac-borderDark flex items-center justify-between bg-gray-50/80 dark:bg-gray-900/80">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              AI 智能思维导图 (Mermaid Mindmap)
            </h2>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowCode(!showCode)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs transition"
            >
              <Code className="w-3.5 h-3.5" />
              <span>{showCode ? '查看图形' : '查看代码'}</span>
            </button>

            <button
              onClick={handleCopy}
              className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
              title="复制 Mermaid 语法"
            >
              <Copy className="w-4 h-4" />
            </button>

            {onInsertToNote && (
              <button
                onClick={() => {
                  onInsertToNote(`\n\n\`\`\`mermaid\n${mermaidCode}\n\`\`\`\n`);
                  onClose();
                }}
                className="flex items-center space-x-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold shadow-sm transition"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
                <span>插入到当前笔记</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 主内容展示区 */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-gray-50/50 dark:bg-gray-900/30">
          {isLoading ? (
            <div className="text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
              <p className="text-xs text-gray-500">AI 正在提炼笔记核心大纲并构建思维导图...</p>
            </div>
          ) : showCode ? (
            <textarea
              value={mermaidCode}
              onChange={(e) => {
                setMermaidCode(e.target.value);
                renderMermaid(e.target.value);
              }}
              className="w-full h-full font-mono text-xs p-4 bg-gray-900 text-green-400 rounded-lg focus:outline-none"
            />
          ) : (
            <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-auto" />
          )}
        </div>
      </div>
    </div>
  );
}
