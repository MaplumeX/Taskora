#!/usr/bin/env node
/**
 * Taskora 发版脚本：统一 bump 全部包的版本号。
 *
 * 用法:
 *   node scripts/release.mjs <x.y.z>
 *
 * 发版流程（脚本只负责第 1 步）:
 *   1. pnpm release <version>
 *   2. 编辑 CHANGELOG.md（Keep a Changelog 格式，桌面专属改动标注 (desktop)）
 *   3. git commit -am "release: v<x.y.z>"
 *   4. git tag v<x.y.z> && git push origin main --tags
 *      tag v<x.y.z> 同时触发 release.yml（推双镜像）和
 *      desktop-release.yml（三平台桌面打包）。
 *
 * 版本载体：
 *   - 根 package.json + 全部子包 package.json（含 desktop）
 *   - packages/desktop/src-tauri/tauri.conf.json 与 Cargo.toml
 *     （Tauri 打包读的是这两处，不是 packages/desktop/package.json，
 *     三处都要 bump，否则打出来的安装包版本号会滞后；
 *     Cargo.lock 由 cargo update 同步，保证 --locked 构建可用）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 全部子包：共享统一版本号，随 v* tag 发版。 */
const PACKAGES = ['backend', 'frontend', 'api', 'ui', 'shared', 'desktop', 'engine'];

const TAURI_DIR = path.join(ROOT, 'packages/desktop/src-tauri');

const USAGE = 'usage: node scripts/release.mjs <x.y.z>';

const [version] = process.argv.slice(2);

if (!version) {
  console.error(USAGE);
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

// 防呆：禁止降级（不小于任何版本载体的当前版本）。
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

const tag = `v${version}`;
console.log(`版本 ${version}，tag: ${tag}\n`);

// 版本检查：全部 package.json + Tauri 两处版本载体。
const pkgJsonFiles = ['package.json', ...PACKAGES.map((p) => `packages/${p}/package.json`)];
const currentVersions = Object.fromEntries(
  pkgJsonFiles.map((file) => [file, JSON.parse(readFileSync(path.join(ROOT, file), 'utf8')).version]),
);
const tauriConf = JSON.parse(readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf8'));
currentVersions['packages/desktop/src-tauri/tauri.conf.json'] = tauriConf.version;
const cargoVersion = /^version\s*=\s*"(.+)"$/m.exec(
  readFileSync(path.join(TAURI_DIR, 'Cargo.toml'), 'utf8'),
)?.[1];
currentVersions['packages/desktop/src-tauri/Cargo.toml'] = cargoVersion;

for (const [file, current] of Object.entries(currentVersions)) {
  if (!current) {
    console.error(`无法读取 ${file} 的版本号`);
    process.exit(1);
  }
  if (cmpSemVer(version, current) <= 0) {
    console.error(`版本未升级: ${file} 当前 ${current}，新版本 ${version} 必须更大`);
    process.exit(1);
  }
}

// bump 全部 package.json。
for (const file of pkgJsonFiles) {
  const abs = path.join(ROOT, file);
  const pkg = JSON.parse(readFileSync(abs, 'utf8'));
  pkg.version = version;
  writeFileSync(abs, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  bumped ${file} → ${version}`);
}

// bump Tauri 版本载体，只替换 "version" 行，避免重排原有格式。
const tauriConfPath = path.join(TAURI_DIR, 'tauri.conf.json');
writeFileSync(
  tauriConfPath,
  readFileSync(tauriConfPath, 'utf8').replace(
    /^(\s*"version"\s*:\s*").*(",?)$/m,
    `$1${version}$2`,
  ),
);
console.log(`  bumped packages/desktop/src-tauri/tauri.conf.json → ${version}`);

const cargoTomlPath = path.join(TAURI_DIR, 'Cargo.toml');
writeFileSync(
  cargoTomlPath,
  readFileSync(cargoTomlPath, 'utf8').replace(/^version\s*=\s*".*"$/m, `version = "${version}"`),
);
console.log(`  bumped packages/desktop/src-tauri/Cargo.toml → ${version}`);

// 同步 Cargo.lock（desktop-release.yml 的 cargo test 用了 --locked，lock 不同步会挂）。
execSync(`cargo update -p taskora-desktop --manifest-path "${cargoTomlPath}"`, {
  cwd: ROOT,
  stdio: 'inherit',
});
console.log(`  synced packages/desktop/src-tauri/Cargo.lock → ${version}`);

console.log(`\n下一步:`);
console.log(`  1. 编辑 CHANGELOG.md（桌面专属改动标注 (desktop)）`);
console.log(`  2. git commit -am "release: ${tag}"`);
console.log(`  3. git tag ${tag} && git push origin main --tags`);
