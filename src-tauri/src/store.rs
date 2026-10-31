//! 本机私有存储（应用数据目录 store.json）
//!
//! 与旧版 jm_* 键语义一致，但保存在 Rust 侧应用私有目录，
//! 不再暴露给 WebView localStorage。密码仅在本机保存且默认不记住。

use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

const STORE_FILE: &str = "jm_store.json";

pub struct Store {
    file: PathBuf,
    data: Mutex<serde_json::Map<String, Value>>,
}

/// 允许写入的键（防止任意键写入）
const KNOWN_KEYS: &[&str] = &[
    "login_token",     // 统一认证 token {token, expire, url, savedAt}
    "cas_cred",       // 统一认证账号密码（ehall 请假等直登复用）
    "register_link",   // 登记链接 {url, token, expire, savedAt}
    "register_mode",   // 'login' | 'link'
    "person",          // 个人信息缓存
    "kq_auth",         // 考勤 token
    "kq_cred",         // 考勤账号密码（可选记住）
    "kq_openid",       // 稳定生成的 openid
    "course_selection",// 绑定的班级
    "course_auth",     // 课程链接（兜底）
    "course_cache",    // 课表缓存
    "course_manual",   // 手动课程
    "course_last_refresh",
];

impl Store {
    pub fn load(dir: &PathBuf) -> Result<Self, String> {
        fs::create_dir_all(dir).map_err(|e| format!("创建数据目录失败：{e}"))?;
        let file = dir.join(STORE_FILE);
        let data = match fs::read_to_string(&file) {
            Ok(text) => serde_json::from_str::<serde_json::Map<String, Value>>(&text)
                .unwrap_or_default(),
            Err(_) => serde_json::Map::new(),
        };
        Ok(Store {
            file,
            data: Mutex::new(data),
        })
    }

    fn persist(&self, data: &serde_json::Map<String, Value>) -> Result<(), String> {
        let text = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
        fs::write(&self.file, text).map_err(|e| format!("写入存储失败：{e}"))
    }

    pub fn get(&self, key: &str) -> Result<Option<Value>, String> {
        if !KNOWN_KEYS.contains(&key) {
            return Err(format!("未知的存储键：{key}"));
        }
        Ok(self.data.lock().unwrap().get(key).cloned())
    }

    pub fn set(&self, key: &str, value: Value) -> Result<(), String> {
        if !KNOWN_KEYS.contains(&key) {
            return Err(format!("未知的存储键：{key}"));
        }
        let mut data = self.data.lock().unwrap();
        if value.is_null() {
            data.remove(key);
        } else {
            data.insert(key.to_string(), value);
        }
        self.persist(&data)
    }

    pub fn clear_all(&self) -> Result<(), String> {
        let mut data = self.data.lock().unwrap();
        data.clear();
        self.persist(&data)
    }
}

/// 生成稳定 openid（首次生成后固定保存）
pub fn generate_openid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    // 27 位 base36 随机串（与旧版 'o' + 27 字符一致）
    const CHARS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut out = String::from("o");
    let mut s = seed;
    for _ in 0..27 {
        out.push(CHARS[(s % 36) as usize] as char);
        s /= 36;
        if s == 0 {
            s = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openid_shape() {
        let id = generate_openid();
        assert!(id.starts_with('o'));
        assert_eq!(id.len(), 28);
    }

    #[test]
    fn store_set_get_roundtrip() {
        let dir = std::env::temp_dir().join(format!("jm-store-test-{}", std::process::id()));
        let store = Store::load(&dir).unwrap();
        assert!(store.get("login_token").unwrap().is_none());
        store
            .set("login_token", serde_json::json!({"token": "abc"}))
            .unwrap();
        assert_eq!(
            store.get("login_token").unwrap().unwrap()["token"],
            "abc"
        );
        assert!(store.set("evil_key", serde_json::json!(1)).is_err());
        store.clear_all().unwrap();
        assert!(store.get("login_token").unwrap().is_none());
        let _ = std::fs::remove_dir_all(dir);
    }
}
