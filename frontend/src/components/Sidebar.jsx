import React, { useState } from 'react';
import { 
  BookOpen, Folder, FolderPlus, Star, Trash2, Mic, 
  Settings, Moon, Sun, ChevronRight, ChevronDown, Plus, 
  Edit2, Check, X, CornerDownRight, Bot, Sparkles, ExternalLink, Globe,
  ArrowRightLeft, Zap, Share2, Flame, Table
} from 'lucide-react';

// 将扁平笔记本数组转换为树形结构
function buildTree(list, parentId = null) {
  return list
    .filter(item => {
      const pid = item.parent_id || null;
      return pid === parentId;
    })
    .map(item => ({
      ...item,
      children: buildTree(list, item.id)
    }));
}

// 递归渲染多级笔记本节点
function NotebookTreeNode({
  node,
  level = 0,
  currentView,
  currentNotebookId,
  onSelectNotebook,
  onOpenCreateModal,
  onUpdateNotebook,
  onDeleteNotebook
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isSelected = currentView === 'notebook' && currentNotebookId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  const handleEditSubmit = (e) => {
    e?.preventDefault();
    if (!editName.trim()) return;
    onUpdateNotebook(node.id, { name: editName.trim() });
    setIsEditing(false);
  };

  const handleTriggerDelete = (e) => {
    e.stopPropagation();
    setConfirmDelete(true);
  };

  const handleConfirmDelete = (e) => {
    e.stopPropagation();
    onDeleteNotebook(node.id);
    setConfirmDelete(false);
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setConfirmDelete(false);
  };

  return (
    <div className="select-none">
      <div
        className={`group relative flex items-center justify-between py-1.5 pr-2 rounded-lg text-sm transition-all ${
          isSelected
            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {isEditing ? (
          <form onSubmit={handleEditSubmit} className="flex items-center space-x-1 flex-1 pr-1" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex-1 bg-white dark:bg-gray-800 border border-blue-400 rounded px-1.5 py-0.5 text-xs focus:outline-none dark:text-white"
            />
            <button type="submit" className="text-green-600 p-0.5 hover:bg-green-50 rounded">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setIsEditing(false)} className="text-gray-400 p-0.5 hover:bg-gray-200 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : confirmDelete ? (
          <div className="flex items-center justify-between w-full bg-red-50 dark:bg-red-950/40 px-2 py-1 rounded text-xs text-red-600 dark:text-red-300" onClick={e => e.stopPropagation()}>
            <span className="truncate mr-1 text-[11px] font-medium">确认删除?</span>
            <div className="flex items-center space-x-1">
              <button 
                onClick={handleConfirmDelete} 
                className="px-1.5 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded text-[10px] font-bold"
              >
                删除
              </button>
              <button 
                onClick={handleCancelDelete} 
                className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded text-[10px]"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              onClick={() => onSelectNotebook(node.id)}
              className="flex items-center space-x-1.5 flex-1 min-w-0 cursor-pointer"
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                  className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              ) : level > 0 ? (
                <CornerDownRight className="w-3 h-3 text-gray-400 shrink-0" />
              ) : (
                <span className="w-3" />
              )}
              <Folder className={`w-4 h-4 shrink-0 ${level > 0 ? 'text-amber-400' : 'text-amber-500'}`} />
              <span className="truncate text-xs">{node.name}</span>
            </div>

            {/* 操作按钮区：选中时始终显示，未选中时 hover 显示 */}
            <div className={`items-center space-x-0.5 shrink-0 ${isSelected ? 'flex' : 'hidden group-hover:flex'}`} style={{ WebkitAppRegion: 'no-drag' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCreateModal(node.id);
                }}
                className="p-1 text-gray-400 hover:text-blue-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
                title={`在「${node.name}」下新建子分类`}
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setEditName(node.name);
                }}
                className="p-1 text-gray-400 hover:text-blue-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
                title="重命名"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={handleTriggerDelete}
                className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
                title="删除分类"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            
            {!isSelected && (
              <span className="text-[11px] text-gray-400 font-mono group-hover:hidden px-1 shrink-0">
                {node.note_count || 0}
              </span>
            )}
          </>
        )}
      </div>

      {/* 递归渲染子文件夹 */}
      {hasChildren && isExpanded && (
        <div className="space-y-0.5 relative">
          <div 
            className="absolute left-0 top-0 bottom-0 border-l border-gray-200 dark:border-gray-800"
            style={{ left: `${level * 16 + 14}px` }}
          />
          {node.children.map(child => (
            <NotebookTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              currentView={currentView}
              currentNotebookId={currentNotebookId}
              onSelectNotebook={onSelectNotebook}
              onOpenCreateModal={onOpenCreateModal}
              onUpdateNotebook={onUpdateNotebook}
              onDeleteNotebook={onDeleteNotebook}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  notebooks = [],
  currentView,
  currentNotebookId,
  onSelectView,
  onSelectNotebook,
  onCreateNotebook,
  onUpdateNotebook,
  onDeleteNotebook,
  onOpenSettings,
  darkMode,
  onToggleDarkMode,
  totalNotesCount,
  trashNotesCount,
  starredNotesCount,
  audioRecordsCount,
  memosCount = 0,
  databases = [],
  currentDatabaseId = null,
  onSelectDatabase,
  onCreateDatabase,
  onOpenSyncModal,
  onOpenGraphModal,
  onOpenHeatmapModal,
  onBatchImport
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalParentId, setModalParentId] = useState('');
  const [modalName, setModalName] = useState('');
  
  // 🌟 新建多维数据表弹窗状态
  const [isCreateDbModalOpen, setIsCreateDbModalOpen] = useState(false);
  const [dbModalTitle, setDbModalTitle] = useState('');
  const [dbModalIcon, setDbModalIcon] = useState('📊');

  const [notebooksExpanded, setNotebooksExpanded] = useState(true);
  const [databasesExpanded, setDatabasesExpanded] = useState(true);
  const [aiSectionExpanded, setAiSectionExpanded] = useState(true);

  const notebookTree = buildTree(notebooks || []);

  // 打开创建分类弹窗
  const handleOpenCreateModal = (defaultParentId = null) => {
    // 若传了指定父级就用指定的，否则若当前正好选中了某个笔记本，则默认作为该笔记本的子级
    const selectedPid = defaultParentId !== null 
      ? defaultParentId 
      : (currentView === 'notebook' && currentNotebookId ? currentNotebookId : '');
    setModalParentId(selectedPid || '');
    setModalName('');
    setIsModalOpen(true);
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (!modalName.trim()) return;
    onCreateNotebook(modalName.trim(), modalParentId ? modalParentId : null);
    setIsModalOpen(false);
    setModalName('');
  };

  const handleCreateDbSubmit = (e) => {
    e.preventDefault();
    const title = dbModalTitle.trim() || '新数据表';
    onCreateDatabase(title, dbModalIcon || '📊');
    setIsCreateDbModalOpen(false);
    setDbModalTitle('');
    setDbModalIcon('📊');
  };

  return (
    <aside className="w-64 bg-mac-sidebar dark:bg-mac-sidebarDark border-r border-mac-border dark:border-mac-borderDark flex flex-col h-screen select-none shrink-0 transition-colors">
      {/* 顶部 macOS 原生交通灯预留拖拽区域 */}
      <div 
        style={{ WebkitAppRegion: 'drag' }}
        className="h-12 border-b border-mac-border/50 dark:border-mac-borderDark/50 shrink-0 cursor-default"
      />

      {/* 导航菜单 */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* 全部笔记 */}
        <button
          onClick={() => onSelectView('all')}
          style={{ WebkitAppRegion: 'no-drag' }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            currentView === 'all' && !currentNotebookId
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <BookOpen className="w-4 h-4 text-blue-500" />
            <span>全部笔记</span>
          </div>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono">
            {totalNotesCount}
          </span>
        </button>

        {/* ⚡️ 闪念速记流 (Memo Stream) */}
        <button
          onClick={() => onSelectView('memos')}
          style={{ WebkitAppRegion: 'no-drag' }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            currentView === 'memos'
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Zap className="w-4 h-4 text-amber-500" />
            <span>闪念速记流</span>
          </div>
          {memosCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-mono">
              {memosCount}
            </span>
          )}
        </button>

        {/* 🕸️ 知识关系图谱 */}
        <button
          onClick={onOpenGraphModal}
          style={{ WebkitAppRegion: 'no-drag' }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all text-gray-700 dark:text-gray-300 hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400"
        >
          <div className="flex items-center space-x-2.5">
            <Share2 className="w-4 h-4 text-indigo-500" />
            <span>知识关系图谱</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-medium">
            2D
          </span>
        </button>

        {/* 🎙️ 语音录音工坊 */}
        <button
          onClick={() => onSelectView('audio_studio')}
          style={{ WebkitAppRegion: 'no-drag' }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            currentView === 'audio_studio'
              ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 font-semibold'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Mic className="w-4 h-4 text-purple-500" />
            <span>语音录音工坊</span>
          </div>
          {audioRecordsCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 font-mono">
              {audioRecordsCount}
            </span>
          )}
        </button>

        {/* 我的收藏 */}
        <button
          onClick={() => onSelectView('starred')}
          style={{ WebkitAppRegion: 'no-drag' }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            currentView === 'starred'
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>我的收藏</span>
          </div>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono">
            {starredNotesCount}
          </span>
        </button>

        {/* 废纸篓 */}
        <button
          onClick={() => onSelectView('trash')}
          style={{ WebkitAppRegion: 'no-drag' }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            currentView === 'trash'
              ? 'bg-red-500/15 text-red-600 dark:text-red-400 font-semibold'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Trash2 className="w-4 h-4 text-red-500" />
            <span>废纸篓</span>
          </div>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono">
            {trashNotesCount}
          </span>
        </button>

        {/* 🤖 AI 咨询与智库分组 */}
        <div className="pt-4 pb-1">
          <div className="flex items-center justify-between px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            <div 
              className="flex items-center space-x-1 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setAiSectionExpanded(!aiSectionExpanded)}
            >
              {aiSectionExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>🤖 AI 咨询与智库</span>
            </div>
          </div>
        </div>
        {aiSectionExpanded && (
          <div className="space-y-0.5 pl-3">
            <button
              onClick={() => onSelectView('ai_consultation')}
              style={{ WebkitAppRegion: 'no-drag' }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentView === 'ai_consultation'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Bot className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>智能咨询</span>
              </div>
            </button>
            <button
              onClick={() => onSelectView('ai_doubao')}
              style={{ WebkitAppRegion: 'no-drag' }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentView === 'ai_doubao'
                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
              }`}
            >
              <div className="flex items-center space-x-2">
                <img src="/icons/doubao.svg" alt="豆包" className="w-3.5 h-3.5 rounded object-contain shrink-0 shadow-xs" />
                <span>豆包</span>
              </div>
            </button>
            <button
              onClick={() => onSelectView('ai_deepseek')}
              style={{ WebkitAppRegion: 'no-drag' }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentView === 'ai_deepseek'
                  ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
              }`}
            >
              <div className="flex items-center space-x-2">
                <img src="/icons/deepseek.svg" alt="DeepSeek" className="w-3.5 h-3.5 rounded object-contain shrink-0 shadow-xs" />
                <span>DeepSeek</span>
              </div>
            </button>
            <button
              onClick={() => onSelectView('ai_kimi')}
              style={{ WebkitAppRegion: 'no-drag' }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentView === 'ai_kimi'
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
              }`}
            >
              <div className="flex items-center space-x-2">
                <img src="/icons/kimi.svg" alt="Kimi" className="w-3.5 h-3.5 rounded object-contain shrink-0 shadow-xs" />
                <span>Kimi</span>
              </div>
            </button>
            <button
              onClick={() => onSelectView('ai_grok')}
              style={{ WebkitAppRegion: 'no-drag' }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentView === 'ai_grok'
                  ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
              }`}
            >
              <div className="flex items-center space-x-2">
                <img src="/icons/grok.svg" alt="Grok" className="w-3.5 h-3.5 rounded object-contain shrink-0 shadow-xs" />
                <span>Grok</span>
              </div>
            </button>
            <button
              onClick={() => onSelectView('ai_gemini')}
              style={{ WebkitAppRegion: 'no-drag' }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentView === 'ai_gemini'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
              }`}
            >
              <div className="flex items-center space-x-2">
                <img src="/icons/gemini.svg" alt="Gemini" className="w-3.5 h-3.5 rounded object-contain shrink-0 shadow-xs" />
                <span>Gemini</span>
              </div>
            </button>
          </div>
        )}

        {/* 📊 多维数据表格 (Notion 数据库) */}
        <div className="pt-4 pb-1">
          <div className="flex items-center justify-between px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            <div 
              className="flex items-center space-x-1 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setDatabasesExpanded(!databasesExpanded)}
            >
              {databasesExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>📊 多维数据表</span>
            </div>
            
            <button
              onClick={() => {
                setDbModalTitle('');
                setDbModalIcon('📊');
                setIsCreateDbModalOpen(true);
              }}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition text-blue-500 hover:text-blue-600 flex items-center space-x-0.5 cursor-pointer"
              title="新建多维数据表"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {databasesExpanded && (
          <div className="space-y-0.5 pl-3">
            {databases.length === 0 ? (
              <div className="px-4 py-1.5 text-xs text-gray-400 italic">暂无数据表</div>
            ) : (
              databases.map((db) => {
                const isSelected = currentView === 'database' && currentDatabaseId === db.id;
                return (
                  <button
                    key={db.id}
                    onClick={() => onSelectDatabase(db.id)}
                    style={{ WebkitAppRegion: 'no-drag' }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="text-sm shrink-0">{db.icon || '📊'}</span>
                      <span className="truncate">
                        {db.title && db.icon && db.title.startsWith(db.icon) ? db.title.replace(db.icon, '').trim() : (db.title || '未命名数据表')}
                      </span>
                    </div>
                    {db.rows && db.rows.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 font-mono shrink-0">
                        {db.rows.length}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* 笔记本分类标题栏 */}
        <div className="pt-4 pb-1">
          <div className="flex items-center justify-between px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            <div 
              className="flex items-center space-x-1 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setNotebooksExpanded(!notebooksExpanded)}
            >
              {notebooksExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>笔记本分类</span>
            </div>
            
            <button
              onClick={() => handleOpenCreateModal(null)}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition text-blue-500 hover:text-blue-600 flex items-center space-x-0.5"
              title="新建分类 (支持选择上级或新建顶级)"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 多级树状笔记本列表 */}
        {notebooksExpanded && (
          <div className="space-y-0.5">
            {notebookTree.length === 0 ? (
              <div className="px-4 py-2 text-xs text-gray-400 italic">暂无分类</div>
            ) : (
              notebookTree.map((node) => (
                <NotebookTreeNode
                  key={node.id}
                  node={node}
                  level={0}
                  currentView={currentView}
                  currentNotebookId={currentNotebookId}
                  onSelectNotebook={onSelectNotebook}
                  onOpenCreateModal={handleOpenCreateModal}
                  onUpdateNotebook={onUpdateNotebook}
                  onDeleteNotebook={onDeleteNotebook}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* 🌟 新建分类明确弹窗 (支持清晰指定所属上级目录) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div className="flex items-center space-x-2">
                <FolderPlus className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">新建笔记本分类</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1 font-medium">
                  所属上级分类
                </label>
                <select
                  value={modalParentId}
                  onChange={(e) => setModalParentId(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-800 dark:text-gray-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">📁（作为顶级独立分类）</option>
                  {notebooks.map((nb) => (
                    <option key={nb.id} value={nb.id}>
                      📂 {nb.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1 font-medium">
                  分类名称
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="例如: 杭州项目 / 财务报表..."
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-800 dark:text-gray-200 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg shadow-sm transition"
                >
                  确认创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🌟 新建多维数据表弹窗 (替换 window.prompt，支持图标选择与名称输入) */}
      {isCreateDbModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div className="flex items-center space-x-2">
                <Table className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">新建多维数据表</h3>
              </div>
              <button onClick={() => setIsCreateDbModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDbSubmit} className="space-y-3.5 text-xs">
              {/* 选择图标 */}
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1.5 font-medium">
                  选择数据表图标
                </label>
                <div className="grid grid-cols-5 gap-1.5 p-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-800">
                  {['📊', '🚀', '🎯', '📚', '💼', '💡', '📝', '📅', '🏷️', '🌟', '⚙️', '🎨', '📈', '🧪', '📦'].map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setDbModalIcon(emoji)}
                      className={`text-xl p-1 rounded-lg transition text-center ${
                        dbModalIcon === emoji 
                          ? 'bg-blue-500 text-white shadow-xs scale-105' 
                          : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* 数据表名称 */}
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1 font-medium">
                  数据表名称
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="例如: 产品需求看板 / OKR 目标管理..."
                  value={dbModalTitle}
                  onChange={(e) => setDbModalTitle(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-800 dark:text-gray-200 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateDbModalOpen(false)}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg shadow-xs transition cursor-pointer"
                >
                  立即创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 底部系统状态与设置 */}
      <div className="p-3 border-t border-mac-border/50 dark:border-mac-borderDark/50 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/30">
        <button
          onClick={onOpenSettings}
          style={{ WebkitAppRegion: 'no-drag' }}
          className="flex items-center space-x-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition"
        >
          <Settings className="w-4 h-4" />
          <span>设置</span>
        </button>

        <div className="flex items-center space-x-1">
          {/* 创作打卡热力图快捷入口 */}
          <button
            onClick={onOpenHeatmapModal}
            style={{ WebkitAppRegion: 'no-drag' }}
            className="p-1.5 text-gray-500 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-md transition"
            title="365 天知识产出打卡热力图"
          >
            <Flame className="w-4 h-4 text-emerald-500" />
          </button>

          {/* 多端同步快捷入口 */}
          <button
            onClick={onOpenSyncModal}
            style={{ WebkitAppRegion: 'no-drag' }}
            className="p-1.5 text-gray-500 hover:text-blue-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition"
            title="多端局域网双向同步与配对"
          >
            <ArrowRightLeft className="w-4 h-4" />
          </button>

          {/* 暗黑/明亮模式切换 */}
          <button
            onClick={onToggleDarkMode}
            style={{ WebkitAppRegion: 'no-drag' }}
            className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition"
            title={darkMode ? "切换到明亮模式" : "切换到暗黑模式"}
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-600" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
