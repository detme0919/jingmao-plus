//! 前端 invoke 命令层：参数校验、存储读写、错误字符串

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::kq::KqAuth;
use crate::store::{generate_openid, Store};

// ---------- 应用信息 ----------

#[tauri::command]
pub fn app_info() -> Value {
    json!({
        "name": env!("CARGO_PKG_NAME"),
        "version": env!("CARGO_PKG_VERSION"),
        "school": crate::config::SCHOOL_NAME,
    })
}

// ---------- 私有存储 ----------

#[tauri::command]
pub fn store_get(store: State<'_, Store>, key: String) -> Result<Value, String> {
    Ok(store.get(&key)?.unwrap_or(Value::Null))
}

#[tauri::command]
pub fn store_set(store: State<'_, Store>, key: String, value: Value) -> Result<(), String> {
    store.set(&key, value)
}

#[tauri::command]
pub fn store_clear_all(store: State<'_, Store>) -> Result<(), String> {
    store.clear_all()
}

// ---------- 课程表 ----------

#[tauri::command]
pub async fn course_fetch_colleges() -> Result<Value, String> {
    let items = crate::course::fetch_colleges().await?;
    Ok(json!(items
        .iter()
        .map(|i| json!({"value": i.value, "label": i.label}))
        .collect::<Vec<_>>()))
}

#[tauri::command]
pub async fn course_fetch_classes(college_value: String) -> Result<Value, String> {
    let items = crate::course::fetch_classes(&college_value).await?;
    Ok(json!(items
        .iter()
        .map(|i| json!({"value": i.value, "label": i.label}))
        .collect::<Vec<_>>()))
}

#[tauri::command]
pub async fn course_query_table(
    store: State<'_, Store>,
    college_value: String,
    class_value: String,
) -> Result<Value, String> {
    let table = crate::course::query_table(&college_value, &class_value).await?;
    let mut record = serde_json::to_value(&table).map_err(|e| e.to_string())?;
    record["classValue"] = json!(class_value);
    record["pv"] = json!(2);
    record["savedAt"] = json!(now_ms());
    store.set("course_cache", record.clone())?;
    Ok(record)
}

#[tauri::command]
pub async fn course_fetch_by_link(store: State<'_, Store>, url: String) -> Result<Value, String> {
    if !crate::config::is_allowed_host(&url) {
        return Err("不是学校课表链接".into());
    }
    let table = crate::course::fetch_by_link(&url).await?;
    let mut record = serde_json::to_value(&table).map_err(|e| e.to_string())?;
    record["pv"] = json!(2);
    record["savedAt"] = json!(now_ms());
    store.set("course_cache", record.clone())?;
    Ok(record)
}

#[tauri::command]
pub fn course_parse_link_text(text: String) -> Value {
    match crate::course_parse::parse_course_link(&text) {
        Some((url, wxid)) => json!({"ok": true, "url": url, "wxid": wxid}),
        None => json!({"ok": false}),
    }
}

// ---------- 打卡考勤 ----------

fn kq_auth_from(store: &Store) -> Result<KqAuth, String> {
    store
        .get("kq_auth")?
        .and_then(|v| serde_json::from_value(v).ok())
        .ok_or_else(|| "尚未登录考勤".into())
}

#[tauri::command]
pub async fn kq_login(
    app: AppHandle,
    username: String,
    password: String,
    remember: bool,
) -> Result<Value, String> {
    let store = app.state::<Store>();
    if username.trim().is_empty() || password.is_empty() {
        return Err("请输入账号和密码".into());
    }
    // 稳定 openid：首次生成后保存复用
    let openid = match store.get("kq_openid")? {
        Some(v) if v.is_string() => v.as_str().unwrap().to_string(),
        _ => {
            let id = generate_openid();
            store.set("kq_openid", json!(id))?;
            id
        }
    };

    let result = crate::kq::login(username.trim(), &password, &openid).await?;
    let now = now_ms();
    let expires_at = result
        .expires_at
        .unwrap_or(now + 24 * 3600 * 1000);
    store.set(
        "kq_auth",
        json!({"token": result.token, "savedAt": now, "expiresAt": expires_at}),
    )?;
    if remember {
        // 仅保存在应用私有目录；混淆不等于加密，文档已注明
        store.set(
            "kq_cred",
            json!({"username": username.trim(), "pwd": password, "openid": openid}),
        )?;
    } else {
        store.set("kq_cred", Value::Null)?;
    }

    // 立即拉取个人信息，返回给前端渲染
    let auth = kq_auth_from(&store)?;
    let profile = crate::kq::profile(&auth).await.unwrap_or_else(|_| {
        crate::kq::KqProfile {
            idnum: String::new(),
            name: result.name.clone(),
            class_name: result.class_name.clone(),
            academy: String::new(),
        }
    });
    Ok(json!({
        "name": profile.name,
        "className": profile.class_name,
        "academy": profile.academy,
        "hasIdnum": !profile.idnum.is_empty(),
    }))
}

#[tauri::command]
pub async fn kq_profile(app: AppHandle) -> Result<Value, String> {
    let store = app.state::<Store>();
    let auth = kq_auth_from(&store)?;
    let p = crate::kq::profile(&auth).await?;
    Ok(serde_json::to_value(&p).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn kq_today(app: AppHandle) -> Result<Value, String> {
    let store = app.state::<Store>();
    let auth = kq_auth_from(&store)?;
    let list = crate::kq::today(&auth).await?;
    Ok(json!(list))
}

#[tauri::command]
pub async fn kq_current_week(app: AppHandle) -> Result<Value, String> {
    let store = app.state::<Store>();
    let auth = match store.get("kq_auth")? {
        Some(v) => v,
        None => return Ok(json!({"week": 0, "total": 20, "ok": false})),
    };
    let auth: KqAuth = serde_json::from_value(auth).map_err(|e| e.to_string())?;
    match crate::kq::current_week(&auth).await {
        Ok((week, total)) => Ok(json!({"week": week, "total": total, "ok": true})),
        Err(_) => Ok(json!({"week": 0, "total": 20, "ok": false})),
    }
}

#[tauri::command]
pub fn kq_logout(app: AppHandle) -> Result<(), String> {
    let store = app.state::<Store>();
    store.set("kq_auth", Value::Null)?;
    store.set("kq_cred", Value::Null)?;
    Ok(())
}

#[tauri::command]
pub fn kq_saved_cred(app: AppHandle) -> Result<Value, String> {
    let store = app.state::<Store>();
    let cred = store.get("kq_cred")?.unwrap_or(Value::Null);
    Ok(json!({
        "remember": !cred.is_null(),
        "username": cred.get("username").cloned().unwrap_or(Value::Null),
    }))
}

/// 打卡：读取凭证 → 定位（GCJ-02）→ 提交。
/// 只应由用户点击「立即打卡」触发。
#[tauri::command]
pub async fn kq_punch(app: AppHandle) -> Result<Value, String> {
    let store = app.state::<Store>();
    let auth = kq_auth_from(&store)?;
    let profile = crate::kq::profile(&auth).await?;
    if profile.idnum.is_empty() {
        return Err("考勤个人信息缺少学号，无法打卡".into());
    }
    // 蓝牙信标优先（学校「教学楼精准定位」）；无信标/无权限时回退 GPS
    let (position, ibeaconstr, mode) = match crate::ble::scan_ibeaconstr(&app, 5000).await {
        Ok(Some(s)) => (String::new(), s, "蓝牙信标"),
        _ => {
            let pos = crate::geo_device::locate_gcj02(&app).await?;
            (pos, String::new(), "GPS")
        }
    };
    crate::kq::punch(&auth, &profile.idnum, &position, &ibeaconstr).await?;
    Ok(json!({"mode": mode}))
}

// ---------- 出校登记 ----------

/// 出校登记 token：优先统一认证 token，其次登记链接 token（均校验有效期）
fn leave_token(store: &Store) -> Result<String, String> {
    for key in ["login_token", "register_link"] {
        if let Some(v) = store.get(key)? {
            let token = v.get("token").and_then(Value::as_str).unwrap_or("");
            let saved_at = v.get("savedAt").and_then(Value::as_i64).unwrap_or(0);
            let expire = v.get("expire").and_then(Value::as_i64).unwrap_or(86400);
            if !token.is_empty() && now_ms() < saved_at + expire * 1000 {
                return Ok(token.to_string());
            }
        }
    }
    Err("尚未登录，请先在「我的」完成统一认证登录".into())
}

#[tauri::command]
pub async fn leave_list(app: AppHandle, status: String, page: u32) -> Result<Value, String> {
    let store = app.state::<Store>();
    let token = leave_token(&store)?;
    let page = crate::leave::list(&token, &status, page).await?;
    Ok(serde_json::to_value(&page).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn leave_config(app: AppHandle) -> Result<Value, String> {
    let store = app.state::<Store>();
    let token = leave_token(&store)?;
    let cfg = crate::leave::config(&token).await?;
    Ok(serde_json::to_value(&cfg).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn leave_detail(app: AppHandle, id: String) -> Result<Value, String> {
    let store = app.state::<Store>();
    let token = leave_token(&store)?;
    let record = crate::leave::detail(&token, &id).await?;
    Ok(serde_json::to_value(&record).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn leave_submit(
    app: AppHandle,
    begin_time: String,
    end_time: String,
    reason: String,
    traffic_way: String,
    destination: String,
) -> Result<(), String> {
    let store = app.state::<Store>();
    let token = leave_token(&store)?;
    if reason.trim().is_empty() {
        return Err("请填写外出事由".into());
    }
    if reason.chars().count() > 30 {
        return Err("外出事由不能超过 30 字".into());
    }
    if destination.trim().is_empty() {
        return Err("请填写前往地址".into());
    }
    if destination.chars().count() > 20 {
        return Err("前往地址不能超过 20 字".into());
    }
    crate::leave::submit(
        &token,
        &begin_time,
        &end_time,
        reason.trim(),
        &traffic_way,
        destination.trim(),
    )
    .await
}

// ---------- 个人信息 ----------

#[tauri::command]
pub async fn person_detail(app: AppHandle) -> Result<Value, String> {
    let store = app.state::<Store>();
    let token = leave_token(&store)?;
    let person = crate::person::detail(&token).await?;
    let mut record = serde_json::to_value(&person).map_err(|e| e.to_string())?;
    record["token"] = json!(token);
    store.set("person", record.clone())?;
    Ok(record)
}

// ---------- 统一认证登录 ----------

#[tauri::command]
pub async fn cas_open_login(app: AppHandle, force: Option<bool>) -> Result<Value, String> {
    match crate::cas::open_login(app.clone(), force.unwrap_or(false)).await {
        Ok(record) => {
            let store = app.state::<Store>();
            store.set("login_token", record.clone())?;
            Ok(record)
        }
        Err(e) if e == "__cancelled__" => Err("__cancelled__".into()),
        Err(e) => Err(e),
    }
}

// ---------- 剪贴板 ----------

#[tauri::command]
pub async fn clipboard_detect_register_link(app: AppHandle) -> Result<Value, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let text = app.clipboard().read_text().unwrap_or_default();
    Ok(parse_register_link(&text))
}

/// 识别登记链接（smartlock 域名 + token 参数）
pub fn parse_register_link(text: &str) -> Value {
    let re = regex::Regex::new(
        r#"(?i)https?://smartlock\.(?:henetc\.edu\.cn|hnjmxy\.cn)[^\s"'<>，。；]+"#,
    )
    .unwrap();
    let url = match re.find(text) {
        Some(m) => m.as_str().to_string(),
        None => return json!({"ok": false}),
    };
    let token = extract_any_param(&url, "token").unwrap_or_default();
    if token.len() < 8 {
        return json!({"ok": false});
    }
    let expire: i64 = extract_any_param(&url, "expire")
        .and_then(|v| v.parse().ok())
        .unwrap_or(86400);
    json!({
        "ok": true,
        "url": url,
        "token": token,
        "expire": expire,
        "savedAt": now_ms(),
    })
}

/// 提取 URL 任意位置的参数（含 fragment 内）
fn extract_any_param(url: &str, key: &str) -> Option<String> {
    for part in url.split(['?', '&']) {
        if let Some(v) = part.strip_prefix(&format!("{key}=")) {
            return Some(v.split('&').next().unwrap_or("").to_string());
        }
    }
    None
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// ---------- 学校原生界面地址（内嵌 WebView 使用） ----------

#[tauri::command]
pub fn official_url(app: AppHandle, target: String) -> Result<String, String> {
    let store = app.state::<Store>();
    match target.as_str() {
        "kq" => {
            let token = store.get("kq_auth")?.and_then(|v| {
                let expired = v
                    .get("expiresAt")
                    .and_then(Value::as_i64)
                    .map(|e| e <= now_ms())
                    .unwrap_or(false);
                if expired {
                    None
                } else {
                    v.get("token").and_then(Value::as_str).map(|s| s.to_string())
                }
            });
            Ok(match token {
                Some(t) => format!("{}&token={}", crate::config::KQ_SIGN_PAGE, t),
                None => crate::config::KQ_SIGN_PAGE.to_string(),
            })
        }
        "leave" => {
            // 内嵌页面统一走 https，避免混合内容被 WebView 拦截
            let base = crate::config::PERREGISTER_URL.replace("http://", "https://");
            Ok(match leave_token(&store) {
                Ok(t) => format!("{}?token={}&expire=86400", base, t),
                Err(_) => base,
            })
        }
        "qj" => {
            // 学生请假（ehall）：入口走 https，登录链路交给 CAS；
            // WebView 已持有统一认证会话 Cookie 时免登直达
            Ok(crate::config::EHALL_QJ_URL.replace("http://", "https://"))
        }
        _ => Err("未知的页面".into()),
    }
}

// ---------- 学生请假（ehall 网上办事大厅，见 ehall.rs） ----------

/// 请假记录列表（自动 CAS 直登，失败自动重登一次）
#[tauri::command]
pub async fn qj_records(app: AppHandle) -> Result<Vec<crate::ehall::QjRecord>, String> {
    crate::ehall::records(&app).await
}

/// 是否允许发起请假申请
#[tauri::command]
pub async fn qj_can_apply(app: AppHandle) -> Result<bool, String> {
    crate::ehall::can_apply(&app).await
}
