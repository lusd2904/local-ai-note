import React, { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Send, Square, Trash2, FilePlus, Copy, Save, Check } from 'lucide-react';
import { streamAIChat } from '../api/client';
import ReactMarkdown from 'react-markdown';

export default function AIConsultationView({ onSaveToNote }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('grok-3');
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  const models = [
    { id: 'grok-3', name: 'Grok 3', badge: '默认' },
    { id: 'grok-4.6-xhigh', name: 'Grok 4.6', badge: '高推理' },
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7', badge: '代码/写作' },
    { id: 'ollama-local', name: 'Ollama (本地)', badge: '隐私安全' }
  ];

  const presets = [
    { icon: '📊', title: '深度数据检索与行业分析', prompt: '请帮我进行深度数据检索并输出一份行业分析报告，关注最新趋势与市场格局。' },
    { icon: '✍️', title: '架构设计与长篇策划案', prompt: '我需要设计一套高可用系统架构（或编写长篇策划案），请提供详细的章节大纲和核心要点。' },
    { icon: '💡', title: '头脑风暴与创意延伸', prompt: '让我们进行一场头脑风暴，针对[填入主题]提供至少 5 个极具创新性和可行性的点子。' },
    { icon: '🔍', title: '专业技术攻坚与代码剖析', prompt: '请帮我剖析这段代码的性能瓶颈，并提供底层机制解释和优化方案：\n[粘贴代码]' },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (text = inputValue) => {
    if (!text.trim() || isLoading) return;

    const userMessage = { role: 'user', content: text, id: Date.now().toString() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: assistantId }]);

    abortControllerRef.current = new AbortController();

    try {
      const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
      chatHistory.push({ role: 'user', content: text });

      await streamAIChat(
        { messages: chatHistory },
        (chunk) => {
          setMessages(prev => prev.map(m => 
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          ));
        },
        () => {
          // 流式生成完毕
        },
        (err) => {
          setMessages(prev => prev.map(m => 
            m.id === assistantId ? { ...m, content: m.content + `\n\n**[请求发生错误: ${err.message || err}]**` } : m
          ));
        }
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m => 
          m.id === assistantId ? { ...m, content: m.content + '\n\n**[请求失败或发生错误]**' } : m
        ));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (content, id) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveToNote = (content) => {
    // Generate a title from the first 20 chars of content
    const title = content.substring(0, 20).replace(/\n/g, ' ') + '... (AI 咨询)';
    if (onSaveToNote) {
      onSaveToNote(title, content);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setInputValue('');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 w-full overflow-hidden relative text-gray-800 dark:text-gray-200">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center space-x-3">
          <Bot className="w-6 h-6 text-blue-500" />
          <h2 className="text-lg font-bold">🤖 智能咨询助手</h2>
          <select 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="ml-4 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.badge})</option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={handleClear} className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition">
            <Trash2 className="w-4 h-4" />
            <span>清空咨询 / 新建</span>
          </button>
          <button 
            onClick={() => handleSaveToNote(messages.map(m => `**${m.role === 'user' ? '提问' : '回答'}**:\n${m.content}`).join('\n\n'))} 
            className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition"
            disabled={messages.length === 0}
          >
            <FilePlus className="w-4 h-4" />
            <span>转存为新笔记</span>
          </button>
        </div>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto">
            <Sparkles className="w-12 h-12 text-blue-500 mb-6" />
            <h3 className="text-2xl font-bold mb-8 text-gray-800 dark:text-gray-100">今天需要探索什么？</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              {presets.map((preset, idx) => (
                <div 
                  key={idx}
                  onClick={() => setInputValue(preset.prompt)}
                  className="p-4 border border-gray-200 dark:border-gray-800 rounded-xl cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all bg-gray-50 dark:bg-gray-800/50"
                >
                  <div className="text-xl mb-2">{preset.icon}</div>
                  <div className="font-semibold text-sm mb-1">{preset.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{preset.prompt}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6 pb-20">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-end space-x-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className={`p-4 rounded-2xl ${
                    msg.role === 'user' 
                      ? 'bg-blue-500 text-white rounded-br-none' 
                      : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-none text-gray-800 dark:text-gray-200'
                  }`}>
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-gray-900 prose-pre:text-gray-100">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
                {msg.role === 'assistant' && msg.content && (
                  <div className="flex items-center space-x-2 mt-2 ml-10 text-gray-400">
                    <button onClick={() => handleCopy(msg.content, msg.id)} className="p-1 hover:text-gray-600 dark:hover:text-gray-300 transition" title="复制内容">
                      {copiedId === msg.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleSaveToNote(msg.content)} className="p-1 hover:text-gray-600 dark:hover:text-gray-300 transition" title="保存单条回答为笔记">
                      <Save className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 底部输入框 */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent dark:from-gray-900 dark:via-gray-900 pt-10">
        <div className="max-w-4xl mx-auto relative flex items-end bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-2xl shadow-lg focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入咨询内容，Shift + Enter 换行..."
            className="w-full max-h-48 min-h-[56px] py-4 pl-4 pr-12 bg-transparent outline-none resize-none text-sm dark:text-white"
            rows={1}
            style={{ height: 'auto' }}
          />
          <div className="absolute right-2 bottom-2">
            {isLoading ? (
              <button onClick={handleStop} className="p-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition">
                <Square className="w-5 h-5 fill-current" />
              </button>
            ) : (
              <button 
                onClick={() => handleSend()} 
                disabled={!inputValue.trim()}
                className="p-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
