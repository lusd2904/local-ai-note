import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, 
  Code, Quote, Image as ImageIcon, Sparkles, Wand2, Tag, 
  Folder, Network, Bot, Download, Check, RefreshCw, X, FileText, Lock, Unlock, Eye, EyeOff, BookOpenCheck
} from 'lucide-react';
import { uploadImage, streamAIAnalyze } from '../api/client';
import LockModal from './LockModal';

// 🌟 将 Markdown 格式转换为 Tiptap 能直接渲染为高清图片与富文本的 HTML
function markdownToRichHTML(md) {
  if (!md) return '';
  let html = md;
  // 1. 将 ![图片说明](url) 转换为 <img src="url" alt="图片说明" />
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
  // 2. 将粗体 **text** 转换为 <strong>text</strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 3. 将斜体 *text* 转换为 <em>text</em>
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // 4. 将标题转换为标准 HTML 标题
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  // 5. 将引用转换为 <blockquote>
  html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
  // 6. 换行
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br/>');
  return `<p>${html}</p>`;
}

function parseNoteContent(note) {
  if (!note) return '';
  if (note.content_json) {
    try {
      const parsed = JSON.parse(note.content_json);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (e) {
      // 忽略 JSON 解析失败，回退到 Markdown 转换
    }
  }
  return markdownToRichHTML(note.content || '');
}

// 🌟 空状态占位视图（当没有选中笔记时显示，无需初始化 Tiptap 引擎）
function EmptyEditor() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-mac-editor dark:bg-mac-editorDark text-gray-400 select-none">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto shadow-inner text-gray-300 dark:text-gray-600">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-gray-600 dark:text-gray-300">请选择或新建一篇笔记</h3>
        <p className="text-xs text-gray-400">支持富文本所见即所得、截图秒级粘贴渲染、Claude 智能分析与 Word 导出</p>
      </div>
    </div>
  );
}

// 🌟 核心编辑器组件（独立生命周期，每个 note 实例独立绑定）
function EditorCore({
  note,
  notebooks = [],
  onUpdateNote,
  onOpenAIChat,
  onGenerateMindMap,
  isUnlocked,
  onLockNote,
  onUnlockNote,
  onRelockNote
}) {
  const [title, setTitle] = useState(note?.title || '');
  const [notebookId, setNotebookId] = useState(note?.notebook_id || '');
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [lockModalMode, setLockModalMode] = useState('lock');
  
  const getInitialTags = () => {
    if (Array.isArray(note?.tags)) return note.tags;
    if (typeof note?.tags === 'string') {
      try {
        const parsed = JSON.parse(note.tags);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const [tags, setTags] = useState(getInitialTags);
  const [newTagInput, setNewTagInput] = useState('');
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
  const [aiActionTip, setAiActionTip] = useState('');
  const [exportSuccessTip, setExportSuccessTip] = useState(false);
  const saveTimeoutRef = useRef(null);
  const noteIdRef = useRef(note?.id);
  noteIdRef.current = note?.id;

  // 初始化 Tiptap 所见即所得编辑器
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-xl shadow-md my-3 max-w-full h-auto border border-gray-200 dark:border-gray-700 select-none'
        }
      }),
      Placeholder.configure({
        placeholder: '在此开始输入正文，或按 Cmd+V 直接粘贴截图图片...'
      })
    ],
    content: parseNoteContent(note),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[500px] text-sm leading-relaxed px-8 py-6'
      },
      // 🌟 拦截粘贴事件：截图粘贴后直接上传并无缝渲染为真实图片，绝不暴露路径字符！
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData || event.originalEvent?.clipboardData;
        const items = clipboardData?.items;
        
        // 如果包含 HTML 或文本内容，不拦截，优先让 Tiptap 处理富文本粘贴
        if (clipboardData && (clipboardData.types.includes('text/html') || clipboardData.types.includes('text/plain'))) {
          return false;
        }

        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
              event.preventDefault();
              const file = items[i].getAsFile();
              if (file) {
                uploadImage(file).then((data) => {
                  if (data && data.url && editor && !editor.isDestroyed) {
                    editor.chain().focus().setImage({ src: data.url }).run();
                  }
                }).catch(err => {
                  console.error('Failed to paste image', err);
                  alert('图片上传失败: ' + err.message);
                });
                return true;
              }
            }
          }
        }
        return false;
      },
      // 🌟 拦截拖拽图片事件
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            uploadImage(file).then((data) => {
              if (data && data.url && editor && !editor.isDestroyed) {
                editor.chain().focus().setImage({ src: data.url }).run();
              }
            }).catch(err => {
              console.error('Failed to drop image', err);
            });
            return true;
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor: ed }) => {
      const activeId = noteIdRef.current;
      if (!activeId || !ed || ed.isDestroyed) return;

      const textContent = ed.getText();
      const jsonContent = JSON.stringify(ed.getJSON());

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (onUpdateNote && noteIdRef.current === activeId) {
          onUpdateNote(activeId, {
            content: textContent,
            content_json: jsonContent
          });
        }
      }, 800);
    }
  }, [note?.id]);

  // 安全获取格式激活状态（防止 destroyed 实例导致 commandManager 崩溃）
  const isFormatActive = (name, attrs) => {
    if (!editor || editor.isDestroyed) return false;
    try {
      return editor.isActive(name, attrs);
    } catch {
      return false;
    }
  };

  // 安全执行 Editor Chain 指令
  const runEditorChain = (fn) => {
    if (!editor || editor.isDestroyed) return;
    try {
      fn(editor.chain().focus()).run();
    } catch (e) {
      console.warn('Editor chain error:', e);
    }
  };

  // 外部更新同步（如 AI 追加内容导致 note.updated_at 变化）
  useEffect(() => {
    if (editor && !editor.isDestroyed && note) {
      setTitle(note.title || '');
      setNotebookId(note.notebook_id || '');
      setTags(getInitialTags());
    }
  }, [note?.updated_at]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // 标题修改保存
  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (note && onUpdateNote) {
        onUpdateNote(note.id, { title: val });
      }
    }, 600);
  };

  // 归属分类切换
  const handleNotebookChange = (e) => {
    const newNbId = e.target.value || null;
    setNotebookId(newNbId);
    if (note && onUpdateNote) {
      onUpdateNote(note.id, { notebook_id: newNbId });
    }
  };

  // 标签添加与删除
  const handleAddTag = (e) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const tagText = newTagInput.trim().replace(/^#/, '');
      if (!tags.includes(tagText)) {
        const updatedTags = [...tags, tagText];
        setTags(updatedTags);
        if (note && onUpdateNote) onUpdateNote(note.id, { tags: updatedTags });
      }
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    const updatedTags = tags.filter(t => t !== tagToRemove);
    setTags(updatedTags);
    if (note && onUpdateNote) onUpdateNote(note.id, { tags: updatedTags });
  };

  // 手动点击上传图片
  const handleManualImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const data = await uploadImage(file);
          if (data && data.url && editor && !editor.isDestroyed) {
            editor.chain().focus().setImage({ src: data.url }).run();
          }
        } catch (err) {
          alert('上传图片失败: ' + err.message);
        }
      }
    };
    input.click();
  };

  // 快捷 AI 操作
  const handleRunAIAction = async (action) => {
    if (!editor || editor.isDestroyed || !note) return;
    const contentText = editor.getText();
    if (!contentText.trim()) {
      alert('当前笔记暂无文字内容，无法进行 AI 分析。');
      return;
    }
    setIsAIAnalyzing(true);
    setAiActionTip(`正在执行 AI ${action === 'expand' ? '深度扩写' : action === 'summary' ? '智能摘要' : action === 'polish' ? '润色优化' : '提炼标签'}...`);

    try {
      let accumulatedText = '';
      await streamAIAnalyze(
        { content: contentText, action },
        (chunk) => {
          accumulatedText += chunk;
          setAiActionTip(`🌊 正在流式生成 AI ${action === 'expand' ? '扩写' : action === 'summary' ? '摘要' : action === 'polish' ? '润色' : '标签'} (${accumulatedText.length} 字)...`);
        },
        () => {
          const resText = accumulatedText.trim();
          if (!resText || !editor || editor.isDestroyed) return;

          if (action === 'extract_tags') {
            try {
              let cleaned = resText;
              if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
              if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
              if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
              const parsed = JSON.parse(cleaned.trim());
              if (Array.isArray(parsed)) {
                const merged = Array.from(new Set([...tags, ...parsed]));
                setTags(merged);
                if (onUpdateNote) onUpdateNote(note.id, { tags: merged });
              }
            } catch (e) {
              console.error('Failed to parse tags:', e);
            }
          } else if (action === 'expand') {
            editor.commands.setContent(markdownToRichHTML(resText));
            if (onUpdateNote) {
              onUpdateNote(note.id, { content: editor.getText(), content_json: JSON.stringify(editor.getJSON()) });
            }
          } else if (action === 'polish') {
            editor.commands.setContent(markdownToRichHTML(resText));
            if (onUpdateNote) {
              onUpdateNote(note.id, { content: editor.getText(), content_json: JSON.stringify(editor.getJSON()) });
            }
          } else if (action === 'summary') {
            editor.chain().focus().insertContent(`\n\n<blockquote><p>🤖 <strong>AI 核心要点总结：</strong><br/>${resText.replace(/\n/g, '<br/>')}</p></blockquote>\n\n`).run();
            if (onUpdateNote) {
              onUpdateNote(note.id, { summary: resText.slice(0, 150), content: editor.getText(), content_json: JSON.stringify(editor.getJSON()) });
            }
          }
        },
        (err) => {
          alert('AI 流式处理失败: ' + err.message);
        }
      );
    } catch (err) {
      alert('AI 处理失败: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsAIAnalyzing(false);
      setAiActionTip('');
    }
  };

  // 导出为 Word 文档
  const handleExportWord = () => {
    if (!note) return;
    window.location.href = `/api/notes/${note.id}/export/docx`;
    setExportSuccessTip(true);
    setTimeout(() => setExportSuccessTip(false), 4000);
  };

  const handleLockModalConfirm = async (password) => {
    if (lockModalMode === 'lock') {
      await onLockNote(note.id, password);
    } else {
      await onUnlockNote(note.id, password);
    }
  };

  return (
    <main className="flex-1 bg-mac-editor dark:bg-mac-editorDark flex flex-col h-screen overflow-hidden transition-colors">
      {/* 顶部主工具栏 (支持拖动窗口) */}
      <div 
        style={{ WebkitAppRegion: 'drag' }}
        className="h-12 px-4 border-b border-mac-border dark:border-mac-borderDark flex items-center justify-between gap-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur shrink-0 cursor-default"
      >
        {/* 左侧：归属笔记本分类 */}
        <div className="flex items-center space-x-2 text-xs text-gray-500" style={{ WebkitAppRegion: 'no-drag' }}>
          <Folder className="w-3.5 h-3.5 text-amber-500" />
          <select
            value={notebookId || ''}
            onChange={handleNotebookChange}
            className="bg-transparent text-gray-700 dark:text-gray-300 font-medium focus:outline-none cursor-pointer hover:text-blue-500 max-w-[180px] truncate"
          >
            <option value="">（未分类笔记本）</option>
            {notebooks.map(nb => (
              <option key={nb.id} value={nb.id}>{nb.name}</option>
            ))}
          </select>
        </div>

        {/* 右侧：脑图、AI 助手、锁管理与 Word 导出 */}
        <div className="flex items-center space-x-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
          {!note.is_locked ? (
            <button
              onClick={() => { setLockModalMode('lock'); setIsLockModalOpen(true); }}
              className="flex items-center space-x-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900 text-amber-600 dark:text-amber-300 rounded-md text-xs font-medium transition"
              title="设置密码锁定笔记"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden md:inline">加锁</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => onRelockNote(note.id)}
                className="flex items-center space-x-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-medium shadow-sm transition"
                title="立即锁定当前笔记"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden md:inline">立即锁定</span>
              </button>
              <button
                onClick={() => { setLockModalMode('unlock'); setIsLockModalOpen(true); }}
                className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md text-xs font-medium transition"
                title="解除密码锁定"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span className="hidden md:inline">解除密码</span>
              </button>
            </>
          )}

          <button
            onClick={() => onGenerateMindMap && onGenerateMindMap(editor?.getText() || '')}
            className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-300 rounded-md text-xs font-medium transition"
            title="一键生成 Mermaid 思维导图"
          >
            <Network className="w-3.5 h-3.5" />
            <span className="hidden md:inline">脑图</span>
          </button>

          <button
            onClick={() => onOpenAIChat && onOpenAIChat(note)}
            className="flex items-center space-x-1 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-xs font-medium shadow-sm transition"
            title="唤起 AI 智能副驾驶对话"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI 助手</span>
          </button>

          {/* 🌟 Word 导出下载按钮 */}
          <button
            onClick={handleExportWord}
            className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md text-xs font-medium transition"
            title="导出为 Word (.docx) 并同步保存在本地 data/uploads/exports 目录"
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            <span>导出 Word</span>
          </button>
        </div>
      </div>

      {/* 导出成功提示浮条 */}
      {exportSuccessTip && (
        <div className="bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 text-xs px-4 py-1.5 flex items-center justify-between border-b border-green-200 dark:border-green-800 animate-fadeIn">
          <div className="flex items-center space-x-1.5">
            <Check className="w-3.5 h-3.5" />
            <span>Word 文档已下载，并已同步保存在本地磁盘: <span className="font-mono font-bold">./data/uploads/exports/</span></span>
          </div>
        </div>
      )}

      {/* AI 分析中提示 */}
      {isAIAnalyzing && (
        <div className="bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 text-xs px-4 py-1.5 flex items-center space-x-2 border-b border-purple-200 dark:border-purple-800 animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>{aiActionTip}</span>
        </div>
      )}

      {/* 笔记标题与标签栏 */}
      <div className="px-8 pt-6 pb-2 shrink-0 space-y-3 bg-mac-editor dark:bg-mac-editorDark">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="无标题笔记"
          className="w-full text-2xl font-bold bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none tracking-tight"
        />

        {/* 标签栏与 AI 快捷算子 */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-b border-gray-100 dark:border-gray-800/80 pb-3">
          {/* 标签列表 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-gray-400 mr-0.5" />
            {tags.map((t, idx) => (
              <span
                key={idx}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 text-xs font-medium"
              >
                <span>#{t}</span>
                <button onClick={() => handleRemoveTag(t)} className="hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder="+ 标签 (回车添加)..."
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              className="bg-transparent text-xs text-gray-600 dark:text-gray-300 placeholder-gray-400 focus:outline-none w-28 px-1"
            />
          </div>

          {/* AI 快捷操作卡片 */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => handleRunAIAction('expand')}
              disabled={isAIAnalyzing}
              className="flex items-center space-x-1 px-2 py-1 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:hover:bg-cyan-900/60 text-cyan-600 dark:text-cyan-300 rounded text-xs transition font-medium"
              title="根据简要思路自动查询资料并深度扩写为结构化专业长文"
            >
              <BookOpenCheck className="w-3 h-3" />
              <span>AI 扩写</span>
            </button>
            <button
              onClick={() => handleRunAIAction('summary')}
              disabled={isAIAnalyzing}
              className="flex items-center space-x-1 px-2 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-600 dark:text-purple-300 rounded text-xs transition"
              title="生成笔记要点总结"
            >
              <Sparkles className="w-3 h-3" />
              <span>AI 摘要</span>
            </button>
            <button
              onClick={() => handleRunAIAction('polish')}
              disabled={isAIAnalyzing}
              className="flex items-center space-x-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 rounded text-xs transition"
              title="优化文字与修正语病"
            >
              <Wand2 className="w-3 h-3" />
              <span>智能润色</span>
            </button>
            <button
              onClick={() => handleRunAIAction('extract_tags')}
              disabled={isAIAnalyzing}
              className="flex items-center space-x-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-600 dark:text-amber-300 rounded text-xs transition"
              title="根据正文智能生成分类标签"
            >
              <Tag className="w-3 h-3" />
              <span>提炼标签</span>
            </button>
          </div>
        </div>
      </div>

      {/* 富文本所见即所得工具条 */}
      {editor && !editor.isDestroyed && (
        <div className="px-8 py-1.5 flex items-center space-x-1 border-b border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 text-xs shrink-0 bg-gray-50/50 dark:bg-gray-900/20">
          <button
            onClick={() => runEditorChain(chain => chain.toggleBold())}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFormatActive('bold') ? 'bg-gray-200 dark:bg-gray-700 text-blue-500 font-bold' : ''}`}
            title="粗体"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => runEditorChain(chain => chain.toggleItalic())}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFormatActive('italic') ? 'bg-gray-200 dark:bg-gray-700 text-blue-500' : ''}`}
            title="斜体"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3.5 bg-gray-300 dark:bg-gray-700 mx-1" />
          <button
            onClick={() => runEditorChain(chain => chain.toggleHeading({ level: 1 }))}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFormatActive('heading', { level: 1 }) ? 'bg-gray-200 dark:bg-gray-700 text-blue-500 font-bold' : ''}`}
            title="一级标题"
          >
            <Heading1 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => runEditorChain(chain => chain.toggleHeading({ level: 2 }))}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFormatActive('heading', { level: 2 }) ? 'bg-gray-200 dark:bg-gray-700 text-blue-500 font-bold' : ''}`}
            title="二级标题"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => runEditorChain(chain => chain.toggleHeading({ level: 3 }))}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFormatActive('heading', { level: 3 }) ? 'bg-gray-200 dark:bg-gray-700 text-blue-500 font-bold' : ''}`}
            title="三级标题"
          >
            <Heading3 className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3.5 bg-gray-300 dark:bg-gray-700 mx-1" />
          <button
            onClick={() => runEditorChain(chain => chain.toggleBulletList())}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFormatActive('bulletList') ? 'bg-gray-200 dark:bg-gray-700 text-blue-500' : ''}`}
            title="无序列表"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => runEditorChain(chain => chain.toggleOrderedList())}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFormatActive('orderedList') ? 'bg-gray-200 dark:bg-gray-700 text-blue-500' : ''}`}
            title="有序列表"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => runEditorChain(chain => chain.toggleCodeBlock())}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFormatActive('codeBlock') ? 'bg-gray-200 dark:bg-gray-700 text-blue-500' : ''}`}
            title="代码块"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => runEditorChain(chain => chain.toggleBlockquote())}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${isFormatActive('blockquote') ? 'bg-gray-200 dark:bg-gray-700 text-blue-500' : ''}`}
            title="引用块"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3.5 bg-gray-300 dark:bg-gray-700 mx-1" />
          <button
            onClick={handleManualImageUpload}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-blue-500"
            title="插入图片 (亦可直接 Cmd+V 粘贴截图)"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 所见即所得编辑正文区域 */}
      <div 
        className="flex-1 overflow-y-auto cursor-text bg-white dark:bg-gray-900" 
        onClick={() => {
          if (editor && !editor.isDestroyed) {
            try {
              editor.commands.focus();
            } catch (e) {}
          }
        }}
      >
        {editor && !editor.isDestroyed ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="p-8 text-gray-400 text-xs animate-pulse">正在准备编辑器...</div>
        )}
      </div>

      <LockModal
        isOpen={isLockModalOpen}
        onClose={() => setIsLockModalOpen(false)}
        mode={lockModalMode}
        onConfirm={handleLockModalConfirm}
      />
    </main>
  );
}

// 🌟 锁定屏组件
function LockScreen({ note, onVerifyPassword }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await onVerifyPassword(note.id, password);
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || err.message || '密码错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-mac-editor dark:bg-mac-editorDark select-none">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 max-w-sm w-full text-center space-y-6">
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-2">
          <Lock className="w-8 h-8 text-amber-500" />
        </div>
        
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 truncate px-4">
            {note.title || '无标题笔记'}
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            🔒 此笔记已加密锁定，请输入密码进行二次验证以查看正文
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入笔记密码"
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 pr-10"
              autoFocus
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && <div className="text-sm text-red-500 text-left">{error}</div>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? '验证中...' : '解锁笔记'}
          </button>
        </form>
      </div>
    </div>
  );
}

// 🌟 导出外层组件：无笔记时纯展示 EmptyEditor，有笔记时独立 key 隔离渲染
export default function Editor(props) {
  if (!props.note) {
    return <EmptyEditor />;
  }
  if (props.note.is_locked && !props.isUnlocked) {
    return <LockScreen note={props.note} onVerifyPassword={props.onVerifyPassword} />;
  }
  return <EditorCore key={props.note.id} {...props} />;
}
