import React, { useState, useEffect } from 'react';
import { 
  X, Maximize2, Minimize2, Trash2, Calendar, 
  Tag, CheckSquare, Hash, AlignLeft, Layers, 
  Sparkles, Check, Clock, ChevronDown, Plus
} from 'lucide-react';
import TagOptionSelector, { STATUS_COLORS } from './TagOptionSelector';

export default function RowDetailModal({
  isOpen,
  onClose,
  database,
  row,
  onUpdateRow,
  onDeleteRow,
  onUpdateSchema
}) {
  if (!isOpen || !row) return null;

  const [properties, setProperties] = useState(row.properties || {});
  const [content, setContent] = useState(row.content || '');
  const [isFullWidth, setIsFullWidth] = useState(false);
  const [openDropdownCol, setOpenDropdownCol] = useState(null);

  useEffect(() => {
    setProperties(row.properties || {});
    setContent(row.content || '');
  }, [row]);

  const titleCol = database.schema.find(c => c.type === 'title') || database.schema[0];
  const titleVal = properties[titleCol?.id] || '无标题记录';

  const handlePropertyChange = (colId, value) => {
    const updated = { ...properties, [colId]: value };
    setProperties(updated);
    onUpdateRow(row.id, { properties: updated });
  };

  const handleContentBlur = () => {
    if (content !== row.content) {
      onUpdateRow(row.id, { content });
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-200 overflow-hidden ${
          isFullWidth ? 'w-full h-full max-w-6xl' : 'w-full max-w-3xl max-h-[90vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部控制栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="text-base">{database.icon || '📊'}</span>
            <span>{database.title}</span>
            <span>/</span>
            <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[200px]">
              {titleVal}
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => {
                if (window.confirm('确定要删除这条记录吗？')) {
                  onDeleteRow(row.id);
                  onClose();
                }
              }}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition"
              title="删除此记录"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsFullWidth(!isFullWidth)}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              title={isFullWidth ? "退出全屏" : "全屏放大"}
            >
              {isFullWidth ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              title="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 内容滚动区 */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* 大标题输入 */}
          <div>
            <input
              type="text"
              value={properties[titleCol?.id] || ''}
              onChange={(e) => handlePropertyChange(titleCol?.id, e.target.value)}
              placeholder="无标题"
              className="w-full text-2xl sm:text-3xl font-bold bg-transparent border-none outline-hidden focus:ring-0 text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600"
            />
          </div>

          {/* 属性列表面板 (Properties Inspector) */}
          <div className="bg-gray-50/70 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800 space-y-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              记录属性 (Properties)
            </div>

            {database.schema
              .filter(col => col.id !== titleCol?.id)
              .map(col => {
                const val = properties[col.id];

                return (
                  <div key={col.id} className="flex items-center text-sm py-1">
                    {/* 字段名 */}
                    <div className="w-32 flex items-center space-x-2 text-gray-500 dark:text-gray-400 shrink-0 select-none">
                      {col.type === 'status' && <Layers className="w-3.5 h-3.5 text-blue-500" />}
                      {col.type === 'select' && <Tag className="w-3.5 h-3.5 text-amber-500" />}
                      {col.type === 'multi_select' && <Tag className="w-3.5 h-3.5 text-purple-500" />}
                      {col.type === 'date' && <Calendar className="w-3.5 h-3.5 text-emerald-500" />}
                      {col.type === 'number' && <Hash className="w-3.5 h-3.5 text-cyan-500" />}
                      {col.type === 'checkbox' && <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />}
                      {col.type === 'text' && <AlignLeft className="w-3.5 h-3.5 text-gray-500" />}
                      <span className="truncate">{col.name}</span>
                    </div>

                    {/* 字段值编辑器 */}
                    <div className="flex-1 relative">
                      {/* 1. 状态 (Status) */}
                      {col.type === 'status' && (
                        <div className="relative">
                          <button
                            onClick={() => setOpenDropdownCol(openDropdownCol === col.id ? null : col.id)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center space-x-1.5 transition ${
                              STATUS_COLORS[col.options?.find(o => o.id === val)?.color || 'gray']
                            }`}
                          >
                            <span>{col.options?.find(o => o.id === val)?.name || val || '未选择'}</span>
                            <ChevronDown className="w-3 h-3 opacity-60" />
                          </button>

                          {openDropdownCol === col.id && (
                            <TagOptionSelector
                              col={col}
                              value={val}
                              onChange={(newVal) => handlePropertyChange(col.id, newVal)}
                              onUpdateSchema={onUpdateSchema}
                              database={database}
                              onClose={() => setOpenDropdownCol(null)}
                            />
                          )}
                        </div>
                      )}

                      {/* 2. 单选 (Select) */}
                      {col.type === 'select' && (
                        <div className="relative">
                          <button
                            onClick={() => setOpenDropdownCol(openDropdownCol === col.id ? null : col.id)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center space-x-1.5 transition ${
                              STATUS_COLORS[col.options?.find(o => o.id === val)?.color || 'gray']
                            }`}
                          >
                            <span>{col.options?.find(o => o.id === val)?.name || val || '选择标签'}</span>
                            <ChevronDown className="w-3 h-3 opacity-60" />
                          </button>

                          {openDropdownCol === col.id && (
                            <TagOptionSelector
                              col={col}
                              value={val}
                              onChange={(newVal) => handlePropertyChange(col.id, newVal)}
                              onUpdateSchema={onUpdateSchema}
                              database={database}
                              onClose={() => setOpenDropdownCol(null)}
                            />
                          )}
                        </div>
                      )}

                      {/* 3. 多选 (Multi-Select) */}
                      {col.type === 'multi_select' && (
                        <div className="relative flex flex-wrap items-center gap-1.5">
                          {(Array.isArray(val) ? val : []).map(tagId => {
                            const opt = col.options?.find(o => o.id === tagId);
                            return (
                              <span
                                key={tagId}
                                className={`px-2 py-0.5 rounded text-xs font-medium border flex items-center space-x-1 ${
                                  STATUS_COLORS[opt?.color || 'purple']
                                }`}
                              >
                                <span>{opt?.name || tagId}</span>
                                <button
                                  onClick={() => {
                                    const next = (val || []).filter(t => t !== tagId);
                                    handlePropertyChange(col.id, next);
                                  }}
                                  className="hover:opacity-70 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            );
                          })}

                          <button
                            onClick={() => setOpenDropdownCol(openDropdownCol === col.id ? null : col.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition cursor-pointer"
                            title="选择或自定义标签"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          {openDropdownCol === col.id && (
                            <TagOptionSelector
                              col={col}
                              value={val}
                              onChange={(newVal) => handlePropertyChange(col.id, newVal)}
                              onUpdateSchema={onUpdateSchema}
                              database={database}
                              onClose={() => setOpenDropdownCol(null)}
                            />
                          )}
                        </div>
                      )}

                      {/* 4. 日期 (Date) */}
                      {col.type === 'date' && (
                        <input
                          type="date"
                          value={val || ''}
                          onChange={(e) => handlePropertyChange(col.id, e.target.value)}
                          className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-xs text-gray-800 dark:text-gray-200 outline-hidden focus:border-blue-500"
                        />
                      )}

                      {/* 5. 数字 / 进度条 (Number) */}
                      {col.type === 'number' && (
                        <div className="flex items-center space-x-2 max-w-[200px]">
                          <input
                            type="number"
                            value={val ?? ''}
                            onChange={(e) => handlePropertyChange(col.id, e.target.value === '' ? null : Number(e.target.value))}
                            placeholder="0"
                            className="w-20 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-xs text-gray-800 dark:text-gray-200 outline-hidden focus:border-blue-500"
                          />
                          {col.format === 'percent' && (
                            <div className="flex-1 flex items-center space-x-1.5">
                              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-blue-500 h-full rounded-full transition-all"
                                  style={{ width: `${Math.min(100, Math.max(0, val || 0))}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-400 font-mono">{val || 0}%</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 6. 复选框 (Checkbox) */}
                      {col.type === 'checkbox' && (
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          onChange={(e) => handlePropertyChange(col.id, e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      )}

                      {/* 7. 纯文本 (Text) */}
                      {col.type === 'text' && (
                        <input
                          type="text"
                          value={val || ''}
                          onChange={(e) => handlePropertyChange(col.id, e.target.value)}
                          placeholder="输入内容..."
                          className="w-full px-2.5 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-xs text-gray-800 dark:text-gray-200 outline-hidden focus:border-blue-500"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* 分割线与正文提示 */}
          <div className="pt-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>独立笔记正文 (Page Content)</span>
              <span className="text-[11px] lowercase text-gray-400">支持 Markdown 语法</span>
            </div>

            {/* Markdown 正文输入框 */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={handleContentBlur}
              placeholder="在此记录该项任务的详细方案、会议记录、思考或资料附件... (支持 Markdown)"
              rows={12}
              className="w-full p-4 bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 outline-hidden focus:border-blue-500 focus:bg-white dark:focus:bg-gray-900 transition font-mono leading-relaxed resize-y"
            />
          </div>
        </div>

        {/* 底部状态栏 */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center space-x-2">
            <Clock className="w-3.5 h-3.5" />
            <span>更新于 {new Date(row.updated_at || Date.now()).toLocaleString('zh-CN')}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
