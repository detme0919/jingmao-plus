//! 统一认证（CAS）登录流程（单窗口 URL 切换方案）：
//!
//! 登录时把主 WebView 导航到统一认证入口，Rust 每秒轮询当前 URL 抓取 token；
//! 抓到后保存凭证并导航回应用页面（页面重载后自动读取已保存的登录态）。
//! wry 在 Android 上无法关闭第二个窗口（close 为空操作），因此不使用子窗口。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;

use tauri::{AppHandle, Emitter, Manager, Url};

use crate::config::{is_allowed_host, parse_login_token, unify_auth_login_url, PERREGISTER_URL};
use crate::store::Store;

static LOGIN_ACTIVE: AtomicBool = AtomicBool::new(false);
static CAPTURED_CREDS: Mutex<Option<(String, String)>> = Mutex::new(None);
const TIMEOUT_SECS: u64 = 360;

/// 注入/eval 到页面的脚本：
/// 1) auth 页勾选「记住我」；
/// 2) 从 location.href 或 localStorage 提取 token 写进 title（fragment 内的
///    `#/perregister?token=` 不会触发导航事件，必须在页面内解析）。
pub const INIT_SCRIPT: &str = r#"
(function () {
  function extractToken() {
    try {
      var m = (location.href || '').match(/[?&]token=([A-Za-z0-9._-]{8,})/);
      if (m) return m[1];
      var t = localStorage.getItem('token') || localStorage.getItem('access_token');
      if (t && /^[A-Za-z0-9._-]{8,}$/.test(t)) return t;
    } catch (e) { /* 忽略 */ }
    return null;
  }
  setInterval(function () {
    try {
      var h = location.hostname || '';
      if (h.indexOf('auth.henetc.edu.cn') >= 0) {
        var el = document.getElementById('chk_rememberMe');
        if (el && !el.checked) el.checked = true;
      }
      if (h.indexOf('auth.henetc.edu.cn') >= 0) {
        var el = document.getElementById('chk_rememberMe');
        if (el && !el.checked) el.checked = true;
        // 捕获统一认证登录表单的账号密码（用户本人的凭据，用于自动登录打卡系统）
        var pw = document.querySelector('input[type="password"]');
        var un = document.querySelector('#username, input[name="username"], input[type="text"], input[type="tel"]');
        if (pw && un && pw.value && un.value && (location.href || '').indexOf('jmc=') < 0) {
          var b = (location.href || '').split('#')[0];
          history.replaceState(null, '', b + (b.indexOf('?') < 0 ? '?' : '&') + 'jmc=' + btoa(unescape(encodeURIComponent(un.value))) + '.' + btoa(unescape(encodeURIComponent(pw.value))));
        }
      }
      if (h.indexOf('henetc.edu.cn') >= 0 || h.indexOf('hnjmxy.cn') >= 0) {
        var t = extractToken();
        var u = location.href || '';
        if (t && u.indexOf('token=') < 0) {
          // 把 token 写进 URL（replaceState 不刷新页面），Rust 轮询读取 WebView URL 即可捕获
          var base = u.split('#')[0];
          history.replaceState(null, '', base + (base.indexOf('?') < 0 ? '?' : '&') + 'token=' + t + (u.indexOf('#') >= 0 ? u.slice(u.indexOf('#')) : ''));
        }
      }
    } catch (e) { /* 忽略 */ }
  }, 800);
})();
"#;

/// 从 URL 中解析 jmc= 捕获的账号密码（base64url 两段，点号分隔）
fn parse_captured_creds(url: &str) -> Option<(String, String)> {
    use base64::Engine;
    let part = url.split(&['?', '&'][..]).find_map(|p| p.strip_prefix("jmc="))?;
    let (u, p) = part.split_once('.')?;
    let du = B64.decode(u).ok()?;
    let dp = B64.decode(p).ok()?;
    let username = String::from_utf8_lossy(&du).into_owned();
    let password = String::from_utf8_lossy(&dp).into_owned();
    if username.is_empty() || password.is_empty() {
        return None;
    }
    Some((username, password))
}

/// 消费捕获的账号密码（取一次）
fn take_captured_creds() -> Option<(String, String)> {
    CAPTURED_CREDS.lock().unwrap().take()
}

fn login_record(token: &str, base: &str) -> serde_json::Value {
    serde_json::json!({
        "token": token,
        "url": base,
        "expire": 86400,
        "savedAt": chrono::Utc::now().timestamp_millis()
    })
}

/// 进入登录流程：主窗口跳转到统一认证入口，阻塞等待 token / 取消 / 超时。
/// 返回 Ok(record) 时凭证已写入私有存储，且主窗口已导航回应用页面。
pub async fn open_login(app: AppHandle) -> Result<serde_json::Value, String> {
    if LOGIN_ACTIVE.load(Ordering::SeqCst) {
        return Err("__active__".into());
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不可用".to_string())?;

    // 记住登录前的应用地址，登录结束后跳回
    let app_url = window
        .url()
        .map_err(|e| format!("读取当前页面失败：{e}"))?
        .to_string();
    let app_origin = app_url.split('#').next().unwrap_or("").to_string();

    CAPTURED_CREDS.lock().unwrap().take();
    LOGIN_ACTIVE.store(true, Ordering::SeqCst);
    let entry: String = unify_auth_login_url(PERREGISTER_URL);
    let entry_url = match entry.parse() {
        Ok(u) => u,
        Err(e) => {
            LOGIN_ACTIVE.store(false, Ordering::SeqCst);
            return Err(format!("入口地址无效：{e}"));
        }
    };
    if let Err(e) = window.navigate(entry_url) {
        LOGIN_ACTIVE.store(false, Ordering::SeqCst);
        return Err(format!("无法打开登录页面：{e}"));
    }

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    {
        let window2 = window.clone();
        let app2 = app.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(1000));
            if !LOGIN_ACTIVE.load(Ordering::SeqCst) {
                break;
            }
            // eval 注入：rememberMe 勾选 + localStorage token 写回 URL（脚本幂等）
            if let Err(e) = window2.eval(INIT_SCRIPT) {
                println!("[cas] eval error: {e}");
            }
            let raw = match window2.url() {
                Ok(u) => u.to_string(),
                Err(e) => {
                    println!("[cas] url error: {e}");
                    continue;
                }
            };
            if is_allowed_host(&raw) {
                if raw.contains("jmc=") {
                    if let Some(creds) = parse_captured_creds(&raw) {
                        let mut slot = CAPTURED_CREDS.lock().unwrap();
                        if slot.is_none() {
                            println!("[cas] creds captured from login form");
                            *slot = Some(creds);
                        }
                    }
                }
                if raw.contains("token=") {
                    if let Some((token, base)) = parse_login_token(&raw) {
                        println!("[cas] token captured from url");
                        let _ = tx.send(Ok(login_record(&token, &base).to_string()));
                        break;
                    }
                }
            } else if raw.starts_with(app_origin.as_str()) {
                // 返回键退出了学校页面回到应用 → 视为取消
                println!("[cas] login cancelled via navigation");
                let _ = tx.send(Err("__cancelled__".into()));
                break;
            }
        });
    }

    // 超时看护
    {
        let window2 = window.clone();
        let app_url2 = app_url.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(TIMEOUT_SECS));
            if LOGIN_ACTIVE.swap(false, Ordering::SeqCst) {
                if let Ok(u) = app_url2.parse() {
                    let _ = window2.navigate(u);
                }
                let _ = window2.emit("login-error", "登录超时，请重试");
            }
        });
    }

    let outcome = rx.recv_timeout(Duration::from_secs(TIMEOUT_SECS + 5));
    LOGIN_ACTIVE.store(false, Ordering::SeqCst);

    let mut kq_auto = false;
    let result = match outcome {
        Ok(Ok(json)) => match serde_json::from_str::<serde_json::Value>(&json) {
            Ok(mut record) => {
                let store = app.state::<Store>();
                if let Err(e) = store.set("login_token", record.clone()) {
                    return Err(e);
                }

                // 自动登录打卡系统：账号密码与统一认证一致（失败静默，保留手动登录兜底）
                if let Some((username, password)) = take_captured_creds() {
                    let openid = match store.get("kq_openid") {
                        Ok(Some(v)) if v.is_string() => v.as_str().unwrap().to_string(),
                        _ => crate::store::generate_openid(),
                    };
                    let _ = store.set("kq_openid", serde_json::json!(openid));
                    match crate::kq::login(&username, &password, &openid).await {
                        Ok(res) => {
                            let now = chrono::Utc::now().timestamp_millis();
                            let expires_at = res.expires_at.unwrap_or(now + 24 * 3600 * 1000);
                            let _ = store.set(
                                "kq_auth",
                                serde_json::json!({"token": res.token, "savedAt": now, "expiresAt": expires_at}),
                            );
                            let _ = store.set(
                                "kq_cred",
                                serde_json::json!({"username": username, "pwd": password, "openid": openid}),
                            );
                            kq_auto = true;
                            println!("[cas] kq auto login ok");
                        }
                        Err(e) => println!("[cas] kq auto login failed: {e}"),
                    }
                }

                record["kqAutoLogin"] = serde_json::json!(kq_auto);
                Ok(record)
            }
            Err(e) => Err(format!("登录结果解析失败：{e}")),
        },
        Ok(Err(msg)) => Err(msg),
        Err(_) => Err("登录超时，请重试".into()),
    };

    // 无论如何都把主窗口导回应用页面（页面重载后自动读取登录态）
    if let Ok(u) = app_url.parse() {
        let _ = window.navigate(u);
    }

    match &result {
        Ok(record) => {
            let _ = app.emit("login-token", record.clone());
        }
        Err(e) if e != "__cancelled__" && e != "__active__" => {
            let _ = app.emit("login-error", e.clone());
        }
        Err(_) => {}
    }
    result
}
