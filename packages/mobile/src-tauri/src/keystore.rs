//! Android Keystore 桥接（ADR-0009，android-app issue 03）。
//!
//! 威胁模型对齐桌面端 Windows DPAPI（ADR-0002）：root 设备或备份提取
//! 读走应用私有目录的文件，也不应能解出会话令牌。因此令牌用 Android
//! Keystore 生成的**不可导出** AES-256 密钥加密（AES/GCM/NoPadding），
//! 密钥材料永不离开 Keystore（KeyStore.getKey 拿到的是 opaque
//! SecretKey 句柄，无法读出字节）。
//!
//! 桥接方式：Rust 侧经 JNI 调用平台 API（KeyStore / KeyGenerator /
//! Cipher）。JavaVM 来自 tao 在启动时填充的 `ndk_context`（tao 的
//! ndk_glue 调用 `ndk_context::initialize_android_context`），无需
//! 自定义 Kotlin 胶水。
//!
//! 拒绝的备选（ADR-0009）：仅靠 `/data/data` 沙箱（root/备份面前裸
//! 奔）、社区 secure-storage 插件（不可控依赖做同一件事）、明文存储。
//!
//! 非 Android 目标（本地 cargo check / CI 桌面编译检查）没有
//! Keystore：加解密返回错误，会话存储层面表现为「安全存储不可用」，
//! 壳层走重试/重置路径，绝不回退到明文。

/// Keystore 别名：会话加密密钥（不可导出，PURPOSE_ENCRYPT|DECRYPT）。
#[cfg(target_os = "android")]
const KEY_ALIAS: &str = "taskora-session-key";

/// GCM 认证标签长度（位）——GCMParameterSpec 用位表示，Java 默认 128。
#[cfg(target_os = "android")]
const GCM_TAG_BITS: i32 = 128;

/// Android Keystore AES-GCM 密钥的 IV 长度（字节）。
#[cfg(target_os = "android")]
const GCM_IV_LEN: usize = 12;

/// GCM 认证标签长度（字节）。
#[cfg(target_os = "android")]
const GCM_TAG_LEN: usize = 16;

/// 用 Keystore 密钥加密明文，返回 `iv || ciphertext`。
/// IV 由 Cipher 在 ENCRYPT_MODE 初始化时随机生成，与密文一起落盘；
/// GCM 的认证标签附在密文尾部（Java 平台默认行为）。
pub fn encrypt(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    imp::encrypt(plaintext)
}

/// 解密 [`encrypt`] 的输出。密钥被删除或密文被篡改时返回错误——
/// 调用方按「会话损坏」处理（启动重试屏幕，见 mobile boot.ts）。
pub fn decrypt(payload: &[u8]) -> Result<Vec<u8>, String> {
    imp::decrypt(payload)
}

/// 删除会话加密密钥（登出时随密文一起清除，issue 03 验收）。
/// 密钥不存在时为 no-op。
pub fn delete_key() -> Result<(), String> {
    imp::delete_key()
}

// ---------------------------------------------------------------------------
// Android 实现（JNI）
// ---------------------------------------------------------------------------

#[cfg(target_os = "android")]
mod imp {
    use jni::objects::{JByteArray, JObject, JValue};
    use jni::sys::jint;
    use jni::{JNIEnv, JavaVM};

    use super::{GCM_IV_LEN, GCM_TAG_BITS, GCM_TAG_LEN, KEY_ALIAS};

    /// javax.crypto.Cipher 的模式常量（ENCRYPT_MODE = 1，DECRYPT_MODE = 2）。
    const ENCRYPT_MODE: jint = 1;
    const DECRYPT_MODE: jint = 2;

    /// KeyGenParameterSpec 的用途位（PURPOSE_ENCRYPT | PURPOSE_DECRYPT）。
    const PURPOSE_ENCRYPT: jint = 1;
    const PURPOSE_DECRYPT: jint = 2;

    fn jstr_err(e: jni::errors::Error) -> String {
        format!("android: JNI string conversion failed: {e}")
    }

    /// 拿到当前线程的 JNIEnv（tao 在启动时填充 ndk_context）。
    fn with_env<T>(run: impl FnOnce(&mut JNIEnv<'_>) -> Result<T, String>) -> Result<T, String> {
        let ctx = ndk_context::android_context();
        // SAFETY: tao 已用主线程的 JavaVM 指针初始化 ndk_context；指针
        // 在进程生命周期内有效（JavaVM 不可销毁）。
        let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }
            .map_err(|e| format!("android: JavaVM unavailable: {e}"))?;
        let mut env = vm
            .attach_current_thread_as_daemon()
            .map_err(|e| format!("android: JNI attach failed: {e}"))?;
        run(&mut env)
    }

    /// 打开（并 load）AndroidKeyStore，返回 KeyStore 对象。
    fn open_keystore<'local>(env: &mut JNIEnv<'local>) -> Result<JObject<'local>, String> {
        let provider = env.new_string("AndroidKeyStore").map_err(jstr_err)?;
        let keystore = env
            .call_static_method(
                "java/security/KeyStore",
                "getInstance",
                "(Ljava/lang/String;)Ljava/security/KeyStore;",
                &[JValue::Object(&provider)],
            )
            .map_err(|e| format!("keystore: getInstance failed: {e}"))?
            .l()
            .map_err(|e| format!("keystore: getInstance returned non-object: {e}"))?;
        // keystore.load(null)：AndroidKeyStore 无密码、无入口流。
        env.call_method(
            &keystore,
            "load",
            "(Ljava/security/KeyStore$LoadStoreParameter;)V",
            &[JValue::Object(&JObject::null())],
        )
        .map_err(|e| format!("keystore: load failed: {e}"))?;
        Ok(keystore)
    }

    /// 取（或惰性生成）会话加密密钥的 SecretKey 句柄。
    ///
    /// 生成路径等价的 Java 代码：
    /// ```java
    /// KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
    ///         "taskora-session-key", PURPOSE_ENCRYPT | PURPOSE_DECRYPT)
    ///     .setBlockModes("GCM")
    ///     .setEncryptionPaddings("NoPadding")
    ///     .setKeySize(256)
    ///     .build();
    /// KeyGenerator kg = KeyGenerator.getInstance("AES", "AndroidKeyStore");
    /// kg.init(spec);
    /// kg.generateKey();
    /// ```
    fn get_or_create_key<'local>(env: &mut JNIEnv<'local>) -> Result<JObject<'local>, String> {
        let keystore = open_keystore(env)?;
        let alias = env.new_string(KEY_ALIAS).map_err(jstr_err)?;

        // KeyStore.getKey(String alias, char[] password) — AndroidKeyStore 无密码。
        let existing = env
            .call_method(
                &keystore,
                "getKey",
                "(Ljava/lang/String;[C)Ljava/security/Key;",
                &[JValue::Object(&alias), JValue::Object(&JObject::null())],
            )
            .map_err(|e| format!("keystore: getKey failed: {e}"))?
            .l()
            .map_err(|e| format!("keystore: getKey returned non-object: {e}"))?;
        if !existing.as_raw().is_null() {
            return Ok(existing);
        }

        let builder_class = env
            .find_class("android/security/keystore/KeyGenParameterSpec$Builder")
            .map_err(|e| format!("keystore: spec builder class not found: {e}"))?;
        let builder = env
            .new_object(
                &builder_class,
                "(Ljava/lang/String;I)V",
                &[
                    JValue::Object(&alias),
                    JValue::Int(PURPOSE_ENCRYPT | PURPOSE_DECRYPT),
                ],
            )
            .map_err(|e| format!("keystore: spec builder ctor failed: {e}"))?;

        let string_class = env
            .find_class("java/lang/String")
            .map_err(|e| format!("android: java.lang.String not found: {e}"))?;
        let block_gcm = env.new_string("GCM").map_err(jstr_err)?;
        let pad_none = env.new_string("NoPadding").map_err(jstr_err)?;
        for (method, value) in [("setBlockModes", &block_gcm), ("setEncryptionPaddings", &pad_none)]
        {
            let args = env
                .new_object_array(1, &string_class, value)
                .map_err(|e| format!("keystore: new_string_array failed: {e}"))?;
            env.call_method(
                &builder,
                method,
                "([Ljava/lang/String;)Landroid/security/keystore/KeyGenParameterSpec$Builder;",
                &[JValue::Object(&args)],
            )
            .map_err(|e| format!("keystore: {method} failed: {e}"))?;
        }
        env.call_method(
            &builder,
            "setKeySize",
            "(I)Landroid/security/keystore/KeyGenParameterSpec$Builder;",
            &[JValue::Int(256)],
        )
        .map_err(|e| format!("keystore: setKeySize failed: {e}"))?;
        let spec = env
            .call_method(
                &builder,
                "build",
                "()Landroid/security/keystore/KeyGenParameterSpec;",
                &[],
            )
            .map_err(|e| format!("keystore: spec build failed: {e}"))?
            .l()
            .map_err(|e| format!("keystore: spec build returned non-object: {e}"))?;

        let algorithm = env.new_string("AES").map_err(jstr_err)?;
        let provider = env.new_string("AndroidKeyStore").map_err(jstr_err)?;
        let generator = env
            .call_static_method(
                "javax/crypto/KeyGenerator",
                "getInstance",
                "(Ljava/lang/String;Ljava/lang/String;)Ljavax/crypto/KeyGenerator;",
                &[JValue::Object(&algorithm), JValue::Object(&provider)],
            )
            .map_err(|e| format!("keystore: KeyGenerator.getInstance failed: {e}"))?
            .l()
            .map_err(|e| format!("keystore: KeyGenerator returned non-object: {e}"))?;
        env.call_method(
            &generator,
            "init",
            "(Ljava/security/spec/AlgorithmParameterSpec;)V",
            &[JValue::Object(&spec)],
        )
        .map_err(|e| format!("keystore: KeyGenerator.init failed: {e}"))?;
        env.call_method(&generator, "generateKey", "()Ljavax/crypto/SecretKey;", &[])
            .map_err(|e| format!("keystore: generateKey failed: {e}"))?
            .l()
            .map_err(|e| format!("keystore: generateKey returned non-object: {e}"))
    }

    /// Cipher.getInstance("AES/GCM/NoPadding")。
    fn new_cipher<'local>(env: &mut JNIEnv<'local>) -> Result<JObject<'local>, String> {
        let transformation = env.new_string("AES/GCM/NoPadding").map_err(jstr_err)?;
        env.call_static_method(
            "javax/crypto/Cipher",
            "getInstance",
            "(Ljava/lang/String;)Ljavax/crypto/Cipher;",
            &[JValue::Object(&transformation)],
        )
        .map_err(|e| format!("cipher: getInstance failed: {e}"))?
        .l()
        .map_err(|e| format!("cipher: getInstance returned non-object: {e}"))
    }

    /// `cipher.doFinal(byte[])` 便捷封装。
    fn do_final(env: &mut JNIEnv<'_>, cipher: &JObject<'_>, input: &[u8]) -> Result<Vec<u8>, String> {
        let input = env
            .byte_array_from_slice(input)
            .map_err(|e| format!("cipher: input conversion failed: {e}"))?;
        let output = env
            .call_method(
                cipher,
                "doFinal",
                "([B)[B",
                &[JValue::Object(&JObject::from(input))],
            )
            .map_err(|e| format!("cipher: doFinal failed: {e}"))?
            .l()
            .map_err(|e| format!("cipher: doFinal returned non-object: {e}"))?;
        read_byte_array(env, &output)
    }

    /// `cipher.getIV()` 便捷封装。
    fn get_iv(env: &mut JNIEnv<'_>, cipher: &JObject<'_>) -> Result<Vec<u8>, String> {
        let iv = env
            .call_method(cipher, "getIV", "()[B", &[])
            .map_err(|e| format!("cipher: getIV failed: {e}"))?
            .l()
            .map_err(|e| format!("cipher: getIV returned non-object: {e}"))?;
        read_byte_array(env, &iv)
    }

    fn read_byte_array(env: &JNIEnv<'_>, array: &JObject<'_>) -> Result<Vec<u8>, String> {
        if array.as_raw().is_null() {
            return Err("android: null byte array".to_string());
        }
        let array = JByteArray::from(array.clone());
        env.convert_byte_array(&array)
            .map_err(|e| format!("android: byte array conversion failed: {e}"))
    }

    pub fn encrypt(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        with_env(|env| {
            let key = get_or_create_key(env)?;
            let cipher = new_cipher(env)?;
            // cipher.init(Cipher.ENCRYPT_MODE, key) — Keystore GCM 密钥
            // 由 Cipher 自行生成 IV（随密文强度对齐密钥级别）。
            env.call_method(
                &cipher,
                "init",
                "(ILjava/security/Key;)V",
                &[JValue::Int(ENCRYPT_MODE), JValue::Object(&key)],
            )
            .map_err(|e| format!("cipher: init(encrypt) failed: {e}"))?;
            let iv = get_iv(env, &cipher)?;
            let ciphertext = do_final(env, &cipher, plaintext)?;
            if iv.len() != GCM_IV_LEN {
                return Err(format!(
                    "cipher: unexpected IV length {} (expect {GCM_IV_LEN})",
                    iv.len()
                ));
            }
            let mut payload = iv;
            payload.extend_from_slice(&ciphertext);
            Ok(payload)
        })
    }

    pub fn decrypt(payload: &[u8]) -> Result<Vec<u8>, String> {
        if payload.len() < GCM_IV_LEN + GCM_TAG_LEN {
            return Err("keystore: session payload too short".to_string());
        }
        let (iv, ciphertext) = payload.split_at(GCM_IV_LEN);
        with_env(|env| {
            let key = get_or_create_key(env)?;
            let cipher = new_cipher(env)?;
            let iv = env
                .byte_array_from_slice(iv)
                .map_err(|e| format!("cipher: iv conversion failed: {e}"))?;
            // new GCMParameterSpec(128, iv)
            let spec_class = env
                .find_class("javax/crypto/spec/GCMParameterSpec")
                .map_err(|e| format!("cipher: GCMParameterSpec not found: {e}"))?;
            let spec = env
                .new_object(
                    &spec_class,
                    "(I[B)V",
                    &[JValue::Int(GCM_TAG_BITS), JValue::Object(&JObject::from(iv))],
                )
                .map_err(|e| format!("cipher: GCMParameterSpec ctor failed: {e}"))?;
            // cipher.init(Cipher.DECRYPT_MODE, key, spec)
            env.call_method(
                &cipher,
                "init",
                "(ILjava/security/Key;Ljava/security/spec/AlgorithmParameterSpec;)V",
                &[
                    JValue::Int(DECRYPT_MODE),
                    JValue::Object(&key),
                    JValue::Object(&spec),
                ],
            )
            .map_err(|e| format!("cipher: init(decrypt) failed: {e}"))?;
            do_final(env, &cipher, ciphertext)
        })
    }

    pub fn delete_key() -> Result<(), String> {
        with_env(|env| {
            let keystore = open_keystore(env)?;
            let alias = env.new_string(KEY_ALIAS).map_err(jstr_err)?;
            // keystore.deleteEntry(alias)；条目不存在时为 no-op。
            env.call_method(
                &keystore,
                "deleteEntry",
                "(Ljava/lang/String;)V",
                &[JValue::Object(&alias)],
            )
            .map_err(|e| format!("keystore: deleteEntry failed: {e}"))?;
            Ok(())
        })
    }
}

// ---------------------------------------------------------------------------
// 非 Android 目标：无 Keystore，明确失败而不是静默回退明文（ADR-0009）。
// ---------------------------------------------------------------------------

#[cfg(not(target_os = "android"))]
mod imp {
    const UNAVAILABLE: &str = "keystore: Android Keystore requires the Android runtime";

    pub fn encrypt(_plaintext: &[u8]) -> Result<Vec<u8>, String> {
        Err(UNAVAILABLE.to_string())
    }

    pub fn decrypt(_payload: &[u8]) -> Result<Vec<u8>, String> {
        Err(UNAVAILABLE.to_string())
    }

    pub fn delete_key() -> Result<(), String> {
        Err(UNAVAILABLE.to_string())
    }
}
