#!/usr/bin/env python3
import os
import shutil
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw

def generate_icons():
    project_dir = Path(__file__).resolve().parent.parent
    app_resources_dir = project_dir / "Note.app" / "Contents" / "Resources"
    app_resources_dir.mkdir(parents=True, exist_ok=True)
    
    iconset_dir = project_dir / "scripts" / "LocalNote.iconset"
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    iconset_dir.mkdir(parents=True, exist_ok=True)

    # 创建 1024x1024 基础画布 (RGBA)
    size = 1024
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. 绘制 macOS 规范的大圆角底座 (Squircle) - 渐变背景
    margin = 80
    rect_box = [margin, margin, size - margin, size - margin]
    radius = 190
    draw.rounded_rectangle(rect_box, radius=radius, fill=(59, 130, 246, 255))

    # 2. 绘制白色笔记本纸张主体
    nb_box = [220, 200, 804, 824]
    draw.rounded_rectangle(nb_box, radius=40, fill=(255, 255, 255, 250))

    # 3. 笔记本装订线（左侧浅灰底与打孔）
    binder_box = [220, 200, 310, 824]
    draw.rounded_rectangle(binder_box, radius=30, fill=(241, 245, 249, 255))
    holes_y = [280, 420, 560, 700]
    for hy in holes_y:
        draw.ellipse([250, hy, 280, hy + 30], fill=(148, 163, 184, 255))

    # 4. 笔记本上的内容条纹
    line_x_start = 350
    line_x_end = 740
    lines_y = [300, 380, 460, 540]
    line_colors = [
        (99, 102, 241, 255),
        (203, 213, 225, 255),
        (203, 213, 225, 255),
        (203, 213, 225, 255)
    ]
    for idx, ly in enumerate(lines_y):
        w = 16 if idx == 0 else 12
        end_x = line_x_end if idx != 0 else line_x_end - 100
        draw.rounded_rectangle([line_x_start, ly, end_x, ly + w], radius=6, fill=line_colors[idx])

    # 5. 右下角：高亮麦克风徽标 (Audio Studio)
    mic_center_x, mic_center_y = 680, 680
    mic_r = 90
    draw.ellipse([mic_center_x - mic_r, mic_center_y - mic_r, mic_center_x + mic_r, mic_center_y + mic_r], fill=(139, 92, 246, 255))
    draw.rounded_rectangle([mic_center_x - 18, mic_center_y - 45, mic_center_x + 18, mic_center_y + 15], radius=18, fill=(255, 255, 255, 255))
    draw.arc([mic_center_x - 32, mic_center_y - 25, mic_center_x + 32, mic_center_y + 28], start=0, end=180, fill=(255, 255, 255, 255), width=8)
    draw.line([mic_center_x, mic_center_y + 28, mic_center_x, mic_center_y + 50], fill=(255, 255, 255, 255), width=8)

    # 6. 左上角：AI 闪耀星芒 (Sparkle)
    sparkle_cx, sparkle_cy = 380, 240
    draw.polygon([
        (sparkle_cx, sparkle_cy - 25),
        (sparkle_cx + 7, sparkle_cy - 7),
        (sparkle_cx + 25, sparkle_cy),
        (sparkle_cx + 7, sparkle_cy + 7),
        (sparkle_cx, sparkle_cy + 25),
        (sparkle_cx - 7, sparkle_cy + 7),
        (sparkle_cx - 25, sparkle_cy),
        (sparkle_cx - 7, sparkle_cy - 7)
    ], fill=(245, 158, 11, 255))

    # 生成各分辨率的 PNG
    icon_specs = [
        ("icon_16x16.png", 16),
        ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32),
        ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128),
        ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256),
        ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512),
        ("icon_512x512@2x.png", 1024),
    ]

    for filename, s in icon_specs:
        resized = img.resize((s, s), Image.Resampling.LANCZOS)
        resized.save(iconset_dir / filename)

    # 调用 macOS iconutil 生成 AppIcon.icns
    icns_path = app_resources_dir / "AppIcon.icns"
    subprocess.run(["iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)], check=True)

    # 清理临时 iconset 目录
    shutil.rmtree(iconset_dir)

    # 刷新 macOS 图标缓存
    app_bundle_path = project_dir / "LocalNote.app"
    subprocess.run(["touch", str(app_bundle_path)])
    
    print(f"🎉 成功生成 macOS 原生高质感应用图标: {icns_path}")

if __name__ == "__main__":
    generate_icons()
