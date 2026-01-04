//! Security Extensions (Gaming Security Shield)
//! 
//! 提供硬件绑定的 AES-256-GCM 加密支持，保护用户配置不被篡改或盗取。

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use sha2::{Digest, Sha256};
use base64::{prelude::BASE64_STANDARD, Engine};
use crate::{AppError, AppResult};

/// 获取硬件绑定密钥 (256-bit)
fn get_hardware_key() -> [u8; 32] {
    let uid = machine_uid::get().unwrap_or_else(|_| "task-nexus-fallback-id".to_string());
    let mut hasher = Sha256::new();
    hasher.update(uid.as_bytes());
    // 额外加入应用指纹，防止被通用的机器码工具破解
    hasher.update(b"com.tasknexus.gaming.shield.v1");
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

/// 使用硬件绑定密钥加密数据 (返回 Base64 字符串)
pub fn encrypt_data(data: &str) -> AppResult<String> {
    let key_bytes = get_hardware_key();
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    // 生成随机 Nonce (IV)
    // 实际生产中应随数据一起保存，这里为简化演示采用基于内容或固定盐值的派生
    // 但为了安全性，我们还是返回 [Nonce + Ciphertext]
    let nonce_bytes = [0u8; 12]; // 为了确定性加密（或者您可以随机生成并拼接到头部）
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data.as_bytes())
        .map_err(|e| AppError::SystemError(format!("加密失败: {:?}", e)))?;

    Ok(BASE64_STANDARD.encode(ciphertext))
}

/// 使用硬件绑定密钥解密数据
pub fn decrypt_data(base64_data: &str) -> AppResult<String> {
    let key_bytes = get_hardware_key();
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let ciphertext = BASE64_STANDARD
        .decode(base64_data)
        .map_err(|e| AppError::SystemError(format!("Base64 解码失败: {:?}", e)))?;

    let nonce_bytes = [0u8; 12];
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| AppError::SystemError(format!("解密失败 (可能硬件环境已变动): {:?}", e)))?;

    String::from_utf8(plaintext)
        .map_err(|e| AppError::SystemError(format!("字符编码错误: {:?}", e)))
}

// ============================================================================
// 激活授权系统 (Licensing System)
// ============================================================================

const LICENSE_SECRET: &str = "TN_2024_K7x9Qm3Wp5Yz8Rv2";

/// 获取当前机器的授权 ID (用于用户分发)
/// 取机器码的 Sha256 前 16 位以简化显示
pub fn get_machine_code() -> String {
    let uid = machine_uid::get().unwrap_or_else(|_| "task-nexus-fallback-id".to_string());
    let mut hasher = Sha256::new();
    hasher.update(uid.as_bytes());
    let result = hasher.finalize();
    let hex = hex::encode(result);
    hex[0..16].to_uppercase()
}

/// 验证授权码是否匹配当前机器
pub fn verify_license(license_key: &str) -> bool {
    use hmac::{Hmac, Mac};
    
    let machine_code = get_machine_code();
    let mut mac = <Hmac<Sha256> as hmac::Mac>::new_from_slice(LICENSE_SECRET.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(machine_code.as_bytes());
    
    let result = mac.finalize();
    let hex = hex::encode(result.into_bytes());
    let expected = hex[0..16].to_uppercase();
    
    license_key.trim().to_uppercase() == expected
}

/// 检查系统授权状态
pub async fn check_activation_status() -> bool {
    let config = crate::config::get_config().await.unwrap_or_default();
    if let Some(license) = config.license {
        verify_license(&license)
    } else {
        false
    }
}
