import { cpSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new globalThis.URL('..', import.meta.url)))
const icons = join(root, 'packages/mobile/src-tauri/icons/android')
const android = process.argv[2]
  ? resolve(process.argv[2])
  : join(root, 'packages/mobile/src-tauri/gen/android')
const resources = join(android, 'app/src/main/res')

if (!existsSync(resources)) {
  console.error(`Android resources not found: ${resources}\nRun tauri android init first.`)
  process.exit(1)
}

// Tauri's generated Android project contains its template launcher icon.
// The checked-in icons are the source of truth; bundle.icon only covers desktop.
cpSync(icons, resources, { recursive: true, force: true })
console.log(`Synced Taskora Android launcher icons to ${resources}`)
