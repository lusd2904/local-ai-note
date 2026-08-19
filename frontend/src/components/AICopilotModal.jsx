import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, Send, X, Sparkles, Copy, CornerDownLeft, 
  Trash2, User, Loader2, MessageSquare 
} from 'lucide-react';
import { streamAIChat } from '../api/client';

export default function AICopilotModal({
  isOpen,
  onClose,
  currentNote,
  onInsertToNote
}) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '你好！我是你的本地笔记 AI 智能副驾驶。我已经准备好围绕当前笔记内容为您提供解答、摘要、润色或深度思考。有什么我可以帮你的吗？'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const handleSend = async (textToSend = null) => {
    const text = textToSend || input;
    if (!text.trim() || isLoading) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    // 先添加一条空的 assistant 消息用于流式追加
    const assistantIndex = newMessages.length;
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    if (!textToSend) setInput('');
    setIsLoading(true);

    try {
      let accumulated = '';
      await streamAIChat(
        {
          note_title: currentNote?.title,
          note_content: currentNote?.content,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        },
        (chunk) => {
          accumulated += chunk;
          setMessages(prev => {
            const next = [...prev];
            if (next[assistantIndex]) {
              next[assistantIndex] = { ...next[assistantIndex], content: accumulated };
            }
            return next;
          });
        },
        () => {
          setIsLoading(false);
        },
        (err) => {
          setMessages(prev => {
            const next = [...prev];
            if (next[assistantIndex]) {
              next[assistantIndex] = { ...next[assistantIndex], content: '抱歉，响应遇到问题: ' + err.message };
            }
            return next;
          });
          setIsLoading(false);
        }
      );
    } catch (err) {
      setMessages(prev => {
        const next = [...prev];
        if (next[assistantIndex]) {
          next[assistantIndex] = { ...next[assistantIndex], content: '发送失败: ' + err.message };
        }
        return next;
      });
      setIsLoading(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    alert('已复制到剪贴板！');
  };

  const clearHistory = () => {
    setMessages([
      {
        role: 'assistant',
        content: '会话已重置。您可以继续向我提问关于当前笔记的任何内容。'
      }
    ]);
  };

  return (
    <aside className="w-96 bg-white dark:bg-gray-800 border-l border-mac-border dark:border-mac-borderDark flex flex-col h-screen select-none shadow-2xl z-30 animate-in slide-in-from-right duration-200">
      {/* 顶部标题栏 */}
      <div className="h-11 px-4 border-b border-mac-border dark:border-mac-borderDark flex items-center justify-between bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur">
        <div className="flex items-center space-x-2">
          <Bot className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
            Note Copilot 智能副驾驶 (流式)
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={clearHistory}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            title="清空会话"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 当前上下文提示 */}
      <div className="px-4 py-2 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-600 dark:text-blue-400 flex items-center justify-between">
        <span className="truncate max-w-[240px]">
          📌 当前关联笔记: {currentNote?.title || '未命名笔记'}
        </span>
        <span className="font-mono text-[10px]">实时流式已启用</span>
      </div>

      {/* 快捷问答提示词气泡 */}
      <div className="px-4 py-2 flex flex-wrap gap-1.5 border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-900/20">
        {[
          '提炼本文3个核心要点',
          '为这篇笔记补充延伸案例',
          '指出这篇文档的逻辑漏洞',
          '翻译为专业英文'
        ].map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(prompt)}
            disabled={isLoading}
            className="text-[11px] px-2 py-1 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-blue-400 text-gray-600 dark:text-gray-300 transition text-left"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* 聊天消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={idx}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
            >
              <div className="flex items-center space-x-1.5 text-[10px] text-gray-400 px-1">
                {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-blue-500" />}
                <span>{isUser ? '我' : 'Note Copilot'}</span>
              </div>

              <div
                className={`max-w-[90%] p-3 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? 'bg-blue-500 text-white rounded-br-none shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'
                }`}
              >
                {m.content || (isLoading && idx === messages.length - 1 ? (
                  <span className="flex items-center space-x-1 text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span>正在深度思考与流式吐字...</span>
                  </span>
                ) : '')}
              </div>

              {/* 助理消息的操作栏 */}
              {!isUser && m.content && (
                <div className="flex items-center space-x-2 text-[10px] text-gray-400 pt-0.5 px-1">
                  <button
                    onClick={() => handleCopy(m.content)}
                    className="hover:text-blue-500 flex items-center space-x-0.5"
                  >
                    <Copy className="w-2.5 h-2.5" />
                    <span>复制</span>
                  </button>
                  {onInsertToNote && (
                    <button
                      onClick={() => onInsertToNote(m.content)}
                      className="hover:text-blue-500 flex items-center space-x-0.5"
                    >
                      <CornerDownLeft className="w-2.5 h-2.5" />
                      <span>插入到正文</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={chatBottomRef} />
      </div>

      {/* 底部输入框 */}
      <div className="p-3 border-t border-mac-border dark:border-mac-borderDark bg-gray-50/50 dark:bg-gray-900/50">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="问问关于这篇笔记的任何问题..."
            disabled={isLoading}
            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-3 pr-10 py-2.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition shadow-inner"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 transition"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </form>
      </div>
    </aside>
  );
}
