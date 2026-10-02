#!/usr/bin/env python3
"""Android release signing + MainActivity setup for the generated gen/android project.

android-release.yml calls this after `tauri android init` because gen/ is
not committed. Keeps the workflow YAML free of nested heredoc indentation
traps (Kotlin/python text with shallow indentation breaks `run: |` blocks).

Reads from the environment:
  keyAlias / keyPassword / storePassword / storeFile   -> keystore.properties

Usage: python3 scripts/android-signing.py packages/mobile/src-tauri/gen/android
"""
import os
import sys

assert len(sys.argv) == 2, "usage: android-signing.py <gen/android dir>"
gen = sys.argv[1]

# --- 1. keystore.properties -------------------------------------------------

props = {
    "keyAlias": os.environ["ANDROID_KEY_ALIAS"],
    "keyPassword": os.environ["ANDROID_KEY_PASSWORD"],
    "storePassword": os.environ["ANDROID_KEYSTORE_PASSWORD"],
    "storeFile": os.environ["KEYSTORE_PATH"],
}
with open(os.path.join(gen, "keystore.properties"), "w", encoding="utf8", newline="\n") as f:
    f.write("".join(f"{k}={v}\n" for k, v in props.items()))
print("wrote keystore.properties")

# --- 2. app/build.gradle.kts: inject signingConfigs ---------------------------

path = os.path.join(gen, "app", "build.gradle.kts")
src = open(path, encoding="utf8").read()

if "signingConfigs" not in src:
    src = src.replace(
        "import java.util.Properties\n",
        "import java.util.Properties\nimport java.io.FileInputStream\n",
        1,
    )
    # Kotlin 块内容用十空格起头（与 tauri 模板的其他块对齐无所谓，Kotlin
    # 不敏感缩进；三引号字符串原样写入）。
    signing = (
        "    signingConfigs {\n"
        "        create(\"release\") {\n"
        "            val keystorePropertiesFile = rootProject.file(\"keystore.properties\")\n"
        "            val keystoreProperties = Properties()\n"
        "            if (keystorePropertiesFile.exists()) {\n"
        "                keystoreProperties.load(FileInputStream(keystorePropertiesFile))\n"
        "            }\n"
        "            keyAlias = keystoreProperties[\"keyAlias\"] as String\n"
        "            keyPassword = keystoreProperties[\"keyPassword\"] as String\n"
        "            storeFile = file(keystoreProperties[\"storeFile\"] as String)\n"
        "            storePassword = keystoreProperties[\"storePassword\"] as String\n"
        "        }\n"
        "    }\n"
        "    buildTypes {\n"
    )
    anchor = "    buildTypes {\n"
    assert anchor in src, "build.gradle.kts: buildTypes anchor not found"
    src = src.replace(anchor, signing, 1)

    old = '        getByName("release") {\n            isMinifyEnabled = true'
    new = (
        '        getByName("release") {\n'
        "            signingConfig = signingConfigs.getByName(\"release\")\n"
        "            isMinifyEnabled = true"
    )
    assert old in src, "build.gradle.kts: release block anchor not found"
    src = src.replace(old, new, 1)

    open(path, "w", encoding="utf8", newline="\n").write(src)
    print("patched app/build.gradle.kts with signingConfigs")
else:
    print("app/build.gradle.kts already has signingConfigs (skipped)")

# --- 3. MainActivity.kt: edge-to-edge ---------------------------------------

# 只开 edge-to-edge（状态栏 / 导航栏透明，WebView 铺满整个窗口），不在原生层
# 消费 insets 或给内容视图加 padding：系统栏避让由前端 --safe-area-top/bottom
# 处理（background 插件读 WindowInsets 兜底 env()），系统栏图标明暗由前端按
# App 实际主题经 background 插件设置。原生 padding 会把 WebView 挤到状态栏
# 下方（状态栏变成一条固定色带），且与前端安全区双重避让。
main_activity = """\
package app.taskora.mobile

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
"""
path = os.path.join(gen, "app", "src", "main", "java", "app", "taskora", "mobile", "MainActivity.kt")
open(path, "w", encoding="utf8", newline="\n").write(main_activity)
print("wrote MainActivity.kt")
