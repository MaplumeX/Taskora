import { openUrl } from '@tauri-apps/plugin-opener';

import type { UpdateShell } from '@taskora/api';

const REPO = 'MaplumeX/Taskora';

const tag = (version: string) => `v${encodeURIComponent(version)}`;
const apkName = (version: string) => `Taskora-v${version}.apk`;

/**
 * Android 更新平台壳（ADR-0025）：只检测和提示，不在应用内安装。目标版本
 * 由所连 hub 决定。可用性查 GitHub API：webview 直接 HEAD 下载地址会被
 * CORS 拦下，api.github.com 允许跨域（未认证每小时 60 次，按天检查足够）。
 */
export const androidUpdateShell: UpdateShell = {
  action: 'download',
  async prepare(version) {
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/releases/tags/${tag(version)}`,
      {
        headers: { Accept: 'application/vnd.github+json' },
      },
    );
    if (!response.ok) return false;
    const release = (await response.json()) as { assets?: Array<{ name: string }> };
    return release.assets?.some((asset) => asset.name === apkName(version)) ?? false;
  },
  // 用系统浏览器下载，用户覆盖安装（签名密钥不变）。
  apply: (version) =>
    openUrl(
      `https://github.com/${REPO}/releases/download/${tag(version)}/${encodeURIComponent(apkName(version))}`,
    ),
};
