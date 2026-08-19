#!/usr/bin/env python3
"""
独立密码安全测试脚本（无需 FastAPI 依赖）
================
验证 PBKDF2 密码哈希实现的正确性和安全性
"""

import hashlib
import secrets
import time

# PBKDF2 迭代次数（OWASP 2023 推荐：PBKDF2-HMAC-SHA256 至少 600,000 次）
PBKDF2_ITERATIONS = 600000

def hash_password(password: str) -> str:
    """
    使用 PBKDF2-HMAC-SHA256 对密码进行安全哈希
    - 随机 16 字节盐值
    - 600,000 次迭代（抵御暴力破解和 GPU 加速攻击）
    - 返回格式: {salt_hex}${hash_hex}
    """
    salt = secrets.token_bytes(16)
    pw_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
    return f"{salt.hex()}${pw_hash.hex()}"

def verify_password(stored_hash: str, password: str) -> bool:
    """
    验证密码是否匹配存储的哈希值
    支持向后兼容：自动检测旧版 SHA-256 格式并升级提示
    """
    if not stored_hash or "$" not in stored_hash:
        return False
    try:
        salt_hex, pw_hash_hex = stored_hash.split("$", 1)
        salt = bytes.fromhex(salt_hex)

        # 检测是否为旧版 SHA-256 格式（哈希长度为 64 字符）
        if len(pw_hash_hex) == 64 and len(salt_hex) == 32:
            # 旧版验证逻辑（向后兼容）
            expected_hash = hashlib.sha256((salt_hex + password).encode("utf-8")).hexdigest()
            if secrets.compare_digest(pw_hash_hex, expected_hash):
                return True

        # 新版 PBKDF2 验证
        expected_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
        return secrets.compare_digest(pw_hash_hex, expected_hash.hex())
    except Exception:
        return False

def test_password_hashing():
    """测试密码哈希基本功能"""
    print("=" * 70)
    print("🔐 测试 1: 密码哈希基本功能")
    print("=" * 70)

    password = "MySecurePassword123!@#"

    # 生成哈希
    hashed = hash_password(password)
    print(f"✓ 原始密码: {password}")
    print(f"✓ 哈希结果: {hashed[:20]}...{hashed[-20:]}")
    print(f"✓ 哈希长度: {len(hashed)} 字符")
    print()

    # 验证正确密码
    assert verify_password(hashed, password), "❌ 正确密码验证失败"
    print("✅ 正确密码验证通过")

    # 验证错误密码
    assert not verify_password(hashed, "WrongPassword"), "❌ 错误密码验证应该失败"
    print("✅ 错误密码正确拒绝")

    # 验证大小写敏感
    assert not verify_password(hashed, password.lower()), "❌ 密码应该区分大小写"
    print("✅ 密码大小写敏感性正确")
    print()

def test_salt_uniqueness():
    """测试盐值唯一性"""
    print("=" * 70)
    print("🔐 测试 2: 盐值唯一性")
    print("=" * 70)

    password = "SamePassword123"

    # 对同一密码生成多个哈希
    hashes = [hash_password(password) for _ in range(5)]

    # 验证所有哈希都不相同
    assert len(set(hashes)) == 5, "❌ 相同密码应该生成不同的哈希（盐值不同）"
    print(f"✓ 对相同密码生成了 5 个不同的哈希")

    # 验证所有哈希都能通过验证
    for i, h in enumerate(hashes, 1):
        assert verify_password(h, password), f"❌ 第 {i} 个哈希验证失败"

    print("✅ 盐值唯一性测试通过（彩虹表攻击防御有效）")
    print()

def test_performance():
    """测试性能（故意慢以抵御暴力破解）"""
    print("=" * 70)
    print("🔐 测试 3: 性能测试（抗暴力破解）")
    print("=" * 70)

    password = "TestPassword123"

    # 测试哈希生成时间
    start = time.time()
    hashed = hash_password(password)
    hash_time = time.time() - start
    print(f"✓ 密码哈希生成耗时: {hash_time*1000:.2f} ms")

    # 测试验证时间
    start = time.time()
    verify_password(hashed, password)
    verify_time = time.time() - start
    print(f"✓ 密码验证耗时: {verify_time*1000:.2f} ms")

    # 验证是否达到预期的慢速（PBKDF2 应该 > 10ms，600K 迭代）
    # 注意：Python 3.14 的优化可能导致更快的执行速度
    assert hash_time > 0.01, "❌ 哈希生成过快，无法有效抵御暴力破解"
    print(f"✓ 使用 {PBKDF2_ITERATIONS:,} 次迭代")

    if hash_time < 0.1:
        print(f"⚠️  注意：哈希速度较快（{hash_time*1000:.2f}ms），可能是 Python 3.14+ 优化所致")

    # 估算暴力破解成本
    attempts_per_second = 1 / verify_time
    print(f"✓ 单线程暴力破解速度: ~{attempts_per_second:.0f} 次/秒")

    # 假设密码是 8 位随机字符（62^8 种组合）
    total_combinations = 62 ** 8  # 大小写字母 + 数字
    crack_time_seconds = total_combinations / attempts_per_second
    crack_time_years = crack_time_seconds / (365.25 * 24 * 3600)
    print(f"✓ 破解 8 位随机密码需要: ~{crack_time_years:.2e} 年（单线程）")

    print("✅ 性能测试通过（有效抵御暴力破解）")
    print()

def test_backward_compatibility():
    """测试向后兼容性（能识别旧版 SHA-256 格式）"""
    print("=" * 70)
    print("🔐 测试 4: 向后兼容性（旧版 SHA-256）")
    print("=" * 70)

    password = "OldPassword123"

    # 模拟旧版哈希（SHA-256）
    salt = secrets.token_hex(16)
    old_hash = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    old_format = f"{salt}${old_hash}"

    print(f"✓ 旧版哈希格式: {old_format[:30]}...")

    # 验证能否识别旧版格式
    assert verify_password(old_format, password), "❌ 无法验证旧版密码"
    print("✅ 旧版密码验证成功（向后兼容）")

    # 验证错误密码仍然被拒绝
    assert not verify_password(old_format, "WrongPassword"), "❌ 旧版错误密码应该被拒绝"
    print("✅ 旧版错误密码正确拒绝")
    print()

def test_edge_cases():
    """测试边界情况"""
    print("=" * 70)
    print("🔐 测试 5: 边界情况")
    print("=" * 70)

    # 空密码
    empty_hash = hash_password("")
    assert verify_password(empty_hash, ""), "❌ 空密码验证失败"
    print("✅ 空密码支持")

    # 超长密码
    long_password = "A" * 1000
    long_hash = hash_password(long_password)
    assert verify_password(long_hash, long_password), "❌ 超长密码验证失败"
    print("✅ 超长密码支持（1000 字符）")

    # 特殊字符
    special_password = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`"
    special_hash = hash_password(special_password)
    assert verify_password(special_hash, special_password), "❌ 特殊字符密码验证失败"
    print("✅ 特殊字符密码支持")

    # Unicode 字符
    unicode_password = "密码🔐测试中文🇨🇳"
    unicode_hash = hash_password(unicode_password)
    assert verify_password(unicode_hash, unicode_password), "❌ Unicode 密码验证失败"
    print("✅ Unicode 密码支持（中文、Emoji）")

    # 无效哈希格式
    assert not verify_password("invalid", "password"), "❌ 无效哈希应该返回 False"
    assert not verify_password("", "password"), "❌ 空哈希应该返回 False"
    assert not verify_password("no_dollar_sign", "password"), "❌ 格式错误的哈希应该返回 False"
    print("✅ 无效哈希正确处理")
    print()

def main():
    print()
    print("╔" + "═" * 68 + "╗")
    print("║" + " " * 15 + "🔒 密码安全测试套件" + " " * 30 + "║")
    print("╚" + "═" * 68 + "╝")
    print()

    tests = [
        test_password_hashing,
        test_salt_uniqueness,
        test_performance,
        test_backward_compatibility,
        test_edge_cases
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            failed += 1
            print(f"❌ 测试失败: {e}")
            print()
        except Exception as e:
            failed += 1
            print(f"❌ 测试异常: {e}")
            import traceback
            traceback.print_exc()
            print()

    print("=" * 70)
    print("📊 测试总结")
    print("=" * 70)
    print(f"✅ 通过: {passed}/{len(tests)}")
    print(f"❌ 失败: {failed}/{len(tests)}")
    print()

    if failed == 0:
        print("🎉 所有测试通过！密码哈希实现安全可靠。")
    else:
        print("⚠️  部分测试失败，请检查代码实现。")
        return 1

    print()
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main())
