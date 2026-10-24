//! 统一认证（CAS）登录子窗口：
//! 打开白名单内的登录页，Rust 监听每次跳转抓取 token；
//! 对 smartlock 页面注入初始化脚本（localStorage → document.title 通道）。

use std::sync::mpsc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

use crate::config::{is_allowed_host, parse_login_token, unify_auth_login_url, PERREGISTER_URL};
const LOGIN_WINDOW_LABEL: &str = "login";
const TIMEOUT_SECS: u64 = 360;

/// 注入到登录窗口所有页面的脚本：
/// 1) auth 页勾选“记住我”；2) smartlock 页把 localStorage token 写进 title
const INIT_SCRIPT: &str = r#"
(function () {
  setInterval(function () {
    try {
      var h = location.hostname || '';
      if (h.indexOf('auth.henetc.edu.cn') >= 0) {
        var el = document.getElementById('chk_rememberMe');
        if (el && !el.checked) el.checked = true;
      }
      if (h.indexOf('smartlock.') === 0) {
        var t = localStorage.getItem('token') || localStorage.getItem('access_token');
        if (t && /^[A-Za-z0-9._-]{8,}$/.test(t) && document.title.indexOf('JMTOKEN:') !== 0) {
          document.title = 'JMTOKEN:' + t;
        }
      }
    } catch (e) { /* 忽略 */ }
  }, 1000);
})();
"#;

/// 打开登录窗口并阻塞等待结果（token / 取消 / 超时 / 白名单拒绝）
pub async fn open_login(app: AppHandle) -> Result<serde_json::Value, String> {
    close_existing(&app);

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let tx_url = tx.clone();
    let tx_title = tx.clone();
    let tx_close = tx.clone();

    let entry: Url = unify_auth_login_url(PERREGISTER_URL)
        .parse()
        .map_err(|e| format!("入口地址无效：{e}"))?;

    let builder = WebviewWindowBuilder::new(&app, LOGIN_WINDOW_LABEL, WebviewUrl::External(entry))
        .title("统一身份认证")
        .initialization_script(INIT_SCRIPT);

    // 跳转监听：白名单拦截 + URL token 抓取
    let builder = builder.on_navigation(move |url| {
        let raw = url.to_string();
        if !is_allowed_host(&raw) {
            let _ = tx_url.send(Err("页面被拒绝：不属于学校域名".into()));
            return false;
        }
        if raw.contains("token=") {
            if let Some((token, base)) = parse_login_token(&raw) {
                let _ = tx_url.send(Ok(serde_json::json!({
                    "token": token,
                    "url": base,
                    "expire": 86400,
                    "savedAt": now_ms()
                })
                .to_string()));
            }
        }
        true
    });

    // title 通道：捕获注入脚本写入的 JMTOKEN:...
    let builder = builder.on_document_title_changed(move |webview, title| {
        if let Some(token) = title.strip_prefix("JMTOKEN:") {
            if token.len() >= 8 {
                let _ = tx_title.send(Ok(serde_json::json!({
                    "token": token,
                    "url": crate::config::SMARTLOCK_PAGE,
                    "expire": 86400,
                    "savedAt": now_ms()
                })
                .to_string()));
            }
            let _ = webview;
        }
    });

    let window = builder
        .build()
        .map_err(|e| format!("无法打开登录窗口：{e}"))?;

    // 窗口被用户关闭 → 取消
    let _ = window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            let _ = tx_close.send(Err("__cancelled__".into()));
        }
    });

    // 超时看护
    {
        let app2 = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(TIMEOUT_SECS));
            if let Some(w) = app2.get_webview_window(LOGIN_WINDOW_LABEL) {
                let _ = w.close();
            }
        });
    }

    let result = match rx.recv_timeout(Duration::from_secs(TIMEOUT_SECS + 5)) {
        Ok(Ok(json)) => {
            let _ = window.close();
            match serde_json::from_str::<serde_json::Value>(&json) {
                Ok(v) => Ok(v),
                Err(e) => Err(format!("登录结果解析失败：{e}")),
            }
        }
        Ok(Err(msg)) => {
            let _ = window.close();
            if msg == "__cancelled__" {
                Err("__cancelled__".into())
            } else {
                Err(msg)
            }
        }
        Err(_) => {
            let _ = window.close();
            Err("登录超时，请重试".into())
        }
    };

    // 唤醒前端（可选事件；主通道是 invoke 返回值）
    match &result {
        Ok(record) => {
            let _ = app.emit("login-token", record.clone());
        }
        Err(e) if e != "__cancelled__" => {
            let _ = app.emit("login-error", e.clone());
        }
        Err(_) => {}
    }
    result
}

fn close_existing(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        let _ = w.close();
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
