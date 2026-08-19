import React, { useState, useEffect } from 'react';
import { 
  Zap, Send, Image as ImageIcon, Pin, Trash2, Tag, 
  Sparkles, CheckSquare, Square, X, Calendar, ArrowRight,
  RefreshCw, Check, Layers
} from 'lucide-react';
import { getMemos, createMemo, updateMemo, deleteMemo, convertMemosToNote, uploadImage } from '../api/client';
import { localDb } from '../services/localDb';

export default function MemoStreamView({ onNavigateToNote }) {
  const [memos, setMemos] = useState([]);
  const [content, setContent] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [selectedMemoIds, setSelectedMemoIds] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [attachedImages, setAttachedImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [successTip, setSuccessTip] = useState('');

  useEffect(() => {
    loadMemos();
  }, [selectedTag]);

  const loadMemos = async () => {
    setLoading(true);
    try {
      let list;
      try {
        list = await getMemos({ tag: selectedTag || undefined });
      } catch (e) {
        list = await localDb.getMemos({ tag: selectedTag || undefined });
      }

      setMemos(list || []);

      // 提取全部可用标签
      const tagSet = new Set();
      (list || []).forEach(m => {
        (m.tags || []).forEach(t => tagSet.add(t));
      });
      setAllTags(Array.from(tagSet));
    } catch (err) {
      console.error('Failed to load memos:', err);
    } finally {
      setLoading(false);
    }
  };

  // 发布闪念
  const handleCreateMemo = async (e) => {
    if (e) e.preventDefault();
    if (!content.trim() && attachedImages.length === 0) return;

    try {
      const data = {
        content: content.trim(),
        images: attachedImages,
        tags: []
      };

      try {
        await createMemo(data);
      } catch (err) {
        await localDb.createMemo(data);
      }

      setContent('');
      setAttachedImages([]);
      loadMemos();
    } catch (err) {
      alert('发布闪念失败: ' + err.message);
    }
  };

  // 快捷键发布 (Cmd + Enter)
  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleCreateMemo();
    }
  };

  // 上传图片附件
  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const res = await uploadImage(file);
      if (res && res.url) {
        setAttachedImages(prev => [...prev, res.url]);
      }
    } catch (err) {
      alert('上传图片失败: ' + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  // 置顶切换
  const handleTogglePin = async (memo) => {
    try {
      const updates = { is_pinned: !memo.is_pinned };
      try {
        await updateMemo(memo.id, updates);
      } catch (e) {
        await localDb.updateMemo(memo.id, updates);
      }
      loadMemos();
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  // 删除闪念
  const handleDeleteMemo = async (id) => {
    if (!window.confirm('确定要删除这条闪念速记吗？')) return;
    try {
      try {
        await deleteMemo(id);
      } catch (e) {
        await localDb.deleteMemo(id);
      }
      loadMemos();
    } catch (err) {
      console.error('Failed to delete memo:', err);
    }
  };

  // 选中 / 反选
  const handleToggleSelect = (id) => {
    setSelectedMemoIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // 一键合并为长篇笔记
  const handleBatchConvertToNote = async () => {
    if (selectedMemoIds.length === 0) return;
    setConverting(true);
    try {
      const res = await convertMemosToNote({
        memo_ids: selectedMemoIds,
        title: `闪念汇总 (${new Date().toLocaleDateString()})`
      });

      setSelectedMemoIds([]);
      setSuccessTip(`已成功将 ${res.memo_count} 条闪念合并为新笔记！`);
      setTimeout(() => setSuccessTip(''), 4000);
      loadMemos();

      if (res.note_id && onNavigateToNote) {
        onNavigateToNote(res.note_id);
      }
    } catch (err) {
      alert('合并笔记失败: ' + err.message);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="flex-1 bg-mac-editor dark:bg-mac-editorDark flex flex-col h-screen overflow-hidden">
      {/* 顶部标题栏 */}
      <div 
        style={{ WebkitAppRegion: 'drag' }}
        className="h-12 px-6 border-b border-mac-border dark:border-mac-borderDark flex items-center justify-between bg-white/80 dark:bg-gray-900/80 backdrop-blur shrink-0"
      >
        <div className="flex items-center space-x-2.5" style={{ WebkitAppRegion: 'no-drag' }}>
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <span>闪念速记流 (Memo Stream)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-mono">
                {memos.length} 条灵感
              </span>
            </h2>
          </div>
        </div>

        {/* 批量合并按钮 */}
        {selectedMemoIds.length > 0 && (
          <button
            onClick={handleBatchConvertToNote}
            disabled={converting}
            style={{ WebkitAppRegion: 'no-drag' }}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg text-xs font-bold shadow transition animate-fadeIn"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>一键合并为长笔记 ({selectedMemoIds.length})</span>
          </button>
        )}
      </div>

      {/* 成功提示条 */}
      {successTip && (
        <div className="bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 text-xs px-6 py-2 flex items-center space-x-2 border-b border-green-200 dark:border-green-800 animate-fadeIn">
          <Check className="w-4 h-4" />
          <span>{successTip}</span>
        </div>
      )}

      {/* 主滚动列表 */}
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
        {/* 1. 顶部极速录入卡片 */}
        <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="随时记录一闪而过的灵感、待办或随想... 支持直接输入 #标签 (按 Cmd+Enter 快速发布)"
            className="w-full bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none leading-relaxed"
          />

          {/* 图片预览列表 */}
          {attachedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {attachedImages.map((imgUrl, i) => (
                <div key={i} className="relative group">
                  <img src={imgUrl} alt="attachment" className="w-16 h-16 object-cover rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm" />
                  <button
                    onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow hover:scale-110 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 底部工具栏 */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center space-x-2">
              <label className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-blue-500 cursor-pointer transition">
                <ImageIcon className="w-4 h-4" />
                <input type="file" accept="image/*" onChange={handleUploadImage} className="hidden" />
              </label>
              <span className="text-[11px] text-gray-400">支持 #标签 自动归类</span>
            </div>

            <button
              onClick={handleCreateMemo}
              disabled={!content.trim() && attachedImages.length === 0}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-sm transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>发布闪念</span>
            </button>
          </div>
        </div>

        {/* 2. 标签快速筛选栏 */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedTag('')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                selectedTag === ''
                  ? 'bg-blue-500 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              全部
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  selectedTag === tag
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300 hover:bg-amber-100'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* 3. 闪念时间轴卡片流 */}
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-xs flex items-center justify-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
            <span>加载闪念记录中...</span>
          </div>
        ) : memos.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-xs space-y-2">
            <Zap className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-700" />
            <p className="font-semibold text-gray-500">暂无闪念记录</p>
            <p>随时在上方输入一句话，捕获您的灵感碎片！</p>
          </div>
        ) : (
          <div className="space-y-4">
            {memos.map(memo => {
              const isSelected = selectedMemoIds.includes(memo.id);
              return (
                <div
                  key={memo.id}
                  className={`p-4 rounded-2xl bg-white dark:bg-gray-900 border transition shadow-xs space-y-3 ${
                    memo.is_pinned 
                      ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10' 
                      : 'border-gray-200/80 dark:border-gray-800'
                  }`}
                >
                  {/* 顶部信息与置顶/勾选 */}
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleToggleSelect(memo.id)}
                        className="text-gray-400 hover:text-blue-500 transition"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                      <span className="font-mono text-[11px]">
                        {memo.created_at ? new Date(memo.created_at).toLocaleString() : ''}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleTogglePin(memo)}
                        className={`p-1 rounded transition ${
                          memo.is_pinned 
                            ? 'text-amber-500 hover:text-amber-600 bg-amber-50 dark:bg-amber-950/50' 
                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                        title={memo.is_pinned ? "取消置顶" : "置顶此闪念"}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteMemo(memo.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition rounded"
                        title="删除闪念"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 闪念正文 */}
                  <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                    {memo.content}
                  </div>

                  {/* 图片附件 */}
                  {Array.isArray(memo.images) && memo.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {memo.images.map((img, idx) => (
                        <img
                          key={idx}
                          src={img}
                          alt="memo image"
                          className="max-h-48 rounded-xl object-cover border border-gray-200 dark:border-gray-800 shadow-sm"
                        />
                      ))}
                    </div>
                  )}

                  {/* 标签 */}
                  {Array.isArray(memo.tags) && memo.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {memo.tags.map(t => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 text-[11px] font-medium"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
