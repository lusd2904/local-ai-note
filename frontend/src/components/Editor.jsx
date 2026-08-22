import React, { useState, useEffect, useRef } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import {
  Sparkles, Wand2, Tag, Folder, Network, Bot, Download, Check, RefreshCw, X, FileText,
  Lock, Unlock, Eye, EyeOff, BookOpenCheck, Copy, Edit3, ChevronDown, CheckCheck,
  Link2, BookOpen, Image as ImageIcon, Type
} from 'lucide-react';
import { uploadImage, streamAIAnalyze, getNoteBacklinks } from '../api/client';
import LockModal from './LockModal';
import {
  tiptapJsonToMarkdown,
  makeSummary,
  isBlockNoteDocument,
  isTiptapDocument
} from '../utils/markdown';

function maybeAwait(value) {
  return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

async function resolveInitialBlocks(editor, note) {
  if (note?.content_json) {
    try {
      const parsed = JSON.parse(note.content_json);
      if (isBlockNoteDocument(parsed)) return parsed;
      if (isTiptapDocument(parsed)) {
        const md = tiptapJsonToMarkdown(parsed) || note.content || '';
        if (md.trim()) return maybeAwait(editor.tryParseMarkdownToBlocks(md));
      }
    } catch (e) {
      // 回退到 Markdown
    }
  }
  const md = note?.content || '';
  if (!md.trim()) return null;
  return maybeAwait(editor.tryParseMarkdownToBlocks(md));
}

async function replaceEditorMarkdown(editor, markdown) {
  const blocks = await maybeAwait(editor.tryParseMarkdownToBlocks(markdown || ''));
  if (blocks && blocks.length > 0) {
    editor.replaceBlocks(editor.document, blocks);
  }
}

async function appendEditorMarkdown(editor, markdown) {
  const blocks = await maybeAwait(editor.tryParseMarkdownToBlocks(markdown || ''));
  if (!blocks || blocks.length === 0) return;
  const last = editor.document[editor.document.length - 1];
  if (last) {
    editor.insertBlocks(blocks, last, 'after');
  } else {
    editor.replaceBlocks(editor.document, blocks);
  }
}

/**
 * 🌟 万能 AI 标签提取解析器：
 * 兼容标准 JSON 数组、Markdown 代码块、#标签、列表格式、顿号逗号分隔等多种输出形式
 */
export function parseTagsFromAIResponse(resText) {
  if (!resText || typeof resText !== 'string') return [];
  const text = resText.trim();

  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const normalizedJson = jsonMatch[0].replace(/'/g, '"');
      const parsed = JSON.parse(normalizedJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(t => String(t).replace(/^[#\s]+/, '').trim()).filter(Boolean);
      }
    } catch (e) {}
  }

  const hashTags = text.match(/#([\w\u4e00-\u9fa5\-]+)/g);
  if (hashTags && hashTags.length > 0) {
    return hashTags.map(t => t.replace(/^#/, '').trim()).filter(Boolean);
  }

  const listItems = text.split('\n')
    .map(line => line.replace(/^[\s*\-•\d\.\、]+/, '').trim())
    .map(line => line.replace(/^["'“”‘’]|["'“”‘’]$/g, '').trim())
    .filter(line => line && line.length <= 20 && !line.includes('：') && !line.includes(':') && !line.includes('如下'));
  if (listItems.length > 1) {
    return listItems.slice(0, 6);
  }

  if (text.includes('、') || text.includes(',')) {
    const splitTags = text.split(/[、,，\n]+/)
      .map(t => t.replace(/^[\s*\-•\d\.\、"']+|["'“”‘’]$/g, '').trim())
      .filter(t => t && t.length <= 20 && !t.includes('如下'));
    if (splitTags.length > 0) {
      return splitTags.slice(0, 6);
    }
  }

  if (listItems.length === 1) {
    return listItems;
  }

  return [];
}

function EmptyEditor() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-mac-editor dark:bg-mac-editorDark text-gray-400 select-none">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto shadow-inner text-gray-300 dark:text-gray-600">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-gray-600 dark:text-gray-300">请选择或新建一篇笔记</h3>
        <p className="text-xs text-gray-400">支持块级富文本、斜杠命令、截图粘贴、Claude 智能分析与 Word 导出</p>
      </div>
    </div>
  );
}

function EditorCore({
  note,
  notebooks = [],
  onUpdateNote,
  onOpenAIChat,
  onGenerateMindMap,
  isUnlocked,
  onLockNote,
  onUnlockNote,
  onRelockNote,
  onCloneNote,
  allNotes = [],
  onSelectNote
}) {
  const darkMode = useDarkMode();
  const [title, setTitle] = useState(note?.title || '');
  const [notebookId, setNotebookId] = useState(note?.notebook_id || '');
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [lockModalMode, setLockModalMode] = useState('lock');
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const [backlinks, setBacklinks] = useState([]);
  const [showBacklinks, setShowBacklinks] = useState(true);
  const [isLinkPickerOpen, setIsLinkPickerOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');

  useEffect(() => {
    if (!note?.id) return;
    loadBacklinks();
  }, [note?.id]);

  const loadBacklinks = async () => {
    try {
      const res = await getNoteBacklinks(note.id);
      setBacklinks(res.backlinks || []);
    } catch (e) {
      const currentTitle = note?.title?.trim()?.toLowerCase();
      if (!currentTitle) return;
      const matched = [];
      (allNotes || []).forEach(n => {
        if (n.id !== note.id && n.content && n.content.toLowerCase().includes(`[[${currentTitle}]]`)) {
          matched.push({
            note_id: n.id,
            note_title: n.title || '无标题笔记',
            snippet: n.content.slice(0, 80),
            updated_at: n.updated_at
          });
        }
      });
      setBacklinks(matched);
    }
  };

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
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    setTags(getInitialTags());
  }, [note?.id, note?.tags]);

  const [showPolishMenu, setShowPolishMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const polishMenuRef = useRef(null);
  const exportMenuRef = useRef(null);

  const saveTimeoutRef = useRef(null);
  const noteIdRef = useRef(note?.id);
  const editorRef = useRef(null);
  const onUpdateNoteRef = useRef(onUpdateNote);
  const lastSavedJsonRef = useRef('');
  const allowSaveRef = useRef(false);
  const hydratedRef = useRef(false);
  noteIdRef.current = note?.id;
  onUpdateNoteRef.current = onUpdateNote;

  const editor = useCreateBlockNote({
    uploadFile: async (file) => {
      const data = await uploadImage(file);
      if (!data?.url) throw new Error('图片上传失败');
      return data.url;
    }
  }, [note?.id]);

  editorRef.current = editor;

  const buildPayloadFromEditor = async (ed) => {
    if (!ed) return null;
    const markdown = await maybeAwait(ed.blocksToMarkdownLossy(ed.document));
    return {
      content: markdown,
      content_json: JSON.stringify(ed.document),
      summary: makeSummary(markdown)
    };
  };

  const persistPayload = (payload) => {
    const id = noteIdRef.current;
    if (!payload || !id || !onUpdateNoteRef.current) return Promise.resolve();
    if (payload.content_json === lastSavedJsonRef.current) return Promise.resolve();
    lastSavedJsonRef.current = payload.content_json;
    return onUpdateNoteRef.current(id, payload);
  };

  const flushSave = async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (!allowSaveRef.current || !editorRef.current) return;
    const payload = await buildPayloadFromEditor(editorRef.current);
    return persistPayload(payload);
  };

  const scheduleSave = () => {
    if (!allowSaveRef.current) return;
    const activeId = noteIdRef.current;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (noteIdRef.current !== activeId || !editorRef.current) return;
      const payload = await buildPayloadFromEditor(editorRef.current);
      persistPayload(payload);
    }, 800);
  };

  useEffect(() => {
    allowSaveRef.current = false;
    hydratedRef.current = false;
    setEditorReady(false);
    lastSavedJsonRef.current = note?.content_json || '';
    window.__noteFlushSave = flushSave;
    window.__noteInsertMarkdown = async (text) => {
      if (!editorRef.current) return;
      await appendEditorMarkdown(editorRef.current, text);
      const payload = await buildPayloadFromEditor(editorRef.current);
      persistPayload(payload);
    };

    let cancelled = false;
    (async () => {
      try {
        const blocks = await resolveInitialBlocks(editor, note);
        if (cancelled) return;
        if (blocks && blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
        lastSavedJsonRef.current = JSON.stringify(editor.document);
        hydratedRef.current = true;
        setEditorReady(true);
        setTimeout(() => { allowSaveRef.current = true; }, 400);
      } catch (err) {
        console.warn('Failed to hydrate editor:', err);
        setEditorReady(true);
        allowSaveRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(saveTimeoutRef.current);
      flushSave();
      if (window.__noteFlushSave === flushSave) delete window.__noteFlushSave;
      if (window.__noteInsertMarkdown) delete window.__noteInsertMarkdown;
    };
  }, [editor, note?.id]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (polishMenuRef.current && !polishMenuRef.current.contains(e.target)) {
        setShowPolishMenu(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (note && onUpdateNote) onUpdateNote(note.id, { title: val });
    }, 600);
  };

  const handleNotebookChange = (e) => {
    const newNbId = e.target.value || null;
    setNotebookId(newNbId);
    if (note && onUpdateNote) onUpdateNote(note.id, { notebook_id: newNbId });
  };

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

  const handleManualImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file || !editor) return;
      try {
        const data = await uploadImage(file);
        if (data?.url) {
          const last = editor.document[editor.document.length - 1];
          editor.insertBlocks([{ type: 'image', props: { url: data.url } }], last, 'after');
        }
      } catch (err) {
        alert('上传图片失败: ' + err.message);
      }
    };
    input.click();
  };

  const actionLabel = (action) => {
    if (action === 'expand') return '深度扩写';
    if (action === 'summary') return '智能摘要';
    if (action.startsWith('polish')) return '润色优化';
    if (action === 'continue') return '续写';
    if (action === 'auto_format') return '格式化';
    if (action === 'correct') return '语法纠错';
    if (action === 'extract_tags') return '提炼标签';
    return action;
  };

  const handleRunAIAction = async (action) => {
    if (!editor || !note) return;
    const contentText = await maybeAwait(editor.blocksToMarkdownLossy(editor.document));
    if (!contentText.trim()) {
      alert('当前笔记暂无文字内容，无法进行 AI 分析。');
      return;
    }
    setIsAIAnalyzing(true);
    setAiActionTip(`正在执行 AI ${actionLabel(action)}...`);

    try {
      let accumulatedText = '';
      await streamAIAnalyze(
        { content: contentText, action },
        (chunk) => {
          accumulatedText += chunk;
          setAiActionTip(`🌊 正在流式生成 AI ${actionLabel(action)} (${accumulatedText.length} 字)...`);
        },
        async () => {
          const resText = accumulatedText.trim();
          if (!resText || !editor) return;

          if (action === 'extract_tags') {
            const parsed = parseTagsFromAIResponse(resText);
            if (parsed && parsed.length > 0) {
              const currentTags = getInitialTags();
              const merged = Array.from(new Set([...currentTags, ...parsed]));
              setTags(merged);
              if (onUpdateNote) onUpdateNote(note.id, { tags: merged });
              setAiActionTip(`✅ 已提炼并关联 ${parsed.length} 个新标签：${parsed.join('、')}`);
              setTimeout(() => setAiActionTip(''), 4000);
            } else {
              setAiActionTip('⚠️ 未能从 AI 返回结果中解析出标签');
              setTimeout(() => setAiActionTip(''), 4000);
            }
            return;
          }

          if (action === 'summary') {
            await appendEditorMarkdown(editor, `> 🤖 **AI 核心要点总结：**\n>\n> ${resText.replace(/\n/g, '\n> ')}`);
          } else if (action === 'continue') {
            await appendEditorMarkdown(editor, resText);
          } else {
            await replaceEditorMarkdown(editor, resText);
          }

          const payload = await buildPayloadFromEditor(editor);
          if (onUpdateNote && payload) {
            onUpdateNote(note.id, action === 'summary' ? { ...payload, summary: resText.slice(0, 150) } : payload);
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

  const handleLockModalConfirm = async (password) => {
    if (lockModalMode === 'lock') {
      await onLockNote(note.id, password);
    } else {
      await onUnlockNote(note.id, password);
    }
  };

  const handleWikiClick = (e) => {
    const raw = (e.target?.textContent || '').trim();
    const match = raw.match(/\[\[([^\]]+)\]\]/);
    if (!match) return;
    const targetTitle = match[1];
    const matched = (allNotes || []).find(n =>
      n.title?.trim()?.toLowerCase() === targetTitle.trim().toLowerCase() || n.id === targetTitle
    );
    if (matched && onSelectNote) onSelectNote(matched.id);
  };

  const insertWikiLink = (targetNote) => {
    if (!editor) return;
    editor.focus();
    editor.insertInlineContent(`[[${targetNote.title || '无标题笔记'}]]`);
    setIsLinkPickerOpen(false);
    setLinkSearch('');
  };

  return (
    <main className="flex-1 bg-mac-editor dark:bg-mac-editorDark flex flex-col h-screen overflow-hidden transition-colors editor-panel">
      <div
        style={{ WebkitAppRegion: 'drag' }}
        className="h-12 px-4 border-b border-mac-border dark:border-mac-borderDark flex items-center justify-between gap-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur shrink-0 cursor-default"
      >
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
            onClick={async () => {
              const text = editor ? await maybeAwait(editor.blocksToMarkdownLossy(editor.document)) : '';
              onGenerateMindMap && onGenerateMindMap(text);
            }}
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

          <button
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md text-xs font-medium transition"
            title="切换阅读预览/编辑模式"
          >
            {isPreviewMode ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{isPreviewMode ? '编辑' : '阅读'}</span>
          </button>

          <button
            onClick={() => onCloneNote && onCloneNote(note.id)}
            className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md text-xs font-medium transition"
            title="创建笔记副本"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden md:inline">复制副本</span>
          </button>

          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowExportMenu(!showExportMenu);
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                showExportMenu
                  ? 'bg-gray-200 dark:bg-gray-700 text-blue-600 font-semibold'
                  : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
              }`}
              title="导出笔记"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span>导出</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showExportMenu && (
              <div className="absolute flex flex-col right-0 top-full mt-1 bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden z-50 w-32 py-1 animate-fadeIn">
                {[
                  ['docx', '📄', 'Word (.docx)'],
                  ['md', '📝', 'Markdown'],
                  ['html', '🌐', 'HTML'],
                  ['txt', '📄', '纯文本']
                ].map(([fmt, icon, label]) => (
                  <button
                    key={fmt}
                    onClick={() => {
                      window.location.href = `/api/notes/${note.id}/export/${fmt}`;
                      if (fmt === 'docx') {
                        setExportSuccessTip(true);
                        setTimeout(() => setExportSuccessTip(false), 4000);
                      }
                      setShowExportMenu(false);
                    }}
                    className="px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 hover:text-blue-600 transition flex items-center space-x-1.5"
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {exportSuccessTip && (
        <div className="bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 text-xs px-4 py-1.5 flex items-center justify-between border-b border-green-200 dark:border-green-800 animate-fadeIn">
          <div className="flex items-center space-x-1.5">
            <Check className="w-3.5 h-3.5" />
            <span>Word 文档已下载，并已同步保存在本地磁盘: <span className="font-mono font-bold">./data/uploads/exports/</span></span>
          </div>
        </div>
      )}

      {isAIAnalyzing && (
        <div className="bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 text-xs px-4 py-1.5 flex items-center space-x-2 border-b border-purple-200 dark:border-purple-800 animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>{aiActionTip}</span>
        </div>
      )}

      <div className="px-8 pt-6 pb-2 shrink-0 space-y-3 bg-mac-editor dark:bg-mac-editorDark">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="无标题笔记"
          readOnly={isPreviewMode}
          className="w-full text-2xl font-bold bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none tracking-tight"
        />

        {!isPreviewMode && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-b border-gray-100 dark:border-gray-800/80 pb-3">
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

            <div className="flex items-center space-x-1 relative group">
              <button
                onClick={() => handleRunAIAction('continue')}
                disabled={isAIAnalyzing}
                className="flex items-center space-x-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 rounded text-xs transition font-medium"
                title="从文末无缝流式插入生成内容"
              >
                <span>⚡️ AI 续写</span>
              </button>
              <button
                onClick={() => handleRunAIAction('auto_format')}
                disabled={isAIAnalyzing}
                className="flex items-center space-x-1 px-2 py-1 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:hover:bg-cyan-900/60 text-cyan-600 dark:text-cyan-300 rounded text-xs transition font-medium"
                title="自动重构为结构规范的 Markdown"
              >
                <span>🧹 一键格式化</span>
              </button>
              <button
                onClick={() => handleRunAIAction('correct')}
                disabled={isAIAnalyzing}
                className="flex items-center space-x-1 px-2 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 rounded text-xs transition"
                title="修正错别字与语病"
              >
                <span>🔍 语法纠错</span>
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
              <div className="relative" ref={polishMenuRef}>
                <button
                  disabled={isAIAnalyzing}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPolishMenu(!showPolishMenu);
                  }}
                  className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition ${
                    showPolishMenu
                      ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 font-semibold'
                      : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300'
                  }`}
                  title="优化文字与修正语病"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>智能润色</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showPolishMenu && (
                  <div className="absolute flex flex-col right-0 top-full mt-1 bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden z-50 w-36 py-1 animate-fadeIn">
                    {[
                      ['polish_formal', '💼', '商务正式'],
                      ['polish_concise', '⚡️', '极简精炼'],
                      ['polish_casual', '💬', '轻松口语'],
                      ['polish_academic', '🎓', '学术专业']
                    ].map(([act, icon, label]) => (
                      <button
                        key={act}
                        onClick={() => {
                          handleRunAIAction(act);
                          setShowPolishMenu(false);
                        }}
                        className="px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-gray-700 hover:text-emerald-600 transition flex items-center space-x-1.5"
                      >
                        <span>{icon}</span>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
        )}
      </div>

      {!isPreviewMode && (
        <div className="px-8 py-1.5 flex items-center space-x-2 border-b border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 text-xs shrink-0 bg-gray-50/50 dark:bg-gray-900/20">
          <Type className="w-3.5 h-3.5 text-blue-500" />
          <span>输入 <kbd className="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono">/</kbd> 插入标题、列表、待办、表格、代码块</span>
          <div className="w-px h-3.5 bg-gray-300 dark:bg-gray-700 mx-1" />
          <button
            onClick={handleManualImageUpload}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-blue-500"
            title="插入图片 (亦可直接 Cmd+V 粘贴截图)"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsLinkPickerOpen(true)}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-blue-500"
            title="插入 [[双向链接]] 关联已有笔记"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleRunAIAction('polish')}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-emerald-500 flex items-center space-x-1"
            title="润色全文"
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleRunAIAction('expand')}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-cyan-500 flex items-center space-x-1"
            title="扩写全文"
          >
            <BookOpenCheck className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleRunAIAction('correct')}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-red-500 flex items-center space-x-1"
            title="语法纠错"
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto cursor-text bg-white dark:bg-gray-900" onClick={handleWikiClick}>
        {!editorReady ? (
          <div className="p-8 text-gray-400 text-xs animate-pulse">正在准备编辑器...</div>
        ) : (
          <>
            <div className="bn-note-shell px-4 md:px-8 py-4">
              <BlockNoteView
                editor={editor}
                theme={darkMode ? 'dark' : 'light'}
                editable={!isPreviewMode}
                onChange={() => {
                  if (!hydratedRef.current) return;
                  scheduleSave();
                }}
              />
            </div>

            <div className="mx-8 my-8 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div
                className="p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/80 space-y-3 cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between cursor-pointer select-none"
                  onClick={() => setShowBacklinks(!showBacklinks)}
                >
                  <div className="flex items-center space-x-2 text-xs font-bold text-gray-700 dark:text-gray-300">
                    <Link2 className="w-4 h-4 text-blue-500" />
                    <span>反向引用 (Backlinks)</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-mono">
                      {backlinks.length}
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showBacklinks ? '' : '-rotate-90'}`} />
                </div>

                {showBacklinks && (
                  backlinks.length === 0 ? (
                    <p className="text-xs text-gray-400 leading-relaxed">
                      暂无其他笔记引用此篇。在其他笔记中输入 <span className="font-mono text-blue-500">[[{note.title || '标题'}]]</span> 即可自动建立双向知识网！
                    </p>
                  ) : (
                    <div className="space-y-2 pt-1">
                      {backlinks.map(bl => (
                        <div
                          key={bl.note_id}
                          onClick={() => onSelectNote && onSelectNote(bl.note_id)}
                          className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700 hover:border-blue-500 hover:shadow-xs cursor-pointer transition text-xs space-y-1"
                        >
                          <div className="font-bold text-blue-600 dark:text-blue-400 flex items-center space-x-1.5">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>{bl.note_title}</span>
                          </div>
                          <p className="text-gray-500 dark:text-gray-400 line-clamp-2 text-[11px] leading-relaxed font-normal">
                            {bl.snippet}
                          </p>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {isLinkPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setIsLinkPickerOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-900 dark:text-white">
                <Link2 className="w-4 h-4 text-blue-500" />
                <span>插入双向链接 (Internal Link)</span>
              </div>
              <button onClick={() => setIsLinkPickerOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              placeholder="搜索要链接的目标笔记标题..."
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-blue-500"
              autoFocus
            />

            <div className="max-h-48 overflow-y-auto space-y-1">
              {(allNotes || [])
                .filter(n => n.id !== note.id && (!linkSearch || n.title.toLowerCase().includes(linkSearch.toLowerCase())))
                .map(n => (
                  <button
                    key={n.id}
                    onClick={() => insertWikiLink(n)}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-blue-50 dark:hover:bg-gray-800 hover:text-blue-600 transition flex items-center space-x-2 text-gray-700 dark:text-gray-200"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate font-medium">{n.title || '无标题笔记'}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      <LockModal
        isOpen={isLockModalOpen}
        onClose={() => setIsLockModalOpen(false)}
        mode={lockModalMode}
        onConfirm={handleLockModalConfirm}
      />
    </main>
  );
}

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

export default function Editor(props) {
  if (!props.note) {
    return <EmptyEditor />;
  }
  if (props.note.is_locked && !props.isUnlocked) {
    return <LockScreen note={props.note} onVerifyPassword={props.onVerifyPassword} />;
  }
  return <EditorCore key={props.note.id} {...props} />;
}
