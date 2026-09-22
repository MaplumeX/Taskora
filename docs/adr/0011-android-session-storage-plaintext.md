# Android 会话令牌明文存储（降级 Keystore）

ADR-0009 决策的 Android Keystore JNI 桥（不可导出 AES 密钥加密会话令牌）在首个真机版本上登录即崩溃：JNI 调用链任何一步抛出的 Java 异常若未清除，返回 ART 后的下次 JNI 调用会触发运行时 abort；已修复 pending-exception 清除路径后真机仍崩溃，且无 USB 调试条件获取崩溃日志，根因未定位。决策：v1 退回**应用私有目录明文 JSON**（`/data/data/app.taskora.mobile/files/session.v1.json`），彻底移除 JNI 桥与 jni/ndk-context 依赖。已知降级：未 root 设备仍受 Linux 沙箱保护（其他 App 不可读），但 root 与 adb 备份提取面前明文裸奔，弱于桌面端 DPAPI 的口径。后续具备真机调试条件（adb logcat）后重新评估 Keystore 路径或改用 WebView SubtleCrypto 方案，届时以新 ADR 取代本文。 supersedes 0009。
