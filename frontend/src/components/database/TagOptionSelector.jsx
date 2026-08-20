import React, { useState } from 'react';
import { Plus, Check, Trash2, Palette, Edit2, Search } from 'lucide-react';

export const STATUS_COLORS = {
  gray: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700',
  blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  green: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
  red: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700',
  amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700',
  pink: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-700',
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
};

const COLOR_LIST = ['purple', 'blue', 'green', 'amber', 'red', 'pink', 'slate', 'gray'];

export default function TagOptionSelector({
  col,
  value,
  onChange,
  onUpdateSchema,
  database,
  onClose,
  isNearBottom = false,
  align = 'left'
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingOptId, setEditingOptId] = useState(null);
  const [editingOptName, setEditingOptName] = useState('');
  const [colorPickerOptId, setColorPickerOptId] = useState(null);

  const options = col?.options || [];
  const isMulti = col?.type === 'multi_select';

  const filteredOptions = options.filter(opt =>
    (opt.name || '').toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  const exactMatch = options.some(opt =>
    (opt.name || '').toLowerCase() === searchTerm.trim().toLowerCase()
  );

  // 1. 创建新自定义标签
  const handleCreateNewOption = (nameToCreate) => {
    const trimmed = (nameToCreate || searchTerm).trim();
    if (!trimmed) return;

    const newOptId = 'opt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const assignedColor = COLOR_LIST[options.length % COLOR_LIST.length];

    const newOption = {
      id: newOptId,
      name: trimmed,
      color: assignedColor
    };

    const newOptions = [...options, newOption];
    const newSchema = (database?.schema || []).map(c =>
      c.id === col.id ? { ...c, options: newOptions } : c
    );

    if (onUpdateSchema) {
      onUpdateSchema(newSchema);
    }

    // 立即选中该标签
    if (isMulti) {
      const cur = Array.isArray(value) ? value : [];
      onChange([...cur, newOptId]);
    } else {
      onChange(newOptId);
      if (onClose) onClose();
    }

    setSearchTerm('');
  };

  // 2. 选择 / 取消选择标签
  const handleToggleSelect = (optId) => {
    if (isMulti) {
      const cur = Array.isArray(value) ? value : [];
      const next = cur.includes(optId)
        ? cur.filter(id => id !== optId)
        : [...cur, optId];
      onChange(next);
    } else {
      onChange(value === optId ? null : optId);
      if (onClose) onClose();
    }
  };

  // 3. 删除已有标签选项 (手动维护)
  const handleDeleteOption = (e, optId) => {
    e.stopPropagation();
    const newOptions = options.filter(o => o.id !== optId);
    const newSchema = (database?.schema || []).map(c =>
      c.id === col.id ? { ...c, options: newOptions } : c
    );

    if (onUpdateSchema) {
      onUpdateSchema(newSchema);
    }

    // 同时清除当前行的该标签选择
    if (isMulti) {
      const cur = Array.isArray(value) ? value : [];
      onChange(cur.filter(id => id !== optId));
    } else if (value === optId) {
      onChange(null);
    }
  };

  // 4. 更改已有标签颜色 (手动维护)
  const handleChangeColor = (e, optId, newColor) => {
    e.stopPropagation();
    const newOptions = options.map(o =>
      o.id === optId ? { ...o, color: newColor } : o
    );
    const newSchema = (database?.schema || []).map(c =>
      c.id === col.id ? { ...c, options: newOptions } : c
    );

    if (onUpdateSchema) {
      onUpdateSchema(newSchema);
    }
    setColorPickerOptId(null);
  };

  // 5. 保存重命名标签
  const handleSaveRename = (optId) => {
    if (!editingOptName.trim()) {
      setEditingOptId(null);
      return;
    }
    const newOptions = options.map(o =>
      o.id === optId ? { ...o, name: editingOptName.trim() } : o
    );
    const newSchema = (database?.schema || []).map(c =>
      c.id === col.id ? { ...c, options: newOptions } : c
    );

    if (onUpdateSchema) {
      onUpdateSchema(newSchema);
    }
    setEditingOptId(null);
    setEditingOptName('');
  };

  return (
    <div
      className={`db-dropdown-box absolute ${
        isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1'
      } ${align === 'right' ? 'right-0' : 'left-0'} w-56 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1.5 z-50 animate-fadeIn text-xs`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 顶部搜索与创建输入框 */}
      <div className="px-2 pb-1.5 border-b border-gray-100 dark:border-gray-700/60">
        <div className="relative flex items-center">
          <Search className="w-3 h-3 text-gray-400 absolute left-2 pointer-events-none" />
          <input
            type="text"
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (searchTerm.trim()) {
                  const match = options.find(o => o.name.toLowerCase() === searchTerm.trim().toLowerCase());
                  if (match) {
                    handleToggleSelect(match.id);
                  } else {
                    handleCreateNewOption(searchTerm);
                  }
                }
              }
            }}
            placeholder="搜索或输入自定义标签..."
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md pl-6 pr-2 py-1 text-[11px] text-gray-800 dark:text-gray-200 outline-hidden focus:border-blue-500"
          />
        </div>
      </div>

      {/* 快速创建新标签提示条 */}
      {searchTerm.trim() && !exactMatch && (
        <button
          type="button"
          onClick={() => handleCreateNewOption(searchTerm)}
          className="w-full px-2.5 py-1.5 text-left text-xs flex items-center space-x-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition font-medium border-b border-gray-100 dark:border-gray-700/40"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">创建新标签「{searchTerm.trim()}」</span>
        </button>
      )}

      {/* 标签选项列表 */}
      <div className="max-h-48 overflow-y-auto py-1 space-y-0.5">
        {filteredOptions.length === 0 && !searchTerm.trim() ? (
          <div className="px-3 py-2 text-center text-gray-400 text-[11px]">
            暂无标签，输入文字并回车快速创建
          </div>
        ) : (
          filteredOptions.map((opt) => {
            const isSelected = isMulti
              ? (Array.isArray(value) ? value : []).includes(opt.id)
              : value === opt.id;

            return (
              <div
                key={opt.id}
                className={`group px-2 py-1 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700/60 transition cursor-pointer ${
                  isSelected ? 'bg-gray-50 dark:bg-gray-800/80 font-medium' : ''
                }`}
                onClick={() => handleToggleSelect(opt.id)}
              >
                {/* 标签主体 */}
                <div className="flex items-center space-x-1.5 flex-1 min-w-0 pr-1">
                  {isSelected && (
                    <Check className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                  )}

                  {editingOptId === opt.id ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingOptName}
                      onChange={(e) => setEditingOptName(e.target.value)}
                      onBlur={() => handleSaveRename(opt.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(opt.id);
                        if (e.key === 'Escape') setEditingOptId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="px-1 py-0.5 bg-white dark:bg-gray-900 border border-blue-500 rounded text-[11px] w-full outline-hidden"
                    />
                  ) : (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border truncate ${
                        STATUS_COLORS[opt.color || 'purple']
                      }`}
                    >
                      {opt.name}
                    </span>
                  )}
                </div>

                {/* 悬停手动维护工具条 (换颜色、重命名、删除) */}
                <div
                  className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 transition"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 换色按钮 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setColorPickerOptId(colorPickerOptId === opt.id ? null : opt.id)
                      }
                      className="p-1 text-gray-400 hover:text-blue-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition"
                      title="更改标签颜色"
                    >
                      <Palette className="w-3 h-3" />
                    </button>

                    {colorPickerOptId === opt.id && (
                      <div className="absolute right-0 top-full mt-1 p-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 grid grid-cols-4 gap-1 z-[60] w-24">
                        {COLOR_LIST.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={(e) => handleChangeColor(e, opt.id, c)}
                            className={`h-4 rounded border ${STATUS_COLORS[c]} hover:scale-110 transition`}
                            title={c}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 重命名按钮 */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingOptId(opt.id);
                      setEditingOptName(opt.name);
                    }}
                    className="p-1 text-gray-400 hover:text-amber-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition"
                    title="重命名标签"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>

                  {/* 删除标签按钮 */}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteOption(e, opt.id)}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition"
                    title="删除此标签"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 底部手动添加快捷按钮 */}
      <div className="pt-1.5 px-2 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-[11px] text-gray-400">
        <span>已维护 {options.length} 个标签</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="hover:text-gray-600 dark:hover:text-gray-200"
          >
            完成
          </button>
        )}
      </div>
    </div>
  );
}
