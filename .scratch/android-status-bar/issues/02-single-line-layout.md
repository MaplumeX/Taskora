# 02: 状态栏改为单行自定义布局（滴答清单形态）

Status: resolved

## 问题

当前实现基于 tauri-plugin-notification 的标准通知模板：任务标题一行 + 系统
action 按钮行（「＞」「＋」两个文字按钮），且带 RemoteInput 的 action 点击后
会在通知内展开输入区。用户反馈不符合预期：

- 不需要展开/折叠逻辑，默认只有一个状态；
- 期望单行：任务名 + 大一点的「▸」「＋」按钮，像滴答清单一样。

## 形态目标（对照滴答清单）

一条 ongoing 通知，单行布局：

```
[icon] 任务标题（单行截断）        ▸   ＋
```

- 「▸」切换下一条任务（控制器轮播游标，行为不变）；
- 「＋」拉起应用内快速添加浮层（dialog 风格透明 Activity，自动弹键盘）——
  与滴答清单的 quick-add overlay 同形态（第三方实测：滴答也未使用
  RemoteInput，点「+」拉起浮层 Activity，见 research.md §2-3）；
- 不设 BigContentView，通知不可展开。

## 为什么需要自定义 Kotlin 插件

标准模板下按钮只能出现在系统 action 行（第二行），文字大小不可控；单行 +
布局内按钮只有 RemoteViews 自定义布局能做到，而 tauri-plugin-notification
不支持自定义布局（research.md §4.1-8）。因此实现仓库内本地插件
`tauri-plugin-statusbar`（`packages/mobile/plugins/statusbar`，path 依赖），
结构以 `WhoStoleMySleep/tauri-plugin-timer` 为模板（research.md §4.3-13）：

- **StatusBarService**：前台服务（`specialUse` 类型 + subtype property，
  START_STICKY）持有 ongoing 通知；内容快照写 SharedPreferences，sticky
  重启（intent 为 null）时用快照重建。
- **RemoteViews 单行布局**（48dp）：标题 TextView（单行 ellipsize，
  TextAppearance.Compat.Notification.Title 跟随系统亮暗）+ 两个图标
  ImageView（24dp 矢量图 + padding，保证点击区）。
- **StatusBarActionReceiver**（manifest 静态注册，exported=false）：「▸」
  广播 → plugin.trigger 转发 JS。
- **QuickAddActivity**：「＋」拉起的半透明浮层（EditText + 提交），提交文本
  经 plugin.trigger 给 JS 落库；进程未起（plugin 实例为空）时先写
  SharedPreferences pending，plugin load 时补发。
- 渠道检测保留 issue 01 的行为：show 前检查渠道被用户关闭
  （IMPORTANCE_NONE）则 reject，JS 侧回滚开关。

## JS 侧

`StatusBarShell` 接口与平台无关控制器（controller.ts）完全不变：
- `post` → `invoke('plugin:statusbar|show', { args })`（标题 + 渠道名 +
  浮层文案均由 JS 注入，原生不内置文案）；
- `clear` → `invoke('plugin:statusbar|cancel')`；
- `onAction` → `addPluginListener('statusbar', 'action', …)`；
- 权限请求仍走 tauri-plugin-notification 的既有命令。

## 已知边界（与 research.md 对齐）

- 「＋」拉起浮层 Activity 是一次屏幕切换（滴答同款取舍）；通知内直接输入
  （RemoteInput）与单行自定义布局互斥（系统只对标准 action 按钮拦截弹输入
  框，RemoteViews 内 PendingIntent 直接触发）。
- 进程被杀后通知消失/冻结；「▸」冷启动丢弃，「＋」输入经 pending 补发。
- Android 14+ 用户可划掉该通知；数据变更/回前台时自然恢复。
- 后台启动限制：service 在开启开关（前台）时启动；运行中更新不受限。

## 验证

- Mobile 全量测试 56/56 通过（tauri-shell 测试重写：show/cancel 命令参
  数、失败传播、addPluginListener 动作转发（含 quick-add input）、权
  限检查走 notification 插件、reminders 桥回归保留）。
- API 全量测试 236/236 通过（controller/content 未变，接口不变即兼容）。
- UI 全量测试 298/298 通过。
- Mobile / API typecheck、ESLint 通过；Vite 生产构建通过。
- `cargo check`（host）无警告；`cargo check -p tauri-plugin-statusbar
  --target aarch64-linux-android` 通过（android cfg 分支与 build.rs 的
  android_path/tauri-api 复制均实际执行）；Cargo.lock 已含插件条目。
- `git diff --check` 通过。
- 未验证（需 Android SDK/真机，本机不具备）：Kotlin 编译、`tauri
  android init` 对 path 插件的 gradle include（机制与官方插件及
  tauri-plugin-timer 一致）、真机形态验收（单行布局、按钮点击区、浮
  层输入、划掉恢复、渠道关闭回滚）。首次 CI/本地 APK 构建时需关注
  插件模块是否正确挂入 gen/android。

## 后续修复：「▸」同时拉起主界面

用户实测反馈：点「▸」切下一条时主界面也被顶到前台。根因分两条路径：

- **热路径（进程在）**：`onReceive` 由 manifest 静态注册，在主线程同
  步执行，此时 `activityRef`（MainActivity）进入响应窗口，系统把整
  个 task 顶到前台。修复：`onReceive` 改用 `goAsync()` 立即返回，把
  投递移到后台线程（10s 窗口内不 ANR，官方文档确认）；冷启动时
  `submitNext` 轮询最多 2s 等插件就位，超时丢弃（JS 启动后自行刷新）。
- **冷路径（进程被杀）**：系统拉起进程投递广播，Tauri 框架进程启动
  时顺带拉起 MainActivity——这是 Tauri 进程启动的固有行为，广播本身
  （Android 12+）无权启动 Activity（Notification.Action 官方文档明确
  禁止），纯原生无法绕开。此路径下主界面出现是 Tauri 框架的限制；
  好在 FGS（specialUse，START_STICKY）保活后该场景出现概率低。

结论：热路径经 `goAsync` 修复；冷路径是 Tauri 框架的固有限制，接受
为已知边界（与「进程死后内容冻结」同类）。另一备选是「▸」也走
QuickAddActivity 透明浮层（立即 finish、零 UI），彻底绕开进程拉主界
面，但会让「▸」点击产生一次 Activity 启停的开销与闪烁风险，暂不采
用，留作热路径修复无效时的回退方案。
