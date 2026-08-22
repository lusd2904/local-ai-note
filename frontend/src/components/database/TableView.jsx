import React, { useState, useEffect } from 'react';
import { 
  Plus, ChevronDown, 
  Trash2, Maximize2, Calendar, Tag, 
  Layers, Hash, CheckSquare, AlignLeft
} from 'lucide-react';
import TagOptionSelector, { STATUS_COLORS } from './TagOptionSelector';

function TableTextInput({ value, onSave, placeholder, className }) {
  const [localVal, setLocalVal] = useState(value || '');
  useEffect(() => {
    setLocalVal(value || '');
  }, [value]);

  return (
    <input
      type="text"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => {
        if (localVal !== (value || '')) {
          onSave(localVal);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}

function TableNumberInput({ value, onSave, placeholder, className }) {
  const [localVal, setLocalVal] = useState(value ?? '');
  useEffect(() => {
    setLocalVal(value ?? '');
  }, [value]);

  return (
    <input
      type="number"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => {
        const numVal = localVal === '' ? null : Number(localVal);
        if (numVal !== (value ?? null)) {
          onSave(numVal);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}


export default function TableView({
  database,
  rows = [],
  onUpdateRow,
  onDeleteRow,
  onCreateRow,
  onOpenRowDetail,
  onUpdateSchema,
  onAddColumn
}) {
  const [activeCellDropdown, setActiveCellDropdown] = useState(null); // { rowId, colId }
  const [activeHeaderDropdown, setActiveHeaderDropdown] = useState(null); // colId
  const [hoveredRowId, setHoveredRowId] = useState(null);

  // 全局点击外部区域自动收起所有单元格和表头下拉菜单
  React.useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.db-dropdown-box') && !e.target.closest('.db-dropdown-trigger')) {
        setActiveCellDropdown(null);
        setActiveHeaderDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, []);

  const titleCol = database.schema.find(c => c.type === 'title') || database.schema[0];

  // 立即提交（用于 select、checkbox、date 等非连续输入类型）
  const handleCellChange = (rowId, colId, value) => {
    const targetRow = rows.find(r => r.id === rowId);
    if (!targetRow) return;
    const nextProps = { ...targetRow.properties, [colId]: value };
    onUpdateRow(rowId, { properties: nextProps });
  };

  const footerStats = React.useMemo(() => {
    return database.schema.slice(1).map((col) => {
      if (col.type === 'number') {
        const nums = rows.map(r => Number(r.properties?.[col.id]) || 0);
        const sum = nums.reduce((a, b) => a + b, 0);
        const avg = rows.length > 0 ? (sum / rows.length).toFixed(1) : 0;
        return { col, kind: 'number', avg };
      }
      if (col.type === 'checkbox') {
        const checkedCount = rows.filter(r => Boolean(r.properties?.[col.id])).length;
        const pct = rows.length > 0 ? Math.round((checkedCount / rows.length) * 100) : 0;
        return { col, kind: 'checkbox', pct };
      }
      return { col, kind: 'empty' };
    });
  }, [rows, database.schema]);

  const getColIcon = (type) => {
    switch (type) {
      case 'title': return <AlignLeft className="w-3.5 h-3.5 text-gray-500" />;
      case 'status': return <Layers className="w-3.5 h-3.5 text-blue-500" />;
      case 'select': return <Tag className="w-3.5 h-3.5 text-amber-500" />;
      case 'multi_select': return <Tag className="w-3.5 h-3.5 text-purple-500" />;
      case 'date': return <Calendar className="w-3.5 h-3.5 text-emerald-500" />;
      case 'number': return <Hash className="w-3.5 h-3.5 text-cyan-500" />;
      case 'checkbox': return <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />;
      default: return <AlignLeft className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  return (
    <div className="w-full overflow-x-auto select-none min-h-[520px] pb-72">
      <table className="w-full border-collapse text-left text-xs min-w-[700px]">
        {/* 表头 (Headers) */}
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/75 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400">
            {/* 序号/操作列 */}
            <th className="w-10 px-3 py-2.5 text-center font-normal text-gray-400">#</th>

            {/* 动态属性列 */}
            {database.schema.map((col) => (
              <th
                key={col.id}
                style={{ width: col.width || 160 }}
                className="px-3 py-2.5 font-medium border-r border-gray-100 dark:border-gray-800/60 relative group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 truncate">
                    {getColIcon(col.type)}
                    <span className="truncate">{col.name}</span>
                  </div>

                  {/* 表头菜单触发 */}
                  {col.type !== 'title' && (
                    <button
                      onClick={() => setActiveHeaderDropdown(activeHeaderDropdown === col.id ? null : col.id)}
                      className="db-dropdown-trigger opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 表头下拉操作菜单 */}
                {activeHeaderDropdown === col.id && (
                  <div className="db-dropdown-box absolute top-full left-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-30 font-normal animate-fadeIn">
                    <button
                      onClick={() => {
                        const newName = window.prompt('请输入新的列名:', col.name);
                        if (newName && newName.trim()) {
                          const updatedSchema = database.schema.map(c => c.id === col.id ? { ...c, name: newName.trim() } : c);
                          onUpdateSchema(updatedSchema);
                        }
                        setActiveHeaderDropdown(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                      重命名列
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`确定要删除列「${col.name}」吗？`)) {
                          const updatedSchema = database.schema.filter(c => c.id !== col.id);
                          onUpdateSchema(updatedSchema);
                        }
                        setActiveHeaderDropdown(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                    >
                      删除列
                    </button>
                  </div>
                )}
              </th>
            ))}

            {/* 添加新列按钮 */}
            <th className="w-24 px-3 py-2.5 font-normal text-gray-400">
              <button
                onClick={onAddColumn}
                className="flex items-center space-x-1 text-gray-400 hover:text-blue-500 transition"
                title="添加属性列"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增列</span>
              </button>
            </th>
          </tr>
        </thead>

        {/* 表格内容行 (Rows) */}
        <tbody>
          {rows.map((row, index) => {
            const isHovered = hoveredRowId === row.id;
            const isNearBottom = rows.length > 3 && index >= rows.length - 2;

            return (
              <tr
                key={row.id}
                onMouseEnter={() => setHoveredRowId(row.id)}
                onMouseLeave={() => setHoveredRowId(null)}
                className="border-b border-gray-100 dark:border-gray-800/60 hover:bg-blue-50/20 dark:hover:bg-gray-800/30 transition group"
              >
                {/* 序号与快捷删除 */}
                <td className="px-3 py-2 text-center text-gray-400 relative">
                  {isHovered ? (
                    <button
                      onClick={() => onDeleteRow(row.id)}
                      className="text-gray-400 hover:text-red-500 transition"
                      title="删除此行"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="font-mono text-[11px]">{index + 1}</span>
                  )}
                </td>

                {/* 各单元格 */}
                {database.schema.map((col, colIndex) => {
                  const val = row.properties?.[col.id];
                  const isTitle = col.type === 'title';
                  const isRightSide = colIndex >= database.schema.length - 2;

                  return (
                    <td
                      key={col.id}
                      className="px-3 py-2 border-r border-gray-100 dark:border-gray-800/40 relative align-middle"
                    >
                      {/* 1. 标题 (Title) */}
                      {isTitle && (
                        <div className="flex items-center justify-between group/cell">
                          <TableTextInput
                            value={val || ''}
                            onSave={(newVal) => handleCellChange(row.id, col.id, newVal)}
                            placeholder="未命名"
                            className="w-full bg-transparent font-medium text-gray-800 dark:text-gray-200 outline-hidden focus:bg-white dark:focus:bg-gray-800 focus:ring-1 focus:ring-blue-500 rounded px-1 -mx-1"
                          />
                          <button
                            onClick={() => onOpenRowDetail(row)}
                            className="opacity-0 group-hover/cell:opacity-100 ml-1 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-[10px] shrink-0 hover:bg-blue-500 hover:text-white transition flex items-center space-x-0.5"
                            title="打开为独立页面"
                          >
                            <Maximize2 className="w-2.5 h-2.5" />
                            <span>打开</span>
                          </button>
                        </div>
                      )}

                      {/* 2. 状态 (Status) */}
                      {col.type === 'status' && (
                        <div className="relative">
                          <button
                            onClick={() => setActiveCellDropdown(
                              activeCellDropdown?.rowId === row.id && activeCellDropdown?.colId === col.id
                                ? null
                                : { rowId: row.id, colId: col.id }
                            )}
                            className={`db-dropdown-trigger px-2 py-0.5 rounded text-[11px] font-medium border flex items-center space-x-1 transition ${
                              STATUS_COLORS[col.options?.find(o => o.id === val)?.color || 'gray']
                            }`}
                          >
                            <span>{col.options?.find(o => o.id === val)?.name || val || '未设置'}</span>
                            <ChevronDown className="w-2.5 h-2.5 opacity-50" />
                          </button>

                          {activeCellDropdown?.rowId === row.id && activeCellDropdown?.colId === col.id && (
                            <TagOptionSelector
                              col={col}
                              value={val}
                              onChange={(newVal) => handleCellChange(row.id, col.id, newVal)}
                              onUpdateSchema={onUpdateSchema}
                              database={database}
                              onClose={() => setActiveCellDropdown(null)}
                              isNearBottom={isNearBottom}
                              align={isRightSide ? 'right' : 'left'}
                            />
                          )}
                        </div>
                      )}

                      {/* 3. 单选 (Select) */}
                      {col.type === 'select' && (
                        <div className="relative">
                          <button
                            onClick={() => setActiveCellDropdown(
                              activeCellDropdown?.rowId === row.id && activeCellDropdown?.colId === col.id
                                ? null
                                : { rowId: row.id, colId: col.id }
                            )}
                            className={`db-dropdown-trigger px-2 py-0.5 rounded text-[11px] font-medium border flex items-center space-x-1 transition ${
                              STATUS_COLORS[col.options?.find(o => o.id === val)?.color || 'gray']
                            }`}
                          >
                            <span>{col.options?.find(o => o.id === val)?.name || val || '选择'}</span>
                            <ChevronDown className="w-2.5 h-2.5 opacity-50" />
                          </button>

                          {activeCellDropdown?.rowId === row.id && activeCellDropdown?.colId === col.id && (
                            <TagOptionSelector
                              col={col}
                              value={val}
                              onChange={(newVal) => handleCellChange(row.id, col.id, newVal)}
                              onUpdateSchema={onUpdateSchema}
                              database={database}
                              onClose={() => setActiveCellDropdown(null)}
                              isNearBottom={isNearBottom}
                              align={isRightSide ? 'right' : 'left'}
                            />
                          )}
                        </div>
                      )}

                      {/* 4. 多选 (Multi-Select) */}
                      {col.type === 'multi_select' && (
                        <div className="relative flex flex-wrap items-center gap-1">
                          {(Array.isArray(val) ? val : []).map(tagId => {
                            const opt = col.options?.find(o => o.id === tagId);
                            return (
                              <span
                                key={tagId}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                  STATUS_COLORS[opt?.color || 'purple']
                                }`}
                              >
                                {opt?.name || tagId}
                              </span>
                            );
                          })}

                          <button
                            onClick={() => setActiveCellDropdown(
                              activeCellDropdown?.rowId === row.id && activeCellDropdown?.colId === col.id
                                ? null
                                : { rowId: row.id, colId: col.id }
                            )}
                            className="db-dropdown-trigger p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition cursor-pointer"
                            title="选择或自定义标签"
                          >
                            <Plus className="w-3 h-3" />
                          </button>

                          {activeCellDropdown?.rowId === row.id && activeCellDropdown?.colId === col.id && (
                            <TagOptionSelector
                              col={col}
                              value={val}
                              onChange={(newVal) => handleCellChange(row.id, col.id, newVal)}
                              onUpdateSchema={onUpdateSchema}
                              database={database}
                              onClose={() => setActiveCellDropdown(null)}
                              isNearBottom={isNearBottom}
                              align={isRightSide ? 'right' : 'left'}
                            />
                          )}
                        </div>
                      )}

                      {/* 5. 日期 (Date) */}
                      {col.type === 'date' && (
                        <input
                          type="date"
                          value={val || ''}
                          onChange={(e) => handleCellChange(row.id, col.id, e.target.value)}
                          className="bg-transparent text-gray-700 dark:text-gray-300 outline-hidden font-mono text-[11px]"
                        />
                      )}

                      {/* 6. 数字 / 进度 (Number) */}
                      {col.type === 'number' && (
                        <div className="flex items-center space-x-1.5">
                          <TableNumberInput
                            value={val}
                            onSave={(newVal) => handleCellChange(row.id, col.id, newVal)}
                            placeholder="0"
                            className="w-14 bg-transparent font-mono text-gray-800 dark:text-gray-200 outline-hidden focus:bg-white dark:focus:bg-gray-800 focus:ring-1 focus:ring-blue-500 rounded px-1"
                          />
                          {col.format === 'percent' && (
                            <div className="flex-1 min-w-[50px] bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-blue-500 h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, val || 0))}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* 7. 复选框 (Checkbox) */}
                      {col.type === 'checkbox' && (
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          onChange={(e) => handleCellChange(row.id, col.id, e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      )}

                      {/* 8. 普通文本 (Text) */}
                      {col.type === 'text' && (
                        <TableTextInput
                          value={val || ''}
                          onSave={(newVal) => handleCellChange(row.id, col.id, newVal)}
                          placeholder="空"
                          className="w-full bg-transparent text-gray-700 dark:text-gray-300 outline-hidden focus:bg-white dark:focus:bg-gray-800 focus:ring-1 focus:ring-blue-500 rounded px-1 -mx-1"
                        />
                      )}
                    </td>
                  );
                })}

                {/* 最后一列空白 */}
                <td className="px-3 py-2"></td>
              </tr>
            );
          })}
        </tbody>

        {/* 表格底部汇总统计栏 (Footer Calculation) */}
        <tfoot>
          <tr className="border-t-2 border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 text-gray-500 dark:text-gray-400 font-medium">
            <td className="px-3 py-2 text-center font-mono text-[10px]">∑</td>
            <td className="px-3 py-2 font-mono text-[11px]">共 {rows.length} 条记录</td>

            {footerStats.map(({ col, kind, avg, pct }) => {
              if (kind === 'number') {
                return (
                  <td key={col.id} className="px-3 py-2 font-mono text-[11px] text-blue-600 dark:text-blue-400">
                    均值: {avg}{col.format === 'percent' ? '%' : ''}
                  </td>
                );
              }
              if (kind === 'checkbox') {
                return (
                  <td key={col.id} className="px-3 py-2 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                    已勾选: {pct}%
                  </td>
                );
              }
              return <td key={col.id} className="px-3 py-2"></td>;
            })}

            <td className="px-3 py-2"></td>
          </tr>
        </tfoot>
      </table>

      {/* 底部新增一行按钮 */}
      <div className="p-2 border-t border-gray-100 dark:border-gray-800/60">
        <button
          onClick={onCreateRow}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新增一行</span>
        </button>
      </div>
    </div>
  );
}
