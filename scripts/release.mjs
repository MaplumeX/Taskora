#!/usr/bin/env node
/**
 * Taskora 发版脚本：按轨道 bump package.json 版本号。
 *
 * 用法:
 *   node scripts/release.mjs main <x.y.z>      # 主轨：根 + backend/frontend/api/ui/shared
 *   node scripts/release.mjs desktop <x.y.z>    # 桌面轨：仅 packages/desktop
 *
 * 发版流程（脚本只负责第 1 步）:
 *   1. pnpm release <track> <version>
 *   2. 编辑 CHANGELOG.md（Keep a Changelog 格式，桌面轨加 ## Desktop 小节）
 *   3. git commit -am "release: <tag>"
 *   4. git tag <tag> && git push origin main --tags
 *      主轨 tag: v<x.y.z>（触发 release.yml 推双镜像）
 *      桌面轨 tag: desktop-v<x.y.z>（触发 desktop-release.yml 三平台打包）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 主轨包：共享根版本号，随 v* tag 发版。desktop 独立于主轨。 */
const MAIN_TRACK = ['backend', 'frontend', 'api', 'ui', 'shared'];

const USAGE = 'usage: node scripts/release.mjs <main|desktop> <x.y.z>';

const [track, version] = process.argv.slice(2);

if (!track || !version) {
  console.error(USAGE);
  process.exit(1);
}

if (track !== 'main' && track !== 'desktop') {
  console.error(`未知轨道: ${track}\n${USAGE}`);
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`非法版本号: ${version}（期望 x.y.z，可选 -prerelease 后缀）\n${USAGE}`);
  process.exit(1);
}

// 防呆：工作区有未提交改动时不允许 bump，避免把杂物带进发版 commit。
const { execSync } = await import('node:child_process');
const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
if (dirty) {
  console.error('工作区不干净，请先提交或暂存改动:\n' + dirty);
  process.exit(1);
}

// 防呆：禁止降级（不小于当前轨道任一包的版本）。
function parseSemVer(v) {
  const [core, pre] = v.split('-');
  return { core: core.split('.').map(Number), pre: pre ?? '' };
}

function cmpSemVer(a, b) {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
  }
  // 同 core 时，正式版 > 预发布版；两个预发布按字典序。
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === '') return 1;
  if (pb.pre === '') return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

const targets = track === 'desktop' ? ['desktop'] : ['.root', ...MAIN_TRACK];
const tag = track === 'desktop' ? `desktop-v${version}` : `v${version}`;

console.log(`轨道: ${track} → 版本 ${version}，tag: ${tag}\n`);

for (const t of targets) {
  const file = t === '.root' ? 'package.json' : `packages/${t}/package.json`;
  const abs = path.join(ROOT, file);
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(abs, 'utf8'));
  } catch {
    console.error(`无法读取 ${file}`);
    process.exit(1);
  }
  const current = pkg.version ?? '(无版本号)';
  if (cmpSemVer(version, current) <= 0) {
    console.error(`版本未升级: ${file} 当前 ${current}，新版本 ${version} 必须更大`);
    process.exit(1);
  }
}

for (const t of targets) {
  const file = t === '.root' ? 'package.json' : `packages/${t}/package.json`;
  const abs = path.join(ROOT, file);
  const pkg = JSON.parse(readFileSync(abs, 'utf8'));
  pkg.version = version;
  writeFileSync(abs, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  bumped ${file} → ${version}`);
}

console.log(`\n下一步:`);
console.log(
  `  1. 编辑 CHANGELOG.md${track === 'desktop' ? '（加 "## Desktop [x.y.z]" 小节）' : ''}`,
);
console.log(`  2. git commit -am "release: ${tag}"`);
console.log(`  3. git tag ${tag} && git push origin main --tags`);
