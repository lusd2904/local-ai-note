import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { X, Copy, Download, Code, CornerDownLeft, Loader2, Sparkles, RefreshCw, Layers, Check } from 'lucide-react';
import { streamAIAnalyze } from '../api/client';

/**
 * 本地智能大纲转 Mermaid 思维导图解析器 (作为离线或网络故障时的超强后备保障)
 */
function generateLocalMindMapFromText(text) {
  if (!text || !text.trim()) {
    return `mindmap\n  root((未命名笔记))\n    要点一\n    要点二`;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let rootTitle = '核心主题';
  const branches = [];
  let currentBranch = null;

  for (const line of lines) {
    if (line.startsWith('# ') && rootTitle === '核心主题') {
      rootTitle = line.replace('# ', '').replace(/[()\[\]{}]/g, '').trim() || rootTitle;
    } else if (line.startsWith('## ')) {
      const bTitle = line.replace('## ', '').replace(/[()\[\]{}]/g, '').trim();
      if (bTitle) {
        currentBranch = { title: bTitle, sub: [] };
        branches.push(currentBranch);
      }
    } else if (line.startsWith('### ') || line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s/.test(line)) {
      const subTitle = line.replace(/^###\s|^[-*]\s|^\d+\.\s/, '').replace(/[()\[\]{}]/g, '').trim();
      if (subTitle && subTitle.length < 30) {
        if (!currentBranch) {
          currentBranch = { title: '主要要点', sub: [] };
          branches.push(currentBranch);
        }
        if (currentBranch.sub.length < 6) {
          currentBranch.sub.push(subTitle);
        }
      }
    }
  }

  if (branches.length === 0) {
    // 按段落提取
    const paras = lines.filter(l => !l.startsWith('#') && l.length > 2).slice(0, 4);
    if (paras.length > 0) {
      branches.push({
        title: '核心内容',
        sub: paras.map(p => p.slice(0, 20))
      });
    } else {
      branches.push({ title: '要点一', sub: ['子要点 A', '子要点 B'] });
      branches.push({ title: '要点二', sub: ['子要点 C'] });
    }
  }

  let code = `mindmap\n  root((${rootTitle}))\n`;
  for (const b of branches.slice(0, 6)) {
    code += `    ${b.title}\n`;
    for (const s of b.sub.slice(0, 5)) {
      code += `      ${s}\n`;
    }
  }

  return code;
}

export default function MindMapModal({
  isOpen,
  onClose,
  initialContent,
  onInsertToNote
}) {
  const [mermaidCode, setMermaidCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [copied, setCopied] = useState(false);
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

  const renderMermaid = async (code) => {
    if (!containerRef.current) return;
    try {
      containerRef.current.innerHTML = '';
      const id = 'mermaid-' + Math.random().toString(36).substring(2);
      const cleanCode = code.trim();
      const { svg } = await mermaid.render(id, cleanCode);
      if (containerRef.current) {
        containerRef.current.innerHTML = svg;
      }
    } catch (e) {
      if (containerRef.current) {
        containerRef.current.innerHTML = `
          <div class="text-center p-6 space-y-2">
            <div class="text-amber-500 text-xs font-semibold">⚠️ 正在调整思维导图排版...</div>
            <div class="text-[11px] text-gray-400 font-mono">${e.message}</div>
          </div>
        `;
      }
    }
  };

  const generateMap = async () => {
    if (!initialContent || !initialContent.trim()) {
      const fallback = generateLocalMindMapFromText('核心主题\n- 要点一\n- 要点二');
      setMermaidCode(fallback);
      renderMermaid(fallback);
      return;
    }

    setIsLoading(true);
    setStatusText('AI 正在提炼笔记核心大纲并构建思维导图...');
    let accumulated = '';

    try {
      await streamAIAnalyze(
        { content: initialContent, action: 'mindmap' },
        (chunk) => {
          accumulated += chunk;
          setStatusText(`🌊 正在流式生成思维导图 (${accumulated.length} 字)...`);
        },
        () => {
          let code = accumulated.trim();
          // 提取 ```mermaid ... ```
          const match = code.match(/```mermaid([\s\S]*?)```/);
          if (match) {
            code = match[1].trim();
          } else {
            code = code.replace(/```/g, '').trim();
          }

          // 清洗掉可能的非 mindmap 开头闲聊
          const mindmapIndex = code.indexOf('mindmap');
          if (mindmapIndex !== -1) {
            code = code.slice(mindmapIndex).trim();
          }

          if (!code.startsWith('mindmap')) {
            // 使用本地智能大纲解析
            code = generateLocalMindMapFromText(initialContent);
          }

          setMermaidCode(code);
          setIsLoading(false);
          renderMermaid(code);
        },
        (err) => {
          console.warn('AI 流式生成失败，自动启用本地智能大纲转换:', err);
          // 优雅降级：直接从笔记标题与结构本地生成思维导图
          const fallback = generateLocalMindMapFromText(initialContent);
          setMermaidCode(fallback);
          setIsLoading(false);
          renderMermaid(fallback);
        }
      );
    } catch (err) {
      console.warn('AI 请求异常，使用本地大纲生成:', err);
      const fallback = generateLocalMindMapFromText(initialContent);
      setMermaidCode(fallback);
      setIsLoading(false);
      renderMermaid(fallback);
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUseLocalOutline = () => {
    const fallback = generateLocalMindMapFromText(initialContent);
    setMermaidCode(fallback);
    renderMermaid(fallback);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl h-[82vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800">
        {/* 顶部标题栏 */}
        <div className="h-13 px-6 border-b border-gray-200/80 dark:border-gray-800 flex items-center justify-between bg-gray-50/70 dark:bg-gray-900/70 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                AI 智能思维导图 (Mermaid Mindmap)
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* 切换代码/图形 */}
            <button
              onClick={() => setShowCode(!showCode)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-xs font-medium transition"
            >
              <Code className="w-3.5 h-3.5" />
              <span>{showCode ? '查看图形' : '编辑代码'}</span>
            </button>

            {/* 重新生成 */}
            <button
              onClick={generateMap}
              disabled={isLoading}
              className="flex items-center space-x-1 px-2.5 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-xs transition disabled:opacity-50"
              title="重新用 AI 生成思维导图"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>重新生成</span>
            </button>

            {/* 复制 */}
            <button
              onClick={handleCopy}
              className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              title="复制 Mermaid 语法"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* 插入到笔记 */}
            {onInsertToNote && (
              <button
                onClick={() => {
                  onInsertToNote(`\n\n\`\`\`mermaid\n${mermaidCode}\n\`\`\`\n`);
                  onClose();
                }}
                className="flex items-center space-x-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
                <span>插入到当前笔记</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 主内容展示区 */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-gray-50/40 dark:bg-gray-950/40 relative">
          {isLoading ? (
            <div className="text-center space-y-3 p-8 bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
              <p className="text-xs text-gray-600 dark:text-gray-300 font-medium animate-pulse">{statusText}</p>
              <button
                onClick={handleUseLocalOutline}
                className="mt-2 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                等不及了？一键使用笔记标题快速生成
              </button>
            </div>
          ) : showCode ? (
            <textarea
              value={mermaidCode}
              onChange={(e) => {
                setMermaidCode(e.target.value);
                renderMermaid(e.target.value);
              }}
              className="w-full h-full font-mono text-xs p-4 bg-gray-900 text-emerald-400 rounded-xl focus:outline-hidden leading-relaxed shadow-inner"
              placeholder="mindmap\n  root((主题))\n    分支一"
            />
          ) : (
            <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-auto p-4" />
          )}
        </div>
      </div>
    </div>
  );
}
