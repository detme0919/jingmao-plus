//! ehall 网上办事大厅（学生请假 swmxsqjapp）
//!
//! 会话建立（纯 Rust，无需 WebView）：
//! 1. GET 应用入口 → 302 到 auth.henetc.edu.cn CAS 登录页；
//! 2. POST `Login/checkLogin.do` 做真实密码校验——请求体是学校页面的
//!    「DES 加密」（实测算法：`token=<md5>&_wd=<md5>&_wf=<DES-ECB hex>`，
//!    密钥取 _wd 的第 [10,5,31,2,19,22,14,28] 位，时间戳只验 20 分钟窗口）；
//! 3. 校验通过返回人员工号 rygh，再按 fm1 表单提交 `username=<rygh>` 完成
//!    CAS 登录（fm1 的密码框没有 name，不会提交密码）；
//! 4. 跟随 302 链回到 ehall 拿到会话 Cookie，调接口验证。
//!
//! 接口（见 docs/api-notes.md §12）：getStudentLeaveRecords.do 等，
//! 表单参数统一为 `data=<urlencoded json>`。

use std::sync::Arc;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use des::cipher::generic_array::GenericArray;
use des::cipher::{BlockDecrypt, BlockEncrypt, KeyInit};
use des::Des;
use md5::{Digest, Md5};
use regex::Regex;
use reqwest::cookie::Jar;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::config::{is_allowed_host, EHALL_QJ_URL};
use crate::store::Store;

const CAS_ORIGIN: &str = "http://auth.henetc.edu.cn";
const CHECK_LOGIN_URL: &str = "http://auth.henetc.edu.cn/GGSCASServer/Login/checkLogin.do";
const APP_BASE: &str = "http://ehall.henetc.edu.cn";
const APP_CODE: &str = "swmxsqjapp";

/// checkLogin.do 成功码：(4001 + 2022) * 2022（学校前端 JS 里的常量）
const CODE_OK: i64 = 12_178_506;
/// 账号或密码错误：(2001 + 2022) * 2022 / (2002 + 2022) * 2022
const CODE_BAD_CRED: [i64; 2] = [8_134_506, 8_136_528];
/// 验证码错误/需要验证码：(2003 + 2022) * 2022 / (2004 + 2022) * 2022
const CODE_CAPTCHA: [i64; 2] = [8_138_550, 8_140_572];
/// 账号未激活：(3001 + 2022) * 2022
const CODE_INACTIVE: i64 = 10_156_506;

// ---------------------------------------------------------------------------
// 学校「加密」复刻：token/_wd/_wf
// ---------------------------------------------------------------------------

/// JS encodeURIComponent：仅 A-Za-z0-9-_.!~*'() 不转义，其余按 UTF-8 %XX
fn js_encode_uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')' => {
                out.push(*b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn md5_hex(s: &str) -> String {
    let mut h = Md5::new();
    h.update(s.as_bytes());
    let d = h.finalize();
    d.iter().map(|b| format!("{b:02x}")).collect()
}

fn random_hex(n: usize) -> String {
    let mut buf = vec![0u8; n];
    let _ = getrandom::getrandom(&mut buf);
    buf.iter().map(|b| format!("{b:02x}")).collect::<String>()
}

fn des_ecb_encrypt_pkcs7(data: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Des::new(GenericArray::from_slice(key));
    let pad = 8 - (data.len() % 8);
    let mut buf = data.to_vec();
    buf.resize(data.len() + pad, pad as u8);
    for chunk in buf.chunks_mut(8) {
        cipher.encrypt_block(GenericArray::from_mut_slice(chunk));
    }
    Ok(buf)
}

fn des_ecb_decrypt_pkcs7(data: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    if data.is_empty() || data.len() % 8 != 0 {
        return Err("密文长度异常".into());
    }
    let cipher = Des::new(GenericArray::from_slice(key));
    let mut buf = data.to_vec();
    for chunk in buf.chunks_mut(8) {
        cipher.decrypt_block(GenericArray::from_mut_slice(chunk));
    }
    let pad = *buf.last().unwrap_or(&0) as usize;
    if pad == 0 || pad > 8 || buf.len() < pad {
        return Err("填充异常".into());
    }
    buf.truncate(buf.len() - pad);
    Ok(buf)
}

/// DES 密钥：32 位 hex 串的第 [10,5,31,2,19,22,14,28] 位字符（学校固定置换表）
fn derive_pwd(key_hex: &str) -> Result<String, String> {
    let pwd: String = [10usize, 5, 31, 2, 19, 22, 14, 28]
        .iter()
        .filter_map(|&i| key_hex.chars().nth(i))
        .collect();
    if pwd.len() != 8 {
        return Err("密钥长度异常".into());
    }
    Ok(pwd)
}

/// 构造 checkLogin.do 请求体：`token=..&_wd=..&_wf=..`
fn encrypt_payload(payload: &str, stime_ms: i64) -> Result<String, String> {
    let uuid = random_hex(16);
    let b64 = B64.encode(payload.as_bytes());
    let inner = format!(
        r#"{{"token":"{uuid}","timeStamp":{stime_ms},"data":"{b64}"}}"#
    );
    let key_hex = md5_hex(&js_encode_uri_component(&inner));
    let pwd = derive_pwd(&key_hex)?;
    let token = md5_hex(&format!("{key_hex}{uuid}{stime_ms}"));
    let wf = des_ecb_encrypt_pkcs7(inner.as_bytes(), pwd.as_bytes())?;
    let wf_hex: String = wf.iter().map(|b| format!("{b:02x}")).collect();
    Ok(format!("token={token}&_wd={key_hex}&_wf={wf_hex}"))
}

/// 解密 checkLogin.do 响应（结构同请求，解出 data 的 base64 即业务 JSON）
fn decrypt_response(text: &str) -> Result<String, String> {
    let json: Value = serde_json::from_str(text.trim())
        .map_err(|_| "统一认证响应格式异常".to_string())?;
    let wd = json.get("_wd").and_then(Value::as_str).unwrap_or("");
    let wf = json.get("_wf").and_then(Value::as_str).unwrap_or("");
    let token = json.get("token").and_then(Value::as_str).unwrap_or("");
    if wd.len() < 32 || wf.is_empty() || token.is_empty() {
        return Err("统一认证响应缺少字段".into());
    }
    let pwd = derive_pwd(wd)?;
    let raw = hex_decode(wf)?;
    let mw = des_ecb_decrypt_pkcs7(&raw, pwd.as_bytes())?;
    let mw = String::from_utf8_lossy(&mw).into_owned();
    // 完整性：md5(encodeURIComponent(_mw)) == _wd
    if md5_hex(&js_encode_uri_component(&mw)) != wd {
        return Err("统一认证响应校验失败".into());
    }
    let inner: Value = serde_json::from_str(&mw).map_err(|_| "统一认证响应解密异常".to_string())?;
    let inner_token = inner.get("token").and_then(Value::as_str).unwrap_or("");
    let ts = match inner.get("timeStamp") {
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::String(s)) => s.clone(),
        _ => String::new(),
    };
    if md5_hex(&js_encode_uri_component(&format!("{wd}{inner_token}{ts}"))) != token {
        return Err("统一认证响应签名不符".into());
    }
    let data = inner.get("data").and_then(Value::as_str).unwrap_or("");
    let plain = B64.decode(data.replace(['\r', '\n'], "")).map_err(|e| format!("响应 data 解码失败：{e}"))?;
    String::from_utf8(plain).map_err(|e| format!("响应 data 编码异常：{e}"))
}

fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("hex 长度异常".into());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

// ---------------------------------------------------------------------------
// 会话管理
// ---------------------------------------------------------------------------

struct Cached {
    client: reqwest::Client,
    saved_at: i64,
}

static SESSION: tokio::sync::Mutex<Option<Cached>> = tokio::sync::Mutex::const_new(None);
const SESSION_TTL_MS: i64 = 25 * 60 * 1000;

fn build_client(jar: Arc<Jar>) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(crate::util::CLIENT_UA)
        .cookie_provider(jar)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败：{e}"))
}

/// 统一认证凭据：优先 cas_cred（统一认证页捕获），兜底 kq_cred（同一账号体系）
fn read_creds(app: &AppHandle) -> Result<(String, String), String> {
    let store = app.state::<Store>();
    for key in ["cas_cred", "kq_cred"] {
        if let Ok(Some(v)) = store.get(key) {
            let u = v.get("username").and_then(Value::as_str).unwrap_or("").trim().to_string();
            let p = v
                .get("pwd")
                .or_else(|| v.get("password"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if !u.is_empty() && !p.is_empty() {
                return Ok((u, p));
            }
        }
    }
    Err("尚未保存统一认证账号密码，请先到「我的」完成统一认证登录".into())
}

fn fm1_field(html: &str, name: &str) -> Option<String> {
    let re = Regex::new(&format!(r#"name="{name}"\s*value="([^"]*)""#)).ok()?;
    Some(re.captures(html)?.get(1)?.as_str().to_string())
}

/// CAS 直登并建立 ehall 会话，返回带 Cookie 的客户端
async fn login(app: &AppHandle) -> Result<reqwest::Client, String> {
    let (username, password) = read_creds(app)?;
    let jar = Arc::new(Jar::default());
    let client = build_client(jar)?;

    // 1. 入口 → CAS 登录页
    let entry = EHALL_QJ_URL.replace("http://", "https://");
    if !is_allowed_host(&entry) {
        return Err("入口地址不在白名单".into());
    }
    let resp = client
        .get(&entry)
        .send()
        .await
        .map_err(|e| format!("连接学校服务器失败：{e}"))?;
    let page_url = resp.url().to_string();
    let html = resp.text().await.map_err(|e| format!("读取登录页失败：{e}"))?;
    let action_rel = Regex::new(r#"<form id="fm1"[^>]*action="([^"]*)""#)
        .unwrap()
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
        .ok_or_else(|| "统一认证页面解析失败".to_string())?;
    let origin = CAS_ORIGIN;
    let action_url = if action_rel.starts_with("http") {
        action_rel.clone()
    } else {
        format!("{origin}{action_rel}")
    };
    let lt = fm1_field(&html, "lt").ok_or("登录表单缺少 lt")?;
    let execution = fm1_field(&html, "execution").ok_or("登录表单缺少 execution")?;

    // 2. checkLogin.do 真实密码校验
    let payload = format!(
        "{{\"username\":{},\"password\":{},\"verifycode\":\"\",\"dlfs\":\"\",\"rememberme\":true}}",
        serde_json::to_string(username.as_str()).unwrap_or_else(|_| "\"\"".into()),
        serde_json::to_string(password.as_str()).unwrap_or_else(|_| "\"\"".into()),
    );
    let stime = chrono::Utc::now().timestamp_millis();
    let body = encrypt_payload(&payload, stime)?;
    let resp = client
        .post(CHECK_LOGIN_URL)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", &page_url)
        .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("统一认证请求失败：{e}"))?;
    let text = resp.text().await.map_err(|e| format!("统一认证响应读取失败：{e}"))?;
    let plain = decrypt_response(&text)?;
    let v: Value = serde_json::from_str(&plain).map_err(|e| format!("统一认证结果解析失败：{e}"))?;
    let code = v
        .get("code")
        .and_then(Value::as_i64)
        .or_else(|| v.get("code").and_then(Value::as_str).and_then(|s| s.parse().ok()))
        .unwrap_or(0);
    if code != CODE_OK {
        let msg = v.get("msg").and_then(Value::as_str).unwrap_or("").trim().to_string();
        return Err(if CODE_BAD_CRED.contains(&code) {
            format!(
                "统一认证账号或密码不正确（本机保存的密码长度 {}，在「学生请假」或「我的」重新登录一次即可更新）",
                password.len()
            )
        } else if CODE_CAPTCHA.contains(&code) {
            "统一认证需要图形验证码，请先在「我的」或「学校原生界面」登录一次后再试".into()
        } else if code == CODE_INACTIVE {
            "统一认证账号未激活，请先在学校官网完成激活".into()
        } else if msg.is_empty() {
            format!("统一认证登录失败（代码 {code}）")
        } else {
            format!("统一认证登录失败：{msg}")
        });
    }
    let rygh = v.get("rygh").and_then(Value::as_str).unwrap_or("").trim().to_string();
    if rygh.is_empty() {
        return Err("统一认证校验通过但未返回用户编号".into());
    }

    // 3. fm1 CAS 提交（username=rygh；密码框无 name 不提交）
    let form = [
        ("username", rygh),
        ("lt", lt),
        ("execution", execution),
        ("_eventId", "submit".into()),
        ("rememberMe", "true".into()),
        ("captcha", String::new()),
    ];
    let resp = client
        .post(&action_url)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("CAS 登录提交失败：{e}"))?;
    let _ = resp.text().await;

    // 4. 会话验证
    match api_post(&client, &format!("{APP_BASE}/xsfw/sys/{APP_CODE}/MobileServiceStudentApply/checkWhetherStudentCanApply.do"), "{}").await {
        Ok(v) if v.get("code").and_then(Value::as_str) == Some("0")
            || v.get("code").and_then(Value::as_i64) == Some(0) => Ok(client),
        Ok(v) => Err(format!(
            "ehall 会话建立失败：{}",
            v.get("msg").and_then(Value::as_str).unwrap_or("未知错误")
        )),
        Err(_) => Err("ehall 会话建立失败，请稍后重试或改用「学校原生界面」".into()),
    }
}

/// 取会话（过期自动重登）
async fn get_client(app: &AppHandle) -> Result<reqwest::Client, String> {
    let mut guard = SESSION.lock().await;
    if let Some(c) = guard.as_ref() {
        if chrono::Utc::now().timestamp_millis() - c.saved_at < SESSION_TTL_MS {
            return Ok(c.client.clone());
        }
    }
    let client = login(app).await?;
    *guard = Some(Cached {
        client: client.clone(),
        saved_at: chrono::Utc::now().timestamp_millis(),
    });
    Ok(client)
}

async fn refresh_client(app: &AppHandle) -> Result<reqwest::Client, String> {
    let client = login(app).await?;
    let mut guard = SESSION.lock().await;
    *guard = Some(Cached {
        client: client.clone(),
        saved_at: chrono::Utc::now().timestamp_millis(),
    });
    Ok(client)
}

/// 业务接口调用：POST data=<json>，返回解析后的 JSON；非 JSON（会话失效跳登录页）报错
async fn api_post(client: &reqwest::Client, url: &str, data_json: &str) -> Result<Value, String> {
    let resp = client
        .post(url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", &format!("{APP_BASE}/xsfw/sys/{APP_CODE}/*default/index.do"))
        .form(&[("data", data_json)])
        .send()
        .await
        .map_err(|e| format!("网络请求失败：{e}"))?;
    let text = resp.text().await.map_err(|e| format!("响应读取失败：{e}"))?;
    serde_json::from_str(&text).map_err(|_| "ehall 会话已失效".to_string())
}

async fn call_with_retry<T, F, Fut>(app: &AppHandle, call_fn: F) -> Result<T, String>
where
    F: Fn(reqwest::Client) -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    match get_client(app).await {
        Ok(client) => match call_fn(client.clone()).await {
            Ok(v) => return Ok(v),
            Err(_) => { /* 会话可能失效，重登一次 */ }
        },
        Err(e) => return Err(e),
    }
    let client = refresh_client(app).await?;
    call_fn(client).await
}

// ---------------------------------------------------------------------------
// 业务：请假记录 / 能否申请
// ---------------------------------------------------------------------------

fn s(v: &Value, key: &str) -> String {
    v.get(key)
        .map(|x| match x {
            Value::String(t) => t.clone(),
            other => other.to_string(),
        })
        .unwrap_or_default()
}

#[derive(Debug, Clone, Serialize)]
pub struct QjRecord {
    /// 申请编号
    pub sqbh: String,
    /// 请假类型（如「病假（离校）」）
    #[serde(rename = "leaveType")]
    pub leave_type: String,
    /// 请假性质（因私/因公）
    pub nature: String,
    /// 开始日期 YYYY-MM-DD
    #[serde(rename = "beginDate")]
    pub begin_date: String,
    /// 结束日期 YYYY-MM-DD
    #[serde(rename = "endDate")]
    pub end_date: String,
    /// 开始时间（如 21:40）
    #[serde(rename = "beginTime")]
    pub begin_time: String,
    /// 结束时间（如 23:59）
    #[serde(rename = "endTime")]
    pub end_time: String,
    /// 请假天数
    pub days: f64,
    /// 请假事由
    pub reason: String,
    /// 审核状态（草稿/待审核/通过…）
    pub audit: String,
    /// 是否被退回
    pub returned: bool,
    /// 销假状态（未销假/已销假…）
    #[serde(rename = "cancelStatus")]
    pub cancel_status: String,
    /// 申请日期
    #[serde(rename = "applyDate")]
    pub apply_date: String,
    /// 学年
    pub year: String,
    /// 学期
    pub term: String,
}

async fn fetch_records(client: reqwest::Client) -> Result<Vec<QjRecord>, String> {
    let url = format!("{APP_BASE}/xsfw/sys/{APP_CODE}/MobileServiceStudentApply/getStudentLeaveRecords.do");
    let v = api_post(&client, &url, "{}").await?;
    if v.get("code").and_then(Value::as_str) != Some("0") && v.get("code").and_then(Value::as_i64) != Some(0) {
        return Err(v
            .get("msg")
            .and_then(Value::as_str)
            .unwrap_or("请假记录查询失败")
            .to_string());
    }
    let list = v
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(list
        .iter()
        .map(|r| QjRecord {
            sqbh: s(r, "SQBH"),
            leave_type: s(r, "QJLX_DISPLAY"),
            nature: s(r, "QJXZ_DISPLAY"),
            begin_date: s(r, "QJKSRQ"),
            end_date: s(r, "QJJSRQ"),
            begin_time: s(r, "YL1"),
            end_time: s(r, "YL2"),
            days: r.get("QJTS").and_then(Value::as_f64).unwrap_or(0.0),
            reason: s(r, "QJSY"),
            audit: s(r, "SHZT_DISPLAY"),
            returned: s(r, "THZT") == "1",
            cancel_status: s(r, "XJZT_DISPLAY"),
            apply_date: s(r, "SQRQ"),
            year: s(r, "XN_DISPLAY"),
            term: s(r, "XQ_DISPLAY"),
        })
        .collect())
}

/// 今日请假记录（原生页）
pub async fn records(app: &AppHandle) -> Result<Vec<QjRecord>, String> {
    call_with_retry(app, |c| async move { fetch_records(c).await }).await
}

/// 是否允许发起申请
pub async fn can_apply(app: &AppHandle) -> Result<bool, String> {
    call_with_retry(app, |c| async move {
        let url = format!("{APP_BASE}/xsfw/sys/{APP_CODE}/MobileServiceStudentApply/checkWhetherStudentCanApply.do");
        let v = api_post(&c, &url, "{}").await?;
        if v.get("code").and_then(Value::as_str) != Some("0") && v.get("code").and_then(Value::as_i64) != Some(0) {
            return Err(v
                .get("msg")
                .and_then(Value::as_str)
                .unwrap_or("查询失败")
                .to_string());
        }
        Ok(v.pointer("/data/applicable").and_then(Value::as_bool).unwrap_or(false))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_roundtrip() {
        let payload = r#"{"username":"u","password":"p","verifycode":"","dlfs":"","rememberme":true}"#;
        let body = encrypt_payload(payload, 1_793_377_021_643).unwrap();
        let parts: Vec<&str> = body.split('&').collect();
        assert_eq!(parts.len(), 3);
        let wd = parts[1].trim_start_matches("_wd=");
        let wf = parts[2].trim_start_matches("_wf=");
        // 解密 _wf 得到 inner JSON，再解出 data（与 decrypt_response 同路径）
        let pwd = derive_pwd(wd).unwrap();
        let mw = des_ecb_decrypt_pkcs7(&hex_decode(wf).unwrap(), pwd.as_bytes()).unwrap();
        let inner: Value = serde_json::from_str(&String::from_utf8_lossy(&mw)).unwrap();
        assert_eq!(inner["timeStamp"], 1_793_377_021_643i64);
        let data = inner["data"].as_str().unwrap();
        assert_eq!(B64.decode(data).unwrap(), payload.as_bytes());
    }

    #[test]
    fn des_roundtrip() {
        let key = b"abcd1234";
        for plain in ["", "a", "8bytes!!", "longer than one block for sure ok"] {
            let enc = des_ecb_encrypt_pkcs7(plain.as_bytes(), key).unwrap();
            let dec = des_ecb_decrypt_pkcs7(&enc, key).unwrap();
            assert_eq!(String::from_utf8_lossy(&dec), plain);
        }
    }

    #[test]
    fn uri_component() {
        assert_eq!(js_encode_uri_component("a b+c/d"), "a%20b%2Bc%2Fd");
        assert_eq!(js_encode_uri_component("中文"), "%E4%B8%AD%E6%96%87");
        assert_eq!(js_encode_uri_component("!*'()"), "!*'()");
    }
}
