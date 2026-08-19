import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  X, Maximize2, Minimize2, RefreshCw, ZoomIn, ZoomOut, 
  Layers, Search, Share2, Tag, BookOpen, Info
} from 'lucide-react';
import { getKnowledgeGraph } from '../api/client';
import { localDb } from '../services/localDb';

export default function GraphViewModal({ isOpen, onClose, onSelectNote }) {
  const canvasRef = useRef(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [showTags, setShowTags] = useState(true);
  const [hoveredNode, setHoveredNode] = useState(null);

  // 物理引擎与视口状态
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const animFrameRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragTargetRef = useRef(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // 加载数据
  useEffect(() => {
    if (!isOpen) return;
    loadGraphData();
  }, [isOpen]);

  const loadGraphData = async () => {
    setLoading(true);
    try {
      let data;
      try {
        data = await getKnowledgeGraph();
      } catch (e) {
        // 离线环境从 IndexedDB 本地计算
        data = await localDb.getGraphData();
      }

      if (data && data.nodes) {
        // 初始化节点物理位置 (随机圆盘分布)
        const width = 800;
        const height = 600;
        const initializedNodes = data.nodes.map((n, i) => {
          const angle = (i / data.nodes.length) * 2 * Math.PI;
          const radius = 100 + Math.random() * 180;
          return {
            ...n,
            x: width / 2 + Math.cos(angle) * radius,
            y: height / 2 + Math.sin(angle) * radius,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            radius: n.group === 'tag' ? 6 : Math.min(18, 8 + (n.val || 1) * 2.5)
          };
        });

        nodesRef.current = initializedNodes;
        linksRef.current = data.links || [];
        setGraphData({ nodes: initializedNodes, links: data.links || [] });
      }
    } catch (err) {
      console.error('Failed to load knowledge graph:', err);
    } finally {
      setLoading(false);
    }
  };

  // 物理模拟与 Canvas 渲染循环 (60fps)
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 1. 物理受力计算 (排斥力 + 弹簧拉力 + 阻尼)
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const isDark = document.documentElement.classList.contains('dark');

    // 斥力
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);
        if (dist < 350) {
          const force = 300 / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }
    }

    // 引力 (弹簧)
    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    links.forEach(l => {
      const source = typeof l.source === 'object' ? l.source : nodeMap[l.source];
      const target = typeof l.target === 'object' ? l.target : nodeMap[l.target];
      if (source && target) {
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const desiredDist = 120;
        const force = (dist - desiredDist) * 0.02;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      }
    });

    // 向心力与位置更新
    nodes.forEach(n => {
      if (dragTargetRef.current && dragTargetRef.current.id === n.id) {
        n.vx = 0;
        n.vy = 0;
        return;
      }
      // 向中心吸引
      const cdx = width / 2 - n.x;
      const cdy = height / 2 - n.y;
      n.vx += cdx * 0.002;
      n.vy += cdy * 0.002;

      // 阻尼
      n.vx *= 0.88;
      n.vy *= 0.88;
      n.x += n.vx;
      n.y += n.vy;
    });

    // 2. 清屏与矩阵变换
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(transformRef.current.x, transformRef.current.y);
    ctx.scale(transformRef.current.scale, transformRef.current.scale);

    // 3. 绘制连线
    links.forEach(l => {
      const source = typeof l.source === 'object' ? l.source : nodeMap[l.source];
      const target = typeof l.target === 'object' ? l.target : nodeMap[l.target];
      if (!source || !target) return;
      if (!showTags && (source.group === 'tag' || target.group === 'tag')) return;

      const isConnected = hoveredNode && (source.id === hoveredNode.id || target.id === hoveredNode.id);
      
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = isConnected 
        ? '#3B82F6' 
        : (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)');
      ctx.lineWidth = isConnected ? 2 : 1;
      ctx.stroke();
    });

    // 4. 绘制节点与文字
    nodes.forEach(n => {
      if (!showTags && n.group === 'tag') return;
      const isHovered = hoveredNode && hoveredNode.id === n.id;
      const isConnected = hoveredNode && links.some(l => 
        (l.source === hoveredNode.id && l.target === n.id) ||
        (l.target === hoveredNode.id && l.source === n.id)
      );

      // 发光与填充
      ctx.beginPath();
      ctx.arc(n.x, n.y, isHovered ? n.radius * 1.3 : n.radius, 0, 2 * Math.PI);
      
      if (n.group === 'tag') {
        ctx.fillStyle = isHovered ? '#F59E0B' : (isDark ? '#B45309' : '#FDE68A');
      } else {
        ctx.fillStyle = isHovered || isConnected ? '#3B82F6' : (isDark ? '#1E40AF' : '#93C5FD');
      }
      ctx.fill();

      // 外描边
      ctx.strokeStyle = isHovered ? '#FFFFFF' : (isDark ? '#3B82F6' : '#2563EB');
      ctx.lineWidth = isHovered ? 2.5 : 1;
      ctx.stroke();

      // 标题文字
      ctx.font = isHovered ? 'bold 12px sans-serif' : '10px sans-serif';
      ctx.fillStyle = isHovered ? (isDark ? '#FFFFFF' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B');
      ctx.textAlign = 'center';
      ctx.fillText(n.title, n.x, n.y + n.radius + 12);
    });

    ctx.restore();
    animFrameRef.current = requestAnimationFrame(render);
  }, [showTags, hoveredNode]);

  // 启动渲染循环
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    }
    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, render]);

  // 坐标系转换 (屏幕坐标 -> 内部 Canvas 物理坐标)
  const getCanvasPos = (clientX, clientY) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const x = (sx - transformRef.current.x) / transformRef.current.scale;
    const y = (sy - transformRef.current.y) / transformRef.current.scale;
    return { x, y, sx, sy };
  };

  // 鼠标与手势交互
  const handleMouseDown = (e) => {
    const { x, y, sx, sy } = getCanvasPos(e.clientX, e.clientY);
    lastMousePosRef.current = { x: sx, y: sy };

    // 检查是否点中某个节点
    const clickedNode = nodesRef.current.find(n => {
      const dx = n.x - x;
      const dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius * 1.5;
    });

    if (clickedNode) {
      dragTargetRef.current = clickedNode;
    } else {
      isDraggingRef.current = true;
    }
  };

  const handleMouseMove = (e) => {
    const { x, y, sx, sy } = getCanvasPos(e.clientX, e.clientY);

    // 拖动节点
    if (dragTargetRef.current) {
      dragTargetRef.current.x = x;
      dragTargetRef.current.y = y;
      return;
    }

    // 平移画布
    if (isDraggingRef.current) {
      const dx = sx - lastMousePosRef.current.x;
      const dy = sy - lastMousePosRef.current.y;
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      lastMousePosRef.current = { x: sx, y: sy };
      return;
    }

    // Hover 检测
    const hovered = nodesRef.current.find(n => {
      const dx = n.x - x;
      const dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius * 1.5;
    });
    setHoveredNode(hovered || null);
  };

  const handleMouseUp = (e) => {
    // 若点击了笔记节点，触发跳转
    if (dragTargetRef.current && !isDraggingRef.current) {
      const target = dragTargetRef.current;
      if (target.group === 'note' && onSelectNote) {
        onSelectNote(target.id);
        onClose();
      }
    }
    dragTargetRef.current = null;
    isDraggingRef.current = false;
  };

  // 滚轮缩放
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(3.0, Math.max(0.3, transformRef.current.scale * zoomFactor));
    transformRef.current.scale = newScale;
  };

  // 重置视角
  const handleResetView = () => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    loadGraphData();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fadeIn">
      <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all ${
        isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[85vh]'
      }`}>
        {/* 顶部控制工具栏 */}
        <div className="h-14 px-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                <span>全库知识关系图谱</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-mono">
                  {nodesRef.current.length} 节点 · {linksRef.current.length} 关系
                </span>
              </h3>
              <p className="text-[11px] text-gray-400">点击任意节点秒级跳转，滚轮缩放，拖拽重组</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* 切换标签显示 */}
            <button
              onClick={() => setShowTags(!showTags)}
              className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                showTags 
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-300'
                  : 'bg-gray-100 dark:bg-gray-800 border-transparent text-gray-400'
              }`}
              title="显示/隐藏 #标签 节点"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>标签</span>
            </button>

            {/* 重置视角 */}
            <button
              onClick={handleResetView}
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition"
              title="重置视角与重新聚类"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* 全屏切换 */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition"
              title="全屏切换"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* 关闭 */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 主画布区域 */}
        <div className="flex-1 relative bg-gray-50/30 dark:bg-gray-950/50 overflow-hidden select-none cursor-grab active:cursor-grabbing">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-xs">
              <div className="flex items-center space-x-2 text-xs text-gray-500">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                <span>正在解析全库双向链接网络...</span>
              </div>
            </div>
          )}

          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            className="w-full h-full block"
          />

          {/* 悬浮提示卡片 */}
          {hoveredNode && (
            <div className="absolute bottom-4 left-4 p-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg text-xs space-y-1 animate-fadeIn pointer-events-none">
              <div className="font-bold text-gray-900 dark:text-white flex items-center space-x-1.5">
                {hoveredNode.group === 'tag' ? <Tag className="w-3.5 h-3.5 text-amber-500" /> : <BookOpen className="w-3.5 h-3.5 text-blue-500" />}
                <span>{hoveredNode.title}</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                分类: {hoveredNode.notebook_name} · 连接数: {hoveredNode.val}
              </p>
              {hoveredNode.group === 'note' && (
                <p className="text-[10px] text-blue-500 font-medium pt-0.5">点击可直接跳转到此笔记</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
