import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import Editor from './components/Editor';
import ErrorBoundary from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';

const AudioStudio = lazy(() => import('./components/AudioStudio'));
const AICopilotModal = lazy(() => import('./components/AICopilotModal'));
const MindMapModal = lazy(() => import('./components/MindMapModal'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const SyncModal = lazy(() => import('./components/SyncModal'));
const GraphViewModal = lazy(() => import('./components/GraphViewModal'));
const MemoStreamView = lazy(() => import('./components/MemoStreamView'));
const ActivityHeatmap = lazy(() => import('./components/ActivityHeatmap'));
const DatabaseContainer = lazy(() => import('./components/database/DatabaseContainer'));
const AIConsultationView = lazy(() => import('./components/AIConsultationView'));
const EmbeddedWebAIView = lazy(() => import('./components/EmbeddedWebAIView'));
import { 
  getNotebooks, createNotebook, updateNotebook, deleteNotebook,
  getNotes, getNote, getNoteStats, createNote, updateNote, deleteNote, restoreNote, emptyTrash,
  getAudioRecords, lockNote, unlockNote, verifyNotePassword,
  cloneNote, batchImportNotes, getMemos,
  getDatabases, createDatabase, deleteDatabase, restoreDatabase
} from './api/client';
import { localDb } from './services/localDb';
import { loadPref, savePref } from './utils/persist';
import { requestNotifyPermission } from './utils/notify';

export default function App() {
  // 核心数据状态
  const [notebooks, setNotebooks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [memos, setMemos] = useState([]);
  const [databases, setDatabases] = useState([]);
  const [currentDatabaseId, setCurrentDatabaseId] = useState(null);
  const [currentNote, setCurrentNote] = useState(null);
  const [audioRecords, setAudioRecords] = useState([]);

  // 视图与导航状态
  const [currentView, setCurrentView] = useState(() => loadPref('currentView', 'all'));
  const [currentNotebookId, setCurrentNotebookId] = useState(() => loadPref('currentNotebookId', null));
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [darkMode, setDarkMode] = useState(() => loadPref('darkMode', false));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadPref('sidebarCollapsed', false));
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const restoreNoteIdRef = useRef(loadPref('lastNoteId', null));
  const didRestoreRef = useRef(false);
  const currentNoteRef = useRef(null);
  currentNoteRef.current = currentNote;

  // 统计数据
  const [totalCount, setTotalCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [starredCount, setStarredCount] = useState(0);

  // 弹窗状态
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isMindMapOpen, setIsMindMapOpen] = useState(false);
  const [mindMapContent, setMindMapContent] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const [isHeatmapModalOpen, setIsHeatmapModalOpen] = useState(false);

  // 初始化加载
  useEffect(() => {
    fetchNotebooks();
    fetchAudioRecords();
    fetchMemos();
    fetchDatabases();
    requestNotifyPermission();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearchKeyword(searchInput), 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    savePref('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    savePref('sidebarCollapsed', sidebarCollapsed);
    const width = sidebarCollapsed ? 56 : 256;
    if (window.webkit?.messageHandlers?.nativeApp) {
      window.webkit.messageHandlers.nativeApp.postMessage({ action: 'sidebarWidth', width });
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    savePref('currentView', currentView);
    savePref('currentNotebookId', currentNotebookId);
  }, [currentView, currentNotebookId]);

  useEffect(() => {
    if (currentNote?.id) savePref('lastNoteId', currentNote.id);
  }, [currentNote?.id]);

  const fetchDatabases = async () => {
    try {
      const list = await getDatabases({ is_archived: false, include_rows: false });
      setDatabases(list || []);
    } catch (err) {
      console.warn('Failed to fetch databases:', err);
    }
  };

  const handleCreateDatabase = async (title = '新数据表', icon = '📊') => {
    try {
      const newDb = await createDatabase({ title, icon });
      await fetchDatabases();
      setCurrentDatabaseId(newDb.id);
      setCurrentView('database');
    } catch (err) {
      alert('创建数据表失败: ' + err.message);
    }
  };

  // 移入废纸篓 (支持立即乐观更新消除延迟)
  const handleDeleteDatabase = async (deletedId) => {
    setDatabases(prev => prev.filter(db => db.id !== deletedId));
    if (currentDatabaseId === deletedId) {
      setCurrentDatabaseId(null);
      setCurrentView('all');
    }
    try {
      await deleteDatabase(deletedId);
      await fetchDatabases();
      await fetchNotes();
    } catch (err) {
      alert('移入废纸篓失败: ' + err.message);
      await fetchDatabases();
    }
  };

  const handleDatabaseDeleted = async (deletedId) => {
    setDatabases(prev => prev.filter(db => db.id !== deletedId));
    if (currentDatabaseId === deletedId) {
      setCurrentDatabaseId(null);
      setCurrentView('all');
    }
    await fetchDatabases();
    await fetchNotes();
  };

  const fetchMemos = async () => {
    try {
      let list;
      try {
        list = await getMemos();
      } catch (e) {
        list = await localDb.getMemos();
      }
      setMemos(list || []);
    } catch (err) {
      console.warn('Failed to fetch memos:', err);
    }
  };

  // 当视图、分类或搜索关键词变化时重新拉取笔记列表
  useEffect(() => {
    fetchNotes();
  }, [currentView, currentNotebookId, searchKeyword]);

  // 深色模式处理
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // 监听当前视图，通知原生客户端切换内嵌 Web 视图
  useEffect(() => {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nativeWebAI) {
      if (currentView === 'ai_doubao') {
        window.webkit.messageHandlers.nativeWebAI.postMessage({ action: 'show', target: 'doubao' });
      } else if (currentView === 'ai_deepseek') {
        window.webkit.messageHandlers.nativeWebAI.postMessage({ action: 'show', target: 'deepseek' });
      } else if (currentView === 'ai_kimi') {
        window.webkit.messageHandlers.nativeWebAI.postMessage({ action: 'show', target: 'kimi' });
      } else if (currentView === 'ai_grok') {
        window.webkit.messageHandlers.nativeWebAI.postMessage({ action: 'show', target: 'grok' });
      } else if (currentView === 'ai_gemini') {
        window.webkit.messageHandlers.nativeWebAI.postMessage({ action: 'show', target: 'gemini' });
      } else {
        window.webkit.messageHandlers.nativeWebAI.postMessage({ action: 'hide' });
      }
    }
  }, [currentView]);

  // 数据拉取函数
  const fetchNotebooks = async () => {
    try {
      const data = await getNotebooks();
      setNotebooks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch notebooks:', err);
    }
  };

  const fetchAudioRecords = async () => {
    try {
      const data = await getAudioRecords(null, { lite: true });
      setAudioRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch audio records:', err);
    }
  };

  const fetchNotesSeqRef = useRef(0);
  const fetchNotes = async () => {
    const seq = ++fetchNotesSeqRef.current;
    try {
      const params = {};
      if (searchKeyword.trim()) {
        params.keyword = searchKeyword.trim();
      }

      if (currentView === 'starred') {
        params.is_starred = true;
      } else if (currentView === 'trash') {
        params.is_trashed = true;
      } else if (currentView === 'notebook' && currentNotebookId) {
        params.notebook_id = currentNotebookId;
      }

      const notesPromise = getNotes(params);
      const statsPromise = getNoteStats().catch(() => null);
      const trashDbPromise = currentView === 'trash'
        ? getDatabases({ is_archived: true, include_rows: false }).catch(() => [])
        : Promise.resolve([]);

      const [noteList, stats, trashedDbs] = await Promise.all([notesPromise, statsPromise, trashDbPromise]);
      if (seq !== fetchNotesSeqRef.current) return;

      let safeNoteList = Array.isArray(noteList) ? noteList : [];

      const formattedTrashedDbs = (trashedDbs || []).map(db => ({
        id: db.id,
        title: `${db.icon || '📊'} ${db.title}`,
        content: db.description || `多维数据表 (包含 ${db.row_count ?? db.rows?.length ?? 0} 条记录)`,
        updated_at: db.updated_at,
        is_database: true,
        is_trashed: true,
        tags: ['多维数据表']
      }));

      if (currentView === 'trash') {
        safeNoteList = [...safeNoteList, ...formattedTrashedDbs];
      }
      setNotes(safeNoteList);

      if (safeNoteList.length > 0) {
        const restoreId = !didRestoreRef.current ? restoreNoteIdRef.current : null;
        didRestoreRef.current = true;
        const currentId = currentNoteRef.current?.id;
        if (restoreId && safeNoteList.some(n => n.id === restoreId)) {
          if (currentId !== restoreId) handleSelectNote(restoreId);
        } else if (!currentId || !safeNoteList.some(n => n.id === currentId)) {
          handleSelectNote(safeNoteList[0].id);
        }
      } else if (currentNoteRef.current) {
        setCurrentNote(null);
      }

      if (stats) {
        setTotalCount(stats.total || 0);
        setTrashCount((stats.trash || 0) + (trashedDbs || []).length);
        setStarredCount(stats.starred || 0);
      } else {
        setTotalCount(safeNoteList.filter(n => !n.is_trashed).length);
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    }
  };

  // 视图与笔记本切换
  const handleSelectView = (view) => {
    setCurrentView(view);
    setCurrentNotebookId(null);
  };

  const handleSelectNotebook = (nbId) => {
    setCurrentView('notebook');
    setCurrentNotebookId(nbId);
  };

  // 笔记本 CRUD (支持多级目录与递归删除)
  const handleCreateNotebook = async (name, parent_id = null) => {
    try {
      const newNb = await createNotebook({ name, parent_id: parent_id || null });
      const nbData = await getNotebooks();
      setNotebooks(Array.isArray(nbData) ? nbData : []);
      setCurrentView('notebook');
      setCurrentNotebookId(newNb.id);
      await fetchNotes();
    } catch (err) {
      alert('创建分类失败: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleUpdateNotebook = async (id, data) => {
    try {
      await updateNotebook(id, data);
      const nbData = await getNotebooks();
      setNotebooks(Array.isArray(nbData) ? nbData : []);
    } catch (err) {
      alert('更新分类失败: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteNotebook = async (id) => {
    try {
      await deleteNotebook(id);
      const nbData = await getNotebooks();
      setNotebooks(Array.isArray(nbData) ? nbData : []);
      
      const stillExists = nbData.some(n => n.id === currentNotebookId);
      if (!stillExists || currentNotebookId === id) {
        setCurrentView('all');
        setCurrentNotebookId(null);
      }
      await fetchNotes();
    } catch (err) {
      alert('删除分类失败: ' + (err.response?.data?.detail || err.message));
    }
  };

  // 笔记 CRUD
  const handleSelectNote = async (id) => {
    try {
      const alreadyOpen = currentNoteRef.current?.id === id && currentNoteRef.current?.content_json;
      if (alreadyOpen) return;
      if (currentNoteRef.current?.id && currentNoteRef.current.id !== id) {
        if (typeof window.__noteFlushSave === 'function') {
          await window.__noteFlushSave();
        }
      }
      if (unlockedNotesCache[id]) {
        setCurrentNote(unlockedNotesCache[id]);
        return;
      }
      const fullNote = await getNote(id);
      setCurrentNote(fullNote);
    } catch (err) {
      console.error('Failed to get note details:', err);
    }
  };

  const handleCreateNote = async () => {
    try {
      const newNote = await createNote({
        title: '无标题笔记',
        content: '',
        content_json: '',
        notebook_id: currentView === 'notebook' ? currentNotebookId : null
      });
      await fetchNotes();
      setCurrentNote(newNote);
    } catch (err) {
      alert('新建笔记失败: ' + err.message);
    }
  };

  const handleUpdateNote = async (id, data) => {
    try {
      const updated = await updateNote(id, data);
      setNotes(prev => prev.map(n => n.id === id ? {
        ...n,
        title: updated.title,
        summary: updated.summary,
        tags: updated.tags,
        notebook_id: updated.notebook_id,
        is_starred: updated.is_starred,
        updated_at: updated.updated_at,
        content: updated.summary || n.content,
        content_length: typeof updated.content_length === 'number' ? updated.content_length : n.content_length
      } : n));
      setCurrentNote(prev => {
        if (!prev || prev.id !== id) return prev;
        return {
          ...prev,
          title: data.title !== undefined ? updated.title : prev.title,
          tags: data.tags !== undefined ? updated.tags : prev.tags,
          notebook_id: data.notebook_id !== undefined ? updated.notebook_id : prev.notebook_id,
          is_starred: data.is_starred !== undefined ? updated.is_starred : prev.is_starred,
          summary: data.summary !== undefined ? updated.summary : prev.summary,
          is_locked: data.is_locked !== undefined ? updated.is_locked : prev.is_locked
        };
      });
      setUnlockedNotesCache(prev => {
        if (prev[id]) {
          return { ...prev, [id]: { ...prev[id], ...updated } };
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to auto-save note:', err);
    }
  };

  const handleMoveNoteToNotebook = async (noteId, notebookId) => {
    await handleUpdateNote(noteId, { notebook_id: notebookId });
  };

  const handleToggleStar = async (id, isStarred) => {
    try {
      await handleUpdateNote(id, { is_starred: isStarred });
      setStarredCount(prev => isStarred ? prev + 1 : prev - 1);
    } catch (err) {
      console.error('Failed to toggle star:', err);
    }
  };

  const handleDeleteNote = async (id, permanent = false) => {
    try {
      const target = notes.find(n => n.id === id);
      if (target?.is_database) {
        await deleteDatabase(id, permanent);
        await fetchDatabases();
      } else {
        await deleteNote(id, permanent);
      }
      await fetchNotes();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  const handleRestoreNote = async (id) => {
    try {
      const target = notes.find(n => n.id === id);
      if (target?.is_database) {
        await restoreDatabase(id);
        await fetchDatabases();
      } else {
        await restoreNote(id);
      }
      await fetchNotes();
    } catch (err) {
      alert('恢复失败: ' + err.message);
    }
  };

  const handleEmptyTrash = async () => {
    try {
      await emptyTrash();
      await fetchDatabases();
      await fetchNotes();
    } catch (err) {
      alert('清空废纸篓失败: ' + err.message);
    }
  };

  // 笔记加锁与解锁状态
  const [unlockedNoteIds, setUnlockedNoteIds] = useState([]);
  const [unlockedNotesCache, setUnlockedNotesCache] = useState({});

  const handleVerifyNotePassword = async (noteId, password) => {
    const fullNote = await verifyNotePassword(noteId, password);
    setCurrentNote(fullNote);
    setUnlockedNotesCache(prev => ({ ...prev, [noteId]: fullNote }));
    if (!unlockedNoteIds.includes(noteId)) {
      setUnlockedNoteIds(prev => [...prev, noteId]);
    }
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_locked: true, content: '', summary: '🔒 此重要笔记已设置密码锁定保护' } : n));
  };

  const handleLockNote = async (noteId, password) => {
    await lockNote(noteId, password);
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_locked: true, content: '', summary: '🔒 此重要笔记已设置密码锁定保护' } : n));
    setCurrentNote(prev => ({ ...prev, is_locked: true }));
    if (currentNote?.id === noteId) {
      setUnlockedNotesCache(prev => ({ ...prev, [noteId]: { ...currentNote, is_locked: true } }));
    }
    if (!unlockedNoteIds.includes(noteId)) {
      setUnlockedNoteIds(prev => [...prev, noteId]);
    }
  };

  const handleUnlockNote = async (noteId, password) => {
    const unlocked = await unlockNote(noteId, password);
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...unlocked, is_locked: false } : n));
    setCurrentNote(unlocked);
    setUnlockedNoteIds(prev => prev.filter(id => id !== noteId));
    setUnlockedNotesCache(prev => {
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
  };

  const handleRelockNote = async (noteId) => {
    setUnlockedNoteIds(prev => prev.filter(id => id !== noteId));
    setUnlockedNotesCache(prev => {
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
    try {
      const maskedNote = await getNote(noteId);
      setCurrentNote(maskedNote);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBatchImport = async (files) => {
    try {
      const targetNotebookId = (currentView === 'notebook' && currentNotebookId) ? currentNotebookId : null;
      const res = await batchImportNotes(files, targetNotebookId);
      if (Array.isArray(res) && res.length > 0) {
        if (['database', 'memos', 'audio_studio', 'trash'].includes(currentView)) {
          setCurrentView(targetNotebookId ? 'notebook' : 'all');
        }
        await fetchNotes();
        handleSelectNote(res[0].id);
        alert(`🎉 成功导入 ${res.length} 篇笔记！已自动为您打开。`);
      } else {
        alert('未能从所选文件中解析出有效文本内容，请确认文件格式为 Markdown、Word (.docx)、HTML 或 TXT 文档。');
      }
    } catch (err) {
      alert('批量导入失败: ' + err.message);
    }
  };

  const handleCloneNote = async (id) => {
    try {
      const cloned = await cloneNote(id);
      await fetchNotes();
      handleSelectNote(cloned.id);
    } catch (err) {
      alert('克隆笔记失败: ' + err.message);
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      const tag = (e.target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (meta && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsPaletteOpen(true);
        return;
      }
      if (meta && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
        return;
      }
      if (meta && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault();
        createNoteRef.current?.();
        return;
      }
      if (meta && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        document.getElementById('note-search-input')?.focus();
        return;
      }
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (typeof window.__noteFlushSave === 'function') window.__noteFlushSave();
        return;
      }
      if (meta && e.key === '\\') {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
        return;
      }
      if (e.key === 'Escape' && isPaletteOpen) {
        setIsPaletteOpen(false);
      }
      if (!meta && !typing && e.key === '/') {
        e.preventDefault();
        setIsPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPaletteOpen, currentView, currentNotebookId]);

  const createNoteRef = useRef(handleCreateNote);
  createNoteRef.current = handleCreateNote;

  useEffect(() => {
    window.__noteNative = {
      newNote: () => createNoteRef.current?.(),
      focusSearch: () => document.getElementById('note-search-input')?.focus(),
      openSettings: () => setIsSettingsOpen(true),
      saveNow: () => window.__noteFlushSave?.(),
      commandPalette: () => setIsPaletteOpen(true),
      toggleSidebar: () => setSidebarCollapsed((v) => !v),
      toggleDark: () => setDarkMode((v) => !v)
    };
    return () => { delete window.__noteNative; };
  }, []);

  // 思维导图与 AI 助手弹窗触发
  const handleOpenMindMap = (content) => {
    setMindMapContent(content);
    setIsMindMapOpen(true);
  };

  const handleInsertToNote = (textToInsert) => {
    if (!currentNote) return;
    if (typeof window.__noteInsertMarkdown === 'function') {
      window.__noteInsertMarkdown(textToInsert);
      return;
    }
    const newContent = (currentNote.content || '') + textToInsert;
    handleUpdateNote(currentNote.id, { content: newContent });
  };

  // 获取当前中间栏标题
  const getCurrentViewTitle = () => {
    if (currentView === 'starred') return '⭐ 我的收藏';
    if (currentView === 'trash') return '🗑️ 废纸篓';
    if (currentView === 'notebook' && currentNotebookId) {
      const nb = notebooks.find(n => n.id === currentNotebookId);
      return nb ? `📁 ${nb.name}` : '📁 笔记本';
    }
    return '📚 全部笔记';
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* 1. 左侧分类与导航栏 */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(v => !v)}
          onDropNote={handleMoveNoteToNotebook}
          notebooks={notebooks}
          currentView={currentView}
          currentNotebookId={currentNotebookId}
          onSelectView={handleSelectView}
          onSelectNotebook={handleSelectNotebook}
          onCreateNotebook={handleCreateNotebook}
          onUpdateNotebook={handleUpdateNotebook}
          onDeleteNotebook={handleDeleteNotebook}
          onOpenSettings={() => setIsSettingsOpen(true)}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(v => !v)}
          totalNotesCount={totalCount}
          trashNotesCount={trashCount}
          starredNotesCount={starredCount}
          audioRecordsCount={audioRecords.length}
          memosCount={memos.length}
          databases={databases}
          currentDatabaseId={currentDatabaseId}
          onSelectDatabase={(dbId) => {
            setCurrentDatabaseId(dbId);
            setCurrentNotebookId(null);
            setCurrentView('database');
          }}
          onCreateDatabase={handleCreateDatabase}
          onDeleteDatabase={handleDeleteDatabase}
          onOpenSyncModal={() => setIsSyncModalOpen(true)}
          onOpenGraphModal={() => setIsGraphModalOpen(true)}
          onOpenHeatmapModal={() => setIsHeatmapModalOpen(true)}
          onBatchImport={handleBatchImport}
        />

        {/* 2. 主区域：根据当前视图切换显示 笔记列表+编辑器 或 多维数据表 或 闪念速记流 或 录音工坊 或 AI 视图 */}
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-gray-400">正在加载视图...</div>}>
        {currentView === 'database' && currentDatabaseId ? (
          <DatabaseContainer
            databaseId={currentDatabaseId}
            onDatabaseDeleted={handleDatabaseDeleted}
          />
        ) : currentView === 'memos' ? (
          <MemoStreamView
            onNavigateToNote={async (noteId) => {
              await fetchNotes();
              setCurrentView('all');
              handleSelectNote(noteId);
            }}
          />
        ) : currentView === 'audio_studio' ? (
          <AudioStudio
            onNoteCreated={async (noteId) => {
              await fetchNotes();
              setCurrentView('all');
              handleSelectNote(noteId);
            }}
          />
        ) : currentView === 'ai_consultation' ? (
          <AIConsultationView onSaveToNote={async (title, content) => {
            try {
              const newNote = await createNote({
                title: title,
                content: content,
                content_json: '',
                notebook_id: null
              });
              await fetchNotes();
              setCurrentView('all');
              handleSelectNote(newNote.id);
            } catch (err) {
              alert('保存笔记失败: ' + err.message);
            }
          }} />
        ) : currentView === 'ai_doubao' ? (
          <EmbeddedWebAIView key="doubao" title="豆包" url="https://www.doubao.com/chat/" iconSrc="/icons/doubao.svg" />
        ) : currentView === 'ai_deepseek' ? (
          <EmbeddedWebAIView key="deepseek" title="DeepSeek" url="https://chat.deepseek.com/" iconSrc="/icons/deepseek.svg" />
        ) : currentView === 'ai_kimi' ? (
          <EmbeddedWebAIView key="kimi" title="Kimi" url="https://kimi.moonshot.cn/" iconSrc="/icons/kimi.svg" />
        ) : currentView === 'ai_grok' ? (
          <EmbeddedWebAIView key="grok" title="Grok" url="https://grok.com/" iconSrc="/icons/grok.svg" />
        ) : currentView === 'ai_gemini' ? (
          <EmbeddedWebAIView key="gemini" title="Gemini" url="https://gemini.google.com/" iconSrc="/icons/gemini.svg" />
        ) : (
          <>
            {/* 中间笔记卡片列表 */}
            <NoteList
              notes={notes}
              selectedNoteId={currentNote?.id}
              onSelectNote={handleSelectNote}
              onCreateNote={handleCreateNote}
              onToggleStar={handleToggleStar}
              onDeleteNote={handleDeleteNote}
              onRestoreNote={handleRestoreNote}
              onEmptyTrash={handleEmptyTrash}
              onBatchImport={handleBatchImport}
              isTrashView={currentView === 'trash'}
              searchKeyword={searchInput}
              onSearchChange={setSearchInput}
              currentViewTitle={getCurrentViewTitle()}
            />

            {/* 右侧主工作区编辑器 */}
            <Editor
              note={currentNote}
              allNotes={notes}
              notebooks={notebooks}
              onSelectNote={handleSelectNote}
              onUpdateNote={handleUpdateNote}
              onOpenAIChat={() => setIsAIChatOpen(true)}
              onGenerateMindMap={handleOpenMindMap}
              isUnlocked={currentNote ? unlockedNoteIds.includes(currentNote.id) : false}
              onVerifyPassword={handleVerifyNotePassword}
              onLockNote={handleLockNote}
              onUnlockNote={handleUnlockNote}
              onRelockNote={handleRelockNote}
              onCloneNote={handleCloneNote}
            />
          </>
        )}
        </Suspense>

        {/* 3. AI Copilot 侧边栏助手 */}
        <Suspense fallback={null}>
        <AICopilotModal
          isOpen={isAIChatOpen}
          onClose={() => setIsAIChatOpen(false)}
          currentNote={currentNote}
          onInsertToNote={handleInsertToNote}
        />

        {/* 4. Mermaid 思维导图弹窗 */}
        <MindMapModal
          isOpen={isMindMapOpen}
          onClose={() => setIsMindMapOpen(false)}
          initialContent={mindMapContent}
          onInsertToNote={handleInsertToNote}
        />

        {/* 5. AI 与偏好设置面板 */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />

        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          notes={notes}
          notebooks={notebooks}
          onSelectNote={async (id) => {
            setCurrentView('all');
            await handleSelectNote(id);
          }}
          onSelectNotebook={handleSelectNotebook}
          onCreateNote={handleCreateNote}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onToggleDarkMode={() => setDarkMode(v => !v)}
        />

        {/* 6. 多端局域网双向同步与配对弹窗 */}
        <SyncModal
          isOpen={isSyncModalOpen}
          onClose={() => setIsSyncModalOpen(false)}
          onSyncComplete={async () => {
            await fetchNotes();
            await fetchNotebooks();
            await fetchMemos();
          }}
        />

        {/* 7. 全局 2D 交互式知识关系图谱弹窗 */}
        {isGraphModalOpen && (
          <GraphViewModal
            isOpen={isGraphModalOpen}
            onClose={() => setIsGraphModalOpen(false)}
            onSelectNote={handleSelectNote}
          />
        )}
        </Suspense>

        {/* 8. 365 天创作打卡热力图浮层弹窗 */}
        {isHeatmapModalOpen && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn"
            onClick={() => setIsHeatmapModalOpen(false)}
          >
            <div 
              className="w-full max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Suspense fallback={<div className="text-xs text-white/80 p-6">正在加载热力图...</div>}>
                <ActivityHeatmap notes={notes} memos={memos} />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
