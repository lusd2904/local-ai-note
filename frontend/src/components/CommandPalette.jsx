import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, FileText, Folder, Settings, Plus, Moon, Command } from 'lucide-react';

export default function CommandPalette({
  isOpen,
  onClose,
  notes = [],
  notebooks = [],
  onSelectNote,
  onSelectNotebook,
  onCreateNote,
  onOpenSettings,
  onToggleDarkMode
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const actions = [
      { id: 'act-new', kind: 'action', title: '新建笔记', hint: '⌘N', icon: Plus, run: onCreateNote },
      { id: 'act-settings', kind: 'action', title: '打开设置', hint: '⌘,', icon: Settings, run: onOpenSettings },
      { id: 'act-theme', kind: 'action', title: '切换暗色 / 明亮模式', icon: Moon, run: onToggleDarkMode }
    ];
    const nbItems = notebooks.map((nb) => ({
      id: `nb-${nb.id}`,
      kind: 'notebook',
      title: nb.name,
      hint: '笔记本',
      icon: Folder,
      run: () => onSelectNotebook(nb.id)
    }));
    const noteItems = notes.map((n) => ({
      id: `note-${n.id}`,
      kind: 'note',
      title: n.title || '无标题笔记',
      hint: n.summary || n.content || '',
      icon: FileText,
      run: () => onSelectNote(n.id)
    }));
    const all = [...actions, ...nbItems, ...noteItems];
    if (!q) return all.slice(0, 20);
    return all.filter((item) =>
      `${item.title} ${item.hint}`.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [query, notes, notebooks, onCreateNote, onOpenSettings, onToggleDarkMode, onSelectNotebook, onSelectNote]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  const run = (item) => {
    if (!item) return;
    item.run?.();
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(items[index]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="跳转笔记、笔记本或执行命令…"
            className="flex-1 bg-transparent text-sm outline-none text-gray-800 dark:text-gray-100"
          />
          <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
            <Command className="w-3 h-3" />P
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-4 py-6 text-xs text-gray-400 text-center">没有匹配项</div>
          )}
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => run(item)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm ${
                  i === index ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate flex-1">{item.title}</span>
                {item.hint && <span className="text-[11px] text-gray-400 truncate max-w-[40%]">{item.hint}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
