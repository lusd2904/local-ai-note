#!/usr/bin/env python3
import os
import subprocess
from pathlib import Path

# 使用 Python 内置或者绘制 SVG 生成多尺寸 PNG，再通过 iconutil 编译为 icns
svg_content = """<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- 背景渐变 -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="50%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
    <!-- 阴影 -->
    <filter id="dropShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="24" stdDeviation="32" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>

  <!-- macOS 圆角图标外框 (macOS Squircle 规范) -->
  <rect x="96" y="96" width="832" height="832" rx="180" ry="180" fill="url(#bgGrad)" filter="url(#dropShadow)"/>

  <!-- 内部笔记本与 AI 图形 -->
  <g transform="translate(192, 192)">
    <!-- 笔记本白色主体 -->
    <path d="M 64 64 L 576 64 C 611 64 640 93 640 128 L 640 512 C 640 547 611 576 576 576 L 64 576 C 29 576 0 547 0 512 L 0 128 C 0 93 29 64 64 64 Z" fill="#FFFFFF" opacity="0.95"/>
    
    <!-- 笔记本装订线 -->
    <rect x="0" y="64" width="80" height="512" rx="12" fill="#E2E8F0"/>
    <circle cx="40" cy="160" r="16" fill="#94A3B8"/>
    <circle cx="40" cy="320" r="16" fill="#94A3B8"/>
    <circle cx="40" cy="480" r="16" fill="#94A3B8"/>

    <!-- 笔记本文字横线 -->
    <rect x="140" y="160" width="420" height="24" rx="12" fill="#CBD5E1"/>
    <rect x="140" y="240" width="360" height="24" rx="12" fill="#CBD5E1"/>
    <rect x="140" y="320" width="400" height="24" rx="12" fill="#CBD5E1"/>

    <!-- 麦克风录音图标 (右下角徽标) -->
    <circle cx="500" cy="450" r="84" fill="#8B5CF6"/>
    <path d="M 500 400 C 488 400 478 410 478 422 L 478 456 C 478 468 488 478 500 478 C 512 478 522 468 522 456 L 522 422 C 522 410 512 400 500 400 Z" fill="#FFFFFF"/>
    <path d="M 460 446 C 460 468 478 486 500 486 C 522 486 540 468 540 446" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>
    <line x1="500" y1="486" x2="500" y2="506" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/>

    <!-- AI 闪耀星芒 (左上角) -->
    <path d="M 280 120 Q 280 150 250 150 Q 280 150 280 180 Q 280 150 310 150 Q 280 150 280 120 Z" fill="#F59E0B"/>
  </g>
</svg>
"""

iconset_dir = Path("/tmp/AppIcon.iconset")
iconset_dir.mkdir(parents=True, exist_ok=True)

# 保存 SVG
svg_path = Path("/tmp/app_icon.svg")
svg_path.write_text(svg_content, encoding="utf-8")

# 各尺寸
sizes = [16, 32, 64, 128, 256, 512, 1024]
for s in sizes:
    png_path = iconset_dir / f"icon_{s}x{s}.png"
    # 使用 macOS 自带 quicklook / qlmanage 或 sips / ImageMagick / safari 等转换，或者通过 sips
    # 我们可以通过 osascript + WebKit / sips 渲染，或者用 Python 脚本生成
    pass

print("SVG generated at /tmp/app_icon.svg")
