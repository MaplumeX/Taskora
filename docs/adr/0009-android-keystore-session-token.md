# Android Keystore session token storage

Status: superseded by 0011（真机登录崩溃且无法定位，退回应用私有目录明文存储）。

移动端登录令牌不能明文落盘：root 设备、备份提取都能读到应用私有目录。决策：用 Android Keystore 生成不可导出的 AES 密钥加密令牌后写入应用私有目录，解锁在 Rust 侧经 JNI 完成。对齐桌面端 Windows DPAPI（ADR-0002）的威胁模型——设备越权读取文件也应不可解密。拒绝的备选：仅靠 `/data/data` 沙箱（root/备份面前裸奔）、社区 secure-storage 插件（引入不可控依赖做同一件事）。
