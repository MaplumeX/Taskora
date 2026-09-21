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
