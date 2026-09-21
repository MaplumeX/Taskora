# 06: Android 构建与 GitHub Releases 发布

Status: done

## 背景

分发方式：GitHub Releases 侧载 APK。CI 持签名密钥（secrets 注入），tag 推送自动构建并发布。

## 内容

1. GitHub Actions：Android 构建工作流（JDK + Android SDK + Rust Android target + pnpm build + `tauri android build` 出 APK）。
2. 签名：release keystore 经 secrets 注入（base64），CI 内完成签名。密钥不轮换（升级安装依赖同一签名，轮换会迫使用户卸载重装丢失 Local Replica）。
3. 发布：tag 推送触发，APK 附件自动挂到 GitHub Releases（扩展 `scripts/release.mjs` 或独立 workflow）。
4. 文档：README 增加侧载安装说明（来源/未知应用权限、升级覆盖安装流程）。

## 验收标准

- [ ] tag 推送后 Actions 产出签名 APK 并自动出现在 Releases
- [ ] 同一 keystore 连续两次构建的 APK 可覆盖安装（不卸载）
- [ ] README 侧载说明就位
- [ ] secrets 只含 keystore + 密码，不含源码内文件

## Comments
