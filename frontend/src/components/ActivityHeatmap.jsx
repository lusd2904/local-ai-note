import React, { useMemo } from 'react';
import { Flame, BookOpen, PenTool, CheckCircle2 } from 'lucide-react';

/**
 * GitHub 风格 365 天知识产出打卡热力图组件
 * @param {Array} notes 笔记列表
 * @param {Array} memos 闪念列表
 */
export default function ActivityHeatmap({ notes = [], memos = [] }) {
  // 计算过去 365 天的活跃统计
  const { gridWeeks, totalDays, totalWords, activeDaysCount, maxStreak, currentStreak } = useMemo(() => {
    const today = new Date();
    const dateMap = {}; // 'YYYY-MM-DD' -> { count: 0, chars: 0 }

    // 统计笔记
    notes.forEach(n => {
      if (!n.created_at) return;
      const d = n.created_at.slice(0, 10);
      if (!dateMap[d]) dateMap[d] = { count: 0, chars: 0 };
      dateMap[d].count += 1;
      dateMap[d].chars += (n.content || '').length;
    });

    // 统计闪念
    memos.forEach(m => {
      if (!m.created_at) return;
      const d = m.created_at.slice(0, 10);
      if (!dateMap[d]) dateMap[d] = { count: 0, chars: 0 };
      dateMap[d].count += 1;
      dateMap[d].chars += (m.content || '').length;
    });

    // 生成近 52 周 (364 天) 矩阵
    const weeks = [];
    let curWeek = [];
    const startDate = new Date();
    startDate.setDate(today.getDate() - 364);

    let activeCount = 0;
    let totalChars = 0;
    let maxS = 0;
    let curS = 0;
    let tempStreak = 0;

    for (let i = 0; i < 365; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const data = dateMap[key] || { count: 0, chars: 0 };

      if (data.count > 0) {
        activeCount++;
        totalChars += data.chars;
        tempStreak++;
        if (tempStreak > maxS) maxS = tempStreak;
      } else {
        tempStreak = 0;
      }

      // 计算当前连续天数
      if (i === 364) {
        curS = tempStreak;
      }

      curWeek.push({
        date: key,
        count: data.count,
        chars: data.chars
      });

      if (curWeek.length === 7) {
        weeks.push(curWeek);
        curWeek = [];
      }
    }
    if (curWeek.length > 0) {
      weeks.push(curWeek);
    }

    return {
      gridWeeks: weeks,
      totalDays: 365,
      totalWords: totalChars,
      activeDaysCount: activeCount,
      maxStreak: maxS,
      currentStreak: curS
    };
  }, [notes, memos]);

  // 根据产出强度返回颜色等级
  const getColorClass = (count, chars) => {
    if (count === 0) return 'bg-gray-100 dark:bg-gray-800/80';
    if (chars < 200 || count === 1) return 'bg-emerald-200 dark:bg-emerald-900/60';
    if (chars < 800 || count <= 3) return 'bg-emerald-400 dark:bg-emerald-600';
    if (chars < 2000 || count <= 5) return 'bg-emerald-500 dark:bg-emerald-500';
    return 'bg-emerald-600 dark:bg-emerald-400';
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
      {/* 顶部核心指标 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-900 dark:text-white">知识沉淀热力图</h4>
            <p className="text-[10px] text-gray-400">过去 365 天持续记录与产出追踪</p>
          </div>
        </div>

        <div className="flex items-center space-x-4 text-xs">
          <div className="text-center">
            <div className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">{activeDaysCount} 天</div>
            <div className="text-[10px] text-gray-400">活跃天数</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-blue-600 dark:text-blue-400 font-mono">{currentStreak} 天</div>
            <div className="text-[10px] text-gray-400">当前连续</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-amber-500 font-mono">{(totalWords / 1000).toFixed(1)}k 字</div>
            <div className="text-[10px] text-gray-400">总字数沉淀</div>
          </div>
        </div>
      </div>

      {/* 52 周热力格子矩阵 */}
      <div className="overflow-x-auto pb-1">
        <div className="flex space-x-1 min-w-[560px]">
          {gridWeeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col space-y-1">
              {week.map((day) => (
                <div
                  key={day.date}
                  className={`w-2.5 h-2.5 rounded-[2px] ${getColorClass(day.count, day.chars)} transition-transform hover:scale-125 cursor-pointer`}
                  title={`${day.date}: ${day.count} 篇记录, ${day.chars} 字`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 底部图例 */}
      <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1">
        <span>少</span>
        <div className="flex items-center space-x-1">
          <div className="w-2.5 h-2.5 rounded-[2px] bg-gray-100 dark:bg-gray-800" />
          <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-200 dark:bg-emerald-900/60" />
          <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-400 dark:bg-emerald-600" />
          <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500 dark:bg-emerald-500" />
          <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-600 dark:bg-emerald-400" />
        </div>
        <span>多</span>
      </div>
    </div>
  );
}
