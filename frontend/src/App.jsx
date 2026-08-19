import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import Editor from './components/Editor';
import AudioStudio from './components/AudioStudio';
import AICopilotModal from './components/AICopilotModal';
import MindMapModal from './components/MindMapModal';
import SettingsModal from './components/SettingsModal';
import SyncModal from './components/SyncModal';
import ErrorBoundary from './components/ErrorBoundary';
import AIConsultationView from './components/AIConsultationView';
import EmbeddedWebAIView from './components/EmbeddedWebAIView';
import { 
  getNotebooks, createNotebook, updateNotebook, deleteNotebook,
  getNotes, getNote, createNote, updateNote, deleteNote, restoreNote, emptyTrash,
  getAudioRecords, analyzeContent, lockNote, unlockNote, verifyNotePassword,
  cloneNote, batchImportNotes
} from './api/client';

export default function App() {
  // 核心数据状态
  const [notebooks, setNotebooks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [currentNote, setCurrentNote] = useState(null);
  const [audioRecords, setAudioRecords] = useState([]);

  // 视图与导航状态
  const [currentView, setCurrentView] = useState('all'); // 'all', 'starred', 'trash', 'audio_studio', 'notebook'
  const [currentNotebookId, setCurrentNotebookId] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [darkMode, setDarkMode] = useState(false);

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

  // 初始化加载
  useEffect(() => {
    fetchNotebooks();
    fetchAudioRecords();
  }, []);

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
      const data = await getAudioRecords();
      setAudioRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch audio records:', err);
    }
  };

  const fetchNotes = async () => {
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

      const noteList = await getNotes(params);
      const safeNoteList = Array.isArray(noteList) ? noteList : [];
      setNotes(safeNoteList);

      // 同步选中第一篇笔记
      if (safeNoteList.length > 0) {
        if (!currentNote || !safeNoteList.some(n => n.id === currentNote.id)) {
          handleSelectNote(safeNoteList[0].id);
        }
      } else {
        setCurrentNote(null);
      }

      // 获取各分类计数
      const allNotes = await getNotes({ is_trashed: false });
      const trashed = await getNotes({ is_trashed: true });
      const starred = (Array.isArray(allNotes) ? allNotes : []).filter(n => n.is_starred);
      setTotalCount(Array.isArray(allNotes) ? allNotes.length : 0);
      setTrashCount(Array.isArray(trashed) ? trashed.length : 0);
      setStarredCount(starred.length);

      // 刷新笔记本数据以更新各笔记本 note_count
      const nbData = await getNotebooks();
      setNotebooks(Array.isArray(nbData) ? nbData : []);
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
      setNotes(notes.map(n => n.id === id ? { ...n, ...updated } : n));
      if (currentNote?.id === id) {
        setCurrentNote(prev => ({ ...prev, ...updated }));
      }
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
      await deleteNote(id, permanent);
      await fetchNotes();
    } catch (err) {
      alert('删除笔记失败: ' + err.message);
    }
  };

  const handleRestoreNote = async (id) => {
    try {
      await restoreNote(id);
      await fetchNotes();
    } catch (err) {
      alert('恢复笔记失败: ' + err.message);
    }
  };

  const handleEmptyTrash = async () => {
    try {
      await emptyTrash();
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
    setNotes(notes.map(n => n.id === noteId ? { ...n, is_locked: true, content: '', summary: '🔒 此重要笔记已设置密码锁定保护' } : n));
  };

  const handleLockNote = async (noteId, password) => {
    await lockNote(noteId, password);
    setNotes(notes.map(n => n.id === noteId ? { ...n, is_locked: true, content: '', summary: '🔒 此重要笔记已设置密码锁定保护' } : n));
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
    setNotes(notes.map(n => n.id === noteId ? { ...n, ...unlocked, is_locked: false } : n));
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
      const res = await batchImportNotes(files);
      await fetchNotes();
      alert(`成功导入 ${res.count || files.length} 篇笔记`);
      // 可以在这里选中第一篇导入的笔记
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

  // 思维导图与 AI 助手弹窗触发
  const handleOpenMindMap = (content) => {
    setMindMapContent(content);
    setIsMindMapOpen(true);
  };

  const handleInsertToNote = (textToInsert) => {
    if (!currentNote) return;
    const newContent = (currentNote.content || '') + textToInsert;
    handleUpdateNote(currentNote.id, { content: newContent, content_json: null });
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
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          totalNotesCount={totalCount}
          trashNotesCount={trashCount}
          starredNotesCount={starredCount}
          audioRecordsCount={audioRecords.length}
          onOpenSyncModal={() => setIsSyncModalOpen(true)}
          onBatchImport={handleBatchImport}
        />

        {/* 2. 主区域：根据当前视图切换显示 笔记列表+编辑器 或 录音工坊 或 AI 视图 */}
        {currentView === 'audio_studio' ? (
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
              isTrashView={currentView === 'trash'}
              searchKeyword={searchKeyword}
              onSearchChange={setSearchKeyword}
              currentViewTitle={getCurrentViewTitle()}
            />

            {/* 右侧主工作区编辑器 */}
            <Editor
              note={currentNote}
              notebooks={notebooks}
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

        {/* 3. AI Copilot 侧边栏助手 */}
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

        {/* 6. 多端局域网双向同步与配对弹窗 */}
        <SyncModal
          isOpen={isSyncModalOpen}
          onClose={() => setIsSyncModalOpen(false)}
          onSyncComplete={async () => {
            await fetchNotes();
            await fetchNotebooks();
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
