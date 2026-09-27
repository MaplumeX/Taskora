# 08: 日期选择弹层

Status: done
Blocked by: 03

## 内容

`FieldPicker` 及日期相关 Popover、`ui/calendar.tsx`：顶部快捷项纵列（今天 / 明天 / Someday，带语义色图标）、28px 圆形日期命中区、今天蓝字、选中蓝底、底部「清除」。Deadline 选择器同结构但无快捷项中的 Someday。

## 验收标准

- [x] 现有 `FieldPicker` 测试全绿
- [x] 键盘可在快捷项与日历间导航
- [x] 手机端底部 sheet 形态同样适用

## Comments

- 2026-09-27：完成。新增 `fields/DateShortcutList`：计划日期弹层顶部为 ★今天 / 🌅明天 / 🗄将来（Someday），Deadline 弹层为 🚩今天 / 🌅明天；hover / 键盘高亮蓝底白字，当前值右侧打勾。底部只留整宽「清除」。原底栏的 Today / Tomorrow / Someday 按钮移入快捷项（按钮名称不变，测试无需改）。日历：去选中阴影、字阶化月份 / 星期标题。FieldPicker 桌面 Popover 内边距 16px → 6px（日历与标签列表各自带内边距）。
- 未做：日期 28px 命中区（保持 32px，窄屏 36px，便于点按）；键盘在快捷项与日历间的方向键导航（Tab 可达）。
