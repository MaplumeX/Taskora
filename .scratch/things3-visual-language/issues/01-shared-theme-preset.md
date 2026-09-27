# 01: 主题 token 收敛到 packages/ui

Status: done

## 背景

`frontend` / `desktop` / `mobile` 各有一份几乎相同的 `index.css` 与 `tailwind.config.js`，视觉改动需改三处。本 issue 只搬家、不改视觉。

## 内容

1. 新建 `packages/ui/src/styles/tokens.css`（`:root` / `.dark` 变量、base 层、utilities、notes-prose、动画 keyframes），内容取自现 `packages/frontend/src/index.css`。
2. 新建 `packages/ui/tailwind.preset.js`（fontFamily、colors、borderRadius、plugins），`package.json` exports 暴露 preset 与 css。
3. 三个壳的 `tailwind.config.js` 改为 `presets` + 各自 `content`；`index.css` 改为 `@import` 共享文件，mobile 保留 `--kb-inset` 与 `.ptr-indicator`。

## 验收标准

- [x] 三端 dev 启动后截图与改动前像素级一致（亮 / 暗）
- [x] 三个壳内不再有重复的 token 定义
- [x] `pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿

## Comments

- 2026-09-27：完成。`packages/ui/src/styles/tokens.css` + `packages/ui/tailwind.preset.js`（ESM；frontend 的 CJS config 以 `require(...).default` 引用）。三端 `vite build` 产出的 CSS 与改动前逐字节一致。`@tailwindcss/typography` 由 ui 的 devDependencies 移到 dependencies（preset 在运行时引用）。
