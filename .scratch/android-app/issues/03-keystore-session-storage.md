# 03: Android Keystore 会话令牌存储

Status: done

## 背景

desktop 用 Windows DPAPI 保护令牌（ADR-0002）。Android 等价物：Keystore 生成不可导出密钥，加密令牌后写入应用私有目录。决策见 ADR-0009。

## 内容

1. Rust 侧：经 JNI 桥接（或等价机制）调用 Android Keystore，生成 AES 密钥；令牌加密/解密 command 暴露给 TS。
2. TS 侧：实现 TokenStore 接口（与 `@taskora/api` 的注入模式一致），持久化到应用私有目录。
3. 明确不做：明文存储、依赖 `/data/data` 沙箱单独防护。
4. TokenStore 抽象层单测（加解密 round-trip，mock Rust command）。

## 验收标准

- [ ] 登录后令牌以密文落盘；重启 App 会话保持
- [ ] 退出登录清除密文与密钥引用
- [ ] 抽象层 round-trip 测试通过
- [ ] ADR-0009 引用出现在实现注释中

## Comments

## Comments

### 变更记录（真机验证后，ADR-0011）

Keystore JNI 桥在真机登录时崩溃（登录成功后第一次 `session_write` 触发密钥生成/加密即闪退）。已修复 pending Java exception 未清除的已知 abort 路径后真机仍崩，且无 USB 调试条件拿崩溃日志，根因未定位。

**决策（方案 A，ADR-0011）**：会话令牌退回应用私有目录**明文 JSON**（`session.v1.json`），移除 keystore.rs 与 jni/ndk-context 依赖。TS 契约（session_read/write/clear）不变，secure-token-store 测试不变；Rust 侧新增明文 round-trip 测试。

- 已知降级：未 root 设备受 Linux 沙箱保护（其他 App 不可读）；root/备份提取面前明文裸奔，不再满足本票「root 设备或备份提取也无法读取」的验收口径（ADR-0011 记录取舍）。
- 后续：具备 adb logcat 真机调试条件后重新评估 Keystore 或 SubtleCrypto 方案。
