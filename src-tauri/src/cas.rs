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

use tauri::{AppHandle, Emitter, Manager};

use crate::config::{
    is_allowed_host, parse_login_token, unify_auth_login_url, EHALL_QJ_URL, PERREGISTER_URL,
};
use crate::store::Store;

static LOGIN_ACTIVE: AtomicBool = AtomicBool::new(false);
static CAPTURED_CREDS: Mutex<Option<(String, String)>> = Mutex::new(None);
/// 最近一次已落盘的凭据（避免轮询期间重复写文件）
static LAST_SAVED_CREDS: Mutex<Option<(String, String)>> = Mutex::new(None);
const TIMEOUT_SECS: u64 = 360;

/// 注入/eval 到页面的脚本：
/// 1) auth 页勾选「记住我」；
/// 2) 从 location.href 或 localStorage 提取 token 写进 title（fragment 内的
///    `#/perregister?token=` 不会触发导航事件，必须在页面内解析）。
pub const INIT_SCRIPT: &str = r#"
(function () {
  if (window.__jmFlowInit) return;
  window.__jmFlowInit = true;
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
      }
      if (h.indexOf('auth.henetc.edu.cn') >= 0) {
        // 捕获统一认证登录表单的账号密码：页面用虚拟键盘插件，密码可能存在键盘实例里
        // 而不是 input.value，因此多源取最长（输入框 / 键盘 preview / 提交瞬间）
        window.__jmGrab = function () {
          try {
            var unEl = document.querySelector('#username');
            var pwEl = document.querySelector('input[type="password"]');
            if (!unEl || !pwEl) return;
            var u = unEl.value || '';
            var p = pwEl.value || '';
            var jq = window.jQuery;
            if (jq) {
              try {
                var kbP = jq('#password').getkeyboard ? jq('#password').getkeyboard() : null;
                if (kbP) {
                  if (kbP.$preview && kbP.$preview.val && kbP.$preview.val().length > p.length) p = kbP.$preview.val();
                  if (kbP.last && kbP.last.key && String(kbP.last.key).length > p.length && p.length === 0) p = String(kbP.last.key);
                }
                var kbU = jq('#username').getkeyboard ? jq('#username').getkeyboard() : null;
                if (kbU && kbU.$preview && kbU.$preview.val && kbU.$preview.val().length > u.length) u = kbU.$preview.val();
              } catch (e) {}
            }
            u = String(u).replace(/^\s+|\s+$/g, '');
            p = String(p);
            if (!u || !p) return;
            if ((window.__jmBestLen || 0) >= p.length) return;
            window.__jmBestLen = p.length;
            window.__jmSaveCreds(u, p);
          } catch (e) {}
        };
        // 关键补丁：统一认证的真实校验走 jQuery $.ajax(checkLogin.do)，
        // 调用那一刻输入框里一定是完整账号密码（虚拟键盘提交前会同步），
        // 直接抓取，绕开虚拟键盘预览值不全的问题
        if (window.jQuery && !window.__jmAjaxHook) {
          window.__jmAjaxHook = true;
          var origAjax = window.jQuery.ajax;
          window.jQuery.ajax = function () {
            try {
              var opt = arguments[0];
              var url = typeof opt === 'string' ? opt : (opt && opt.url) || '';
              if (String(url).indexOf('checkLogin.do') >= 0) {
                var unEl = document.querySelector('#username');
                var pwEl = document.querySelector('input[type="password"]');
                var au = String((unEl && unEl.value) || '').replace(/^\s+|\s+$/g, '');
                var ap = String((pwEl && pwEl.value) || '');
                if (au && ap) window.__jmSaveCreds(au, ap);
              }
            } catch (e) {}
            return origAjax.apply(this, arguments);
          };
        }
        window.__jmSaveCreds = function (u, p) {
          try {
            var payload = btoa(unescape(encodeURIComponent(u))) + '.' + btoa(unescape(encodeURIComponent(p)));
            localStorage.setItem('__jmCreds', payload);
            var b = (location.href || '').split('#')[0].split('&jmc=')[0];
            history.replaceState(null, '', b + (b.indexOf('?') < 0 ? '?' : '&') + 'jmc=' + payload);
          } catch (e) {}
        };
        window.__jmGrab();
        document.addEventListener('input', function () { window.__jmGrab(); }, true);
        document.addEventListener('keyup', function () { window.__jmGrab(); }, true);
        document.addEventListener('click', function () { window.__jmGrab(); }, true);
        if (window.jQuery) {
          window.jQuery('#password').on('keyboardChange change', function () { window.__jmGrab(); });
        }
      }
      if (h.indexOf('henetc.edu.cn') >= 0 || h.indexOf('hnjmxy.cn') >= 0) {
        var t = extractToken();
        var u = location.href || '';
        if (t && u.indexOf('token=') < 0) {
          // 把 token 写进 URL（replaceState 不刷新页面），Rust 轮询读取 WebView URL 即可捕获；
          // 同时带上登录时抓到的凭据（jmc），保证一次轮询同时拿到 token 和账号密码
          var base = u.split('#')[0];
          var extra = '';
          try {
            var c = localStorage.getItem('__jmCreds');
            if (c && u.indexOf('jmc=') < 0) extra = '&jmc=' + c;
          } catch (e) {}
          history.replaceState(null, '', base + (base.indexOf('?') < 0 ? '?' : '&') + 'token=' + t + extra + (u.indexOf('#') >= 0 ? u.slice(u.indexOf('#')) : ''));
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

/// 是否已保存可用的统一认证凭据
fn cas_cred_exists(app: &AppHandle) -> bool {
    let store = app.state::<Store>();
    match store.get("cas_cred") {
        Ok(Some(v)) => {
            let u = v
                .get("username")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("")
                .trim();
            let p = v.get("pwd").and_then(serde_json::Value::as_str).unwrap_or("");
            !u.is_empty() && !p.is_empty()
        }
        _ => false,
    }
}

fn login_record(token: &str, base: &str) -> serde_json::Value {
    serde_json::json!({
        "token": token,
        "url": base,
        "expire": 86400,
        "savedAt": chrono::Utc::now().timestamp_millis()
    })
}

/// 强制登录（ehall service）完成时返回的记录：沿用已存 login_token，避免覆盖成空值
fn existing_login_record(app: &AppHandle) -> serde_json::Value {
    let store = app.state::<Store>();
    store.get("login_token").ok().flatten().unwrap_or_else(|| {
        serde_json::json!({
            "token": "",
            "url": "",
            "expire": 0,
            "savedAt": chrono::Utc::now().timestamp_millis()
        })
    })
}

/// 进入登录流程：主窗口跳转到统一认证入口，阻塞等待 token / 取消 / 超时。
/// 返回 Ok(record) 时凭证已写入私有存储，且主窗口已导航回应用页面。
/// force_form：清空 WebView 会话数据强制显示登录表单（用于抓取凭据）——
/// 否则 CAS 检测到有效会话会直接放行，表单不出现，账号密码抓不到。
pub async fn open_login(app: AppHandle, force_form: bool) -> Result<serde_json::Value, String> {
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
    LAST_SAVED_CREDS.lock().unwrap().take();
    LOGIN_ACTIVE.store(true, Ordering::SeqCst);

    let need_form = force_form || !cas_cred_exists(&app);
    if need_form {
        // 强制登录：注销 CAS 会话（TGT 失效后表单必然出现，否则 CAS 检测到有效
        // 会话会直接放行，账号密码抓不到），然后**直接以 ehall 请假页为 service**
        // 进入 CAS。不走统一入口（id.henetc.edu.cn）重定向链——实测注销后该链
        // 会把 service 丢成空值，CAS 登录成功却无处发放票据，卡死在"登录成功"页。
        // 注：clear_all_browsing_data 不可用——其 Kotlin 实现不清 Cookie，
        // 且 JNI 调用的方法容易被 R8 当死代码裁掉（曾致闪退）。
        if let Ok(u) = crate::config::CAS_LOGOUT_URL.parse::<tauri::Url>() {
            let _ = window.navigate(u);
            tokio::time::sleep(Duration::from_millis(2500)).await;
        }
        let service = urlencoding::encode(EHALL_QJ_URL);
        let direct = format!("{}?service={service}", crate::config::CAS_LOGIN_URL);
        match direct.parse() {
            Ok(u) => {
                if let Err(e) = window.navigate(u) {
                    LOGIN_ACTIVE.store(false, Ordering::SeqCst);
                    return Err(format!("无法打开登录页面：{e}"));
                }
            }
            Err(e) => {
                LOGIN_ACTIVE.store(false, Ordering::SeqCst);
                return Err(format!("登录地址无效：{e}"));
            }
        }
    } else {
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
                        // 始终记录最新输入：用户可能还在继续输入密码
                        println!("[cas] creds captured: username={} pwd_len={}", creds.0, creds.1.len());
                        // 立即落盘：凭据在 checkLogin 提交时刻是完整且经服务器校验的，
                        // 后续 token 环节即使失败（如卡在成功过渡页），请假直登也能用
                        let mut last = LAST_SAVED_CREDS.lock().unwrap();
                        if last.as_ref() != Some(&creds) {
                            let store = app2.state::<Store>();
                            let _ = store.set(
                                "cas_cred",
                                serde_json::json!({"username": creds.0, "pwd": creds.1}),
                            );
                            *last = Some(creds.clone());
                        }
                        *CAPTURED_CREDS.lock().unwrap() = Some(creds);
                    }
                }
                // 强制登录流程完成标志：落到 ehall 应用页（CAS 登录成功并跳转到位）
                if raw.contains("/xsfw/sys/") {
                    println!("[cas] ehall page reached, forced login complete");
                    let _ = tx.send(Ok(existing_login_record(&app2).to_string()));
                    break;
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
                    // 保存统一认证凭据（供 ehall 请假等直连 CAS 的功能复用）
                    let _ = store.set(
                        "cas_cred",
                        serde_json::json!({"username": username, "pwd": password}),
                    );
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
                        Err(e) => println!("[cas] kq auto login failed: {e} (username={username} pwd_len={})", password.len()),
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
