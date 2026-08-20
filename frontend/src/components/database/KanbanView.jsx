import React, { useState } from 'react';
import { 
  Plus, MoreHorizontal, Calendar, Tag, 
  Layers, Hash, ArrowRight, Maximize2, Trash2
} from 'lucide-react';

const STATUS_COLORS = {
  gray: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700',
  blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  green: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
  red: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700',
  amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700',
  pink: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-700',
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
};

export default function KanbanView({
  database,
  rows = [],
  onUpdateRow,
  onDeleteRow,
  onCreateRow,
  onOpenRowDetail
}) {
  const [quickTitle, setQuickTitle] = useState({}); // { [statusId]: string }
  const [draggedRowId, setDraggedRowId] = useState(null);

  // 找到用于分组的列 (优先 status，其次 select)
  const groupCol = database.schema.find(c => c.type === 'status') 
    || database.schema.find(c => c.type === 'select')
    || { id: 'col_status', name: '状态', options: [{ id: 'default', name: '所有记录', color: 'blue' }] };

  const titleCol = database.schema.find(c => c.type === 'title') || database.schema[0];
  const priorityCol = database.schema.find(c => c.id.includes('priority') || c.type === 'select');
  const dateCol = database.schema.find(c => c.type === 'date');
  const tagsCol = database.schema.find(c => c.type === 'multi_select');
  const progressCol = database.schema.find(c => c.type === 'number');

  const options = groupCol.options && groupCol.options.length > 0 
    ? groupCol.options 
    : [{ id: 'uncategorized', name: '未分类', color: 'gray' }];

  const handleDragStart = (e, rowId) => {
    setDraggedRowId(rowId);
    e.dataTransfer.setData('text/plain', rowId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetStatusId) => {
    e.preventDefault();
    const rowId = e.dataTransfer.getData('text/plain') || draggedRowId;
    if (!rowId) return;

    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    const nextProps = { ...row.properties, [groupCol.id]: targetStatusId };
    onUpdateRow(rowId, { properties: nextProps });
    setDraggedRowId(null);
  };

  const handleQuickAdd = (statusId) => {
    const title = quickTitle[statusId];
    if (!title || !title.trim()) return;

    const newProps = {
      [titleCol?.id]: title.trim(),
      [groupCol.id]: statusId
    };

    onCreateRow(newProps);
    setQuickTitle({ ...quickTitle, [statusId]: '' });
  };

  return (
    <div className="flex items-start space-x-4 p-4 overflow-x-auto min-h-[600px] select-none">
      {options.map((opt) => {
        // 筛选属于当前状态泳道的记录
        const laneRows = rows.filter(r => (r.properties?.[groupCol.id] || options[0].id) === opt.id);

        return (
          <div
            key={opt.id}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, opt.id)}
            className="w-72 shrink-0 bg-gray-50/70 dark:bg-gray-800/40 rounded-xl border border-gray-200/80 dark:border-gray-800 flex flex-col max-h-[calc(100vh-200px)] overflow-hidden"
          >
            {/* 泳道顶部标题栏 */}
            <div className="p-3 border-b border-gray-200/60 dark:border-gray-800/60 flex items-center justify-between bg-white/40 dark:bg-gray-800/60">
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${STATUS_COLORS[opt.color || 'gray']}`}>
                  {opt.name}
                </span>
                <span className="text-xs text-gray-400 font-mono font-medium">
                  {laneRows.length}
                </span>
              </div>
            </div>

            {/* 卡片列表 */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
              {laneRows.map((row) => {
                const titleVal = row.properties?.[titleCol?.id] || '无标题';
                const priorityVal = priorityCol ? row.properties?.[priorityCol.id] : null;
                const priorityOpt = priorityCol?.options?.find(o => o.id === priorityVal);
                const dateVal = dateCol ? row.properties?.[dateCol.id] : null;
                const tagsVal = tagsCol ? row.properties?.[tagsCol.id] : [];
                const progressVal = progressCol ? row.properties?.[progressCol.id] : null;

                return (
                  <div
                    key={row.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, row.id)}
                    onClick={() => onOpenRowDetail(row)}
                    className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200/70 dark:border-gray-800 shadow-xs hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition cursor-pointer group"
                  >
                    {/* 卡片标题 */}
                    <div className="flex items-start justify-between">
                      <div className="font-medium text-xs text-gray-800 dark:text-gray-100 leading-snug line-clamp-2">
                        {titleVal}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRow(row.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded transition"
                        title="删除卡片"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* 标签与属性徽章 */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                      {/* 优先级 */}
                      {priorityOpt && (
                        <span className={`px-1.5 py-0.5 rounded border font-medium ${STATUS_COLORS[priorityOpt.color]}`}>
                          {priorityOpt.name}
                        </span>
                      )}

                      {/* 截止日期 */}
                      {dateVal && (
                        <span className="flex items-center space-x-1 text-gray-500 dark:text-gray-400 font-mono">
                          <Calendar className="w-2.5 h-2.5" />
                          <span>{dateVal}</span>
                        </span>
                      )}

                      {/* 多标签 */}
                      {(Array.isArray(tagsVal) ? tagsVal : []).map(tId => {
                        const tOpt = tagsCol?.options?.find(o => o.id === tId);
                        return (
                          <span
                            key={tId}
                            className={`px-1.5 py-0.2 rounded font-medium border ${
                              STATUS_COLORS[tOpt?.color || 'purple']
                            }`}
                          >
                            {tOpt?.name || tId}
                          </span>
                        );
                      })}
                    </div>

                    {/* 进度条 */}
                    {progressVal !== null && progressVal !== undefined && (
                      <div className="mt-2 flex items-center space-x-1.5">
                        <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, progressVal))}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-400 font-mono">{progressVal}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 泳道底部快速添加卡片 */}
            <div className="p-2 border-t border-gray-200/50 dark:border-gray-800/50 bg-white/30 dark:bg-gray-800/30">
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={quickTitle[opt.id] || ''}
                  onChange={(e) => setQuickTitle({ ...quickTitle, [opt.id]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleQuickAdd(opt.id);
                  }}
                  placeholder={`+ 添加到「${opt.name}」...`}
                  className="flex-1 px-2.5 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md outline-hidden focus:border-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400"
                />
                {quickTitle[opt.id] && (
                  <button
                    onClick={() => handleQuickAdd(opt.id)}
                    className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-xs transition"
                  >
                    添加
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
