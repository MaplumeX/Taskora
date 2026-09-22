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

# --- 3. MainActivity.kt: system-bar insets + strip tinting --------------------

main_activity = """\
package app.taskora.mobile

import android.content.res.Configuration
import android.os.Bundle
import android.view.ViewGroup
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // 系统栏避让：Android WebView 不保证报告 safe-area-inset-*（取值 0
    // 时页面顶栏被状态栏遮挡、底栏被导航栏遮挡），在原生层消费 insets
    // 给内容视图加 padding，WebView 整体布局在系统栏之间。
    val content = findViewById<ViewGroup>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }

    applySystemBarColors()
  }

  // 状态栏/导航栏 strip 背景 = App 主题背景色（ui/src/index.css 的
  // --background）：亮色 hsl(40 33% 97%)，暗色 hsl(270 14% 9%)。
  // 跟随系统 DayNight；manifest 的 configChanges 含 uiMode，主题切换
  // 不重建 Activity，靠 onConfigurationChanged 重刷。
  // 已知取舍：App 内手动指定主题（非 system）时 strip 仍按系统主题着色。
  private fun applySystemBarColors() {
    val night =
      (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES
    val background = if (night) 0xFF14171A.toInt() else 0xFFFAF8F5.toInt()

    val content = findViewById<ViewGroup>(android.R.id.content)
    content.setBackgroundColor(background)

    // strip 由我们着色，系统栏图标的明暗需显式匹配（浅底用深色图标）。
    WindowCompat.getInsetsController(window, content).apply {
      isAppearanceLightStatusBars = !night
      isAppearanceLightNavigationBars = !night
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    applySystemBarColors()
  }
}
"""
path = os.path.join(gen, "app", "src", "main", "java", "app", "taskora", "mobile", "MainActivity.kt")
open(path, "w", encoding="utf8", newline="\n").write(main_activity)
print("wrote MainActivity.kt")
