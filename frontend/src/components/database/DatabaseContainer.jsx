import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Table, Kanban, Download, Trash2, 
  Settings, Check, X, Sparkles, Filter, ArrowUpDown, 
  HelpCircle, RefreshCw
} from 'lucide-react';
import TableView from './TableView';
import KanbanView from './KanbanView';
import RowDetailModal from './RowDetailModal';
import { 
  getDatabase, updateDatabase, deleteDatabase,
  createDatabaseRow, updateDatabaseRow, deleteDatabaseRow
} from '../../api/client';

const ICONS = ['📊', '🚀', '🎯', '📚', '💼', '💡', '📝', '📅', '🏷️', '🌟', '⚙️', '🎨', '📈', '🧪', '📦'];

export default function DatabaseContainer({
  databaseId,
  onDatabaseDeleted
}) {
  const [database, setDatabase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeViewType, setActiveViewType] = useState('table'); // 'table' | 'kanban'
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isAddColModalOpen, setIsAddColModalOpen] = useState(false);

  // 新建列状态
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('text'); // text, select, status, date, number, checkbox

  // 全局点击外部区域自动收起图标选择器
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.icon-picker-box') && !e.target.closest('.icon-picker-trigger')) {
        setIsIconPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, []);

  useEffect(() => {
    if (databaseId) {
      fetchDatabase();
    }
  }, [databaseId]);

  const fetchDatabase = async () => {
    try {
      setLoading(true);
      const data = await getDatabase(databaseId);
      setDatabase(data);
    } catch (err) {
      console.error('Failed to fetch database:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDatabaseMeta = async (updates) => {
    if (!database) return;
    try {
      const updated = await updateDatabase(database.id, updates);
      setDatabase(updated);
    } catch (err) {
      alert('更新数据表失败: ' + err.message);
    }
  };

  const handleCreateRow = async (initialProps = {}) => {
    if (!database) return;
    try {
      const titleCol = database.schema.find(c => c.type === 'title') || database.schema[0];
      const payload = {
        properties: {
          [titleCol?.id]: '新建记录',
          ...initialProps
        }
      };
      const newRow = await createDatabaseRow(database.id, payload);
      setDatabase(prev => ({
        ...prev,
        rows: [...(prev.rows || []), newRow]
      }));
    } catch (err) {
      alert('新建记录失败: ' + err.message);
    }
  };

  const handleUpdateRow = async (rowId, updates) => {
    if (!database) return;
    try {
      const updatedRow = await updateDatabaseRow(database.id, rowId, updates);
      setDatabase(prev => ({
        ...prev,
        rows: (prev.rows || []).map(r => r.id === rowId ? updatedRow : r)
      }));
      if (selectedRow?.id === rowId) {
        setSelectedRow(updatedRow);
      }
    } catch (err) {
      console.error('Failed to update row:', err);
    }
  };

  const handleDeleteRow = async (rowId) => {
    if (!database) return;
    try {
      await deleteDatabaseRow(database.id, rowId);
      setDatabase(prev => ({
        ...prev,
        rows: (prev.rows || []).filter(r => r.id !== rowId)
      }));
      if (selectedRow?.id === rowId) {
        setSelectedRow(null);
      }
    } catch (err) {
      alert('删除记录失败: ' + err.message);
    }
  };

  const handleUpdateSchema = async (newSchema) => {
    await handleUpdateDatabaseMeta({ schema: newSchema });
  };

  const handleAddColumnSubmit = async (e) => {
    e.preventDefault();
    if (!newColName.trim() || !database) return;

    const colId = 'col_' + Date.now().toString(36);
    let options = [];
    if (newColType === 'status') {
      options = [
        { id: 'todo', name: '未开始', color: 'gray' },
        { id: 'doing', name: '进行中', color: 'blue' },
        { id: 'done', name: '已完成', color: 'green' }
      ];
    } else if (newColType === 'select' || newColType === 'multi_select') {
      const nowBase = Date.now().toString(36);
      options = [
        { id: `opt_${nowBase}_1`, name: '选项一', color: 'purple' },
        { id: `opt_${nowBase}_2`, name: '选项二', color: 'amber' }
      ];
    }

    const newColumn = {
      id: colId,
      name: newColName.trim(),
      type: newColType,
      width: 150,
      options: options,
      format: newColType === 'number' ? 'normal' : null
    };

    const updatedSchema = [...database.schema, newColumn];
    await handleUpdateSchema(updatedSchema);
    setIsAddColModalOpen(false);
    setNewColName('');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 text-gray-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>正在加载数据表...</span>
      </div>
    );
  }

  if (!database) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-gray-900 text-gray-400">
        <div className="text-4xl mb-3">📊</div>
        <div className="text-sm">未找到指定的数据表</div>
      </div>
    );
  }

  // 过滤数据行
  const filteredRows = (database.rows || []).filter(row => {
    if (!searchKeyword.trim()) return true;
    const kw = searchKeyword.toLowerCase();
    const propsStr = JSON.stringify(row.properties || {}).toLowerCase();
    const contentStr = (row.content || '').toLowerCase();
    return propsStr.includes(kw) || contentStr.includes(kw);
  });

  return (
    <div className="flex-1 flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* 顶部标题与控制区域 */}
      <div className="px-6 pt-6 pb-3 border-b border-gray-200/80 dark:border-gray-800 shrink-0 space-y-4">
        {/* 数据表图标与标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            {/* 图标选择器 */}
            <div className="relative">
              <button
                onClick={() => setIsIconPickerOpen(!isIconPickerOpen)}
                className="icon-picker-trigger text-3xl p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition cursor-pointer select-none"
                title="更换图标"
              >
                {database.icon || '📊'}
              </button>

              {isIconPickerOpen && (
                <div className="icon-picker-box absolute top-full left-0 mt-2 p-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 grid grid-cols-5 gap-1.5 z-50 animate-fadeIn min-w-[190px]">
                  {ICONS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => {
                        handleUpdateDatabaseMeta({ icon: emoji });
                        setIsIconPickerOpen(false);
                      }}
                      className="text-xl p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition text-center"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 标题与描述输入 */}
            <div className="flex-1">
              <input
                type="text"
                value={database.title}
                onChange={(e) => setDatabase({ ...database, title: e.target.value })}
                onBlur={(e) => handleUpdateDatabaseMeta({ title: e.target.value })}
                placeholder="数据表名称"
                className="text-xl sm:text-2xl font-bold bg-transparent border-none outline-hidden focus:ring-0 text-gray-900 dark:text-gray-100 w-full"
              />
              <input
                type="text"
                value={database.description || ''}
                onChange={(e) => setDatabase({ ...database, description: e.target.value })}
                onBlur={(e) => handleUpdateDatabaseMeta({ description: e.target.value })}
                placeholder="添加数据表描述..."
                className="text-xs text-gray-400 bg-transparent border-none outline-hidden focus:ring-0 w-full -mt-1"
              />
            </div>
          </div>

          {/* 右侧全局操作 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={async () => {
                if (window.confirm(`确定要将数据表「${database.title}」移入废纸篓吗？`)) {
                  try {
                    await deleteDatabase(database.id);
                    if (onDatabaseDeleted) {
                      await onDatabaseDeleted(database.id);
                    }
                  } catch (err) {
                    alert('删除数据表失败: ' + err.message);
                  }
                }
              }}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition cursor-pointer"
              title="删除数据表并移入废纸篓"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 视图切换与工具条 */}
        <div className="flex items-center justify-between pt-1">
          {/* 视图切换 Tab (表格 vs 看板) */}
          <div className="flex items-center space-x-1 bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-lg">
            <button
              onClick={() => setActiveViewType('table')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                activeViewType === 'table'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>表格视图</span>
            </button>

            <button
              onClick={() => setActiveViewType('kanban')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                activeViewType === 'kanban'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>看板视图</span>
            </button>
          </div>

          {/* 搜索与新建记录 */}
          <div className="flex items-center space-x-2.5">
            {/* 实时搜索 */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索记录..."
                className="pl-8 pr-3 py-1 text-xs bg-gray-100/70 dark:bg-gray-800/60 border border-transparent focus:border-blue-500 rounded-lg outline-hidden text-gray-800 dark:text-gray-200 placeholder-gray-400 w-40 sm:w-48 transition"
              />
            </div>

            {/* 新建记录按钮 */}
            <button
              onClick={() => handleCreateRow()}
              className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建记录</span>
            </button>
          </div>
        </div>
      </div>

      {/* 视图主体 */}
      <div className="flex-1 overflow-y-auto">
        {activeViewType === 'table' ? (
          <TableView
            database={database}
            rows={filteredRows}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
            onCreateRow={() => handleCreateRow()}
            onOpenRowDetail={(row) => setSelectedRow(row)}
            onUpdateSchema={handleUpdateSchema}
            onAddColumn={() => setIsAddColModalOpen(true)}
          />
        ) : (
          <KanbanView
            database={database}
            rows={filteredRows}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
            onCreateRow={(initialProps) => handleCreateRow(initialProps)}
            onOpenRowDetail={(row) => setSelectedRow(row)}
            onUpdateSchema={handleUpdateSchema}
          />
        )}
      </div>

      {/* 新增列弹窗 (Add Column Modal) */}
      {isAddColModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setIsAddColModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl p-5 shadow-2xl border border-gray-200 dark:border-gray-700 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">新增属性列</h3>
              <button onClick={() => setIsAddColModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddColumnSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">列名称</label>
                <input
                  type="text"
                  required
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="例如: 责任人, 评估分数..."
                  className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">属性类型</label>
                <select
                  value={newColType}
                  onChange={(e) => setNewColType(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg outline-hidden focus:border-blue-500"
                >
                  <option value="text">📝 文本 (Text)</option>
                  <option value="status">🚥 状态 (Status)</option>
                  <option value="select">🏷️ 单选标签 (Select)</option>
                  <option value="multi_select">🏷️ 多选标签 (Multi-Select)</option>
                  <option value="date">📅 日期 (Date)</option>
                  <option value="number">🔢 数字 / 进度 (Number)</option>
                  <option value="checkbox">☑️ 复选框 (Checkbox)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddColModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-xs transition"
                >
                  确认添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 行即页面详情抽屉/弹窗 */}
      <RowDetailModal
        isOpen={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        database={database}
        row={selectedRow}
        onUpdateRow={handleUpdateRow}
        onDeleteRow={handleDeleteRow}
        onUpdateSchema={handleUpdateSchema}
      />
    </div>
  );
}
