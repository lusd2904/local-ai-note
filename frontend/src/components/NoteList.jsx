import React from 'react';
import { 
  Search, Plus, Star, Trash2, Mic,
  Clock, FileText, RotateCcw, Lock, Upload
} from 'lucide-react';

export default function NoteList({
  notes = [],
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onToggleStar,
  onDeleteNote,
  onRestoreNote,
  onEmptyTrash,
  onBatchImport,
  isTrashView = false,
  searchKeyword = '',
  onSearchChange,
  currentViewTitle = '全部笔记'
}) {

  const safeNotes = Array.isArray(notes) ? notes : [];

  const sortedNotes = [...safeNotes].sort((a, b) => {
    try {
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    } catch (e) {
      return 0;
    }
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      
      if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    } catch (e) {
      return '';
    }
  };

  const getSafeTags = (tags) => {
    if (Array.isArray(tags)) return tags;
    if (typeof tags === 'string') {
      try {
        const parsed = JSON.parse(tags);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        return tags.split(',').map(t => t.trim()).filter(Boolean);
      }
    }
    return [];
  };

  return (
    <section className="w-80 bg-mac-list dark:bg-mac-listDark border-r border-mac-border dark:border-mac-borderDark flex flex-col h-screen select-none shrink-0 transition-colors">
      {/* 列表顶部工具条 (支持拖动窗口) */}
      <div 
        style={{ WebkitAppRegion: 'drag' }}
        className="p-3 border-b border-mac-border dark:border-mac-borderDark space-y-2 cursor-default shrink-0"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 truncate">
            {currentViewTitle}
          </h2>
          <div className="flex items-center space-x-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
            {!isTrashView ? (
              <>
                <label 
                  className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 active:scale-95 text-gray-700 dark:text-gray-200 rounded-md text-xs font-medium transition-all cursor-pointer shadow-2xs"
                  title="批量导入本地 Markdown / TXT 笔记"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-500" />
                  <span>导入</span>
                  <input
                    type="file"
                    multiple
                    accept=".md,.txt,.markdown"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        onBatchImport && onBatchImport(Array.from(e.target.files));
                        e.target.value = '';
                      }
                    }}
                  />
                </label>

                <button
                  onClick={onCreateNote}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded-md text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  title="新建笔记"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新建</span>
                </button>
              </>
            ) : (
              safeNotes.length > 0 && (
                <button
                  onClick={onEmptyTrash}
                  className="flex items-center space-x-1 px-2 py-1 bg-red-100 hover:bg-red-200 text-red-600 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded-md text-xs font-medium transition cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>清空废纸篓</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* 搜索框 */}
        <div className="relative" style={{ WebkitAppRegion: 'no-drag' }}>
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="搜索笔记标题与内容..."
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-transparent focus:border-blue-400 focus:bg-white dark:focus:bg-gray-900 focus:outline-none transition"
          />
        </div>
      </div>

      {/* 笔记卡片列表 */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/60">
        {sortedNotes.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-xs space-y-2">
            <FileText className="w-8 h-8 mx-auto opacity-40" />
            <p>{isTrashView ? '废纸篓空空如也' : '暂无笔记内容'}</p>
            {!isTrashView && (
              <button
                onClick={onCreateNote}
                className="text-blue-500 hover:underline inline-block mt-1"
              >
                + 点击新建第一篇笔记
              </button>
            )}
          </div>
        ) : (
          sortedNotes.map((note) => {
            const isSelected = selectedNoteId === note.id;
            const safeTags = getSafeTags(note.tags);

            return (
              <div
                key={note.id}
                onClick={() => onSelectNote(note.id)}
                className={`p-3 cursor-pointer transition-all relative group ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-500'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className={`text-sm font-semibold truncate flex-1 flex items-center gap-1 ${
                    isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'
                  }`}>
                    {note.is_locked && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
                    {note.title || '无标题笔记'}
                  </h3>

                  <div className="flex items-center space-x-1 shrink-0">
                    {!isTrashView && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStar(note.id, !note.is_starred);
                        }}
                        className={`p-0.5 rounded transition ${
                          note.is_starred
                            ? 'text-amber-500 fill-amber-500'
                            : 'text-gray-300 dark:text-gray-600 hover:text-amber-400'
                        }`}
                        title={note.is_starred ? "取消收藏" : "加入收藏"}
                      >
                        <Star className={`w-3.5 h-3.5 ${note.is_starred ? 'fill-amber-500' : ''}`} />
                      </button>
                    )}

                    {note.audio_count > 0 && (
                      <span title="包含录音与纪要" className="text-purple-500">
                        <Mic className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed mb-2 font-normal">
                  {note.is_locked ? (
                    <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center space-x-1">
                      <span>🔒 此重要笔记已设置密码锁定保护</span>
                    </span>
                  ) : (
                    note.summary || note.content?.replace(/[#*`>-]/g, '').slice(0, 80) || '（暂无正文内容）'
                  )}
                </p>

                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <div className="flex items-center space-x-1.5 font-mono">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span>{formatDate(note.updated_at)}</span>
                  </div>

                  {safeTags.length > 0 && (
                    <div className="flex items-center space-x-1 overflow-hidden max-w-[120px]">
                      {safeTags.slice(0, 2).map((t, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] truncate"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="absolute right-2 bottom-2 hidden group-hover:flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' }}>
                  {!isTrashView ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNote(note.id);
                      }}
                      className="p-1 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-500 rounded transition"
                      title="移入废纸篓"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  ) : (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestoreNote(note.id);
                        }}
                        className="flex items-center space-x-0.5 px-2 py-0.5 bg-blue-500 hover:bg-blue-600 text-white text-[10px] rounded shadow-sm transition"
                        title="恢复笔记到正常列表"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>还原</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNote(note.id, true);
                        }}
                        className="px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white text-[10px] rounded shadow-sm transition"
                        title="彻底永久删除"
                      >
                        永久删除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
