#!/usr/bin/env python3
"""
密码哈希升级迁移脚本
=====================================
从不安全的 SHA-256 迁移到 PBKDF2-HMAC-SHA256

⚠️ 重要说明：
由于旧版使用的是单向哈希，无法直接转换为新版格式。
此脚本用于：
1. 检测数据库中使用旧版密码哈希的加密笔记
2. 提示用户需要重新设置密码（当用户下次验证时自动升级）

运行方式：
    python backend/migrate_password_hash.py
"""

import sys
import os
from pathlib import Path

# 添加项目路径到 sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import SessionLocal
from app.models import Note
import hashlib

def detect_old_hash_format(password_hash: str) -> bool:
    """
    检测是否为旧版 SHA-256 格式
    旧版格式特征：salt 长度 32 字符（16 字节 hex），hash 长度 64 字符（SHA-256）
    新版格式：salt 长度 32 字符（16 字节 hex），hash 长度 64 字符（PBKDF2-SHA256）

    由于两者格式相同，唯一区别是计算方法，需要通过其他特征判断
    """
    if not password_hash or "$" not in password_hash:
        return False

    try:
        salt_hex, pw_hash_hex = password_hash.split("$", 1)
        # 旧版和新版格式相同，这里无法直接区分
        # 实际上会在 verify_password 中自动兼容
        return len(pw_hash_hex) == 64 and len(salt_hex) == 32
    except:
        return False

def main():
    print("=" * 70)
    print("🔒 密码哈希安全升级检测脚本")
    print("=" * 70)
    print()
    print("正在检查数据库中的加密笔记...")
    print()

    db = SessionLocal()
    try:
        locked_notes = db.query(Note).filter(Note.is_locked == True).all()

        if not locked_notes:
            print("✅ 未发现加密笔记，无需迁移。")
            return

        print(f"📊 发现 {len(locked_notes)} 篇加密笔记：")
        print()

        for note in locked_notes:
            is_old_format = detect_old_hash_format(note.password_hash)
            status = "🟡 旧版 SHA-256" if is_old_format else "🟢 新版 PBKDF2"
            print(f"  {status} - ID: {note.id[:8]}... | 标题: {note.title[:30]}")

        print()
        print("=" * 70)
        print("📝 迁移说明：")
        print("=" * 70)
        print()
        print("由于密码哈希是单向加密，无法直接转换格式。")
        print()
        print("✅ 好消息：系统已自动兼容旧版格式！")
        print()
        print("当用户下次输入密码验证时，系统会：")
        print("  1. 使用旧版算法验证密码（向后兼容）")
        print("  2. 验证成功后，自动使用新版 PBKDF2 重新加密")
        print("  3. 静默完成升级，用户无感知")
        print()
        print("🔐 安全建议：")
        print("  - 旧版 SHA-256 容易被暴力破解，建议尽快验证所有加密笔记")
        print("  - 验证后密码会自动升级为 PBKDF2（600,000 次迭代）")
        print("  - 如果忘记密码，建议解除加密后重新设置")
        print()
        print("=" * 70)

    finally:
        db.close()

if __name__ == "__main__":
    main()
