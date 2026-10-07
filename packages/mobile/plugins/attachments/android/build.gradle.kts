plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.taskora.mobile.attachments"
    // 与 tauri android init 生成的 app 模块对齐（tauri 2.11 模板值）。
    compileSdk = 36

    defaultConfig {
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    // tauri Plugin 基类；模块由 gen/android 的 settings 统一 include。
    implementation(project(":tauri-android"))
}
